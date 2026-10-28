## 1. 개요

- **관련 기능 명세**: 대회 정보 카테고리 분류 (1)
- **공통 규칙**: [[API] 공통 규칙](https://app.notion.com/p/API-40762fa2a99981e186b3fcbdaac53457?pvs=21)
- **목적**: 교사가 대회를 교내/교외 + 카테고리로 분류해 등록하고, 학생은 분류별로 조회·북마크. 기본 카테고리는 시드로 넣고 "＋ 추가"로 새 카테고리를 만듦

| **Method** | **URL** | **권한** | **설명** |
| --- | --- | --- | --- |
| GET | `/api/contest-categories` | 로그인 | 카테고리 목록 |
| POST | `/api/contest-categories` | 교사 | 카테고리 추가 ("＋ 추가") |
| GET | `/api/contests` | 로그인 | 대회 목록 (구분·카테고리 필터) |
| GET | `/api/contests/{contestId}` | 로그인 | 대회 상세 |
| POST | `/api/contests` | 교사 | 대회 등록 |
| PUT | `/api/contests/{contestId}` | 작성 교사·관리자 | 대회 수정 |
| DELETE | `/api/contests/{contestId}` | 작성 교사·관리자 | 대회 삭제 (DB 기반 도출) |
| PUT | `/api/contests/{contestId}/bookmark` | 학생 | 북마크 추가 (DB 기반 도출) |
| DELETE | `/api/contests/{contestId}/bookmark` | 학생 | 북마크 해제 (DB 기반 도출) |
| GET | `/api/me/bookmarks` | 학생 | 내 북마크 대회 목록 (DB 기반 도출) |

## 2. 상세 API

### 2.1. 카테고리 목록

| **구분** | **내용** |
| --- | --- |
| **Method / URL** | `GET /api/contest-categories` |
| **권한** | 로그인 |
| **설명** | 등록 폼 드롭다운과 목록 화면 필터에 사용. "＋ 추가"는 프론트가 등록 폼에서만 덧붙임 |
| **정렬** | 기본 카테고리(시드 순서) → 추가 카테고리(가나다순) |

```json
{
  "items": [
    { "categoryId": 1, "name": "공모전", "isDefault": true },
    { "categoryId": 2, "name": "경진대회", "isDefault": true },
    { "categoryId": 3, "name": "해커톤", "isDefault": true },
    { "categoryId": 9, "name": "아이디어톤", "isDefault": false }
  ]
}
```

### 2.2. 카테고리 추가

| **구분** | **내용** |
| --- | --- |
| **Method / URL** | `POST /api/contest-categories` |
| **권한** | 교사 |
| **Request** | `{ "name": "아이디어톤" }` |
| **입력 조건** | 앞뒤 공백 제거 후 1~20자, 한글·영문·숫자·공백·  `• · & ( )`만 허용 |
| **중복 판정** | 공백 제거 + 영문 소문자화한 `normalized_name`이 같으면 같은 카테고리 (`해 커 톤` = `해커톤`) |
| **처리 순서** | 권한 확인 → 입력 재검사 → `normalized_name`으로 조회 → 없으면 저장. 동시 요청으로 UNIQUE 충돌이 나면 기존 행을 다시 읽어 `200` |

**Response**

| **상황** | **응답** |
| --- | --- |
| 새로 저장 | `201`, `{ "categoryId": 9, "name": "아이디어톤", "isDefault": false, "created": true }` |
| 이미 있음 | `200`, 기존 카테고리 + `"created": false` → 토스트 "이미 있는 카테고리 '해커톤'을 선택했습니다." |
| 검사 실패 | `400 VALIDATION_FAILED`, `fieldErrors[].reason`: `EMPTY` / `TOO_LONG` / `INVALID_CHARACTER` |
| 교사 아님 | `403` |

### 2.3. 대회 목록

| **구분** | **내용** |
| --- | --- |
| **Method / URL** | `GET /api/contests?scope=&categoryId=&page=` |
| **권한** | 로그인 (교사·학생) |
| **정렬** | 마감(`finishAt`)이 가까운 순, 종료된 대회는 뒤로 |

| **이름** | **타입** | **필수** | **설명** |
| --- | --- | --- | --- |
| `scope` | ContestScope | N | 생략하면 전체 |
| `categoryId` | int | N | 생략하면 전체 |
| `page` | int | N | 기본 1, 페이지당 20건 |

```json
{
  "items": [
    {
      "contestId": 42,
      "contestName": "부산 SW 해커톤",
      "scope": "OUT_SCHOOL",
      "category": { "categoryId": 3, "name": "해커톤" },
      "tags": ["백엔드", "AI"],
      "startAt": "2026-11-14T09:00:00+09:00",
      "finishAt": "2026-11-15T18:00:00+09:00",
      "dDay": 16,
      "isBookmarked": false
    }
  ],
  "page": 1, "size": 20, "totalElements": 1, "totalPages": 1
}
```

- 결과가 없으면 `items: []` → "조건에 맞는 대회가 없습니다." + [필터 초기화]
- 없는 `categoryId`, 잘못된 `scope`는 `400`
- `isBookmarked`는 학생일 때만 의미 있음 (교사는 항상 `false`)

### 2.4. 대회 상세

- `GET /api/contests/{contestId}` → 목록 항목 + `content`(본문), `author`(`userId`, `name`)
- 없는 대회 `404 CONTEST_NOT_FOUND`

### 2.5. 대회 등록·수정

| **구분** | **내용** |
| --- | --- |
| **Method / URL** | `POST /api/contests` / `PUT /api/contests/{contestId}` |
| **권한** | 등록: 교사 / 수정: 작성 교사·관리자 |
| **서버 검증** | 교사 권한, `scope` 값, `categoryId` 존재 여부, 길이, 날짜 순서 |

```json
{
  "contestName": "부산 SW 해커톤",
  "content": "대회 안내 본문...",
  "scope": "OUT_SCHOOL",
  "categoryId": 3,
  "tagIds": [4, 7],
  "startAt": "2026-11-14T09:00:00+09:00",
  "finishAt": "2026-11-15T18:00:00+09:00"
}
```

| **필드** | **필수** | **제약** |
| --- | --- | --- |
| `contestName` | Y | 1~30자 |
| `content` | Y | 1자 이상 |
| `scope` | Y | `IN_SCHOOL` / `OUT_SCHOOL`, 기본값 없음 |
| `categoryId` | Y | 존재하는 카테고리 |
| `tagIds` | N | 분야 태그 (`ContestTags`) |
| `startAt`, `finishAt` | Y | `startAt` ≤ `finishAt` |
- 성공: 등록 `201` + `Location: /api/contests/{contestId}`, 수정 `200`. 본문은 2.4 상세와 같은 형식
- 오류: `400`(필드별 `fieldErrors`), `403`, `404`(수정 대상·카테고리 없음)
- 프론트는 "＋ 추가" 입력창이 열려 있으면 요청을 보내지 않고 "추가 중인 카테고리를 확인하거나 취소하세요." 표시

### 2.6. 대회 삭제 (DB 기반 도출)

- `DELETE /api/contests/{contestId}` → `204`
- `ContestBookmarks`, `ContestTaggings`의 관련 행도 함께 삭제 (하나의 트랜잭션)

### 2.7. 북마크 (DB 기반 도출)

| **구분** | **내용** |
| --- | --- |
| **추가** | `PUT /api/contests/{contestId}/bookmark` → `204` (이미 있어도 `204`) |
| **해제** | `DELETE /api/contests/{contestId}/bookmark` → `204` (없어도 `204`) |
| **목록** | `GET /api/me/bookmarks?page=` → 2.3과 같은 목록 형식 |
| **권한** | 학생 (`ContestBookmarks.student_id`가 `Students`를 참조하므로) |
| **오류** | 없는 대회 `404`, 학생 아님 `403` |

## 3. DB 매핑 및 보완 필요 사항

| **항목** | **내용** |
| --- | --- |
| 대회 | `Contests` (`contest_name` 30자, `content`, `start_at`, `finish_at`, `author`) |
| 교내/교외 | `Contests.scope` ENUM 추가 필요 |
| 카테고리 | 기능 명세는 단일 선택이지만 DB는 N:M 태그(`ContestTags`)만 있음 → `ContestCategories`(`category_id`, `name`, `normalized_name` UK, `is_default`, `created_by`, `created_at`) + `Contests.category_id` FK 추가 |
| 분야 태그 | `ContestTags` / `ContestTaggings`는 추천 카드의 [분야 태그]용으로 유지. `tag_name` 10자 |
| 북마크 | `ContestBookmarks` (PK: `student_id`  • `contest_id`) |
| 작성자 | `Contests.author`가 `Users`를 참조하도록 FK 추가 권장 |

**임의로 정한 값**

- 카테고리는 새 테이블로 두고, 기존 태그는 분야 태그로 쓰는 것으로 정했습니다. 태그를 카테고리로 쓸 경우 `tag_name` 길이(10자)와 기능 명세(20자)를 맞춰야 합니다.
- 수정·삭제 권한은 작성 교사와 관리자로 정했습니다.
- 대회 삭제와 북마크 API는 기능 명세에 없고 DB에서 도출했습니다. 추가 카테고리 수정·삭제는 기능 명세대로 MVP에서 제외했습니다.