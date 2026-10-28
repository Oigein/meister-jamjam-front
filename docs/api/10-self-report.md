## 1. 개요

- **관련 기능 명세**: 자진 신고 (1)
- **공통 규칙**: [[API] 공통 규칙](https://app.notion.com/p/API-40762fa2a99981e186b3fcbdaac53457?pvs=21)
- **목적**: 학생이 담임(기본) 또는 직접 고른 선생님에게만 자진 신고를 비밀리에 제출하고, 수신 교사가 확인·답변·처리
- **비공개 원칙**: 작성 학생과 지정된 수신 교사 외에는 모든 API가 `404`를 반환 (존재 여부도 알 수 없게). 관리자도 수신자가 아니면 조회 불가

| **Method** | **URL** | **권한** | **설명** |
| --- | --- | --- | --- |
| GET | `/api/self-reports/default-recipient` | 학생 | 기본 수신자(담임) 조회 |
| GET | `/api/teachers` | 로그인 | 교사 검색 (이름·과목·직책) |
| POST | `/api/self-reports/attachments` | 학생 | 첨부파일 업로드 |
| POST | `/api/self-reports` | 학생 | 자진 신고 제출 |
| GET | `/api/me/self-reports` | 학생 | 내 신고 내역함 |
| GET | `/api/teacher/self-reports` | 교사 | 내가 받은 신고 목록 |
| GET | `/api/self-reports/{reportId}` | 작성자·수신 교사 | 신고 상세 (수신 교사가 열면 확인 처리) |
| PATCH | `/api/self-reports/{reportId}` | 작성자 | 수정 (확인 전만) |
| DELETE | `/api/self-reports/{reportId}` | 작성자 | 철회 (확인 전만) |
| PATCH | `/api/self-reports/{reportId}/status` | 수신 교사 | 처리 상태 변경 |
| GET | `/api/self-reports/{reportId}/replies` | 작성자·수신 교사 | 답변(1:1 대화) 목록 |
| POST | `/api/self-reports/{reportId}/replies` | 작성자·수신 교사 | 답변 작성 |
| GET | `/api/self-reports/{reportId}/attachments/{attachmentId}` | 작성자·수신 교사 | 첨부파일 다운로드 |

**상태 흐름**

```
UNREAD(확인 전) ──수신 교사가 상세 조회──▶ READ(확인 완료)
                                         │
                                         ├──▶ IN_PROGRESS(처리 중) ──▶ DONE(처리 완료)
                                         └──▶ DONE(처리 완료)
수정·철회는 UNREAD에서만 가능, 되돌리기 불가
```

## 2. 상세 API

### 2.1. 기본 수신자 조회

| **구분** | **내용** |
| --- | --- |
| **Method / URL** | `GET /api/self-reports/default-recipient` |
| **권한** | 학생 |
| **설명** | 학생의 현재 학급 담임. 담임이 등록되지 않았으면 학년 부장 → 상담교사 순으로 대체 |

```json
{
  "teacher": { "teacherId": "d1e2f3a4-0000-4000-8000-000000000003", "name": "박선생", "subject": "수학", "position": "2학년 1반 담임" },
  "isFallback": false,
  "fallbackReason": null
}
```

- 대체된 경우 `isFallback: true`, `fallbackReason: "HOMEROOM_NOT_ASSIGNED"` → "담임 선생님이 아직 등록되지 않아 OOO 선생님께 전달됩니다." 안내
- 대체할 교사도 없으면 `teacher: null` → 학생이 직접 선택해야 제출 가능

### 2.2. 교사 검색

- `GET /api/teachers?q=&subject=&position=` (조건 AND, 이름 부분 일치)
- Response: `{ "items": [{ "teacherId": "...", "name": "김상담", "subject": null, "position": "상담교사" }] }`
- 교사의 이름·과목·직책만 반환 (이메일 등 개인정보 제외)

### 2.3. 첨부파일 업로드

| **구분** | **내용** |
| --- | --- |
| **Method / URL** | `POST /api/self-reports/attachments` (`multipart/form-data`, part `file`) |
| **권한** | 학생 |
| **제약** | JPG·PNG·PDF, 개당 10MB 이하. 암호화해 저장 |
| **Response 201** | `{ "attachmentId": "...", "fileName": "분실물.jpg", "sizeBytes": 482133 }` |
| **정리** | 24시간 안에 신고에 연결되지 않은 파일은 자동 삭제 |
| **오류** | `413 FILE_TOO_LARGE`, `415 UNSUPPORTED_FILE_TYPE` |

### 2.4. 자진 신고 제출

| **구분** | **내용** |
| --- | --- |
| **Method / URL** | `POST /api/self-reports` |
| **권한** | 학생 |
| **후속 처리** | 수신 교사에게 푸시·이메일 발송 (예: "[자진 신고] 2학년 1반 홍길동 학생으로부터 자진 신고가 접수되었습니다."). 알림·메일에는 제목·내용을 넣지 않음 |

```json
{
  "type": "LOST_FOUND",
  "title": "실습실 노트북 충전기 분실",
  "content": "10월 28일 5교시 후 실습실3에서...",
  "recipientIds": ["d1e2f3a4-0000-4000-8000-000000000003"],
  "changeReason": null,
  "preferredHandling": "WRITTEN_REPLY",
  "attachmentIds": ["aa11bb22-0000-4000-8000-000000000001"]
}
```

| **필드** | **필수** | **제약** |
| --- | --- | --- |
| `type` | Y | `LOST_FOUND`(물품 분실·습득) / `SCHOOL_RULE`(교칙 관련) / `PEER_RELATION`(교우 관계) / `COUNSELING`(고민 상담) / `ETC` |
| `title` | Y | 1~50자 |
| `content` | Y | 1~2,000자 |
| `recipientIds` | Y | 교사 ID 1~N명 (기본 N = 1), 중복 불가 |
| `changeReason` | N | 담임이 아닌 교사를 고른 경우만: `SUBJECT`(교과 문제) / `COUNSELING`(상담 희망) / `ETC` |
| `preferredHandling` | Y | `MEETING` / `WRITTEN_REPLY` / `NOTICE_ONLY` |
| `attachmentIds` | N | 최대 3개, 본인이 올린 미연결 파일만 |
- 성공 `201`: 2.6 상세와 같은 형식 (`status: "UNREAD"`)
- 오류: `400 VALIDATION_FAILED`, `400 TOO_MANY_RECIPIENTS`, `400 INVALID_RECIPIENT`(교사가 아님)

### 2.5. 내 신고 내역함 / 받은 신고 목록

| **구분** | **학생** | **교사** |
| --- | --- | --- |
| **URL** | `GET /api/me/self-reports?status=&page=` | `GET /api/teacher/self-reports?status=&page=` |
| **범위** | 본인이 작성한 신고 | 본인이 수신자인 신고 |
| **항목** | `reportId`, `type`, `title`, `status`, `recipients`(이름), `hasNewReply`, `createdAt` | `reportId`, `student`(이름·학번), `type`, `title`, `status`, `preferredHandling`, `hasNewReply`, `createdAt` |
| **정렬** | 최신순 | 확인 전 먼저, 그다음 최신순 |

### 2.6. 신고 상세

| **구분** | **내용** |
| --- | --- |
| **Method / URL** | `GET /api/self-reports/{reportId}` |
| **권한** | 작성 학생, 수신 교사. 그 외 `404` |
| **부수 효과** | 수신 교사가 처음 열면 `UNREAD` → `READ`, 해당 교사의 `readAt` 기록, 학생에게 `SELF_REPORT_STATUS_CHANGED` 알림 |

```json
{
  "reportId": "5e1f0000-0000-4000-8000-000000000001",
  "student": { "studentId": "7b0c2f9e-...", "name": "홍길동", "grade": 2, "classNo": 1, "number": 5 },
  "type": "LOST_FOUND",
  "title": "실습실 노트북 충전기 분실",
  "content": "10월 28일 5교시 후 실습실3에서...",
  "recipients": [
    { "teacherId": "d1e2f3a4-...", "name": "박선생", "readAt": "2026-10-29T08:10:00+09:00" }
  ],
  "changeReason": null,
  "preferredHandling": "WRITTEN_REPLY",
  "attachments": [
    { "attachmentId": "aa11bb22-...", "fileName": "충전기.jpg", "sizeBytes": 482133 }
  ],
  "status": "READ",
  "editable": false,
  "createdAt": "2026-10-28T21:00:00+09:00",
  "updatedAt": "2026-10-29T08:10:00+09:00"
}
```

- `editable`: 작성자이고 `UNREAD`일 때만 `true`

### 2.7. 수정·철회 (작성자)

| **구분** | **내용** |
| --- | --- |
| **수정** | `PATCH /api/self-reports/{reportId}`, 2.4의 필드 중 바꿀 것만 전송 → `200`  • 상세 |
| **철회** | `DELETE /api/self-reports/{reportId}` → `204`. 첨부파일도 함께 삭제, 수신 교사의 알림도 제거 |
| **제약** | 상태가 `UNREAD`가 아니면 `409 REPORT_ALREADY_READ` → "선생님이 이미 확인해 수정·삭제할 수 없습니다." |
| **동시성** | 상태 확인과 수정을 한 번에 처리 (`WHERE status = 'UNREAD'`), 교사가 동시에 열었으면 409 |

### 2.8. 처리 상태 변경 (수신 교사)

- `PATCH /api/self-reports/{reportId}/status`, `{ "status": "IN_PROGRESS" }`
- 허용: `READ → IN_PROGRESS`, `READ → DONE`, `IN_PROGRESS → DONE`. 그 외 `409 INVALID_STATUS_TRANSITION`
- 성공 `200` + 상세, 학생에게 `SELF_REPORT_STATUS_CHANGED` 인앱 알림

### 2.9. 답변 (1:1 대화)

| **구분** | **내용** |
| --- | --- |
| **목록** | `GET /api/self-reports/{reportId}/replies` → `{ "items": [{ "replyId": "...", "author": { "userId": "...", "name": "박선생", "role": "TEACHER" }, "content": "...", "createdAt": "..." }] }` (오래된 순) |
| **작성** | `POST /api/self-reports/{reportId}/replies`, `{ "content": "내일 점심시간에 교무실로 와 주세요." }` (1~1,000자) → `201` |
| **규칙** | 교사가 처음 답변하면 `READ`인 신고는 `IN_PROGRESS`로 자동 변경. `DONE` 이후에는 `409 REPORT_CLOSED` |
| **알림** | 상대방에게 `SELF_REPORT_REPLIED` 알림 (답변 내용은 넣지 않음) |

## 3. 보안 처리

| **구분** | **내용** |
| --- | --- |
| **접근 제어** | 모든 조회·변경 쿼리에 작성자 또는 수신자 조건을 포함. 권한 없으면 `403`이 아닌 `404` |
| **암호화** | `title`, `content`, 답변, 첨부파일을 암호화해 저장 (AES-256-GCM, 키는 별도 보관) |
| **알림·로그** | 알림, 이메일, 서버 로그에 제목·내용·첨부파일 이름을 남기지 않음 |
| **첨부파일** | 다운로드 시에도 권한을 다시 확인하고 `Cache-Control: no-store` |

## 4. DB 매핑 및 보완 필요 사항

| **항목** | **내용** |
| --- | --- |
| 신고 | `SelfReport`: 현재 `content` VARCHAR(100), `is_processed`만 있음 → `type`, `title`, `content` TEXT(암호문), `preferred_handling`, `status`, `change_reason`, `updated_at` 추가, `is_processed`는 `status`로 대체 |
| 수신자 | `SelfReportRecipients`(`report_id`, `teacher_id`, `read_at`) 추가 |
| 첨부파일 | `SelfReportAttachments`(`attachment_id`, `report_id` NULL, `uploader_id`, `file_name`, `file_url`, `size_bytes`, `created_at`) 추가 |
| 답변 | `SelfReportReplies`(`reply_id`, `report_id`, `author_id`, `content`, `created_at`) 추가 |
| 담임·직책 | `Teachers`(`subject`, `position`, `homeroom_grade`, `homeroom_class`) 추가 |
| FK | `SelfReport.student_id` → `Students` FK 추가 권장 |

**임의로 정한 값**

- 최대 수신자 수 N은 기능 명세의 기본값대로 1명으로 두고 설정값으로 바꿀 수 있게 했습니다.
- 여러 수신자 중 한 명이라도 열면 `READ`로 바뀌는 것으로 정했습니다.
- 교사의 첫 답변 시 `IN_PROGRESS`로 자동 전환, 암호화 방식, 미연결 첨부 24시간 삭제는 임시값입니다.
- 면담 일정은 별도 API 없이 답변으로 전달하는 것으로 정했습니다.