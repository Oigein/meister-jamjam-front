/*
 * 목업 공용 데이터. 여러 도메인이 함께 쓰는 것만 여기 둠 (사용자·학생·교사·점수 내역·상벌점·알림 등).
 * 도메인 전용 데이터(증빙, 대회, 자진 신고, 뽑기, 테마 …)는 각 handlers/*.ts 안에 둔다.
 */
import { mulberry32 } from '../../lib/random';
import { SCORE_TYPES, SCORE_TYPE_LABEL, type PointType, type Role, type ScoreType, type StudentRef, type TeacherRef } from '../types';

/* 결정적 UUID (목업 전용) */
let seq = 1;
export const uuid = () => `00000000-0000-4000-8000-${(seq++).toString(16).padStart(12, '0')}`;

/* 한국 시간 ISO 8601 */
export function isoKST(d = new Date()) {
  const k = new Date(d.getTime() + 9 * 3600_000);
  return k.toISOString().replace('Z', '+09:00').replace(/\.\d{3}/, '');
}
export const daysAgo = (n: number, hour = 9) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, 0, 0, 0);
  return isoKST(d);
};

/* ---------- 사용자 ---------- */
export interface MockUser { userId: string; name: string; email: string; role: Role; profileImageUrl: string | null; }
export interface MockTeacher { teacherId: string; name: string; subject: string | null; position: string; homeroomGrade: number | null; homeroomClass: number | null; }
export interface MockStudent {
  studentId: string; name: string; grade: number; classNo: number; number: number;
  scores: Record<ScoreType, number>;
  githubUrl: string | null; linkedinUrl: string | null;
}

export const users: MockUser[] = [];
export const teachers: MockTeacher[] = [];
export const students: MockStudent[] = [];

const T = (name: string, subject: string | null, position: string, hg: number | null = null, hc: number | null = null) => {
  const id = uuid();
  users.push({ userId: id, name, email: `t.${id.slice(-4)}@bssm.hs.kr`, role: 'TEACHER', profileImageUrl: null });
  teachers.push({ teacherId: id, name, subject, position, homeroomGrade: hg, homeroomClass: hc });
  return id;
};
export const TEACHER_KIM = T('김지훈 선생님', '정보', '2학년 1반 담임', 2, 1);
export const TEACHER_PARK = T('박서연 선생님', '수학', '학생부');
export const TEACHER_LEE = T('이도현 선생님', null, '기숙사 사감');
export const TEACHER_COUNSEL = T('최하나 선생님', null, '상담교사');
export const TEACHER_HEAD2 = T('정민호 선생님', '영어', '2학년 부장');
T('윤가람 선생님', '국어', '1학년 1반 담임', 1, 1);

export const ADMIN_ID = uuid();
users.push({ userId: ADMIN_ID, name: '관리자', email: 'admin@bssm.hs.kr', role: 'ADMIN', profileImageUrl: null });

