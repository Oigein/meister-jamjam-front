## 1. 개요

- **관련 기능 명세**: BSSM 전용 핀볼, 자리뽑기 서비스 (1)
- **공통 규칙**: [[API] 공통 규칙](https://app.notion.com/p/API-40762fa2a99981e186b3fcbdaac53457?pvs=21)
- **목적**: 학년·반 명단을 불러와 자리뽑기·핀볼 추첨을 하고, 결과와 시드를 저장해 공정성을 검증
- **공정성 원칙**: 결과는 **서버가 결정**. 서버가 암호학적 난수로 시드를 만들고, 그 시드로 결정적(PRNG) 추첨을 한 뒤 입력·시드·결과를 함께 저장. 클라이언트의 물리 연출·카드 뒤집기는 서버 결과에 맞춰 재생만 함
- **프론트 전용**: 공개 연출(일괄/순차), 효과음, 전체 화면·프로젝터 모드, PNG·PDF 저장은 API 없음

| **Method** | **URL** | **권한** | **설명** |
| --- | --- | --- | --- |
| GET | `/api/classes/{grade}/{classNo}/students` | 로그인 | 학급 명단 (번호·이름) |
| POST | `/api/draws/seats` | 교사, 해당 학급 학생 | 자리뽑기 |
| POST | `/api/draws/pinball` | 교사, 해당 학급 학생 | 핀볼 당첨자 추첨 |
| GET | `/api/draws` | 로그인 | 뽑기 히스토리 |
| GET | `/api/draws/{drawId}` | 로그인 | 뽑기 결과 상세 |
| GET | `/api/draws/{drawId}/verification` | 로그인 | 검증용 시드·입력 자료 |

## 2. 상세 API

### 2.1. 학급 명단 조회

| **구분** | **내용** |
| --- | --- |
| **Method / URL** | `GET /api/classes/{grade}/{classNo}/students` |
| **권한** | 로그인 |
| **설명** | 학년·반을 고르면 명단을 자동으로 채움. 처음 진입 시 학생은 `/api/me`의 소속 학급, 교사는 담임 학급을 기본값으로 사용 |

```json
{
  "grade": 2,
  "classNo": 1,
  "students": [
    { "studentId": "a1b2c3d4-0000-4000-8000-000000000001", "number": 1, "name": "김송프" },
    { "studentId": "a1b2c3d4-0000-4000-8000-000000000002", "number": 2, "name": "이마이" }
  ]
}
```

- 번호 오름차순. 없는 학년·반(학년 1~3, 반 1~4 밖)은 `404 CLASS_NOT_FOUND`

### 2.2. 자리뽑기

| **구분** | **내용** |
| --- | --- |
| **Method / URL** | `POST /api/draws/seats` |
| **권한** | 교사, 해당 학급 학생 |
| **처리 순서** | 1. 명단에서 제외 학생을 빼고 대상 확정
2. 고정 자석 학생을 지정 자리에 먼저 배치
3. 시드 생성 후 나머지 학생을 남은 자리에 무작위 배치 (Fisher-Yates)
4. `avoidPreviousSeat`이면 직전 배치와 같은 자리가 없도록 재배치 (최대 100회 시도)
5. 입력·시드·결과 저장 |

**Request Body**

```json
{
  "grade": 2,
  "classNo": 1,
  "layout": {
    "rows": 4,
    "cols": 4,
    "groupShape": null,
    "disabledSeats": [{ "row": 4, "col": 4 }]
  },
  "excludedStudentIds": ["a1b2c3d4-0000-4000-8000-000000000009"],
  "fixedSeats": [
    { "studentId": "a1b2c3d4-0000-4000-8000-000000000003", "row": 1, "col": 2 }
  ],
  "avoidPreviousSeat": true
}
```

| **필드** | **필수** | **설명** |
| --- | --- | --- |
| `layout.rows`, `layout.cols` | Y | 1~10. 행 1이 교탁·칠판 쪽 |
| `layout.groupShape` | N | 모둠형 `"2x2"`, `"2x3"` 등. 없으면 일반 배치 |
| `layout.disabledSeats` | N | 사용하지 않는 자리 |
| `excludedStudentIds` | N | 전출·결석 등 제외 학생 |
| `fixedSeats` | N | 고정 자석. 자리·학생 중복 불가 |
| `avoidPreviousSeat` | N | 직전 자리 중복 방지, 기본 `false` |

**Response 201**

```json
{
  "drawId": "d7a40000-0000-4000-8000-000000000001",
  "type": "SEAT",
  "grade": 2,
  "classNo": 1,
  "seed": "9f2c4e1a7b3d...",
  "assignments": [
    { "row": 1, "col": 1, "studentId": "a1b2c3d4-...", "number": 7, "name": "박부산", "fixed": false },
    { "row": 1, "col": 2, "studentId": "a1b2c3d4-...", "number": 3, "name": "최마이", "fixed": true }
  ],
  "emptySeats": [{ "row": 4, "col": 3 }],
  "warnings": [],
  "createdAt": "2026-10-29T13:00:00+09:00"
}
```

| **상황** | **응답** |
| --- | --- |
| 대상 학생이 사용 가능한 자리보다 많음 | `400 NOT_ENOUGH_SEATS` |
| 고정 자리가 범위 밖·사용 안 하는 자리·중복 | `400 FIXED_SEAT_CONFLICT` |
| 명단에 없는 학생 ID | `400 STUDENT_NOT_IN_CLASS` |
| 직전 자리를 모두 피할 수 없음 | `201`  • `warnings: ["PREVIOUS_SEAT_UNAVOIDABLE"]` (최대한 피한 결과) |
| 다른 학급 학생이 요청 | `403` |

### 2.3. 핀볼 추첨

| **구분** | **내용** |
| --- | --- |
| **Method / URL** | `POST /api/draws/pinball` |
| **권한** | 교사, 해당 학급 학생 |
| **설명** | 서버가 당첨자와 시드를 정해 반환. 클라이언트는 `seed`로 물리 연출을 돌리되 마지막 도착 구획을 `winners`에 맞춘 |

```json
{
  "grade": 2,
  "classNo": 1,
  "mode": "DROP",
  "winnerCount": 2,
  "excludedStudentIds": [],
  "allowDuplicate": false,
  "previousDrawId": "d7a40000-0000-4000-8000-000000000005"
}
```

| **필드** | **필수** | **설명** |
| --- | --- | --- |
| `mode` | Y | `DROP`(공 떨어뜨리기) / `BUMPER`(핀볼 타격) |
| `winnerCount` | Y | 1 이상, 대상 인원 이하 |
| `allowDuplicate` | N | `false`(기본)이면 `previousDrawId`부터 이어진 추첨에서 이미 뽑힌 학생 제외 |
| `previousDrawId` | N | 연속 추첨의 직전 핀볼 결과. 없으면 새 라운드 |

**Response 201**

```json
{
  "drawId": "d7a40000-0000-4000-8000-000000000006",
  "type": "PINBALL",
  "mode": "DROP",
  "seed": "51ab90cc...",
  "candidateCount": 18,
  "winners": [
    { "order": 1, "studentId": "a1b2c3d4-...", "number": 12, "name": "정해운대" },
    { "order": 2, "studentId": "a1b2c3d4-...", "number": 4, "name": "한광안리" }
  ],
  "createdAt": "2026-10-29T13:05:00+09:00"
}
```

- 오류: 대상이 당첨 인원보다 적음 `400 NOT_ENOUGH_CANDIDATES`, 다른 학급·다른 종류의 `previousDrawId` `400`

### 2.4. 뽑기 히스토리·상세

- `GET /api/draws?grade=2&classNo=1&type=SEAT&limit=10` → 최신순 최근 N개 (기본 10, 최대 50)
    - 항목: `drawId`, `type`, `mode`, `createdBy`(이름), `createdAt`, 요약(자리뽑기는 배치 인원, 핀볼은 당첨자 이름)
- `GET /api/draws/{drawId}` → 2.2 또는 2.3 응답과 같은 형식 (자리표 다시 보기·인쇄용)

### 2.5. 공정성 검증

| **구분** | **내용** |
| --- | --- |
| **Method / URL** | `GET /api/draws/{drawId}/verification` |
| **권한** | 로그인 |
| **설명** | 결과 화면의 "검증용 랜덤 시드 코드". 같은 입력과 시드로 공개된 알고리즘을 돌리면 누구나 같은 결과를 얻을 수 있음 |

```json
{
  "drawId": "d7a40000-0000-4000-8000-000000000006",
  "seed": "51ab90cc...",
  "algorithm": "SHA-256 카운터 모드 PRNG + Fisher-Yates 셔플, v1",
  "input": {
    "candidates": [4, 5, 7, 12, 13],
    "options": { "mode": "DROP", "winnerCount": 2 }
  },
  "result": [12, 4],
  "resultHash": "e3b0c442..."
}
```

- `candidates`는 번호 오름차순으로 고정해 순서에 따른 차이가 없게 함 (검증 응답에는 이름 대신 번호만)

## 3. DB 매핑 및 보완 필요 사항

| **항목** | **내용** |
| --- | --- |
| 명단 | `Students`  • `Users.name`. 학년·반·번호 컬럼(`grade`, `class_no`, `student_number`) 추가 필요 |
| 담임 학급 | `Teachers.homeroom_grade`, `homeroom_class` 추가 필요 |
| 뽑기 기록 | `Draws`(`draw_id`, `type`, `mode`, `grade`, `class_no`, `seed`, `options` JSON, `result` JSON, `previous_draw_id`, `created_by`, `created_at`) 추가 필요 |

**임의로 정한 값**

- 결과를 서버가 정하고 클라이언트는 연출만 하는 방식으로 정했습니다 (기능 명세의 "클라이언트 조작 방지").
- 뽑기 권한은 교사와 해당 학급 학생, 히스토리 기본 10개, 교실 크기 최대 10×10은 임시값입니다.
- 핀볼 "중복 당첨 제외"는 `previousDrawId`로 연속 추첨을 이어 붙이는 방식으로 정했습니다.