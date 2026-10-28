import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  approveSubmission, getGradingData, grantScore, rejectSubmission,
  type GradingData, type ScoreItemOption, type Submission,
} from '../api/grading';
import { useAsync } from '../lib/useAsync';
import { useMe } from '../lib/session';
import { formatBytes } from '../lib/format';
import { Loadable } from '../components/Loadable';
import { useToast } from '../components/Toast';
import './GradingPage.css';

export default function GradingPage() {
  const me = useMe();
  if (me.role !== 'teacher') {
    return <main className="page"><p className="status-msg">교사만 사용할 수 있는 화면입니다.</p></main>;
  }
  return <Grading />;
}

function Grading() {
  const [tab, setTab] = useState<'review' | 'direct'>('review');
  const { state, setData } = useAsync((s) => getGradingData(s), []);
  const { toast, show } = useToast();

  return (
    <main className="page page-wide">
      <div className="page-head">
        <div>
          <p className="eyebrow mono">교사 · 마이스터 역량</p>
          <h1 className="page-title">점수 부여</h1>
        </div>
        <div className="seg" role="tablist" aria-label="부여 방식">
          <button type="button" role="tab" aria-selected={tab === 'review'} className={tab === 'review' ? 'is-on' : ''} onClick={() => setTab('review')}>증빙자료 검토</button>
          <button type="button" role="tab" aria-selected={tab === 'direct'} className={tab === 'direct' ? 'is-on' : ''} onClick={() => setTab('direct')}>직접 부여</button>
        </div>
      </div>
      <Loadable state={state}>{(d) => tab === 'review'
        ? <Review data={d} onDone={(id, msg) => { setData((x) => ({ ...x, queue: x.queue.filter((s) => s.id !== id) })); show(msg); }} />
        : <Direct items={d.items} onDone={show} />}
      </Loadable>
      {toast}
    </main>
  );
}

