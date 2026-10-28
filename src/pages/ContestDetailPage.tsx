/* 대회 상세 · 수정 · 삭제 · 북마크 (docs/api/06-contests.md 2.4~2.7) */
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { dDayLabel, deleteContest, getContest, setBookmark, shortDateTime, updateContest, type ContestDetail } from '../api/contests';
import { errorMessage } from '../api/client';
import { CONTEST_SCOPE_LABEL } from '../api/types';
import { useAsync } from '../lib/useAsync';
import { useMe } from '../lib/session';
import { useToast } from '../components/Toast';
import ContestForm from '../components/ContestForm';
import { BookmarkIcon } from '../components/ContestIcons';
import './ContestDetailPage.css';

export default function ContestDetailPage() {
  const { contestId = '' } = useParams();
  const me = useMe();
  const navigate = useNavigate();
  const { toast, show } = useToast();
  const { state, setData } = useAsync((s) => getContest(contestId, s), [contestId]);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const back = <Link to="/contests" className="cd-back">‹ 대회 목록</Link>;

  if (state.status === 'loading') return <main className="page">{back}<p className="status-msg">불러오는 중…</p></main>;
  if (state.status === 'error') {
    return (
      <main className="page">
        {back}
        <p className="status-msg">{state.code === 404 ? '대회를 찾을 수 없습니다. 삭제되었거나 주소가 잘못되었습니다.' : `정보를 불러오지 못했습니다. (${state.message})`}</p>
      </main>
    );
  }

  const c = state.data;
  const canEdit = me.role === 'ADMIN' || (me.role === 'TEACHER' && c.author.userId === me.userId);
  const student = me.role === 'STUDENT';

  async function toggleBookmark() {
    const on = !c.isBookmarked;
    setData((d) => ({ ...d, isBookmarked: on }));
    try {
      await setBookmark(c.contestId, on);
      show(on ? '북마크했습니다.' : '북마크를 해제했습니다.');
    } catch (e) {
      setData((d) => ({ ...d, isBookmarked: !on }));
      show(errorMessage(e));
    }
  }

  async function remove() {
    if (!window.confirm(`'${c.contestName}' 대회를 삭제할까요?\n북마크도 함께 삭제되며 되돌릴 수 없습니다.`)) return;
    setBusy(true);
    try {
      await deleteContest(c.contestId);
      navigate('/contests', { replace: true, state: { toast: `'${c.contestName}' 대회를 삭제했습니다.` } });
    } catch (e) {
      show(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <main className="page">
      {back}
      {editing ? (
        <ContestForm
          initial={c}
          onSubmit={(input) => updateContest(c.contestId, input)}
          onCancel={() => setEditing(false)}
          onToast={show}
          onDone={(updated: ContestDetail) => {
            setData(() => updated);
            setEditing(false);
            show('대회 정보를 수정했습니다.');
          }}
        />
      ) : (
        <>
          <header className="cd-head">
            <div className="cd-chips">
              <span className={`chip ${c.scope === 'IN_SCHOOL' ? 'chip-dark' : 'chip-accent'}`}>{CONTEST_SCOPE_LABEL[c.scope]}</span>
              <span className="chip">{c.category.name}</span>
              <span className={`mono cd-dday ${c.dDay < 0 ? 'muted' : c.dDay <= 7 ? 'minus' : 'accent'}`}>{dDayLabel(c.dDay)}</span>
            </div>
            <h1 className="page-title cd-title">{c.contestName}</h1>
            <div className="cd-actions">
              {student && (
                <button type="button" className={`btn cd-bm ${c.isBookmarked ? 'is-on' : ''}`} aria-pressed={c.isBookmarked} onClick={toggleBookmark}>
                  <BookmarkIcon on={c.isBookmarked} /> {c.isBookmarked ? '북마크됨' : '북마크'}
                </button>
              )}
              {canEdit && (
                <>
                  <button type="button" className="btn" onClick={() => setEditing(true)}>수정</button>
                  <button type="button" className="btn text-minus" disabled={busy} onClick={remove}>{busy ? '삭제 중…' : '삭제'}</button>
                </>
              )}
            </div>
          </header>

          <dl className="card cd-meta">
            <div><dt>기간</dt><dd className="mono">{shortDateTime(c.startAt)} – {shortDateTime(c.finishAt)}</dd></div>
            <div><dt>마감</dt><dd>{c.dDay < 0 ? '종료된 대회' : c.dDay === 0 ? '오늘 마감' : `${c.dDay}일 남음`}</dd></div>
            <div><dt>분야</dt><dd>{c.tags.length ? <span className="cd-tags">{c.tags.map((t) => <span key={t} className="chip chip-line">{t}</span>)}</span> : <span className="muted">없음</span>}</dd></div>
            <div><dt>등록</dt><dd>{c.author.name}</dd></div>
          </dl>

          <article className="card cd-body">
            <h2 className="sr-only">대회 안내</h2>
            <p>{c.content}</p>
          </article>
        </>
      )}
      {toast}
    </main>
  );
}
