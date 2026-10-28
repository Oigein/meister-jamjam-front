import { Outlet } from 'react-router-dom';
import { getMe } from '../api/me';
import { useAsync } from '../lib/useAsync';
import { SessionProvider } from '../lib/session';
import { ThemeProvider } from '../lib/theme';
import AppHeader from './AppHeader';

/* 로그인 후 화면 공통 틀: 내 계정 조회(401이면 client가 로그인 화면으로 보냄) → 테마 → 헤더 + 각 페이지 */
export default function AppLayout() {
  const { state } = useAsync((s) => getMe(s), []);

  if (state.status === 'loading') return <p className="page-msg">불러오는 중…</p>;
  if (state.status === 'error') {
    if (state.code === 401) return <p className="page-msg">로그인 화면으로 이동합니다…</p>;
    return (
      <div className="page-msg">
        <p>사용자 정보를 불러오지 못했습니다. ({state.message})</p>
        <p><button type="button" className="btn" onClick={() => location.reload()}>다시 시도</button></p>
      </div>
    );
  }
  return (
    <SessionProvider value={state.data}>
      <ThemeProvider>
        <AppHeader me={state.data} />
        <Outlet />
      </ThemeProvider>
    </SessionProvider>
  );
}
