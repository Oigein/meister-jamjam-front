/*
 * 마역량 점수 부여 · 증빙자료 목업 (docs/api/04-meister-award.md)
 * 증빙자료 데이터는 이 파일 안에만 두고, 점수 내역·학생 점수·상벌점·알림은 db.ts 배열을 직접 갱신
 */
import { fail, paginate, route, validationFail } from '../server';
import type { FieldError } from '../../client';
import { SCORE_TYPES, SCORE_TYPE_LABEL, type EvidenceStatus, type PointType, type ScoreType } from '../../types';
import {
  ME_STUDENT_ID, TEACHER_HEAD2, TEACHER_KIM, currentUser, daysAgo, findStudent, isTeacherRole, isoKST, meritPoints,
  notify, pointRules, scoreDetails, scoreItems, studentRef, students, teacherRef, totalScore, uuid, type MockStudent,
} from '../db';

/* ---------- 타입 ---------- */
type AnalysisStatus = 'PROCESSING' | 'DONE' | 'FAILED';
type Kind = 'CERTIFICATE' | 'AWARD' | 'PARTICIPATION' | 'OTHER';
interface Extracted { kind: Kind; name: string | null; issuer: string | null; award: string | null; achievedAt: string | null; }
interface Recommendation { scoreType: ScoreType; itemId: number; itemName: string; expectedPoints: number; reason: string; }
interface Ai {
  status: AnalysisStatus;
  extracted: Extracted | null;
  recommendation: Recommendation | null;
  duplicateSuspect: { detailId: string; content: string; createdAt: string } | null;
  analyzedAt: string | null;
}
interface MockEvidence {
  evidenceId: string;
  studentId: string;
  title: string;
  description: string | null;
  scoreTypeHint: ScoreType | null;
  file: { fileName: string; contentType: string; url: string | null };
  status: EvidenceStatus;
  ai: Ai;
  attempts: number;
  review: { teacherId: string; reviewedAt: string; rejectReason: string | null; detailId: string | null } | null;
  approvedPoints: number | null;
  createdAt: string;
}

const evidences: MockEvidence[] = [];

/* ---------- 공통 검사 ---------- */
function requireTeacher() {
  const u = currentUser();
  if (!isTeacherRole(u)) fail(403, 'FORBIDDEN', '교사만 사용할 수 있습니다.');
  return u;
}
function requireStudent() {
  const u = currentUser();
  if (u.role !== 'STUDENT') fail(403, 'FORBIDDEN', '학생만 사용할 수 있습니다.');
  return u;
}
const findEvidence = (id: string) => evidences.find((e) => e.evidenceId === id) ?? null;
const isScoreType = (v: unknown): v is ScoreType => typeof v === 'string' && (SCORE_TYPES as string[]).includes(v);
const fe = (field: string, reason: string, message: string): FieldError => ({ field, reason, message });
const norm = (s: string) => s.replace(/\s+/g, '').replace(/(취득|합격|수상|확인서|사본|자격증사본)$/g, '').toLowerCase();

