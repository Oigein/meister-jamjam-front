import { useState, type FormEvent } from 'react';
import {
  askContest, createContest, getContests, getRecommendations,
  type AskAnswer, type Contest, type RecMode, type Scope,
} from '../api/contests';
import { useAsync } from '../lib/useAsync';
import { useMe } from '../lib/session';
import { daysUntil, ddayLabel } from '../lib/format';
import { Loadable } from '../components/Loadable';
import { useToast } from '../components/Toast';
import './ContestsPage.css';

const MODES: [RecMode, string][] = [['value', '가성비'], ['high', '고득점'], ['short', '단기 완수']];
const SCOPES: ['all' | Scope, string][] = [['all', '전체'], ['교내', '교내'], ['교외', '교외']];
const BASE_CATEGORIES = ['해커톤', '경진대회', '아이디어톤', '공모전'];

const Stars = ({ n }: { n: number }) => (
  <span className="ct-stars" aria-label={`5점 중 ${n}점`}>{'★'.repeat(n)}<span>{'★'.repeat(5 - n)}</span></span>
);

export default function ContestsPage() {
  const me = useMe();
  const { toast, show } = useToast();
  const [mode, setMode] = useState<RecMode>('value');
  const rec = useAsync((s) => getRecommendations(mode, s), [mode]);
  const list = useAsync((s) => getContests(s), []);

  const [scope, setScope] = useState<'all' | Scope>('all');
  const [cat, setCat] = useState('');
  const [extraCats, setExtraCats] = useState<string[]>([]);
  const [formOpen, setFormOpen] = useState(false);

  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<AskAnswer | null>(null);

  async function ask(e: FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q) return;
    setAsking(true);
    try {
      setAnswer(await askContest(q));
    } catch {
      setAnswer({ text: '답변을 받지 못했습니다. 잠시 후 다시 시도해 주세요.', contestIds: [] });
    } finally {
      setAsking(false);
    }
  }

  const contests = list.state.status === 'ok' ? list.state.data : [];
  const categories = [...new Set([...BASE_CATEGORIES, ...contests.map((c) => c.category), ...extraCats])];

  return (
    <main className="page">
      <div>
        <p className="eyebrow">대회 정보</p>
        <h1 className="page-title">대회</h1>
      </div>

      {/* AI 추천 */}
      <section className="ct-rec" aria-labelledby="rec-h">
        <div className="ct-rec-head">
          <div className="ct-rec-title">
            <h2 id="rec-h">마역량 따기 좋은 대회 추천</h2>
            {rec.state.status === 'ok' && <p>{rec.state.data.contextLine}</p>}
          </div>
          <div className="seg seg-accent" role="tablist" aria-label="추천 기준">
            {MODES.map(([k, label]) => (
              <button key={k} type="button" role="tab" aria-selected={mode === k} className={mode === k ? 'is-on' : ''} onClick={() => setMode(k)}>{label}</button>
            ))}
          </div>
        </div>

        <Loadable state={rec.state}>{(d) => (
          <div className="ct-rec-grid">
            {d.items.map((it) => (
              <article key={it.contestId} className="ct-rec-card">
                <div className="ct-rec-top">
                  <span className="mono minus">{ddayLabel(it.deadline)}</span>
                  <span className="mono accent">예상 +{it.expected}점</span>
                </div>
                <h3>{it.title}</h3>
                <p className="ct-rec-reason">{it.reason}</p>
                <div className="ct-rec-foot">
                  <span>난이도 <Stars n={it.difficulty} /></span>
                  <span>효율 <b className="mono">{it.efficiency}</b>점/일</span>
                </div>
              </article>
            ))}
          </div>
        )}</Loadable>

        <form className="ct-ask" onSubmit={ask}>
          <input className="input" placeholder="예: 시험 끝나고 2주 안에 끝나는 해커톤 있어?" aria-label="대회 추천 질문"
            value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={200} />
          <button type="submit" className="btn btn-primary btn-lg" disabled={asking || !question.trim()}>{asking ? '답변 중…' : '물어보기'}</button>
        </form>
        {answer && (
          <div className="ct-answer" aria-live="polite">
            <p>{answer.text}</p>
            <button type="button" className="linkbtn" onClick={() => setAnswer(null)}>닫기</button>
          </div>
        )}
      </section>

      {/* 전체 대회 */}
      <section aria-labelledby="all-h" className="ct-all">
        <Loadable state={list.state}>{(all) => {
          const filtered = all
            .filter((c) => (scope === 'all' || c.scope === scope) && (!cat || c.category === cat))
            .sort((a, b) => Number(daysUntil(a.deadline) < 0) - Number(daysUntil(b.deadline) < 0) || a.deadline.localeCompare(b.deadline));
          return (
            <>
              <div className="ct-listhead">
                <h2 id="all-h" className="section-title">전체 대회 <span className="mono muted">{filtered.length}</span></h2>
                <div className="ct-tools">
                  <div className="seg" role="tablist" aria-label="구분">
                    {SCOPES.map(([k, label]) => (
                      <button key={k} type="button" role="tab" aria-selected={scope === k} className={scope === k ? 'is-on' : ''} onClick={() => setScope(k)}>{label}</button>
                    ))}
                  </div>
                  <select className="select ct-cat" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="카테고리">
                    <option value="">카테고리 전체</option>
                    {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  {me.role === 'teacher' && (
                    <button type="button" className="btn btn-strong ct-addbtn" aria-expanded={formOpen} onClick={() => setFormOpen(!formOpen)}>
                      + 대회 등록 <small>교사</small>
                    </button>
                  )}
                </div>
              </div>

              {filtered.length === 0 ? <p className="status-msg">조건에 맞는 대회가 없습니다.</p> : (
                <div className="ct-grid">
                  {filtered.map((c) => (
                    <article key={c.id} className={`card ct-card ${daysUntil(c.deadline) < 0 ? 'is-closed' : ''}`}>
                      <div className="ct-card-top">
                        <span className="ct-chips">
                          <span className={`chip ${c.scope === '교내' ? 'chip-dark' : 'chip-accent'}`}>{c.scope}</span>
                          <span className="chip">{c.category}</span>
                        </span>
                        <span className="mono muted">{ddayLabel(c.deadline)}</span>
                      </div>
                      <h3>{c.title}</h3>
                      <p className="muted">접수 마감 <span className="mono">{c.deadline.slice(5)}</span> · 예상 <span className="mono accent">+{c.expected}</span>점</p>
                      {c.examWarning && <p className="ct-warn">{c.examWarning}</p>}
                    </article>
                  ))}
                </div>
              )}
            </>
          );
        }}</Loadable>
      </section>

      {formOpen && me.role === 'teacher' && (
        <ContestForm
          categories={categories}
          onAddCategory={(c) => setExtraCats((xs) => [...xs, c])}
          onCancel={() => setFormOpen(false)}
          onCreated={(c) => {
            list.setData((xs) => [...xs, c]);
            setFormOpen(false);
            show(`'${c.title}' 대회를 등록했습니다.`);
          }}
        />
      )}
      {toast}
    </main>
  );
}

