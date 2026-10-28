/*
 * 테마 목업 (docs/api/09-theme.md)
 * - 기본 제공 배경은 네트워크 없이 그려지도록 data: URL로 만든다.
 *   GIF 프리셋 = 움직이는 SVG(SMIL) 이미지로 대체, MP4 프리셋 = 실제 영상이 없어 url null + 정지 썸네일(SVG)만 제공
 *   → 화면은 url이 없으면 썸네일로 대체하는 동작을 그대로 보여 줌
 * - 업로드 파일은 URL.createObjectURL()로 만든 blob 주소 (새로고침하면 사라짐)
 * - 테마 설정은 새로고침해도 유지되도록 localStorage(mock-theme)에 저장. 업로드 배경은 새로고침 후 NONE으로 돌아감
 */
import { fail, route, validationFail } from '../server';
import { currentUser, isoKST, uuid } from '../db';
import type { FieldError } from '../../client';
import type { BackgroundFit, BackgroundType, FontScale } from '../../types';

type MediaType = 'GIF' | 'MP4';
interface Bg { type: BackgroundType; source: 'PRESET' | 'UPLOAD' | null; presetId: number | null; assetId: string | null; fit: BackgroundFit; opacity: number; dim: number; blur: number; }
interface Stored { background: Bg; fontScale: FontScale; textShadow: boolean; pauseOnLowPower: boolean; autoplayOnDataSaver: boolean; updatedAt: string | null; }
interface Asset { assetId: string; userId: string; type: MediaType; url: string; thumbnailUrl: string | null; sizeBytes: number; durationSec: number | null; createdAt: string; }

const defaults = (): Stored => ({
  background: { type: 'NONE', source: null, presetId: null, assetId: null, fit: 'COVER', opacity: 100, dim: 0, blur: 0 },
  fontScale: 'M', textShadow: true, pauseOnLowPower: true, autoplayOnDataSaver: false, updatedAt: null,
});

/* ---------- 기본 제공 배경 (data: URL) ---------- */
const svgUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
function lcg(seed: number) { let s = seed; return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296; }

function starsSvg(animated: boolean) {
  const r = lcg(7);
  let stars = '';
  for (let i = 0; i < 70; i++) {
    const x = (r() * 480).toFixed(1), y = (r() * 270).toFixed(1), rad = (0.4 + r() * 1.3).toFixed(2), d = (1.5 + r() * 3).toFixed(2);
    stars += `<circle cx="${x}" cy="${y}" r="${rad}" fill="#fff">${animated ? `<animate attributeName="opacity" values="1;.15;1" dur="${d}s" repeatCount="indefinite"/>` : ''}</circle>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="270" viewBox="0 0 480 270" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b1230"/><stop offset="1" stop-color="#2b3a6b"/></linearGradient></defs><rect width="480" height="270" fill="url(#g)"/>${stars}</svg>`;
}
function sunsetSvg(animated: boolean) {
  const anim = animated ? '<animate attributeName="x1" values="0;1;0" dur="8s" repeatCount="indefinite"/>' : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="270" viewBox="0 0 480 270" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">${anim}<stop offset="0" stop-color="#3b1d4a"/><stop offset=".55" stop-color="#b4513a"/><stop offset="1" stop-color="#f2b366"/></linearGradient></defs><rect width="480" height="270" fill="url(#g)"/><circle cx="360" cy="190" r="46" fill="#ffd9a0" opacity=".55">${animated ? '<animate attributeName="cy" values="190;200;190" dur="6s" repeatCount="indefinite"/>' : ''}</circle></svg>`;
}
function wavesSvg(animated: boolean) {
  const wave = (y: number, color: string, dur: number) =>
    `<path d="M-480 ${y} q60 -18 120 0 t120 0 t120 0 t120 0 t120 0 t120 0 t120 0 t120 0 V270 H-480 Z" fill="${color}">${animated ? `<animateTransform attributeName="transform" type="translate" from="0 0" to="240 0" dur="${dur}s" repeatCount="indefinite"/>` : ''}</path>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="270" viewBox="0 0 480 270" preserveAspectRatio="xMidYMid slice"><rect width="480" height="270" fill="#12324a"/>${wave(150, '#1d4f6e', 9)}${wave(185, '#2a6a8a', 6)}${wave(220, '#3f86a3', 4)}</svg>`;
}
function dotsSvg(animated: boolean) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect width="120" height="120" fill="#24302b"/><circle cx="30" cy="30" r="10" fill="#6f9372">${animated ? '<animate attributeName="r" values="6;12;6" dur="3s" repeatCount="indefinite"/>' : ''}</circle><circle cx="90" cy="90" r="10" fill="#c78b5d">${animated ? '<animate attributeName="r" values="12;6;12" dur="3s" repeatCount="indefinite"/>' : ''}</circle></svg>`;
}
function stillSvg(c1: string, c2: string, shapes: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="270" viewBox="0 0 480 270" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="480" height="270" fill="url(#g)"/>${shapes}</svg>`;
}

