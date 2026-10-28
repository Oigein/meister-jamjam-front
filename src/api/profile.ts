/* 프로필 링크 (docs/api/07-profile-links.md) */
import { api } from './client';

export interface ProfileLinks { githubUrl: string | null; linkedinUrl: string | null; }

/* PATCH: 키를 빼면 변경 없음, null 또는 "" 이면 삭제, 값이 있으면 서버가 정규화해 저장 */
export type ProfileLinksPatch = Partial<Record<keyof ProfileLinks, string | null>>;

export const getProfileLinks = (signal?: AbortSignal) => api<ProfileLinks>('/api/me/profile', { signal });

export const saveProfileLinks = (patch: ProfileLinksPatch) => api<ProfileLinks>('/api/me/profile', { method: 'PATCH', body: patch });
