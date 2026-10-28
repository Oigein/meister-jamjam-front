import { API_BASE, USE_MOCK, mock, post, request } from './client';

export type Role = 'student' | 'teacher';
export interface Me { id: string; name: string; studentNo: string; role: Role; unread: number; }
export interface Notice { id: string; text: string; time: string; read: boolean; }

// 목업에서는 모든 메뉴를 확인할 수 있게 교사 권한으로 둠. 학생 화면을 보려면 'student'로 변경
const MOCK_ME: Me = { id: 'me', name: '손범수', studentNo: '2109', role: 'teacher', unread: 3 };

const MOCK_NOTICES: Notice[] = [
  { id: 'n1', text: '정보처리기능사 증빙이 승인되어 +10점이 반영되었습니다.', time: '10-28', read: false },
  { id: 'n2', text: '김지훈 선생님이 자진 신고에 답변했습니다.', time: '10-22', read: false },
  { id: 'n3', text: '교내 해커톤(2학기) 접수가 시작되었습니다.', time: '10-20', read: false },
  { id: 'n4', text: '벌점 −2 (지각)가 부여되었습니다.', time: '10-02', read: true },
];

export const getMe = (signal?: AbortSignal) => (USE_MOCK ? mock(MOCK_ME) : request<Me>('/me', { signal }));

export const getNotifications = () => (USE_MOCK ? mock(MOCK_NOTICES) : request<Notice[]>('/notifications'));

export const markNotificationsRead = () => (USE_MOCK ? mock(null) : post<null>('/notifications/read'));

export const logout = () => (USE_MOCK ? mock(null) : post<null>('/auth/logout'));

/* 구글 OAuth는 백엔드가 처리: 이 주소로 이동 → 구글 로그인 → 백엔드가 세션 만들고 앱으로 돌려보냄 */
export const googleLoginUrl = () => `${API_BASE}/auth/google`;
