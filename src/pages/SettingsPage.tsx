/* 설정: 프로필 링크(docs/api/07-profile-links.md) · 테마(docs/api/09-theme.md) · (관리자) 추천 가이드라인 · 로그아웃 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, USE_MOCK, errorMessage, fieldErrorMap } from '../api/client';
import { logout } from '../api/me';
import { getProfileLinks, saveProfileLinks, type ProfileLinks, type ProfileLinksPatch } from '../api/profile';
import { FONT_SCALES, FONT_SCALE_RATIO, MAX_ASSETS, UPLOAD_LIMIT, type MediaType, type ThemeBackground, type ThemePreset } from '../api/theme';
import type { BackgroundFit, BackgroundType, FontScale, Role } from '../api/types';
import { githubDisplay, linkedinDisplay, normalizeLink, type LinkField, type LinkParse } from '../lib/profileLinks';
import { useMe } from '../lib/session';
import { ThemeBackdrop, useTheme } from '../lib/theme';
import { useAsync } from '../lib/useAsync';
import { Loadable } from '../components/Loadable';
import { useToast } from '../components/Toast';
import { GitHubIcon, LinkedInIcon, XIcon } from '../components/icons';
import RecommendGuidelines from '../components/RecommendGuidelines';
import './SettingsPage.css';

type Section = 'links' | 'theme' | 'guide' | 'mock';

export default function SettingsPage() {
  const me = useMe();
  const navigate = useNavigate();
  const [section, setSection] = useState<Section>('links');
  const { toast, show } = useToast();

  const items: [Section, string][] = [['links', '프로필 링크'], ['theme', '테마']];
  if (me.role === 'ADMIN') items.push(['guide', '추천 가이드라인']);
  if (USE_MOCK) items.push(['mock', '목업 역할']);

  const go = (s: Section) => {
    setSection(s);
    document.getElementById(`set-${s}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  async function doLogout() {
    try { await logout(); } catch { /* 세션이 이미 끝났어도 로그인 화면으로 */ }
    navigate('/login');
  }

  return (
    <main className="page set-page">
      <div className="set-layout">
        <aside className="set-nav">
          <h1 className="page-title">설정</h1>
          <nav aria-label="설정 메뉴">
            {items.map(([k, label]) => (
              <button key={k} type="button" className={section === k ? 'is-on' : ''} aria-current={section === k ? 'true' : undefined} onClick={() => go(k)}>{label}</button>
            ))}
            <button type="button" className="set-logout" onClick={doLogout}>로그아웃</button>
          </nav>
        </aside>
        <div className="set-main">
          <LinksCard isStudent={me.role === 'STUDENT'} onToast={show} />
          <ThemeCard onToast={show} />
          {me.role === 'ADMIN' && (
            <section id="set-guide" className="set-section" aria-labelledby="set-guide-h">
              <h2 id="set-guide-h" className="section-title">추천 가이드라인</h2>
              <RecommendGuidelines />
            </section>
          )}
          {USE_MOCK && <MockRoleCard role={me.role} />}
        </div>
      </div>
      {toast}
    </main>
  );
}

/* ---------- 프로필 링크 ---------- */
function LinksCard({ isStudent, onToast }: { isStudent: boolean; onToast: (m: string) => void }) {
  return (
    <section id="set-links" className="card set-card" aria-labelledby="set-links-h">
      <h2 id="set-links-h">프로필 링크</h2>
      {isStudent ? <LinksLoader onToast={onToast} /> : (
        <p className="set-note muted">프로필 링크(GitHub · LinkedIn)는 학생 계정만 등록할 수 있습니다.</p>
      )}
    </section>
  );
}

function LinksLoader({ onToast }: { onToast: (m: string) => void }) {
  const { state } = useAsync((s) => getProfileLinks(s), []);
  return <Loadable state={state}>{(d) => <LinksForm initial={d} onToast={onToast} />}</Loadable>;
}