/* ---------- 증빙자료 검토 ---------- */
function Review({ data, onDone }: { data: GradingData; onDone: (id: string, msg: string) => void }) {
  const [q, setQ] = useState('');
  const [selId, setSelId] = useState<string | null>(data.queue[0]?.id ?? null);
  const query = q.trim();
  const list = data.queue.filter((s) => !query || s.student.name.includes(query) || s.student.no.includes(query));
  const sel = data.queue.find((s) => s.id === selId) ?? data.queue[0] ?? null;

  return (
    <div className="gr-layout">
      <section className="card gr-queue" aria-labelledby="gr-q">
        <div className="gr-queue-head">
          <div className="gr-queue-title"><h2 id="gr-q">검토 대기</h2><span className="muted">{data.queue.length}건</span></div>
          <input className="input" type="search" placeholder="이름 또는 학번 (예: 2109)" aria-label="검토 대기 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {list.length === 0 ? <p className="gr-empty">{data.queue.length === 0 ? '검토할 증빙자료가 없습니다.' : '검색 결과가 없습니다.'}</p> : (
          <ul>
            {list.map((s) => (
              <li key={s.id}>
                <button type="button" className={sel?.id === s.id ? 'is-on' : ''} aria-current={sel?.id === s.id} onClick={() => setSelId(s.id)}>
                  <span className="gr-qtop"><b>{s.student.name} · {s.student.no}</b><span className="mono muted">{s.submittedAt}</span></span>
                  <span className="muted">{s.category} · {s.title}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {sel ? (
        <>
          <div className="gr-mid">
            <section className="card gr-student">
              <div>
                <h2>{sel.student.name} · {sel.student.no}</h2>
                <p className="muted">현재 총점 <b className="mono">{sel.student.total}</b> · 등급 <b>{sel.student.grade}</b> · 제출 {sel.submittedAt}</p>
              </div>
              <Link to={`/students/${sel.student.id}`}>학생 상세 ›</Link>
            </section>
            <div className="gr-preview">
              {sel.file.url ? (
                sel.file.kind === 'image'
                  ? <img src={sel.file.url} alt={`${sel.title} 증빙자료`} />
                  : <iframe src={sel.file.url} title={`${sel.title} 증빙자료`} />
              ) : (
                <div className="gr-paper">
                  <small className="mono muted">증빙자료 원본 미리보기</small>
                  <h3>{sel.title}</h3>
                  <hr />
                  <p className="muted">[업로드된 이미지 · PDF가 여기에 표시됩니다]</p>
                </div>
              )}
            </div>
            <div className="gr-file">
              <span className="chip">{sel.file.name} · {formatBytes(sel.file.size)}</span>
              {sel.file.url && <a href={sel.file.url} target="_blank" rel="noopener noreferrer">원본 새 탭에서 보기</a>}
            </div>
          </div>
          <Decision key={sel.id} sub={sel} items={data.items} onDone={(msg) => onDone(sel.id, msg)} />
        </>
      ) : (
        <p className="status-msg gr-none">검토할 증빙자료가 없습니다.</p>
      )}
    </div>
  );
}

function Decision({ sub, items, onDone }: { sub: Submission; items: ScoreItemOption[]; onDone: (msg: string) => void }) {
  const ai = sub.ai;
  const [itemId, setItemId] = useState(ai?.suggestedItemId ?? items[0].id);
  const item = items.find((i) => i.id === itemId) ?? items[0];
  const [pts, setPts] = useState(ai ? String(Math.min(ai.expected, item.max)) : '');
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const n = Number(pts);
  const valid = Number.isInteger(n) && n > 0 && n <= item.max;
  const suggested = items.find((i) => i.id === ai?.suggestedItemId);

  async function run(action: () => Promise<unknown>, msg: string) {
    setBusy(true);
    setError('');
    try {
      await action();
      onDone(msg);
    } catch (e) {
      setError(e instanceof Error ? e.message : '처리하지 못했습니다.');
      setBusy(false);
    }
  }

  return (
    <div className="gr-right">
      <section className="card gr-ai" aria-labelledby="gr-ai-h">
        <div className="gr-ai-head"><h2 id="gr-ai-h">AI 분석 결과</h2><span className="chip chip-line mono">OCR · LLM</span></div>
        {ai ? (
          <>
            <dl>
              <dt>구분</dt><dd>{ai.category}</dd>
              <dt>명칭</dt><dd>{ai.name}</dd>
              <dt>발급 · 취득</dt><dd className="mono">{ai.issuedAt}</dd>
              <dt>추천 항목</dt><dd>{suggested?.label ?? '—'}</dd>
              <dt>예상 점수</dt><dd className="mono strong">+{ai.expected}</dd>
            </dl>
            <p className="gr-reason">판단 근거 · {ai.reason}</p>
          </>
        ) : (
          <p className="muted gr-reason-empty">아직 분석 결과가 없습니다. 원본을 보고 직접 판단해 주세요.</p>
        )}
      </section>

      <section className="card gr-confirm" aria-labelledby="gr-c-h">
        <h2 id="gr-c-h">점수 확정</h2>
        <div className="field">
          <label className="label" htmlFor="gr-item">평가항목</label>
          <select id="gr-item" className="select" value={itemId} onChange={(e) => {
            const next = items.find((i) => i.id === e.target.value)!;
            setItemId(next.id);
            if (Number(pts) > next.max) setPts(String(next.max));
          }}>
            {items.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label className="label mono" htmlFor="gr-pts">인정 점수 (최대 {item.max})</label>
          <input id="gr-pts" className="input mono gr-pts" type="number" min={1} max={item.max} value={pts} onChange={(e) => setPts(e.target.value)} aria-invalid={pts !== '' && !valid} />
          {pts !== '' && !valid && <p className="text-minus gr-small">1 ~ {item.max} 사이 정수로 입력하세요.</p>}
        </div>

        {rejecting ? (
          <div className="field">
            <label className="label" htmlFor="gr-reason">반려 사유 (학생에게 전달됩니다)</label>
            <textarea id="gr-reason" className="textarea gr-reject" autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="예: 발급일이 확인되지 않습니다. 원본 전체를 다시 올려 주세요." />
            <div className="gr-btns">
              <button type="button" className="btn btn-lg" onClick={() => setRejecting(false)} disabled={busy}>취소</button>
              <button type="button" className="btn btn-lg text-minus" disabled={busy || !reason.trim()}
                onClick={() => run(() => rejectSubmission(sub.id, reason.trim()), `${sub.student.name} 학생의 증빙자료를 반려했습니다.`)}>반려 확정</button>
            </div>
          </div>
        ) : (
          <div className="gr-btns">
            <button type="button" className="btn btn-lg text-minus" onClick={() => setRejecting(true)} disabled={busy}>반려</button>
            <button type="button" className="btn btn-primary btn-lg" disabled={!valid || busy}
              onClick={() => run(() => approveSubmission(sub.id, { itemId, points: n }), `${sub.student.name} 학생에게 +${n}점을 반영했습니다.`)}>
              {busy ? '처리 중…' : `승인하고 +${valid ? n : 0}점 반영`}
            </button>
          </div>
        )}
        {error && <p className="text-minus gr-small" role="alert">{error}</p>}
      </section>
    </div>
  );
}

/* ---------- 직접 부여 ---------- */
function Direct({ items, onDone }: { items: ScoreItemOption[]; onDone: (msg: string) => void }) {
  const [no, setNo] = useState('');
  const [itemId, setItemId] = useState(items[0].id);
  const [pts, setPts] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const item = items.find((i) => i.id === itemId) ?? items[0];
  const n = Number(pts);
  const valid = /^\d{4}$/.test(no) && Number.isInteger(n) && n > 0 && n <= item.max && reason.trim();

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    setError('');
    try {
      const r = await grantScore({ studentNo: no, itemId, points: n, reason: reason.trim() });
      onDone(`${r.studentName}(${no}) 학생에게 +${n}점을 부여했습니다.`);
      setNo(''); setPts(''); setReason('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '부여하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card gr-direct" onSubmit={submit}>
      <p className="muted">증빙 제출 없이 교사가 바로 점수를 부여합니다. 부여 내역은 학생의 점수 변동 내역에 남습니다.</p>
      <div className="gr-direct-row">
        <div className="field">
          <label className="label" htmlFor="gd-no">학번</label>
          <input id="gd-no" className="input mono" inputMode="numeric" maxLength={4} placeholder="2109" value={no} onChange={(e) => setNo(e.target.value.replace(/\D/g, ''))} />
        </div>
        <div className="field">
          <label className="label" htmlFor="gd-item">평가항목</label>
          <select id="gd-item" className="select" value={itemId} onChange={(e) => setItemId(e.target.value)}>
            {items.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label className="label mono" htmlFor="gd-pts">점수 (최대 {item.max})</label>
          <input id="gd-pts" className="input mono" type="number" min={1} max={item.max} value={pts} onChange={(e) => setPts(e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label className="label" htmlFor="gd-reason">사유</label>
        <input id="gd-reason" className="input" placeholder="예: 교내 해커톤 운영 도우미 활동" value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
      {error && <p className="text-minus gr-small" role="alert">{error}</p>}
      <div className="gr-direct-btn">
        <button type="submit" className="btn btn-primary btn-lg" disabled={!valid || busy}>{busy ? '처리 중…' : '점수 부여'}</button>
      </div>
    </form>
  );
}
