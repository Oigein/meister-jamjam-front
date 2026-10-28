import { useEffect, useRef, useState, type DragEvent, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError, errorMessage, fieldErrorMap } from '../api/client';
import {
  CHANGE_REASONS, CHANGE_REASON_LABEL, PREFERRED_HANDLING_LABEL, SELF_REPORT_LIMITS as L, SELF_REPORT_STEPS, SELF_REPORT_TYPES, SELF_REPORT_TYPE_LABEL,
  getDefaultRecipient, getMySelfReports, getSelfReport, searchTeachers, submitSelfReport, updateSelfReport, uploadSelfReportAttachment, withdrawSelfReport,
  type ChangeReason, type DefaultRecipient, type MySelfReportItem, type SelfReportDetail, type SelfReportInput, type SelfReportType, type TeacherSummary,
} from '../api/selfReports';
import { SELF_REPORT_STATUS_LABEL, type PreferredHandling, type SelfReportStatus } from '../api/types';
import { isTeacher } from '../api/me';
import { useMe } from '../lib/session';
import { useAsync } from '../lib/useAsync';
import { formatBytes } from '../lib/format';
import { Loadable } from '../components/Loadable';
import { useToast } from '../components/Toast';
import { LockIcon, XIcon } from '../components/icons';
import './SelfReports.css';

/* ---------- 세 화면 공용 ---------- */
export function StatusSteps({ status }: { status: SelfReportStatus }) {
  const now = SELF_REPORT_STEPS.indexOf(status);
  return (
    <ol className="srp-steps" aria-label={`진행 상태: ${SELF_REPORT_STATUS_LABEL[status]}`}>
      {SELF_REPORT_STEPS.map((s, i) => (
        <li key={s} className={`${i <= now ? 'is-done' : ''} ${i === now ? 'is-now' : ''}`}>{SELF_REPORT_STATUS_LABEL[s]}</li>
      ))}
    </ol>
  );
}

export function StatusChip({ status }: { status: SelfReportStatus }) {
  const cls = status === 'UNREAD' ? 'chip-dark' : status === 'DONE' ? '' : 'chip-accent';
  return <span className={`chip ${cls} srp-status`}>{SELF_REPORT_STATUS_LABEL[status]}</span>;
}

/* 2026-10-29T14:30:00+09:00 → 10.29 14:30 (시간대 문자열 그대로 사용) */
export function fmtDate(iso: string, withTime = true) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  if (!m) return iso;
  const thisYear = String(new Date().getFullYear()) === m[1];
  const d = `${thisYear ? '' : `${m[1]}.`}${m[2]}.${m[3]}`;
  return withTime ? `${d} ${m[4]}:${m[5]}` : d;
}

const HANDLING_DESC: Record<PreferredHandling, string> = {
  MEETING: '선생님과 1:1로 이야기합니다',
  WRITTEN_REPLY: '앱 안의 비밀 메시지로 답을 받습니다',
  NOTICE_ONLY: '알리기만 하고 비밀로 처리를 요청합니다',
};
const ACCEPT = ['image/jpeg', 'image/png', 'application/pdf'];

/* ---------- 화면 ---------- */
export default function SelfReportsPage() {
  const me = useMe();
  return (
    <main className="page">
      <div>
        <p className="eyebrow">비공개</p>
        <h1 className="page-title">자진 신고</h1>
        <p className="page-desc srp-private"><LockIcon /> 다른 학생에게는 보이지 않으며, 선택한 선생님에게만 전달됩니다.</p>
      </div>
      {isTeacher(me) ? (
        <div className="card srp-note">
          <p>자진 신고 작성은 학생 계정에서만 할 수 있습니다. 선생님께 전달된 신고는 받은 신고함에서 확인하세요.</p>
          <Link to="/teacher/self-reports" className="btn btn-primary">받은 자진 신고 보기 ›</Link>
        </div>
      ) : <StudentReports />}
    </main>
  );
}

