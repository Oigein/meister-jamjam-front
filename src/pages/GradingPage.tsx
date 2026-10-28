import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ANALYSIS_STATUS_LABEL, EXTRACTED_KIND_LABEL, approveEvidence, fmtDate, fmtDateTime, getAllPendingEvidences, getEvidence,
  getScoreHistory, getScoreItems, grantMeisterScore, grantMeritPoint, reanalyzeEvidence, rejectEvidence, searchStudents,
  type EvidenceDetail, type ScoreItem, type TeacherEvidenceItem, type TeacherStudent,
} from '../api/award';
import { getPointRules, type PointRule } from '../api/pointRules';
import { ApiError, errorMessage, fieldErrorMap } from '../api/client';
import { POINT_TYPE_LABEL, SCORE_TYPES, SCORE_TYPE_LABEL, studentNo, type PointType, type ScoreType } from '../api/types';
import { isTeacher } from '../api/me';
import { useMe } from '../lib/session';
import { useAsync } from '../lib/useAsync';
import { signed } from '../lib/format';
import { Loadable } from '../components/Loadable';
import { useToast } from '../components/Toast';
import StudentPicker from '../components/StudentPicker';
import './GradingPage.css';

type Tab = 'review' | 'direct' | 'merit' | 'history';
const TABS: [Tab, string][] = [['review', '증빙자료 검토'], ['direct', '직접 부여'], ['merit', '상벌점 부여'], ['history', '부여 이력']];

export default function GradingPage() {
  const me = useMe();
  if (!isTeacher(me)) {
    return <main className="page"><p className="status-msg">교사만 사용할 수 있는 화면입니다.</p></main>;
  }
  return <Grading />;
}

function Grading() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  const tab: Tab = TABS.some(([t]) => t === raw) ? (raw as Tab) : 'review';
  const { state: items } = useAsync((s) => getScoreItems(null, s).then((r) => r.items), []);
  const { toast, show } = useToast();

  return (
    <main className="page page-wide">
      <div className="page-head">
        <div>
          <p className="eyebrow mono">교사 · 마이스터 역량</p>
          <h1 className="page-title">점수 부여</h1>
        </div>
        <div className="seg gr-tabs" role="tablist" aria-label="부여 방식">
          {TABS.map(([t, label]) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} className={tab === t ? 'is-on' : ''}
              onClick={() => setParams(t === 'review' ? {} : { tab: t }, { replace: true })}>{label}</button>
          ))}
        </div>
      </div>
      <Loadable state={items}>{(list) => (
        tab === 'review' ? <Review items={list} notify={show} />
          : tab === 'direct' ? <Direct items={list} notify={show} />
            : tab === 'merit' ? <Merit notify={show} />
              : <History />
      )}</Loadable>
      {toast}
    </main>
  );
}

