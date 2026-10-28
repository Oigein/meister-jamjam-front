/* 테마 (docs/api/09-theme.md) */
import { api } from './client';
import type { BackgroundFit, BackgroundType, FontScale } from './types';

export type BackgroundSource = 'PRESET' | 'UPLOAD';
export type MediaType = Exclude<BackgroundType, 'NONE'>;

export interface ThemeBackground {
  type: BackgroundType;
  source: BackgroundSource | null; // NONE이면 null
  presetId: number | null;
  assetId: string | null;
  url: string | null;
  thumbnailUrl: string | null;
  fit: BackgroundFit; // MP4는 항상 COVER
  opacity: number; // 0~100
  dim: number; // 0~100, 검은 오버레이 농도
  blur: number; // 0~100
}

export interface Theme {
  background: ThemeBackground;
  fontScale: FontScale;
  textShadow: boolean;
  pauseOnLowPower: boolean;
  autoplayOnDataSaver: boolean;
  updatedAt: string | null;
}

/* PUT 요청 형식: 응답에서 url, thumbnailUrl, updatedAt을 뺀 것 */
export interface ThemeInput {
  background: Omit<ThemeBackground, 'url' | 'thumbnailUrl'>;
  fontScale: FontScale;
  textShadow: boolean;
  pauseOnLowPower: boolean;
  autoplayOnDataSaver: boolean;
}

export interface ThemePreset { presetId: number; type: MediaType; name: string; url: string | null; thumbnailUrl: string | null; }

export interface ThemeAsset {
  assetId: string;
  type: MediaType;
  url: string;
  thumbnailUrl: string | null;
  sizeBytes: number;
  durationSec: number | null;
}

export const FONT_SCALES: FontScale[] = ['XS', 'S', 'M', 'L', 'XL'];
export const FONT_SCALE_RATIO: Record<FontScale, number> = { XS: 0.85, S: 0.92, M: 1, L: 1.15, XL: 1.3 };

/* 업로드 제한 (2.5) */
export const UPLOAD_LIMIT: Record<MediaType, { accept: string; maxMB: number; note: string }> = {
  GIF: { accept: 'image/gif,.gif', maxMB: 10, note: '.gif · 10MB 이하' },
  MP4: { accept: 'video/mp4,.mp4', maxMB: 30, note: '.mp4 (H.264 권장) · 30MB 이하 · 30초 이하 · 소리는 제거되어 저장' },
};
export const MAX_ASSETS = 5;

/* 기본값 (2.1) */
export const DEFAULT_THEME: Theme = {
  background: { type: 'NONE', source: null, presetId: null, assetId: null, url: null, thumbnailUrl: null, fit: 'COVER', opacity: 100, dim: 0, blur: 0 },
  fontScale: 'M',
  textShadow: true,
  pauseOnLowPower: true,
  autoplayOnDataSaver: false,
  updatedAt: null,
};

export function toThemeInput(t: Theme): ThemeInput {
  const { url: _u, thumbnailUrl: _t, ...background } = t.background;
  void _u; void _t;
  return { background, fontScale: t.fontScale, textShadow: t.textShadow, pauseOnLowPower: t.pauseOnLowPower, autoplayOnDataSaver: t.autoplayOnDataSaver };
}

export const getTheme = (signal?: AbortSignal) => api<Theme>('/api/me/theme', { signal });
export const putTheme = (input: ThemeInput) => api<Theme>('/api/me/theme', { method: 'PUT', body: input });
export const resetTheme = () => api<Theme>('/api/me/theme', { method: 'DELETE' });

export const getThemePresets = (type?: MediaType, signal?: AbortSignal) =>
  api<{ items: ThemePreset[] }>('/api/theme/presets', { query: { type }, signal });

export function uploadThemeAsset(file: File) {
  const fd = new FormData();
  fd.append('file', file);
  return api<ThemeAsset>('/api/me/theme/assets', { method: 'POST', body: fd });
}

export const deleteThemeAsset = (assetId: string) =>
  api<void>(`/api/me/theme/assets/${encodeURIComponent(assetId)}`, { method: 'DELETE' });
