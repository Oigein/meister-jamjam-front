import { route } from '../server';
import { currentUser, findStudent } from '../db';

route('GET', '/api/me', () => {
  const u = currentUser();
  const s = u.role === 'STUDENT' ? findStudent(u.userId) : null;
  return { ...u, student: s ? { grade: s.grade, classNo: s.classNo, number: s.number } : null };
});

route('POST', '/auth/logout', () => undefined);
