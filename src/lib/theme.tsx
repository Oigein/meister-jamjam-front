/*
 * 테마 (docs/api/09-theme.md)
 * - 앱 진입 시 GET /api/me/theme. 깜빡임을 줄이려고 마지막 테마를 localStorage에 두고 먼저 적용
 * - 변경은 화면에 바로 반영(낙관적)하고 PUT은 잠시 모았다가(debounce) 순서대로 보냄. 실패하면 마지막 저장값으로 되돌림
 * - 글자 크기: <html> zoom / 배경: 화면 뒤 고정 레이어 (GIF·MP4, 투명도·어둡게·흐림)
 * - 프론트 전용 동작: 탭이 숨으면 영상 정지, 저전력(prefers-reduced-motion)·데이터 절약 시 정지 화면, 로딩 실패 시 썸네일 → 단색
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { errorMessage } from '../api/client';
import {
  DEFAULT_THEME, FONT_SCALE_RATIO, deleteThemeAsset, getTheme, getThemePresets, putTheme, resetTheme, toThemeInput, uploadThemeAsset,
  type MediaType, type Theme, type ThemeAsset, type ThemeBackground, type ThemePreset,
} from '../api/theme';
import { useMe } from './session';
import '../styles/theme.css';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface ThemeContextValue {
  theme: Theme;
  ready: boolean; // 서버 설정을 한 번 받았는지
  saveStatus: SaveStatus;
  saveError: string | null;
  update: (fn: (t: Theme) => Theme) => void;
  reset: () => Promise<void>;
  presets: Partial<Record<MediaType, ThemePreset[]>>;
  loadPresets: (type: MediaType) => Promise<ThemePreset[]>;
  uploads: ThemeAsset[]; // 이번 접속에서 올린 파일 (목록 조회 API가 없음)
  upload: (file: File) => Promise<ThemeAsset>;
  deleteAsset: (assetId: string) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme은 ThemeProvider 안에서만 사용할 수 있습니다.');
  return ctx;
}

const SAVE_DELAY = 600;
const cacheKey = (userId: string) => `theme-cache:${userId}`;

function readCache(userId: string): Theme {
  try {
    const raw = localStorage.getItem(cacheKey(userId));
    if (!raw) return DEFAULT_THEME;
    const t = JSON.parse(raw) as Theme;
    return { ...DEFAULT_THEME, ...t, background: { ...DEFAULT_THEME.background, ...t.background } };
  } catch {
    return DEFAULT_THEME;
  }
}
function writeCache(userId: string, t: Theme) {
  try { localStorage.setItem(cacheKey(userId), JSON.stringify(t)); } catch { /* 저장 불가 환경 */ }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const me = useMe();
  const [theme, setThemeState] = useState<Theme>(() => readCache(me.userId));
  const [ready, setReady] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [presets, setPresets] = useState<Partial<Record<MediaType, ThemePreset[]>>>({});
  const [uploads, setUploads] = useState<ThemeAsset[]>([]);

  const themeRef = useRef(theme);
  const serverRef = useRef<Theme | null>(null); // 마지막으로 서버가 확인한 값
  const versionRef = useRef(0); // 로컬 변경 횟수
  const timerRef = useRef<number | null>(null);
  const chainRef = useRef<Promise<unknown>>(Promise.resolve());
  const presetReq = useRef<Partial<Record<MediaType, Promise<ThemePreset[]>>>>({});

  const setTheme = useCallback((t: Theme) => {
    themeRef.current = t;
    setThemeState(t);
    writeCache(me.userId, t);
  }, [me.userId]);

  /* 앱 진입 시 서버 설정 */
  useEffect(() => {
    const ctrl = new AbortController();
    getTheme(ctrl.signal)
      .then((t) => {
        serverRef.current = t;
        if (versionRef.current === 0) setTheme(t);
        setReady(true);
      })
      .catch(() => { if (!ctrl.signal.aborted) setReady(true); }); // 실패하면 캐시·기본값 유지
    return () => ctrl.abort();
  }, [setTheme]);

  const save = useCallback(() => {
    chainRef.current = chainRef.current.then(async () => {
      const v = versionRef.current;
      setSaveStatus('saving');
      try {
        const res = await putTheme(toThemeInput(themeRef.current));
        serverRef.current = res;
        if (v === versionRef.current) { setTheme(res); setSaveStatus('saved'); setSaveError(null); }
      } catch (e) {
        if (v === versionRef.current) {
          setSaveStatus('error');
          setSaveError(errorMessage(e));
          if (serverRef.current) setTheme(serverRef.current);
        }
      }
    });
  }, [setTheme]);

  const update = useCallback((fn: (t: Theme) => Theme) => {
    setTheme(fn(themeRef.current));
    versionRef.current++;
    setSaveStatus('saving');
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => { timerRef.current = null; save(); }, SAVE_DELAY);
  }, [save, setTheme]);

  /* 보내지 못한 변경은 화면을 떠날 때 바로 저장 */
  useEffect(() => () => { if (timerRef.current) { clearTimeout(timerRef.current); save(); } }, [save]);

  const reset = useCallback(async () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    const v = ++versionRef.current;
    setSaveStatus('saving');
    try {
      const p = chainRef.current.then(() => resetTheme());
      chainRef.current = p.catch(() => undefined);
      const res = await p;
      serverRef.current = res;
      if (v === versionRef.current) setTheme(res);
      setSaveStatus('saved');
      setSaveError(null);
    } catch (e) {
      setSaveStatus('error');
      setSaveError(errorMessage(e));
      throw e;
    }
  }, [setTheme]);

  const loadPresets = useCallback((type: MediaType) => {
    const p = presetReq.current[type] ?? getThemePresets(type).then((r) => {
      setPresets((m) => ({ ...m, [type]: r.items }));
      return r.items;
    });
    presetReq.current[type] = p;
    p.catch(() => { delete presetReq.current[type]; });
    return p;
  }, []);

  const upload = useCallback(async (file: File) => {
    const a = await uploadThemeAsset(file);
    setUploads((xs) => [...xs, a]);
    return a;
  }, []);

  const deleteAsset = useCallback(async (assetId: string) => {
    await deleteThemeAsset(assetId);
    setUploads((xs) => xs.filter((a) => a.assetId !== assetId));
    // 서버가 현재 배경을 NONE으로 바꿈 → 화면도 같게 (나머지 설정은 유지)
    const strip = (t: Theme): Theme => t.background.assetId === assetId
      ? { ...t, background: { ...t.background, type: 'NONE', source: null, assetId: null, presetId: null, url: null, thumbnailUrl: null } }
      : t;
    if (serverRef.current) serverRef.current = strip(serverRef.current);
    if (themeRef.current.background.assetId === assetId) setTheme(strip(themeRef.current));
  }, [setTheme]);

  /* 글자 크기: 앱 전체 */
  useEffect(() => {
    const ratio = FONT_SCALE_RATIO[theme.fontScale] ?? 1;
    const root = document.documentElement;
    if (ratio === 1) root.style.removeProperty('zoom');
    else root.style.setProperty('zoom', String(ratio));
  }, [theme.fontScale]);
  useEffect(() => () => { document.documentElement.style.removeProperty('zoom'); }, []);

  /* 배경 위 글자 가독성용 body 클래스 */
  const hasBg = theme.background.type !== 'NONE';
  useEffect(() => {
    const b = document.body.classList;
    b.toggle('has-theme-bg', hasBg);
    b.toggle('theme-text-shadow', hasBg && theme.textShadow);
    return () => { b.remove('has-theme-bg', 'theme-text-shadow'); };
  }, [hasBg, theme.textShadow]);

  const value = useMemo<ThemeContextValue>(() => ({
    theme, ready, saveStatus, saveError, update, reset, presets, loadPresets, uploads, upload, deleteAsset,
  }), [theme, ready, saveStatus, saveError, update, reset, presets, loadPresets, uploads, upload, deleteAsset]);

  return (
    <ThemeContext.Provider value={value}>
      {hasBg && <ThemeBackdrop theme={theme} />}
      {children}
    </ThemeContext.Provider>
  );
}

