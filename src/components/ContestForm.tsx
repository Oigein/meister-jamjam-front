/* 대회 등록·수정 폼 (docs/api/06-contests.md 2.2, 2.5) — 목록 화면의 등록과 상세 화면의 수정에서 함께 사용 */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  addCategory, getCategories, isoToLocalInput, localInputToIso,
  type ContestCategory, type ContestDetail, type ContestInput,
} from '../api/contests';
import { ApiError, errorMessage, fieldErrorMap } from '../api/client';
import { CONTEST_SCOPE_LABEL, type ContestScope } from '../api/types';
import './ContestForm.css';

const SCOPES: ContestScope[] = ['IN_SCHOOL', 'OUT_SCHOOL'];

interface Props {
  initial?: ContestDetail | null; // 있으면 수정
  onSubmit: (input: ContestInput) => Promise<ContestDetail>;
  onDone: (c: ContestDetail) => void;
  onCancel: () => void;
  onToast?: (msg: string) => void;
}

export default function ContestForm({ initial, onSubmit, onDone, onCancel, onToast }: Props) {
  const [cats, setCats] = useState<ContestCategory[] | null>(null);
  const [catLoadError, setCatLoadError] = useState('');
  const [contestName, setContestName] = useState(initial?.contestName ?? '');
  const [content, setContent] = useState(initial?.content ?? '');
  const [scope, setScope] = useState<ContestScope | null>(initial?.scope ?? null); // 기본값 없음
  const [categoryId, setCategoryId] = useState<number | null>(initial?.category.categoryId ?? null);
  const [startAt, setStartAt] = useState(initial ? isoToLocalInput(initial.startAt) : '');
  const [finishAt, setFinishAt] = useState(initial ? isoToLocalInput(initial.finishAt) : '');

  const [adding, setAdding] = useState(false);
  const [newCat, setNewCat] = useState('');
  const [catBusy, setCatBusy] = useState(false);
  const [catError, setCatError] = useState('');

  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const addInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    getCategories(ctrl.signal)
      .then((r) => setCats(r.items))
      .catch((e) => { if (!ctrl.signal.aborted) setCatLoadError(errorMessage(e)); });
    return () => ctrl.abort();
  }, []);

  async function submitCategory() {
    const name = newCat.trim();
    if (!name) { setCatError('카테고리 이름을 입력하세요.'); return; }
    setCatBusy(true);
    setCatError('');
    try {
      const r = await addCategory(name);
      setCats((xs) => {
        const list = xs ?? [];
        return list.some((c) => c.categoryId === r.categoryId) ? list : [...list, { categoryId: r.categoryId, name: r.name, isDefault: r.isDefault }];
      });
      setCategoryId(r.categoryId);
      setNewCat('');
      setAdding(false);
      clear('categoryId');
      setFormError('');
      onToast?.(r.created ? `'${r.name}' 카테고리를 추가했습니다.` : `이미 있는 카테고리 '${r.name}'을(를) 선택했습니다.`);
    } catch (e) {
      setCatError(fieldErrorMap(e).name ?? errorMessage(e));
    } finally {
      setCatBusy(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (adding) {
      setFormError('추가 중인 카테고리를 확인하거나 취소하세요.');
      addInputRef.current?.focus();
      return;
    }
    setSaving(true);
    setErrors({});
    setFormError('');
    try {
      const c = await onSubmit({
        contestName: contestName.trim(), content, scope, categoryId,
        startAt: localInputToIso(startAt), finishAt: localInputToIso(finishAt),
      });
      onDone(c);
    } catch (err) {
      const fe = fieldErrorMap(err);
      setErrors(fe);
      if (!Object.keys(fe).length) setFormError(err instanceof ApiError && err.code === 'CATEGORY_NOT_FOUND' ? '선택한 카테고리가 없어졌습니다. 다시 선택하세요.' : errorMessage(err));
      else setFormError('입력값을 확인해 주세요.');
    } finally {
      setSaving(false);
    }
  }

  const clear = (k: string) => setErrors((e) => (e[k] ? Object.fromEntries(Object.entries(e).filter(([x]) => x !== k)) : e));
  const err = (k: string) => errors[k] ? <p className="cf-err" role="alert">{errors[k]}</p> : null;

  return (
    <form className="card cf" onSubmit={submit} noValidate aria-labelledby="cf-h">
      <h2 id="cf-h">{initial ? '대회 수정' : '대회 등록'} <small>· 교사</small></h2>

      <div className="field">
        <label className="label" htmlFor="cf-name"><span>대회명 <span className="req">*</span></span><span className="mono">{contestName.trim().length}/30</span></label>
        <input id="cf-name" className="input" value={contestName} maxLength={40} onChange={(e) => { setContestName(e.target.value); clear('contestName'); }}
          placeholder="예: 부산 SW 해커톤" aria-invalid={!!errors.contestName} />
        {err('contestName')}
      </div>

      <fieldset className="field">
        <legend className="label"><span>구분 <span className="req">*</span></span></legend>
        <div className="cf-radios">
          {SCOPES.map((s) => (
            <label key={s} className="check"><input type="radio" name="cf-scope" checked={scope === s} onChange={() => { setScope(s); clear('scope'); }} />{CONTEST_SCOPE_LABEL[s]}</label>
          ))}
        </div>
        {err('scope')}
      </fieldset>

      <div className="field">
        <label className="label" htmlFor={adding ? 'cf-newcat' : 'cf-cat'}><span>카테고리 <span className="req">*</span></span></label>
        <div className="cf-catrow">
          {adding ? (
            <>
              <input id="cf-newcat" ref={addInputRef} className="input" autoFocus placeholder="새 카테고리 (20자 이하)" value={newCat} maxLength={30}
                onChange={(e) => setNewCat(e.target.value)} aria-invalid={!!catError}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); submitCategory(); }
                  if (e.key === 'Escape') { setAdding(false); setCatError(''); setFormError(''); }
                }} />
              <button type="button" className="btn btn-primary cf-catbtn" disabled={catBusy} onClick={submitCategory}>{catBusy ? '추가 중…' : '추가'}</button>
              <button type="button" className="btn cf-catbtn" onClick={() => { setAdding(false); setNewCat(''); setCatError(''); setFormError(''); }}>취소</button>
            </>
          ) : (
            <>
              <select id="cf-cat" className="select" value={categoryId ?? ''} aria-invalid={!!errors.categoryId}
                onChange={(e) => { setCategoryId(e.target.value ? Number(e.target.value) : null); clear('categoryId'); }} disabled={!cats}>
                <option value="">{cats ? '카테고리 선택' : '불러오는 중…'}</option>
                {cats?.map((c) => <option key={c.categoryId} value={c.categoryId}>{c.name}</option>)}
              </select>
              <button type="button" className="btn btn-dashed cf-catbtn" onClick={() => setAdding(true)}>＋ 추가</button>
            </>
          )}
        </div>
        {catLoadError && <p className="cf-err">카테고리를 불러오지 못했습니다. ({catLoadError})</p>}
        {adding && catError && <p className="cf-err" role="alert">{catError}</p>}
        {!adding && err('categoryId')}
      </div>

      <div className="cf-row">
        <div className="field">
          <label className="label" htmlFor="cf-start"><span>시작 일시 <span className="req">*</span></span></label>
          <input id="cf-start" className="input mono" type="datetime-local" value={startAt} onChange={(e) => { setStartAt(e.target.value); clear('startAt'); }} aria-invalid={!!errors.startAt} />
          {err('startAt')}
        </div>
        <div className="field">
          <label className="label" htmlFor="cf-finish"><span>마감 일시 <span className="req">*</span></span></label>
          <input id="cf-finish" className="input mono" type="datetime-local" value={finishAt} onChange={(e) => { setFinishAt(e.target.value); clear('finishAt'); }} aria-invalid={!!errors.finishAt} />
          {err('finishAt')}
        </div>
      </div>

      <div className="field">
        <label className="label" htmlFor="cf-content"><span>대회 안내 <span className="req">*</span></span></label>
        <textarea id="cf-content" className="textarea cf-content" value={content} onChange={(e) => { setContent(e.target.value); clear('content'); }}
          placeholder="참가 대상, 일정, 시상, 제출물 등을 적어 주세요." aria-invalid={!!errors.content} />
        {err('content')}
      </div>

      {formError && <p className="cf-err cf-formerr" role="alert">{formError}</p>}
      <div className="cf-btns">
        <button type="button" className="btn" onClick={onCancel}>취소</button>
        <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? '저장 중…' : initial ? '수정 저장' : '등록'}</button>
      </div>
    </form>
  );
}