/* ================= 증빙자료 검토 ================= */
function Review({ items, notify }: { items: ScoreItem[]; notify: (m: string) => void }) {
  const [queue, setQueue] = useState<TeacherEvidenceItem[] | null>(null);
  const [loadErr, setLoadErr] = useState('');
  const [reload, setReload] = useState(0);
  const [q, setQ] = useState('');
  const [selId, setSelId] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoadErr('');
    getAllPendingEvidences(ctrl.signal)
      .then((xs) => { setQueue(xs); setSelId((cur) => (cur && xs.some((x) => x.evidenceId === cur) ? cur : xs[0]?.evidenceId ?? null)); })
      .catch((e) => { if (!ctrl.signal.aborted) setLoadErr(errorMessage(e)); });
    return () => ctrl.abort();
  }, [reload]);

  const remove = (id: string) => {
    const list = queue ?? [];
    const idx = list.findIndex((x) => x.evidenceId === id);
    const next = list.filter((x) => x.evidenceId !== id);
    setQueue(next);
    setSelId(next[Math.min(Math.max(idx, 0), next.length - 1)]?.evidenceId ?? null);
  };
  const patch = (id: string, p: Partial<TeacherEvidenceItem>) => setQueue((xs) => xs && xs.map((x) => (x.evidenceId === id ? { ...x, ...p } : x)));

  if (loadErr) return <p className="status-msg">검토 목록을 불러오지 못했습니다. ({loadErr}) <button type="button" className="linkbtn" onClick={() => setReload((n) => n + 1)}>다시 시도</button></p>;
  if (!queue) return <p className="status-msg">불러오는 중…</p>;

  const query = q.trim();
  const list = queue.filter((s) => !query || s.student.name.includes(query) || studentNo(s.student).includes(query));
  const sel = queue.find((s) => s.evidenceId === selId) ?? null;

  return (
    <div className="gr-layout">
      <section className="card gr-queue" aria-labelledby="gr-q">
        <div className="gr-queue-head">
          <div className="gr-queue-title">
            <h2 id="gr-q">검토 대기</h2>
            <span className="muted">{queue.length}건 · <button type="button" className="linkbtn" onClick={() => setReload((n) => n + 1)}>새로고침</button></span>
          </div>
          <input className="input" type="search" placeholder="이름 또는 학번 (예: 2109)" aria-label="검토 대기 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {list.length === 0 ? <p className="gr-empty">{queue.length === 0 ? '검토할 증빙자료가 없습니다.' : '검색 결과가 없습니다.'}</p> : (
          <ul>
            {list.map((s) => (
              <li key={s.evidenceId}>
                <button type="button" className={selId === s.evidenceId ? 'is-on' : ''} aria-current={selId === s.evidenceId} onClick={() => setSelId(s.evidenceId)}>
                  <span className="gr-qtop"><b>{s.student.name} · <span className="mono">{studentNo(s.student)}</span></b><span className="mono muted">{fmtDate(s.createdAt).slice(5)}</span></span>
                  <span className="gr-qtitle">{s.title}</span>
                  <span className="gr-qmeta">
                    <span className={`gr-ai-tag gr-ai-${s.analysisStatus.toLowerCase()}`}>{ANALYSIS_STATUS_LABEL[s.analysisStatus]}</span>
                    {s.recommendedScoreType && <span className="muted">{SCORE_TYPE_LABEL[s.recommendedScoreType]}{s.expectedPoints !== null && <> · <span className="mono">+{s.expectedPoints}</span></>}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {sel ? (
        <ReviewDetail key={sel.evidenceId} item={sel} items={items}
          onAnalysis={(d) => patch(sel.evidenceId, {
            analysisStatus: d.aiAnalysis?.status ?? sel.analysisStatus,
            recommendedScoreType: d.aiAnalysis?.recommendation?.scoreType ?? null,
            expectedPoints: d.aiAnalysis?.recommendation?.expectedPoints ?? null,
          })}
          onDone={(msg) => { remove(sel.evidenceId); notify(msg); }} />
      ) : (
        <p className="status-msg gr-none">{queue.length === 0 ? '검토할 증빙자료가 없습니다. 새로 제출되면 새로고침을 눌러 주세요.' : '왼쪽 목록에서 증빙자료를 고르세요.'}</p>
      )}
    </div>
  );
}

function ReviewDetail({ item, items, onAnalysis, onDone }: {
  item: TeacherEvidenceItem; items: ScoreItem[];
  onAnalysis: (d: EvidenceDetail) => void; onDone: (msg: string) => void;
}) {
  const [st, setSt] = useState<{ status: 'loading' } | { status: 'error'; message: string } | { status: 'ok'; d: EvidenceDetail }>({ status: 'loading' });
  const [tick, setTick] = useState(0);
  const [student, setStudent] = useState<TeacherStudent | null>(null);
  const [reBusy, setReBusy] = useState(false);
  const [reErr, setReErr] = useState('');

  useEffect(() => {
    const ctrl = new AbortController();
    getEvidence(item.evidenceId, ctrl.signal)
      .then((d) => {
        setSt({ status: 'ok', d });
        onAnalysis(d);
        if (d.status !== 'PENDING') onDone(`이미 ${d.status === 'APPROVED' ? '승인' : '반려'}된 증빙자료라 목록에서 뺐습니다.`);
      })
      .catch((e) => { if (!ctrl.signal.aborted) setSt({ status: 'error', message: errorMessage(e) }); });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.evidenceId, tick]);

  // 학생 요약 (총점·대기 건수): 학생 검색 API를 학번으로 조회
  useEffect(() => {
    const ctrl = new AbortController();
    const s = item.student;
    searchStudents({ grade: s.grade, classNo: s.classNo, number: s.number }, ctrl.signal)
      .then((p) => setStudent(p.items.find((x) => x.studentId === s.studentId) ?? null))
      .catch(() => { /* 요약은 없어도 됨 */ });
    return () => ctrl.abort();
  }, [item.student]);

  const ai = st.status === 'ok' ? st.d.aiAnalysis : null;
  const processing = ai?.status === 'PROCESSING';
  useEffect(() => {
    if (!processing) return;
    const t = setTimeout(() => setTick((n) => n + 1), 3000);
    return () => clearTimeout(t);
  }, [processing, tick]);

  async function reanalyze() {
    setReBusy(true); setReErr('');
    try {
      await reanalyzeEvidence(item.evidenceId);
      setTick((n) => n + 1);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'EVIDENCE_ALREADY_REVIEWED') { onDone(e.message); return; }
      setReErr(errorMessage(e));
    } finally {
      setReBusy(false);
    }
  }

  if (st.status === 'loading') return <p className="status-msg gr-none">불러오는 중…</p>;
  if (st.status === 'error') return <p className="status-msg gr-none">증빙자료를 불러오지 못했습니다. ({st.message}) <button type="button" className="linkbtn" onClick={() => setTick((n) => n + 1)}>다시 시도</button></p>;
  const d = st.d;
  const isImage = d.file.contentType.startsWith('image/');
  const isPdf = d.file.contentType === 'application/pdf';

  return (
    <>
      <div className="gr-mid">
        <section className="card gr-student">
          <div>
            <h2>{d.student.name} · <span className="mono">{studentNo(d.student)}</span></h2>
            <p className="muted">
              {d.student.grade}학년 {d.student.classNo}반 {d.student.number}번
              {student && <> · 현재 총점 <b className="mono">{student.totalScore}</b> · 검토 대기 <b className="mono">{student.pendingEvidenceCount}</b>건</>}
              {' '}· 제출 <span className="mono">{fmtDateTime(d.createdAt)}</span>
            </p>
          </div>
          <Link to={`/students/${d.student.studentId}`}>학생 상세 ›</Link>
        </section>
        <div className="gr-subject">
          <h3>{d.title}</h3>
          {d.description && <p className="muted">{d.description}</p>}
        </div>
        <div className="gr-preview">
          {d.file.url && isImage ? <img src={d.file.url} alt={`${d.title} 증빙자료`} />
            : d.file.url && isPdf ? <iframe src={d.file.url} title={`${d.title} 증빙자료`} />
              : (
                <div className="gr-paper">
                  <small className="mono muted">증빙자료 원본 미리보기</small>
                  <h3>{d.title}</h3>
                  <hr />
                  <p className="muted">{d.file.url ? '미리보기를 지원하지 않는 형식입니다.' : '[목업 시드 데이터에는 원본 파일이 없습니다]'}</p>
                </div>
              )}
        </div>
        <div className="gr-file">
          <span className="chip">{d.file.fileName}</span>
          <span className="muted mono gr-small">{d.file.contentType}</span>
          {d.file.url && <a href={d.file.url} target="_blank" rel="noopener noreferrer">원본 새 탭에서 보기</a>}
        </div>
      </div>

      <div className="gr-right">
        <section className="card gr-ai" aria-labelledby="gr-ai-h" aria-live="polite">
          <div className="gr-ai-head">
            <h2 id="gr-ai-h">AI 분석 결과</h2>
            <span className="chip chip-line mono">OCR · LLM</span>
          </div>
          {!ai || ai.status === 'PROCESSING' ? (
            <p className="gr-ai-wait"><i className="gr-dot" aria-hidden="true" />AI가 파일을 분석하고 있습니다. 3초마다 결과를 확인합니다.</p>
          ) : ai.status === 'FAILED' ? (
            <>
              <p className="gr-reason-empty text-minus">파일에서 내용을 읽지 못했습니다. 원본을 보고 직접 판단하거나 다시 분석해 보세요.</p>
              <button type="button" className="btn" onClick={reanalyze} disabled={reBusy}>{reBusy ? '요청 중…' : 'AI 재분석'}</button>
            </>
          ) : (
            <>
              {ai.duplicateSuspect && (
                <div className="gr-dup" role="note">
                  <b>중복 인정 의심</b>
                  <span>이미 인정된 내역 '{ai.duplicateSuspect.content}' ({fmtDate(ai.duplicateSuspect.createdAt)})과 같은 실적일 수 있습니다.</span>
                  <Link to={`/students/${d.student.studentId}?tab=history&detailId=${ai.duplicateSuspect.detailId}`}>기존 내역 보기 ›</Link>
                </div>
              )}
              <dl>
                {ai.extracted && <>
                  <dt>구분</dt><dd>{EXTRACTED_KIND_LABEL[ai.extracted.kind]}</dd>
                  <dt>명칭</dt><dd>{ai.extracted.name ?? '—'}</dd>
                  <dt>발급 기관</dt><dd>{ai.extracted.issuer ?? '—'}</dd>
                  {ai.extracted.award && <><dt>수상 등급</dt><dd>{ai.extracted.award}</dd></>}
                  <dt>취득 · 수상일</dt><dd className="mono">{ai.extracted.achievedAt ?? '—'}</dd>
                </>}
                {ai.recommendation ? <>
                  <dt>추천 영역</dt><dd>{SCORE_TYPE_LABEL[ai.recommendation.scoreType]}</dd>
                  <dt>추천 항목</dt><dd>{ai.recommendation.itemName}</dd>
                  <dt>예상 점수</dt><dd className="mono strong">+{ai.recommendation.expectedPoints}</dd>
                </> : <><dt>추천</dt><dd className="muted">추천할 평가항목을 찾지 못했습니다.</dd></>}
              </dl>
              {ai.recommendation && <p className="gr-reason">판단 근거 · {ai.recommendation.reason}</p>}
              <div className="gr-ai-foot">
                <span className="muted mono gr-small">분석 {fmtDateTime(ai.analyzedAt)}</span>
                <button type="button" className="linkbtn" onClick={reanalyze} disabled={reBusy}>{reBusy ? '요청 중…' : '다시 분석'}</button>
              </div>
            </>
          )}
          {reErr && <p className="text-minus gr-small" role="alert">{reErr}</p>}
        </section>

        <Decision key={`${d.evidenceId}-${ai?.status ?? 'none'}`} detail={d} items={items} onDone={onDone} />
      </div>
    </>
  );
}

/* 평가항목 선택 + 점수 입력 공통 */
function ItemFields({ idPrefix, items, scoreType, setScoreType, itemId, setItemId, errs }: {
  idPrefix: string; items: ScoreItem[];
  scoreType: ScoreType | ''; setScoreType: (t: ScoreType | '') => void;
  itemId: number | null; setItemId: (n: number | null) => void;
  errs: Record<string, string>;
}) {
  const options = items.filter((i) => i.scoreType === scoreType);
  const item = items.find((i) => i.itemId === itemId) ?? null;
  return (
    <>
      <div className="field">
        <label className="label" htmlFor={`${idPrefix}-type`}>영역</label>
        <select id={`${idPrefix}-type`} className="select" value={scoreType} aria-invalid={!!errs.scoreType} onChange={(e) => {
          const t = e.target.value as ScoreType | '';
          setScoreType(t);
          setItemId(items.find((i) => i.scoreType === t)?.itemId ?? null);
        }}>
          <option value="">영역 선택</option>
          {SCORE_TYPES.map((t) => <option key={t} value={t}>{SCORE_TYPE_LABEL[t]}</option>)}
        </select>
        {errs.scoreType && <p className="text-minus gr-small">{errs.scoreType}</p>}
      </div>
      <div className="field">
        <label className="label" htmlFor={`${idPrefix}-item`}>평가항목</label>
        <select id={`${idPrefix}-item`} className="select" value={itemId ?? ''} disabled={!scoreType} aria-invalid={!!errs.itemId} onChange={(e) => setItemId(e.target.value ? Number(e.target.value) : null)}>
          {!scoreType && <option value="">영역을 먼저 고르세요</option>}
          {options.map((i) => <option key={i.itemId} value={i.itemId}>{i.name} (최대 {i.maxPoints}점)</option>)}
        </select>
        {item?.description && <p className="muted gr-small">기준 · {item.description}</p>}
        {errs.itemId && <p className="text-minus gr-small">{errs.itemId}</p>}
      </div>
    </>
  );
}

/* 서버 오류 표시 (EXCEEDS_MAX_POINTS · DUPLICATE_ACHIEVEMENT 등) */
interface GrantError { message: string; remaining?: number; dupDetailId?: string; }
function toGrantError(e: unknown): GrantError {
  const out: GrantError = { message: errorMessage(e) };
  if (e instanceof ApiError) {
    if (e.code === 'EXCEEDS_MAX_POINTS' && typeof e.body.remainingPoints === 'number') out.remaining = e.body.remainingPoints;
    if (e.code === 'DUPLICATE_ACHIEVEMENT' && typeof e.body.detailId === 'string') out.dupDetailId = e.body.detailId;
  }
  return out;
}
function GrantErrorBox({ err, studentId, onUseRemaining }: { err: GrantError; studentId: string; onUseRemaining: (n: number) => void }) {
  return (
    <div className="gr-errbox" role="alert">
      <p>{err.message}</p>
      {err.remaining !== undefined && (err.remaining > 0
        ? <button type="button" className="linkbtn" onClick={() => onUseRemaining(err.remaining!)}>남은 한도 {err.remaining}점으로 맞추기</button>
        : <p className="gr-small">이 항목은 남은 인정 한도가 없습니다. 다른 항목을 고르세요.</p>)}
      {err.dupDetailId && <Link to={`/students/${studentId}?tab=history&detailId=${err.dupDetailId}`}>기존 인정 내역 보기 ›</Link>}
    </div>
  );
}

function Decision({ detail, items, onDone }: { detail: EvidenceDetail; items: ScoreItem[]; onDone: (msg: string) => void }) {
  const ai = detail.aiAnalysis;
  const rec = ai?.status === 'DONE' ? ai.recommendation : null;
  const ext = ai?.status === 'DONE' ? ai.extracted : null;
  const recItem = rec ? items.find((i) => i.itemId === rec.itemId) ?? null : null;
  const [scoreType, setScoreType] = useState<ScoreType | ''>(recItem?.scoreType ?? '');
  const [itemId, setItemId] = useState<number | null>(recItem?.itemId ?? null);
  const [pts, setPts] = useState(rec && recItem ? String(Math.min(rec.expectedPoints, recItem.maxPoints)) : '');
  const [content, setContent] = useState(((ext?.name ?? detail.title) + (ext?.award ? ` ${ext.award}` : '')).slice(0, 50));
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<GrantError | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});

  const item = items.find((i) => i.itemId === itemId) ?? null;
  const n = Number(pts);
  const ptsOk = pts !== '' && Number.isInteger(n) && n >= 1 && (!item || n <= item.maxPoints);
  const c = content.trim();
  const valid = !!scoreType && !!item && ptsOk && c.length >= 1 && c.length <= 50;
  const r = reason.trim();

  async function run(action: () => Promise<string>) {
    setBusy(true); setErr(null); setErrs({});
    try {
      onDone(await action());
    } catch (e) {
      if (e instanceof ApiError && e.code === 'EVIDENCE_ALREADY_REVIEWED') { onDone(e.message); return; }
      setErrs(fieldErrorMap(e));
      setErr(toGrantError(e));
      setBusy(false);
    }
  }
  const name = detail.student.name;

  return (
    <section className="card gr-confirm" aria-labelledby="gr-c-h">
      <h2 id="gr-c-h">점수 확정</h2>
      <ItemFields idPrefix="gr" items={items} scoreType={scoreType} setScoreType={setScoreType} itemId={itemId}
        setItemId={(id) => { setItemId(id); const it = items.find((i) => i.itemId === id); if (it && Number(pts) > it.maxPoints) setPts(String(it.maxPoints)); }} errs={errs} />
      <div className="field">
        <label className="label mono" htmlFor="gr-pts">인정 점수{item && ` (최대 ${item.maxPoints})`}</label>
        <input id="gr-pts" className="input mono gr-pts" type="number" inputMode="numeric" min={1} max={item?.maxPoints} value={pts} onChange={(e) => setPts(e.target.value)} aria-invalid={pts !== '' && !ptsOk} />
        {pts !== '' && !ptsOk && <p className="text-minus gr-small">1 ~ {item?.maxPoints ?? '최대'} 사이 정수로 입력하세요.</p>}
        {errs.points && <p className="text-minus gr-small">{errs.points}</p>}
      </div>
      <div className="field">
        <label className="label" htmlFor="gr-content"><span>부여 사유</span><span className="mono">{c.length}/50</span></label>
        <input id="gr-content" className="input" maxLength={50} value={content} onChange={(e) => setContent(e.target.value)} placeholder="예: 정보처리기능사 취득" aria-invalid={!!errs.content} />
        {errs.content && <p className="text-minus gr-small">{errs.content}</p>}
      </div>

      {rejecting ? (
        <div className="field">
          <label className="label" htmlFor="gr-reason"><span>반려 사유 (학생에게 전달됩니다)</span><span className="mono">{r.length}/200</span></label>
          <textarea id="gr-reason" className="textarea gr-reject" autoFocus maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="예: 발급일이 확인되지 않습니다. 원본 전체를 다시 올려 주세요." />
          {errs.reason && <p className="text-minus gr-small">{errs.reason}</p>}
          <div className="gr-btns">
            <button type="button" className="btn btn-lg" onClick={() => { setRejecting(false); setErr(null); }} disabled={busy}>취소</button>
            <button type="button" className="btn btn-lg text-minus" disabled={busy || r.length < 1 || r.length > 200}
              onClick={() => run(async () => { await rejectEvidence(detail.evidenceId, r); return `${name} 학생의 '${detail.title}'을(를) 반려했습니다.`; })}>{busy ? '처리 중…' : '반려 확정'}</button>
          </div>
        </div>
      ) : (
        <div className="gr-btns">
          <button type="button" className="btn btn-lg text-minus" onClick={() => { setRejecting(true); setErr(null); }} disabled={busy}>반려</button>
          <button type="button" className="btn btn-primary btn-lg" disabled={!valid || busy}
            onClick={() => run(async () => {
              const res = await approveEvidence(detail.evidenceId, { scoreType: scoreType as ScoreType, itemId: item!.itemId, points: n, content: c });
              return `${name} 학생에게 ${SCORE_TYPE_LABEL[res.studentScore.scoreType]} +${res.scoreDetail.points}점을 반영했습니다. (영역 ${res.studentScore.rawScore}점 · 총점 ${res.studentScore.totalScore}점)`;
            })}>
            {busy ? '처리 중…' : `승인하고 +${ptsOk ? n : 0}점 반영`}
          </button>
        </div>
      )}
      {err && <GrantErrorBox err={err} studentId={detail.student.studentId} onUseRemaining={(m) => { setPts(String(m)); setErr(null); }} />}
    </section>
  );
}

