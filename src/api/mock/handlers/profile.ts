/* 프로필 링크 목업 (docs/api/07-profile-links.md) */
import { fail, route, validationFail } from '../server';
import { currentUser, findStudent } from '../db';
import type { FieldError } from '../../client';
import { normalizeLink, type LinkField } from '../../../lib/profileLinks';

/* 사용자당 분당 20회 */
const hits = new Map<string, number[]>();
function rateLimit(userId: string, limit = 20) {
  const now = Date.now();
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= limit) {
    const retryAfter = Math.ceil((60_000 - (now - recent[0])) / 1000);
    fail(429, 'TOO_MANY_REQUESTS', `요청이 많습니다. ${retryAfter}초 후 다시 시도하세요.`, { retryAfter });
  }
  recent.push(now);
  hits.set(userId, recent);
}

route('GET', '/api/me/profile', () => {
  const u = currentUser();
  const s = u.role === 'STUDENT' ? findStudent(u.userId) : null;
  return { githubUrl: s?.githubUrl ?? null, linkedinUrl: s?.linkedinUrl ?? null };
});

route('PATCH', '/api/me/profile', ({ body }) => {
  const u = currentUser();
  const s = u.role === 'STUDENT' ? findStudent(u.userId) : null;
  if (!s) fail(403, 'FORBIDDEN', '프로필 링크는 학생만 등록할 수 있습니다.');
  rateLimit(u.userId);

  const b = (body ?? {}) as Record<string, unknown>;
  const next: Partial<Record<LinkField, string | null>> = {};
  const errors: FieldError[] = [];
  for (const field of ['githubUrl', 'linkedinUrl'] as LinkField[]) {
    if (!(field in b)) continue; // 키 없음 → 변경 없음
    const v = b[field];
    if (v === null || v === '') { next[field] = null; continue; } // 삭제
    if (typeof v !== 'string') {
      errors.push({ field, reason: 'INVALID_ID', message: '아이디 형식이 올바르지 않습니다.' });
      continue;
    }
    const r = normalizeLink(field, v);
    if (r.reason) errors.push({ field, reason: r.reason, message: r.message! });
    else next[field] = r.url;
  }
  // 하나라도 실패하면 둘 다 저장 안 함
  if (errors.length) validationFail(errors);
  if ('githubUrl' in next) s!.githubUrl = next.githubUrl ?? null;
  if ('linkedinUrl' in next) s!.linkedinUrl = next.linkedinUrl ?? null;
  return { githubUrl: s!.githubUrl, linkedinUrl: s!.linkedinUrl };
});
