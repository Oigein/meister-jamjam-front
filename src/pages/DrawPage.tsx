import { useRef, useState } from 'react';
import { getDrawClasses, saveDrawResult, type DrawClass } from '../api/draw';
import { useAsync } from '../lib/useAsync';
import { useMe } from '../lib/session';
import { pad2 } from '../lib/format';
import { hashString, mulberry32, newSeed, shuffle } from '../lib/random';
import { Loadable } from '../components/Loadable';
import './DrawPage.css';

const COLS = 4;
type Seats = (number | null)[]; // 자리 인덱스 → 학생 번호 (null = 빈자리)
interface Result { classId: string; seed: string; seats: Seats; hidden: Set<number>; }

/* ---------- 자리 배치 (같은 시드 → 같은 결과) ---------- */
function seatCount(c: DrawClass) {
  const active = c.students.length - c.excluded.length;
  const maxFixed = Math.max(-1, ...Object.values(c.fixed));
  return Math.max(Math.ceil(active / COLS) * COLS, maxFixed + 1, COLS);
}

function arrange(c: DrawClass, seed: string): Seats {
  const rand = mulberry32(hashString(seed));
  const seats: Seats = Array(seatCount(c)).fill(null);
  const active = c.students.map((s) => s.num).filter((n) => !c.excluded.includes(n));
  active.forEach((n) => { if (n in c.fixed) seats[c.fixed[n]] = n; });
  const free = shuffle(seats.flatMap((s, i) => (s === null ? [i] : [])), rand);
  active.filter((n) => !(n in c.fixed)).forEach((n, i) => { seats[free[i]] = n; });
  return seats;
}

/* 직전 자리와 겹치는 학생이 없을 때까지 시드를 조금씩 바꿔 재시도 */
function arrangeAvoiding(c: DrawClass, seed: string, prev: Seats | null) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const s = attempt === 0 ? seed : `${seed}#${attempt}`;
    const seats = arrange(c, s);
    if (!prev || seats.every((n, i) => n === null || n in c.fixed || prev[i] !== n)) return seats;
  }
  return arrange(c, seed);
}

export default function DrawPage() {
  const { state, setData } = useAsync((s) => getDrawClasses(s), []);
  return (
    <main className="page page-wide">
      <h1 className="sr-only">뽑기</h1>
      <Loadable state={state}>{(classes) =>
        classes.length === 0 ? <p className="status-msg">담당 학급이 없습니다.</p>
          : <Draw classes={classes} onClassChange={(c) => setData((cs) => cs.map((x) => (x.id === c.id ? c : x)))} />
      }</Loadable>
    </main>
  );
}