/* ---------- AI 분석 흉내 (제목으로 추정) ---------- */
interface Rule { re: RegExp; kind: Kind; itemId: number; points: (t: string) => number; issuer: string | null; reason: string; }
const RULES: Rule[] = [
  { re: /산업기사/, kind: 'CERTIFICATE', itemId: 11, points: () => 120, issuer: '한국산업인력공단', reason: '국가기술자격 산업기사 등급으로 확인되어 산업기사 인정 점수를 추천합니다.' },
  { re: /기능사/, kind: 'CERTIFICATE', itemId: 11, points: () => 100, issuer: '한국산업인력공단', reason: '국가기술자격 기능사 등급으로 확인되어 기능사 인정 점수를 추천합니다.' },
  { re: /리눅스마스터|SQLD|ADsP|네트워크관리사|정보보안|컴활|컴퓨터활용/i, kind: 'CERTIFICATE', itemId: 12, points: () => 25, issuer: '한국정보통신진흥협회 등 민간 기관', reason: '공인 민간 자격으로 확인되어 민간 자격증 항목을 추천합니다.' },
  { re: /TOEIC|토익|TOEFL|토플|OPIc|오픽|JLPT|HSK|TEPS|텝스/i, kind: 'CERTIFICATE', itemId: 41, points: (t) => { const m = /(\d{3})/.exec(t); const s = m ? Number(m[1]) : 0; return s >= 800 ? 100 : s >= 700 ? 70 : 40; }, issuer: 'ETS / 한국TOEIC위원회', reason: '공인 어학 성적표로 확인되어 성적 구간에 맞는 점수를 추천합니다.' },
  { re: /금상|대상|최우수/, kind: 'AWARD', itemId: 13, points: () => 100, issuer: '부산소프트웨어마이스터고등학교', reason: '대회 상위 입상(금상 이상)으로 확인되어 대회 수상 항목을 추천합니다.' },
  { re: /은상|우수상/, kind: 'AWARD', itemId: 13, points: () => 80, issuer: '부산소프트웨어마이스터고등학교', reason: '대회 은상(우수상)으로 확인되어 대회 수상 항목을 추천합니다.' },
  { re: /동상|장려|입상|수상|대회|해커톤|경진/, kind: 'AWARD', itemId: 13, points: () => 60, issuer: '대회 주최 기관', reason: '대회 수상 실적으로 확인되어 장려 수준의 점수를 추천합니다.' },
  { re: /봉사/, kind: 'PARTICIPATION', itemId: 21, points: (t) => { const m = /(\d+)\s*시간/.exec(t); return m ? Math.min(50, Math.floor(Number(m[1]) / 10) * 25) || 25 : 25; }, issuer: '1365 자원봉사포털', reason: '봉사활동 확인서로 확인되어 10시간당 25점 기준으로 추천합니다.' },
  { re: /나르샤|프로젝트|포트폴리오/, kind: 'PARTICIPATION', itemId: 14, points: () => 30, issuer: '부산소프트웨어마이스터고등학교', reason: '프로젝트 완료 확인서로 확인되어 프로젝트 항목을 추천합니다.' },
  { re: /독서|인문|도서/, kind: 'PARTICIPATION', itemId: 31, points: () => 2, issuer: '학교 도서관', reason: '독서 활동 기록으로 확인되어 권당 2점 기준으로 추천합니다.' },
  { re: /학생회|반장|리더|동아리장/, kind: 'OTHER', itemId: 22, points: () => 20, issuer: '부산소프트웨어마이스터고등학교', reason: '학생 자치 활동 임명장으로 확인되어 리더 활동 항목을 추천합니다.' },
  { re: /교육|이수|연수|수료/, kind: 'PARTICIPATION', itemId: 2, points: () => 10, issuer: '교육 주관 기관', reason: '교육 이수증으로 확인되어 과정당 10점 기준으로 추천합니다.' },
];
const AWARD_RE = /(대상|최우수상|금상|은상|우수상|동상|장려상|입상)/;

function analyze(ev: MockEvidence): Ai {
  const title = ev.title;
  const rule = RULES.find((r) => r.re.test(title));
  const achievedAt = ev.createdAt.slice(0, 10);
  if (!rule) {
    // 인식 실패. 재분석(2회째 이상)이면 기타 문서로 판독만 하고 추천은 비움
    if (ev.attempts < 2) return { status: 'FAILED', extracted: null, recommendation: null, duplicateSuspect: null, analyzedAt: isoKST() };
    const item = ev.scoreTypeHint ? scoreItems.find((i) => i.scoreType === ev.scoreTypeHint) : null;
    return {
      status: 'DONE',
      extracted: { kind: 'OTHER', name: title, issuer: null, award: null, achievedAt: null },
      recommendation: item ? { scoreType: item.scoreType, itemId: item.itemId, itemName: item.name, expectedPoints: Math.min(10, item.maxPoints), reason: '문서 종류를 확정하지 못해 학생이 고른 영역의 첫 항목을 낮은 점수로 추천합니다. 원본을 꼭 확인하세요.' } : null,
      duplicateSuspect: null,
      analyzedAt: isoKST(),
    };
  }
  const item = scoreItems.find((i) => i.itemId === rule.itemId)!;
  const name = title.replace(/\s*(사본|확인서 제출|재제출|\(.*?\))\s*$/g, '').trim() || title;
  const award = rule.kind === 'AWARD' ? (AWARD_RE.exec(title)?.[1] ?? '장려상') : null;
  const n = norm(name);
  const dup = scoreDetails.find((d) => d.studentId === ev.studentId && d.itemId === item.itemId && (norm(d.content) === n || norm(d.content).includes(n) || n.includes(norm(d.content))));
  return {
    status: 'DONE',
    extracted: { kind: rule.kind, name, issuer: rule.issuer, award, achievedAt },
    recommendation: { scoreType: item.scoreType, itemId: item.itemId, itemName: item.name, expectedPoints: Math.min(rule.points(title), item.maxPoints), reason: rule.reason },
    duplicateSuspect: dup ? { detailId: dup.detailId, content: dup.content, createdAt: dup.createdAt } : null,
    analyzedAt: isoKST(),
  };
}

