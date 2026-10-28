## 1. 개요

- **관련 기능 명세**: 프로필에 깃허브 & 링크드인 링크 (1)
- **공통 규칙**: [[API] 공통 규칙](https://app.notion.com/p/API-40762fa2a99981e186b3fcbdaac53457?pvs=21)
- **목적**: 학생이 프로필에 GitHub·LinkedIn 주소를 등록·수정·삭제. 입력값은 서버가 표준 URL로 정리해 저장

| **Method** | **URL** | **권한** | **설명** |
| --- | --- | --- | --- |
| GET | `/api/me/profile` | 로그인(본인) | 내 링크 조회 |
| PATCH | `/api/me/profile` | 학생(본인) | 내 링크 저장·삭제 |
| GET | `/api/students/{studentId}` | 로그인 | 다른 학생 링크 조회 (`[API] 마역량 세부 조회` 2.1) |

## 2. 상세 API

### 2.1. 내 프로필 링크 조회

| **구분** | **내용** |
| --- | --- |
| **Method / URL** | `GET /api/me/profile` |
| **권한** | 로그인 (대상은 항상 세션의 본인) |
| **Response 200** | `{ "githubUrl": "https://github.com/octocat", "linkedinUrl": null }` |

### 2.2. 내 프로필 링크 저장·삭제

| **구분** | **내용** |
| --- | --- |
| **Method / URL** | `PATCH /api/me/profile` |
| **권한** | 학생. 요청에 학생 ID를 받지 않고 세션의 본인 계정만 수정 |
| **처리 순서** | 로그인 확인 → 보낸 필드마다 정규화를 처음부터 다시 검사 → 두 필드를 한 번에 저장 (하나라도 실패하면 둘 다 저장 안 함) |

**Request Body**

```json
{
  "githubUrl": "@octocat",
  "linkedinUrl": null
}
```

| **필드 상태** | **의미** |
| --- | --- |
| 값 있음 | 정규화 후 저장 |
| `null` 또는 빈 문자열 | 삭제 |
| 키를 보내지 않음 | 변경 없음 |

**정규화 규칙**

| **구분** | **내용** |
| --- | --- |
| **허용 입력** | 전체 URL, 도메인 포함 주소, 아이디 (`octocat`, `@octocat`, `github.com/octocat`) |
| **처리 순서** | 1. 앞뒤 공백 제거
2. 앞의 `@` 제거, 스킴이 없으면 `https://` 보정
3. 호스트 검사
4. 아이디 추출 (GitHub: 경로 첫 조각 / LinkedIn: `/in/` 다음 조각)
5. 아이디 형식 검사 후 표준 URL로 조립 |
| **표준 URL** | GitHub `https://github.com/{id}` / LinkedIn `https://www.linkedin.com/in/{id}` |
| **호스트** | GitHub: `github.com`, `www.github.com`만 / LinkedIn: `linkedin.com`, `*.linkedin.com`만. 정확히 일치해야 함 (`github.com.evil.com` 거부) |
| **아이디** | GitHub: 영문·숫자·`-`, 1~39자, `-`로 시작·끝 불가 / LinkedIn: 영문·숫자·`-`·`%`, 3~100자 |
| **대소문자** | 호스트만 소문자로 바꾸고 아이디는 입력 그대로 |
| **거부** | http/https 외 스킴(`javascript:`, `data:` 등), 계정 정보가 든 URL, LinkedIn 회사·학교 페이지, GitHub 시스템 경로(`settings`, `orgs` 등) |
| **존재 확인** | 하지 않음 (형식만 검사) |

**Response 200**

```json
{
  "githubUrl": "https://github.com/octocat",
  "linkedinUrl": null
}
```

- 같은 값을 다시 저장해도 `200`

**Response 400**

```json
{
  "code": "VALIDATION_FAILED",
  "message": "입력값을 확인해 주세요.",
  "fieldErrors": [
    { "field": "linkedinUrl", "reason": "NOT_PERSONAL_PROFILE", "message": "개인 프로필 주소(linkedin.com/in/아이디)를 입력하세요." }
  ]
}
```

| **reason** | **화면 문구** |
| --- | --- |
| `INVALID_HOST` | GitHub 주소가 아닙니다. / LinkedIn 주소가 아닙니다. |
| `MISSING_ID` | 아이디가 없는 주소입니다. |
| `INVALID_ID` | 아이디 형식이 올바르지 않습니다. |
| `NOT_PERSONAL_PROFILE` | 개인 프로필 주소(linkedin.com/in/아이디)를를) 입력하세요. |
| `RESERVED_PATH` | 개인 계정 주소를 입력하세요. |
| `INVALID_SCHEME` | 사용할 수 없는 주소입니다. |

**기타 응답**: 비로그인 `401` / 학생 아님 `403` / 요청 과다 `429` (분당 20회)

### 2.3. 다른 학생의 링크 조회

- 랭킹에서 학생을 누르면 `GET /api/students/{studentId}` 응답의 `githubUrl`, `linkedinUrl`로 값이 있는 링크만 아이콘 표시
- 로그인한 모든 사용자에게 공개 (비공개 옵션 없음)
- 프론트는 그리기 직전 URL이 표준 주소(`https://github.com/`, `https://www.linkedin.com/in/`)로 시작하는지 한 번 더 확인하고 `rel="noopener noreferrer"`로 새 탭 열기

## 3. DB 매핑 및 보완 필요 사항

| **항목** | **내용** |
| --- | --- |
| GitHub | `Students.github_url` VARCHAR(255) NULL 추가 필요 |
| LinkedIn | `Students.linkedin_url` VARCHAR(255) NULL 추가 필요 |

**임의로 정한 값**

- 기능 명세의 주체가 학생이므로 링크 저장은 학생만 가능하게 하고, 링크 컬럼도 `Students`에 두었습니다.
- 검증 실패 사유(`reason`) 코드 이름은 임시값입니다.