/* 학생 192명 (3학년 × 4반 × 16명) */
const SURNAMES = '김이박최정강조윤장임한오서신권황안송홍전'.split('');
const GIVEN = ['민준', '서연', '도윤', '하은', '시우', '지우', '하린', '은호', '수아', '가은', '준서', '다은', '지호', '채원', '승민', '유진', '태윤', '소율', '서윤', '재원', '다온', '시윤', '예준', '주원'];
const rand = mulberry32(20261029);
export let ME_STUDENT_ID = '';
for (let g = 1; g <= 3; g++) for (let c = 1; c <= 4; c++) for (let n = 1; n <= 16; n++) {
  const id = uuid();
  const isMe = g === 2 && c === 1 && n === 9;
  const name = isMe ? '손범수' : SURNAMES[Math.floor(rand() * SURNAMES.length)] + GIVEN[Math.floor(rand() * GIVEN.length)];
  const base = g === 3 ? 1.25 : g === 2 ? 1 : 0.7;
  const r = () => Math.round(rand() * 10) * 2;
  const scores: Record<ScoreType, number> = isMe
    ? { JOB_BASIC: 90, MAJOR_SKILL: 180, CHARACTER_JOB_ETHIC: 80, HUMANITIES_LITERACY: 62, FOREIGN_LANGUAGE: 40 }
    : {
        JOB_BASIC: Math.round((60 + r() * 2) * base),
        MAJOR_SKILL: Math.round((100 + r() * 4) * base),
        CHARACTER_JOB_ETHIC: Math.round((50 + r() * 2) * base),
        HUMANITIES_LITERACY: Math.round((30 + r() * 2) * base),
        FOREIGN_LANGUAGE: Math.round(r() * 2 * base),
      };
  if (isMe) ME_STUDENT_ID = id;
  users.push({ userId: id, name, email: `s${g}${c}${String(n).padStart(2, '0')}@bssm.hs.kr`, role: 'STUDENT', profileImageUrl: null });
  students.push({ studentId: id, name, grade: g, classNo: c, number: n, scores, githubUrl: isMe ? 'https://github.com/octocat' : null, linkedinUrl: isMe ? 'https://www.linkedin.com/in/example' : null });
}

/* ---------- 목업 로그인 세션 (설정 화면의 "목업 역할"로 전환) ---------- */
const ROLE_KEY = 'mock-role';
export function mockRole(): Role {
  try {
    const r = localStorage.getItem(ROLE_KEY);
    if (r === 'TEACHER' || r === 'ADMIN' || r === 'STUDENT') return r;
  } catch { /* 무시 */ }
  return 'STUDENT';
}
export function setMockRole(role: Role) {
  try { localStorage.setItem(ROLE_KEY, role); } catch { /* 무시 */ }
}
export function currentUser(): MockUser {
  const role = mockRole();
  const id = role === 'STUDENT' ? ME_STUDENT_ID : role === 'TEACHER' ? TEACHER_KIM : ADMIN_ID;
  return users.find((u) => u.userId === id)!;
}
export const isTeacherRole = (u: MockUser) => u.role === 'TEACHER' || u.role === 'ADMIN';

/* ---------- 조회 도우미 ---------- */
export const findStudent = (id: string) => students.find((s) => s.studentId === id) ?? null;
export const findTeacher = (id: string) => teachers.find((t) => t.teacherId === id) ?? null;
export const studentRef = (s: MockStudent): StudentRef => ({ studentId: s.studentId, name: s.name, grade: s.grade, classNo: s.classNo, number: s.number });
export const teacherRef = (id: string): TeacherRef => ({ teacherId: id, name: findTeacher(id)?.name ?? users.find((u) => u.userId === id)?.name ?? '알 수 없음' });
export const totalScore = (s: MockStudent) => SCORE_TYPES.reduce((a, t) => a + s.scores[t], 0);

/* RANK() 방식 순위 + 정렬 (총점 내림차순 → 학년 → 반 → 번호) */
export function rankedStudents(grade?: number | null) {
  const pool = students.filter((s) => !grade || s.grade === grade)
    .map((s) => ({ s, total: totalScore(s) }))
    .sort((a, b) => b.total - a.total || a.s.grade - b.s.grade || a.s.classNo - b.s.classNo || a.s.number - b.s.number);
  const out: { s: MockStudent; total: number; rank: number }[] = [];
  pool.forEach((x, i) => out.push({ ...x, rank: i > 0 && x.total === pool[i - 1].total ? out[i - 1].rank : i + 1 }));
  return out;
}

