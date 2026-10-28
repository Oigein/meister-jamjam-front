/* 마역량 세부 조회 (docs/api/03-meister-detail.md, 링크 표시는 07-profile-links.md 2.3) */
import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { API_ORIGIN, USE_MOCK, errorMessage } from '../api/client';
import {
  GITHUB_PREFIX, LINKEDIN_PREFIX, getGradeCriteria, getMeisterScores, getMeritPoints, getScoreHistory, getStudent, safeLink,
  type GradeCriteria, type MeisterArea, type MeisterScores, type MeritPoints, type MeritPointsByTeacher, type ScoreHistoryItem, type StudentDetail,
} from '../api/students';
import type { ScoreType } from '../api/types';
import { useAsync, type AsyncState } from '../lib/useAsync';
import { avatarChar, signed } from '../lib/format';
import { GitHubIcon, LinkedInIcon } from '../components/icons';
import './StudentDetailPage.css';

const day = (iso: string) => iso.slice(0, 10);
const fmtConv = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/* 오류 + 다시 시도 */
function Failed({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="sd-failed" role="alert">
      <span>정보를 불러오지 못했습니다. ({message})</span>
      <button type="button" className="btn btn-sm" onClick={onRetry}>다시 시도</button>
    </div>
  );
}
function View<T>({ state, onRetry, children }: { state: AsyncState<T>; onRetry: () => void; children: (d: T) => ReactNode }) {
  if (state.status === 'loading') return <p className="status-msg">불러오는 중…</p>;
  if (state.status === 'error') return <Failed message={state.message} onRetry={onRetry} />;
  return <>{children(state.data)}</>;
}

/* 증빙자료: 실제 백엔드에서는 파일 열람 주소로 새 탭, 목업에서는 이름만 */
function Evidence({ ev }: { ev: ScoreHistoryItem['evidence'] }) {
  if (!ev) return null;
  return USE_MOCK
    ? <span className="sd-ev" title="증빙자료"><small>증빙</small>{ev.fileName}</span>
    : <a className="sd-ev" href={`${API_ORIGIN}/api/evidences/${encodeURIComponent(ev.evidenceId)}/file`} target="_blank" rel="noopener noreferrer" title="증빙자료 새 탭으로 열기"><small>증빙</small>{ev.fileName}</a>;
}

/* ---------- 페이지 목록 상태 (더 보기) ---------- */
interface ListState { status: 'idle' | 'loading' | 'ok' | 'error'; items: ScoreHistoryItem[]; page: number; totalPages: number; totalElements: number; message?: string; }
const EMPTY_LIST: ListState = { status: 'idle', items: [], page: 0, totalPages: 0, totalElements: 0 };

