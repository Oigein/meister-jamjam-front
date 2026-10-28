## 1. 개요

- **목적**: 마이스터 잼잼이의 모든 API가 공통으로 따르는 주소 규칙, 인증, 응답·오류 형식, 상태 코드, Enum 값을 한곳에 정의함.
- **참고 문서**: 각 기능의 API는 `[API]`로 시작하는 페이지에 있으며, 모두 이 페이지의 규칙을 전제로 함. DB는 DB 설계 기준.

## 2. 기본 규칙

| **구분** | **내용** |
| --- | --- |
| **Base URL** | `/api` (단, 구글 로그인 흐름은 `/auth`) |
| **데이터 형식** | `application/json; charset=UTF-8`, 파일 업로드는 `multipart/form-data` |
| **필드 이름** | 요청·응답 JSON은 camelCase, DB 컬럼은 snake_case |
| **날짜·시간** | ISO 8601, 한국 시간 (`2026-10-29T14:30:00+09:00`), 날짜만 쓸 때는 `2026-10-29` |
| **인증** | 로그인 시 발급되는 세션 쿠키(`HttpOnly`, `Secure`, `SameSite=Lax`). `/auth/*`를 제외한 모든 API에 필요 |
| **요청 출처 검사** | POST·PUT·PATCH·DELETE 요청은 `Origin` 헤더가 서비스 도메인일 때만 처리 |
| **ID 형식** | 사용자·학생·내역 등: UUID / 대회·태그·카테고리 등: 정수(AUTO_INCREMENT) |
| **권한 표기** | 비로그인 / 로그인(모든 역할) / 학생 / 교사 / 관리자 / 본인 |

## 3. 역할

| **값** | **의미** | **비고** |
| --- | --- | --- |
| `STUDENT` | 학생 | `Students` 행과 1:1 연결 |
| `TEACHER` | 교사 | 점수 부여, 대회 등록, 자진 신고 수신 |
| `ADMIN` | 관리자 | 교사 권한 + 운영 설정(추천 가이드라인 등) |

## 4. 응답 형식

### 4.1. 성공 응답

- 단건은 리소스 객체를 그대로 반환 (별도 래퍼 없음)
- 페이지 목록은 아래 형식을 사용

```json
{
  "items": [],
  "page": 1,
  "size": 20,
  "totalElements": 0,
  "totalPages": 0
}
```

- 알림처럼 계속 쌓이는 목록은 커서 방식 사용: `{ "items": [], "nextCursor": "..." }` (마지막이면 `null`)

### 4.2. 오류 응답

```json
{
  "code": "VALIDATION_FAILED",
  "message": "입력값을 확인해 주세요.",
  "fieldErrors": [
    { "field": "githubUrl", "reason": "INVALID_HOST", "message": "GitHub 주소가 아닙니다." }
  ]
}
```

- `message`는 화면에 그대로 보여 줄 수 있는 문구. 원인 상세(스택, SQL 등)는 서버 로그에만 기록
- `fieldErrors`는 입력 검증 실패일 때만 포함

## 5. 공통 상태 코드

| **HTTP** | **code** | **의미** |
| --- | --- | --- |
| 200 | - | 성공 |
| 201 | - | 생성 성공 |
| 204 | - | 성공, 응답 본문 없음 |
| 400 | `VALIDATION_FAILED` | 입력값 검증 실패 |
| 401 | `UNAUTHORIZED` | 비로그인·세션 만료 → 프론트는 현재 주소를 기억하고 로그인 화면으로 이동 |
| 403 | `FORBIDDEN` | 권한 없음 |
| 404 | `NOT_FOUND` | 대상 없음 (권한 없는 비공개 자원도 존재를 숨기기 위해 404) |
| 409 | `CONFLICT` 계열 | 상태 충돌, 중복 (기능별 세부 code 사용) |
| 413 | `FILE_TOO_LARGE` | 파일 용량 초과 |
| 415 | `UNSUPPORTED_FILE_TYPE` | 허용되지 않은 파일 형식 |
| 429 | `TOO_MANY_REQUESTS` | 요청 과다. `Retry-After` 헤더 포함 |
| 500 | `INTERNAL_ERROR` | 서버 오류 |
| 502 | `UPSTREAM_ERROR` | 외부 서비스(구글, LLM, OCR) 오류·지연 |

## 6. 요청 제한

| **대상** | **제한** | **출처** |
| --- | --- | --- |
| 로그인 (`/auth/google*`) | IP당 분당 20회 | 로그인 명세 |
| 상벌점 기준 조회 | IP당 분당 60회 | 상벌점 기준 조회 명세 |
| 프로필 링크 수정 | 사용자당 분당 20회 | 프로필 링크 명세 |
| 대회 추천 LLM | 사용자당 분당 10회, 하루 100회 | 임의 |
| 파일 업로드 | 사용자당 분당 10회 | 임의 |

## 7. Enum 정의

| **Enum** | **값** |
| --- | --- |
| `Role` | `STUDENT`, `TEACHER`, `ADMIN` |
| `ScoreType` (마역량 영역) | `JOB_BASIC`(직업기초능력), `MAJOR_SKILL`(전공직무능력), `CHARACTER_JOB_ETHIC`(인성·직업윤리), `HUMANITIES_LITERACY`(인문학적 소양), `FOREIGN_LANGUAGE`(외국어능력) |
| `PointType` | `MERIT`(상점), `DEMERIT`(벌점) |
| `ContestScope` | `IN_SCHOOL`(교내), `OUT_SCHOOL`(교외) |
| `EvidenceStatus` | `PENDING`(검토 대기), `APPROVED`(승인), `REJECTED`(반려) |
| `SelfReportStatus` | `UNREAD`(확인 전), `READ`(확인 완료), `IN_PROGRESS`(처리 중), `DONE`(처리 완료) |
| `PreferredHandling` | `MEETING`(면담 희망), `WRITTEN_REPLY`(서면 답변), `NOTICE_ONLY`(단순 알림) |
| `FontScale` | `XS`(85%), `S`(92%), `M`(100%), `L`(115%), `XL`(130%) |
| `BackgroundType` | `NONE`, `GIF`, `MP4` |
| `BackgroundFit` | `COVER`, `TILE`, `CONTAIN` |
| `DrawType` | `SEAT`(자리뽑기), `PINBALL`(핀볼) |

