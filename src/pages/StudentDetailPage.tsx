import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import MeisterDetail, { type MeisterDetailProps } from '../components/MeisterDetail';
import { getMeisterDetail } from '../api/students';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ok'; data: MeisterDetailProps };

export default function StudentDetailPage() {
  const { id = 'me' } = useParams();
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    const ctrl = new AbortController();
    setState({ status: 'loading' });
    getMeisterDetail(id, ctrl.signal)
      .then((data) => setState({ status: 'ok', data }))
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        setState({ status: 'error', message: e instanceof Error ? e.message : '알 수 없는 오류' });
      });
    return () => ctrl.abort();
  }, [id]);

  if (state.status === 'loading') return <p className="page-msg">불러오는 중…</p>;
  if (state.status === 'error') return <p className="page-msg">정보를 불러오지 못했습니다. ({state.message})</p>;
  return <MeisterDetail {...state.data} />;
}
