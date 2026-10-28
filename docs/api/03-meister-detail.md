## 1. 개요

- **관련 기능 명세**: 마역량 세부 조회 (1), 프로필에 깃허브 & 링크드인 링크 (1)(학생 상세의 링크)
- **공통 규칙**: [[API] 공통 규칙](https://app.notion.com/p/API-40762fa2a99981e186b3fcbdaac53457?pvs=21)
- **목적**: 학생의 마역량 점수를 영역별·항목별로 조회하고, 환산 등급 기준, 점수 변동 내역, 상·벌점(교사별 포함)을 확인

| **Method** | **URL** | **권한** | **설명** |
| --- | --- | --- | --- |
| GET | `/api/students/{studentId}` | 로그인 | 학생 기본 정보 + 링크 + 총점 |
| GET | `/api/students/{studentId}/meister-scores` | 로그인 | 영역별 점수·환산 점수·등급 |
| GET | `/api/students/{studentId}/meister-scores/history` | 로그인 | 점수 획득·변동 내역 |
| GET | `/api/meister/grade-criteria` | 로그인 | 환산 등급 기준 |
| GET | `/api/students/{studentId}/merit-points` | 본인·교사 | 상·벌점 내역 (분리 합계, 교사별 그룹) |

**공개 범위**

| **정보** | **본인** | **다른 학생** | **교사** |
| --- | --- | --- | --- |
| 기본 정보·총점·링크 | O | O | O |
| 영역별 점수·등급 | O | O | O |
| 점수 획득 내역 | O | O (증빙자료 제외) | O |
| 증빙자료 파일 | O | X | O |
| 상·벌점 내역 | O | X (`403`) | O |

## 2. 상세 API

### 2.1. 학생 기본 정보 조회

| **구분** | **내용** |
| --- | --- |
| **Method / URL** | `GET /api/students/{studentId}` |
| **권한** | 로그인 |
| **설명** | 랭킹에서 학생을 눌렀을 때 상세 화면 상단(이름, 학번, 총점, GitHub·LinkedIn 아이콘)을 그리는 데 사용 |

**Response 200**

```json
{
  "studentId": "7b0c2f9e-1a2b-4c3d-9e8f-001122334455",
  "name": "홍길동",
  "grade": 2,
  "classNo": 1,
  "number": 5,
  "totalScore": 320,
  "rank": 15,
  "githubUrl": "https://github.com/octocat",
  "linkedinUrl": null,
  "isMe": true
}
```

- `rank`: 전체 학년 기준 순위
- `githubUrl`, `linkedinUrl`: 값이 있을 때만 아이콘 표시. 둘 다 없고 `isMe = true`면 "링크 추가" 버튼 표시
- `404 STUDENT_NOT_FOUND`: "학생을 찾을 수 없습니다." / ID 형식이 UUID가 아니어도 같은 404

### 2.2. 영역별 점수 조회

| **구분** | **내용** |
| --- | --- |
| **Method / URL** | `GET /api/students/{studentId}/meister-scores` |
| **권한** | 로그인 |
| **설명** | 5개 영역의 원점수, 환산 점수, 등급과 내역 건수. 영역을 펼치면(토글) 2.3을 `scoreType`으로 호출 |

**Response 200**

```json
{
  "studentId": "7b0c2f9e-1a2b-4c3d-9e8f-001122334455",
  "totalScore": 320,
  "criteriaRegistered": true,
  "areas": [
    {
      "scoreType": "MAJOR_SKILL",
      "label": "전공직무능력",
      "rawScore": 120,
      "convertedScore": 24.0,
      "grade": "A",
      "detailCount": 6
    },
    {
      "scoreType": "FOREIGN_LANGUAGE",
      "label": "외국어능력",
      "rawScore": 0,
      "convertedScore": 0.0,
      "grade": null,
      "detailCount": 0
    }
  ]
}
```

- `areas`는 항상 5개 영역을 모두 반환 (점수가 없으면 0점)
- `criteriaRegistered = false`이면 `convertedScore`, `grade`는 `null` → 프론트는 "환산 등급 기준이 등록되지 않았습니다." 표시
- `detailCount = 0`이면 토글 안에 "등록된 내역 없음" 표시 (2.3 호출 생략 가능)

### 2.3. 점수 획득·변동 내역 조회

| **구분** | **내용** |
| --- | --- |
| **Method / URL** | `GET /api/students/{studentId}/meister-scores/history` |
| **권한** | 로그인 (증빙자료는 본인·교사에게만) |
| **설명** | 점수 획득 사유, 인정 날짜, 부여 교사, 증빙자료를 시간순으로 조회. 점수 감소(음수)도 같은 목록에 표시 |

**Query Parameter**

| **이름** | **타입** | **필수** | **설명** |
| --- | --- | --- | --- |
| `scoreType` | ScoreType | N | 영역 필터. 생략하면 전체 (변동 내역 탭) |
| `order` | string | N | `desc`(최신순, 기본) / `asc` |
| `page` | int | N | 기본 `1`, 페이지당 20건 |

**Response 200**

```json
{
  "items": [
    {
      "detailId": "c0ffee00-0000-4000-8000-000000000010",
      "scoreType": "MAJOR_SKILL",
      "label": "전공직무능력",
      "itemName": "국가기술자격증",
      "content": "정보처리기능사 취득",
      "points": 10,
      "teacher": { "teacherId": "d1e2f3a4-0000-4000-8000-000000000003", "name": "박선생" },
      "evidence": { "evidenceId": "e5e5e5e5-0000-4000-8000-000000000004", "fileName": "자격증.pdf" },
      "createdAt": "2026-10-02T10:15:00+09:00"
    }
  ],
  "page": 1,
  "size": 20,
  "totalElements": 6,
  "totalPages": 1
}
```

- `evidence`: 다른 학생이 조회하거나 증빙 없이 교사가 직접 부여한 경우 `null`
- 증빙자료 파일은 `GET /api/evidences/{evidenceId}`로 따로 열람 (`[API] 마역량 점수 부여` 참고)

### 2.4. 환산 등급 기준 조회

| **구분** | **내용** |
| --- | --- |
| **Method / URL** | `GET /api/meister/grade-criteria` |
| **권한** | 로그인 |
| **설명** | 영역별 원점수 → 환산 점수 계산 방식과 등급별 인정 기준. 상세 화면의 "기준 보기"에 표시 |

**Response 200**

```json
{
  "registered": true,
  "areas": [
    {
      "scoreType": "MAJOR_SKILL",
      "label": "전공직무능력",
      "maxRawScore": 150,
      "conversionRate": 0.2,
      "grades": [
        { "grade": "A", "minRawScore": 100 },
        { "grade": "B", "minRawScore": 60 },
        { "grade": "C", "minRawScore": 30 }
      ]
    }
  ]
}
```

- 기준이 없으면 `200`, `{ "registered": false, "areas": [] }`

### 2.5. 상·벌점 내역 조회

| **구분** | **내용** |
| --- | --- |
| **Method / URL** | `GET /api/students/{studentId}/merit-points?groupBy={none|teacher}` |
| **권한** | 본인 학생, 교사. 다른 학생은 `403` |
| **설명** | 상점과 벌점을 분리해 각각의 합계와 내역을 반환. `groupBy=teacher`이면 부여 교사별로 묶음 |

**Response 200 (groupBy=none, 기본)**

```json
{
  "studentId": "7b0c2f9e-1a2b-4c3d-9e8f-001122334455",
  "meritTotal": 12,
  "demeritTotal": 5,
  "net": 7,
  "merits": [
    {
      "meritPointId": "aa000000-0000-4000-8000-000000000001",
      "title": "봉사활동",
      "content": "기숙사 환경 정리",
      "points": 3,
      "teacher": { "teacherId": "d1e2f3a4-0000-4000-8000-000000000003", "name": "박선생" },
      "createdAt": "2026-10-10T08:00:00+09:00"
    }
  ],
  "demerits": [
    {
      "meritPointId": "aa000000-0000-4000-8000-000000000002",
      "title": "지각",
      "content": null,
      "points": 1,
      "teacher": { "teacherId": "d1e2f3a4-0000-4000-8000-000000000009", "name": "최선생" },
      "createdAt": "2026-10-12T08:40:00+09:00"
    }
  ]
}
```

**Response 200 (groupBy=teacher)**

```json
{
  "studentId": "7b0c2f9e-1a2b-4c3d-9e8f-001122334455",
  "meritTotal": 12,
  "demeritTotal": 5,
  "net": 7,
  "byTeacher": [
    {
      "teacher": { "teacherId": "d1e2f3a4-0000-4000-8000-000000000003", "name": "박선생" },
      "meritTotal": 9,
      "demeritTotal": 0,
      "items": [ { "meritPointId": "...", "type": "MERIT", "title": "봉사활동", "points": 3, "createdAt": "..." } ]
    }
  ]
}
```

- `points`는 항상 양수로 내려주고, 구분은 `merits`/`demerits` 또는 `type`으로 판단 (화면에서는 `+3`, `-1`로 표시)
- 내역이 없으면 합계 0, 빈 배열

## 3. 예외 처리

| **상황** | **응답** | **프론트 처리** |
| --- | --- | --- |
| 존재하지 않는 학생 ID | `404 STUDENT_NOT_FOUND` | "학생을 찾을 수 없습니다." |
| 다른 학생의 상·벌점 조회 | `403 FORBIDDEN` | 상·벌점 영역을 그리지 않음 (접근 불가 안내) |
| 점수가 없는 영역 | `200`, `rawScore: 0` | 0점 표시 |
| 세부 내역 없음 | `200`, `items: []` | "등록된 내역 없음" |
| 환산 기준 미등록 | `200`, `registered: false` | 안내 문구 |
| 서버 오류 | `500` | 오류 문구 + [다시 시도] |

## 4. DB 매핑 및 보완 필요 사항

| **항목** | **내용** |
| --- | --- |
| 영역별 점수 | `Students`의 5개 점수 컬럼 |
| 획득 내역 | `MeisterScoreDetails` (`score_type`, `content`, `points`, `teacher_id`, `created_at`) |
| 상·벌점 | `MeritPointDetails` (`title`, `content`, `points`, `teacher_id`). 상점·벌점 구분 기준(부호 또는 `type` 컬럼) 확정 필요 |
| 평가항목명 | `MeisterScoreItems`  • `MeisterScoreDetails.item_id` 추가 필요 |
| 증빙자료 | `Evidences`  • `MeisterScoreDetails.evidence_id` 추가 필요 |
| 환산 기준 | `MeisterGradeCriteria` 추가 필요 |
| 링크 | `Students.github_url`, `linkedin_url` 추가 필요 |

**임의로 정한 값**

- "공개가 허용된 정보"는 위 공개 범위 표처럼 정했습니다. 특히 상·벌점과 증빙자료는 다른 학생에게 비공개로 두었습니다.
- 환산 방식(원점수 × 비율)과 등급 예시는 형식만 잡은 것이며 학교 기준표에 맞춰야 합니다.