/* ================= 직접 부여 ================= */
function Direct({ items, notify }: { items: ScoreItem[]; notify: (m: string) => void }) {
  const [student, setStudent] = useState<TeacherStudent | null>(null);
  const [scoreType, setScoreType] = useState<ScoreType | ''>('');
  const [itemId, setItemId] = useState<number | null>(null);
  const [pts, setPts] = useState('');
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<GrantError | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [last, setLast] = useState<string | null>(null);

  const item = items.find((i) => i.itemId === itemId) ?? null;
  const n = Number(pts);
  const ptsOk = pts !== '' && Number.isInteger(n) && n !== 0 && (!item || n <= item.maxPoints);
  const c = content.trim();
  const valid = !!student && !!scoreType && !!item && ptsOk && c.length >= 1 && c.length <= 50;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid || !student) return;
    setBusy(true); setErr(null); setErrs({}); setLast(null);
    try {
      const r = await grantMeisterScore({ studentId: student.studentId, scoreType: scoreType as ScoreType, itemId: item!.itemId, points: n, content: c });
      const msg = `${student.name}(${studentNo(student)}) 학생 ${SCORE_TYPE_LABEL[r.studentScore.scoreType]} ${signed(r.scoreDetail.points)}점 반영`;
      notify(msg + '했습니다.');
      setLast(`${msg} → 영역 ${r.studentScore.rawScore}점 · 총점 ${r.studentScore.totalScore}점`);
      setStudent({ ...student, totalScore: r.studentScore.totalScore });
      setPts(''); setContent('');
    } catch (ex) {
      setErrs(fieldErrorMap(ex));
      setErr(toGrantError(ex));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card gr-form" onSubmit={submit} noValidate>
      <p className="muted">증빙 제출 없이 교사가 바로 점수를 부여합니다. 잘못 부여한 점수는 음수로 입력해 정정할 수 있습니다. 학생에게 점수 변경 알림이 갑니다.</p>
      <StudentPicker value={student} onChange={(s) => { setStudent(s); setLast(null); }} />
      <div className="gr-form-row">
        <ItemFields idPrefix="gd" items={items} scoreType={scoreType} setScoreType={setScoreType} itemId={itemId} setItemId={setItemId} errs={errs} />
        <div className="field">
          <label className="label mono" htmlFor="gd-pts">점수{item && ` (최대 ${item.maxPoints})`}</label>
          <input id="gd-pts" className="input mono" type="number" inputMode="numeric" max={item?.maxPoints} value={pts} onChange={(e) => setPts(e.target.value)} aria-invalid={pts !== '' && !ptsOk} />
          {pts !== '' && !ptsOk && <p className="text-minus gr-small">0이 아닌 정수{item ? `, 최대 ${item.maxPoints}` : ''}</p>}
          {errs.points && <p className="text-minus gr-small">{errs.points}</p>}
        </div>
      </div>
      <div className="field">
        <label className="label" htmlFor="gd-content"><span>사유</span><span className="mono">{c.length}/50</span></label>
        <input id="gd-content" className="input" maxLength={50} placeholder="예: 교내 봉사활동 리더" value={content} onChange={(e) => setContent(e.target.value)} aria-invalid={!!errs.content} />
        {errs.content && <p className="text-minus gr-small">{errs.content}</p>}
      </div>
      {err && <GrantErrorBox err={err} studentId={student?.studentId ?? ''} onUseRemaining={(m) => { setPts(String(m)); setErr(null); }} />}
      {last && <p className="gr-ok" role="status">{last}</p>}
      <div className="gr-form-btn">
        <button type="submit" className="btn btn-primary btn-lg" disabled={!valid || busy}>{busy ? '처리 중…' : ptsOk && n < 0 ? `${n}점 감점` : '점수 부여'}</button>
      </div>
    </form>
  );
}

