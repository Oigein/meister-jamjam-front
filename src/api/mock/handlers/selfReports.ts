/* 자진 신고 목업 (docs/api/10-self-report.md) — 데이터는 이 파일 안에만 둔다 */
import { fail, paginate, route, validationFail } from '../server';
import {
  ME_STUDENT_ID, TEACHER_COUNSEL, TEACHER_KIM, currentUser, daysAgo, findStudent, findTeacher, isTeacherRole, isoKST,
  notifications, notify, studentRef, students, teachers, users, uuid, type MockUser,
} from '../db';
import type { FieldError } from '../../client';
import type { PreferredHandling, SelfReportStatus } from '../../types';

type ReportType = 'LOST_FOUND' | 'SCHOOL_RULE' | 'PEER_RELATION' | 'COUNSELING' | 'ETC';
type ChangeReason = 'SUBJECT' | 'COUNSELING' | 'ETC';
const TYPES: ReportType[] = ['LOST_FOUND', 'SCHOOL_RULE', 'PEER_RELATION', 'COUNSELING', 'ETC'];
const REASONS: ChangeReason[] = ['SUBJECT', 'COUNSELING', 'ETC'];
const HANDLINGS: PreferredHandling[] = ['MEETING', 'WRITTEN_REPLY', 'NOTICE_ONLY'];
const STATUSES: SelfReportStatus[] = ['UNREAD', 'READ', 'IN_PROGRESS', 'DONE'];
const MAX_RECIPIENTS = 1; // 기능 명세 기본값 N = 1
const MAX_FILES = 3;
const MAX_BYTES = 10 * 1024 * 1024;

interface Attachment { attachmentId: string; reportId: string | null; uploaderId: string; fileName: string; sizeBytes: number; createdAt: string; }
interface Recipient { teacherId: string; readAt: string | null; }
interface Reply { replyId: string; reportId: string; authorId: string; content: string; createdAt: string; }
interface Report {
  reportId: string; studentId: string; type: ReportType; title: string; content: string;
  recipients: Recipient[]; changeReason: ChangeReason | null; preferredHandling: PreferredHandling;
  status: SelfReportStatus; createdAt: string; updatedAt: string;
  seen: Record<string, number>; // 사용자별로 확인한 답변 수 (hasNewReply 계산용)
}

const reports: Report[] = [];
const attachments: Attachment[] = [];
const replies: Reply[] = [];

/* ---------- 도우미 ---------- */
const teacherSummary = (id: string) => {
  const t = findTeacher(id)!;
  return { teacherId: t.teacherId, name: t.name, subject: t.subject, position: t.position };
};
const userOf = (id: string) => users.find((u) => u.userId === id);
const repliesOf = (reportId: string) => replies.filter((r) => r.reportId === reportId);
const isAuthor = (r: Report, u: MockUser) => r.studentId === u.userId;
const isRecipient = (r: Report, u: MockUser) => r.recipients.some((x) => x.teacherId === u.userId);
const studentUrl = (id: string) => `/me/self-reports/${id}`;
const teacherUrl = (id: string) => `/teacher/self-reports/${id}`;

const notFound = (): never => fail(404, 'NOT_FOUND', '신고를 찾을 수 없습니다.');
const requireStudent = (u: MockUser) => { if (u.role !== 'STUDENT') fail(403, 'FORBIDDEN', '학생만 이용할 수 있습니다.'); };
const requireTeacher = (u: MockUser) => { if (!isTeacherRole(u)) fail(403, 'FORBIDDEN', '교사만 이용할 수 있습니다.'); };

/* 작성자·수신 교사가 아니면 존재 여부도 숨김 */
function visible(id: string, u: MockUser) {
  const r = reports.find((x) => x.reportId === id);
  if (!r || !(isAuthor(r, u) || isRecipient(r, u))) return notFound();
  return r;
}

function hasNewReply(r: Report, userId: string) {
  return repliesOf(r.reportId).slice(r.seen[userId] ?? 0).some((x) => x.authorId !== userId);
}