/* ---------- 마역량 평가항목 · 환산 기준 ---------- */
export interface ScoreItem { itemId: number; scoreType: ScoreType; name: string; maxPoints: number; description: string | null; }
export const scoreItems: ScoreItem[] = [
  { itemId: 1, scoreType: 'JOB_BASIC', name: '출결 · 생활 우수', maxPoints: 40, description: '학기별 개근 20점' },
  { itemId: 2, scoreType: 'JOB_BASIC', name: '직업기초 교육 이수', maxPoints: 80, description: '과정당 10점' },
  { itemId: 11, scoreType: 'MAJOR_SKILL', name: '국가기술자격증', maxPoints: 120, description: '기능사 100점, 산업기사 120점' },
  { itemId: 12, scoreType: 'MAJOR_SKILL', name: '민간 자격증', maxPoints: 50, description: '리눅스마스터 등' },
  { itemId: 13, scoreType: 'MAJOR_SKILL', name: '대회 수상', maxPoints: 150, description: '교내 금상 100점, 교외 장려 60점' },
  { itemId: 14, scoreType: 'MAJOR_SKILL', name: '프로젝트 · 포트폴리오', maxPoints: 100, description: '나르샤 등 완료 시' },
  { itemId: 21, scoreType: 'CHARACTER_JOB_ETHIC', name: '봉사활동', maxPoints: 50, description: '10시간당 25점' },
  { itemId: 22, scoreType: 'CHARACTER_JOB_ETHIC', name: '학생회 · 리더 활동', maxPoints: 50, description: null },
  { itemId: 31, scoreType: 'HUMANITIES_LITERACY', name: '독서 · 인문 활동', maxPoints: 80, description: '권당 2점' },
  { itemId: 41, scoreType: 'FOREIGN_LANGUAGE', name: '공인 어학 성적', maxPoints: 100, description: 'TOEIC 700 이상 등' },
];

export interface GradeCriteriaArea { scoreType: ScoreType; label: string; maxRawScore: number; conversionRate: number; grades: { grade: string; minRawScore: number }[]; }
export const gradeCriteria: GradeCriteriaArea[] = [
  { scoreType: 'JOB_BASIC', label: SCORE_TYPE_LABEL.JOB_BASIC, maxRawScore: 100, conversionRate: 0.2, grades: [{ grade: 'A', minRawScore: 80 }, { grade: 'B', minRawScore: 50 }, { grade: 'C', minRawScore: 20 }] },
  { scoreType: 'MAJOR_SKILL', label: SCORE_TYPE_LABEL.MAJOR_SKILL, maxRawScore: 300, conversionRate: 0.2, grades: [{ grade: 'A', minRawScore: 200 }, { grade: 'B', minRawScore: 120 }, { grade: 'C', minRawScore: 60 }] },
  { scoreType: 'CHARACTER_JOB_ETHIC', label: SCORE_TYPE_LABEL.CHARACTER_JOB_ETHIC, maxRawScore: 100, conversionRate: 0.2, grades: [{ grade: 'A', minRawScore: 80 }, { grade: 'B', minRawScore: 50 }, { grade: 'C', minRawScore: 20 }] },
  { scoreType: 'HUMANITIES_LITERACY', label: SCORE_TYPE_LABEL.HUMANITIES_LITERACY, maxRawScore: 80, conversionRate: 0.25, grades: [{ grade: 'A', minRawScore: 60 }, { grade: 'B', minRawScore: 40 }, { grade: 'C', minRawScore: 20 }] },
  { scoreType: 'FOREIGN_LANGUAGE', label: SCORE_TYPE_LABEL.FOREIGN_LANGUAGE, maxRawScore: 100, conversionRate: 0.2, grades: [{ grade: 'A', minRawScore: 80 }, { grade: 'B', minRawScore: 50 }, { grade: 'C', minRawScore: 20 }] },
];
export function areaGrade(t: ScoreType, raw: number) {
  return gradeCriteria.find((a) => a.scoreType === t)?.grades.find((g) => raw >= g.minRawScore)?.grade ?? null;
}

