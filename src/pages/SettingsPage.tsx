import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { logout } from '../api/me';
import { getProfileLinks, saveProfileLinks, type ProfileLinks } from '../api/settings';
import { useAsync } from '../lib/useAsync';
import { githubDisplay, linkedinDisplay, parseGithub, parseLinkedin, type LinkParse } from '../lib/profileLinks';
import { DEFAULT_THEME, FONT_SIZES, PRESETS, loadTheme, saveTheme, type Theme, type ThemeBg, type ThemeFit } from '../lib/theme';
import { Loadable } from '../components/Loadable';
import { useToast } from '../components/Toast';
import { GitHubIcon, LinkedInIcon, XIcon } from '../components/icons';
import './SettingsPage.css';

type Section = 'links' | 'theme';

export default function SettingsPage() {
  const navigate = useNavigate();
  const [section, setSection] = useState<Section>('links');
  const { toast, show } = useToast();

  const go = (s: Section) => {
    setSection(s);
    document.getElementById(`set-${s}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  async function doLogout() {
    try { await logout(); } finally { navigate('/login'); }
  }

  return (
    <main className="page set-page">
      <div className="set-layout">
        <aside className="set-nav">
          <h1 className="page-title">설정</h1>
          <nav aria-label="설정 메뉴">
            <button type="button" className={section === 'links' ? 'is-on' : ''} onClick={() => go('links')}>프로필 링크</button>
            <button type="button" className={section === 'theme' ? 'is-on' : ''} onClick={() => go('theme')}>테마</button>
            <button type="button" className="set-logout" onClick={doLogout}>로그아웃</button>
          </nav>
        </aside>
        <div className="set-main">
          <LinksCard onSaved={show} />
          <ThemeCard />
        </div>
      </div>
      {toast}
    </main>
  );
}

/* ---------- 링크 ---------- */
function LinksCard({ onSaved }: { onSaved: (msg: string) => void }) {
  const { state } = useAsync((s) => getProfileLinks(s), []);
  return (
    <section id="set-links" className="card set-card" aria-labelledby="set-links-h">
      <h2 id="set-links-h">링크</h2>
      <Loadable state={state}>{(d) => <LinksForm initial={d} onSaved={onSaved} />}</Loadable>
    </section>
  );
}

function LinksForm({ initial, onSaved }: { initial: ProfileLinks; onSaved: (msg: string) => void }) {
  const [gh, setGh] = useState(githubDisplay(initial.githubUrl));
  const [li, setLi] = useState(linkedinDisplay(initial.linkedinUrl));
  const [saving, setSaving] = useState(false);
  const g = parseGithub(gh);
  const l = parseLinkedin(li);
  const invalid = !!g.error || !!l.error;

  async function save() {
    setSaving(true);
    try {
      await saveProfileLinks({ githubUrl: g.url, linkedinUrl: l.url });
      onSaved('링크를 저장했습니다.');
    } catch {
      onSaved('저장하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <LinkField id="gh" label="GitHub" icon={<GitHubIcon size={20} />} value={gh} onChange={setGh} placeholder="@아이디" result={g} />
      <LinkField id="li" label="LinkedIn" icon={<LinkedInIcon size={20} />} value={li} onChange={setLi} placeholder="linkedin.com/in/아이디" result={l} />
      <div className="set-foot">
        <span className="muted">링크는 로그인한 모든 사용자에게 공개됩니다.</span>
        <button type="button" className="btn btn-primary btn-lg" disabled={invalid || saving} onClick={save}>{saving ? '저장 중…' : '저장'}</button>
      </div>
    </>
  );
}

function LinkField({ id, label, icon, value, onChange, placeholder, result }: {
  id: string; label: string; icon: ReactNode; value: string; onChange: (v: string) => void; placeholder: string; result: LinkParse;
}) {
  return (
    <div className="field set-field">
      <label className="set-label" htmlFor={id}>{label}</label>
      <div className={`set-input ${result.error ? 'is-error' : ''}`}>
        {icon}
        <input id={id} className="mono" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
          spellCheck={false} autoComplete="off" aria-invalid={!!result.error} aria-describedby={`${id}-help`} />
        {value && <button type="button" aria-label={`${label} 지우기`} onClick={() => onChange('')}><XIcon size={20} /></button>}
      </div>
      <p id={`${id}-help`} className={result.error ? 'set-help is-error' : 'set-help'}>
        {result.error ?? (result.url ? <>저장될 주소 · <span className="mono">{result.url}</span></> : '비워두면 프로필에 표시되지 않습니다.')}
      </p>
    </div>
  );
}

/* ---------- 테마 ---------- */
const BG_OPTIONS: [ThemeBg, string][] = [['default', '기본'], ['gif', 'GIF'], ['mp4', 'MP4']];
const FIT_OPTIONS: [ThemeFit, string][] = [['cover', '화면 채우기'], ['tile', '바둑판 배열'], ['contain', '원 비율 유지']];
const LIMITS: Record<'gif' | 'mp4', { accept: string; max: number; note: string }> = {
  gif: { accept: 'image/gif', max: 10, note: '.gif · 10MB 이하 · 1920×1080 권장 · 절전 모드에서는 첫 프레임만 표시' },
  mp4: { accept: 'video/mp4', max: 20, note: '.mp4 · 20MB 이하 · 1920×1080 권장 · 소리 없이 반복 재생' },
};

function ThemeCard() {
  const [theme, setTheme] = useState<Theme>(loadTheme);
  // 업로드 파일은 지금은 이 화면에서 미리보기만 (서버 업로드 API 생기면 저장)
  const [upload, setUpload] = useState<{ url: string; kind: 'gif' | 'mp4' } | null>(null);
  const [uploadError, setUploadError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const update = (patch: Partial<Theme>) => setTheme((t) => { const next = { ...t, ...patch }; saveTheme(next); return next; });
  useEffect(() => () => { if (upload) URL.revokeObjectURL(upload.url); }, [upload]);

  function onFile(f: File | undefined) {
    if (!f || theme.bg === 'default') return;
    const lim = LIMITS[theme.bg];
    if (f.type !== lim.accept) { setUploadError(`${theme.bg.toUpperCase()} 파일만 올릴 수 있습니다.`); return; }
    if (f.size > lim.max * 1024 * 1024) { setUploadError(`${lim.max}MB 이하 파일만 올릴 수 있습니다.`); return; }
    setUploadError('');
    setUpload({ url: URL.createObjectURL(f), kind: theme.bg });
  }

  const activeUpload = upload && upload.kind === theme.bg ? upload : null;
  const fitStyle = theme.fit === 'tile'
    ? { backgroundSize: '240px auto', backgroundRepeat: 'repeat' }
    : { backgroundSize: theme.fit, backgroundRepeat: 'no-repeat', backgroundPosition: 'center', backgroundColor: '#111' };
  const previewStyle = theme.bg === 'default' ? undefined : {
    ...fitStyle,
    backgroundImage: activeUpload?.kind === 'gif' ? `url(${activeUpload.url})` : PRESETS[theme.preset],
    ...(activeUpload ? {} : { backgroundSize: 'cover' }),
  };

  return (
    <section id="set-theme" className="card set-card" aria-labelledby="set-theme-h">
      <div className="set-cardhead">
        <h2 id="set-theme-h">테마</h2>
        <button type="button" className="btn" onClick={() => { setUpload(null); update(DEFAULT_THEME); }}>기본 테마로 초기화</button>
      </div>

      <div className={`set-preview ${theme.bg === 'default' ? 'is-default' : ''}`} style={previewStyle}>
        {activeUpload?.kind === 'mp4' && (
          <video src={activeUpload.url} autoPlay muted loop playsInline style={{ objectFit: theme.fit === 'contain' ? 'contain' : 'cover' }} />
        )}
        {theme.bg !== 'default' && <div className="set-dim" style={{ background: `rgba(0,0,0,${theme.dim / 100})` }} />}
        <div className="set-preview-text">
          <small>{theme.bg === 'default' ? '기본' : theme.bg.toUpperCase()} · 미리보기</small>
          <strong>마이스터 역량 452점</strong>
          <p>글자 크기를 바꾸면 이 문장이 바로 바뀝니다.</p>
        </div>
      </div>

      <div className="field">
        <span className="set-label">배경</span>
        <div className="set-chips" role="radiogroup" aria-label="배경">
          {BG_OPTIONS.map(([k, label]) => (
            <button key={k} type="button" role="radio" aria-checked={theme.bg === k} className={theme.bg === k ? 'is-on' : ''}
              onClick={() => { setUploadError(''); update({ bg: k }); }}>{label}</button>
          ))}
        </div>
      </div>

      {theme.bg !== 'default' && (
        <div className="set-bgpanel">
          <div className="set-swatches" role="radiogroup" aria-label="배경 선택">
            {PRESETS.map((p, i) => (
              <button key={p} type="button" role="radio" aria-checked={!activeUpload && theme.preset === i} aria-label={`기본 배경 ${i + 1}`}
                className={!activeUpload && theme.preset === i ? 'is-on' : ''} style={{ backgroundImage: p }}
                onClick={() => { setUpload(null); update({ preset: i }); }} />
            ))}
            {activeUpload && <span className="set-swatch-up is-on" aria-label="업로드한 배경">내 파일</span>}
            <button type="button" className="set-upload" onClick={() => fileRef.current?.click()}>업로드</button>
            <input ref={fileRef} type="file" hidden accept={LIMITS[theme.bg].accept} onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
          </div>
          {uploadError ? <p className="set-help is-error">{uploadError}</p> : <p className="muted set-note">{LIMITS[theme.bg].note}</p>}
          <div className="set-chips" role="radiogroup" aria-label="배치">
            {FIT_OPTIONS.map(([k, label]) => (
              <button key={k} type="button" role="radio" aria-checked={theme.fit === k} className={theme.fit === k ? 'is-on' : ''} onClick={() => update({ fit: k })}>{label}</button>
            ))}
          </div>
          <div className="field">
            <label className="label" htmlFor="set-dim"><span>어둡게 (글자 가독성)</span><span className="mono">{theme.dim}%</span></label>
            <input id="set-dim" type="range" min={0} max={80} step={5} value={theme.dim} onChange={(e) => update({ dim: Number(e.target.value) })}
              className="set-range" style={{ ['--p' as string]: `${(theme.dim / 80) * 100}%` }} />
          </div>
        </div>
      )}

      <div className="field">
        <span className="set-label">글자 크기</span>
        <div className="set-sizes" role="radiogroup" aria-label="글자 크기">
          {FONT_SIZES.map((s, i) => (
            <button key={s.label} type="button" role="radio" aria-label={s.label} aria-checked={theme.size === i} className={theme.size === i ? 'is-on' : ''} onClick={() => update({ size: i })}>
              <span style={{ fontSize: 16 + i * 3 }}>가</span>
              <small>{s.label}</small>
            </button>
          ))}
        </div>
      </div>
      <p className="footnote">테마는 이 브라우저에 바로 저장됩니다. 글자 크기는 모든 화면에 적용됩니다.</p>
    </section>
  );
}
