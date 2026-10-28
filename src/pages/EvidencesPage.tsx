import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ANALYSIS_STATUS_LABEL, EVIDENCE_ACCEPT, EVIDENCE_MAX_BYTES, EXTRACTED_KIND_LABEL,
  fmtDate, fmtDateTime, getEvidence, getMyEvidences, submitEvidence,
  type EvidenceDetail, type MyEvidenceItem,
} from '../api/award';
import { ApiError, errorMessage, fieldErrorMap } from '../api/client';
import { EVIDENCE_STATUS_LABEL, SCORE_TYPES, SCORE_TYPE_LABEL, type EvidenceStatus, type Page, type ScoreType } from '../api/types';
import { isTeacher } from '../api/me';
import { useMe } from '../lib/session';
import { formatBytes } from '../lib/format';
import { useToast } from '../components/Toast';
import './EvidencesPage.css';

export default function EvidencesPage() {
  const me = useMe();
  if (isTeacher(me)) {
    return (
      <main className="page">
        <div><p className="eyebrow">마이스터 역량</p><h1 className="page-title">증빙자료 제출</h1></div>
        <p className="status-msg">증빙자료 제출은 학생 화면입니다. 학생이 올린 증빙자료는 <Link to="/grading">점수 부여 › 증빙자료 검토</Link>에서 확인하세요.</p>
      </main>
    );
  }
  return <StudentEvidences />;
}

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
const allowedFile = (f: File) => ALLOWED_TYPES.includes(f.type) || /\.(jpe?g|png|pdf)$/i.test(f.name);
const STATUS_FILTERS: [EvidenceStatus | null, string][] = [[null, '전체'], ['PENDING', '검토 대기'], ['APPROVED', '승인'], ['REJECTED', '반려']];