function Draw({ classes, onClassChange }: { classes: DrawClass[]; onClassChange: (c: DrawClass) => void }) {
  const me = useMe();
  const [classId, setClassId] = useState(classes[0].id);
  const cls = classes.find((c) => c.id === classId) ?? classes[0];
  const initial = (c: DrawClass): Result => ({ classId: c.id, seed: c.lastSeed, seats: arrange(c, c.lastSeed), hidden: new Set() });

  const [tab, setTab] = useState<'seat' | 'pinball'>('seat');
  const [reveal, setReveal] = useState<'all' | 'one'>('all');
  const [avoidPrev, setAvoidPrev] = useState(true);
  const [manage, setManage] = useState(false);
  const [result, setResult] = useState<Result>(() => initial(cls));
  const boardRef = useRef<HTMLDivElement>(null);

  const byNum = new Map(cls.students.map((s) => [s.num, s]));
  const { seats, seed, hidden } = result;

  function changeClass(id: string) {
    const c = classes.find((x) => x.id === id)!;
    setClassId(id);
    setResult(initial(c));
  }

  function doShuffle() {
    const s = newSeed();
    const next = arrangeAvoiding(cls, s, avoidPrev ? seats : null);
    setResult({
      classId: cls.id, seed: s, seats: next,
      hidden: reveal === 'one' ? new Set(next.flatMap((n, i) => (n !== null ? [i] : []))) : new Set(),
    });
    onClassChange({ ...cls, lastSeed: s });
    saveDrawResult(cls.id, { seed: s, seats: next, excluded: cls.excluded, fixed: cls.fixed }).catch(() => {});
  }

  const flip = (i: number) => setResult((r) => { const h = new Set(r.hidden); h.delete(i); return { ...r, hidden: h }; });

  function toggleExcluded(num: number) {
    const excluded = cls.excluded.includes(num) ? cls.excluded.filter((n) => n !== num) : [...cls.excluded, num];
    const fixed = { ...cls.fixed };
    delete fixed[num];
    const next = { ...cls, excluded, fixed };
    onClassChange(next);
    setResult((r) => ({ ...r, seats: arrange(next, r.seed), hidden: new Set() }));
  }

  function toggleFixed(num: number) {
    const fixed = { ...cls.fixed };
    if (num in fixed) delete fixed[num];
    else {
      const idx = seats.indexOf(num);
      if (idx < 0) return;
      fixed[num] = idx; // 지금 앉은 자리에 고정 — 다른 학생 자리는 그대로
    }
    onClassChange({ ...cls, fixed });
  }

  function savePng() {
    const rows = seats.length / COLS;
    const W = 1600, pad = 64, gap = 24, cw = (W - pad * 2 - gap * (COLS - 1)) / COLS, ch = 130, top = pad + 100;
    const H = top + rows * (ch + gap) - gap + pad + 40;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d')!;
    const font = getComputedStyle(document.body).fontFamily;
    ctx.fillStyle = '#F3F3EE'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#2F3833'; ctx.beginPath(); ctx.roundRect(W * 0.2, pad, W * 0.6, 60, 6); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = `500 24px ${font}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('칠판 · 교탁', W / 2, pad + 30);
    seats.forEach((num, i) => {
      const x = pad + (i % COLS) * (cw + gap), y = top + Math.floor(i / COLS) * (ch + gap);
      ctx.fillStyle = num === null ? '#EAEAE4' : '#fff'; ctx.strokeStyle = '#C9C9C0'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(x, y, cw, ch, 8); ctx.fill(); ctx.stroke();
      ctx.fillStyle = num === null ? '#8A8A83' : '#111110';
      ctx.font = `500 26px 'JetBrains Mono', monospace`; ctx.fillText(num === null ? '–' : pad2(num), x + cw / 2, y + 42);
      ctx.font = `700 34px ${font}`; ctx.fillText(num === null ? '빈자리' : byNum.get(num)?.name ?? '', x + cw / 2, y + 88);
    });
    ctx.fillStyle = '#5A5A55'; ctx.font = `20px ${font}`;
    ctx.fillText(`${cls.label} · 시드 ${seed}`, W / 2, H - pad / 2 - 10);
    canvas.toBlob((b) => {
      if (!b) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b);
      a.download = `자리배치_${cls.label.replace(/\s/g, '')}_${seed}.png`;
      a.click();
      URL.revokeObjectURL(a.href);
    });
  }

  return (
    <div className="dr">
      <div className="card dr-top">
        <label className="dr-class">
          <span className="muted">학급</span>
          <select className="select" value={classId} onChange={(e) => changeClass(e.target.value)}>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.label} · {c.students.length}명</option>)}
          </select>
        </label>
        <span className="muted dr-counts">제외 {cls.excluded.length}명 · 고정 {Object.keys(cls.fixed).length}명</span>
        <div className="seg dr-tabs" role="tablist" aria-label="뽑기 종류">
          <button type="button" role="tab" aria-selected={tab === 'seat'} className={tab === 'seat' ? 'is-on' : ''} onClick={() => setTab('seat')}>자리뽑기</button>
          <button type="button" role="tab" aria-selected={tab === 'pinball'} className={tab === 'pinball' ? 'is-on' : ''} onClick={() => setTab('pinball')}>핀볼</button>
        </div>
        <div className="dr-topbtns">
          <button type="button" className="btn" aria-expanded={manage} onClick={() => setManage(!manage)}>제외자 관리</button>
          <button type="button" className="btn" onClick={() => boardRef.current?.requestFullscreen?.()} disabled={tab !== 'seat'}>프로젝터 모드</button>
        </div>
      </div>

      {manage && (
        <section className="card dr-manage" aria-label="제외 · 고정 관리">
          <p className="muted">제외한 학생은 배치에서 빠지고, 고정한 학생은 지금 앉은 자리에 계속 앉습니다.</p>
          <ul>
            {cls.students.map((s) => {
              const out = cls.excluded.includes(s.num);
              return (
                <li key={s.num}>
                  <span><span className="mono muted">{pad2(s.num)}</span> {s.name}</span>
                  <label className="check"><input type="checkbox" checked={out} onChange={() => toggleExcluded(s.num)} />제외</label>
                  <label className="check"><input type="checkbox" checked={s.num in cls.fixed} disabled={out} onChange={() => toggleFixed(s.num)} />고정</label>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {tab === 'pinball' ? (
        <section className="card dr-soon"><h2>핀볼</h2><p className="muted">준비 중인 기능입니다.</p></section>
      ) : (
        <div className="dr-layout">
          <div className="dr-board" ref={boardRef}>
            <div className="dr-desk">칠판 · 교탁</div>
            <div className="dr-seats" style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))` }}>
              {seats.map((num, i) => {
                if (num === null) return <div key={i} className="dr-seat is-empty"><span className="mono">–</span><b>빈자리</b></div>;
                const st = byNum.get(num);
                if (hidden.has(i)) {
                  return <button key={i} type="button" className="dr-seat is-hidden" onClick={() => flip(i)} aria-label={`${i + 1}번 자리 공개`}>?</button>;
                }
                return (
                  <div key={i} className={`dr-seat ${st?.name === me.name ? 'is-me' : ''}`}>
                    {num in cls.fixed && <span className="dr-fixed">고정</span>}
                    <span className="mono">{pad2(num)}</span>
                    <b>{st?.name}</b>
                  </div>
                );
              })}
            </div>
          </div>

          <aside className="dr-side">
            <section className="card dr-panel" aria-labelledby="dr-reveal">
              <h2 id="dr-reveal">공개 방식</h2>
              <div className="dr-opts" role="radiogroup" aria-labelledby="dr-reveal">
                <button type="button" role="radio" aria-checked={reveal === 'all'} className={reveal === 'all' ? 'is-on' : ''} onClick={() => setReveal('all')}>일괄 공개</button>
                <button type="button" role="radio" aria-checked={reveal === 'one'} className={reveal === 'one' ? 'is-on' : ''} onClick={() => setReveal('one')}>한 자리씩 뒤집기</button>
              </div>
              <label className="check"><input type="checkbox" checked={avoidPrev} onChange={(e) => setAvoidPrev(e.target.checked)} />직전 자리 중복 방지</label>
              <button type="button" className="btn btn-primary btn-lg btn-block" onClick={doShuffle}>자리 섞기</button>
              {hidden.size > 0 && (
                <button type="button" className="btn btn-block" onClick={() => setResult((r) => ({ ...r, hidden: new Set() }))}>남은 {hidden.size}자리 모두 공개</button>
              )}
            </section>
            <section className="card dr-panel">
              <span className="muted dr-seedlabel">검증용 랜덤 시드</span>
              <p className="mono dr-seed">{seed}</p>
              <div className="dr-2btn">
                <button type="button" className="btn" onClick={savePng}>PNG 저장</button>
                <button type="button" className="btn" onClick={() => window.print()}>인쇄 PDF</button>
              </div>
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}
