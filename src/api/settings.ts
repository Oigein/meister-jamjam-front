import { USE_MOCK, mock, request } from './client';
import { sampleProps } from '../components/MeisterDetail';

export interface ProfileLinks { githubUrl: string | null; linkedinUrl: string | null; }

let MOCK: ProfileLinks = { githubUrl: sampleProps.student.githubUrl ?? null, linkedinUrl: sampleProps.student.linkedinUrl ?? null };

export const getProfileLinks = (signal?: AbortSignal) =>
  USE_MOCK ? mock(MOCK) : request<ProfileLinks>('/me/links', { signal });

/* 서버도 같은 규칙(표준 주소 접두어)으로 한 번 더 검증해야 함 */
export async function saveProfileLinks(links: ProfileLinks) {
  if (!USE_MOCK) return request<ProfileLinks>('/me/links', { method: 'PUT', body: JSON.stringify(links) });
  MOCK = links;
  return mock(links, 300);
}