function StudentReports() {
  const [params, setParams] = useSearchParams();
  const editId = params.get('edit');
  const [listPage, setListPage] = useState(1);
  const [listVersion, setListVersion] = useState(0);
  const { toast, show } = useToast();

  const def = useAsync((s) => getDefaultRecipient(s), []);
  const editing = useAsync((s) => (editId ? getSelfReport(editId, s) : Promise.resolve(null)), [editId]);
  const list = useAsync((s) => getMySelfReports({ page: listPage }, s), [listPage, listVersion]);
  const refreshList = () => setListVersion((v) => v + 1);
  const cancelEdit = () => setParams({});

  return (
    <div className="srp-layout">
      <section className="srp-main" aria-label={editId ? '신고 수정' : '신고 작성'}>
        <Loadable state={def.state}>{(d) => {
          if (!editId) return <ReportForm key="new" def={d} onDone={(msg) => { show(msg); refreshList(); }} />;
          if (editing.state.status === 'loading') return <p className="status-msg">불러오는 중…</p>;
          if (editing.state.status === 'error') return <EditBlocked message={editing.state.code === 404 ? '신고를 찾을 수 없거나 볼 권한이 없습니다.' : editing.state.message} onCancel={cancelEdit} />;
          const r = editing.state.data;
          if (!r) return null;
          if (!r.editable) return <EditBlocked message="선생님이 이미 확인해 수정·삭제할 수 없습니다." onCancel={cancelEdit} />;
          return <ReportForm key={r.reportId} def={d} original={r} onCancel={cancelEdit} onDone={(msg) => { show(msg); refreshList(); }} />;
        }}</Loadable>
      </section>

      <aside className="srp-side" aria-labelledby="srp-hist">
        <h2 id="srp-hist" className="section-title">내 신고 내역</h2>
        <Loadable state={list.state}>{(d) => (
          <>
            {d.items.length === 0 && <p className="status-msg">아직 보낸 신고가 없습니다.</p>}
            {d.items.map((r) => (
              <HistoryItem key={r.reportId} r={r} editingId={editId}
                onWithdrawn={() => { show('신고를 철회했습니다.'); if (editId === r.reportId) cancelEdit(); refreshList(); }}
                onError={(m) => { show(m); refreshList(); }} />
            ))}
            {d.totalPages > 1 && (
              <nav className="pager srp-pager" aria-label="내 신고 페이지">
                <button type="button" className="pager-text" disabled={d.page <= 1} onClick={() => setListPage(d.page - 1)}>‹ 이전</button>
                <span className="mono muted">{d.page} / {d.totalPages}</span>
                <button type="button" className="pager-text" disabled={d.page >= d.totalPages} onClick={() => setListPage(d.page + 1)}>다음 ›</button>
              </nav>
            )}
          </>
        )}</Loadable>
      </aside>
      {toast}
    </div>
  );
}

function EditBlocked({ message, onCancel }: { message: string; onCancel: () => void }) {
  return (
    <div className="card srp-note">
      <p>{message}</p>
      <button type="button" className="btn" onClick={onCancel}>새 신고 작성하기</button>
    </div>
  );
}

