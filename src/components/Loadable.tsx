import type { ReactNode } from 'react';
import type { AsyncState } from '../lib/useAsync';

export function Loadable<T>({ state, children }: { state: AsyncState<T>; children: (data: T) => ReactNode }) {
  if (state.status === 'loading') return <p className="status-msg">불러오는 중…</p>;
  if (state.status === 'error') return <p className="status-msg">정보를 불러오지 못했습니다. ({state.message})</p>;
  return <>{children(state.data)}</>;
}
