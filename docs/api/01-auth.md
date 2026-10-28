## 1. 개요

- **관련 기능 명세**:  로그인 (1)
- **공통 규칙**: [[API] 공통 규칙](https://app.notion.com/p/API-40762fa2a99981e186b3fcbdaac53457?pvs=21)
- **방식**: 학교 구글 계정(`@bssm.hs.kr`)으로 OAuth 2.0 / OpenID Connect (Authorization Code + PKCE)
- **만들지 않는 API**: 회원가입, 아이디·비밀번호 로그인, 비밀번호 찾기·변경 (`/signup`, `/auth/password` 등 경로 없음)

| **Method** | **URL** | **권한** | **설명** |
| --- | --- | --- | --- |
| GET | `/auth/google` | 비로그인 | 구글 로그인 시작 (구글로 리다이렉트) |
| GET | `/auth/google/callback` | 비로그인 | 구글 인증 결과 처리 및 세션 발급 |
| POST | `/auth/logout` | 로그인 | 로그아웃 |
| GET | `/api/me` | 로그인 | 내 계정 정보 조회 (헤더 프로필, 역할 판단용) |

## 2. 상세 API

### 2.1. 구글 로그인 시작

| **구분** | **내용** |
| --- | --- |
| **Method / URL** | `GET /auth/google` |
| **권한** | 비로그인 |
| **설명** | 서버가 `state`, `nonce`, PKCE `code_verifier`를 만들어 임시 세션에 저장하고 구글 인증 화면으로 이동시킴 |

**Query Parameter**

| **이름** | **타입** | **필수** | **설명** |
| --- | --- | --- | --- |
| `redirect` | string | N | 로그인 뒤 돌아갈 서비스 내부 경로 (예: `/students/7b0c…`). `/`로 시작하는 내부 경로만 허용하고 그 외 값(외부 URL 등)은 무시 |

**Response**

- `302 Found` → `https://accounts.google.com/o/oauth2/v2/auth`
- 붙는 값: `scope=openid email profile`, `hd=bssm.hs.kr`, `prompt=select_account`, `code_challenge`(S256), `state`, `nonce`
- 요청 과다: `429` (IP당 분당 20회)

### 2.2. 구글 콜백

| **구분** | **내용** |
| --- | --- |
| **Method / URL** | `GET /auth/google/callback?code={code}&state={state}` (사용자가 취소하면 `?error=access_denied`) |
| **권한** | 비로그인 |
| **처리 순서** | 1. `state` 일치 확인
2. `code`  • `code_verifier`로 구글 토큰 요청
3. ID 토큰 검증: 서명, `iss`, `aud`, `exp`, `nonce`
4. 도메인 검사: `email_verified = true`, `hd = bssm.hs.kr`, 이메일이 `@bssm.hs.kr`로 끝남 (요청의 `hd`는 힌트일 뿐이므로 반드시 토큰에서 다시 검사)
5. `sub`로 `Users.google_id` 조회 → 없으면 이메일로 사전 등록 명단 조회 후 `sub` 저장, 이름·사진 갱신
6. 세션 발급 후 이동 |

**Response**

| **결과** | **응답** |
| --- | --- |
| 성공 | `302` → `redirect` 경로, 없으면 `/ranking`
`Set-Cookie: SESSION=…; HttpOnly; Secure; SameSite=Lax; Max-Age=604800` |
| 사용자가 구글 동의 취소 | `302` → `/login` (오류 코드 없음, 안내 문구 없음) |
| 학교 도메인이 아닌 계정 | `302` → `/login?error=DOMAIN_NOT_ALLOWED` |
| 명단에 없는 학교 계정 | `302` → `/login?error=NOT_REGISTERED` |
| `state` 불일치, 토큰 검증 실패 | `302` → `/login?error=AUTH_FAILED` |
| 구글 서버 오류·지연 | `302` → `/login?error=GOOGLE_UNAVAILABLE` |

**오류 코드별 화면 문구**

| **error** | **문구** |
| --- | --- |
| `DOMAIN_NOT_ALLOWED` | 학교 구글 계정(@bssm.hs.kr)으로 로그인해 주세요. |
| `NOT_REGISTERED` | 등록되지 않은 계정입니다. 담당 선생님께 문의하세요. |
| `AUTH_FAILED` | 로그인 중 문제가 발생했습니다. 다시 시도하세요. |
| `GOOGLE_UNAVAILABLE` | 로그인 중 문제가 발생했습니다. 다시 시도하세요. + [다시 시도] |

### 2.3. 로그아웃

| **구분** | **내용** |
| --- | --- |
| **Method / URL** | `POST /auth/logout` |
| **권한** | 로그인 (세션이 없어도 같은 응답) |
| **설명** | 서버 세션 삭제 + 쿠키 제거. 프론트는 응답 후 로그인 화면으로 이동 |
| **Response** | `204 No Content`, `Set-Cookie: SESSION=; Max-Age=0` |

### 2.4. 내 계정 정보 조회

| **구분** | **내용** |
| --- | --- |
| **Method / URL** | `GET /api/me` |
| **권한** | 로그인 |
| **설명** | 앱 진입 시 로그인 여부와 역할 확인, 헤더 우측 프로필 사진·이름 표시, 랭킹의 "나" 강조에 사용 |

**Response 200**

```json
{
  "userId": "7b0c2f9e-1a2b-4c3d-9e8f-001122334455",
  "name": "홍길동",
  "email": "s2401@bssm.hs.kr",
  "role": "STUDENT",
  "profileImageUrl": "https://lh3.googleusercontent.com/a/...",
  "student": { "grade": 2, "classNo": 1, "number": 5 }
}
```

- 교사·관리자는 `student`가 `null`
- `401`: 세션 없음·만료 → 프론트는 현재 주소를 `redirect`로 붙여 로그인 화면 이동

## 3. DB 매핑 및 보완 필요 사항

| **항목** | **내용** |
| --- | --- |
| `Users.google_id` | 구글 `sub` 저장. 기준 키. 사전 등록 시점엔 값이 없으므로 **NULL 허용 필요** (UNIQUE 유지) |
| `Users.email` | 명단 조회용 보조 값 |
| `Users.role` | `/api/me`의 `role` |
| 학번 | `Students`에 `grade`, `class_no`, `student_number` 추가 필요 |
| 프로필 사진 | `Users.profile_image_url` 추가 필요 |
| 세션 | DB 설계에 없음. Redis 또는 `Sessions` 테이블에 저장 (유효기간 7일, 사용 시 갱신) |
| 구글 토큰 | 로그인 확인에만 쓰고 저장하지 않음 |

**임의로 정한 값**

- 로그인 후 기본 이동 경로는 기능 명세에 맞춰 `/ranking`으로 정했습니다.
- `/login?error=`의 오류 코드 이름은 임시값입니다.
- `GET /api/me`는 기능 명세에 직접 나오지 않지만 헤더 프로필 표시와 "나" 강조에 필요해 추가했습니다.