function LinksForm({ initial, onToast }: { initial: ProfileLinks; onToast: (m: string) => void }) {
  const [saved, setSaved] = useState(initial);
  const [gh, setGh] = useState(githubDisplay(initial.githubUrl));
  const [li, setLi] = useState(linkedinDisplay(initial.linkedinUrl));
  const [serverErr, setServerErr] = useState<Partial<Record<LinkField, string>>>({});
  const [formErr, setFormErr] = useState('');
  const [saving, setSaving] = useState(false);

  const g = normalizeLink('githubUrl', gh);
  const l = normalizeLink('linkedinUrl', li);
  const invalid = !!g.reason || !!l.reason;

  // 바뀐 항목만 보냄 (키 없음 = 변경 없음, null = 삭제). 값은 서버가 다시 정규화
  const patch: ProfileLinksPatch = {};
  if (!g.reason && g.url !== saved.githubUrl) patch.githubUrl = gh.trim() || null;
  if (!l.reason && l.url !== saved.linkedinUrl) patch.linkedinUrl = li.trim() || null;
  const dirty = Object.keys(patch).length > 0;

  async function save() {
    setSaving(true);
    setFormErr('');
    try {
      const res = await saveProfileLinks(patch);
      setSaved(res);
      setGh(githubDisplay(res.githubUrl));
      setLi(linkedinDisplay(res.linkedinUrl));
      setServerErr({});
      onToast('링크를 저장했습니다.');
    } catch (e) {
      const fe = fieldErrorMap(e);
      if (Object.keys(fe).length) setServerErr(fe);
      else setFormErr(e instanceof ApiError && e.status === 429 ? errorMessage(e) : `저장하지 못했습니다. ${errorMessage(e)}`);
    } finally {
      setSaving(false);
    }
  }

  const edit = (field: LinkField, set: (v: string) => void) => (v: string) => {
    set(v);
    setServerErr((m) => ({ ...m, [field]: undefined }));
  };

  return (
    <>
      <LinkField id="githubUrl" label="GitHub" icon={<GitHubIcon size={20} />} value={gh} onChange={edit('githubUrl', setGh)}
        placeholder="@아이디 또는 github.com/아이디" result={g} serverError={serverErr.githubUrl} />
      <LinkField id="linkedinUrl" label="LinkedIn" icon={<LinkedInIcon size={20} />} value={li} onChange={edit('linkedinUrl', setLi)}
        placeholder="linkedin.com/in/아이디" result={l} serverError={serverErr.linkedinUrl} />
      {formErr && <p className="set-help is-error" role="alert">{formErr}</p>}
      <div className="set-foot">
        <span className="muted">링크는 로그인한 모든 사용자에게 공개됩니다.</span>
        <button type="button" className="btn btn-primary btn-lg" disabled={invalid || !dirty || saving} onClick={save}>{saving ? '저장 중…' : '저장'}</button>
      </div>
    </>
  );
}

function LinkField({ id, label, icon, value, onChange, placeholder, result, serverError }: {
  id: string; label: string; icon: ReactNode; value: string; onChange: (v: string) => void; placeholder: string; result: LinkParse; serverError?: string;
}) {
  const error = result.message ?? serverError;
  return (
    <div className="field set-field">
      <label className="set-label" htmlFor={id}>{label}</label>
      <div className={`set-input ${error ? 'is-error' : ''}`}>
        {icon}
        <input id={id} className="mono" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
          spellCheck={false} autoComplete="off" autoCapitalize="off" aria-invalid={!!error} aria-describedby={`${id}-help`} />
        {value && <button type="button" aria-label={`${label} 지우기`} onClick={() => onChange('')}><XIcon size={20} /></button>}
      </div>
      <p id={`${id}-help`} className={error ? 'set-help is-error' : 'set-help'}>
        {error ?? (result.url ? <>저장될 주소 · <span className="mono">{result.url}</span></> : '비워 두면 프로필에 표시되지 않습니다.')}
      </p>
    </div>
  );
}

/* ---------- 테마 ---------- */
const BG_OPTIONS: [BackgroundType, string][] = [['NONE', '기본'], ['GIF', 'GIF'], ['MP4', 'MP4']];
const FIT_OPTIONS: [BackgroundFit, string][] = [['COVER', '화면 채우기'], ['TILE', '바둑판 배열'], ['CONTAIN', '원 비율 유지']];
const FONT_LABEL: Record<FontScale, string> = { XS: '매우 작게', S: '작게', M: '보통', L: '크게', XL: '매우 크게' };
const SAVE_LABEL = { idle: '', saving: '저장 중…', saved: '저장됨', error: '저장 실패' } as const;