/* ================= 상벌점 부여 ================= */
function Merit({ notify }: { notify: (m: string) => void }) {
  const { state: rules } = useAsync((s) => getPointRules({}, s).then((r) => r.items), []);
  const [student, setStudent] = useState<TeacherStudent | null>(null);
  const [type, setType] = useState<PointType>('MERIT');
  const [ruleId, setRuleId] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [pts, setPts] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [last, setLast] = useState<string | null>(null);

  const ruleList: PointRule[] = rules.status === 'ok' ? rules.data.filter((r) => r.type === type) : [];
  const t = title.trim();
  const c = content.trim();
  const n = Number(pts);
  const ptsOk = pts !== '' && Number.isInteger(n) && n >= 1;
  const valid = !!student && t.length >= 1 && t.length <= 20 && c.length <= 50 && ptsOk;

  function pickRule(id: number | null) {
    setRuleId(id);
    const r = ruleList.find((x) => x.ruleId === id);
    if (r) { setTitle(r.title.slice(0, 20)); setPts(String(r.points)); }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid || !student) return;
    setBusy(true); setError(''); setErrs({}); setLast(null);
    try {
      const r = await grantMeritPoint({ studentId: student.studentId, type, ruleId, title: t, content: c || null, points: n });
      const msg = `${student.name}(${studentNo(student)}) 학생에게 ${POINT_TYPE_LABEL[r.type]} ${r.points}점 '${r.title}'을(를) 부여했습니다.`;
      notify(msg); setLast(msg);
      setRuleId(null); setTitle(''); setContent(''); setPts('');
    } catch (ex) {
      const fm = fieldErrorMap(ex);
      setErrs(fm);
      setError(errorMessage(ex));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card gr-form" onSubmit={submit} noValidate>
      <p className="muted">상벌점 기준을 고르면 제목과 점수가 채워집니다. 기준에 없는 경우 직접 입력할 수 있습니다.</p>
      <StudentPicker value={student} onChange={(s) => { setStudent(s); setLast(null); }} />
      <div className="field">
        <span className="label">구분</span>
        <div className="seg seg-accent" role="radiogroup" aria-label="상점 또는 벌점">
          {(['MERIT', 'DEMERIT'] as PointType[]).map((p) => (
            <button key={p} type="button" role="radio" aria-checked={type === p} className={type === p ? 'is-on' : ''} onClick={() => { setType(p); setRuleId(null); }}>{POINT_TYPE_LABEL[p]}</button>
          ))}
        </div>
      </div>
      <div className="field">
        <label className="label" htmlFor="gm-rule">상벌점 기준 (선택)</label>
        <select id="gm-rule" className="select" value={ruleId ?? ''} onChange={(e) => pickRule(e.target.value ? Number(e.target.value) : null)} disabled={rules.status !== 'ok'}>
          <option value="">{rules.status === 'loading' ? '불러오는 중…' : rules.status === 'error' ? '기준을 불러오지 못했습니다' : '직접 입력'}</option>
          {ruleList.map((r) => <option key={r.ruleId} value={r.ruleId}>[{r.category}] {r.title} · {r.points}점</option>)}
        </select>
        {errs.ruleId && <p className="text-minus gr-small">{errs.ruleId}</p>}
      </div>
      <div className="gr-form-row gr-form-row-2">
        <div className="field">
          <label className="label" htmlFor="gm-title"><span>제목</span><span className="mono">{t.length}/20</span></label>
          <input id="gm-title" className="input" maxLength={20} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 지각" aria-invalid={!!errs.title} />
          {errs.title && <p className="text-minus gr-small">{errs.title}</p>}
        </div>
        <div className="field">
          <label className="label mono" htmlFor="gm-pts">점수</label>
          <input id="gm-pts" className="input mono" type="number" inputMode="numeric" min={1} value={pts} onChange={(e) => setPts(e.target.value)} aria-invalid={pts !== '' && !ptsOk} />
          {pts !== '' && !ptsOk && <p className="text-minus gr-small">1 이상의 정수</p>}
          {errs.points && <p className="text-minus gr-small">{errs.points}</p>}
        </div>
      </div>
      <div className="field">
        <label className="label" htmlFor="gm-content"><span>내용 (선택)</span><span className="mono">{c.length}/50</span></label>
        <input id="gm-content" className="input" maxLength={50} value={content} onChange={(e) => setContent(e.target.value)} placeholder="예: 10분 지각" aria-invalid={!!errs.content} />
        {errs.content && <p className="text-minus gr-small">{errs.content}</p>}
      </div>
      {error && <p className="gr-errbox" role="alert">{error}</p>}
      {last && <p className="gr-ok" role="status">{last}</p>}
      <div className="gr-form-btn">
        <button type="submit" className={`btn btn-lg ${type === 'MERIT' ? 'btn-primary' : 'btn-strong text-minus'}`} disabled={!valid || busy}>{busy ? '처리 중…' : `${POINT_TYPE_LABEL[type]} 부여`}</button>
      </div>
    </form>
  );
}