/* ---------- 마역량 점수 획득 내역 (MeisterScoreDetails) ---------- */
export interface ScoreDetail {
  detailId: string; studentId: string; scoreType: ScoreType; itemId: number | null; itemName: string | null;
  content: string; points: number; teacherId: string; evidenceId: string | null; evidenceFileName: string | null; createdAt: string;
}
export const scoreDetails: ScoreDetail[] = [];
const D = (studentId: string, itemId: number, content: string, points: number, teacherId: string, ago: number, evidenceFileName: string | null = null) => {
  const item = scoreItems.find((i) => i.itemId === itemId)!;
  scoreDetails.push({ detailId: uuid(), studentId, scoreType: item.scoreType, itemId, itemName: item.name, content, points, teacherId, evidenceId: evidenceFileName ? uuid() : null, evidenceFileName, createdAt: daysAgo(ago) });
};
// 손범수 내역 (영역 합이 위 scores와 일치하도록)
D(ME_STUDENT_ID, 1, '1학기 개근', 20, TEACHER_KIM, 120);
D(ME_STUDENT_ID, 2, '직업기초 교육 7과정 이수', 70, TEACHER_KIM, 60);
D(ME_STUDENT_ID, 11, '정보처리기능사 취득', 100, TEACHER_KIM, 1, '정보처리기능사.pdf');
D(ME_STUDENT_ID, 12, '리눅스마스터 2급 취득', 50, TEACHER_KIM, 180, '리눅스마스터.pdf');
D(ME_STUDENT_ID, 14, '나르샤 프로젝트 완료', 30, TEACHER_LEE, 120);
D(ME_STUDENT_ID, 21, '봉사활동 20시간', 50, TEACHER_KIM, 121);
D(ME_STUDENT_ID, 22, '학급 부반장', 30, TEACHER_KIM, 200);
D(ME_STUDENT_ID, 31, '독서 31권', 62, TEACHER_PARK, 30);
D(ME_STUDENT_ID, 41, 'TOEIC 650점 (부분 인정)', 40, TEACHER_HEAD2, 90, 'toeic.pdf');

/* ---------- 상벌점 기준 · 내역 ---------- */
export interface PointRule { ruleId: number; type: PointType; category: string; title: string; points: number; description: string | null; note: string | null; isActive: boolean; }
export const pointRules: PointRule[] = [
  { ruleId: 1, type: 'MERIT', category: '봉사', title: '교내 봉사활동', points: 3, description: '담당 교사가 확인한 교내 봉사활동 1회', note: '하루 1회만 인정', isActive: true },
  { ruleId: 2, type: 'MERIT', category: '봉사', title: '학교 행사 진행 도움', points: 5, description: '행사 1건', note: null, isActive: true },
  { ruleId: 3, type: 'MERIT', category: '학습', title: '수업 태도 우수', points: 10, description: '교과 교사 추천', note: null, isActive: true },
  { ruleId: 4, type: 'MERIT', category: '학습', title: '방과후 멘토링 활동', points: 5, description: null, note: '학기당 최대 2회', isActive: true },
  { ruleId: 5, type: 'MERIT', category: '생활', title: '분실물 습득 신고', points: 2, description: null, note: null, isActive: true },
  { ruleId: 6, type: 'MERIT', category: '기숙사', title: '기숙사 생활 모범', points: 5, description: '사감 교사 추천', note: null, isActive: true },
  { ruleId: 7, type: 'DEMERIT', category: '생활', title: '지각', points: 1, description: '조회 시작 이후 등교', note: null, isActive: true },
  { ruleId: 8, type: 'DEMERIT', category: '생활', title: '복장 규정 위반', points: 2, description: null, note: null, isActive: true },
  { ruleId: 9, type: 'DEMERIT', category: '기숙사', title: '소등 시간 미준수', points: 3, description: '22시 이후 소등 미준수', note: '1회당', isActive: true },
  { ruleId: 10, type: 'DEMERIT', category: '학습', title: '수업 중 휴대폰 사용', points: 3, description: '교과 교사 확인', note: null, isActive: true },
  { ruleId: 11, type: 'DEMERIT', category: '학습', title: '무단 결과', points: 5, description: null, note: '1교시당', isActive: true },
  { ruleId: 12, type: 'DEMERIT', category: '생활', title: '공용 시설 훼손', points: 10, description: null, note: '고의인 경우', isActive: false },
];

