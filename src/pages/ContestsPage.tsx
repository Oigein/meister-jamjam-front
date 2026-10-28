/* 대회 (docs/api/06-contests.md) + 마역량 대회 추천 LLM (docs/api/08-recommend.md) */
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  createContest, dDayLabel, getCategories, getContests, getMyBookmarks, setBookmark, shortDate,
  type ContestItem,
} from '../api/contests';
import {
  MAJORS, MAJOR_LABEL, RECOMMEND_TYPES, RECOMMEND_TYPE_LABEL, chatStream, getRecommendations,
  type Major, type RecommendResponse, type RecommendType, type Recommendation,
} from '../api/recommend';
import { ApiError, errorMessage } from '../api/client';
import { CONTEST_SCOPE_LABEL, SCORE_TYPE_LABEL, type ContestScope } from '../api/types';
import { isTeacher } from '../api/me';
import { useAsync } from '../lib/useAsync';
import { useMe } from '../lib/session';
import { Loadable } from '../components/Loadable';
import { useToast } from '../components/Toast';
import ContestForm from '../components/ContestForm';
import { BookmarkIcon, Stars } from '../components/ContestIcons';
import './ContestsPage.css';

export default function ContestsPage() {
  const me = useMe();
  const teacher = isTeacher(me);
  const student = me.role === 'STUDENT';
  const { toast, show } = useToast();
  const location = useLocation();
  const navigate = useNavigate();

  // 상세 화면에서 삭제 후 돌아왔을 때의 안내
  useEffect(() => {
    const msg = (location.state as { toast?: string } | null)?.toast;
    if (msg) {
      show(msg);
      navigate(location.pathname + location.search, { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="page">
      <div>
        <p className="eyebrow">대회 정보</p>
        <h1 className="page-title">대회</h1>
      </div>

      {student && <RecommendPanel />}
      <ContestList teacher={teacher} student={student} onToast={show} />
      {toast}
    </main>
  );
}

/* ====================================================================== */
/* 맞춤 대회 추천                                                          */
/* ====================================================================== */

interface Conditions {
  major: Major | '';
  techStack: string[];
  targetScore: string;
  description: string;
  availableUntil: string;
  includeExamPeriod: boolean;
}
const COND_KEY = 'contest-rec-conditions';
const EMPTY_COND: Conditions = { major: '', techStack: [], targetScore: '', description: '', availableUntil: '', includeExamPeriod: false };
function loadConditions(): Conditions {
  try {
    const raw = localStorage.getItem(COND_KEY);
    if (raw) {
      const v = JSON.parse(raw) as Partial<Conditions>;
      return {
        ...EMPTY_COND, ...v,
        major: v.major && (MAJORS as string[]).includes(v.major) ? v.major : '',
        techStack: Array.isArray(v.techStack) ? v.techStack.filter((x) => typeof x === 'string').slice(0, 10) : [],
      };
    }
  } catch { /* 무시 */ }
  return EMPTY_COND;
}
const hasSaved = () => { try { return !!localStorage.getItem(COND_KEY); } catch { return false; } };

function RecommendPanel() {
  const [cond, setCond] = useState<Conditions>(loadConditions);
  const [open, setOpen] = useState(() => !hasSaved());
  const [stackInput, setStackInput] = useState('');
  const [stackError, setStackError] = useState('');
  const [tab, setTab] = useState<RecommendType>('VALUE');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<RecommendResponse | null>(null);
  const ctrlRef = useRef<AbortController | null>(null);

  useEffect(() => () => ctrlRef.current?.abort(), []);

  const update = <K extends keyof Conditions>(k: K, v: Conditions[K]) => setCond((c) => ({ ...c, [k]: v }));

  function addStack() {
    const v = stackInput.trim().replace(/,$/, '').trim();
    if (!v) return;
    if (v.length > 30) { setStackError('기술 스택은 30자 이하로 입력하세요.'); return; }
    if (cond.techStack.length >= 10) { setStackError('기술 스택은 10개까지 입력할 수 있습니다.'); return; }
    if (!cond.techStack.some((s) => s.toLowerCase() === v.toLowerCase())) update('techStack', [...cond.techStack, v]);
    setStackInput('');
    setStackError('');
  }
  function onStackKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addStack(); }
    else if (e.key === 'Backspace' && !stackInput && cond.techStack.length) update('techStack', cond.techStack.slice(0, -1));
  }

  async function run(e?: FormEvent) {
    e?.preventDefault();
    const target = cond.targetScore.trim() ? Number(cond.targetScore) : null;
    if (target !== null && (!Number.isInteger(target) || target < 1)) { setError('목표 점수는 1 이상의 정수로 입력하세요.'); return; }
    try { localStorage.setItem(COND_KEY, JSON.stringify(cond)); } catch { /* 무시 */ }
    ctrlRef.current?.abort();
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    setLoading(true);
    setError('');
    try {
      const r = await getRecommendations({
        major: cond.major || null,
        techStack: cond.techStack,
        goal: { targetScore: target, description: cond.description.trim() || null },
        availableUntil: cond.availableUntil || null,
        types: RECOMMEND_TYPES,
        includeExamPeriod: cond.includeExamPeriod,
      }, ctrl.signal);
      setResult(r);
      setOpen(false);
      // 현재 탭에 결과가 없으면 결과가 있는 첫 탭으로
      if (r.recommendations.length && !r.recommendations.some((x) => x.recommendType === tab)) {
        setTab(RECOMMEND_TYPES.find((t) => r.recommendations.some((x) => x.recommendType === t)) ?? 'VALUE');
      }
    } catch (err) {
      if (ctrl.signal.aborted) return;
      if (err instanceof ApiError && err.status === 502) setError('추천을 만들지 못했습니다. 다시 시도하세요.');
      else if (err instanceof ApiError && err.status === 429) setError(err.message || '요청이 많습니다. 잠시 후 다시 시도하세요.');
      else setError(errorMessage(err));
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }

  const recs = result?.recommendations ?? [];
  const shown = recs.filter((r) => r.recommendType === tab);
  const ctx = result?.studentContext;

  return (
    <section className="ct-rec" aria-labelledby="rec-h">
      <div className="ct-rec-head">
        <div className="ct-rec-title">
          <h2 id="rec-h">마역량 따기 좋은 대회 추천</h2>
          <p>
            {ctx
              ? <>{ctx.grade}학년 · 총점 <span className="mono">{ctx.totalScore}</span>점{ctx.weakestArea && <> · 보완할 영역 {SCORE_TYPE_LABEL[ctx.weakestArea]}</>}</>
              : '전공·기술 스택·목표를 바탕으로, 등록된 대회 중에서 추천합니다.'}
          </p>
        </div>
        {result && recs.length > 0 && (
          <div className="seg seg-accent" role="tablist" aria-label="추천 분류">
            {RECOMMEND_TYPES.map((t) => {
              const n = recs.filter((r) => r.recommendType === t).length;
              return (
                <button key={t} type="button" role="tab" aria-selected={tab === t} className={tab === t ? 'is-on' : ''} onClick={() => setTab(t)}>
                  {RECOMMEND_TYPE_LABEL[t]}<small>{n}</small>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 추천 조건 */}
      <form className="ct-cond" onSubmit={run}>
        <div className="ct-cond-bar">
          <button type="button" className="ct-cond-toggle" aria-expanded={open} aria-controls="ct-cond-body" onClick={() => setOpen(!open)}>
            <span className="ct-caret" aria-hidden="true">{open ? '▾' : '▸'}</span>추천 조건
            {!open && <span className="ct-cond-sum">{summary(cond)}</span>}
          </button>
          <button type="submit" className="btn btn-primary btn-lg ct-run" disabled={loading}>{loading ? '추천 만드는 중…' : result ? '다시 추천 받기' : '추천 받기'}</button>
        </div>
        {open && (
          <div id="ct-cond-body" className="ct-cond-body">
            <div className="field">
              <label className="label" htmlFor="ct-major">전공</label>
              <select id="ct-major" className="select" value={cond.major} onChange={(e) => update('major', e.target.value as Major | '')}>
                <option value="">선택 안 함</option>
                {MAJORS.map((m) => <option key={m} value={m}>{MAJOR_LABEL[m]}</option>)}
              </select>
            </div>
            <div className="field ct-span2">
              <label className="label" htmlFor="ct-stack"><span>기술 스택</span><span className="mono">{cond.techStack.length}/10</span></label>
              <div className="ct-tags input">
                {cond.techStack.map((s) => (
                  <span key={s} className="chip chip-accent ct-tagchip">{s}
                    <button type="button" aria-label={`${s} 삭제`} onClick={() => update('techStack', cond.techStack.filter((x) => x !== s))}>×</button>
                  </span>
                ))}
                <input id="ct-stack" value={stackInput} onChange={(e) => setStackInput(e.target.value)} onKeyDown={onStackKey} onBlur={addStack}
                  placeholder={cond.techStack.length ? '' : '예: Spring, React (Enter로 추가)'} disabled={cond.techStack.length >= 10} maxLength={40} />
              </div>
              {stackError && <p className="ct-err">{stackError}</p>}
            </div>
            <div className="field">
              <label className="label" htmlFor="ct-target">목표 점수</label>
              <input id="ct-target" className="input mono" type="number" min={1} inputMode="numeric" placeholder="20" value={cond.targetScore} onChange={(e) => update('targetScore', e.target.value)} />
            </div>
            <div className="field ct-span2">
              <label className="label" htmlFor="ct-desc"><span>목표 설명</span><span className="mono">{cond.description.length}/100</span></label>
              <input id="ct-desc" className="input" maxLength={100} placeholder="예: 이번 학기 안에 20점 필요" value={cond.description} onChange={(e) => update('description', e.target.value)} />
            </div>
            <div className="field">
              <label className="label" htmlFor="ct-until">준비 가능 날짜</label>
              <input id="ct-until" className="input mono" type="date" value={cond.availableUntil} onChange={(e) => update('availableUntil', e.target.value)} />
            </div>
            <label className="check ct-exam">
              <input type="checkbox" checked={cond.includeExamPeriod} onChange={(e) => update('includeExamPeriod', e.target.checked)} />
              시험 기간 전후 대회도 포함
            </label>
          </div>
        )}
      </form>

      {error && <p className="ct-alert" role="alert">{error}</p>}

      {result && (
        recs.length === 0 ? (
          <p className="ct-rec-empty">{result.message ?? '지금 조건에 맞는 대회가 없습니다.'}</p>
        ) : shown.length === 0 ? (
          <p className="ct-rec-empty">{RECOMMEND_TYPE_LABEL[tab]} 분류에 해당하는 대회가 없습니다. 다른 탭을 확인하세요.</p>
        ) : (
          <div className="ct-rec-grid">
            {shown.map((r) => <RecCard key={r.contestId} r={r} />)}
          </div>
        )
      )}
      {!result && !loading && !error && <p className="ct-rec-empty">조건을 확인하고 ‘추천 받기’를 누르세요. 마감 전이고 검수된 대회만 추천합니다.</p>}

      <RecommendChat recs={recs} />
    </section>
  );
}

function summary(c: Conditions) {
  const parts = [
    c.major ? MAJOR_LABEL[c.major] : null,
    c.techStack.length ? c.techStack.slice(0, 3).join('·') + (c.techStack.length > 3 ? ` 외 ${c.techStack.length - 3}` : '') : null,
    c.targetScore ? `목표 ${c.targetScore}점` : null,
    c.availableUntil ? `~${c.availableUntil.slice(5).replace('-', '.')}` : null,
    c.includeExamPeriod ? '시험 기간 포함' : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : '조건 없음';
}

function RecCard({ r }: { r: Recommendation }) {
  return (
    <article className="ct-rec-card">
      <div className="ct-rec-top">
        <span className="mono minus">{dDayLabel(r.dDay)}</span>
        <span className="mono accent">예상 +{r.expectedScore}점</span>
      </div>
      <h3><Link to={`/contests/${r.contestId}`}>{r.contestName}</Link></h3>
      <div className="ct-chips">
        <span className={`chip ${r.scope === 'IN_SCHOOL' ? 'chip-dark' : 'chip-accent'}`}>{CONTEST_SCOPE_LABEL[r.scope]}</span>
        {r.tags.map((t) => <span key={t} className="chip">{t}</span>)}
      </div>
      <p className="ct-rec-reason">{r.reason}</p>
      {r.teamTip && <p className="ct-rec-tip"><b>팀 구성</b> {r.teamTip}</p>}
      {r.scheduleWarnings.map((w) => (
        <p key={w.title + w.startDate} className="ct-warn">
          {w.type === 'EXAM' ? '시험 기간 주의' : '일정 겹침'} · {w.title} <span className="mono">{shortDate(w.startDate)}–{shortDate(w.endDate)}</span>
        </p>
      ))}
      <div className="ct-rec-foot">
        <span>난이도 <Stars n={r.difficulty} /></span>
        <span>효율 <b className="mono">{r.efficiencyScore.toFixed(2)}</b>점/시간</span>
      </div>
    </article>
  );
}

/* ---------- 추가 질의응답 (스트리밍) ---------- */
interface ChatMsg { id: number; role: 'user' | 'assistant'; text: string; contestName?: string; pending?: boolean; error?: boolean; }

function RecommendChat({ recs }: { recs: Recommendation[] }) {
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [contestId, setContestId] = useState<number | ''>('');
  const [busy, setBusy] = useState(false);
  const convRef = useRef<string | null>(null);
  const ctrlRef = useRef<AbortController | null>(null);
  const seq = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => ctrlRef.current?.abort(), []);
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs]);
  // 추천 결과가 바뀌어 선택한 대회가 목록에 없으면 선택 해제
  useEffect(() => {
    if (contestId !== '' && !recs.some((r) => r.contestId === contestId)) setContestId('');
  }, [recs, contestId]);

  async function send(e: FormEvent) {
    e.preventDefault();
    const message = input.trim();
    if (!message || busy) return;
    const contest = recs.find((r) => r.contestId === contestId);
    const userMsg: ChatMsg = { id: ++seq.current, role: 'user', text: message, contestName: contest?.contestName };
    const aiId = ++seq.current;
    setMsgs((m) => [...m, userMsg, { id: aiId, role: 'assistant', text: '', pending: true }]);
    setInput('');
    setBusy(true);
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    const patch = (f: (m: ChatMsg) => ChatMsg) => setMsgs((ms) => ms.map((m) => (m.id === aiId ? f(m) : m)));
    const ask = (conversationId: string | null) =>
      chatStream({ conversationId, contestId: contest?.contestId ?? null, message }, (t) => patch((m) => ({ ...m, text: m.text + t })), ctrl.signal);
    try {
      let id: string | null;
      try {
        id = await ask(convRef.current);
      } catch (err) {
        // 만료되었거나 다른 사람의 대화 → 조용히 새 대화로 다시 시작
        if (err instanceof ApiError && err.status === 404 && err.code !== 'CONTEST_NOT_FOUND' && convRef.current) {
          convRef.current = null;
          patch((m) => ({ ...m, text: '' }));
          id = await ask(null);
        } else throw err;
      }
      if (id) convRef.current = id;
      patch((m) => ({ ...m, pending: false, text: m.text || '답변이 비어 있습니다. 다시 질문해 주세요.' }));
    } catch (err) {
      if (ctrl.signal.aborted) return;
      const text = err instanceof ApiError && err.status === 502 ? '답변을 만들지 못했습니다. 다시 시도하세요.' : errorMessage(err);
      patch((m) => ({ ...m, pending: false, error: true, text: m.text ? `${m.text}\n\n(${text})` : text }));
    } finally {
      if (!ctrl.signal.aborted) setBusy(false);
    }
  }

  function reset() {
    ctrlRef.current?.abort();
    convRef.current = null;
    setMsgs([]);
    setBusy(false);
  }

  return (
    <div className="ct-chat" aria-labelledby="chat-h">
      <div className="ct-chat-head">
        <h3 id="chat-h">추천 대회에 대해 물어보기</h3>
        {msgs.length > 0 && <button type="button" className="linkbtn" onClick={reset}>새 대화</button>}
      </div>
      {msgs.length > 0 && (
        <div className="ct-chat-list" ref={listRef} aria-live="polite">
          {msgs.map((m) => (
            <div key={m.id} className={`ct-msg ct-msg-${m.role} ${m.error ? 'is-error' : ''}`}>
              {m.contestName && <span className="ct-msg-ctx">{m.contestName}</span>}
              <p>{m.text}{m.pending && <span className="ct-cursor" aria-hidden="true" />}</p>
              {m.pending && !m.text && <span className="sr-only">답변 작성 중</span>}
            </div>
          ))}
        </div>
      )}
      <form className="ct-ask" onSubmit={send}>
        {recs.length > 0 && (
          <select className="select ct-ask-contest" aria-label="대회 선택" value={contestId} onChange={(e) => setContestId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">대회 선택 (선택)</option>
            {recs.map((r) => <option key={r.contestId} value={r.contestId}>{r.contestName}</option>)}
          </select>
        )}
        <input className="input" placeholder="예: 이 대회 준비하려면 아이디어 어떻게 짜?" aria-label="질문"
          value={input} onChange={(e) => setInput(e.target.value)} maxLength={1000} />
        <button type="submit" className="btn btn-primary btn-lg" disabled={busy || !input.trim()}>{busy ? '답변 중…' : '물어보기'}</button>
      </form>
    </div>
  );
}

/* ====================================================================== */
/* 전체 대회 목록                                                          */
/* ====================================================================== */

const SCOPES: [ContestScope | null, string][] = [[null, '전체'], ['IN_SCHOOL', '교내'], ['OUT_SCHOOL', '교외']];

function ContestList({ teacher, student, onToast }: { teacher: boolean; student: boolean; onToast: (m: string) => void }) {
  // 상세에서 뒤로 왔을 때 필터·페이지 유지 (URL 쿼리)
  const [params, setParams] = useSearchParams();
  const scopeParam = params.get('scope');
  const scope: ContestScope | null = scopeParam === 'IN_SCHOOL' || scopeParam === 'OUT_SCHOOL' ? scopeParam : null;
  const categoryId = Number(params.get('category')) || null;
  const page = Math.max(1, Number(params.get('page')) || 1);
  const bookmarkOnly = student && params.get('bookmarks') === '1';
  const go = (next: { scope?: ContestScope | null; categoryId?: number | null; page?: number; bookmarks?: boolean }) => {
    const v = { scope, categoryId, page: 1, bookmarks: bookmarkOnly, ...next };
    const q = new URLSearchParams();
    if (v.bookmarks) q.set('bookmarks', '1');
    else {
      if (v.scope) q.set('scope', v.scope);
      if (v.categoryId) q.set('category', String(v.categoryId));
    }
    if (v.page > 1) q.set('page', String(v.page));
    setParams(q);
  };
  const resetFilters = () => setParams(new URLSearchParams());

  const [formOpen, setFormOpen] = useState(false);
  const [reload, setReload] = useState(0);
  const cats = useAsync((s) => getCategories(s), [reload]);
  const list = useAsync(
    (s) => (bookmarkOnly ? getMyBookmarks(page, s) : getContests({ scope, categoryId, page }, s)),
    [bookmarkOnly, scope, categoryId, page, reload],
  );

  async function toggleBookmark(c: ContestItem) {
    const on = !c.isBookmarked;
    const flip = (v: boolean) => list.setData((d) => ({ ...d, items: d.items.map((x) => (x.contestId === c.contestId ? { ...x, isBookmarked: v } : x)) }));
    flip(on);
    try {
      await setBookmark(c.contestId, on);
      onToast(on ? `'${c.contestName}'을(를) 북마크했습니다.` : '북마크를 해제했습니다.');
    } catch (e) {
      flip(!on);
      onToast(errorMessage(e));
    }
  }

  const filtered = !!(scope || categoryId);

  return (
    <section aria-labelledby="all-h" className="ct-all">
      <div className="ct-listhead">
        <h2 id="all-h" className="section-title">
          {bookmarkOnly ? '북마크한 대회' : '전체 대회'}
          {list.state.status === 'ok' && <span className="mono muted">{list.state.data.totalElements}</span>}
        </h2>
        <div className="ct-tools">
          <div className="seg" role="tablist" aria-label="구분">
            {SCOPES.map(([k, label]) => (
              <button key={label} type="button" role="tab" aria-selected={!bookmarkOnly && scope === k} className={!bookmarkOnly && scope === k ? 'is-on' : ''}
                disabled={bookmarkOnly} onClick={() => go({ scope: k })}>{label}</button>
            ))}
          </div>
          <select className="select ct-cat" value={categoryId ?? ''} aria-label="카테고리" disabled={bookmarkOnly}
            onChange={(e) => go({ categoryId: e.target.value ? Number(e.target.value) : null })}>
            <option value="">카테고리 전체</option>
            {cats.state.status === 'ok' && cats.state.data.items.map((c) => <option key={c.categoryId} value={c.categoryId}>{c.name}</option>)}
          </select>
          {student && (
            <button type="button" className={`pill ct-bmpill ${bookmarkOnly ? 'is-on' : ''}`} aria-pressed={bookmarkOnly} onClick={() => go({ bookmarks: !bookmarkOnly })}>
              <BookmarkIcon on={bookmarkOnly} /> 북마크만
            </button>
          )}
          {teacher && (
            <button type="button" className="btn btn-strong ct-addbtn" aria-expanded={formOpen} onClick={() => setFormOpen(!formOpen)}>
              + 대회 등록 <small>교사</small>
            </button>
          )}
        </div>
      </div>

      {teacher && formOpen && (
        <ContestForm
          onSubmit={createContest}
          onCancel={() => setFormOpen(false)}
          onToast={onToast}
          onDone={(c) => {
            setFormOpen(false);
            setReload((n) => n + 1);
            onToast(`'${c.contestName}' 대회를 등록했습니다.`);
          }}
        />
      )}

      {list.state.status === 'error' && list.state.code === 400 ? (
        <div className="ct-empty">
          <p>필터 값이 올바르지 않습니다.</p>
          <button type="button" className="btn" onClick={resetFilters}>필터 초기화</button>
        </div>
      ) : (
        <Loadable state={list.state}>{(d) => {
          if (d.page !== page && page !== 1) queueMicrotask(() => go({ page: d.page }));
          const start = Math.max(1, Math.min(d.page - 2, d.totalPages - 4));
          const nums = Array.from({ length: Math.min(5, d.totalPages) }, (_, i) => start + i);
          return d.items.length === 0 ? (
            <div className="ct-empty">
              {bookmarkOnly ? (
                <>
                  <p>북마크한 대회가 없습니다.</p>
                  <button type="button" className="btn" onClick={resetFilters}>전체 대회 보기</button>
                </>
              ) : (
                <>
                  <p>조건에 맞는 대회가 없습니다.</p>
                  {filtered && <button type="button" className="btn" onClick={resetFilters}>필터 초기화</button>}
                </>
              )}
            </div>
          ) : (
            <>
              <div className="ct-grid">
                {d.items.map((c) => (
                  <article key={c.contestId} className={`card ct-card ${c.dDay < 0 ? 'is-closed' : ''}`}>
                    <div className="ct-card-top">
                      <span className="ct-chips">
                        <span className={`chip ${c.scope === 'IN_SCHOOL' ? 'chip-dark' : 'chip-accent'}`}>{CONTEST_SCOPE_LABEL[c.scope]}</span>
                        <span className="chip">{c.category.name}</span>
                      </span>
                      <span className="ct-card-right">
                        <span className={`mono ${c.dDay >= 0 && c.dDay <= 7 ? 'minus' : 'muted'}`}>{dDayLabel(c.dDay)}</span>
                        {student && (
                          <button type="button" className={`ct-bm ${c.isBookmarked ? 'is-on' : ''}`} aria-pressed={c.isBookmarked}
                            aria-label={c.isBookmarked ? `${c.contestName} 북마크 해제` : `${c.contestName} 북마크`} onClick={() => toggleBookmark(c)}>
                            <BookmarkIcon on={c.isBookmarked} />
                          </button>
                        )}
                      </span>
                    </div>
                    <h3><Link to={`/contests/${c.contestId}`} className="ct-card-link">{c.contestName}</Link></h3>
                    <p className="muted">기간 <span className="mono">{shortDate(c.startAt)} – {shortDate(c.finishAt)}</span></p>
                    {c.tags.length > 0 && <div className="ct-chips ct-tagrow">{c.tags.map((t) => <span key={t} className="chip chip-line">{t}</span>)}</div>}
                  </article>
                ))}
              </div>
              {d.totalPages > 1 && (
                <nav className="pager ct-pager" aria-label="페이지">
                  <button type="button" className="pager-text" disabled={d.page === 1} onClick={() => go({ page: d.page - 1 })}>‹ 이전</button>
                  {nums.map((n) => (
                    <button key={n} type="button" className={n === d.page ? 'is-on' : ''} aria-current={n === d.page ? 'page' : undefined} onClick={() => go({ page: n })}>{n}</button>
                  ))}
                  <button type="button" className="pager-text" disabled={d.page >= d.totalPages} onClick={() => go({ page: d.page + 1 })}>다음 ›</button>
                </nav>
              )}
            </>
          );
        }}</Loadable>
      )}
      {bookmarkOnly && <p className="footnote">북마크 목록은 구분·카테고리 필터 없이 마감이 가까운 순으로 표시합니다.</p>}
    </section>
  );
}
