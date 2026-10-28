# BSM 마이스터

부산소프트웨어마이스터고 마이스터 역량 · 상벌점 · 대회 관리 웹 (Vite + React + TypeScript).

## 실행

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # dist/ 생성
```

`.env.example`을 `.env`로 복사해서 설정합니다. `VITE_API_BASE_URL`이 비어 있으면 **목업 데이터**로 모든 화면이 동작합니다.
목업 사용자는 모든 메뉴를 볼 수 있도록 교사 권한입니다 (`src/api/me.ts`의 `role`을 `'student'`로 바꾸면 학생 화면).

## 화면

| 경로 | 화면 |
|---|---|
| `/login` | 로그인 (학교 구글 계정) |
| `/ranking` | 점수 랭킹 |
| `/students/me`, `/students/:학번` | 내 역량 / 학생 상세 |
| `/rules` | 상벌점 기준 조회 |
| `/contests` | 대회 + AI 추천 · 질문, 대회 등록(교사) |
| `/reports` | 자진 신고 |
| `/draw` | 뽑기 (자리뽑기 — 핀볼은 준비 중) |
| `/grading` | 점수 부여 (교사: 증빙 검토 + AI 분석, 직접 부여) |
| `/settings` | 프로필 링크, 테마 |

## 구조

```
src/
  api/          백엔드 호출 함수 + 목업 데이터 (화면별 1파일)
  components/   헤더, 레이아웃, 내 역량(MeisterDetail), 아이콘 등 공용
  pages/        화면별 컴포넌트 + CSS
  lib/          공용 훅(useAsync), 포맷, 시드 난수, 테마, 링크 검증
  styles/       전역 디자인 토큰 (:root)
```

## 백엔드 연동

`.env`에 `VITE_API_BASE_URL=https://api.example.com`을 넣으면 목업 대신 아래 엔드포인트를 호출합니다.
응답 모양은 각 `src/api/*.ts`의 타입이 기준이고, 다르면 그 파일에서 변환만 추가하면 됩니다.

| 기능 | 메서드 · 경로 |
|---|---|
| 로그인 | `GET /auth/google` (리다이렉트), 실패 시 `/login?error=domain\|unregistered`로 돌려보내기 |
| 로그아웃 | `POST /auth/logout` |
| 내 정보 | `GET /me` (401이면 로그인 화면으로 이동) |
| 알림 | `GET /notifications`, `POST /notifications/read` |
| 랭킹 | `GET /ranking?grade=&page=&size=` |
| 학생 상세 | `GET /students/:id/meister` |
| 상벌점 기준 | `GET /rules` |
| 대회 | `GET /contests`, `POST /contests`, `GET /contests/recommendations?mode=value\|high\|short` |
| 대회 질문 (LLM) | `POST /contests/ask` `{ question }` |
| 자진 신고 | `GET /reports/mine`, `POST /reports`, `PUT /reports/:id` (multipart: `data` JSON + `files`), `DELETE /reports/:id` |
| 뽑기 | `GET /draw/classes`, `POST /draw/classes/:id/results` |
| 점수 부여 | `GET /grading/queue`, `POST /grading/submissions/:id/approve`, `POST /grading/submissions/:id/reject`, `POST /grading/grants` |
| 프로필 링크 | `GET /me/links`, `PUT /me/links` |

- 백엔드 CORS에서 배포 도메인을 허용해야 합니다. 쿠키 세션이면 `src/api/client.ts`의 `credentials`를 `'include'`로 바꾸세요.
- 로컬에서는 `VITE_API_BASE_URL=/api`, `VITE_API_PROXY=http://localhost:8080` 으로 프록시를 써도 됩니다.

## LLM 연동

대회 질문(`/contests/ask`), 대회 추천, 증빙자료 AI 분석(`Submission.ai`, OCR · LLM)은 **모두 백엔드에서** LLM을 호출해야 합니다.
API 키를 프론트 코드에 넣으면 브라우저에서 그대로 노출됩니다. 프론트는 결과만 받아서 보여줍니다.

## 배포 (Vercel)

1. GitHub에 올린 뒤 Vercel에서 Import (Framework: Vite 자동 인식)
2. Environment Variables에 `VITE_API_BASE_URL` 추가 (없으면 목업으로 배포됨)
3. `vercel.json`이 SPA 라우팅(새로고침 404 방지)을 처리합니다.

다른 호스팅도 빌드 명령 `npm run build`, 출력 폴더 `dist`, 모든 경로 → `/index.html` 리라이트만 맞추면 됩니다.
