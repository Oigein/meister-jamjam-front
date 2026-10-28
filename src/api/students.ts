import { request, USE_MOCK, mock } from './client';
import { findMockStudent } from './ranking';
import { sampleProps, type MeisterDetailProps } from '../components/MeisterDetail';

/*
 * 학생 상세 조회. 백엔드 응답이 MeisterDetailProps 모양과 다르면
 * 여기서 변환(매핑)만 하면 되고 화면 컴포넌트는 건드릴 필요 없음.
 */
export async function getMeisterDetail(studentId: string, signal?: AbortSignal): Promise<MeisterDetailProps> {
  if (USE_MOCK) {
    const s = studentId === 'me' ? null : findMockStudent(studentId);
    if (!s || s.isMe) return mock(sampleProps);
    // 목업: 랭킹에서 누른 학생이면 이름·학번만 바꿔서 보여줌
    return mock({ ...sampleProps, student: { ...sampleProps.student, name: s.name, grade: s.grade, cls: s.cls, num: s.num, githubUrl: null, linkedinUrl: null } });
  }
  return request<MeisterDetailProps>(`/students/${encodeURIComponent(studentId)}/meister`, { signal });
}
