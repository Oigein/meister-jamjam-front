import { Link, useSearchParams } from 'react-router-dom';
import { PREFERRED_HANDLING_LABEL, SELF_REPORT_STEPS, SELF_REPORT_TYPE_LABEL, getTeacherSelfReports } from '../api/selfReports';
import { SELF_REPORT_STATUS_LABEL, studentNo, type SelfReportStatus } from '../api/types';
import { isTeacher } from '../api/me';
import { useMe } from '../lib/session';
import { useAsync } from '../lib/useAsync';
import { Loadable } from '../components/Loadable';
import { LockIcon } from '../components/icons';
import { StatusChip, fmtDate } from './SelfReportsPage';
import './SelfReports.css';

export default function TeacherSelfReportsPage() {
  const me = useMe();
  return (
    <main className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">비공개</p>
          <h1 className="page-title">받은 자진 신고</h1>
          <p className="page-desc srp-private"><LockIcon /> 선생님께 직접 전달된 신고만 보입니다.</p>
        </div>
      </div>
      {isTeacher(me) ? <Inbox /> : <p className="status-msg">교사만 볼 수 있습니다.</p>}
    </main>
  );
}

function Inbox() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('status');
  const status = SELF_REPORT_STEPS.includes(raw as SelfReportStatus) ? (raw as SelfReportStatus) : null;
  const page = Math.max(1, Number(params.get('page')) || 1);
  const go = (s: SelfReportStatus | null, p = 1) => {
    const next = new URLSearchParams();
    if (s) next.set('status', s);
    if (p > 1) next.set('page', String(p));
    setParams(next);
  };
  const { state } = useAsync((sig) => getTeacherSelfReports({ status, page }, sig), [status, page]);

  return (
    <>
      <div className="seg srp-filter" role="tablist" aria-label="처리 상태">
        {([null, ...SELF_REPORT_STEPS] as (SelfReportStatus | null)[]).map((s) => (
          <button key={s ?? 'ALL'} type="button" role="tab" aria-selected={status === s} className={status === s ? 'is-on' : ''} onClick={() => go(s)}>
            {s ? SELF_REPORT_STATUS_LABEL[s] : '전체'}
          </button>
        ))}
      </div>

      <Loadable state={state}>{(d) => {
        if (d.items.length === 0) return <p className="status-msg">{status ? `'${SELF_REPORT_STATUS_LABEL[status]}' 상태인 신고가 없습니다.` : '받은 자진 신고가 없습니다.'}</p>;
        const start = Math.max(1, Math.min(d.page - 2, d.totalPages - 4));
        const nums = Array.from({ length: Math.min(5, d.totalPages) }, (_, i) => start + i);
        return (
          <div className="card srp-inbox">
            <ul className="srp-inbox-list">
              {d.items.map((r) => (
                <li key={r.reportId} className={r.status === 'UNREAD' ? 'is-unread' : ''}>
                  <Link to={`/teacher/self-reports/${r.reportId}`} className="srp-inbox-row">
                    <span className="srp-inbox-status"><StatusChip status={r.status} /></span>
                    <span className="srp-inbox-who">{r.student.name} <span className="mono muted">{studentNo(r.student)}</span></span>
                    <span className="srp-inbox-title">
                      <span className="srp-inbox-type">{SELF_REPORT_TYPE_LABEL[r.type]}</span>
                      <b>{r.title}</b>
                      {r.hasNewReply && <span className="srp-new">새 답변</span>}
                    </span>
                    <span className="srp-inbox-handling chip chip-line">{PREFERRED_HANDLING_LABEL[r.preferredHandling]}</span>
                    <span className="srp-inbox-date mono muted">{fmtDate(r.createdAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="srp-inbox-foot">
              <span className="mono muted">{(d.page - 1) * d.size + 1}-{Math.min(d.page * d.size, d.totalElements)} / {d.totalElements}건</span>
              {d.totalPages > 1 && (
                <nav className="pager" aria-label="페이지">
                  <button type="button" className="pager-text" disabled={d.page === 1} onClick={() => go(status, d.page - 1)}>‹ 이전</button>
                  {nums.map((n) => (
                    <button key={n} type="button" className={n === d.page ? 'is-on' : ''} aria-current={n === d.page ? 'page' : undefined} onClick={() => go(status, n)}>{n}</button>
                  ))}
                  <button type="button" className="pager-text" disabled={d.page >= d.totalPages} onClick={() => go(status, d.page + 1)}>다음 ›</button>
                </nav>
              )}
            </div>
          </div>
        );
      }}</Loadable>
      <p className="footnote">확인 전인 신고가 먼저, 그다음 최신순으로 표시됩니다. 신고를 열면 학생에게 '확인 완료'로 알려집니다.</p>
    </>
  );
}
