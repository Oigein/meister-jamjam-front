import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError, USE_MOCK, errorMessage, fieldErrorMap } from '../api/client';
import {
  CHANGE_REASON_LABEL, NEXT_STATUSES, PREFERRED_HANDLING_LABEL, SELF_REPORT_LIMITS as L, SELF_REPORT_TYPE_LABEL,
  changeSelfReportStatus, getSelfReport, getSelfReportReplies, postSelfReportReply, selfReportAttachmentUrl, withdrawSelfReport,
  type SelfReportDetail, type SelfReportReply,
} from '../api/selfReports';
import { SELF_REPORT_STATUS_LABEL, studentNo, type SelfReportStatus } from '../api/types';
import { isTeacher } from '../api/me';
import { useMe } from '../lib/session';
import { useAsync } from '../lib/useAsync';
import { formatBytes } from '../lib/format';
import { useToast } from '../components/Toast';
import { LockIcon } from '../components/icons';
import { StatusChip, StatusSteps, fmtDate } from './SelfReportsPage';
import './SelfReports.css';

interface Data { report: SelfReportDetail; replies: SelfReportReply[]; }

const STATUS_ACTION: Partial<Record<SelfReportStatus, string>> = { IN_PROGRESS: '처리 중으로 변경', DONE: '처리 완료로 변경' };

export default function SelfReportDetailPage() {
  const { reportId = '' } = useParams();
  const me = useMe();
  const teacherView = isTeacher(me);
  const backTo = teacherView ? '/teacher/self-reports' : '/reports';
  const [version, setVersion] = useState(0);
  const reload = () => setVersion((v) => v + 1);

  // 상세를 먼저 열어야 (수신 교사면) 확인 처리가 되므로 순서대로 호출
  const { state, setData } = useAsync(async (s): Promise<Data> => {
    const report = await getSelfReport(reportId, s);
    const { items } = await getSelfReportReplies(reportId, s);
    return { report, replies: items };
  }, [reportId, version]);

  return (
    <main className="page">
      <div>
        <p className="eyebrow"><Link to={backTo} className="srp-back">‹ {teacherView ? '받은 자진 신고' : '자진 신고'}</Link></p>
        <h1 className="page-title">자진 신고 상세</h1>
        <p className="page-desc srp-private"><LockIcon /> 작성한 학생과 받는 선생님만 볼 수 있습니다.</p>
      </div>
      {state.status === 'loading' && <p className="status-msg">불러오는 중…</p>}
      {state.status === 'error' && (
        state.code === 404
          ? <div className="card srp-note"><p>신고를 찾을 수 없거나 볼 권한이 없습니다.</p><Link to={backTo} className="btn">목록으로</Link></div>
          : <p className="status-msg">정보를 불러오지 못했습니다. ({state.message})</p>
      )}
      {state.status === 'ok' && <Detail data={state.data} setData={setData} reload={reload} backTo={backTo} />}
    </main>
  );
}