export interface MeritPoint { meritPointId: string; studentId: string; type: PointType; title: string; content: string | null; points: number; teacherId: string; ruleId: number | null; createdAt: string; }
export const meritPoints: MeritPoint[] = [
  { meritPointId: uuid(), studentId: ME_STUDENT_ID, type: 'MERIT', title: '교내 봉사활동', content: '학급 환경 정리', points: 3, teacherId: TEACHER_KIM, ruleId: 1, createdAt: daysAgo(15) },
  { meritPointId: uuid(), studentId: ME_STUDENT_ID, type: 'MERIT', title: '학교 행사 진행 도움', content: '축제 진행', points: 5, teacherId: TEACHER_PARK, ruleId: 2, createdAt: daysAgo(37) },
  { meritPointId: uuid(), studentId: ME_STUDENT_ID, type: 'MERIT', title: '수업 태도 우수', content: null, points: 10, teacherId: TEACHER_KIM, ruleId: 3, createdAt: daysAgo(56) },
  { meritPointId: uuid(), studentId: ME_STUDENT_ID, type: 'DEMERIT', title: '지각', content: '10분 지각', points: 1, teacherId: TEACHER_LEE, ruleId: 7, createdAt: daysAgo(27, 8) },
  { meritPointId: uuid(), studentId: ME_STUDENT_ID, type: 'DEMERIT', title: '소등 시간 미준수', content: null, points: 3, teacherId: TEACHER_LEE, ruleId: 9, createdAt: daysAgo(44, 23) },
];

/* ---------- 알림 ---------- */
export type NotificationType = 'EVIDENCE_APPROVED' | 'EVIDENCE_REJECTED' | 'MEISTER_SCORE_CHANGED' | 'SELF_REPORT_RECEIVED' | 'SELF_REPORT_STATUS_CHANGED' | 'SELF_REPORT_REPLIED';
export interface MockNotification { notificationId: string; userId: string; type: NotificationType; title: string; body: string; targetUrl: string | null; isRead: boolean; createdAt: string; }
export const notifications: MockNotification[] = [];
export function notify(userId: string, type: NotificationType, title: string, body: string, targetUrl: string | null) {
  notifications.unshift({ notificationId: uuid(), userId, type, title, body, targetUrl, isRead: false, createdAt: isoKST() });
}
notifications.push(
  { notificationId: uuid(), userId: ME_STUDENT_ID, type: 'EVIDENCE_APPROVED', title: '증빙자료 승인', body: "제출한 '정보처리기능사'가 승인되어 전공직무능력 +100점이 반영되었습니다.", targetUrl: `/students/${ME_STUDENT_ID}?tab=history`, isRead: false, createdAt: daysAgo(1, 10) },
  { notificationId: uuid(), userId: ME_STUDENT_ID, type: 'SELF_REPORT_REPLIED', title: '자진 신고 답변', body: '자진 신고에 새 답변이 있습니다.', targetUrl: null, isRead: false, createdAt: daysAgo(7, 16) },
  { notificationId: uuid(), userId: ME_STUDENT_ID, type: 'MEISTER_SCORE_CHANGED', title: '마역량 점수 변경', body: '인문학적 소양 점수가 +62점 변경되었습니다.', targetUrl: `/students/${ME_STUDENT_ID}?tab=history`, isRead: true, createdAt: daysAgo(30, 11) },
  { notificationId: uuid(), userId: TEACHER_KIM, type: 'SELF_REPORT_RECEIVED', title: '자진 신고 접수', body: '[자진 신고] 2학년 1반 손범수 학생으로부터 자진 신고가 접수되었습니다.', targetUrl: null, isRead: false, createdAt: daysAgo(1, 21) },
);
