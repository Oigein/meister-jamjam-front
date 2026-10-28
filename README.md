# BSM 마이스터 (마이스터 잼잼 프론트엔드)

부산소프트웨어마이스터고 마이스터 역량 · 상벌점 · 대회 · 자진 신고 웹 (Vite + React + TypeScript).
API 명세는 [docs/api](docs/api)에 있고, 프론트는 이 명세를 기준으로 만들어져 있습니다.

## 실행

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # dist/ 생성
```

기본값은 **목업 모드**입니다. 백엔드 없이도 `src/api/mock`의 가짜 서버가 명세대로 응답해서 모든 화면이 동작합니다.
목업에서 역할(학생 · 교사 · 관리자)은 **설정 → 목업 역할**에서 바꿀 수 있습니다.

## 백엔드 연동

`.env.example`을 `.env`로 복사한 뒤:

```bash
VITE_USE_MOCK=false
VITE_API_PROXY=http://localhost:8080   # 로컬 백엔드 주소
```

- 프론트는 명세의 경로(`/api/...`, `/auth/...`)를 그대로 호출합니다. Vite 개발 서버가 이 두 경로를 `VITE_API_PROXY`로 넘겨줍니다.
- 인증은 **세션 쿠키(`SameSite=Lax`)** 라서 프론트와 백엔드가 같은 도메인처럼 보여야 합니다. 그래서 프록시를 쓰는 구성을 권장합니다.
  다른 도메인으로 직접 호출하려면 `VITE_API_ORIGIN=https://api.example.com`을 넣고, 백엔드 쪽 CORS(`credentials` 허용)와 쿠키 정책을 맞춰야 합니다.
- 401을 받으면 현재 주소를 `?redirect=`로 붙여 로그인 화면으로 이동합니다. 오류 응답의 `message`는 화면에 그대로 표시합니다.

### 배포 (Vercel)

Vercel 환경변수에 `VITE_USE_MOCK=false`를 넣고, [vercel.json](vercel.json)에 백엔드로 넘기는 규칙을 **SPA 규칙보다 위에** 추가합니다.

```json
{
  "rewrites": [
    { "source": "/api/:path*", "destination": "https://백엔드주소/api/:path*" },
    { "source": "/auth/:path*", "destination": "https://백엔드주소/auth/:path*" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

구글 OAuth 콜백 주소는 `https://프론트도메인/auth/google/callback`으로 등록하면 됩니다.

## 구조

```
src/
  api/            명세의 엔드포인트별 타입 + 호출 함수 (client.ts가 공통 처리)
  api/mock/       목업 서버 (db.ts 공용 데이터, handlers/ 도메인별 핸들러) — 목업 모드에서만 번들에 포함
  components/     헤더, 레이아웃, 공용 컴포넌트
  pages/          화면
  lib/            훅·유틸, 테마
  styles/         전역 디자인 토큰 (:root)
```

## LLM 연동

대회 추천, 추천 대화, 증빙자료 AI 분석(OCR · LLM)은 모두 **백엔드가** LLM을 호출합니다 (API 키를 프론트에 두지 않음).
추천 대화는 `Accept: text/event-stream` 스트리밍을 지원합니다.