function StudentEvidences() {
  const { evidenceId } = useParams();
  const navigate = useNavigate();
  const { toast, show } = useToast();
  const [status, setStatus] = useState<EvidenceStatus | null>(null);
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [list, setList] = useState<{ status: 'loading' } | { status: 'error'; message: string } | { status: 'ok'; data: Page<MyEvidenceItem> }>({ status: 'loading' });

  useEffect(() => {
    const ctrl = new AbortController();
    getMyEvidences({ status, page }, ctrl.signal)
      .then((data) => setList({ status: 'ok', data }))
      .catch((e) => { if (!ctrl.signal.aborted) setList({ status: 'error', message: errorMessage(e) }); });
    return () => ctrl.abort();
  }, [status, page, reload]);

  // AI 분석 중인 항목이 있으면 3초마다 다시 조회
  const hasProcessing = list.status === 'ok' && list.data.items.some((i) => i.status === 'PENDING' && i.analysisStatus === 'PROCESSING');
  useEffect(() => {
    if (!hasProcessing) return;
    const t = setTimeout(() => setReload((n) => n + 1), 3000);
    return () => clearTimeout(t);
  }, [hasProcessing, reload]);

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">마이스터 역량</p>
          <h1 className="page-title">증빙자료 제출</h1>
          <p className="page-desc">자격증 · 상장 · 확인서를 올리면 AI가 내용을 읽어 평가항목을 추천하고, 선생님이 확인한 뒤 점수가 반영됩니다.</p>
        </div>
      </div>

      <div className="ev-layout">
        <SubmitForm onDone={(id, title) => {
          show(`'${title}'을(를) 제출했습니다. AI 분석이 끝나면 선생님이 검토합니다.`);
          setStatus(null); setPage(1); setReload((n) => n + 1);
          navigate(`/me/evidences/${id}`);
        }} />

        <section className="ev-side" aria-labelledby="ev-list-h">
          {evidenceId && <DetailCard key={evidenceId} id={evidenceId} reloadKey={reload} onClose={() => navigate('/me/evidences')} />}

          <div className="ev-list-head">
            <h2 id="ev-list-h" className="section-title">내 제출 내역</h2>
            <div className="seg" role="tablist" aria-label="처리 상태">
              {STATUS_FILTERS.map(([s, label]) => (
                <button key={label} type="button" role="tab" aria-selected={status === s} className={status === s ? 'is-on' : ''} onClick={() => { setStatus(s); setPage(1); }}>{label}</button>
              ))}
            </div>
          </div>

          {list.status === 'loading' && <p className="status-msg">불러오는 중…</p>}
          {list.status === 'error' && <p className="status-msg">제출 내역을 불러오지 못했습니다. ({list.message})</p>}
          {list.status === 'ok' && (list.data.items.length === 0 ? (
            <p className="status-msg">{status ? `${EVIDENCE_STATUS_LABEL[status]} 상태인 증빙자료가 없습니다.` : '아직 제출한 증빙자료가 없습니다.'}</p>
          ) : (
            <>
              <ul className="ev-list">
                {list.data.items.map((it) => (
                  <li key={it.evidenceId}>
                    <Link to={`/me/evidences/${it.evidenceId}`} className={`card ev-item ${it.evidenceId === evidenceId ? 'is-on' : ''}`} aria-current={it.evidenceId === evidenceId ? 'true' : undefined}>
                      <div className="ev-item-top">
                        <b>{it.title}</b>
                        <StatusChip status={it.status} />
                      </div>
                      <div className="ev-item-meta muted">
                        <span className="mono">제출 {fmtDate(it.createdAt)}</span>
                        {it.reviewedAt && <span className="mono">처리 {fmtDate(it.reviewedAt)}</span>}
                        {it.status === 'PENDING' && it.analysisStatus && <AnalysisBadge status={it.analysisStatus} />}
                        {it.status === 'APPROVED' && it.approvedPoints !== null && <span className="plus mono strong">+{it.approvedPoints}점 반영</span>}
                      </div>
                      {it.status === 'REJECTED' && it.rejectReason && <p className="ev-reason">반려 사유 · {it.rejectReason}</p>}
                    </Link>
                  </li>
                ))}
              </ul>
              {list.data.totalPages > 1 && (
                <nav className="pager" aria-label="페이지">
                  <button type="button" className="pager-text" disabled={list.data.page === 1} onClick={() => setPage(list.data.page - 1)}>‹ 이전</button>
                  {Array.from({ length: list.data.totalPages }, (_, i) => i + 1).map((n) => (
                    <button key={n} type="button" className={n === list.data.page ? 'is-on' : ''} aria-current={n === list.data.page ? 'page' : undefined} onClick={() => setPage(n)}>{n}</button>
                  ))}
                  <button type="button" className="pager-text" disabled={list.data.page >= list.data.totalPages} onClick={() => setPage(list.data.page + 1)}>다음 ›</button>
                </nav>
              )}
            </>
          ))}
          <p className="footnote">AI 추천 점수는 참고값이며, 최종 점수는 선생님이 평가항목의 최대 인정 점수 안에서 정합니다. 승인되면 알림이 오고 내 역량 상세의 점수 내역에 기록됩니다.</p>
        </section>
      </div>
      {toast}
    </main>
  );
}

export function StatusChip({ status }: { status: EvidenceStatus }) {
  return <span className={`chip ev-chip ev-chip-${status.toLowerCase()}`}>{EVIDENCE_STATUS_LABEL[status]}</span>;
}
function AnalysisBadge({ status }: { status: keyof typeof ANALYSIS_STATUS_LABEL }) {
  return <span className={`ev-ai ev-ai-${status.toLowerCase()}`}>{status === 'PROCESSING' && <i className="ev-dot" aria-hidden="true" />}{ANALYSIS_STATUS_LABEL[status]}</span>;
}