function startAnalysis(ev: MockEvidence, delay = 4000) {
  ev.attempts += 1;
  ev.ai = { status: 'PROCESSING', extracted: null, recommendation: null, duplicateSuspect: null, analyzedAt: null };
  const attempt = ev.attempts;
  setTimeout(() => {
    if (ev.attempts !== attempt || ev.status !== 'PENDING') return;
    ev.ai = analyze(ev);
  }, delay);
}

/* ---------- 시드 ---------- */
const byNo = (g: number, c: number, n: number) => students.find((s) => s.grade === g && s.classNo === c && s.number === n)!;
function seed(s: MockStudent, title: string, ago: number, opt: Partial<MockEvidence> & { analyzeNow?: boolean; hour?: number } = {}) {
  const fileName = opt.file?.fileName ?? `${title.replace(/\s+/g, '_')}.${ago % 2 ? 'pdf' : 'jpg'}`;
  const ev: MockEvidence = {
    evidenceId: uuid(),
    studentId: s.studentId,
    title,
    description: opt.description ?? null,
    scoreTypeHint: opt.scoreTypeHint ?? null,
    file: { fileName, contentType: fileName.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg', url: null },
    status: opt.status ?? 'PENDING',
    ai: { status: 'PROCESSING', extracted: null, recommendation: null, duplicateSuspect: null, analyzedAt: null },
    attempts: 1,
    review: opt.review ?? null,
    approvedPoints: opt.approvedPoints ?? null,
    createdAt: daysAgo(ago, opt.hour ?? 9),
  };
  if (opt.analyzeNow !== false) ev.ai = analyze(ev);
  evidences.push(ev);
  return ev;
}
const detailIdOf = (studentId: string, content: string) => scoreDetails.find((d) => d.studentId === studentId && d.content === content)?.detailId ?? null;

// 손범수 처리 이력
seed(findStudent(ME_STUDENT_ID)!, '리눅스마스터 2급', 182, { status: 'APPROVED', approvedPoints: 50, review: { teacherId: TEACHER_KIM, reviewedAt: daysAgo(180, 15), rejectReason: null, detailId: detailIdOf(ME_STUDENT_ID, '리눅스마스터 2급 취득') } });
seed(findStudent(ME_STUDENT_ID)!, 'TOEIC 650점 성적표', 92, { status: 'APPROVED', approvedPoints: 40, review: { teacherId: TEACHER_HEAD2, reviewedAt: daysAgo(90, 11), rejectReason: null, detailId: detailIdOf(ME_STUDENT_ID, 'TOEIC 650점 (부분 인정)') } });
seed(findStudent(ME_STUDENT_ID)!, 'SQLD 합격', 40, { status: 'REJECTED', description: '데이터베이스 수업 때 취득했습니다.', review: { teacherId: TEACHER_KIM, reviewedAt: daysAgo(38, 16), rejectReason: '합격 증명서의 발급번호가 보이지 않습니다. 전체 화면이 나오게 다시 올려 주세요.', detailId: null } });
seed(findStudent(ME_STUDENT_ID)!, '정보처리기능사', 3, { status: 'APPROVED', approvedPoints: 100, review: { teacherId: TEACHER_KIM, reviewedAt: daysAgo(1, 10), rejectReason: null, detailId: detailIdOf(ME_STUDENT_ID, '정보처리기능사 취득') } });
seed(findStudent(ME_STUDENT_ID)!, '교내 코딩 대회 참가', 20, { status: 'REJECTED', review: { teacherId: TEACHER_KIM, reviewedAt: daysAgo(19, 14), rejectReason: '참가만으로 인정되는 평가항목이 없습니다. 수상한 경우 상장을 올려 주세요.', detailId: null } });
// 검토 대기 (오래된 순으로 보이도록 날짜 분산)
seed(byNo(3, 2, 5), '정보처리기능사', 4, { scoreTypeHint: 'MAJOR_SKILL', description: '2026년 정기 3회 합격' });
seed(byNo(2, 3, 7), '교내 해커톤 금상', 3, { description: '팀장으로 참가했습니다.', hour: 14 });
seed(findStudent(ME_STUDENT_ID)!, '정보처리기능사 사본', 2, { description: '이전 제출본이 흐려서 다시 올립니다.' }); // 중복 의심
seed(byNo(2, 2, 11), 'IMG_0412', 2, { hour: 17, file: { fileName: 'IMG_0412.jpg', contentType: 'image/jpeg', url: null } }); // 분석 실패
seed(byNo(3, 1, 14), '봉사활동 확인서 20시간', 1, { scoreTypeHint: 'CHARACTER_JOB_ETHIC' });
const processing = seed(byNo(1, 1, 2), 'TOEIC 750점 성적표', 0, { hour: 8, scoreTypeHint: 'FOREIGN_LANGUAGE', analyzeNow: false }); // 분석 중
setTimeout(() => { if (processing.status === 'PENDING' && processing.ai.status === 'PROCESSING') processing.ai = analyze(processing); }, 9000);

/* ---------- 응답 변환 ---------- */
function detailOut(ev: MockEvidence) {
  const s = findStudent(ev.studentId)!;
  return {
    evidenceId: ev.evidenceId,
    student: studentRef(s),
    title: ev.title,
    description: ev.description,
    file: ev.file,
    status: ev.status,
    aiAnalysis: ev.ai,
    review: ev.review ? { teacher: teacherRef(ev.review.teacherId), reviewedAt: ev.review.reviewedAt, rejectReason: ev.review.rejectReason, detailId: ev.review.detailId } : null,
    createdAt: ev.createdAt,
  };
}
const studentScoreOut = (s: MockStudent, t: ScoreType) => ({ scoreType: t, rawScore: s.scores[t], totalScore: totalScore(s) });

/* ---------- 2.1 평가항목 ---------- */
route('GET', '/api/meister/score-items', ({ query }) => {
  const t = query.get('scoreType');
  if (t && !isScoreType(t)) validationFail([fe('scoreType', 'INVALID', '알 수 없는 영역입니다.')]);
  return { items: scoreItems.filter((i) => !t || i.scoreType === t) };
});

/* ---------- 2.2 학생 검색 ---------- */
route('GET', '/api/teacher/students', ({ query }) => {
  requireTeacher();
  const q = (query.get('q') ?? '').trim();
  const num = (k: string) => { const v = query.get(k); if (v === null || v === '') return null; const n = Number(v); if (!Number.isInteger(n) || n < 1) validationFail([fe(k, 'INVALID', '숫자로 입력하세요.')]); return n; };
  const grade = num('grade'), classNo = num('classNo'), number = num('number');
  const rows = students
    .filter((s) => (!q || s.name.includes(q)) && (!grade || s.grade === grade) && (!classNo || s.classNo === classNo) && (!number || s.number === number))
    .map((s) => ({ ...studentRef(s), totalScore: totalScore(s), pendingEvidenceCount: evidences.filter((e) => e.studentId === s.studentId && e.status === 'PENDING').length }));
  return paginate(rows, query.get('page'));
});

/* ---------- 2.3 제출 ---------- */
const MAX_BYTES = 10 * 1024 * 1024;
async function sniff(file: File) {
  const b = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'application/pdf';
  return null;
}
route('POST', '/api/evidences', async ({ body }) => {
  const u = requireStudent();
  const fd = body instanceof FormData ? body : null;
  const file = fd?.get('file');
  const title = String(fd?.get('title') ?? '').trim();
  const description = String(fd?.get('description') ?? '').trim();
  const scoreType = String(fd?.get('scoreType') ?? '');
  const errs: FieldError[] = [];
  if (!(file instanceof File) || file.size === 0) errs.push(fe('file', 'REQUIRED', '증빙 파일을 선택하세요.'));
  if (!title) errs.push(fe('title', 'REQUIRED', '제목을 입력하세요.'));
  else if (title.length > 50) errs.push(fe('title', 'TOO_LONG', '제목은 50자 이하로 입력하세요.'));
  if (description.length > 200) errs.push(fe('description', 'TOO_LONG', '설명은 200자 이하로 입력하세요.'));
  if (scoreType && !isScoreType(scoreType)) errs.push(fe('scoreType', 'INVALID', '알 수 없는 영역입니다.'));
  if (errs.length) validationFail(errs);
  const f = file as File;
  if (f.size > MAX_BYTES) fail(413, 'FILE_TOO_LARGE', '파일은 10MB 이하만 올릴 수 있습니다.');
  const contentType = await sniff(f);
  if (!contentType) fail(415, 'UNSUPPORTED_FILE_TYPE', 'JPG, PNG, PDF 파일만 올릴 수 있습니다.');

  const ev: MockEvidence = {
    evidenceId: uuid(),
    studentId: u.userId,
    title,
    description: description || null,
    scoreTypeHint: isScoreType(scoreType) ? scoreType : null,
    file: { fileName: f.name, contentType: contentType!, url: URL.createObjectURL(f) },
    status: 'PENDING',
    ai: { status: 'PROCESSING', extracted: null, recommendation: null, duplicateSuspect: null, analyzedAt: null },
    attempts: 0,
    review: null,
    approvedPoints: null,
    createdAt: isoKST(),
  };
  evidences.push(ev);
  startAnalysis(ev);
  return { evidenceId: ev.evidenceId, title: ev.title, status: ev.status, analysisStatus: ev.ai.status, createdAt: ev.createdAt };
});

/* ---------- 2.4 내 제출 내역 ---------- */
const parseStatus = (v: string | null): EvidenceStatus | null => {
  if (!v) return null;
  if (v === 'PENDING' || v === 'APPROVED' || v === 'REJECTED') return v;
  return validationFail([fe('status', 'INVALID', '알 수 없는 상태입니다.')]);
};
route('GET', '/api/me/evidences', ({ query }) => {
  const u = requireStudent();
  const status = parseStatus(query.get('status'));
  const rows = evidences
    .filter((e) => e.studentId === u.userId && (!status || e.status === status))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((e) => ({
      evidenceId: e.evidenceId, title: e.title, status: e.status,
      rejectReason: e.review?.rejectReason ?? null, approvedPoints: e.approvedPoints,
      createdAt: e.createdAt, reviewedAt: e.review?.reviewedAt ?? null, analysisStatus: e.ai.status,
    }));
  return paginate(rows, query.get('page'), 10);
});

/* ---------- 2.5 검토 목록 ---------- */
route('GET', '/api/teacher/evidences', ({ query }) => {
  requireTeacher();
  const status = parseStatus(query.get('status')) ?? 'PENDING';
  const sid = query.get('studentId');
  const rows = evidences
    .filter((e) => e.status === status && (!sid || e.studentId === sid))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((e) => ({
      evidenceId: e.evidenceId, student: studentRef(findStudent(e.studentId)!), title: e.title, status: e.status,
      analysisStatus: e.ai.status, recommendedScoreType: e.ai.recommendation?.scoreType ?? null,
      expectedPoints: e.ai.recommendation?.expectedPoints ?? null, createdAt: e.createdAt,
    }));
  return paginate(rows, query.get('page'));
});

/* ---------- 2.6 상세 ---------- */
function visibleEvidence(id: string) {
  const u = currentUser();
  const ev = findEvidence(id);
  if (!ev || (!isTeacherRole(u) && ev.studentId !== u.userId)) fail(404, 'NOT_FOUND', '증빙자료를 찾을 수 없습니다.');
  return ev!;
}
route('GET', '/api/evidences/:id', ({ params }) => detailOut(visibleEvidence(params.id)));

/* ---------- 2.7 재분석 ---------- */
route('POST', '/api/evidences/:id/analysis', ({ params }) => {
  requireTeacher();
  const ev = findEvidence(params.id);
  if (!ev) fail(404, 'NOT_FOUND', '증빙자료를 찾을 수 없습니다.');
  if (ev!.status !== 'PENDING') fail(409, 'EVIDENCE_ALREADY_REVIEWED', '이미 승인 또는 반려된 증빙자료입니다.');
  if (ev!.ai.status !== 'PROCESSING') startAnalysis(ev!);
  return { analysisStatus: ev!.ai.status };
});

/* ---------- 점수 반영 공통 (2.8 · 2.10) ---------- */
function validateGrant(body: Record<string, unknown> | null, { allowNegative }: { allowNegative: boolean }) {
  const b = body ?? {};
  const errs: FieldError[] = [];
  const scoreType = b.scoreType;
  const itemId = b.itemId;
  const points = b.points;
  const content = typeof b.content === 'string' ? b.content.trim() : '';
  if (!isScoreType(scoreType)) errs.push(fe('scoreType', 'REQUIRED', '영역을 선택하세요.'));
  if (typeof itemId !== 'number' || !Number.isInteger(itemId)) errs.push(fe('itemId', 'REQUIRED', '평가항목을 선택하세요.'));
  if (typeof points !== 'number' || !Number.isInteger(points)) errs.push(fe('points', 'INVALID', '점수는 정수로 입력하세요.'));
  else if (allowNegative ? points === 0 : points < 1) errs.push(fe('points', 'OUT_OF_RANGE', allowNegative ? '0점은 부여할 수 없습니다.' : '점수는 1점 이상이어야 합니다.'));
  if (!content) errs.push(fe('content', 'REQUIRED', '사유를 입력하세요.'));
  else if (content.length > 50) errs.push(fe('content', 'TOO_LONG', '사유는 50자 이하로 입력하세요.'));
  if (errs.length) validationFail(errs);
  const item = scoreItems.find((i) => i.itemId === itemId);
  if (!item) fail(404, 'NOT_FOUND', '평가항목을 찾을 수 없습니다.');
  if (item!.scoreType !== scoreType) validationFail([fe('itemId', 'SCORE_TYPE_MISMATCH', '선택한 영역의 평가항목이 아닙니다.')]);
  return { scoreType: scoreType as ScoreType, item: item!, points: points as number, content };
}
function applyGrant(s: MockStudent, g: ReturnType<typeof validateGrant>, teacherId: string, evidence: MockEvidence | null) {
  if (g.points > 0) {
    const used = scoreDetails.filter((d) => d.studentId === s.studentId && d.itemId === g.item.itemId).reduce((a, d) => a + d.points, 0);
    const remaining = Math.max(0, g.item.maxPoints - used);
    if (g.points > remaining) fail(400, 'EXCEEDS_MAX_POINTS', `'${g.item.name}' 항목의 최대 인정 점수(${g.item.maxPoints}점)를 넘습니다. 남은 한도는 ${remaining}점입니다.`, { remainingPoints: remaining });
    const n = norm(g.content);
    const dup = scoreDetails.find((d) => d.studentId === s.studentId && d.itemId === g.item.itemId && d.points > 0 && norm(d.content) === n);
    if (dup) fail(409, 'DUPLICATE_ACHIEVEMENT', `이미 같은 실적('${dup.content}')으로 인정된 내역이 있습니다.`, { detailId: dup.detailId });
  } else if (s.scores[g.scoreType] + g.points < 0) {
    fail(400, 'SCORE_BELOW_ZERO', `${SCORE_TYPE_LABEL[g.scoreType]} 점수가 0점 미만이 됩니다. (현재 ${s.scores[g.scoreType]}점)`);
  }
  const detail = {
    detailId: uuid(), studentId: s.studentId, scoreType: g.scoreType, itemId: g.item.itemId, itemName: g.item.name,
    content: g.content, points: g.points, teacherId, evidenceId: evidence?.evidenceId ?? null,
    evidenceFileName: evidence?.file.fileName ?? null, createdAt: isoKST(),
  };
  scoreDetails.push(detail);
  s.scores[g.scoreType] += g.points;
  return {
    scoreDetail: { detailId: detail.detailId, scoreType: detail.scoreType, itemId: g.item.itemId, points: detail.points, content: detail.content, createdAt: detail.createdAt },
    studentScore: studentScoreOut(s, g.scoreType),
  };
}
const signedPts = (n: number) => (n > 0 ? `+${n}` : `${n}`);
const historyUrl = (sid: string, detailId: string) => `/students/${sid}?tab=history&detailId=${detailId}`;

/* ---------- 2.8 승인 ---------- */
route('POST', '/api/evidences/:id/approve', ({ params, body }) => {
  const u = requireTeacher();
  const ev = findEvidence(params.id);
  if (!ev) fail(404, 'NOT_FOUND', '증빙자료를 찾을 수 없습니다.');
  if (ev!.status !== 'PENDING') fail(409, 'EVIDENCE_ALREADY_REVIEWED', '이미 승인 또는 반려된 증빙자료입니다.');
  const g = validateGrant(body, { allowNegative: false });
  const s = findStudent(ev!.studentId)!;
  const r = applyGrant(s, g, u.userId, ev);
  ev!.status = 'APPROVED';
  ev!.approvedPoints = g.points;
  ev!.review = { teacherId: u.userId, reviewedAt: isoKST(), rejectReason: null, detailId: r.scoreDetail.detailId };
  notify(s.studentId, 'EVIDENCE_APPROVED', '증빙자료 승인', `제출한 '${ev!.title}'가 승인되어 ${SCORE_TYPE_LABEL[g.scoreType]} ${signedPts(g.points)}점이 반영되었습니다.`, historyUrl(s.studentId, r.scoreDetail.detailId));
  return { evidenceId: ev!.evidenceId, status: ev!.status, ...r };
});

/* ---------- 2.9 반려 ---------- */
route('POST', '/api/evidences/:id/reject', ({ params, body }) => {
  const u = requireTeacher();
  const ev = findEvidence(params.id);
  if (!ev) fail(404, 'NOT_FOUND', '증빙자료를 찾을 수 없습니다.');
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
  if (!reason) validationFail([fe('reason', 'REQUIRED', '반려 사유를 입력하세요.')]);
  if (reason.length > 200) validationFail([fe('reason', 'TOO_LONG', '반려 사유는 200자 이하로 입력하세요.')]);
  if (ev!.status !== 'PENDING') fail(409, 'EVIDENCE_ALREADY_REVIEWED', '이미 승인 또는 반려된 증빙자료입니다.');
  ev!.status = 'REJECTED';
  ev!.review = { teacherId: u.userId, reviewedAt: isoKST(), rejectReason: reason, detailId: null };
  notify(ev!.studentId, 'EVIDENCE_REJECTED', '증빙자료 반려', `제출한 '${ev!.title}'가 반려되었습니다. 사유: ${reason}`, `/me/evidences/${ev!.evidenceId}`);
  return { evidenceId: ev!.evidenceId, status: ev!.status, rejectReason: reason };
});

/* ---------- 2.10 직접 부여 ---------- */
route('POST', '/api/meister-scores', ({ body }) => {
  const u = requireTeacher();
  const sid = typeof body?.studentId === 'string' ? body.studentId : '';
  if (!sid) validationFail([fe('studentId', 'REQUIRED', '학생을 선택하세요.')]);
  const s = findStudent(sid);
  if (!s) fail(404, 'NOT_FOUND', '학생을 찾을 수 없습니다.');
  const g = validateGrant(body, { allowNegative: true });
  const r = applyGrant(s!, g, u.userId, null);
  notify(s!.studentId, 'MEISTER_SCORE_CHANGED', '마역량 점수 변경', `${SCORE_TYPE_LABEL[g.scoreType]} 점수가 ${signedPts(g.points)}점 변경되었습니다.`, historyUrl(s!.studentId, r.scoreDetail.detailId));
  return r;
});

/* ---------- 2.11 부여 이력 ---------- */
route('GET', '/api/teacher/meister-scores', ({ query }) => {
  const u = requireTeacher();
  const sid = query.get('studentId');
  let tid = query.get('teacherId');
  if (tid === 'me') tid = u.userId;
  const t = query.get('scoreType');
  if (t && !isScoreType(t)) validationFail([fe('scoreType', 'INVALID', '알 수 없는 영역입니다.')]);
  const from = query.get('from'), to = query.get('to');
  const rows = scoreDetails
    .filter((d) => (!sid || d.studentId === sid) && (!tid || d.teacherId === tid) && (!t || d.scoreType === t)
      && (!from || d.createdAt.slice(0, 10) >= from) && (!to || d.createdAt.slice(0, 10) <= to))
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((d) => {
      const s = findStudent(d.studentId);
      const linked = evidences.find((e) => e.review?.detailId === d.detailId);
      return {
        detailId: d.detailId,
        student: s ? studentRef(s) : { studentId: d.studentId, name: '알 수 없음', grade: 0, classNo: 0, number: 0 },
        scoreType: d.scoreType, itemId: d.itemId, itemName: d.itemName, points: d.points, content: d.content,
        teacher: teacherRef(d.teacherId), createdAt: d.createdAt, evidenceId: linked?.evidenceId ?? d.evidenceId,
      };
    });
  return paginate(rows, query.get('page'));
});

/* ---------- 2.12 상·벌점 부여 ---------- */
route('POST', '/api/merit-points', ({ body }) => {
  const u = requireTeacher();
  const b = (body ?? {}) as Record<string, unknown>;
  const errs: FieldError[] = [];
  const sid = typeof b.studentId === 'string' ? b.studentId : '';
  const type = b.type as PointType;
  const title = typeof b.title === 'string' ? b.title.trim() : '';
  const content = typeof b.content === 'string' ? b.content.trim() : '';
  const points = b.points;
  const ruleId = b.ruleId === undefined || b.ruleId === null || b.ruleId === '' ? null : b.ruleId;
  if (!sid) errs.push(fe('studentId', 'REQUIRED', '학생을 선택하세요.'));
  if (type !== 'MERIT' && type !== 'DEMERIT') errs.push(fe('type', 'REQUIRED', '상점 또는 벌점을 선택하세요.'));
  if (!title) errs.push(fe('title', 'REQUIRED', '제목을 입력하세요.'));
  else if (title.length > 20) errs.push(fe('title', 'TOO_LONG', '제목은 20자 이하로 입력하세요.'));
  if (content.length > 50) errs.push(fe('content', 'TOO_LONG', '내용은 50자 이하로 입력하세요.'));
  if (typeof points !== 'number' || !Number.isInteger(points) || points < 1) errs.push(fe('points', 'OUT_OF_RANGE', '점수는 1 이상의 정수로 입력하세요.'));
  if (ruleId !== null && (typeof ruleId !== 'number' || !Number.isInteger(ruleId))) errs.push(fe('ruleId', 'INVALID', '상벌점 기준이 올바르지 않습니다.'));
  if (errs.length) validationFail(errs);
  const s = findStudent(sid);
  if (!s) fail(404, 'NOT_FOUND', '학생을 찾을 수 없습니다.');
  if (ruleId !== null) {
    const rule = pointRules.find((r) => r.ruleId === ruleId);
    if (!rule) fail(404, 'NOT_FOUND', '상벌점 기준을 찾을 수 없습니다.');
    if (rule!.type !== type) validationFail([fe('ruleId', 'TYPE_MISMATCH', '선택한 구분(상점/벌점)과 기준이 맞지 않습니다.')]);
  }
  // db.ts의 상벌점 내역은 points를 양수 + type으로 보관 (조회 API에서 합계 계산)
  const mp = { meritPointId: uuid(), studentId: s!.studentId, type, title, content: content || null, points: points as number, teacherId: u.userId, ruleId: ruleId as number | null, createdAt: isoKST() };
  meritPoints.unshift(mp);
  return { meritPointId: mp.meritPointId, type: mp.type, title: mp.title, content: mp.content, points: mp.points, teacher: teacherRef(u.userId), createdAt: mp.createdAt };
});