interface Preset { presetId: number; type: MediaType; name: string; url: string | null; thumbnailUrl: string | null; }
const presets: Preset[] = [
  { presetId: 1, type: 'GIF', name: '밤하늘 별', url: svgUrl(starsSvg(true)), thumbnailUrl: svgUrl(starsSvg(false)) },
  { presetId: 2, type: 'GIF', name: '노을', url: svgUrl(sunsetSvg(true)), thumbnailUrl: svgUrl(sunsetSvg(false)) },
  { presetId: 3, type: 'GIF', name: '파도', url: svgUrl(wavesSvg(true)), thumbnailUrl: svgUrl(wavesSvg(false)) },
  { presetId: 4, type: 'GIF', name: '물방울 패턴', url: svgUrl(dotsSvg(true)), thumbnailUrl: svgUrl(dotsSvg(false)) },
  { presetId: 11, type: 'MP4', name: '도시 야경', url: null, thumbnailUrl: svgUrl(stillSvg('#0f1424', '#3a2f5c', '<g fill="#f6d27a" opacity=".7"><rect x="40" y="150" width="40" height="120"/><rect x="100" y="110" width="50" height="160"/><rect x="170" y="170" width="36" height="100"/><rect x="230" y="90" width="44" height="180"/><rect x="300" y="140" width="60" height="130"/><rect x="380" y="120" width="40" height="150"/></g>')) },
  { presetId: 12, type: 'MP4', name: '숲길', url: null, thumbnailUrl: svgUrl(stillSvg('#1f3326', '#6f9372', '<g fill="#14231a" opacity=".8"><path d="M60 270 L100 120 L140 270Z"/><path d="M150 270 L200 90 L250 270Z"/><path d="M300 270 L340 130 L380 270Z"/><path d="M380 270 L430 100 L480 270Z"/></g>')) },
  { presetId: 13, type: 'MP4', name: '구름', url: null, thumbnailUrl: svgUrl(stillSvg('#4a6a9a', '#a9c1e0', '<g fill="#fff" opacity=".75"><ellipse cx="120" cy="90" rx="80" ry="26"/><ellipse cx="330" cy="150" rx="110" ry="32"/><ellipse cx="220" cy="220" rx="70" ry="20"/></g>')) },
];
const findPreset = (id: unknown) => presets.find((p) => p.presetId === id) ?? null;

/* ---------- 저장소 ---------- */
const KEY = 'mock-theme';
const themes = new Map<string, Stored>();
try {
  const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, Stored>;
  for (const [uid, t] of Object.entries(raw)) {
    // 업로드 파일(blob 주소)은 새로고침하면 없어지므로 배경만 기본으로
    if (t.background?.source === 'UPLOAD') t.background = { ...t.background, type: 'NONE', source: null, assetId: null, presetId: null };
    themes.set(uid, t);
  }
} catch { /* 무시 */ }
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(themes))); } catch { /* 무시 */ }
}
const assets: Asset[] = [];
const myTheme = (uid: string) => themes.get(uid) ?? defaults();

function toResponse(t: Stored) {
  const b = t.background;
  let url: string | null = null, thumbnailUrl: string | null = null;
  if (b.source === 'PRESET') { const p = findPreset(b.presetId); url = p?.url ?? null; thumbnailUrl = p?.thumbnailUrl ?? null; }
  if (b.source === 'UPLOAD') { const a = assets.find((x) => x.assetId === b.assetId); url = a?.url ?? null; thumbnailUrl = a?.thumbnailUrl ?? null; }
  return { ...t, background: { ...b, url, thumbnailUrl } };
}

/* ---------- 2.1 / 2.2 / 2.3 ---------- */
route('GET', '/api/me/theme', () => toResponse(myTheme(currentUser().userId)));