export default function StudentDetailPage() {
  const { studentId = '' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [reload, setReload] = useState(0);
  const retry = () => setReload((n) => n + 1);

  const student = useAsync((s) => getStudent(studentId, s), [studentId, reload]);

  const back = (e: MouseEvent) => {
    // 앱 안에서 넘어왔으면 뒤로 가기 (랭킹의 학년·페이지 유지), 바로 들어왔으면 /ranking
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) { e.preventDefault(); navigate(-1); }
  };

  const head = <Link className="sd-back" to="/ranking" onClick={back}>‹ 랭킹으로</Link>;

  if (student.state.status === 'error' && student.state.code === 404) {
    return (
      <main className="page sd">
        {head}
        <div className="card sd-notfound">
          <h1>학생을 찾을 수 없습니다.</h1>
          <p className="muted">주소가 잘못되었거나 더 이상 존재하지 않는 학생입니다.</p>
          <Link className="btn" to="/ranking">랭킹으로 가기</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="page sd">
      {head}
      <View state={student.state} onRetry={retry}>
        {(st) => <Detail key={`${st.studentId}:${reload}`} st={st} tab={params.get('tab')} detailId={params.get('detailId')} />}
      </View>
    </main>
  );
}

function Detail({ st, tab, detailId }: { st: StudentDetail; tab: string | null; detailId: string | null }) {
  const id = st.studentId;
  const [r1, setR1] = useState(0);
  const [r2, setR2] = useState(0);
  const scores = useAsync((s) => getMeisterScores(id, s), [id, r1]);
  const criteria = useAsync((s) => getGradeCriteria(s), [r2]);

  const github = safeLink(st.githubUrl, GITHUB_PREFIX);
  const linkedin = safeLink(st.linkedinUrl, LINKEDIN_PREFIX);
  const gradeOf: Partial<Record<ScoreType, string | null>> = scores.state.status === 'ok'
    ? Object.fromEntries(scores.state.data.areas.map((a) => [a.scoreType, a.grade])) : {};

  return (
    <>
      <section className="sd-profile">
        <div className="sd-who">
          <span className="sd-avatar" aria-hidden="true">{avatarChar(st.name)}</span>
          <div className="sd-whotext">
            <div className="sd-namerow">
              <h1 className="sd-name">{st.name}</h1>
              {st.isMe && <span className="chip chip-accent">나</span>}
              {github && (
                <a className="sd-iconbtn" href={github} target="_blank" rel="noopener noreferrer" aria-label="GitHub 프로필 새 탭으로 열기" title={github.replace('https://', '')}><GitHubIcon /></a>
              )}
              {linkedin && (
                <a className="sd-iconbtn" href={linkedin} target="_blank" rel="noopener noreferrer" aria-label="LinkedIn 프로필 새 탭으로 열기" title={linkedin.replace('https://www.', '')}><LinkedInIcon /></a>
              )}
              {st.isMe && !github && !linkedin && <Link className="btn btn-sm btn-dashed" to="/settings">+ 링크 추가</Link>}
            </div>
            <span className="sd-sub">{st.grade}학년 {st.classNo}반 {st.number}번</span>
          </div>
        </div>
        <div className="sd-stats">
          <div className="sd-stat"><span>총점</span><strong className="mono">{st.totalScore}<small>점</small></strong></div>
          <div className="sd-stat"><span>전체 순위</span><strong className="mono">{st.rank}<small>위</small></strong></div>
        </div>
      </section>

      <div className="sd-layout">
        <div className="sd-main">
          <section aria-labelledby="sd-area-h" className="sd-sec">
            <View state={scores.state} onRetry={() => setR1((n) => n + 1)}>
              {(d) => <AreaTable studentId={id} data={d} />}
            </View>
          </section>
          <HistorySection studentId={id} focus={tab === 'history'} detailId={detailId} />
        </div>

        <aside className="sd-side">
          <MeritCard studentId={id} />
          <section aria-labelledby="sd-gr-h" className="card sd-card sd-grade">
            <h2 id="sd-gr-h">환산 등급 기준</h2>
            <View state={criteria.state} onRetry={() => setR2((n) => n + 1)}>
              {(c) => <CriteriaList c={c} gradeOf={gradeOf} />}
            </View>
          </section>
        </aside>
      </div>
    </>
  );
}

/* ---------- 영역별 점수 ---------- */
function AreaTable({ studentId, data }: { studentId: string; data: MeisterScores }) {
  const [open, setOpen] = useState<Partial<Record<ScoreType, boolean>>>({});
  const [lists, setLists] = useState<Partial<Record<ScoreType, ListState>>>({});
  const ctrl = useRef<AbortController | null>(null);
  useEffect(() => {
    ctrl.current = new AbortController();
    return () => ctrl.current?.abort();
  }, []);

  const load = useCallback((t: ScoreType, page: number) => {
    const signal = ctrl.current?.signal;
    setLists((m) => ({ ...m, [t]: { ...(m[t] ?? EMPTY_LIST), status: 'loading' } }));
    getScoreHistory(studentId, { scoreType: t, order: 'desc', page }, signal)
      .then((p) => setLists((m) => {
        const prev = m[t] ?? EMPTY_LIST;
        return { ...m, [t]: { status: 'ok', items: page === 1 ? p.items : [...prev.items, ...p.items], page: p.page, totalPages: p.totalPages, totalElements: p.totalElements } };
      }))
      .catch((e: unknown) => {
        if (signal?.aborted) return;
        setLists((m) => ({ ...m, [t]: { ...(m[t] ?? EMPTY_LIST), status: 'error', message: errorMessage(e) } }));
      });
  }, [studentId]);

  const setArea = (a: MeisterArea, on: boolean) => {
    setOpen((o) => ({ ...o, [a.scoreType]: on }));
    // 펼칠 때 한 번만 불러옴. 내역이 0건이면 호출 생략 (명세 2.2)
    if (on && a.detailCount > 0 && !lists[a.scoreType]) load(a.scoreType, 1);
  };
  const allOpen = data.areas.every((a) => open[a.scoreType]);
  const toggleAll = () => data.areas.forEach((a) => setArea(a, !allOpen));

  const conv = data.criteriaRegistered;
  const totalConv = data.areas.reduce((s, a) => s + (a.convertedScore ?? 0), 0);
  const totalCount = data.areas.reduce((s, a) => s + a.detailCount, 0);

  return (
    <>
      <div className="sd-sechead">
        <h2 id="sd-area-h">영역별 점수</h2>
        <button type="button" className="btn btn-sm" onClick={toggleAll}>{allOpen ? '모두 접기' : '모두 펼치기'}</button>
      </div>
      {!conv && <p className="sd-notice">환산 등급 기준이 등록되지 않았습니다.</p>}
      <div className={`sd-table${conv ? '' : ' no-conv'}`}>
        <div className="sd-row sd-thead" aria-hidden="true">
          <span>평가 영역</span><span>원점수</span>{conv && <><span>환산</span><span>등급</span></>}<span>건수</span>
        </div>
        {data.areas.map((a) => {
          const isOpen = !!open[a.scoreType];
          const l = lists[a.scoreType];
          return (
            <div key={a.scoreType} className="sd-area">
              <button type="button" className={`sd-row sd-arearow${isOpen ? ' is-open' : ''}`} aria-expanded={isOpen}
                aria-controls={`sd-area-${a.scoreType}`} onClick={() => setArea(a, !isOpen)}>
                <span className="sd-areaname"><span className="sd-chev mono" aria-hidden="true">{isOpen ? '▾' : '▸'}</span>{a.label}</span>
                <span className="mono" aria-label={`원점수 ${a.rawScore}`}>{a.rawScore}</span>
                {conv && <>
                  <span className="mono strong" aria-label={`환산 ${a.convertedScore ?? '-'}`}>{a.convertedScore === null ? '–' : fmtConv(a.convertedScore)}</span>
                  <span aria-label={`등급 ${a.grade ?? '없음'}`}>{a.grade ? <span className="sd-grade-chip">{a.grade}</span> : <span className="muted">–</span>}</span>
                </>}
                <span className="mono muted" aria-label={`${a.detailCount}건`}>{a.detailCount}</span>
              </button>
              {isOpen && (
                <div className="sd-items" id={`sd-area-${a.scoreType}`}>
                  {a.detailCount === 0 ? <p className="sd-empty">등록된 내역 없음</p> : <>
                    {l?.status === 'ok' && l.items.length === 0 && <p className="sd-empty">등록된 내역 없음</p>}
                    {l?.items.map((h) => (
                      <div key={h.detailId} className="sd-item">
                        <span className="sd-itemtext">
                          <span>{h.itemName ? <><b>{h.itemName}</b> · </> : null}{h.content}</span>
                          <small><span className="mono">{day(h.createdAt)}</span> · {h.teacher.name}{h.evidence && <> · <Evidence ev={h.evidence} /></>}</small>
                        </span>
                        <span className={`mono sd-delta ${h.points >= 0 ? 'plus' : 'minus'}`}>{signed(h.points)}</span>
                      </div>
                    ))}
                    {l?.status === 'loading' && <p className="sd-empty">불러오는 중…</p>}
                    {l?.status === 'error' && <div className="sd-empty"><Failed message={l.message ?? ''} onRetry={() => load(a.scoreType, l.page + 1)} /></div>}
                    {l?.status === 'ok' && l.page < l.totalPages && (
                      <div className="sd-more-in"><button type="button" className="btn btn-sm" onClick={() => load(a.scoreType, l.page + 1)}>더 보기 ({l.items.length}/{l.totalElements})</button></div>
                    )}
                  </>}
                </div>
              )}
            </div>
          );
        })}
        <div className="sd-row sd-tfoot">
          <span>합계</span>
          <span className="mono">{data.totalScore}</span>
          {conv && <><span className="mono">{fmtConv(Math.round(totalConv * 10) / 10)}</span><span /></>}
          <span className="mono muted">{totalCount}</span>
        </div>
      </div>
    </>
  );
}

/* ---------- 점수 변동 내역 ---------- */
const AUTO_LOAD_LIMIT = 5; // 알림으로 들어온 detailId를 찾기 위해 자동으로 더 불러오는 최대 페이지

function HistorySection({ studentId, focus, detailId }: { studentId: string; focus: boolean; detailId: string | null }) {
  const [list, setList] = useState<ListState>(EMPTY_LIST);
  const ctrl = useRef<AbortController | null>(null);
  const secRef = useRef<HTMLElement>(null);
  const scrolled = useRef(false);
  const [highlight, setHighlight] = useState<string | null>(null);

  const load = useCallback((page: number) => {
    const signal = ctrl.current?.signal;
    setList((l) => ({ ...l, status: 'loading' }));
    getScoreHistory(studentId, { order: 'desc', page }, signal)
      .then((p) => setList((l) => ({ status: 'ok', items: page === 1 ? p.items : [...l.items, ...p.items], page: p.page, totalPages: p.totalPages, totalElements: p.totalElements })))
      .catch((e: unknown) => {
        if (signal?.aborted) return;
        setList((l) => ({ ...l, status: 'error', message: errorMessage(e) }));
      });
  }, [studentId]);

  useEffect(() => {
    ctrl.current = new AbortController();
    load(1);
    return () => ctrl.current?.abort();
  }, [load]);

  // ?tab=history(&detailId=…): 내역으로 스크롤, 해당 항목 강조
  useEffect(() => {
    if (scrolled.current || list.status !== 'ok') return;
    if (detailId) {
      const found = list.items.some((h) => h.detailId === detailId);
      if (!found && list.page < list.totalPages && list.page < AUTO_LOAD_LIMIT) { load(list.page + 1); return; }
      scrolled.current = true;
      const el = found ? document.getElementById(`sd-h-${detailId}`) : null;
      if (el) {
        setHighlight(detailId);
        requestAnimationFrame(() => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
        return;
      }
    } else scrolled.current = true;
    if (focus || detailId) requestAnimationFrame(() => secRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }, [list, detailId, focus, load]);

  return (
    <section aria-labelledby="sd-hist-h" className="sd-sec" ref={secRef}>
      <div className="sd-sechead">
        <h2 id="sd-hist-h">점수 변동 내역</h2>
        {list.totalElements > 0 && <span className="mono muted sd-count">{list.totalElements}건</span>}
      </div>
      {list.status === 'error' && list.items.length === 0 ? (
        <Failed message={list.message ?? ''} onRetry={() => load(1)} />
      ) : list.status === 'ok' && list.items.length === 0 ? (
        <p className="status-msg">등록된 내역 없음</p>
      ) : list.items.length === 0 ? (
        <p className="status-msg">불러오는 중…</p>
      ) : (
        <>
          <ol className="sd-history">
            {list.items.map((h) => (
              <li key={h.detailId} id={`sd-h-${h.detailId}`} className={highlight === h.detailId ? 'is-hl' : ''}>
                <span className="mono muted sd-date">{day(h.createdAt)}</span>
                <span className="sd-histtext">
                  <span>{h.itemName ? <><b>{h.itemName}</b> · </> : null}{h.content}</span>
                  <span className="sd-meta"><span className="chip">{h.label}</span> {h.teacher.name}{h.evidence && <> · <Evidence ev={h.evidence} /></>}</span>
                </span>
                <span className={`mono sd-delta ${h.points >= 0 ? 'plus' : 'minus'}`}>{signed(h.points)}</span>
              </li>
            ))}
          </ol>
          {list.status === 'error' && <Failed message={list.message ?? ''} onRetry={() => load(list.page + 1)} />}
          {list.page < list.totalPages && list.status !== 'error' && (
            <button type="button" className="btn sd-more" disabled={list.status === 'loading'} onClick={() => load(list.page + 1)}>
              {list.status === 'loading' ? '불러오는 중…' : `더 보기 (${list.items.length}/${list.totalElements})`}
            </button>
          )}
        </>
      )}
    </section>
  );
}

/* ---------- 상·벌점 (본인·교사만) ---------- */
type PtTab = 'merit' | 'demerit' | 'teacher';

function MeritCard({ studentId }: { studentId: string }) {
  const [r, setR] = useState(0);
  const [tab, setTab] = useState<PtTab>('merit');
  const [rt, setRt] = useState(0);
  const base = useAsync((s) => getMeritPoints(studentId, 'none', s), [studentId, r]);
  const [wantTeacher, setWantTeacher] = useState(false);
  const byTeacher = useAsync<MeritPointsByTeacher | null>(
    (s) => (wantTeacher ? getMeritPoints(studentId, 'teacher', s) : Promise.resolve(null)),
    [studentId, wantTeacher, rt],
  );

  if (base.state.status === 'error' && base.state.code === 403) {
    return (
      <section aria-labelledby="sd-pt-h" className="card sd-card sd-pad">
        <h2 id="sd-pt-h">상벌점</h2>
        <p className="sd-lock">본인과 선생님만 볼 수 있습니다.</p>
      </section>
    );
  }

  const pick = (t: PtTab) => { setTab(t); if (t === 'teacher') setWantTeacher(true); };

  return (
    <section aria-labelledby="sd-pt-h" className="card sd-card sd-pt">
      <div className="sd-pt-top">
        <h2 id="sd-pt-h">상벌점</h2>
        <View state={base.state} onRetry={() => setR((n) => n + 1)}>
          {(d: MeritPoints) => (
            <div className="sd-ptsum">
              <div><span>상점</span><strong className="mono plus">+{d.meritTotal}</strong></div>
              <div><span>벌점</span><strong className="mono minus">{d.demeritTotal ? `−${d.demeritTotal}` : '0'}</strong></div>
              <div><span>합계</span><strong className="mono">{signed(d.net)}</strong></div>
            </div>
          )}
        </View>
        <div role="tablist" aria-label="상벌점 보기" className="sd-tabs">
          {([['merit', '상점'], ['demerit', '벌점'], ['teacher', '교사별']] as [PtTab, string][]).map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'is-on' : ''} onClick={() => pick(k)}>{label}</button>
          ))}
        </div>
      </div>
      <div role="tabpanel">
        {tab !== 'teacher' ? (
          base.state.status === 'ok' && (() => {
            const xs = tab === 'merit' ? base.state.data.merits : base.state.data.demerits;
            const sign = tab === 'merit' ? '+' : '−';
            if (xs.length === 0) return <p className="sd-empty sd-pad-x">등록된 내역 없음</p>;
            return xs.map((p) => (
              <div key={p.meritPointId} className="sd-ptrow">
                <span className="sd-ptcol">
                  <span>{p.title}{p.content && <span className="muted"> · {p.content}</span>}</span>
                  <small><span className="mono">{day(p.createdAt)}</span> · {p.teacher.name}</small>
                </span>
                <span className={`mono ${tab === 'merit' ? 'plus' : 'minus'}`}>{sign}{p.points}</span>
              </div>
            ));
          })()
        ) : (
          <View state={byTeacher.state} onRetry={() => setRt((n) => n + 1)}>
            {(d) => !d ? null : d.byTeacher.length === 0 ? <p className="sd-empty sd-pad-x">등록된 내역 없음</p> : d.byTeacher.map((g) => (
              <div key={g.teacher.teacherId}>
                <div className="sd-grouphead">
                  <span>{g.teacher.name}</span>
                  <span className="mono"><span className="plus">+{g.meritTotal}</span> / <span className="minus">{g.demeritTotal ? `−${g.demeritTotal}` : '0'}</span></span>
                </div>
                {g.items.map((p) => (
                  <div key={p.meritPointId} className="sd-ptrow">
                    <span className="sd-ptcol"><span>{p.title}</span><small className="mono">{day(p.createdAt)}</small></span>
                    <span className={`mono ${p.type === 'MERIT' ? 'plus' : 'minus'}`}>{p.type === 'MERIT' ? '+' : '−'}{p.points}</span>
                  </div>
                ))}
              </div>
            ))}
          </View>
        )}
      </div>
      <Link className="sd-cardlink" to="/rules">상벌점 기준 보기 ›</Link>
    </section>
  );
}

