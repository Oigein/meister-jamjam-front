## 1. 개요

- **관련 기능 명세**: 마역량 점수 부여(扶餘) (1)
- **공통 규칙**: [[API] 공통 규칙](https://app.notion.com/p/API-40762fa2a99981e186b3fcbdaac53457?pvs=21)
- **목적**: 학생이 증빙자료를 제출하면 AI(OCR + LLM)가 분석·추천하고, 교사가 승인·반려하거나 직접 점수를 부여. 결과는 학생 점수·획득 이력·알림에 자동 반영

| **Method** | **URL** | **권한** | **설명** |
| --- | --- | --- | --- |
| GET | `/api/meister/score-items` | 로그인 | 평가항목 목록·최대 인정 점수 |
| GET | `/api/teacher/students` | 교사 | 학생 검색 (현재 점수·대기 증빙 수 포함) |
| POST | `/api/evidences` | 학생 | 증빙자료 제출 |
| GET | `/api/me/evidences` | 학생 | 내 증빙자료 제출 내역 |
| GET | `/api/teacher/evidences` | 교사 | 증빙자료 검토 목록 |
| GET | `/api/evidences/{evidenceId}` | 제출 학생·교사 | 증빙자료 상세 + AI 분석 결과 |
| GET | `/api/evidences/{evidenceId}/file` | 제출 학생·교사 | 증빙자료 원본 파일 |
| POST | `/api/evidences/{evidenceId}/analysis` | 교사 | AI 재분석 |
| POST | `/api/evidences/{evidenceId}/approve` | 교사 | 승인 + 점수 반영 |
| POST | `/api/evidences/{evidenceId}/reject` | 교사 | 반려 (사유 필수) |
| POST | `/api/meister-scores` | 교사 | 증빙 없이 직접 점수 부여 |
| GET | `/api/teacher/meister-scores` | 교사 | 점수 부여 이력 조회 |
| POST | `/api/merit-points` | 교사 | 상·벌점 부여 (DB 기반 도출) |

## 2. 상세 API

### 2.1. 평가항목 목록

| **구분** | **내용** |
| --- | --- |
| **Method / URL** | `GET /api/meister/score-items?scoreType={scoreType}` |
| **권한** | 로그인 |
| **설명** | 점수 부여 폼의 평가항목 드롭다운과 최대 인정 점수 검증에 사용 |

```json
{
  "items": [
    {
      "itemId": 12,
      "scoreType": "MAJOR_SKILL",
      "name": "국가기술자격증",
      "maxPoints": 30,
      "description": "기능사 10점, 산업기사 20점"
    }
  ]
}
```

### 2.2. 학생 검색 (교사)

| **구분** | **내용** |
| --- | --- |
| **Method / URL** | `GET /api/teacher/students?q=&grade=&classNo=&number=&page=` |
| **권한** | 교사 |
| **설명** | 이름(부분 일치) 또는 학년·반·번호로 검색. 조건은 AND 적용 |

```json
{
  "items": [
    {
      "studentId": "7b0c2f9e-1a2b-4c3d-9e8f-001122334455",
      "name": "홍길동",
      "grade": 2,
      "classNo": 1,
      "number": 5,
      "totalScore": 320,
      "pendingEvidenceCount": 2
    }
  ],
  "page": 1, "size": 20, "totalElements": 1, "totalPages": 1
}
```

- 학생의 영역별 점수·등급은 `GET /api/students/{studentId}/meister-scores` 재사용

### 2.3. 증빙자료 제출 (학생)

| **구분** | **내용** |
| --- | --- |
| **Method / URL** | `POST /api/evidences` (`multipart/form-data`) |
| **권한** | 학생 (본인 명의로만 제출) |
| **설명** | 자격증·상장 등을 업로드. 저장 후 AI 분석을 비동기로 시작하고 즉시 응답 |

| **Part** | **타입** | **필수** | **제약** |
| --- | --- | --- | --- |
| `file` | file | Y | JPG, PNG, PDF / 10MB 이하 |
| `title` | string | Y | 1~50자 (예: "정보처리기능사") |
| `description` | string | N | 200자 이하 |
| `scoreType` | ScoreType | N | 학생이 예상하는 영역 (AI 추천의 참고값) |

**Response 201**

```json
{
  "evidenceId": "e5e5e5e5-0000-4000-8000-000000000004",
  "title": "정보처리기능사",
  "status": "PENDING",
  "analysisStatus": "PROCESSING",
  "createdAt": "2026-10-29T09:00:00+09:00"
}
```

- 오류: `413 FILE_TOO_LARGE`, `415 UNSUPPORTED_FILE_TYPE` (확장자가 아닌 파일 내용으로 판별), `400 VALIDATION_FAILED`

### 2.4. 내 증빙자료 내역 (학생)

- `GET /api/me/evidences?status=&page=` → 페이지 목록
- 항목: `evidenceId`, `title`, `status`, `rejectReason`(반려 시), `approvedPoints`(승인 시), `createdAt`, `reviewedAt`

### 2.5. 증빙자료 검토 목록 (교사)

| **구분** | **내용** |
| --- | --- |
| **Method / URL** | `GET /api/teacher/evidences?status=PENDING&studentId=&page=` |
| **권한** | 교사 |
| **설명** | 기본은 검토 대기(`PENDING`)를 오래된 순으로. `studentId`를 주면 해당 학생의 제출 내역만 |
- 항목: `evidenceId`, `student`(id, 이름, 학번), `title`, `status`, `analysisStatus`, `recommendedScoreType`, `expectedPoints`, `createdAt`

### 2.6. 증빙자료 상세 + AI 분석 결과

| **구분** | **내용** |
| --- | --- |
| **Method / URL** | `GET /api/evidences/{evidenceId}` |
| **권한** | 제출한 학생 본인, 교사. 그 외 `404` |

**Response 200**

```json
{
  "evidenceId": "e5e5e5e5-0000-4000-8000-000000000004",
  "student": { "studentId": "7b0c2f9e-...", "name": "홍길동", "grade": 2, "classNo": 1, "number": 5 },
  "title": "정보처리기능사",
  "description": null,
  "file": { "fileName": "자격증.pdf", "contentType": "application/pdf", "url": "/api/evidences/e5e5e5e5-.../file" },
  "status": "PENDING",
  "aiAnalysis": {
    "status": "DONE",
    "extracted": {
      "kind": "CERTIFICATE",
      "name": "정보처리기능사",
      "issuer": "한국산업인력공단",
      "award": null,
      "achievedAt": "2026-09-10"
    },
    "recommendation": {
      "scoreType": "MAJOR_SKILL",
      "itemId": 12,
      "itemName": "국가기술자격증",
      "expectedPoints": 10,
      "reason": "국가기술자격 기능사 등급으로 확인되어 기능사 인정 점수를 추천합니다."
    },
    "duplicateSuspect": null,
    "analyzedAt": "2026-10-29T09:00:20+09:00"
  },
  "review": null,
  "createdAt": "2026-10-29T09:00:00+09:00"
}
```

| **필드** | **설명** |
| --- | --- |
| `aiAnalysis.status` | `PROCESSING` / `DONE` / `FAILED`. `PROCESSING`이면 프론트는 3초 간격으로 다시 조회 |
| `extracted.kind` | `CERTIFICATE`(자격증) / `AWARD`(상장) / `PARTICIPATION`(참가확인서) / `OTHER` |
| `duplicateSuspect` | 같은 학생에게 같은 항목·같은 실적으로 인정된 내역이 있으면 `{ "detailId": "...", "content": "...", "createdAt": "..." }` |
| `review` | 처리 후 `{ "teacher": {...}, "reviewedAt": "...", "rejectReason": null, "detailId": "..." }` |
- AI 분석 결과는 추천값일 뿐이며 교사가 승인 시 자유롭게 수정 가능
- 원본 파일: `GET /api/evidences/{evidenceId}/file` (같은 권한, `Content-Disposition: inline`)

### 2.7. AI 재분석

- `POST /api/evidences/{evidenceId}/analysis` (교사) → `202 Accepted`, `{ "analysisStatus": "PROCESSING" }`
- 분석 실패(`FAILED`)나 결과가 이상할 때 사용. 이미 처리된 증빙은 `409 EVIDENCE_ALREADY_REVIEWED`

### 2.8. 증빙자료 승인 + 점수 반영

| **구분** | **내용** |
| --- | --- |
| **Method / URL** | `POST /api/evidences/{evidenceId}/approve` |
| **권한** | 교사 |
| **설명** | 교사가 확정한 평가항목·점수로 승인. 아래 처리를 하나의 트랜잭션으로 수행 |
| **처리 순서** | 1. 상태가 `PENDING`인지 확인
2. 평가항목의 최대 인정 점수 검증 (기존 획득 점수 포함)
3. 중복 인정 여부 확인
4. `MeisterScoreDetails` 저장 + `Students.{영역}_point` 가산
5. 증빙 상태 `APPROVED`로 변경
6. 학생에게 `EVIDENCE_APPROVED` 알림 |

**Request Body**

```json
{
  "scoreType": "MAJOR_SKILL",
  "itemId": 12,
  "points": 10,
  "content": "정보처리기능사 취득"
}
```

| **필드** | **타입** | **필수** | **제약** |
| --- | --- | --- | --- |
| `scoreType` | ScoreType | Y | `itemId`의 영역과 일치해야 함 |
| `itemId` | int | Y | 존재하는 평가항목 |
| `points` | int | Y | 1 이상, 항목의 남은 인정 한도 이하 |
| `content` | string | Y | 1~50자 (점수 부여 사유) |

**Response 200**

```json
{
  "evidenceId": "e5e5e5e5-0000-4000-8000-000000000004",
  "status": "APPROVED",
  "scoreDetail": {
    "detailId": "c0ffee00-0000-4000-8000-000000000010",
    "scoreType": "MAJOR_SKILL",
    "itemId": 12,
    "points": 10,
    "content": "정보처리기능사 취득",
    "createdAt": "2026-10-29T10:00:00+09:00"
  },
  "studentScore": { "scoreType": "MAJOR_SKILL", "rawScore": 130, "totalScore": 330 }
}
```

| **상황** | **응답** |
| --- | --- |
| 최대 인정 점수 초과 | `400 EXCEEDS_MAX_POINTS`  • `remainingPoints` |
| 같은 실적 중복 인정 | `409 DUPLICATE_ACHIEVEMENT`  • 기존 `detailId` |
| 이미 승인·반려됨 | `409 EVIDENCE_ALREADY_REVIEWED` |
| 없는 증빙·평가항목 | `404` |

### 2.9. 증빙자료 반려

| **구분** | **내용** |
| --- | --- |
| **Method / URL** | `POST /api/evidences/{evidenceId}/reject` |
| **권한** | 교사 |
| **Request** | `{ "reason": "취득 날짜가 확인되지 않습니다." }` (필수, 1~200자) |
| **Response** | `200`, `{ "evidenceId": "...", "status": "REJECTED", "rejectReason": "..." }` |
| **후속 처리** | 학생에게 `EVIDENCE_REJECTED` 알림 (사유 포함) |
| **오류** | 사유 없음 `400` / 이미 처리됨 `409 EVIDENCE_ALREADY_REVIEWED` |

### 2.10. 직접 점수 부여 (증빙 없음)

| **구분** | **내용** |
| --- | --- |
| **Method / URL** | `POST /api/meister-scores` |
| **권한** | 교사 |
| **설명** | 학생 검색 → 평가항목 선택 → 점수·사유 입력. 2.8과 같은 검증(최대 점수, 중복) 후 반영하고 `MEISTER_SCORE_CHANGED` 알림 |

```json
{
  "studentId": "7b0c2f9e-1a2b-4c3d-9e8f-001122334455",
  "scoreType": "CHARACTER_JOB_ETHIC",
  "itemId": 31,
  "points": 5,
  "content": "교내 봉사활동 리더"
}
```

- `points`: 정수. 오류 정정을 위한 음수(감점)도 허용하되 해당 영역 점수가 0 미만이 되면 `400 SCORE_BELOW_ZERO`
- Response `201`: 2.8 응답의 `scoreDetail`, `studentScore`와 같은 형식

### 2.11. 점수 부여 이력 조회 (교사)

- `GET /api/teacher/meister-scores?studentId=&teacherId=&scoreType=&from=&to=&page=`
- 항목: 대상 학생, 평가항목, 부여 점수, 사유, 담당 교사, 처리 일시, 관련 증빙자료(`evidenceId` 또는 `null`)
- `teacherId=me`이면 로그인한 교사가 부여한 내역만

### 2.12. 상·벌점 부여 (DB 기반 도출)

| **구분** | **내용** |
| --- | --- |
| **Method / URL** | `POST /api/merit-points` |
| **권한** | 교사 |
| **설명** | 기능 명세는 없으나 `MeritPointDetails`와 상·벌점 조회 기능에 데이터를 넣기 위해 필요. 상벌점 기준(`ruleId`)을 고르면 제목·점수가 기본값으로 채워짐 |

```json
{
  "studentId": "7b0c2f9e-1a2b-4c3d-9e8f-001122334455",
  "type": "DEMERIT",
  "ruleId": 7,
  "title": "지각",
  "content": "10분 지각",
  "points": 1
}
```

- `title` 1~20자, `content` 50자 이하, `points` 1 이상
- 저장 시 벌점은 `points`를 음수로 기록하고 `Students.total_merit_points`에 반영
- Response `201`: 저장된 내역 (상·벌점 조회 API의 항목 형식)

## 3. DB 매핑 및 보완 필요 사항

| **항목** | **내용** |
| --- | --- |
| 점수 부여 이력 | `MeisterScoreDetails` (`teacher_id`, `student_id`, `score_type`, `content`, `points`, `created_at`) |
| 학생 점수 | `Students.{영역}_point` 가산 (내역 저장과 같은 트랜잭션) |
| 증빙자료 | `Evidences` 테이블 추가 필요, `MeisterScoreDetails.evidence_id`(NULL 허용) 추가 |
| 평가항목 | `MeisterScoreItems` 추가, `MeisterScoreDetails.item_id` 추가 |
| 상·벌점 | `MeritPointDetails`, 기준 연결이 필요하면 `rule_id`(NULL 허용) 추가 |
| 알림 | `Notifications` 테이블 추가 필요 |
| 교사 FK | `teacher_id`가 `Users`를 참조하도록 FK 추가 권장 |

**임의로 정한 값**

- 증빙 파일 형식(JPG·PNG·PDF)과 10MB 제한, 제목 50자·반려 사유 200자는 임시값입니다.
- AI 분석은 비동기 + 폴링(3초) 방식으로 정했습니다.
- 중복 인정은 막고(409) 교사가 강제로 넘길 수 없게 했습니다. 예외가 필요하면 교사 확인 플래그를 추가하세요.
- 상·벌점 부여 API는 기능 명세에 없고 DB에서 도출했습니다.