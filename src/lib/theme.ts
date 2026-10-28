/* 테마 설정. 지금은 브라우저(localStorage)에 저장 — 백엔드 생기면 settings API로 옮기면 됨 */
export type ThemeBg = 'default' | 'gif' | 'mp4';
export type ThemeFit = 'cover' | 'tile' | 'contain';
export interface Theme { bg: ThemeBg; preset: number; fit: ThemeFit; dim: number; size: number; }

export const DEFAULT_THEME: Theme = { bg: 'default', preset: 0, fit: 'cover', dim: 40, size: 2 };
export const FONT_SIZES = [
  { label: '매우 작게', scale: 0.85 },
  { label: '작게', scale: 0.92 },
  { label: '보통', scale: 1 },
  { label: '크게', scale: 1.1 },
  { label: '매우 크게', scale: 1.2 },
];
export const PRESETS = [
  'linear-gradient(135deg, #26324A 0%, #4A6A9A 100%)',
  'linear-gradient(135deg, #7E4A33 0%, #C78B5D 100%)',
  'linear-gradient(135deg, #2F4A38 0%, #6F9372 100%)',
  'linear-gradient(135deg, #121828 0%, #34497A 100%)',
];

const KEY = 'bsm-theme';

export function loadTheme(): Theme {
  try {
    return { ...DEFAULT_THEME, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return DEFAULT_THEME;
  }
}

export function saveTheme(t: Theme) {
  try { localStorage.setItem(KEY, JSON.stringify(t)); } catch { /* 저장 불가 환경: 이번 세션에만 적용 */ }
  applyTheme(t);
}

/* 글자 크기는 앱 전체에 적용 */
export function applyTheme(t: Theme) {
  const scale = FONT_SIZES[t.size]?.scale ?? 1;
  if (scale === 1) document.documentElement.style.removeProperty('zoom');
  else document.documentElement.style.setProperty('zoom', String(scale));
}
