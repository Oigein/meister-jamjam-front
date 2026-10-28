<aside>
⚠️

알림 기능 (1) 기능 명세가 비어 있어, 다른 기능 명세(점수 부여, 자진 신고)에 나오는 알림 요구사항을 모아 도출한 안입니다. 기능 명세가 나오면 맞춰 수정해야 합니다.

</aside>

## 1. 개요

- **공통 규칙**: [[API] 공통 규칙](https://app.notion.com/p/API-40762fa2a99981e186b3fcbdaac53457?pvs=21)
- **목적**: 증빙자료 처리, 마역량 점수 변경, 자진 신고 접수·상태 변경을 인앱 알림으로 전달하고, 알림을 누르면 관련 화면으로 이동
- **생성 주체**: 알림은 각 기능의 서버 처리 안에서만 만들어지며, 알림을 만드는 공개 API는 없음

| **Method** | **URL** | **권한** | **설명** |
| --- | --- | --- | --- |
| GET | `/api/notifications` | 로그인 | 내 알림 목록 |
| GET | `/api/notifications/unread-count` | 로그인 | 안 읽은 알림 수 (헤더 배지) |
| PATCH | `/api/notifications/{notificationId}/read` | 본인 | 읽음 처리 |
| PATCH | `/api/notifications/read-all` | 로그인 | 전체 읽음 처리 |
| GET | `/api/notifications/stream` | 로그인 | 실시간 알림 (SSE) |

## 2. 알림 종류

| **type** | **받는 사람** | **발생 시점** | **문구 예시** | **targetUrl** |
| --- | --- | --- | --- | --- |
| `EVIDENCE_APPROVED` | 학생 | 증빙자료 승인 | 제출한 '정보처리기능사'가 승인되어 전공직무능력 +10점이 반영되었습니다. | `/students/{me}?tab=history&detailId=` |
| `EVIDENCE_REJECTED` | 학생 | 증빙자료 반려 | 제출한 '정보처리기능사'가 반려되었습니다. 사유: 취득 날짜가 확인되지 않습니다. | `/me/evidences/{evidenceId}` |
| `MEISTER_SCORE_CHANGED` | 학생 | 교사의 직접 점수 부여·감점 | 인성·직업윤리 점수가 +5점 변경되었습니다. | `/students/{me}?tab=history&detailId=` |
| `SELF_REPORT_RECEIVED` | 수신 교사 | 자진 신고 제출 | [자진 신고] 2학년 1반 홍길동 학생으로부터 자진 신고가 접수되었습니다. | `/teacher/self-reports/{reportId}` |
| `SELF_REPORT_STATUS_CHANGED` | 작성 학생 | 확인·처리 중·완료 | 자진 신고를 선생님이 확인했습니다. | `/me/self-reports/{reportId}` |
| `SELF_REPORT_REPLIED` | 상대방 | 자진 신고 답변 | 자진 신고에 새 답변이 있습니다. | 신고 상세 |
- 자진 신고 알림은 제목·내용·답변 내용을 넣지 않음 (기기 푸시 미리보기 노출 방지)
- 교사의 `SELF_REPORT_RECEIVED`는 인앱 알림과 함께 이메일도 발송

## 3. 상세 API

### 3.1. 내 알림 목록

| **구분** | **내용** |
| --- | --- |
| **Method / URL** | `GET /api/notifications?unreadOnly=false&cursor=&size=20` |
| **권한** | 로그인 (본인 알림만) |
| **정렬** | 최신순, 커서 방식 페이지 (`size` 최대 50) |

```json
{
  "items": [
    {
      "notificationId": "0a0a0000-0000-4000-8000-000000000001",
      "type": "EVIDENCE_APPROVED",
      "title": "증빙자료 승인",
      "body": "제출한 '정보처리기능사'가 승인되어 전공직무능력 +10점이 반영되었습니다.",
      "targetUrl": "/students/7b0c2f9e-...?tab=history&detailId=c0ffee00-...",
      "isRead": false,
      "createdAt": "2026-10-29T10:00:01+09:00"
    }
  ],
  "nextCursor": "MjAyNi0xMC0yOVQxMDowMDowMQ=="
}
```

- 알림을 누르면 프론트는 3.3으로 읽음 처리 후 `targetUrl`로 이동
- 이동한 화면의 대상이 삭제되었으면(예: 철회된 신고) 그 화면의 404 처리를 따름

### 3.2. 안 읽은 알림 수

- `GET /api/notifications/unread-count` → `{ "count": 3 }`

### 3.3. 읽음 처리

- `PATCH /api/notifications/{notificationId}/read` → `204` (이미 읽었어도 `204`)
- 다른 사람의 알림이면 `404`
- `PATCH /api/notifications/read-all` → `204`

### 3.4. 실시간 알림 (SSE)

| **구분** | **내용** |
| --- | --- |
| **Method / URL** | `GET /api/notifications/stream` (`Accept: text/event-stream`) |
| **권한** | 로그인 |
| **이벤트** | `notification`: 3.1의 항목 한 개 / `ping`: 30초마다 연결 유지 |
| **재연결** | 끊기면 브라우저가 `Last-Event-ID`로 다시 연결, 그 사이 알림을 이어서 전송 |
| **대체** | SSE를 쓸 수 없으면 3.2를 30초마다 호출 |

## 4. DB 매핑 및 보완 필요 사항

```sql
CREATE TABLE `Notifications` (
  `notification_id` UUID         NOT NULL,
  `user_id`         UUID         NOT NULL,
  `type`            VARCHAR(40)  NOT NULL,
  `title`           VARCHAR(50)  NOT NULL,
  `body`            VARCHAR(255) NOT NULL,
  `target_url`      VARCHAR(255) NULL,
  `is_read`         BOOLEAN      NOT NULL DEFAULT FALSE,
  `created_at`      DATETIME     NOT NULL DEFAULT NOW(),
  PRIMARY KEY (`notification_id`),
  INDEX `IDX_NOTIFICATIONS_USER` (`user_id`, `is_read`, `created_at`)
);
```

- 알림은 원인이 된 처리(점수 반영, 신고 제출 등)와 같은 트랜잭션에서 저장하고, 커밋 후 SSE·이메일 발송

**임의로 정한 값**

- 알림 종류와 문구, `targetUrl` 형식은 다른 기능 명세에서 도출한 임시값입니다.
- 실시간 전달은 SSE로 정했고, 모바일 푸시(FCM 등)는 앱 출시 시점에 추가하는 것으로 두었습니다.
- 알림 보관 기간은 90일로 가정했습니다.