/* 마역량 세부 조회 목업 (docs/api/03-meister-detail.md) */
import { fail, paginate, route } from '../server';
import {
  TEACHER_HEAD2, TEACHER_KIM, TEACHER_LEE, TEACHER_PARK,
  areaGrade, currentUser, daysAgo, findStudent, gradeCriteria, isTeacherRole, meritPoints, pointRules, rankedStudents,
  scoreDetails, scoreItems, teacherRef, totalScore, uuid, type MockStudent,
} from '../db';
import { mulberry32 } from '../../../lib/random';
import { SCORE_TYPES, SCORE_TYPE_LABEL, type ScoreType } from '../../types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function studentOr404(id: string): MockStudent {
  const s = UUID_RE.test(id) ? findStudent(id) : null;
  if (!s) fail(404, 'STUDENT_NOT_FOUND', '학생을 찾을 수 없습니다.');
  ensureSampleData(s);
  return s;
}

/* 환산 기준 미등록 상태 확인용: localStorage 'mock-criteria' = 'none' */
function criteriaRegistered() {
  try { return localStorage.getItem('mock-criteria') !== 'none'; } catch { return true; }
}

/* ---------- 다른 학생용 목업 내역 (처음 조회할 때 영역 점수에 맞춰 만들어 둠) ---------- */
const seeded = new Set<string>();
const AREA_TEACHERS: Record<ScoreType, string[]> = {
  JOB_BASIC: [TEACHER_KIM, TEACHER_PARK],
  MAJOR_SKILL: [TEACHER_KIM, TEACHER_LEE],
  CHARACTER_JOB_ETHIC: [TEACHER_KIM, TEACHER_LEE],
  HUMANITIES_LITERACY: [TEACHER_PARK],
  FOREIGN_LANGUAGE: [TEACHER_HEAD2],
};
function ensureSampleData(s: MockStudent) {
  if (seeded.has(s.studentId)) return;
  seeded.add(s.studentId);
  const rand = mulberry32(parseInt(s.studentId.slice(-6), 16) || 1);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];

  for (const t of SCORE_TYPES) {
    const have = scoreDetails.filter((d) => d.studentId === s.studentId && d.scoreType === t).reduce((a, d) => a + d.points, 0);
    let left = s.scores[t] - have;
    if (left <= 0) continue;
    const items = scoreItems.filter((i) => i.scoreType === t);
    const parts = left >= 40 && rand() < 0.6 ? 2 : 1;
    for (let k = 0; k < parts; k++) {
      const pts = k === parts - 1 ? left : Math.max(2, Math.round((left * (0.4 + rand() * 0.2)) / 2) * 2);
      left -= pts;
      const item = pick(items);
      const withEvidence = t === 'MAJOR_SKILL' || t === 'FOREIGN_LANGUAGE' ? rand() < 0.7 : rand() < 0.2;
      scoreDetails.push({
        detailId: uuid(), studentId: s.studentId, scoreType: t, itemId: item.itemId, itemName: item.name,
        content: `${item.name} 인정`, points: pts, teacherId: pick(AREA_TEACHERS[t]),
        evidenceId: withEvidence ? uuid() : null, evidenceFileName: withEvidence ? `${item.name.replace(/\s/g, '')}.pdf` : null,
        createdAt: daysAgo(5 + Math.floor(rand() * 230), 9 + Math.floor(rand() * 8)),
      });
    }
  }

  if (!meritPoints.some((m) => m.studentId === s.studentId)) {
    const active = pointRules.filter((r) => r.isActive);
    const n = Math.floor(rand() * 5);
    for (let k = 0; k < n; k++) {
      const r = pick(active);
      meritPoints.push({
        meritPointId: uuid(), studentId: s.studentId, type: r.type, title: r.title, content: null, points: r.points,
        teacherId: pick([TEACHER_KIM, TEACHER_PARK, TEACHER_LEE]), ruleId: r.ruleId, createdAt: daysAgo(3 + Math.floor(rand() * 120), 8 + Math.floor(rand() * 10)),
      });
    }
  }
}

const canSeePrivate = (studentId: string) => {
  const me = currentUser();
  return me.userId === studentId || isTeacherRole(me);
};

/* 2.1 학생 기본 정보 */
route('GET', '/api/students/:studentId', ({ params }) => {
  const s = studentOr404(params.studentId);
  const rank = rankedStudents().find((r) => r.s.studentId === s.studentId)!.rank;
  return {
    studentId: s.studentId, name: s.name, grade: s.grade, classNo: s.classNo, number: s.number,
    totalScore: totalScore(s), rank, githubUrl: s.githubUrl, linkedinUrl: s.linkedinUrl,
    isMe: currentUser().userId === s.studentId,
  };
});