/* ================= 부여 이력 ================= */
function History() {
  const [mine, setMine] = useState(true);
  const [scoreType, setScoreType] = useState<ScoreType | ''>('');
  const [page, setPage] = useState(1);
  const query = useMemo(() => ({ teacherId: mine ? 'me' : null, scoreType: scoreType || null, page }), [mine, scoreType, page]);
  const { state } = useAsync((s) => getScoreHistory(query, s), [query]);

  return (
    <section className="gr-hist">
      <div className="gr-hist-filter">
        <label className="check"><input type="checkbox" checked={mine} onChange={(e) => { setMine(e.target.checked); setPage(1); }} />내가 부여한 것만</label>
        <select className="select gr-hist-select" aria-label="영역" value={scoreType} onChange={(e) => { setScoreType(e.target.value as ScoreType | ''); setPage(1); }}>
          <option value="">전체 영역</option>
          {SCORE_TYPES.map((t) => <option key={t} value={t}>{SCORE_TYPE_LABEL[t]}</option>)}
        </select>
      </div>
      <Loadable state={state}>{(d) => d.items.length === 0 ? <p className="status-msg">부여 이력이 없습니다.</p> : (
        <div className="card gr-hist-card">
          <ul className="gr-hist-list">
            {d.items.map((h) => (
              <li key={h.detailId}>
                <span className="mono muted gr-hist-date">{fmtDateTime(h.createdAt)}</span>
                <span className="gr-hist-who"><Link to={`/students/${h.student.studentId}`}>{h.student.name}</Link> <span className="mono muted">{studentNo(h.student)}</span></span>
                <span className="gr-hist-item"><span className="muted">{SCORE_TYPE_LABEL[h.scoreType]}</span> · {h.itemName ?? '항목 없음'}</span>
                <span className="gr-hist-content">{h.content}{h.evidenceId && <span className="chip chip-line gr-hist-ev">증빙</span>}</span>
                <span className="muted gr-hist-teacher">{h.teacher.name}</span>
                <span className={`mono strong gr-hist-pts ${h.points < 0 ? 'minus' : 'plus'}`}>{signed(h.points)}</span>
              </li>
            ))}
          </ul>
          <Pager page={d.page} totalPages={d.totalPages} onPage={setPage}>
            <span className="mono muted">{d.totalElements}건</span>
          </Pager>
        </div>
      )}</Loadable>
    </section>
  );
}

function Pager({ page, totalPages, onPage, children }: { page: number; totalPages: number; onPage: (n: number) => void; children?: ReactNode }) {
  const start = Math.max(1, Math.min(page - 2, totalPages - 4));
  const nums = Array.from({ length: Math.min(5, totalPages) }, (_, i) => start + i);
  return (
    <div className="gr-hist-foot">
      {children}
      {totalPages > 1 && (
        <nav className="pager" aria-label="페이지">
          <button type="button" className="pager-text" disabled={page <= 1} onClick={() => onPage(page - 1)}>‹ 이전</button>
          {nums.map((n) => <button key={n} type="button" className={n === page ? 'is-on' : ''} aria-current={n === page ? 'page' : undefined} onClick={() => onPage(n)}>{n}</button>)}
          <button type="button" className="pager-text" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>다음 ›</button>
        </nav>
      )}
    </div>
  );
}