## 8. DB 설계 보완 필요 사항

기능 명세의 API를 구현하려면 현재 DB 설계에 아래 항목이 추가·수정되어야 함. 각 API 페이지의 "DB 매핑"에도 같은 내용을 적어 둠.

| **구분** | **현재 DB** | **필요한 이유 (관련 API)** | **제안** |
| --- | --- | --- | --- |
| 학번 정보 | 학년·반·번호 컬럼 없음 | 랭킹 표시·동점 정렬, 학생 검색, 자리뽑기 명단 | `Students`에 `grade`, `class_no`, `student_number` 추가, 세 컬럼 UNIQUE |
| 사전 등록 명단 | `Users.google_id` NOT NULL | 명단을 먼저 넣고 첫 로그인 때 `sub`를 채우므로 처음엔 값이 없음 | `google_id` NULL 허용 (UNIQUE 유지) |
| 프로필 | 사진·링크 컬럼 없음 | 로그인 프로필 사진, GitHub·LinkedIn 링크 | `Users.profile_image_url`, `Students.github_url`, `Students.linkedin_url` |
| 교사 정보 | 교사 전용 테이블 없음 | 자진 신고 담임 기본 수신자, 교사 검색(과목·직책) | `Teachers`(`teacher_id` FK, `subject`, `position`, `homeroom_grade`, `homeroom_class`) |
| 마역량 총점 | 영역별 점수만 있음 | 랭킹 정렬 성능 | 5개 영역 합으로 계산하거나 `total_meister_points` 컬럼 추가 |
| 평가항목·환산 기준 | `score_type`만 있음 | 최대 인정 점수 검증, 환산 등급 표시 | `MeisterScoreItems`(`item_id`, `score_type`, `name`, `max_points`), `MeisterGradeCriteria`, `MeisterScoreDetails.item_id` |
| 증빙자료 | 테이블 없음 | 증빙 제출·AI 분석·승인/반려 | `Evidences`(`evidence_id`, `student_id`, `file_url`, `status`, `ai_result` JSON, `reject_reason`, `reviewed_by`, `reviewed_at`, `created_at`), `MeisterScoreDetails.evidence_id` |
| 상벌점 기준 | 테이블 없음 | 상벌점 기준 조회 | `PointRules`(`rule_id`, `type`, `category`, `title`, `points`, `description`, `note`, `is_active`) |
| 상벌점 구분 | `points` 하나, `total_merit_points` 하나 | 상점·벌점 분리 합계 | `points` 부호(상점 +, 벌점 −)로 구분하고 합계는 내역에서 계산, 또는 `type` 컬럼 추가 |
| 대회 구분·카테고리 | `scope` 없음, 카테고리 대신 N:M 태그만 있음 | 교내/교외 필터, 카테고리 단일 선택 | `Contests.scope`, `Contests.category_id` FK, `ContestCategories`(`category_id`, `name`, `normalized_name` UK, `is_default`, `created_by`, `created_at`). `ContestTags`는 분야 태그로 유지 |
| 대회 추천 정보 | 없음 | 예상 점수·난이도·준비 기간·효율 점수 | `Contests`에 `expected_score`, `difficulty`, `prep_hours`, `is_verified` 추가 |
| 학사 일정 | 없음 | 대회 추천 시 시험 기간 경고 | `AcademicSchedules`(`schedule_id`, `type`, `title`, `start_date`, `end_date`) |
| 자진 신고 | `content` 100자, `is_processed`만 있음 | 유형·제목·2,000자 내용·수신자·첨부·상태 4단계 | `SelfReport`에 `type`, `title`, `preferred_handling`, `status`, `change_reason`, `updated_at` 추가, `content` TEXT(암호화). `SelfReportRecipients`, `SelfReportAttachments`, `SelfReportReplies` 추가 |
| 테마 | 없음 | 계정별 테마 동기화 | `UserThemes`(`user_id` PK, 배경·폰트 설정), `ThemeAssets`(업로드 파일) |
| 알림 | 없음 | 증빙 처리·점수 변경·자진 신고 알림 | `Notifications`(`notification_id`, `user_id`, `type`, `title`, `body`, `target_url`, `is_read`, `created_at`) |
| 뽑기 이력 | 없음 | 자리 배치 히스토리, 직전 자리 중복 방지, 시드 검증 | `Draws`(`draw_id`, `type`, `grade`, `class_no`, `seed`, `options` JSON, `result` JSON, `created_by`, `created_at`) |
| 오탈자 | `MeisterScoreDetails.mesiter_point_id` | - | `meister_point_id`로 수정 |

**임의로 정한 값**

- 응답 래퍼 없이 리소스를 그대로 반환하는 형식, 오류 `code` 이름은 임시로 정했습니다.
- 대회 추천·파일 업로드 요청 제한 값은 임시값입니다.
- 마역량 영역의 한글 이름은 일반적인 마이스터고 역량 영역 명칭을 기준으로 붙였으며, 학교 기준표에 맞춰야 합니다.