/* 2.2 영역별 점수 */
route('GET', '/api/students/:studentId/meister-scores', ({ params }) => {
  const s = studentOr404(params.studentId);
  const registered = criteriaRegistered();
  return {
    studentId: s.studentId,
    totalScore: totalScore(s),
    criteriaRegistered: registered,
    areas: SCORE_TYPES.map((t) => {
      const raw = s.scores[t] ?? 0;
      const c = gradeCriteria.find((g) => g.scoreType === t);
      return {
        scoreType: t,
        label: SCORE_TYPE_LABEL[t],
        rawScore: raw,
        convertedScore: registered && c ? Math.round(raw * c.conversionRate * 10) / 10 : null,
        grade: registered ? areaGrade(t, raw) : null,
        detailCount: scoreDetails.filter((d) => d.studentId === s.studentId && d.scoreType === t).length,
      };
    }),
  };
});

/* 2.3 점수 획득·변동 내역 */
route('GET', '/api/students/:studentId/meister-scores/history', ({ params, query }) => {
  const s = studentOr404(params.studentId);
  const scoreType = query.get('scoreType') || null;
  if (scoreType && !SCORE_TYPES.includes(scoreType as ScoreType)) {
    fail(400, 'VALIDATION_FAILED', '입력값을 확인해 주세요.', { fieldErrors: [{ field: 'scoreType', reason: 'INVALID_ENUM', message: '알 수 없는 영역입니다.' }] });
  }
  const order = query.get('order') || 'desc';
  if (order !== 'desc' && order !== 'asc') {
    fail(400, 'VALIDATION_FAILED', '입력값을 확인해 주세요.', { fieldErrors: [{ field: 'order', reason: 'INVALID_ENUM', message: 'desc 또는 asc만 가능합니다.' }] });
  }
  const showEvidence = canSeePrivate(s.studentId);
  const rows = scoreDetails
    .filter((d) => d.studentId === s.studentId && (!scoreType || d.scoreType === scoreType))
    .sort((a, b) => (order === 'asc' ? 1 : -1) * (a.createdAt.localeCompare(b.createdAt) || a.detailId.localeCompare(b.detailId)))
    .map((d) => ({
      detailId: d.detailId,
      scoreType: d.scoreType,
      label: SCORE_TYPE_LABEL[d.scoreType],
      itemName: d.itemName,
      content: d.content,
      points: d.points,
      teacher: teacherRef(d.teacherId),
      evidence: showEvidence && d.evidenceId ? { evidenceId: d.evidenceId, fileName: d.evidenceFileName ?? '증빙자료' } : null,
      createdAt: d.createdAt,
    }));
  return paginate(rows, query.get('page'));
});

/* 2.4 환산 등급 기준 */
route('GET', '/api/meister/grade-criteria', () => (
  criteriaRegistered() ? { registered: true, areas: gradeCriteria } : { registered: false, areas: [] }
));

/* 2.5 상·벌점 내역 */
route('GET', '/api/students/:studentId/merit-points', ({ params, query }) => {
  const s = studentOr404(params.studentId);
  if (!canSeePrivate(s.studentId)) fail(403, 'FORBIDDEN', '본인과 선생님만 상·벌점 내역을 볼 수 있습니다.');
  const groupBy = query.get('groupBy') || 'none';
  if (groupBy !== 'none' && groupBy !== 'teacher') {
    fail(400, 'VALIDATION_FAILED', '입력값을 확인해 주세요.', { fieldErrors: [{ field: 'groupBy', reason: 'INVALID_ENUM', message: 'none 또는 teacher만 가능합니다.' }] });
  }
  const mine = meritPoints.filter((m) => m.studentId === s.studentId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const sum = (xs: typeof mine) => xs.reduce((a, m) => a + m.points, 0);
  const merits = mine.filter((m) => m.type === 'MERIT');
  const demerits = mine.filter((m) => m.type === 'DEMERIT');
  const totals = { studentId: s.studentId, meritTotal: sum(merits), demeritTotal: sum(demerits), net: sum(merits) - sum(demerits) };

  if (groupBy === 'teacher') {
    const by = new Map<string, typeof mine>();
    mine.forEach((m) => by.set(m.teacherId, [...(by.get(m.teacherId) ?? []), m]));
    return {
      ...totals,
      byTeacher: [...by].map(([tid, xs]) => ({
        teacher: teacherRef(tid),
        meritTotal: sum(xs.filter((m) => m.type === 'MERIT')),
        demeritTotal: sum(xs.filter((m) => m.type === 'DEMERIT')),
        items: xs.map((m) => ({ meritPointId: m.meritPointId, type: m.type, title: m.title, points: m.points, createdAt: m.createdAt })),
      })),
    };
  }
  const item = (m: (typeof mine)[number]) => ({ meritPointId: m.meritPointId, title: m.title, content: m.content, points: m.points, teacher: teacherRef(m.teacherId), createdAt: m.createdAt });
  return { ...totals, merits: merits.map(item), demerits: demerits.map(item) };
});