/* ---------- 배경 레이어 ---------- */
function useMediaQuery(q: string) {
  const [on, setOn] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(q).matches);
  useEffect(() => {
    const m = matchMedia(q);
    const f = () => setOn(m.matches);
    f();
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, [q]);
  return on;
}

interface NetworkInformationLike extends EventTarget { saveData?: boolean; }
function useSaveData() {
  const conn = (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
  const [on, setOn] = useState(() => !!conn?.saveData);
  useEffect(() => {
    if (!conn) return;
    const f = () => setOn(!!conn.saveData);
    conn.addEventListener('change', f);
    return () => conn.removeEventListener('change', f);
  }, [conn]);
  return on;
}

function useDocumentHidden() {
  const [hidden, setHidden] = useState(() => document.hidden);
  useEffect(() => {
    const f = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', f);
    return () => document.removeEventListener('visibilitychange', f);
  }, []);
  return hidden;
}

/* 앱 전체 배경 (preview면 부모 상자 안에 그림) */
export function ThemeBackdrop({ theme, preview = false }: { theme: Theme; preview?: boolean }) {
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  const saveData = useSaveData();
  const bg = theme.background;
  if (bg.type === 'NONE') return null;
  const still = (theme.pauseOnLowPower && reduced) || (saveData && !theme.autoplayOnDataSaver);

  const layers: Candidate[] = [];
  if (!still && bg.url) layers.push({ kind: bg.type === 'MP4' ? 'video' : 'img', src: bg.url });
  if (bg.thumbnailUrl) layers.push({ kind: 'img', src: bg.thumbnailUrl });

  const mediaStyle: CSSProperties = {
    opacity: bg.opacity / 100,
    filter: bg.blur ? `blur(${(bg.blur / 100) * 24}px)` : undefined,
    transform: bg.blur ? 'scale(1.08)' : undefined,
  };
  const fit = bg.type === 'MP4' ? 'COVER' : bg.fit;
  return (
    <div className={`theme-bg${preview ? ' is-preview' : ''}`} aria-hidden="true" data-bg-type={bg.type}>
      <BackgroundMedia key={layers.map((l) => l.src).join('|')} layers={layers} fit={fit} style={mediaStyle} poster={bg.thumbnailUrl} />
      {bg.dim > 0 && <div className="theme-bg-dim" style={{ opacity: bg.dim / 100 }} />}
    </div>
  );
}

interface Candidate { kind: 'img' | 'video'; src: string; }

/* 로딩 실패 시 다음 후보(썸네일)로, 다 실패하면 단색 */
function BackgroundMedia({ layers, fit, style, poster }: { layers: Candidate[]; fit: ThemeBackground['fit']; style: CSSProperties; poster: string | null }) {
  const [stage, setStage] = useState(0);
  const cur = layers[stage] ?? null;
  const next = useCallback(() => setStage((s) => s + 1), []);
  const hidden = useDocumentHidden();
  const videoRef = useRef<HTMLVideoElement>(null);

  /* 이미지는 미리 불러 보고 실패하면 다음 후보 */
  const [imgOk, setImgOk] = useState(false);
  useEffect(() => {
    if (!cur || cur.kind !== 'img') return;
    setImgOk(false);
    let alive = true;
    const im = new Image();
    im.onload = () => { if (alive) setImgOk(true); };
    im.onerror = () => { if (alive) next(); };
    im.src = cur.src;
    return () => { alive = false; };
  }, [cur?.kind, cur?.src, next]); // eslint-disable-line react-hooks/exhaustive-deps

  /* 탭이 숨으면 영상 정지 */
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (hidden) v.pause();
    else v.play().catch(() => { /* 자동 재생 차단: 포스터(썸네일)가 보임 */ });
  }, [hidden, cur?.src]);

  if (!cur) return <div className="theme-bg-media is-fallback" />;
  if (cur.kind === 'video') {
    return (
      <div className="theme-bg-media" style={style}>
        <video ref={videoRef} src={cur.src} poster={poster ?? undefined} muted loop playsInline autoPlay preload="auto" onError={next} />
      </div>
    );
  }
  const imgStyle: CSSProperties = {
    ...style,
    backgroundImage: imgOk ? `url("${cur.src.replace(/"/g, '%22')}")` : undefined,
    backgroundRepeat: fit === 'TILE' ? 'repeat' : 'no-repeat',
    backgroundSize: fit === 'TILE' ? 'auto' : fit === 'CONTAIN' ? 'contain' : 'cover',
    backgroundPosition: fit === 'TILE' ? '0 0' : 'center',
  };
  return <div className="theme-bg-media" style={imgStyle} />;
}
