import { createContext, useContext } from 'react';
import type { Me } from '../api/me';

const SessionContext = createContext<Me | null>(null);

export const SessionProvider = SessionContext.Provider;

/* AppLayout 안쪽 화면에서만 사용 (로그인 사용자 정보) */
export function useMe() {
  const me = useContext(SessionContext);
  if (!me) throw new Error('useMe는 AppLayout 안에서만 사용할 수 있습니다.');
  return me;
}
