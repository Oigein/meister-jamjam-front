import { Navigate, Outlet } from 'react-router-dom';
import { getMe } from '../api/me';
import { useAsync } from '../lib/useAsync';
import { SessionProvider } from '../lib/session';
import AppHeader from './AppHeader';

/* 로그인 후 화면 공통 틀: 사용자 정보 로딩 → 헤더 + 각 페이지 */
export default function AppLayout() {
  const { state } = useAsync((s) => getMe(s), []);

  if (state.status === 'loading') return <p className="page-msg">불러오는 중…</p>;
  if (state.status === 'error') {
    if (state.code === 401) return <Navigate to="/login" replace />;
    return <p className="page-msg">사용자 정보를 불러오지 못했습니다. ({state.message})</p>;
  }
  return (
    <SessionProvider value={state.data}>
      <AppHeader me={state.data} />
      <Outlet />
    </SessionProvider>
  );
}