interface UploadItem { assetId: string; type: MediaType; url: string | null; thumbnailUrl: string | null; }

function ThemeCard({ onToast }: { onToast: (m: string) => void }) {
  const { theme, update, reset, presets, loadPresets, uploads, upload, deleteAsset, saveStatus, saveError } = useTheme();
  const bg = theme.background;
  const [presetErr, setPresetErr] = useState('');
  const [uploadErr, setUploadErr] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (bg.type === 'NONE') return;
    setPresetErr('');
    loadPresets(bg.type).catch((e) => setPresetErr(`기본 배경을 불러오지 못했습니다. (${errorMessage(e)})`));
  }, [bg.type, loadPresets]);

  const setBg = (patch: Partial<ThemeBackground>) => update((t) => ({ ...t, background: { ...t.background, ...patch } }));
  const selectPreset = (p: ThemePreset) => setBg({
    type: p.type, source: 'PRESET', presetId: p.presetId, assetId: null, url: p.url, thumbnailUrl: p.thumbnailUrl,
    fit: p.type === 'MP4' ? 'COVER' : bg.type === 'MP4' ? 'COVER' : bg.fit,
  });
  const selectUpload = (a: UploadItem) => setBg({
    type: a.type, source: 'UPLOAD', presetId: null, assetId: a.assetId, url: a.url, thumbnailUrl: a.thumbnailUrl,
    fit: a.type === 'MP4' ? 'COVER' : bg.type === 'MP4' ? 'COVER' : bg.fit,
  });

  async function chooseType(type: BackgroundType) {
    setUploadErr('');
    if (type === bg.type) return;
    if (type === 'NONE') { setBg({ type: 'NONE', source: null, presetId: null, assetId: null, url: null, thumbnailUrl: null }); return; }
    // 같은 종류의 업로드 파일이 있으면 그것, 없으면 첫 기본 배경
    const mine = uploadItems.find((a) => a.type === type);
    if (mine) { selectUpload(mine); return; }
    try {
      const list = await loadPresets(type);
      if (list[0]) selectPreset(list[0]);
      else setPresetErr('선택할 수 있는 기본 배경이 없습니다.');
    } catch (e) {
      setPresetErr(`기본 배경을 불러오지 못했습니다. (${errorMessage(e)})`);
    }
  }

  // 업로드 목록 조회 API가 없어 현재 배경 파일 + 이번 접속에서 올린 파일만 알 수 있음
  const uploadItems: UploadItem[] = [...uploads];
  if (bg.source === 'UPLOAD' && bg.assetId && bg.type !== 'NONE' && !uploads.some((a) => a.assetId === bg.assetId)) {
    uploadItems.unshift({ assetId: bg.assetId, type: bg.type, url: bg.url, thumbnailUrl: bg.thumbnailUrl });
  }

  async function onFile(f: File | undefined) {
    if (!f || bg.type === 'NONE') return;
    const lim = UPLOAD_LIMIT[bg.type];
    setUploadErr('');
    if (f.size > lim.maxMB * 1024 * 1024) { setUploadErr(`${bg.type} 파일은 ${lim.maxMB}MB 이하만 올릴 수 있습니다. 압축한 뒤 다시 올려 주세요.`); return; }
    setBusy(true);
    try {
      const a = await upload(f);
      selectUpload(a);
      onToast('배경 파일을 올렸습니다.');
    } catch (e) {
      setUploadErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(a: UploadItem) {
    if (!confirm('이 배경 파일을 삭제할까요? 현재 배경이면 기본 배경으로 바뀝니다.')) return;
    setBusy(true);
    try {
      await deleteAsset(a.assetId);
      onToast('배경 파일을 삭제했습니다.');
    } catch (e) {
      setUploadErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function onReset() {
    try {
      await reset();
      setUploadErr('');
      onToast('기본 테마로 초기화했습니다.');
    } catch (e) {
      onToast(`초기화하지 못했습니다. ${errorMessage(e)}`);
    }
  }

  const list = bg.type === 'NONE' ? [] : presets[bg.type];
  const typeUploads = uploadItems.filter((a) => a.type === bg.type);

  return (
    <section id="set-theme" className="card set-card" aria-labelledby="set-theme-h">
      <div className="set-cardhead">
        <h2 id="set-theme-h">테마</h2>
        <div className="set-headright">
          <span className={`set-save is-${saveStatus}`} role="status" title={saveStatus === 'error' ? saveError ?? undefined : undefined}>
            {SAVE_LABEL[saveStatus]}{saveStatus === 'error' && saveError ? ` · ${saveError}` : ''}
          </span>
          <button type="button" className="btn" onClick={onReset}>기본 테마로 초기화</button>
        </div>
      </div>

      <div className={`set-preview ${bg.type === 'NONE' ? 'is-default' : ''}`}>
        <ThemeBackdrop theme={theme} preview />
        <div className={`set-preview-text ${theme.textShadow ? 'has-shadow' : ''}`}>
          <small>{bg.type === 'NONE' ? '기본' : bg.type} · 미리보기</small>
          <strong>마이스터 역량 452점</strong>
          <p>바꾼 설정은 모든 화면에 바로 적용되고 계정에 저장됩니다.</p>
        </div>
      </div>

      <div className="field">
        <span className="set-label" id="set-bgtype">배경</span>
        <div className="set-chips" role="radiogroup" aria-labelledby="set-bgtype">
          {BG_OPTIONS.map(([k, label]) => (
            <button key={k} type="button" role="radio" aria-checked={bg.type === k} className={bg.type === k ? 'is-on' : ''} onClick={() => chooseType(k)}>{label}</button>
          ))}
        </div>
      </div>

      {bg.type !== 'NONE' && (
        <div className="set-bgpanel">
          <div className="set-swatches" role="radiogroup" aria-label="배경 선택">
            {list?.map((p) => {
              const on = bg.source === 'PRESET' && bg.presetId === p.presetId;
              return (
                <button key={p.presetId} type="button" role="radio" aria-checked={on} className={`set-swatch ${on ? 'is-on' : ''}`}
                  style={p.thumbnailUrl ? { backgroundImage: `url("${p.thumbnailUrl}")` } : undefined} onClick={() => selectPreset(p)}>
                  <span>{p.name}</span>
                </button>
              );
            })}
            {!list && !presetErr && <span className="muted set-note">불러오는 중…</span>}
            {typeUploads.map((a) => {
              const on = bg.source === 'UPLOAD' && bg.assetId === a.assetId;
              return (
                <div key={a.assetId} className={`set-swatch set-swatch-up ${on ? 'is-on' : ''}`}
                  style={a.thumbnailUrl ? { backgroundImage: `url("${a.thumbnailUrl}")` } : undefined}>
                  <button type="button" role="radio" aria-checked={on} className="set-swatch-pick" onClick={() => selectUpload(a)}><span>내 파일</span></button>
                  <button type="button" className="set-swatch-del" aria-label="업로드한 배경 삭제" disabled={busy} onClick={() => onDelete(a)}><XIcon size={16} /></button>
                </div>
              );
            })}
            <button type="button" className="set-upload" disabled={busy} onClick={() => fileRef.current?.click()}>{busy ? '처리 중…' : '업로드'}</button>
            <input ref={fileRef} type="file" hidden accept={UPLOAD_LIMIT[bg.type].accept} aria-label="배경 파일 업로드"
              onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
          </div>
          {presetErr && <p className="set-help is-error">{presetErr}</p>}
          {uploadErr ? <p className="set-help is-error" role="alert">{uploadErr}</p> : (
            <p className="muted set-note">
              {UPLOAD_LIMIT[bg.type].note} · 최대 {MAX_ASSETS}개.
              {' '}업로드 목록을 불러오는 API가 없어 현재 배경 파일과 이번에 올린 파일만 보입니다.
            </p>
          )}

          {bg.type === 'GIF' && (
            <div className="set-chips" role="radiogroup" aria-label="배치">
              {FIT_OPTIONS.map(([k, label]) => (
                <button key={k} type="button" role="radio" aria-checked={bg.fit === k} className={bg.fit === k ? 'is-on' : ''} onClick={() => setBg({ fit: k })}>{label}</button>
              ))}
            </div>
          )}
          {bg.type === 'MP4' && <p className="muted set-note">영상은 항상 화면을 채우도록(COVER) 표시되고 소리 없이 반복 재생됩니다.</p>}

          <Range id="set-opacity" label="배경 선명도" value={bg.opacity} onChange={(v) => setBg({ opacity: v })} />
          <Range id="set-dim" label="어둡게 (글자 가독성)" value={bg.dim} onChange={(v) => setBg({ dim: v })} />
          <Range id="set-blur" label="흐리게" value={bg.blur} onChange={(v) => setBg({ blur: v })} />
        </div>
      )}

      <div className="field">
        <span className="set-label" id="set-font">글자 크기</span>
        <div className="set-sizes" role="radiogroup" aria-labelledby="set-font">
          {FONT_SCALES.map((s, i) => (
            <button key={s} type="button" role="radio" aria-label={`${FONT_LABEL[s]} ${Math.round(FONT_SCALE_RATIO[s] * 100)}%`} aria-checked={theme.fontScale === s}
              className={theme.fontScale === s ? 'is-on' : ''} onClick={() => update((t) => ({ ...t, fontScale: s }))}>
              <span style={{ fontSize: 16 + i * 3 }}>가</span>
              <small>{FONT_LABEL[s]}<br /><span className="mono">{Math.round(FONT_SCALE_RATIO[s] * 100)}%</span></small>
            </button>
          ))}
        </div>
      </div>

      <div className="set-toggles">
        <Toggle label="배경 위 글자에 그림자" checked={theme.textShadow} onChange={(v) => update((t) => ({ ...t, textShadow: v }))} />
        <Toggle label="저전력(동작 줄이기) 모드에서 움직임 멈추기" checked={theme.pauseOnLowPower} onChange={(v) => update((t) => ({ ...t, pauseOnLowPower: v }))} />
        <Toggle label="데이터 절약 모드에서도 자동 재생" checked={theme.autoplayOnDataSaver} onChange={(v) => update((t) => ({ ...t, autoplayOnDataSaver: v }))} />
      </div>
      <p className="footnote">테마는 계정에 저장되어 다른 기기에서도 같게 보입니다. 탭을 떠나면 영상은 잠시 멈춥니다.</p>
    </section>
  );
}

function Range({ id, label, value, onChange }: { id: string; label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="field">
      <label className="label" htmlFor={id}><span>{label}</span><span className="mono">{value}%</span></label>
      <input id={id} type="range" min={0} max={100} step={5} value={value} onChange={(e) => onChange(Number(e.target.value))}
        className="set-range" style={{ ['--p' as string]: `${value}%` } as CSSProperties} />
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

/* ---------- 목업 전용: 역할 전환 ---------- */
function MockRoleCard({ role }: { role: Role }) {
  const roles: [Role, string][] = [['STUDENT', '학생'], ['TEACHER', '교사'], ['ADMIN', '관리자']];
  const pick = (r: Role) => {
    if (r === role) return;
    try { localStorage.setItem('mock-role', r); } catch { /* 무시 */ }
    location.reload();
  };
  return (
    <section id="set-mock" className="card set-card" aria-labelledby="set-mock-h">
      <h2 id="set-mock-h">목업 역할</h2>
      <p className="muted set-note">목업 서버로 실행 중일 때만 보입니다. 역할을 바꾸면 페이지를 새로 불러옵니다.</p>
      <div className="seg" role="radiogroup" aria-label="목업 역할">
        {roles.map(([r, label]) => (
          <button key={r} type="button" role="radio" aria-checked={role === r} className={role === r ? 'is-on' : ''} onClick={() => pick(r)}>{label} <small>{r}</small></button>
        ))}
      </div>
    </section>
  );
}