function Detail({ data, setData, reload, backTo }: { data: Data; setData: (f: (d: Data) => Data) => void; reload: () => void; backTo: string }) {
  const me = useMe();
  const navigate = useNavigate();
  const { toast, show } = useToast();
  const r = data.report;
  const isRecipient = r.recipients.some((x) => x.teacherId === me.userId);
  const isAuthorView = !isTeacher(me);
  const [busy, setBusy] = useState(false);

  async function withdraw() {
    if (!window.confirm(`'${r.title}' 신고를 철회할까요? 첨부파일도 함께 삭제되며 되돌릴 수 없습니다.`)) return;
    setBusy(true);
    try {
      await withdrawSelfReport(r.reportId);
      navigate(backTo);
    } catch (e) {
      show(errorMessage(e));
      if (e instanceof ApiError && e.status === 409) reload();
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(next: SelfReportStatus) {
    if (next === 'DONE' && !window.confirm('처리 완료로 바꾸면 더 이상 답변을 주고받을 수 없습니다. 바꿀까요?')) return;
    setBusy(true);
    try {
      const report = await changeSelfReportStatus(r.reportId, next);
      setData((d) => ({ ...d, report }));
      show(`상태를 '${SELF_REPORT_STATUS_LABEL[next]}'(으)로 바꿨습니다.`);
    } catch (e) {
      show(errorMessage(e));
      if (e instanceof ApiError && e.status === 409) reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="srp-detail">
      <article className="card srp-doc">
        <div className="srp-doc-head">
          <div className="srp-chips">
            <StatusChip status={r.status} />
            <span className="chip">{SELF_REPORT_TYPE_LABEL[r.type]}</span>
            <span className="chip chip-line">{PREFERRED_HANDLING_LABEL[r.preferredHandling]}</span>
          </div>
          <h2 className="srp-doc-title">{r.title}</h2>
          <p className="muted srp-small">
            {isAuthorView ? '내가 보낸 신고' : <>{r.student.name} <span className="mono">{studentNo(r.student)}</span></>}
            {' · '}<span className="mono">{fmtDate(r.createdAt)}</span>
            {r.updatedAt !== r.createdAt && r.status === 'UNREAD' && <> · 수정됨</>}
          </p>
        </div>

        <StatusSteps status={r.status} />

        <div className="srp-body">{r.content}</div>

        {r.attachments.length > 0 && (
          <div className="srp-block">
            <h3 className="srp-h3">첨부파일</h3>
            <ul className="srp-files">
              {r.attachments.map((a) => (
                <li key={a.attachmentId}>
                  <span className="srp-file-name">
                    {USE_MOCK
                      ? a.fileName
                      : <a href={selfReportAttachmentUrl(r.reportId, a.attachmentId)} target="_blank" rel="noreferrer" download={a.fileName}>{a.fileName}</a>}
                    {' '}<span className="mono muted">{formatBytes(a.sizeBytes)}</span>
                  </span>
                </li>
              ))}
            </ul>
            {USE_MOCK && <p className="footnote">목업 모드에서는 첨부파일을 내려받을 수 없습니다.</p>}
          </div>
        )}

        <dl className="srp-meta">
          <div>
            <dt>받는 선생님</dt>
            <dd>
              {r.recipients.map((x) => (
                <span key={x.teacherId} className="srp-recipient">
                  {x.name}
                  <small className={x.readAt ? '' : 'muted'}>{x.readAt ? `${fmtDate(x.readAt)} 확인` : '아직 확인 전'}</small>
                </span>
              ))}
            </dd>
          </div>
          {r.changeReason && <div><dt>담임이 아닌 선생님께 보낸 이유</dt><dd>{CHANGE_REASON_LABEL[r.changeReason]}</dd></div>}
        </dl>

        {isAuthorView && (
          r.editable ? (
            <div className="srp-actions srp-doc-actions">
              <Link to={`/reports?edit=${r.reportId}`} className="btn">수정</Link>
              <button type="button" className="btn text-minus" disabled={busy} onClick={withdraw}>철회</button>
              <span className="muted srp-small">선생님이 확인하기 전까지만 수정 · 철회할 수 있습니다.</span>
            </div>
          ) : <p className="muted srp-small">선생님이 확인한 신고는 수정하거나 철회할 수 없습니다.</p>
        )}

        {isRecipient && NEXT_STATUSES[r.status].length > 0 && (
          <div className="srp-actions srp-doc-actions">
            {NEXT_STATUSES[r.status].map((s) => (
              <button key={s} type="button" className={`btn ${s === 'DONE' ? 'btn-primary' : ''}`} disabled={busy} onClick={() => changeStatus(s)}>{STATUS_ACTION[s]}</button>
            ))}
          </div>
        )}
      </article>

      <section className="card srp-thread" aria-labelledby="srp-thread-h">
        <h2 id="srp-thread-h" className="srp-h3">답변 <span className="mono muted">{data.replies.length}</span></h2>
        {data.replies.length === 0 && <p className="muted srp-small">아직 주고받은 답변이 없습니다.</p>}
        <ol className="srp-replies">
          {data.replies.map((x) => (
            <li key={x.replyId} className={x.author.userId === me.userId ? 'is-mine' : ''}>
              <div className="srp-reply-head">
                <b>{x.author.name}</b>
                <small className="muted">{x.author.role === 'STUDENT' ? '학생' : '선생님'} · <span className="mono">{fmtDate(x.createdAt)}</span></small>
              </div>
              <p>{x.content}</p>
            </li>
          ))}
        </ol>
        <ReplyBox report={r} onPosted={(reply) => {
          setData((d) => ({ ...d, replies: [...d.replies, reply] }));
          // 교사의 첫 답변이면 상태가 바뀔 수 있으므로 상세 다시 조회
          if (isRecipient && r.status === 'READ') reload();
        }} onClosed={reload} />
      </section>
      {toast}
    </div>
  );
}

function ReplyBox({ report, onPosted, onClosed }: { report: SelfReportDetail; onPosted: (r: SelfReportReply) => void; onClosed: () => void }) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const closed = report.status === 'DONE';

  async function send(e: FormEvent) {
    e.preventDefault();
    const content = text.trim();
    if (!content || sending || closed) return;
    setSending(true);
    setError('');
    try {
      const reply = await postSelfReportReply(report.reportId, content);
      setText('');
      onPosted(reply);
    } catch (err) {
      setError(fieldErrorMap(err).content ?? errorMessage(err));
      if (err instanceof ApiError && err.code === 'REPORT_CLOSED') onClosed();
    } finally {
      setSending(false);
    }
  }

  if (closed) return <p className="srp-closed">처리 완료된 신고라 더 이상 답변을 남길 수 없습니다.</p>;
  return (
    <form className="srp-reply-form" onSubmit={send}>
      <label className="label" htmlFor="srp-reply"><span>답변 남기기</span><span className="mono">{text.length}/{L.replyMax}</span></label>
      <textarea id="srp-reply" className="textarea" maxLength={L.replyMax} rows={3} placeholder="답변 내용을 입력하세요." value={text}
        aria-invalid={!!error} onChange={(e) => { setText(e.target.value); setError(''); }} />
      {error && <p className="srp-err" role="alert">{error}</p>}
      <div className="srp-submit">
        <button type="submit" className="btn btn-primary" disabled={!text.trim() || sending}>{sending ? '보내는 중…' : '답변 보내기'}</button>
      </div>
    </form>
  );
}