function ContestForm({ categories, onAddCategory, onCancel, onCreated }: {
  categories: string[];
  onAddCategory: (c: string) => void;
  onCancel: () => void;
  onCreated: (c: Contest) => void;
}) {
  const [scope, setScope] = useState<Scope>('교외');
  const [category, setCategory] = useState(categories[0] ?? '');
  const [adding, setAdding] = useState(false);
  const [newCat, setNewCat] = useState('');
  const [title, setTitle] = useState('');
  const [deadline, setDeadline] = useState('');
  const [expected, setExpected] = useState('');
  const [warning, setWarning] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const valid = title.trim() && deadline && category && Number(expected) > 0;

  const addCategory = () => {
    const c = newCat.trim();
    if (!c) return;
    if (!categories.includes(c)) onAddCategory(c);
    setCategory(c);
    setNewCat('');
    setAdding(false);
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setSaving(true);
    setError('');
    try {
      onCreated(await createContest({ scope, category, title: title.trim(), deadline, expected: Number(expected), examWarning: warning.trim() || undefined }));
    } catch (err) {
      setError(err instanceof Error ? err.message : '등록하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="card ct-form" onSubmit={submit} aria-labelledby="form-h">
      <h2 id="form-h">대회 등록 <small>· 교사</small></h2>

      <fieldset className="field">
        <legend className="label">구분</legend>
        <div className="ct-radios">
          {(['교내', '교외'] as Scope[]).map((s) => (
            <label key={s} className="check"><input type="radio" name="scope" checked={scope === s} onChange={() => setScope(s)} />{s}</label>
          ))}
        </div>
      </fieldset>

      <div className="field">
        <label className="label" htmlFor="ct-cat">카테고리</label>
        <div className="ct-catrow">
          {adding ? (
            <input className="input" autoFocus placeholder="새 카테고리 이름" value={newCat} onChange={(e) => setNewCat(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCategory(); } if (e.key === 'Escape') setAdding(false); }} />
          ) : (
            <select id="ct-cat" className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          <button type="button" className="btn btn-dashed ct-catbtn" onClick={adding ? addCategory : () => setAdding(true)}>{adding ? '추가' : '+ 추가'}</button>
        </div>
      </div>

      <div className="field">
        <label className="label" htmlFor="ct-title">대회명</label>
        <input id="ct-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: [전국] 고교 SW 개발대회" />
      </div>

      <div className="ct-formrow">
        <div className="field">
          <label className="label" htmlFor="ct-deadline">접수 마감</label>
          <input id="ct-deadline" className="input mono" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </div>
        <div className="field">
          <label className="label" htmlFor="ct-exp">예상 점수</label>
          <input id="ct-exp" className="input mono" type="number" min={1} value={expected} onChange={(e) => setExpected(e.target.value)} placeholder="60" />
        </div>
      </div>

      <div className="field">
        <label className="label" htmlFor="ct-warn">주의 문구 <span className="muted">(선택)</span></label>
        <input id="ct-warn" className="input" value={warning} onChange={(e) => setWarning(e.target.value)} placeholder="예: 시험 기간 주의 · 기말고사 1주 전 마감" />
      </div>

      {error && <p className="text-minus" role="alert">{error}</p>}
      <div className="ct-formbtns">
        <button type="button" className="btn" onClick={onCancel}>취소</button>
        <button type="submit" className="btn btn-primary" disabled={!valid || saving}>{saving ? '등록 중…' : '등록'}</button>
      </div>
    </form>
  );
}