function HistoryItem({ r, editingId, onWithdrawn, onError }: { r: MySelfReportItem; editingId: string | null; onWithdrawn: () => void; onError: (m: string) => void }) {
  const [busy, setBusy] = useState(false);
  async function withdraw() {
    if (!window.confirm(`'${r.title}' 신고를 철회할까요? 철회하면 되돌릴 수 없습니다.`)) return;
    setBusy(true);
    try {
      await withdrawSelfReport(r.reportId);
      onWithdrawn();
    } catch (e) {
      onError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className={`card srp-item ${editingId === r.reportId ? 'is-editing' : ''}`}>
      <div className="srp-item-top">
        <h3><Link to={`/me/self-reports/${r.reportId}`}>{r.title}</Link></h3>
        <span className="mono muted">{fmtDate(r.createdAt, false)}</span>
      </div>
      <p className="muted srp-small">
        {SELF_REPORT_TYPE_LABEL[r.type]} · {r.recipients.map((t) => t.name).join(', ')}
        {r.hasNewReply && <span className="srp-new">새 답변</span>}
      </p>
      <StatusSteps status={r.status} />
      <div className="srp-actions">
        <Link to={`/me/self-reports/${r.reportId}`} className="btn btn-sm">자세히</Link>
        {r.status === 'UNREAD' && (
          <>
            <Link to={`/reports?edit=${r.reportId}`} className="btn btn-sm">수정</Link>
            <button type="button" className="btn btn-sm text-minus" disabled={busy} onClick={withdraw}>철회</button>
          </>
        )}
      </div>
    </article>
  );
}

/* ---------- 작성·수정 폼 ---------- */
interface FileItem { key: string; name: string; size: number; state: 'uploading' | 'done' | 'error'; attachmentId?: string; error?: string; ctrl?: AbortController; }

let fileSeq = 0;

function ReportForm({ def, original, onDone, onCancel }: {
  def: DefaultRecipient; original?: SelfReportDetail; onDone: (msg: string) => void; onCancel?: () => void;
}) {
  const navigate = useNavigate();
  const initialRecipient: TeacherSummary | null = original
    ? (original.recipients[0] && { teacherId: original.recipients[0].teacherId, name: original.recipients[0].name, subject: null, position: def.teacher?.teacherId === original.recipients[0].teacherId ? def.teacher.position : '' })
    : def.teacher;

  const [recipient, setRecipient] = useState<TeacherSummary | null>(initialRecipient);
  const [changeReason, setChangeReason] = useState<ChangeReason | ''>(original?.changeReason ?? '');
  const [picking, setPicking] = useState(false);
  const [type, setType] = useState<SelfReportType | ''>(original?.type ?? '');
  const [title, setTitle] = useState(original?.title ?? '');
  const [content, setContent] = useState(original?.content ?? '');
  const [handling, setHandling] = useState<PreferredHandling>(original?.preferredHandling ?? 'WRITTEN_REPLY');
  const [files, setFiles] = useState<FileItem[]>(() => (original?.attachments ?? []).map((a) => ({ key: a.attachmentId, name: a.fileName, size: a.sizeBytes, state: 'done', attachmentId: a.attachmentId })));
  const [fileError, setFileError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [sending, setSending] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // 언마운트 시 진행 중 업로드 취소
  const filesRef = useRef(files);
  filesRef.current = files;
  useEffect(() => () => filesRef.current.forEach((f) => f.ctrl?.abort()), []);
  useEffect(() => { if (original) formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, [original]);

  const isDefault = !!recipient && recipient.teacherId === def.teacher?.teacherId;
  const needsReason = !!recipient && !isDefault;
  const uploading = files.some((f) => f.state === 'uploading');
  const valid = !!recipient && !!type && title.trim().length > 0 && content.trim().length > 0 && (!needsReason || !!changeReason) && !uploading;
  const usedSlots = files.filter((f) => f.state !== 'error').length;

  function clearErr(k: string) { if (errors[k]) setErrors((e) => { const n = { ...e }; delete n[k]; return n; }); }

  function addFiles(list: FileList | null) {
    if (!list) return;
    setFileError('');
    let slots = L.maxFiles - usedSlots;
    for (const f of Array.from(list)) {
      const okType = ACCEPT.includes(f.type) || /\.(jpe?g|png|pdf)$/i.test(f.name);
      if (!okType) { setFileError(`${f.name}: JPG, PNG, PDF만 올릴 수 있습니다.`); continue; }
      if (f.size > L.maxFileBytes) { setFileError(`${f.name}: 10MB를 넘습니다.`); continue; }
      if (slots <= 0) { setFileError(`첨부파일은 최대 ${L.maxFiles}개입니다.`); break; }
      slots--;
      const key = `f${++fileSeq}`;
      const ctrl = new AbortController();
      setFiles((xs) => [...xs, { key, name: f.name, size: f.size, state: 'uploading', ctrl }]);
      uploadSelfReportAttachment(f, ctrl.signal)
        .then((a) => setFiles((xs) => xs.map((x) => (x.key === key ? { ...x, state: 'done', attachmentId: a.attachmentId, ctrl: undefined } : x))))
        .catch((e: unknown) => {
          if (ctrl.signal.aborted) return;
          setFiles((xs) => xs.map((x) => (x.key === key ? { ...x, state: 'error', error: errorMessage(e), ctrl: undefined } : x)));
        });
    }
    clearErr('attachmentIds');
  }

  function removeFile(key: string) {
    setFiles((xs) => {
      xs.find((x) => x.key === key)?.ctrl?.abort();
      return xs.filter((x) => x.key !== key);
    });
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  }

  function pickTeacher(t: TeacherSummary) {
    setRecipient(t);
    setPicking(false);
    clearErr('recipientIds');
    if (t.teacherId === def.teacher?.teacherId) { setChangeReason(''); clearErr('changeReason'); }
  }

  function reset() {
    setRecipient(def.teacher); setChangeReason(''); setType(''); setTitle(''); setContent(''); setHandling('WRITTEN_REPLY');
    setFiles([]); setFileError(''); setErrors({}); setFormError('');
  }

  function buildInput(): SelfReportInput {
    return {
      type: type as SelfReportType,
      title: title.trim(),
      content: content.trim(),
      recipientIds: recipient ? [recipient.teacherId] : [],
      changeReason: needsReason && changeReason ? changeReason : null,
      preferredHandling: handling,
      attachmentIds: files.filter((f) => f.state === 'done' && f.attachmentId).map((f) => f.attachmentId!),
    };
  }

  /* 수정: 바뀐 필드만 */
  function diff(o: SelfReportDetail, n: SelfReportInput) {
    const p: Partial<SelfReportInput> = {};
    if (n.type !== o.type) p.type = n.type;
    if (n.title !== o.title) p.title = n.title;
    if (n.content !== o.content) p.content = n.content;
    if (n.preferredHandling !== o.preferredHandling) p.preferredHandling = n.preferredHandling;
    const oldR = o.recipients.map((x) => x.teacherId);
    if (oldR.join() !== n.recipientIds.join()) p.recipientIds = n.recipientIds;
    if ((o.changeReason ?? null) !== n.changeReason || p.recipientIds) p.changeReason = n.changeReason;
    const oldA = o.attachments.map((a) => a.attachmentId).sort().join();
    if (oldA !== [...n.attachmentIds].sort().join()) p.attachmentIds = n.attachmentIds;
    return p;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid || sending) return;
    setSending(true);
    setErrors({});
    setFormError('');
    try {
      const input = buildInput();
      if (original) {
        const patch = diff(original, input);
        if (Object.keys(patch).length === 0) { onDone('바뀐 내용이 없습니다.'); setSending(false); return; }
        await updateSelfReport(original.reportId, patch);
        onDone('신고 내용을 수정했습니다.');
        navigate(`/me/self-reports/${original.reportId}`);
      } else {
        await submitSelfReport(input);
        reset();
        onDone('제출했습니다. 선생님이 확인하면 알림으로 알려드릴게요.');
      }
    } catch (err) {
      const fe = fieldErrorMap(err);
      if (err instanceof ApiError && (err.code === 'TOO_MANY_RECIPIENTS' || err.code === 'INVALID_RECIPIENT')) fe.recipientIds = err.message;
      setErrors(fe);
      setFormError(Object.keys(fe).length ? '입력값을 확인해 주세요.' : errorMessage(err));
    } finally {
      setSending(false);
    }
  }

  const err = (k: string) => errors[k] ? <p className="srp-err" role="alert">{errors[k]}</p> : null;

  return (
    <form ref={formRef} className="card srp-form" onSubmit={submit} noValidate>
      {original && (
        <div className="srp-editing">
          <span>제출한 신고를 수정하는 중입니다. 선생님이 확인하기 전까지만 수정할 수 있어요.</span>
          <button type="button" className="linkbtn" onClick={onCancel}>수정 취소</button>
        </div>
      )}

      <div className="field">
        <span className="label" id="srp-to"><span>받는 선생님 <span className="req">*</span></span></span>
        {def.isFallback && def.teacher && isDefault && (
          <p className="srp-fallback">담임 선생님이 아직 등록되지 않아 {def.teacher.name}께 전달됩니다.</p>
        )}
        {!def.teacher && !recipient && <p className="srp-fallback">기본으로 받을 선생님이 없습니다. 아래에서 선생님을 직접 선택해 주세요.</p>}
        <div className="srp-teachers" role="group" aria-labelledby="srp-to">
          {recipient && (
            <span className="srp-teacher">
              {recipient.name}
              <small>{[recipient.position, recipient.subject].filter(Boolean).join(' · ')}{isDefault ? (def.isFallback ? ' · 기본(대체)' : ' · 담임') : ''}</small>
              {!isDefault && def.teacher && (
                <button type="button" aria-label="기본 선생님으로 되돌리기" title="기본 선생님으로 되돌리기" onClick={() => pickTeacher(def.teacher!)}><XIcon size={14} /></button>
              )}
            </span>
          )}
          {!picking && <button type="button" className="btn btn-dashed srp-change" onClick={() => setPicking(true)}>{recipient ? '담당 교사 변경' : '선생님 선택'}</button>}
        </div>
        {picking && <TeacherPicker currentId={recipient?.teacherId ?? null} onPick={pickTeacher} onClose={() => setPicking(false)} />}
        {err('recipientIds')}
        {needsReason && (
          <div className="srp-reason">
            <label className="label" htmlFor="srp-reason"><span>담임이 아닌 선생님께 보내는 이유 <span className="req">*</span></span></label>
            <select id="srp-reason" className="select" value={changeReason} aria-invalid={!!errors.changeReason}
              onChange={(e) => { setChangeReason(e.target.value as ChangeReason); clearErr('changeReason'); }}>
              <option value="" disabled>이유 선택</option>
              {CHANGE_REASONS.map((r) => <option key={r} value={r}>{CHANGE_REASON_LABEL[r]}</option>)}
            </select>
            {err('changeReason')}
          </div>
        )}
      </div>

      <div className="srp-row">
        <div className="field">
          <label className="label" htmlFor="srp-type"><span>신고 유형 <span className="req">*</span></span></label>
          <select id="srp-type" className="select" value={type} aria-invalid={!!errors.type} onChange={(e) => { setType(e.target.value as SelfReportType); clearErr('type'); }}>
            <option value="" disabled>유형 선택</option>
            {SELF_REPORT_TYPES.map((t) => <option key={t} value={t}>{SELF_REPORT_TYPE_LABEL[t]}</option>)}
          </select>
          {err('type')}
        </div>
        <div className="field">
          <label className="label" htmlFor="srp-title"><span>제목 <span className="req">*</span></span><span className="mono">{title.length}/{L.titleMax}</span></label>
          <input id="srp-title" className="input" maxLength={L.titleMax} placeholder="한 줄로 요약해 주세요" value={title} aria-invalid={!!errors.title}
            onChange={(e) => { setTitle(e.target.value); clearErr('title'); }} />
          {err('title')}
        </div>
      </div>

      <div className="field">
        <label className="label" htmlFor="srp-content"><span>내용 <span className="req">*</span></span><span className="mono">{content.length}/{L.contentMax}</span></label>
        <textarea id="srp-content" className="textarea srp-textarea" maxLength={L.contentMax} placeholder="언제, 어디서, 어떤 일이 있었는지 편하게 적어 주세요." value={content} aria-invalid={!!errors.content}
          onChange={(e) => { setContent(e.target.value); clearErr('content'); }} />
        {err('content')}
      </div>

      <div className="field">
        <span className="label">첨부파일 (선택, 최대 {L.maxFiles}개 · 개당 10MB)</span>
        <div className={`srp-drop ${dragging ? 'is-drag' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop}>
          <button type="button" onClick={() => fileRef.current?.click()} disabled={usedSlots >= L.maxFiles}>
            {usedSlots >= L.maxFiles ? '첨부파일을 모두 올렸습니다' : '파일을 끌어오거나 눌러서 선택 · JPG, PNG, PDF'}
          </button>
          <input ref={fileRef} type="file" hidden multiple accept=".jpg,.jpeg,.png,.pdf" data-testid="srp-file"
            onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
        </div>
        {fileError && <p className="srp-err" role="alert">{fileError}</p>}
        {err('attachmentIds')}
        {files.length > 0 && (
          <ul className="srp-files">
            {files.map((f) => (
              <li key={f.key} className={`is-${f.state}`}>
                <span className="srp-file-name">
                  {f.name} <span className="mono muted">{formatBytes(f.size)}</span>
                  {f.state === 'uploading' && <span className="srp-file-state">올리는 중…</span>}
                  {f.state === 'error' && <span className="srp-file-state text-minus">{f.error}</span>}
                </span>
                {f.state === 'uploading' && <span className="srp-progress" aria-hidden="true"><i /></span>}
                <button type="button" aria-label={`${f.name} ${f.state === 'uploading' ? '업로드 취소' : '삭제'}`} onClick={() => removeFile(f.key)}><XIcon size={14} /></button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <fieldset className="field srp-methods">
        <legend className="label"><span>희망 처리 방식 <span className="req">*</span></span></legend>
        {(Object.keys(HANDLING_DESC) as PreferredHandling[]).map((m) => (
          <label key={m} className={`srp-method ${handling === m ? 'is-on' : ''}`}>
            <input type="radio" name="handling" checked={handling === m} onChange={() => { setHandling(m); clearErr('preferredHandling'); }} />
            <span><b>{PREFERRED_HANDLING_LABEL[m]}</b><small>{HANDLING_DESC[m]}</small></span>
          </label>
        ))}
        {err('preferredHandling')}
      </fieldset>

      <p className="srp-notice">본 자진 신고는 담당 선생님에게만 안전하게 전달됩니다. 신중하게 작성해 주세요. 선생님이 확인하기 전까지는 수정하거나 철회할 수 있습니다.</p>
      {formError && <p className="srp-err srp-form-err" role="alert">{formError}</p>}
      <div className="srp-submit">
        {original && <button type="button" className="btn btn-lg" onClick={onCancel}>취소</button>}
        <button type="submit" className="btn btn-primary btn-lg" disabled={!valid || sending}>
          {sending ? '보내는 중…' : uploading ? '파일 올리는 중…' : original ? '수정하기' : '제출하기'}
        </button>
      </div>
    </form>
  );
}

/* 교사 검색 (GET /api/teachers?q=) → 1명 선택 */
function TeacherPicker({ currentId, onPick, onClose }: { currentId: string | null; onPick: (t: TeacherSummary) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => { const t = setTimeout(() => setDebounced(q.trim()), 250); return () => clearTimeout(t); }, [q]);
  const { state } = useAsync((s) => searchTeachers({ q: debounced }, s), [debounced]);

  return (
    <div className="srp-picker">
      <div className="srp-picker-head">
        <input className="input" autoFocus placeholder="이름 · 과목 · 직책으로 검색" value={q} aria-label="선생님 검색"
          onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }} />
        <button type="button" className="btn" onClick={onClose}>닫기</button>
      </div>
      <Loadable state={state}>{(d) => d.items.length === 0 ? <p className="status-msg">검색 결과가 없습니다.</p> : (
        <ul className="srp-picker-list" aria-label="선생님 목록">
          {d.items.map((t) => (
            <li key={t.teacherId}>
              <button type="button" className={t.teacherId === currentId ? 'is-on' : ''} onClick={() => onPick(t)}>
                <b>{t.name}</b>
                <small>{[t.position, t.subject].filter(Boolean).join(' · ')}</small>
              </button>
            </li>
          ))}
        </ul>
      )}</Loadable>
    </div>
  );
}
