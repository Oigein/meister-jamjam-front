import { useCallback, useEffect, useState, type DependencyList } from 'react';
import { ApiError } from '../api/client';

export type AsyncState<T> =
  | { status: 'loading' }
  | { status: 'error'; message: string; code?: number }
  | { status: 'ok'; data: T };

/* 데이터 로딩 공통 훅. deps가 바뀌어도 이전 데이터는 새 응답이 올 때까지 유지 (페이지 넘길 때 깜빡임 방지) */
export function useAsync<T>(fn: (signal: AbortSignal) => Promise<T>, deps: DependencyList) {
  const [state, setState] = useState<AsyncState<T>>({ status: 'loading' });

  useEffect(() => {
    const ctrl = new AbortController();
    fn(ctrl.signal)
      .then((data) => { if (!ctrl.signal.aborted) setState({ status: 'ok', data }); })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        setState({
          status: 'error',
          message: e instanceof Error ? e.message : '알 수 없는 오류',
          code: e instanceof ApiError ? e.status : undefined,
        });
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const setData = useCallback((f: (d: T) => T) => {
    setState((s) => (s.status === 'ok' ? { status: 'ok', data: f(s.data) } : s));
  }, []);

  return { state, setData };
}
