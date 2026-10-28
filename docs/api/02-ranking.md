## 1. 개요

- **관련 기능 명세**: 마역량 점수 랭킹 (1)
- **공통 규칙**: [[API] 공통 규칙](https://app.notion.com/p/API-40762fa2a99981e186b3fcbdaac53457?pvs=21)
- **목적**: 마이스터 역량 총점 기준 전체·학년별 랭킹을 20명 단위 페이지로 조회. 학생을 누르면 학생 ID로 상세 조회 API(`[API] 마역량 세부 조회`)를 바로 호출
- **제공하지 않는 API**: 랭킹 비공개 전환, 개인별 공개 여부 설정

| **Method** | **URL** | **권한** | **설명** |
| --- | --- | --- | --- |
| GET | `/api/meister/rankings` | 로그인 | 전체·학년별 마역량 랭킹 조회 |

## 2. 상세 API

### 2.1. 마역량 랭킹 조회

| **구분** | **내용** |
| --- | --- |
| **Method / URL** | `GET /api/meister/rankings?grade={grade}&page={page}` |
| **권한** | 로그인 (학생·교사) |
| **설명** | 총점 내림차순 순위를 계산해 요청한 페이지의 20명과 로그인한 학생의 순위를 함께 반환 |

**Query Parameter**

| **이름** | **타입** | **필수** | **설명** |
| --- | --- | --- | --- |
| `grade` | int | N | `1` / `2` / `3`. 생략하면 전체 학년 (기본값) |
| `page` | int | N | 1부터 시작, 기본값 `1` |
- 페이지 크기는 20으로 고정 (클라이언트가 바꾸지 않음)
- 학년을 바꾸면 프론트는 `page` 없이(1페이지) 다시 요청

**Response 200**

```json
{
  "grade": null,
  "page": 1,
  "size": 20,
  "totalElements": 132,
  "totalPages": 7,
  "myRank": {
    "studentId": "7b0c2f9e-1a2b-4c3d-9e8f-001122334455",
    "rank": 15,
    "totalScore": 320,
    "page": 1
  },
  "items": [
    {
      "rank": 1,
      "studentId": "a1b2c3d4-0000-4000-8000-000000000001",
      "name": "김송프",
      "grade": 3,
      "classNo": 2,
      "number": 7,
      "totalScore": 450,
      "isMe": false
    },
    {
      "rank": 2,
      "studentId": "a1b2c3d4-0000-4000-8000-000000000002",
      "name": "이마이",
      "grade": 2,
      "classNo": 1,
      "number": 3,
      "totalScore": 430,
      "isMe": false
    }
  ]
}
```

| **필드** | **설명** |
| --- | --- |
| `grade` | 적용된 학년. 전체면 `null` |
| `page` | 실제로 반환한 페이지 (잘못된 페이지를 요청하면 `1`) |
| `myRank` | 로그인한 학생의 순위와 그 학생이 있는 페이지. 교사이거나 선택한 학년에 없으면 `null` |
| `items[].rank` | 현재 범위(전체 또는 학년) 전체 결과 기준 순위. 페이지가 바뀌어도 이어짐 |
| `items[].isMe` | 로그인한 사용자의 **학생 ID**와 일치할 때만 `true` (이름으로 비교하지 않음) |

**순위 계산 규칙**

| **구분** | **내용** |
| --- | --- |
| **총점** | `Students`의 5개 영역 점수 합. 점수가 없으면 0점 |
| **순위** | `RANK()` 방식. 동점자는 같은 순위, 다음 순위는 동점자 수만큼 건너뜀 (1, 2, 2, 4) |
| **정렬** | 총점 내림차순 → 학년 → 반 → 번호 오름차순 |
| **범위** | 전체 랭킹과 학년별 랭킹은 각각 따로 계산 |
| **대상** | `role = STUDENT`인 학생 전체 (학교 공개 정책에 따라 제외 대상이 생기면 서버에서 필터) |

```sql
SELECT * FROM (
  SELECT s.student_id, u.name, s.grade, s.class_no, s.student_number,
         (s.job_basic_point + s.major_skill_point + s.character_job_ethic_point
          + s.humanities_literacy_point + s.foreign_language_point) AS total_score,
         RANK() OVER (ORDER BY (s.job_basic_point + s.major_skill_point
          + s.character_job_ethic_point + s.humanities_literacy_point
          + s.foreign_language_point) DESC) AS ranking
  FROM Students s JOIN Users u ON u.user_id = s.student_id
  WHERE (:grade IS NULL OR s.grade = :grade)
) r
ORDER BY r.total_score DESC, r.grade, r.class_no, r.student_number
LIMIT 20 OFFSET :offset;
```

**예외 처리**

| **상황** | **응답** | **프론트 처리** |
| --- | --- | --- |
| 랭킹 데이터 없음 (전체) | `200`, `items: []`, `totalElements: 0` | "등록된 랭킹 정보가 없습니다." |
| 해당 학년에 학생 없음 | `200`, `items: []`, `grade` 값 있음 | "해당 학년의 학생 정보가 없습니다." |
| `page`가 1 미만·숫자 아님·마지막 페이지 초과 | `200`, 1페이지 데이터 + `page: 1` | 응답의 `page`로 페이지 번호 갱신 |
| `grade`가 1~3이 아님 | `400 VALIDATION_FAILED` | 전체 학년으로 다시 요청 |
| 비로그인 | `401` | 로그인 화면 이동 |
| 서버 오류 | `500` | 오류 문구 + [다시 시도] |

### 2.2. 학생 선택 시 호출하는 API

- 랭킹 행을 누르면 프론트는 `/students/{studentId}` 화면으로 이동하고 아래 API를 호출 (학년·반·번호나 비밀번호를 다시 받지 않음)
    - `GET /api/students/{studentId}`
    - `GET /api/students/{studentId}/meister-scores`
- 상세 내용은 `[API] 마역량 세부 조회` 페이지 참고
- 브라우저 뒤로 가기로 랭킹에 돌아올 수 있도록 프론트는 `grade`, `page`를 URL 쿼리에 유지 (예: `/ranking?grade=2&page=3`)

## 3. DB 매핑 및 보완 필요 사항

| **항목** | **내용** |
| --- | --- |
| 영역별 점수 | `Students.job_basic_point` 외 4개 컬럼 |
| 이름 | `Users.name` |
| 학년·반·번호 | DB에 없음 → `Students.grade`, `class_no`, `student_number` 추가 필요 |
| 총점 | 매 요청마다 합산하거나, 학생 수가 많아지면 `total_meister_points` 컬럼 + 인덱스 추가 권장 |

**임의로 정한 값**

- 잘못된 페이지는 오류 대신 1페이지를 돌려주는 방식으로 정했습니다 (기능 명세의 "1페이지로 이동").
- 로그인한 학생의 전체 순위를 상단에 보여줄 수 있도록 `myRank`를 항상 포함했습니다.
- 교사도 랭킹을 조회할 수 있다고 가정했습니다 (기능 명세 사용자는 학생).