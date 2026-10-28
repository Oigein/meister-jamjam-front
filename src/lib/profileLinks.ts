/* 사용자가 어떤 형태로 입력해도 표준 주소로 바꿔 저장 (명세 2.3) */
export interface LinkParse { url: string | null; error?: string; }

export function parseGithub(input: string): LinkParse {
  const s = input.trim();
  if (!s) return { url: null };
  const m = s.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9-]+)\/?$/i) ?? s.match(/^@?([A-Za-z0-9-]+)$/);
  if (!m || m[1].length > 39) return { url: null, error: 'GitHub 아이디(@아이디) 또는 github.com/아이디 형식으로 입력하세요.' };
  return { url: `https://github.com/${m[1]}` };
}

export function parseLinkedin(input: string): LinkParse {
  const s = input.trim();
  if (!s) return { url: null };
  const m = s.match(/^(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/in\/([A-Za-z0-9\-_%]+)\/?$/i);
  if (!m) return { url: null, error: '개인 프로필 주소(linkedin.com/in/아이디)를 입력하세요.' };
  return { url: `https://www.linkedin.com/in/${m[1]}` };
}

/* 저장된 표준 주소 → 입력창에 보여줄 짧은 형태 */
export const githubDisplay = (url: string | null) => (url ? `@${url.split('/').filter(Boolean).pop()}` : '');
export const linkedinDisplay = (url: string | null) => (url ? url.replace(/^https:\/\/www\./, '') : '');