/* ---------- 환산 등급 기준 ---------- */
function CriteriaList({ c, gradeOf }: { c: GradeCriteria; gradeOf: Partial<Record<ScoreType, string | null>> }) {
  if (!c.registered || c.areas.length === 0) return <p className="sd-empty sd-pad-0">환산 등급 기준이 등록되지 않았습니다.</p>;
  return (
    <>
      <ul className="sd-crit">
        {c.areas.map((a) => (
          <li key={a.scoreType}>
            <div className="sd-crit-head">
              <span className="strong">{a.label}</span>
              <span className="mono muted">최대 {a.maxRawScore} · ×{a.conversionRate}</span>
            </div>
            <div className="sd-crit-grades">
              {a.grades.map((g) => {
                const mine = gradeOf[a.scoreType] === g.grade;
                return (
                  <span key={g.grade} className={`sd-crit-g${mine ? ' is-me' : ''}`} aria-label={`${g.grade}등급 원점수 ${g.minRawScore}점 이상${mine ? ' (현재 등급)' : ''}`}>
                    <b>{g.grade}</b><span className="mono">{g.minRawScore}+</span>
                  </span>
                );
              })}
            </div>
          </li>
        ))}
      </ul>
      <p className="sd-note">환산 점수 = 원점수 × 환산 비율. 등급은 영역별 원점수가 최소 기준 이상일 때 부여되며, 강조된 칸이 현재 등급입니다.</p>
    </>
  );
}