const FITS: BackgroundFit[] = ['COVER', 'TILE', 'CONTAIN'];
const SCALES: FontScale[] = ['XS', 'S', 'M', 'L', 'XL'];
const TYPES: BackgroundType[] = ['NONE', 'GIF', 'MP4'];

route('PUT', '/api/me/theme', ({ body }) => {
  const u = currentUser();
  const b = (body ?? {}) as Record<string, unknown>;
  const bg = (b.background ?? {}) as Record<string, unknown>;
  const errors: FieldError[] = [];
  const range = (k: 'opacity' | 'dim' | 'blur') => {
    const v = bg[k];
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 100) errors.push({ field: `background.${k}`, reason: 'OUT_OF_RANGE', message: '0~100 사이의 정수만 입력할 수 있습니다.' });
  };
  if (!TYPES.includes(bg.type as BackgroundType)) errors.push({ field: 'background.type', reason: 'INVALID_VALUE', message: '배경 종류를 선택하세요.' });
  if (!FITS.includes(bg.fit as BackgroundFit)) errors.push({ field: 'background.fit', reason: 'INVALID_VALUE', message: '배치 방식을 선택하세요.' });
  range('opacity'); range('dim'); range('blur');
  if (!SCALES.includes(b.fontScale as FontScale)) errors.push({ field: 'fontScale', reason: 'INVALID_VALUE', message: '글자 크기를 선택하세요.' });
  for (const k of ['textShadow', 'pauseOnLowPower', 'autoplayOnDataSaver']) {
    if (typeof b[k] !== 'boolean') errors.push({ field: k, reason: 'INVALID_VALUE', message: '켜기·끄기 값이 필요합니다.' });
  }
  if (errors.length) validationFail(errors);

  const type = bg.type as BackgroundType;
  let next: Bg = { type, source: null, presetId: null, assetId: null, fit: bg.fit as BackgroundFit, opacity: bg.opacity as number, dim: bg.dim as number, blur: bg.blur as number };
  if (type !== 'NONE') {
    const bad = () => fail(400, 'INVALID_BACKGROUND', '선택한 배경을 사용할 수 없습니다. 다시 선택해 주세요.');
    if (bg.source === 'PRESET') {
      const p = findPreset(bg.presetId);
      if (!p || p.type !== type) bad();
      next = { ...next, source: 'PRESET', presetId: p!.presetId };
    } else if (bg.source === 'UPLOAD') {
      const a = assets.find((x) => x.assetId === bg.assetId && x.userId === u.userId);
      if (!a || a.type !== type) bad();
      next = { ...next, source: 'UPLOAD', assetId: a!.assetId };
    } else bad();
    if (type === 'MP4') next.fit = 'COVER'; // MP4는 항상 COVER
  }
  const saved: Stored = {
    background: next,
    fontScale: b.fontScale as FontScale,
    textShadow: b.textShadow as boolean,
    pauseOnLowPower: b.pauseOnLowPower as boolean,
    autoplayOnDataSaver: b.autoplayOnDataSaver as boolean,
    updatedAt: isoKST(),
  };
  themes.set(u.userId, saved);
  persist();
  return toResponse(saved);
});

route('DELETE', '/api/me/theme', () => {
  const u = currentUser();
  themes.delete(u.userId); // 업로드 파일은 지우지 않음
  persist();
  return toResponse(defaults());
});

/* ---------- 2.4 기본 제공 배경 ---------- */
route('GET', '/api/theme/presets', ({ query }) => {
  const t = query.get('type');
  if (t && t !== 'GIF' && t !== 'MP4') validationFail([{ field: 'type', reason: 'INVALID_VALUE', message: 'GIF 또는 MP4만 선택할 수 있습니다.' }]);
  return { items: presets.filter((p) => !t || p.type === t) };
});

/* ---------- 2.5 업로드 ---------- */
const uploadHits = new Map<string, number[]>();
function uploadRateLimit(uid: string) {
  const now = Date.now();
  const recent = (uploadHits.get(uid) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= 10) fail(429, 'TOO_MANY_REQUESTS', '업로드 요청이 많습니다. 잠시 후 다시 시도하세요.', { retryAfter: Math.ceil((60_000 - (now - recent[0])) / 1000) });
  recent.push(now);
  uploadHits.set(uid, recent);
}

