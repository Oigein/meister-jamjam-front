/* 로그인 · 내 계정 (docs/api/01-auth.md) */
import { API_ORIGIN, USE_MOCK, api } from './client';
import type { Role } from './types';

export interface Me {
  userId: string;
  name: string;
  email: string;
  role: Role;
  profileImageUrl: string | null;
  student: { grade: number; classNo: number; number: number } | null; // 교사·관리자는 null
}

export const getMe = (signal?: AbortSignal) => api<Me>('/api/me', { signal });

export const logout = () => api<void>('/auth/logout', { method: 'POST' });

/* 구글 로그인 시작 주소. redirect는 /로 시작하는 내부 경로만 */
export function googleLoginUrl(redirect?: string | null) {
  const safe = redirect && redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : null;
  return `${API_ORIGIN}/auth/google${safe ? `?redirect=${encodeURIComponent(safe)}` : ''}`;
}

/* 목업 모드에서 로그인 버튼 → 바로 앱으로 */
export const isMockLogin = USE_MOCK;

export const isTeacher = (me: Me) => me.role === 'TEACHER' || me.role === 'ADMIN';
