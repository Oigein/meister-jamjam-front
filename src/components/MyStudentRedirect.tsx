import { Navigate, useLocation } from 'react-router-dom';
import { useMe } from '../lib/session';

/* /students/me → /students/{내 학생 ID}. 학생 ID는 사용자 ID와 같음 (Students ↔ Users 1:1). 알림의 ?tab=…&detailId=… 유지 */
export function MyStudentRedirect() {
  const me = useMe();
  const { search } = useLocation();
  if (!me.student) return <main className="page"><p className="status-msg">학생 계정만 내 역량을 볼 수 있습니다.</p></main>;
  return <Navigate to={`/students/${me.userId}${search}`} replace />;
}