async function sniff(file: Blob): Promise<MediaType | null> {
  const h = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const ascii = (from: number, to: number) => String.fromCharCode(...h.slice(from, to));
  if (ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a') return 'GIF';
  if (ascii(4, 8) === 'ftyp') return 'MP4';
  return null;
}

/* MP4 길이 + 첫 프레임 썸네일 (브라우저에서 못 읽으면 null) */
function probeVideo(url: string): Promise<{ duration: number | null; thumb: string | null }> {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    let done = false;
    const finish = (r: { duration: number | null; thumb: string | null }) => { if (!done) { done = true; v.removeAttribute('src'); v.load(); resolve(r); } };
    const timer = setTimeout(() => finish({ duration: null, thumb: null }), 4000);
    v.muted = true; v.preload = 'auto'; v.playsInline = true;
    v.onloadeddata = () => {
      let thumb: string | null = null;
      try {
        const c = document.createElement('canvas');
        c.width = Math.min(640, v.videoWidth || 640);
        c.height = Math.round(c.width * ((v.videoHeight || 360) / (v.videoWidth || 640)));
        c.getContext('2d')?.drawImage(v, 0, 0, c.width, c.height);
        thumb = c.toDataURL('image/jpeg', 0.8);
      } catch { thumb = null; }
      clearTimeout(timer);
      finish({ duration: Number.isFinite(v.duration) ? Math.round(v.duration * 10) / 10 : null, thumb });
    };
    v.onerror = () => { clearTimeout(timer); finish({ duration: null, thumb: null }); };
    v.src = url;
  });
}

route('POST', '/api/me/theme/assets', async ({ body }) => {
  const u = currentUser();
  const file = body instanceof FormData ? body.get('file') : null;
  if (!(file instanceof Blob)) validationFail([{ field: 'file', reason: 'REQUIRED', message: '파일을 선택하세요.' }]);
  uploadRateLimit(u.userId);
  const f = file as Blob;
  const type = await sniff(f);
  if (!type) fail(415, 'UNSUPPORTED_FILE_TYPE', 'GIF 또는 MP4 파일만 올릴 수 있습니다.');
  const maxMB = type === 'GIF' ? 10 : 30;
  if (f.size > maxMB * 1024 * 1024) fail(413, 'FILE_TOO_LARGE', `${type} 파일은 ${maxMB}MB 이하만 올릴 수 있습니다. 압축한 뒤 다시 올려 주세요.`);
  if (assets.filter((a) => a.userId === u.userId).length >= 5) fail(409, 'ASSET_LIMIT_EXCEEDED', '배경 파일은 5개까지 올릴 수 있습니다. 기존 파일을 삭제한 뒤 다시 올려 주세요.');

  const url = URL.createObjectURL(f);
  let thumbnailUrl: string | null = url; // GIF: 같은 파일 (첫 프레임 추출은 생략)
  let durationSec: number | null = null;
  if (type === 'MP4') {
    const p = await probeVideo(url);
    if (p.duration !== null && p.duration > 30) { URL.revokeObjectURL(url); fail(400, 'VIDEO_TOO_LONG', '영상은 30초 이하만 올릴 수 있습니다.'); }
    durationSec = p.duration;
    thumbnailUrl = p.thumb;
  }
  const a: Asset = { assetId: uuid(), userId: u.userId, type: type!, url, thumbnailUrl, sizeBytes: f.size, durationSec, createdAt: isoKST() };
  assets.push(a);
  const { userId: _uid, createdAt: _c, ...res } = a;
  void _uid; void _c;
  return res;
});

/* ---------- 2.6 업로드 파일 삭제 ---------- */
route('DELETE', '/api/me/theme/assets/:assetId', ({ params }) => {
  const u = currentUser();
  const i = assets.findIndex((a) => a.assetId === params.assetId && a.userId === u.userId);
  if (i < 0) fail(404, 'NOT_FOUND', '파일을 찾을 수 없습니다.');
  const [a] = assets.splice(i, 1);
  const t = themes.get(u.userId);
  if (t && t.background.source === 'UPLOAD' && t.background.assetId === a.assetId) {
    // 배경만 NONE으로, 나머지 설정은 유지
    themes.set(u.userId, { ...t, background: { ...t.background, type: 'NONE', source: null, assetId: null, presetId: null }, updatedAt: isoKST() });
    persist();
  }
  setTimeout(() => URL.revokeObjectURL(a.url), 1000);
  return undefined;
});