function detail(r: Report, u: MockUser) {
  const s = findStudent(r.studentId)!;
  return {
    reportId: r.reportId,
    student: studentRef(s),
    type: r.type,
    title: r.title,
    content: r.content,
    recipients: r.recipients.map((x) => ({ teacherId: x.teacherId, name: findTeacher(x.teacherId)?.name ?? '알 수 없음', readAt: x.readAt })),
    changeReason: r.changeReason,
    preferredHandling: r.preferredHandling,
    attachments: attachments.filter((a) => a.reportId === r.reportId).map(({ attachmentId, fileName, sizeBytes }) => ({ attachmentId, fileName, sizeBytes })),
    status: r.status,
    editable: isAuthor(r, u) && r.status === 'UNREAD',
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

/* 담임 → 학년 부장 → 상담교사 */
function defaultRecipient(studentId: string) {
  const s = findStudent(studentId);
  const homeroom = s && teachers.find((t) => t.homeroomGrade === s.grade && t.homeroomClass === s.classNo);
  if (homeroom) return { teacher: teacherSummary(homeroom.teacherId), isFallback: false, fallbackReason: null };
  const head = s && teachers.find((t) => t.position === `${s.grade}학년 부장`);
  const counsel = teachers.find((t) => t.position === '상담교사');
  const fb = head ?? counsel;
  return { teacher: fb ? teacherSummary(fb.teacherId) : null, isFallback: true, fallbackReason: 'HOMEROOM_NOT_ASSIGNED' };
}

const STATUS_BODY: Partial<Record<SelfReportStatus, string>> = {
  READ: '자진 신고를 선생님이 확인했습니다.',
  IN_PROGRESS: '자진 신고가 처리 중입니다.',
  DONE: '자진 신고가 처리 완료되었습니다.',
};
const notifyStatus = (r: Report) => notify(r.studentId, 'SELF_REPORT_STATUS_CHANGED', '자진 신고 상태 변경', STATUS_BODY[r.status] ?? '', studentUrl(r.reportId));
function notifyReceived(r: Report, teacherId: string) {
  const s = findStudent(r.studentId)!;
  // 알림에는 제목·내용을 넣지 않음
  notify(teacherId, 'SELF_REPORT_RECEIVED', '자진 신고 접수', `[자진 신고] ${s.grade}학년 ${s.classNo}반 ${s.name} 학생으로부터 자진 신고가 접수되었습니다.`, teacherUrl(r.reportId));
}
function removeReceivedNotifications(reportId: string, teacherIds?: string[]) {
  for (let i = notifications.length - 1; i >= 0; i--) {
    const n = notifications[i];
    if (n.type === 'SELF_REPORT_RECEIVED' && n.targetUrl === teacherUrl(reportId) && (!teacherIds || teacherIds.includes(n.userId))) notifications.splice(i, 1);
  }
}

/* ---------- 입력 검증 (제출·수정 공용) ---------- */
type Body = Record<string, unknown>;
function validate(body: Body, u: MockUser, partial: boolean, report?: Report) {
  const errs: FieldError[] = [];
  const has = (k: string) => !partial || body[k] !== undefined;
  const out: Partial<Pick<Report, 'type' | 'title' | 'content' | 'changeReason' | 'preferredHandling'>> & { recipientIds?: string[]; attachmentIds?: string[] } = {};

  if (has('type')) {
    if (!TYPES.includes(body.type as ReportType)) errs.push({ field: 'type', reason: 'INVALID', message: '신고 유형을 선택해 주세요.' });
    else out.type = body.type as ReportType;
  }
  if (has('title')) {
    const t = typeof body.title === 'string' ? body.title.trim() : '';
    if (t.length < 1) errs.push({ field: 'title', reason: 'REQUIRED', message: '제목을 입력해 주세요.' });
    else if (t.length > 50) errs.push({ field: 'title', reason: 'TOO_LONG', message: '제목은 50자 이하로 입력해 주세요.' });
    else out.title = t;
  }
  if (has('content')) {
    const c = typeof body.content === 'string' ? body.content.trim() : '';
    if (c.length < 1) errs.push({ field: 'content', reason: 'REQUIRED', message: '내용을 입력해 주세요.' });
    else if (c.length > 2000) errs.push({ field: 'content', reason: 'TOO_LONG', message: '내용은 2,000자 이하로 입력해 주세요.' });
    else out.content = c;
  }
  if (has('preferredHandling')) {
    if (!HANDLINGS.includes(body.preferredHandling as PreferredHandling)) errs.push({ field: 'preferredHandling', reason: 'INVALID', message: '희망 처리 방식을 선택해 주세요.' });
    else out.preferredHandling = body.preferredHandling as PreferredHandling;
  }

  // 수신자 + 변경 사유
  const recipientIds = has('recipientIds') ? body.recipientIds : report?.recipients.map((x) => x.teacherId);
  if (has('recipientIds')) {
    if (!Array.isArray(recipientIds) || recipientIds.length < 1 || recipientIds.some((x) => typeof x !== 'string')) {
      errs.push({ field: 'recipientIds', reason: 'REQUIRED', message: '받는 선생님을 선택해 주세요.' });
    } else if (new Set(recipientIds).size !== recipientIds.length) {
      errs.push({ field: 'recipientIds', reason: 'DUPLICATED', message: '같은 선생님을 두 번 선택할 수 없습니다.' });
    } else {
      if (recipientIds.length > MAX_RECIPIENTS) fail(400, 'TOO_MANY_RECIPIENTS', `받는 선생님은 최대 ${MAX_RECIPIENTS}명까지 선택할 수 있습니다.`);
      if (recipientIds.some((id) => !findTeacher(id as string))) fail(400, 'INVALID_RECIPIENT', '선택한 사용자는 교사가 아닙니다.');
      out.recipientIds = recipientIds as string[];
    }
  }
  if (has('recipientIds') || has('changeReason')) {
    const def = defaultRecipient(u.userId).teacher?.teacherId;
    const raw = out.recipientIds ?? recipientIds;
    const ids = (Array.isArray(raw) ? raw : []) as string[];
    const needsReason = ids.some((id) => id !== def);
    const reason = has('changeReason') ? body.changeReason : report?.changeReason ?? null;
    if (needsReason) {
      if (!REASONS.includes(reason as ChangeReason)) errs.push({ field: 'changeReason', reason: 'REQUIRED', message: '담당 교사를 바꾼 이유를 선택해 주세요.' });
      else out.changeReason = reason as ChangeReason;
    } else {
      out.changeReason = null; // 담임에게 보내면 사유는 저장하지 않음
    }
  }

  // 첨부: 최대 3개, 본인이 올린 미연결 파일(수정 시엔 이 신고의 기존 파일 포함)
  if (body.attachmentIds !== undefined && body.attachmentIds !== null) {
    const ids = body.attachmentIds;
    if (!Array.isArray(ids) || new Set(ids).size !== ids.length) errs.push({ field: 'attachmentIds', reason: 'INVALID', message: '첨부파일 정보가 올바르지 않습니다.' });
    else if (ids.length > MAX_FILES) errs.push({ field: 'attachmentIds', reason: 'TOO_MANY', message: `첨부파일은 최대 ${MAX_FILES}개입니다.` });
    else if (ids.some((id) => {
      const a = attachments.find((x) => x.attachmentId === id);
      return !a || a.uploaderId !== u.userId || (a.reportId !== null && a.reportId !== report?.reportId);
    })) errs.push({ field: 'attachmentIds', reason: 'INVALID_ATTACHMENT', message: '첨부파일을 다시 올려 주세요.' });
    else out.attachmentIds = ids as string[];
  } else if (!partial) out.attachmentIds = [];

  if (errs.length) validationFail(errs);
  return out;
}

function linkAttachments(reportId: string, ids: string[]) {
  for (let i = attachments.length - 1; i >= 0; i--) {
    const a = attachments[i];
    if (a.reportId === reportId && !ids.includes(a.attachmentId)) attachments.splice(i, 1); // 빠진 파일은 삭제
  }
  attachments.forEach((a) => { if (ids.includes(a.attachmentId)) a.reportId = reportId; });
}

/* ---------- 라우트 ---------- */
route('GET', '/api/self-reports/default-recipient', () => {
  const u = currentUser();
  requireStudent(u);
  return defaultRecipient(u.userId);
});

route('GET', '/api/teachers', ({ query }) => {
  const q = (query.get('q') ?? '').trim();
  const subject = (query.get('subject') ?? '').trim();
  const position = (query.get('position') ?? '').trim();
  // q: 이름 부분 일치 (목업에서는 과목·직책도 함께 찾음)
  const items = teachers
    .filter((t) => !q || t.name.includes(q) || (t.subject ?? '').includes(q) || t.position.includes(q))
    .filter((t) => !subject || t.subject === subject)
    .filter((t) => !position || t.position.includes(position))
    .map((t) => teacherSummary(t.teacherId));
  return { items };
});

route('POST', '/api/self-reports/attachments', ({ body }) => {
  const u = currentUser();
  requireStudent(u);
  const file = body instanceof FormData ? body.get('file') : null;
  if (!(file instanceof File)) validationFail([{ field: 'file', reason: 'REQUIRED', message: '파일을 선택해 주세요.' }]);
  const f = file as File;
  const okType = ['image/jpeg', 'image/png', 'application/pdf'].includes(f.type) || /\.(jpe?g|png|pdf)$/i.test(f.name);
  if (!okType) fail(415, 'UNSUPPORTED_FILE_TYPE', 'JPG, PNG, PDF 파일만 올릴 수 있습니다.');
  if (f.size > MAX_BYTES) fail(413, 'FILE_TOO_LARGE', '파일은 10MB 이하만 올릴 수 있습니다.');
  const a: Attachment = { attachmentId: uuid(), reportId: null, uploaderId: u.userId, fileName: f.name, sizeBytes: f.size, createdAt: isoKST() };
  attachments.push(a);
  return { attachmentId: a.attachmentId, fileName: a.fileName, sizeBytes: a.sizeBytes };
});

route('POST', '/api/self-reports', ({ body }) => {
  const u = currentUser();
  requireStudent(u);
  const v = validate((body ?? {}) as Body, u, false);
  const now = isoKST();
  const r: Report = {
    reportId: uuid(), studentId: u.userId, type: v.type!, title: v.title!, content: v.content!,
    recipients: v.recipientIds!.map((teacherId) => ({ teacherId, readAt: null })),
    changeReason: v.changeReason ?? null, preferredHandling: v.preferredHandling!,
    status: 'UNREAD', createdAt: now, updatedAt: now, seen: {},
  };
  reports.unshift(r);
  linkAttachments(r.reportId, v.attachmentIds ?? []);
  r.recipients.forEach((x) => notifyReceived(r, x.teacherId));
  return detail(r, u);
});

function parseStatus(v: string | null) {
  if (!v) return null;
  if (!STATUSES.includes(v as SelfReportStatus)) validationFail([{ field: 'status', reason: 'INVALID', message: '잘못된 상태 값입니다.' }]);
  return v as SelfReportStatus;
}

route('GET', '/api/me/self-reports', ({ query }) => {
  const u = currentUser();
  requireStudent(u);
  const status = parseStatus(query.get('status'));
  const rows = reports
    .filter((r) => r.studentId === u.userId && (!status || r.status === status))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((r) => ({
      reportId: r.reportId, type: r.type, title: r.title, status: r.status,
      recipients: r.recipients.map((x) => ({ teacherId: x.teacherId, name: findTeacher(x.teacherId)?.name ?? '알 수 없음' })),
      hasNewReply: hasNewReply(r, u.userId), createdAt: r.createdAt,
    }));
  return paginate(rows, query.get('page'));
});

route('GET', '/api/teacher/self-reports', ({ query }) => {
  const u = currentUser();
  requireTeacher(u);
  const status = parseStatus(query.get('status'));
  const rows = reports
    .filter((r) => isRecipient(r, u) && (!status || r.status === status))
    .sort((a, b) => Number(b.status === 'UNREAD') - Number(a.status === 'UNREAD') || b.createdAt.localeCompare(a.createdAt))
    .map((r) => ({
      reportId: r.reportId, student: studentRef(findStudent(r.studentId)!), type: r.type, title: r.title, status: r.status,
      preferredHandling: r.preferredHandling, hasNewReply: hasNewReply(r, u.userId), createdAt: r.createdAt,
    }));
  return paginate(rows, query.get('page'));
});

route('GET', '/api/self-reports/:reportId', ({ params }) => {
  const u = currentUser();
  const r = visible(params.reportId, u);
  const me = r.recipients.find((x) => x.teacherId === u.userId);
  if (me && !me.readAt) {
    const now = isoKST();
    me.readAt = now;
    if (r.status === 'UNREAD') {
      r.status = 'READ';
      r.updatedAt = now;
      notifyStatus(r);
    }
  }
  return detail(r, u);
});

route('PATCH', '/api/self-reports/:reportId', ({ params, body }) => {
  const u = currentUser();
  const r = visible(params.reportId, u);
  if (!isAuthor(r, u)) notFound();
  if (r.status !== 'UNREAD') fail(409, 'REPORT_ALREADY_READ', '선생님이 이미 확인해 수정·삭제할 수 없습니다.');
  const v = validate((body ?? {}) as Body, u, true, r);
  if (v.type) r.type = v.type;
  if (v.title) r.title = v.title;
  if (v.content) r.content = v.content;
  if (v.preferredHandling) r.preferredHandling = v.preferredHandling;
  if (v.changeReason !== undefined) r.changeReason = v.changeReason;
  if (v.recipientIds) {
    const before = r.recipients.map((x) => x.teacherId);
    const removed = before.filter((id) => !v.recipientIds!.includes(id));
    removeReceivedNotifications(r.reportId, removed);
    r.recipients = v.recipientIds.map((teacherId) => ({ teacherId, readAt: null }));
    v.recipientIds.filter((id) => !before.includes(id)).forEach((id) => notifyReceived(r, id));
  }
  if (v.attachmentIds) linkAttachments(r.reportId, v.attachmentIds);
  r.updatedAt = isoKST();
  return detail(r, u);
});

route('DELETE', '/api/self-reports/:reportId', ({ params }) => {
  const u = currentUser();
  const r = visible(params.reportId, u);
  if (!isAuthor(r, u)) notFound();
  if (r.status !== 'UNREAD') fail(409, 'REPORT_ALREADY_READ', '선생님이 이미 확인해 수정·삭제할 수 없습니다.');
  linkAttachments(r.reportId, []);
  // 수신 교사 알림(접수·답변)도 제거
  for (let i = notifications.length - 1; i >= 0; i--) {
    const url = notifications[i].targetUrl;
    if (url === teacherUrl(r.reportId) || url === studentUrl(r.reportId)) notifications.splice(i, 1);
  }
  reports.splice(reports.indexOf(r), 1);
  for (let i = replies.length - 1; i >= 0; i--) if (replies[i].reportId === r.reportId) replies.splice(i, 1);
  return undefined;
});

route('PATCH', '/api/self-reports/:reportId/status', ({ params, body }) => {
  const u = currentUser();
  const r = visible(params.reportId, u);
  if (!isRecipient(r, u)) notFound();
  const next = (body ?? {}).status as SelfReportStatus;
  if (!STATUSES.includes(next)) validationFail([{ field: 'status', reason: 'INVALID', message: '잘못된 상태 값입니다.' }]);
  const allowed: Record<SelfReportStatus, SelfReportStatus[]> = { UNREAD: [], READ: ['IN_PROGRESS', 'DONE'], IN_PROGRESS: ['DONE'], DONE: [] };
  if (!allowed[r.status].includes(next)) fail(409, 'INVALID_STATUS_TRANSITION', '이 상태로는 바꿀 수 없습니다.');
  r.status = next;
  r.updatedAt = isoKST();
  notifyStatus(r);
  return detail(r, u);
});

function replyView(x: Reply) {
  const a = userOf(x.authorId);
  return { replyId: x.replyId, author: { userId: x.authorId, name: a?.name ?? '알 수 없음', role: a?.role ?? 'STUDENT' }, content: x.content, createdAt: x.createdAt };
}

route('GET', '/api/self-reports/:reportId/replies', ({ params }) => {
  const u = currentUser();
  const r = visible(params.reportId, u);
  const items = repliesOf(r.reportId);
  r.seen[u.userId] = items.length;
  return { items: items.map(replyView) };
});

route('POST', '/api/self-reports/:reportId/replies', ({ params, body }) => {
  const u = currentUser();
  const r = visible(params.reportId, u);
  const content = typeof body?.content === 'string' ? body.content.trim() : '';
  if (content.length < 1) validationFail([{ field: 'content', reason: 'REQUIRED', message: '답변 내용을 입력해 주세요.' }]);
  if (content.length > 1000) validationFail([{ field: 'content', reason: 'TOO_LONG', message: '답변은 1,000자 이하로 입력해 주세요.' }]);
  if (r.status === 'DONE') fail(409, 'REPORT_CLOSED', '처리 완료된 신고에는 답변할 수 없습니다.');
  const now = isoKST();
  const teacherSide = isRecipient(r, u);
  if (teacherSide) {
    const me = r.recipients.find((x) => x.teacherId === u.userId)!;
    if (!me.readAt) me.readAt = now;
    const first = !repliesOf(r.reportId).some((x) => x.authorId !== r.studentId);
    if (r.status === 'UNREAD') { r.status = 'READ'; notifyStatus(r); }
    if (first && r.status === 'READ') r.status = 'IN_PROGRESS';
  }
  const x: Reply = { replyId: uuid(), reportId: r.reportId, authorId: u.userId, content, createdAt: now };
  replies.push(x);
  r.seen[u.userId] = repliesOf(r.reportId).length;
  r.updatedAt = now;
  // 상대방에게 알림 (답변 내용은 넣지 않음)
  if (teacherSide) notify(r.studentId, 'SELF_REPORT_REPLIED', '자진 신고 답변', '자진 신고에 새 답변이 있습니다.', studentUrl(r.reportId));
  else r.recipients.forEach((t) => notify(t.teacherId, 'SELF_REPORT_REPLIED', '자진 신고 답변', '자진 신고에 새 답변이 있습니다.', teacherUrl(r.reportId)));
  return replyView(x);
});

/* ---------- 시드 데이터 ---------- */
function seed(o: {
  studentId: string; teacherId: string; type: ReportType; title: string; content: string; status: SelfReportStatus;
  ago: number; hour?: number; handling: PreferredHandling; reason?: ChangeReason; files?: [string, number][];
  thread?: [who: 'S' | 'T', text: string, ago: number, hour: number][]; seenByStudent?: number; seenByTeacher?: number;
}) {
  const createdAt = daysAgo(o.ago, o.hour ?? 20);
  const readAt = o.status === 'UNREAD' ? null : daysAgo(Math.max(0, o.ago - 1), 8);
  const r: Report = {
    reportId: uuid(), studentId: o.studentId, type: o.type, title: o.title, content: o.content,
    recipients: [{ teacherId: o.teacherId, readAt }], changeReason: o.reason ?? null, preferredHandling: o.handling,
    status: o.status, createdAt, updatedAt: readAt ?? createdAt, seen: {},
  };
  reports.push(r);
  (o.files ?? []).forEach(([fileName, sizeBytes]) => attachments.push({ attachmentId: uuid(), reportId: r.reportId, uploaderId: o.studentId, fileName, sizeBytes, createdAt }));
  (o.thread ?? []).forEach(([who, text, ago, hour]) => replies.push({ replyId: uuid(), reportId: r.reportId, authorId: who === 'S' ? o.studentId : o.teacherId, content: text, createdAt: daysAgo(ago, hour) }));
  const n = (o.thread ?? []).length;
  r.seen[o.studentId] = o.seenByStudent ?? n;
  r.seen[o.teacherId] = o.seenByTeacher ?? n;
}

const classmate = (n: number) => students.find((s) => s.grade === 2 && s.classNo === 1 && s.number === n)!.studentId;

// 손범수(2-1)의 신고
seed({ studentId: ME_STUDENT_ID, teacherId: TEACHER_KIM, type: 'LOST_FOUND', title: '실습실 노트북 충전기 분실', status: 'UNREAD', ago: 1, hour: 21, handling: 'WRITTEN_REPLY',
  content: '어제 5교시 후 실습실3에서 노트북 충전기(65W, 흰색)를 두고 나왔는데 오늘 가 보니 없습니다. 혹시 분실물로 들어온 것이 있는지 확인 부탁드립니다.',
  files: [['충전기.jpg', 482133]] });
seed({ studentId: ME_STUDENT_ID, teacherId: TEACHER_KIM, type: 'SCHOOL_RULE', title: '기숙사 점호 시간 관련 문의', status: 'READ', ago: 4, handling: 'NOTICE_ONLY',
  content: '방과후 수업이 늦게 끝나는 날에 점호 시간에 맞추기 어려운 경우가 있어 미리 알려 드립니다.' });
seed({ studentId: ME_STUDENT_ID, teacherId: TEACHER_COUNSEL, type: 'COUNSELING', title: '진로 고민 상담 요청', status: 'IN_PROGRESS', ago: 8, handling: 'MEETING', reason: 'COUNSELING',
  content: '취업과 진학 사이에서 고민이 많습니다. 한 번 이야기를 나눠 보고 싶습니다.',
  thread: [['T', '이야기해 줘서 고마워요. 이번 주 목요일 점심시간에 상담실로 올 수 있을까요?', 7, 10], ['S', '네, 목요일 점심시간에 가겠습니다.', 7, 12], ['T', '좋아요. 그때 진로 희망 조사서도 같이 가져와 주세요.', 6, 9]],
  seenByStudent: 2 });
seed({ studentId: ME_STUDENT_ID, teacherId: TEACHER_KIM, type: 'PEER_RELATION', title: '조별 과제 역할 분담 문제', status: 'DONE', ago: 21, handling: 'WRITTEN_REPLY',
  content: '조별 과제에서 역할 분담이 한쪽으로 몰려 있어 조정이 필요해 보입니다.',
  thread: [['T', '조원들과 따로 이야기해서 역할을 다시 나누었어요. 불편한 점이 있으면 또 알려 주세요.', 19, 15], ['S', '감사합니다!', 19, 18]] });

// 김지훈 선생님(2-1 담임)이 받은 다른 학생의 신고
seed({ studentId: classmate(3), teacherId: TEACHER_KIM, type: 'PEER_RELATION', title: '쉬는 시간 장난이 심해요', status: 'UNREAD', ago: 1, hour: 22, handling: 'MEETING',
  content: '쉬는 시간마다 몇몇 친구들이 장난을 심하게 쳐서 불편합니다. 조용히 이야기해 주셨으면 좋겠습니다.' });
seed({ studentId: classmate(12), teacherId: TEACHER_KIM, type: 'LOST_FOUND', title: '체육복 상의 습득', status: 'UNREAD', ago: 2, hour: 17, handling: 'NOTICE_ONLY',
  content: '체육관 2층 벤치에서 이름이 적힌 체육복 상의를 주웠습니다. 교무실 앞 분실물 함에 넣어 두었습니다.',
  files: [['체육복.png', 231044]] });
seed({ studentId: classmate(5), teacherId: TEACHER_KIM, type: 'SCHOOL_RULE', title: '지각 사유 설명', status: 'READ', ago: 5, handling: 'WRITTEN_REPLY',
  content: '지난주 수요일 버스 고장으로 지각했습니다. 버스 회사 안내 문자를 첨부합니다.',
  files: [['안내문자.png', 120332]] });
seed({ studentId: classmate(7), teacherId: TEACHER_KIM, type: 'COUNSELING', title: '수학 성적 고민', status: 'IN_PROGRESS', ago: 10, handling: 'MEETING',
  content: '수학 성적이 계속 떨어져서 걱정입니다. 공부 방법을 여쭤보고 싶어요.',
  thread: [['T', '방과후에 잠깐 이야기해 볼까요? 금요일 4시 어때요?', 9, 11], ['S', '금요일 4시 괜찮습니다. 감사합니다.', 1, 19]],
  seenByTeacher: 1 });
seed({ studentId: classmate(14), teacherId: TEACHER_KIM, type: 'ETC', title: '교실 에어컨 고장', status: 'DONE', ago: 30, handling: 'NOTICE_ONLY',
  content: '교실 뒤쪽 에어컨에서 물이 샙니다.' });
