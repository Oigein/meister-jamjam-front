## 1. 개요

- **관련 기능 명세**: 마역량 따기 좋은 대회 추천 llm (1)
- **공통 규칙**: [[API] 공통 규칙](https://app.notion.com/p/API-40762fa2a99981e186b3fcbdaac53457?pvs=21)
- **목적**: 학생의 전공·기술 스택·마역량 현황·목표를 바탕으로, 대회 DB에 있는 접수 중·예정 대회를 LLM이 추천(RAG)하고 추가 질의응답을 제공
- **원칙**: 추천 대회는 반드시 대회 DB에 있는 대회만. LLM이 DB에 없는 대회를 만들어내면 서버가 응답에서 제거

| **Method** | **URL** | **권한** | **설명** |
| --- | --- | --- | --- |
| POST | `/api/contest-recommendations` | 학생 | 맞춤 대회 추천 생성 |
| POST | `/api/contest-recommendations/chat` | 학생 | 추천 대회에 대한 추가 질의응답 |
| GET | `/api/academic-schedules` | 로그인 | 학사 일정 조회 (일정 겹침 확인용) |
| GET | `/api/admin/recommendation-guidelines` | 관리자 | 추천 점수 산정·프롬프트 가이드라인 조회 |
| PUT | `/api/admin/recommendation-guidelines` | 관리자 | 가이드라인 수정 (규정 변경 즉시 반영) |

## 2. 상세 API

### 2.1. 맞춤 대회 추천

| **구분** | **내용** |
| --- | --- |
| **Method / URL** | `POST /api/contest-recommendations` |
| **권한** | 학생 |
| **처리 순서** | 1. 서버가 학생 데이터 자동 주입: 학년, 영역별·총 마역량 점수 (클라이언트가 바꿀 수 없음)
2. 대회 DB에서 마감 전(`finish_at` ≥ 오늘)이고 검수된(`is_verified`) 대회 검색
3. 시험 기간 전후 1주일 이내 마감 대회는 기본 제외 (`includeExamPeriod`가 `true`면 포함하고 경고)
4. 후보 + 학생 정보 + 가이드라인을 LLM에 전달해 분류·이유 생성
5. 응답의 `contestId`가 후보에 있는지 검증, 점수·마감일·난이도는 DB 값으로 덮어씁움 |

**Request Body**

```json
{
  "major": "BACKEND",
  "techStack": ["Spring", "React", "Python"],
  "goal": { "targetScore": 20, "description": "이번 학기 20점 필요" },
  "availableUntil": "2026-12-31",
  "types": ["VALUE", "HIGH_SCORE", "SHORT_TERM"],
  "includeExamPeriod": false
}
```

| **필드** | **필수** | **설명** |
| --- | --- | --- |
| `major` | N | `BACKEND` / `FRONTEND` / `AI` / `APP` / `EMBEDDED` / `ETC` |
| `techStack` | N | 최대 10개, 각 30자 이하 |
| `goal.targetScore` | N | 목표 점수 (1 이상) |
| `goal.description` | N | 자유 목표, 100자 이하 |
| `availableUntil` | N | 준비 가능한 마지막 날짜 |
| `types` | N | 추천 분류. 생략하면 세 가지 모두 |
| `includeExamPeriod` | N | 기본 `false` |

**Response 200**

```json
{
  "generatedAt": "2026-10-29T15:00:00+09:00",
  "studentContext": {
    "grade": 2,
    "totalScore": 320,
    "weakestArea": "FOREIGN_LANGUAGE"
  },
  "recommendations": [
    {
      "contestId": 42,
      "contestName": "부산 SW 해커톤",
      "recommendType": "SHORT_TERM",
      "scope": "OUT_SCHOOL",
      "tags": ["백엔드", "AI"],
      "expectedScore": 5,
      "deadline": "2026-11-15T18:00:00+09:00",
      "dDay": 17,
      "difficulty": 3,
      "prepHours": 20,
      "efficiencyScore": 0.25,
      "reason": "백엔드 스택과 맞고 2일 안에 끝나 부담이 적습니다.",
      "teamTip": "프론트엔드 1명, 디자인 1명과 3인 팀을 권장합니다.",
      "scheduleWarnings": []
    }
  ],
  "message": null
}
```

| **필드** | **설명** |
| --- | --- |
| `recommendType` | `VALUE`(가성비) / `HIGH_SCORE`(고득점) / `SHORT_TERM`(단기 완수) |
| `expectedScore` | 마역량 예상 점수 (DB 값) |
| `difficulty` | 1~5 (카드의 ★) |
| `efficiencyScore` | "마역량 효율 점수" = `expectedScore / prepHours` (내림차순 정렬 기준) |
| `scheduleWarnings` | 학사 일정과 겹치면 `[{ "type": "EXAM", "title": "2학기 기말고사", "startDate": "2026-12-08", "endDate": "2026-12-11" }]` |
| `message` | 추천할 대회가 없을 때 안내 문구 (예: "지금 조건에 맞는 대회가 없습니다.") |

| **상황** | **응답** |
| --- | --- |
| 추천할 대회 없음 | `200`, `recommendations: []`  • `message` |
| LLM 오류·시간 초과(30초) | `502 UPSTREAM_ERROR` → "추천을 만들지 못했습니다. 다시 시도하세요." |
| 요청 과다 | `429` (분당 10회, 하루 100회) |
| 학생 아님 | `403` |

### 2.2. 추가 질의응답

| **구분** | **내용** |
| --- | --- |
| **Method / URL** | `POST /api/contest-recommendations/chat` |
| **권한** | 학생 |
| **설명** | "이 대회 준비하려면 아이디어 어떻게 짜?" 같은 대화. `conversationId`로 이전 대화를 이어감 |

```json
{
  "conversationId": null,
  "contestId": 42,
  "message": "이 대회 준비하려면 아이디어 어떻게 짜?"
}
```

- `message`: 1~1,000자 / `contestId`: 선택, 주면 해당 대회 정보를 문맥에 넣음
- Response `200`: `{ "conversationId": "f00d0000-...", "reply": "...", "createdAt": "..." }`
- 긴 답변을 바로 보여주려면 `Accept: text/event-stream`으로 요청 → `delta` 이벤트로 글자를 보내고 마지막에 `done` 이벤트(`conversationId` 포함)
- 만료되거나 다른 사람의 `conversationId`면 `404` → 새 대화로 시작

### 2.3. 학사 일정 조회

- `GET /api/academic-schedules?from=2026-11-01&to=2026-12-31`
- Response: `{ "items": [{ "scheduleId": 3, "type": "EXAM", "title": "2학기 기말고사", "startDate": "2026-12-08", "endDate": "2026-12-11" }] }`
- `type`: `EXAM`(시험), `PROJECT`(나르샤·캡스톤 등), `EVENT`(기타)

### 2.4. 추천 가이드라인 관리 (관리자)

| **구분** | **내용** |
| --- | --- |
| **Method / URL** | `GET` / `PUT /api/admin/recommendation-guidelines` |
| **권한** | 관리자 |
| **설명** | 교내 마역량 인정 규정이 바뀌면 점수 산정 기준과 LLM 프롬프트 가이드라인을 수정. 저장 즉시 다음 추천부터 반영 |

```json
{
  "promptGuideline": "참가비가 과도한 대회는 추천하지 말 것...",
  "examBufferDays": 7,
  "version": 3
}
```

- `PUT`은 마지막으로 읽은 `version`을 함께 보내고, 그 사이 다른 사람이 수정했으면 `409 VERSION_CONFLICT`
- 대회별 예상 점수·난이도·검수 여부는 대회 수정 API(`PUT /api/contests/{contestId}`)에 필드를 추가해 관리

## 3. DB 매핑 및 보완 필요 사항

| **항목** | **내용** |
| --- | --- |
| 대회 후보 | `Contests`  • `ContestTags`(분야 태그) |
| 학생 점수 | `Students` 5개 영역 점수 |
| 추천용 대회 정보 | `Contests`에 `expected_score`, `difficulty`, `prep_hours`, `is_verified` 추가 필요 |
| 학사 일정 | `AcademicSchedules` 테이블 추가 필요 |
| 가이드라인 | `RecommendationGuidelines`(단일 행, `version`) 추가 필요 |
| 대화 기록 | DB에 저장하지 않고 캐시에 30분 보관 |
| 전공·기술 스택 | DB에 없어 요청으로 받음. 저장하려면 `Students.major`, `StudentTechStacks` 추가 |

**임의로 정한 값**

- 전공·기술 스택은 학생 데이터에 없어 요청 본문으로 받도록 했습니다.
- LLM 시간 초과 30초, 대화 보관 30분, 요청 제한은 임시값입니다.
- "함께할 팀원 구하기"는 연동할 팀 빌딩 게시판 명세가 없어 API에서 제외했습니다.