/* ---------- 제출 폼 ---------- */
function SubmitForm({ onDone }: { onDone: (id: string, title: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [scoreType, setScoreType] = useState<ScoreType | ''>('');
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);

  function pick(f: File | null | undefined) {
    setError('');
    if (!f) return;
    const next = { ...errs };
    delete next.file;
    if (!allowedFile(f)) next.file = 'JPG, PNG, PDF 파일만 올릴 수 있습니다.';
    else if (f.size > EVIDENCE_MAX_BYTES) next.file = `파일은 10MB 이하만 올릴 수 있습니다. (선택한 파일 ${formatBytes(f.size)})`;
    setErrs(next);
    if (next.file) { setFile(null); if (fileRef.current) fileRef.current.value = ''; return; }
    setFile(f);
    if (!title.trim()) setTitle(f.name.replace(/\.[^.]+$/, '').slice(0, 50));
  }

  const t = title.trim();
  const valid = !!file && t.length >= 1 && t.length <= 50 && desc.length <= 200;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (!file) local.file = '증빙 파일을 선택하세요.';
    if (!t) local.title = '제목을 입력하세요.';
    if (Object.keys(local).length) { setErrs(local); return; }
    if (!valid) return;
    setBusy(true); setError(''); setErrs({});
    try {
      const r = await submitEvidence({ file: file!, title: t, description: desc.trim() || undefined, scoreType: scoreType || null });
      setFile(null); setTitle(''); setDesc(''); setScoreType('');
      if (fileRef.current) fileRef.current.value = '';
      onDone(r.evidenceId, r.title);
    } catch (err) {
      const fm = fieldErrorMap(err);
      if (err instanceof ApiError && (err.status === 413 || err.status === 415)) fm.file = err.message;
      setErrs(fm);
      if (!Object.keys(fm).length) setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card ev-form" onSubmit={submit} noValidate>
      <h2 className="section-title">새 증빙자료</h2>
      <div className="field">
        <span className="label">파일 <span className="req">필수</span></span>
        <label
          className={`ev-drop ${drag ? 'is-drag' : ''} ${errs.file ? 'is-err' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]); }}
        >
          <input ref={fileRef} className="sr-only" type="file" accept={EVIDENCE_ACCEPT} aria-invalid={!!errs.file} onChange={(e) => pick(e.target.files?.[0])} />
          {file ? (
            <span className="ev-drop-file"><b>{file.name}</b><span className="mono muted">{formatBytes(file.size)} · 다른 파일로 바꾸려면 누르세요</span></span>
          ) : (
            <span className="ev-drop-empty"><b>파일 선택</b><span className="muted">또는 여기로 끌어다 놓기 · JPG, PNG, PDF · 10MB 이하</span></span>
          )}
        </label>
        {errs.file && <p className="ev-err" role="alert">{errs.file}</p>}
      </div>
      <div className="field">
        <label className="label" htmlFor="ev-title"><span>제목 <span className="req">필수</span></span><span className="mono">{t.length}/50</span></label>
        <input id="ev-title" className="input" maxLength={50} placeholder="예: 정보처리기능사" value={title} onChange={(e) => setTitle(e.target.value)} aria-invalid={!!errs.title} />
        {errs.title && <p className="ev-err">{errs.title}</p>}
      </div>
      <div className="field">
        <label className="label" htmlFor="ev-desc"><span>설명 (선택)</span><span className="mono">{desc.length}/200</span></label>
        <textarea id="ev-desc" className="textarea ev-desc" maxLength={200} placeholder="취득 시기, 대회 이름 등 선생님이 참고할 내용" value={desc} onChange={(e) => setDesc(e.target.value)} aria-invalid={!!errs.description} />
        {errs.description && <p className="ev-err">{errs.description}</p>}
      </div>
      <div className="field">
        <label className="label" htmlFor="ev-type">예상 영역 (선택)</label>
        <select id="ev-type" className="select" value={scoreType} onChange={(e) => setScoreType(e.target.value as ScoreType | '')}>
          <option value="">잘 모르겠어요 (AI 추천)</option>
          {SCORE_TYPES.map((s) => <option key={s} value={s}>{SCORE_TYPE_LABEL[s]}</option>)}
        </select>
        {errs.scoreType && <p className="ev-err">{errs.scoreType}</p>}
      </div>
      {error && <p className="ev-err" role="alert">{error}</p>}
      <button type="submit" className="btn btn-primary btn-lg" disabled={busy || !valid}>{busy ? '올리는 중…' : '제출하기'}</button>
    </form>
  );
}

/* ---------- 선택한 제출 상세 ---------- */
function DetailCard({ id, reloadKey, onClose }: { id: string; reloadKey: number; onClose: () => void }) {
  const [st, setSt] = useState<{ status: 'loading' } | { status: 'error'; message: string; notFound: boolean } | { status: 'ok'; d: EvidenceDetail }>({ status: 'loading' });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    getEvidence(id, ctrl.signal)
      .then((d) => setSt({ status: 'ok', d }))
      .catch((e) => { if (!ctrl.signal.aborted) setSt({ status: 'error', message: errorMessage(e), notFound: e instanceof ApiError && e.status === 404 }); });
    return () => ctrl.abort();
  }, [id, reloadKey, tick]);

  const processing = st.status === 'ok' && st.d.aiAnalysis?.status === 'PROCESSING';
  useEffect(() => {
    if (!processing) return;
    const t = setTimeout(() => setTick((n) => n + 1), 3000);
    return () => clearTimeout(t);
  }, [processing, tick]);

  useEffect(() => { document.getElementById('ev-detail')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [id]);

  return (
    <article id="ev-detail" className="card ev-detail" aria-label="선택한 증빙자료">
      {st.status === 'loading' && <p className="status-msg">불러오는 중…</p>}
      {st.status === 'error' && (
        <div className="ev-detail-head">
          <p className="muted">{st.notFound ? '해당 증빙자료를 찾을 수 없습니다.' : `불러오지 못했습니다. (${st.message})`}</p>
          <button type="button" className="btn btn-sm" onClick={onClose}>닫기</button>
        </div>
      )}
      {st.status === 'ok' && (() => {
        const d = st.d;
        const ai = d.aiAnalysis;
        return (
          <>
            <div className="ev-detail-head">
              <div>
                <h3>{d.title}</h3>
                <p className="mono muted">제출 {fmtDateTime(d.createdAt)}</p>
              </div>
              <div className="ev-detail-act">
                <StatusChip status={d.status} />
                <button type="button" className="btn btn-sm" onClick={onClose} aria-label="상세 닫기">닫기</button>
              </div>
            </div>
            <div className="ev-file">
              <span className="chip">{d.file.fileName}</span>
              {d.file.url ? <a href={d.file.url} target="_blank" rel="noopener noreferrer">원본 보기</a> : <span className="muted">원본 미리보기 없음</span>}
            </div>
            {d.description && <p className="ev-desc-text">{d.description}</p>}

            {d.status === 'PENDING' && ai && (
              <div className="ev-aibox">
                <AnalysisBadge status={ai.status} />
                {ai.status === 'PROCESSING' && <p className="muted">파일 내용을 읽는 중입니다. 잠시 후 자동으로 갱신됩니다.</p>}
                {ai.status === 'FAILED' && <p className="muted">파일에서 내용을 읽지 못했습니다. 선생님이 원본을 직접 확인합니다. 흐린 사진이라면 다시 찍어 올려 주세요.</p>}
                {ai.status === 'DONE' && (
                  <dl>
                    {ai.extracted && <><dt>인식한 내용</dt><dd>{EXTRACTED_KIND_LABEL[ai.extracted.kind]} · {ai.extracted.name ?? '—'}{ai.extracted.award ? ` · ${ai.extracted.award}` : ''}</dd></>}
                    {ai.recommendation ? (
                      <><dt>추천 항목</dt><dd>{SCORE_TYPE_LABEL[ai.recommendation.scoreType]} · {ai.recommendation.itemName}</dd>
                        <dt>예상 점수</dt><dd className="mono plus strong">+{ai.recommendation.expectedPoints}</dd></>
                    ) : <><dt>추천 항목</dt><dd className="muted">없음 · 선생님이 직접 판단합니다</dd></>}
                  </dl>
                )}
                <p className="footnote">선생님 검토를 기다리고 있습니다.</p>
              </div>
            )}

            {d.status === 'APPROVED' && d.review && (
              <div className="ev-result ev-result-ok">
                <p><b>승인</b> · {d.review.teacher.name} · <span className="mono">{fmtDateTime(d.review.reviewedAt)}</span></p>
                {d.review.detailId && <Link to={`/students/${d.student.studentId}?tab=history&detailId=${d.review.detailId}`}>점수 내역에서 보기 ›</Link>}
              </div>
            )}
            {d.status === 'REJECTED' && d.review && (
              <div className="ev-result ev-result-no">
                <p><b>반려</b> · {d.review.teacher.name} · <span className="mono">{fmtDateTime(d.review.reviewedAt)}</span></p>
                <p>사유 · {d.review.rejectReason}</p>
                <p className="footnote">사유를 확인하고 보완한 파일을 새로 제출해 주세요.</p>
              </div>
            )}
          </>
        );
      })()}
    </article>
  );
}
