import { fail, paginate, route } from '../server';
import { currentUser, rankedStudents } from '../db';

route('GET', '/api/meister/rankings', ({ query }) => {
  const g = query.get('grade');
  const grade = g === null || g === '' ? null : Number(g);
  if (grade !== null && ![1, 2, 3].includes(grade)) fail(400, 'VALIDATION_FAILED', '학년은 1~3만 선택할 수 있습니다.', { fieldErrors: [{ field: 'grade', reason: 'OUT_OF_RANGE', message: '학년은 1~3만 선택할 수 있습니다.' }] });
  const me = currentUser();
  const ranked = rankedStudents(grade);
  const rows = ranked.map(({ s, total, rank }) => ({ rank, studentId: s.studentId, name: s.name, grade: s.grade, classNo: s.classNo, number: s.number, totalScore: total, isMe: s.studentId === me.userId }));
  const p = paginate(rows, query.get('page'));
  const idx = rows.findIndex((r) => r.isMe);
  return {
    grade,
    ...p,
    myRank: idx < 0 ? null : { studentId: rows[idx].studentId, rank: rows[idx].rank, totalScore: rows[idx].totalScore, page: Math.floor(idx / p.size) + 1 },
  };
});
