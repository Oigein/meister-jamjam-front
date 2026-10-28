/* 관리자: 대회 추천 가이드라인 (docs/api/08-recommend.md 2.4) — 설정 화면에서 <RecommendGuidelines />로 사용 */
import { useEffect, useState, type FormEvent } from 'react';
import { getGuidelines, updateGuidelines, type RecommendationGuidelines } from '../api/recommend';
import { ApiError, errorMessage, fieldErrorMap } from '../api/client';
import { useMe } from '../lib/session';
import './RecommendGuidelines.css';

export default function RecommendGuidelines() {
  const me = useMe();
  if (me.role !== 'ADMIN') return null;
  return <GuidelinesEditor />;
}

function GuidelinesEditor() {
  const [loaded, setLoaded] = useState<RecommendationGuidelines | null>(null);
  const [loadError, setLoadError] = useState('');
  const [text, setText] = useState('');
  const [days, setDays] = useState('7');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  async function load(signal?: AbortSignal) {
    try {
      const g = await getGuidelines(signal);
      setLoaded(g);
      setText(g.promptGuideline);
      setDays(String(g.examBufferDays));
      setLoadError('');
    } catch (e) {
      if (!signal?.aborted) setLoadError(errorMessage(e));
    }
  }
  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal);
    return () => ctrl.abort();
  }, []);

  const dirty = !!loaded && (text !== loaded.promptGuideline || days !== String(loaded.examBufferDays));

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!loaded) return;
    setSaving(true);
    setErrors({});
    setNotice(null);
    try {
      const g = await updateGuidelines({ promptGuideline: text, examBufferDays: Number(days), version: loaded.version });
      setLoaded(g);
      setText(g.promptGuideline);
      setDays(String(g.examBufferDays));
      setNotice({ kind: 'ok', text: '저장했습니다. 다음 추천부터 바로 반영됩니다.' });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setNotice({ kind: 'error', text: `${err.message || '다른 관리자가 먼저 수정했습니다.'} 최신 내용을 다시 불러왔습니다.` });
        await load();
      } else {
        const fe = fieldErrorMap(err);
        setErrors(fe);
        if (!Object.keys(fe).length) setNotice({ kind: 'error', text: errorMessage(err) });
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="card rg" aria-labelledby="rg-h">
      <div className="rg-head">
        <h2 id="rg-h">대회 추천 가이드라인</h2>
        {loaded && <span className="mono muted rg-ver">v{loaded.version}</span>}
      </div>
      <p className="rg-desc">교내 마역량 인정 규정이 바뀌면 LLM 프롬프트 가이드라인과 시험 기간 제외 기준을 수정하세요. 저장 즉시 다음 추천부터 반영됩니다.</p>

      {loadError ? (
        <p className="rg-msg is-error">가이드라인을 불러오지 못했습니다. ({loadError}) <button type="button" className="linkbtn" onClick={() => load()}>다시 시도</button></p>
      ) : !loaded ? (
        <p className="status-msg">불러오는 중…</p>
      ) : (
        <form className="rg-form" onSubmit={save} noValidate>
          <div className="field">
            <label className="label" htmlFor="rg-text"><span>프롬프트 가이드라인</span><span className="mono">{text.length.toLocaleString()}자</span></label>
            <textarea id="rg-text" className="textarea rg-text" value={text} onChange={(e) => setText(e.target.value)} aria-invalid={!!errors.promptGuideline} />
            {errors.promptGuideline && <p className="rg-err">{errors.promptGuideline}</p>}
          </div>
          <div className="field rg-days">
            <label className="label" htmlFor="rg-days">시험 전후 제외 일수</label>
            <div className="rg-days-row">
              <input id="rg-days" className="input mono" type="number" min={0} max={30} value={days} onChange={(e) => setDays(e.target.value)} aria-invalid={!!errors.examBufferDays} />
              <span className="muted">일</span>
            </div>
            {errors.examBufferDays && <p className="rg-err">{errors.examBufferDays}</p>}
          </div>
          {notice && <p className={`rg-msg ${notice.kind === 'error' ? 'is-error' : ''}`} role="status">{notice.text}</p>}
          <div className="rg-btns">
            <button type="button" className="btn" disabled={!dirty || saving} onClick={() => { setText(loaded.promptGuideline); setDays(String(loaded.examBufferDays)); setErrors({}); }}>되돌리기</button>
            <button type="submit" className="btn btn-primary" disabled={!dirty || saving}>{saving ? '저장 중…' : '저장'}</button>
          </div>
        </form>
      )}
    </section>
  );
}
