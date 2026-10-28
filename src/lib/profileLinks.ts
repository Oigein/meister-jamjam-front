/*
 * 프로필 링크 정규화 (docs/api/07-profile-links.md 2.2)
 * - 화면에서는 입력 중 안내(저장될 주소 / 오류 문구)에 사용. 최종 판단은 서버 fieldErrors가 기준
 * - 목업 서버도 같은 규칙을 쓰도록 이 함수를 그대로 사용
 */
export type LinkField = 'githubUrl' | 'linkedinUrl';
export type LinkReason = 'INVALID_HOST' | 'MISSING_ID' | 'INVALID_ID' | 'NOT_PERSONAL_PROFILE' | 'RESERVED_PATH' | 'INVALID_SCHEME';

/* url: 표준 주소(빈 입력이면 null = 삭제). reason/message가 있으면 저장 불가 */
export interface LinkParse { url: string | null; reason?: LinkReason; message?: string; }

export const LINK_MESSAGES: Record<LinkReason, string> = {
  INVALID_HOST: '', // 필드마다 다름 → linkMessage()
  MISSING_ID: '아이디가 없는 주소입니다.',
  INVALID_ID: '아이디 형식이 올바르지 않습니다.',
  NOT_PERSONAL_PROFILE: '개인 프로필 주소(linkedin.com/in/아이디)를 입력하세요.',
  RESERVED_PATH: '개인 계정 주소를 입력하세요.',
  INVALID_SCHEME: '사용할 수 없는 주소입니다.',
};

export function linkMessage(field: LinkField, reason: LinkReason) {
  if (reason === 'INVALID_HOST') return field === 'githubUrl' ? 'GitHub 주소가 아닙니다.' : 'LinkedIn 주소가 아닙니다.';
  return LINK_MESSAGES[reason];
}

/* GitHub 시스템 경로 (개인 계정이 아님) */
const GITHUB_RESERVED = new Set([
  'settings', 'orgs', 'organizations', 'login', 'logout', 'join', 'signup', 'sessions', 'explore', 'topics', 'trending',
  'collections', 'events', 'marketplace', 'features', 'pricing', 'about', 'contact', 'site', 'security', 'sponsors',
  'notifications', 'issues', 'pulls', 'search', 'new', 'codespaces', 'apps', 'enterprise', 'enterprises', 'team', 'teams',
  'customer-stories', 'readme', 'nonprofit', 'education', 'dashboard', 'account', 'stars', 'watching', 'users', 'repos',
  'discussions', 'blog', 'home', 'mobile', 'copilot', 'github', 'gist', 'resources', 'solutions', 'downloads',
]);

const GITHUB_ID = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const LINKEDIN_ID = /^[A-Za-z0-9\-%]{3,100}$/;

const err = (field: LinkField, reason: LinkReason): LinkParse => ({ url: null, reason, message: linkMessage(field, reason) });

export function normalizeLink(field: LinkField, input: string | null | undefined): LinkParse {
  // 1. 앞뒤 공백 제거
  let s = (input ?? '').trim();
  if (!s) return { url: null };
  // 2. 앞의 @ 제거
  s = s.replace(/^@+/, '');
  if (!s) return err(field, 'MISSING_ID');

  const isGithub = field === 'githubUrl';

  // 아이디만 입력 (도메인·경로 없음)
  if (!/[/.:]/.test(s)) {
    s = isGithub ? `https://github.com/${s}` : `https://www.linkedin.com/in/${s}`;
  } else {
    // 스킴 검사: "github.com:443" 같은 포트 표기와 구분
    const m = /^([a-z][a-z0-9+.-]*):(.*)$/is.exec(s);
    if (m && !/^\d/.test(m[2])) {
      const scheme = m[1].toLowerCase();
      if (scheme !== 'http' && scheme !== 'https') return err(field, 'INVALID_SCHEME');
      if (!m[2].startsWith('//')) return err(field, 'INVALID_SCHEME');
    } else {
      if (s.startsWith('//')) s = s.slice(2);
      s = `https://${s}`;
    }
  }

  let u: URL;
  try { u = new URL(s); } catch { return err(field, 'INVALID_HOST'); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return err(field, 'INVALID_SCHEME');
  // 계정 정보가 든 URL (https://user:pw@github.com/...)
  if (u.username || u.password) return err(field, 'INVALID_SCHEME');

  // 3. 호스트 검사 (정확히 일치)
  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  if (u.port) return err(field, 'INVALID_HOST');
  if (isGithub) {
    if (host !== 'github.com' && host !== 'www.github.com') return err(field, 'INVALID_HOST');
  } else if (host !== 'linkedin.com' && !/^([a-z0-9-]+\.)+linkedin\.com$/.test(host)) {
    return err(field, 'INVALID_HOST');
  }

  // 4. 아이디 추출 · 5. 형식 검사 후 표준 URL로 조립
  const segs = u.pathname.split('/').filter(Boolean);
  if (isGithub) {
    const id = segs[0];
    if (!id) return err(field, 'MISSING_ID');
    if (GITHUB_RESERVED.has(id.toLowerCase())) return err(field, 'RESERVED_PATH');
    if (!GITHUB_ID.test(id)) return err(field, 'INVALID_ID');
    return { url: `https://github.com/${id}` };
  }
  if (segs.length === 0) return err(field, 'MISSING_ID');
  const first = segs[0].toLowerCase();
  // /company/, /school/, /showcase/, /groups/ … 개인 프로필(/in/)이 아닌 페이지
  if (first !== 'in') return err(field, 'NOT_PERSONAL_PROFILE');
  const id = segs[1];
  if (!id) return err(field, 'MISSING_ID');
  if (!LINKEDIN_ID.test(id)) return err(field, 'INVALID_ID');
  return { url: `https://www.linkedin.com/in/${id}` };
}

/* 저장된 표준 주소 → 입력창에 보여줄 짧은 형태 */
export const githubDisplay = (url: string | null) => (url ? `@${url.replace(/^https:\/\/github\.com\//, '').replace(/\/$/, '')}` : '');
export const linkedinDisplay = (url: string | null) => (url ? url.replace(/^https:\/\/www\./, '') : '');

/* 다른 학생 링크를 그리기 직전 확인 (명세 2.3) */
export const isSafeGithubUrl = (u: string | null | undefined): u is string => !!u && u.startsWith('https://github.com/');
export const isSafeLinkedinUrl = (u: string | null | undefined): u is string => !!u && u.startsWith('https://www.linkedin.com/in/');
