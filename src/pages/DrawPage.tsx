/*
 * 핀볼 · 자리뽑기 (docs/api/11-draw.md)
 * 결과는 서버가 정함. 이 화면은 서버 결과를 공개 방식(일괄/한 자리씩)·핀볼 애니메이션으로 보여 주기만 함.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import {
  PINBALL_MODE_LABEL, SEAT_WARNING_LABEL, drawPinball, drawSeats, getClassRoster, getDraw, getDrawVerification, getDraws,
  type PinballDraw, type PinballMode, type RosterStudent, type SeatDraw, type SeatLayout, type SeatPos,
} from '../api/draws';
import { errorMessage } from '../api/client';
import type { DrawType } from '../api/types';
import { useAsync } from '../lib/useAsync';
import { useMe } from '../lib/session';
import { pad2 } from '../lib/format';
import { hashString, mulberry32 } from '../lib/random';
import { useToast } from '../components/Toast';
import './DrawPage.css';

const GRADES = [1, 2, 3];
const CLASSES = [1, 2, 3, 4];
const SIZES = Array.from({ length: 10 }, (_, i) => i + 1);

const pkey = (p: SeatPos) => `${p.row}-${p.col}`;
const fmtTime = (iso: string) => iso.slice(5, 16).replace('T', ' ');
const posLabel = (p: SeatPos) => `${p.row}줄 ${p.col}번째`;

/* 응답에 layout이 없으면 배치·빈자리로 추정 */
function layoutOf(d: SeatDraw): SeatLayout {
  if (d.layout) return d.layout;
  const all = [...d.assignments, ...d.emptySeats];
  const rows = Math.max(1, ...all.map((p) => p.row)), cols = Math.max(1, ...all.map((p) => p.col));
  const used = new Set(all.map(pkey));
  const disabledSeats: SeatPos[] = [];
  for (let r = 1; r <= rows; r++) for (let c = 1; c <= cols; c++) if (!used.has(`${r}-${c}`)) disabledSeats.push({ row: r, col: c });
  return { rows, cols, groupShape: null, disabledSeats };
}
const sameLayout = (a: SeatLayout, b: SeatLayout) =>
  a.rows === b.rows && a.cols === b.cols && a.disabledSeats.length === b.disabledSeats.length &&
  a.disabledSeats.map(pkey).sort().join() === b.disabledSeats.map(pkey).sort().join();

interface SeatView { draw: SeatDraw; layout: SeatLayout; hidden: Set<string>; }
interface Round { draw: PinballDraw; bins: RosterStudent[]; }

export default function DrawPage() {
  const me = useMe();
  const [grade, setGrade] = useState(me.student?.grade ?? 1);
  const [classNo, setClassNo] = useState(me.student?.classNo ?? 1);
  const rosterState = useAsync((s) => getClassRoster(grade, classNo, s), [grade, classNo]).state;
  const roster = rosterState.status === 'ok' && rosterState.data.grade === grade && rosterState.data.classNo === classNo ? rosterState.data.students : null;

  const [tab, setTab] = useState<DrawType>('SEAT');
  const [manage, setManage] = useState(false);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [fixed, setFixed] = useState<Map<string, SeatPos>>(new Map());
  const [picking, setPicking] = useState<string | null>(null);
  const seatBoardRef = useRef<HTMLDivElement>(null);
  const pinBoardRef = useRef<HTMLDivElement>(null);
  const { toast, show } = useToast();

  function changeClass(g: number, c: number) {
    setGrade(g); setClassNo(c);
    setExcluded(new Set()); setFixed(new Map()); setPicking(null);
  }

  function toggleExcluded(id: string) {
    setExcluded((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    setFixed((m) => { if (!m.has(id)) return m; const n = new Map(m); n.delete(id); return n; });
  }
  function unfix(id: string) { setFixed((m) => { const n = new Map(m); n.delete(id); return n; }); }
  function startPick(id: string) {
    setTab('SEAT'); setPicking(id);
    requestAnimationFrame(() => seatBoardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }

  const isMine = (num: number) => !!me.student && me.student.grade === grade && me.student.classNo === classNo && me.student.number === num;
  const ctx = { grade, classNo, roster: roster ?? [], excluded, fixed, setFixed, picking, setPicking, isMine, show };

  return (
    <main className="page page-wide">
      <h1 className="sr-only">뽑기</h1>
      <div className="dr">
        <div className="card dr-top">
          <div className="dr-class">
            <span className="muted">학급</span>
            <select className="select" aria-label="학년" value={grade} onChange={(e) => changeClass(Number(e.target.value), classNo)}>
              {GRADES.map((g) => <option key={g} value={g}>{g}학년</option>)}
            </select>
            <select className="select" aria-label="반" value={classNo} onChange={(e) => changeClass(grade, Number(e.target.value))}>
              {CLASSES.map((c) => <option key={c} value={c}>{c}반</option>)}
            </select>
          </div>
          <span className="muted dr-counts">
            {roster ? `${roster.length}명 · ` : ''}제외 {excluded.size}명 · 고정 {fixed.size}명
          </span>
          <div className="seg dr-tabs" role="tablist" aria-label="뽑기 종류">
            <button type="button" role="tab" aria-selected={tab === 'SEAT'} className={tab === 'SEAT' ? 'is-on' : ''} onClick={() => setTab('SEAT')}>자리뽑기</button>
            <button type="button" role="tab" aria-selected={tab === 'PINBALL'} className={tab === 'PINBALL' ? 'is-on' : ''} onClick={() => { setTab('PINBALL'); setPicking(null); }}>핀볼</button>
          </div>
          <div className="dr-topbtns">
            <button type="button" className="btn" aria-expanded={manage} onClick={() => setManage(!manage)}>제외·고정 관리</button>
            <button type="button" className="btn" onClick={() => (tab === 'SEAT' ? seatBoardRef : pinBoardRef).current?.requestFullscreen?.().catch(() => show('전체 화면을 열 수 없습니다.'))}>프로젝터 모드</button>
          </div>
        </div>

        {rosterState.status === 'error' ? (
          <p className="status-msg" role="alert">명단을 불러오지 못했습니다. ({rosterState.message})</p>
        ) : !roster ? (
          <p className="status-msg">명단 불러오는 중…</p>
        ) : (
          <>
            {manage && (
              <section className="card dr-manage" aria-label="제외 · 고정 관리">
                <p className="muted">
                  제외한 학생은 자리뽑기·핀볼 모두에서 빠집니다.{tab === 'SEAT' && ' 고정한 학생은 지정한 자리에 먼저 앉고, 나머지를 서버가 섞습니다.'}
                </p>
                <ul>
                  {roster.map((s) => {
                    const out = excluded.has(s.studentId);
                    const f = fixed.get(s.studentId);
                    return (
                      <li key={s.studentId}>
                        <span><span className="mono muted">{pad2(s.number)}</span> {s.name}</span>
                        <label className="check"><input type="checkbox" checked={out} onChange={() => toggleExcluded(s.studentId)} />제외</label>
                        {tab === 'SEAT' && (f ? (
                          <button type="button" className="btn btn-sm dr-fixbtn is-on" onClick={() => unfix(s.studentId)} aria-label={`${s.name} 고정 해제`}>{posLabel(f)} ✕</button>
                        ) : (
                          <button type="button" className={`btn btn-sm dr-fixbtn ${picking === s.studentId ? 'is-picking' : ''}`} disabled={out} onClick={() => startPick(s.studentId)}>
                            {picking === s.studentId ? '자리 고르는 중' : '자리 고정'}
                          </button>
                        ))}
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
            <div hidden={tab !== 'SEAT'}><SeatTab key={`${grade}-${classNo}`} {...ctx} boardRef={seatBoardRef} /></div>
            <div hidden={tab !== 'PINBALL'}><PinballTab key={`${grade}-${classNo}`} {...ctx} boardRef={pinBoardRef} /></div>
          </>
        )}
      </div>
      {toast}
    </main>
  );
}

interface Ctx {
  grade: number; classNo: number; roster: RosterStudent[];
  excluded: Set<string>; fixed: Map<string, SeatPos>; setFixed: (f: (m: Map<string, SeatPos>) => Map<string, SeatPos>) => void;
  picking: string | null; setPicking: (id: string | null) => void;
  isMine: (num: number) => boolean; show: (m: string) => void;
  boardRef: RefObject<HTMLDivElement | null>;
}

/* ======================= 자리뽑기 ======================= */
function SeatTab({ grade, classNo, roster, excluded, fixed, setFixed, picking, setPicking, isMine, show, boardRef }: Ctx) {
  const [layout, setLayout] = useState<SeatLayout>({ rows: 5, cols: 4, groupShape: null, disabledSeats: [] });
  const [editing, setEditing] = useState(false);
  const [reveal, setReveal] = useState<'all' | 'one'>('all');
  const [avoidPrev, setAvoidPrev] = useState(true);
  const [view, setView] = useState<SeatView | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [historyKey, setHistoryKey] = useState(0);
  const [verifyId, setVerifyId] = useState<string | null>(null);

  const byId = useMemo(() => new Map(roster.map((s) => [s.studentId, s])), [roster]);
  const disabled = useMemo(() => new Set(layout.disabledSeats.map(pkey)), [layout]);
  const fixedAt = useMemo(() => new Map([...fixed].map(([id, p]) => [pkey(p), id])), [fixed]);
  const showResult = !!view && !editing && !picking && sameLayout(view.layout, layout);
  const usable = layout.rows * layout.cols - layout.disabledSeats.length;
  const targets = roster.length - excluded.size;

  /* 줄·칸 수를 줄이면 범위 밖 고정·비활성 자리 정리 */
  function resize(rows: number, cols: number) {
    setLayout((l) => ({ ...l, rows, cols, disabledSeats: l.disabledSeats.filter((p) => p.row <= rows && p.col <= cols) }));
    setFixed((m) => new Map([...m].filter(([, p]) => p.row <= rows && p.col <= cols)));
  }
  function toggleDisabled(p: SeatPos) {
    const k = pkey(p);
    setLayout((l) => ({ ...l, disabledSeats: disabled.has(k) ? l.disabledSeats.filter((x) => pkey(x) !== k) : [...l.disabledSeats, p] }));
    if (!disabled.has(k) && fixedAt.has(k)) { const id = fixedAt.get(k)!; setFixed((m) => { const n = new Map(m); n.delete(id); return n; }); }
  }
  function pickSeat(p: SeatPos) {
    if (!picking || disabled.has(pkey(p))) return;
    const other = fixedAt.get(pkey(p));
    setFixed((m) => { const n = new Map(m); if (other) n.delete(other); n.set(picking, p); return n; });
    show(`${byId.get(picking)?.name ?? ''} → ${posLabel(p)} 고정`);
    setPicking(null);
  }

  function present(d: SeatDraw, hideAll: boolean) {
    const l = layoutOf(d);
    setLayout(l);
    setView({ draw: d, layout: l, hidden: hideAll ? new Set(d.assignments.map(pkey)) : new Set() });
  }

  async function shuffleSeats() {
    setBusy(true); setErr(null); setEditing(false); setPicking(null);
    try {
      const d = await drawSeats({
        grade, classNo, layout,
        excludedStudentIds: [...excluded],
        fixedSeats: [...fixed].map(([studentId, p]) => ({ studentId, row: p.row, col: p.col })),
        avoidPreviousSeat: avoidPrev,
      });
      present(d, reveal === 'one');
      setHistoryKey((k) => k + 1);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function openHistory(id: string) {
    setErr(null);
    try {
      const d = await getDraw(id);
      if (d.type !== 'SEAT') return;
      setEditing(false); setPicking(null);
      present(d, false);
    } catch (e) { setErr(errorMessage(e)); }
  }

  const flip = (k: string) => setView((v) => { if (!v) return v; const h = new Set(v.hidden); h.delete(k); return { ...v, hidden: h }; });

  const byPos = useMemo(() => new Map((view?.draw.assignments ?? []).map((a) => [pkey(a), a])), [view]);

  function cell(p: SeatPos): ReactNode {
    const k = pkey(p);
    if (editing) {
      const off = disabled.has(k);
      return (
        <button key={k} type="button" className={`dr-seat is-edit ${off ? 'is-off' : ''}`} aria-pressed={!off} onClick={() => toggleDisabled(p)} aria-label={`${posLabel(p)} ${off ? '사용 안 함' : '사용'}`}>
          <b>{off ? '사용 안 함' : '사용'}</b>
        </button>
      );
    }
    if (showResult && view) {
      if (view.hidden.has(k)) return <button key={k} type="button" className="dr-seat is-hidden" onClick={() => flip(k)} aria-label={`${posLabel(p)} 공개`}>?</button>;
      const a = byPos.get(k);
      if (a) {
        return (
          <div key={k} className={`dr-seat ${isMine(a.number) ? 'is-me' : ''}`}>
            {a.fixed && <span className="dr-fixed">고정</span>}
            <span className="mono">{pad2(a.number)}</span>
            <b>{a.name}</b>
          </div>
        );
      }
      if (disabled.has(k)) return <div key={k} className="dr-seat is-off"><b>사용 안 함</b></div>;
      return <div key={k} className="dr-seat is-empty"><span className="mono">–</span><b>빈자리</b></div>;
    }
    /* 초안: 고정 학생만 표시 */
    if (disabled.has(k)) return <div key={k} className="dr-seat is-off"><b>사용 안 함</b></div>;
    const fid = fixedAt.get(k);
    const st = fid ? byId.get(fid) : null;
    if (picking) {
      return (
        <button key={k} type="button" className={`dr-seat is-pick ${st ? '' : 'is-draft'}`} onClick={() => pickSeat(p)} aria-label={`${posLabel(p)}에 고정`}>
          {st ? <><span className="dr-fixed">고정</span><span className="mono">{pad2(st.number)}</span><b>{st.name}</b></> : <span className="mono">{p.row}·{p.col}</span>}
        </button>
      );
    }
    if (st) return <div key={k} className="dr-seat"><span className="dr-fixed">고정</span><span className="mono">{pad2(st.number)}</span><b>{st.name}</b></div>;
    return <div key={k} className="dr-seat is-draft"><span className="mono">{p.row}·{p.col}</span></div>;
  }

  const cells: SeatPos[] = [];
  for (let r = 1; r <= layout.rows; r++) for (let c = 1; c <= layout.cols; c++) cells.push({ row: r, col: c });
  const pickingName = picking ? byId.get(picking)?.name : null;

  return (
    <div className="dr-layout">
      <div className="dr-main">
        {showResult && view && view.draw.warnings.length > 0 && (
          <p className="dr-warn" role="status">{view.draw.warnings.map((w) => SEAT_WARNING_LABEL[w] ?? w).join(' ')}</p>
        )}
        {picking && (
          <p className="dr-hint" role="status">
            <span><b>{pickingName}</b> 학생을 고정할 자리를 고르세요.</span>
            <button type="button" className="btn btn-sm" onClick={() => setPicking(null)}>취소</button>
          </p>
        )}
        {editing && <p className="dr-hint" role="status"><span>자리를 눌러 사용 / 사용 안 함을 바꿉니다. 사용 가능 {usable}석 · 대상 {targets}명</span><button type="button" className="btn btn-sm" onClick={() => setEditing(false)}>완료</button></p>}
        <div className={`dr-board is-seat ${editing ? 'is-editing' : ''}`} ref={boardRef}>
          <div className="dr-desk">칠판 · 교탁</div>
          <div className="dr-seats-wrap">
            <div className="dr-seats" style={{ gridTemplateColumns: `repeat(${layout.cols}, minmax(var(--seat-min), 1fr))` }}>
              {cells.map(cell)}
            </div>
          </div>
          {showResult && view && <p className="dr-boardfoot mono">{grade}학년 {classNo}반 · {fmtTime(view.draw.createdAt)} · 시드 {view.draw.seed.slice(0, 12)}…</p>}
          {!showResult && !editing && !picking && <p className="dr-boardfoot">‘자리 섞기’를 누르면 서버가 배치를 정합니다.</p>}
        </div>
      </div>

      <aside className="dr-side">
        <section className="card dr-panel" aria-labelledby="dr-layout-h">
          <h2 id="dr-layout-h">교실 배치</h2>
          <div className="dr-size">
            <label className="field"><span className="label">줄 (교탁부터)</span>
              <select className="select" value={layout.rows} onChange={(e) => resize(Number(e.target.value), layout.cols)}>{SIZES.map((n) => <option key={n} value={n}>{n}줄</option>)}</select>
            </label>
            <label className="field"><span className="label">한 줄 자리</span>
              <select className="select" value={layout.cols} onChange={(e) => resize(layout.rows, Number(e.target.value))}>{SIZES.map((n) => <option key={n} value={n}>{n}자리</option>)}</select>
            </label>
          </div>
          <button type="button" className={`btn btn-block ${editing ? 'btn-strong' : ''}`} aria-pressed={editing} onClick={() => { setEditing(!editing); setPicking(null); }}>
            {editing ? '자리 편집 끝내기' : '자리 편집 (사용 안 하는 자리)'}
          </button>
          <p className={`muted dr-capacity ${targets > usable ? 'is-bad' : ''}`}>사용 가능 {usable}석 · 대상 {targets}명{layout.disabledSeats.length > 0 && ` · 사용 안 함 ${layout.disabledSeats.length}석`}</p>
        </section>

        <section className="card dr-panel" aria-labelledby="dr-reveal">
          <h2 id="dr-reveal">공개 방식</h2>
          <div className="dr-opts" role="radiogroup" aria-labelledby="dr-reveal">
            <button type="button" role="radio" aria-checked={reveal === 'all'} className={reveal === 'all' ? 'is-on' : ''} onClick={() => setReveal('all')}>일괄 공개</button>
            <button type="button" role="radio" aria-checked={reveal === 'one'} className={reveal === 'one' ? 'is-on' : ''} onClick={() => setReveal('one')}>한 자리씩 뒤집기</button>
          </div>
          <label className="check"><input type="checkbox" checked={avoidPrev} onChange={(e) => setAvoidPrev(e.target.checked)} />직전 자리 중복 방지</label>
          <button type="button" className="btn btn-primary btn-lg btn-block" onClick={shuffleSeats} disabled={busy}>{busy ? '섞는 중…' : '자리 섞기'}</button>
          {view && showResult && view.hidden.size > 0 && (
            <button type="button" className="btn btn-block" onClick={() => setView((v) => (v ? { ...v, hidden: new Set() } : v))}>남은 {view.hidden.size}자리 모두 공개</button>
          )}
          {err && <p className="dr-err" role="alert">{err}</p>}
        </section>

        <section className="card dr-panel">
          <span className="muted dr-seedlabel">검증용 랜덤 시드</span>
          <p className="mono dr-seed">{view ? view.draw.seed : '–'}</p>
          <button type="button" className="btn btn-block" disabled={!view} onClick={() => view && setVerifyId(view.draw.drawId)}>검증 자료</button>
          <div className="dr-2btn">
            <button type="button" className="btn" disabled={!showResult} onClick={() => view && saveSeatPng(view, grade, classNo)}>PNG 저장</button>
            <button type="button" className="btn" disabled={!showResult} onClick={() => window.print()}>인쇄 PDF</button>
          </div>
        </section>

        <History type="SEAT" grade={grade} classNo={classNo} reloadKey={historyKey} activeId={view?.draw.drawId ?? null} onPick={openHistory} />
      </aside>
      {verifyId && <VerifyDialog drawId={verifyId} onClose={() => setVerifyId(null)} />}
    </div>
  );
}

function saveSeatPng(view: SeatView, grade: number, classNo: number) {
  const { rows, cols } = view.layout;
  const off = new Set(view.layout.disabledSeats.map(pkey));
  const byPos = new Map(view.draw.assignments.map((a) => [pkey(a), a]));
  const W = Math.max(900, cols * 200), pad = 56, gap = 18;
  const cw = (W - pad * 2 - gap * (cols - 1)) / cols, ch = 120, top = pad + 96;
  const H = top + rows * (ch + gap) - gap + pad + 40;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const font = getComputedStyle(document.body).fontFamily;
  ctx.fillStyle = '#F3F3EE'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#2F3833'; ctx.beginPath(); ctx.roundRect(W * 0.2, pad, W * 0.6, 56, 6); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = `500 22px ${font}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('칠판 · 교탁', W / 2, pad + 28);
  const nameSize = Math.min(32, Math.max(16, cw / 5));
  for (let r = 1; r <= rows; r++) for (let c = 1; c <= cols; c++) {
    const k = `${r}-${c}`, a = byPos.get(k);
    const x = pad + (c - 1) * (cw + gap), y = top + (r - 1) * (ch + gap);
    ctx.lineWidth = 2;
    if (off.has(k) && !a) {
      ctx.setLineDash([8, 6]); ctx.strokeStyle = '#C9C9C0';
      ctx.beginPath(); ctx.roundRect(x, y, cw, ch, 8); ctx.stroke(); ctx.setLineDash([]);
      continue;
    }
    ctx.fillStyle = a ? '#fff' : '#EAEAE4'; ctx.strokeStyle = '#C9C9C0';
    ctx.beginPath(); ctx.roundRect(x, y, cw, ch, 8); ctx.fill(); ctx.stroke();
    ctx.fillStyle = a ? '#111110' : '#8A8A83';
    ctx.font = `500 22px 'JetBrains Mono', monospace`; ctx.fillText(a ? pad2(a.number) : '–', x + cw / 2, y + 38);
    ctx.font = `700 ${nameSize}px ${font}`; ctx.fillText(a ? a.name : '빈자리', x + cw / 2, y + 82);
    if (a?.fixed) { ctx.font = `500 14px ${font}`; ctx.fillStyle = '#3A5785'; ctx.textAlign = 'right'; ctx.fillText('고정', x + cw - 10, y + 16); ctx.textAlign = 'center'; }
  }
  ctx.fillStyle = '#5A5A55'; ctx.font = `18px ${font}`;
  ctx.fillText(`${grade}학년 ${classNo}반 · ${fmtTime(view.draw.createdAt)} · 시드 ${view.draw.seed}`, W / 2, H - pad / 2 - 8);
  canvas.toBlob((b) => {
    if (!b) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = `자리배치_${grade}학년${classNo}반_${view.draw.seed.slice(0, 8)}.png`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }, 'image/png');
}

/* ======================= 핀볼 ======================= */
function PinballTab({ grade, classNo, roster, excluded, isMine, boardRef }: Ctx) {
  const [mode, setMode] = useState<PinballMode>('DROP');
  const [winnerCount, setWinnerCount] = useState(1);
  const [allowDup, setAllowDup] = useState(false);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [playing, setPlaying] = useState<{ token: number; landed: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [historyKey, setHistoryKey] = useState(0);
  const [verifyId, setVerifyId] = useState<string | null>(null);

  const current = rounds.at(-1) ?? null;
  const chainWinners = useMemo(() => new Set(rounds.flatMap((r) => r.draw.winners.map((w) => w.studentId))), [rounds]);
  const base = roster.filter((s) => !excluded.has(s.studentId));
  const nextPool = (chain: boolean) => base.filter((s) => !chain || allowDup || !chainWinners.has(s.studentId));

  async function run(chain: boolean) {
    setBusy(true); setErr(null);
    const bins = nextPool(chain);
    try {
      const d = await drawPinball({
        grade, classNo, mode, winnerCount,
        excludedStudentIds: [...excluded],
        allowDuplicate: allowDup,
        previousDrawId: chain && current ? current.draw.drawId : null,
      });
      /* 연출용 구획에 당첨자가 반드시 있도록 보정 */
      const binIds = new Set(bins.map((s) => s.studentId));
      const extra = d.winners.filter((w) => !binIds.has(w.studentId)).map((w) => ({ studentId: w.studentId, number: w.number, name: w.name }));
      const finalBins = [...bins, ...extra].sort((a, b) => a.number - b.number);
      setRounds((rs) => (chain ? [...rs, { draw: d, bins: finalBins }] : [{ draw: d, bins: finalBins }]));
      setPlaying({ token: Date.now(), landed: 0 });
      setHistoryKey((k) => k + 1);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function openHistory(id: string) {
    setErr(null);
    try {
      const d = await getDraw(id);
      if (d.type !== 'PINBALL') return;
      const ids = new Set(roster.map((s) => s.studentId));
      const bins = [...roster, ...d.winners.filter((w) => !ids.has(w.studentId))].sort((a, b) => a.number - b.number)
        .map((s) => ({ studentId: s.studentId, number: s.number, name: s.name }));
      setPlaying(null);
      setRounds([{ draw: d, bins }]);
    } catch (e) { setErr(errorMessage(e)); }
  }

  const animating = !!playing;
  const landed = playing ? playing.landed : current?.draw.winners.length ?? 0;
  const pool = nextPool(rounds.length > 0).length;

  return (
    <div className="dr-layout">
      <div className="dr-main">
        <div className="dr-board is-pin" ref={boardRef}>
          <PinballStage
            round={current}
            mode={current?.draw.mode ?? mode}
            playToken={playing?.token ?? null}
            onLand={(n) => setPlaying((p) => (p ? { ...p, landed: n } : p))}
            onDone={() => setPlaying(null)}
            isMine={isMine}
          />
          {animating && <button type="button" className="btn btn-sm dr-skip" onClick={() => setPlaying(null)}>건너뛰기</button>}
        </div>
      </div>

      <aside className="dr-side">
        <section className="card dr-panel" aria-labelledby="dr-pin-h">
          <h2 id="dr-pin-h">핀볼 추첨</h2>
          <div className="seg dr-modes" role="radiogroup" aria-label="연출 모드">
            {(['DROP', 'BUMPER'] as PinballMode[]).map((m) => (
              <button key={m} type="button" role="radio" aria-checked={mode === m} className={mode === m ? 'is-on' : ''} onClick={() => setMode(m)}>{PINBALL_MODE_LABEL[m]}</button>
            ))}
          </div>
          <label className="field"><span className="label">당첨 인원 <span className="mono">대상 {pool}명</span></span>
            <input className="input" type="number" min={1} max={Math.max(1, base.length)} value={winnerCount}
              onChange={(e) => setWinnerCount(Math.max(1, Math.floor(Number(e.target.value) || 1)))} />
          </label>
          <label className="check"><input type="checkbox" checked={allowDup} onChange={(e) => setAllowDup(e.target.checked)} />이미 뽑힌 학생도 다시 뽑기</label>
          <button type="button" className="btn btn-primary btn-lg btn-block" disabled={busy || animating} onClick={() => run(false)}>{busy ? '추첨 중…' : '새로 뽑기'}</button>
          <button type="button" className="btn btn-block" disabled={busy || animating || !current} onClick={() => run(true)}>이어서 뽑기{rounds.length > 0 && ` (${rounds.length + 1}회차)`}</button>
          {err && <p className="dr-err" role="alert">{err}</p>}
        </section>

        <section className="card dr-panel" aria-labelledby="dr-win-h">
          <h2 id="dr-win-h">당첨자</h2>
          {rounds.length === 0 ? <p className="muted">아직 추첨하지 않았습니다.</p> : (
            <div className="dr-rounds">
              {[...rounds].reverse().map((r, ri) => {
                const isCur = ri === 0;
                const shown = isCur ? r.draw.winners.slice(0, landed) : r.draw.winners;
                return (
                  <div key={r.draw.drawId} className="dr-round">
                    <span className="muted dr-roundh">{rounds.length - ri}회차 · {PINBALL_MODE_LABEL[r.draw.mode]} · 대상 {r.draw.candidateCount}명</span>
                    <ol className="dr-winners">
                      {shown.map((w) => (
                        <li key={w.order} className={isMine(w.number) ? 'is-me' : ''}><span className="dr-order">{w.order}</span><span className="mono muted">{pad2(w.number)}</span> <b>{w.name}</b></li>
                      ))}
                      {isCur && shown.length < r.draw.winners.length && <li className="muted">추첨 중…</li>}
                    </ol>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="card dr-panel">
          <span className="muted dr-seedlabel">검증용 랜덤 시드</span>
          <p className="mono dr-seed">{current ? current.draw.seed : '–'}</p>
          <button type="button" className="btn btn-block" disabled={!current} onClick={() => current && setVerifyId(current.draw.drawId)}>검증 자료</button>
        </section>

        <History type="PINBALL" grade={grade} classNo={classNo} reloadKey={historyKey} activeId={current?.draw.drawId ?? null} onPick={openHistory} />
      </aside>
      {verifyId && <VerifyDialog drawId={verifyId} onClose={() => setVerifyId(null)} />}
    </div>
  );
}

/* 핀볼 연출: seed로 공의 경로를 만들되, 마지막 도착 구획은 서버 당첨자에 맞춤 */
function PinballStage({ round, mode, playToken, onLand, onDone, isMine }: {
  round: Round | null; mode: PinballMode; playToken: number | null;
  onLand: (n: number) => void; onDone: () => void; isMine: (num: number) => boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 600, h: 420 });
  const cb = useRef({ onLand, onDone, isMine });
  cb.current = { onLand, onDone, isMine };
  const landedRef = useRef(0);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = Math.max(240, el.clientWidth);
      const full = document.fullscreenElement?.contains(el);
      const h = full ? Math.max(320, el.clientHeight) : Math.round(Math.min(520, Math.max(300, w * 0.72)));
      setSize((s) => (s.w === w && s.h === h ? s : { w, h }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const bins = useMemo(() => round?.bins ?? [], [round]);
  const winners = useMemo(() => round?.draw.winners ?? [], [round]);

  /* 정적 요소 위치 */
  const geo = useMemo(() => {
    const { w: W, h: H } = size;
    const binH = 52, top = 40, bottom = H - binH - 24;
    const n = Math.max(1, bins.length);
    const binW = W / n;
    const pegs: { x: number; y: number; r: number }[] = [];
    if (mode === 'DROP') {
      const rows = 8, gapY = (bottom - top) / rows, cols = Math.max(5, Math.min(14, Math.round(W / 46)));
      for (let r = 0; r < rows; r++) {
        const off = r % 2 ? 0.5 : 0;
        for (let c = 0; c <= cols; c++) {
          const x = ((c + off) / cols) * W;
          if (x > 8 && x < W - 8) pegs.push({ x, y: top + gapY * (r + 0.6), r: 3.5 });
        }
      }
    } else {
      const spots = [[0.25, 0.22], [0.5, 0.16], [0.75, 0.22], [0.37, 0.42], [0.63, 0.42], [0.2, 0.62], [0.5, 0.6], [0.8, 0.62]];
      spots.forEach(([fx, fy]) => pegs.push({ x: fx * W, y: top + fy * (bottom - top) / 0.8, r: Math.max(12, W / 32) }));
    }
    return { W, H, binH, binW, top, bottom, pegs };
  }, [size, bins.length, mode]);

  /* 그리기 */
  const draw = (ball: { x: number; y: number } | null, landedN: number, banner: string | null) => {
    const cv = canvasRef.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    const { W, H, binH, binW, pegs } = geo;
    if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    if (cv.height !== Math.round(H * dpr)) cv.height = Math.round(H * dpr);
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const css = getComputedStyle(document.documentElement);
    const v = (n: string, f: string) => css.getPropertyValue(n).trim() || f;
    const accent = v('--accent', '#4A6FA5'), wash = v('--accent-wash', '#EEF2F8'), rule = v('--rule-strong', '#C9C9C0');
    const ink = v('--ink', '#111110'), faint = v('--faint', '#8A8A83'), surface = v('--surface', '#fff');
    const font = getComputedStyle(document.body).fontFamily;
    ctx.clearRect(0, 0, W, H);

    pegs.forEach((p) => {
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = mode === 'BUMPER' ? wash : rule; ctx.fill();
      if (mode === 'BUMPER') { ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.stroke(); }
    });

    const winOrder = new Map(winners.slice(0, landedN).map((w) => [w.studentId, w.order]));
    const by = H - binH - 8;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    bins.forEach((s, i) => {
      const x = i * binW, o = winOrder.get(s.studentId);
      ctx.fillStyle = o ? accent : surface; ctx.strokeStyle = rule; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.rect(x + 1, by, binW - 2, binH); ctx.fill(); ctx.stroke();
      const fs = Math.max(9, Math.min(14, binW * 0.42));
      ctx.fillStyle = o ? '#fff' : cb.current.isMine(s.number) ? accent : ink;
      ctx.font = `600 ${fs}px 'JetBrains Mono', monospace`;
      ctx.fillText(pad2(s.number), x + binW / 2, by + binH / 2 - (o ? 8 : 0));
      if (o) { ctx.font = `700 ${Math.max(9, fs - 2)}px ${font}`; ctx.fillText(`${o}등`, x + binW / 2, by + binH / 2 + 10); }
    });
    if (bins.length === 0) {
      ctx.fillStyle = faint; ctx.font = `15px ${font}`;
      ctx.fillText('‘새로 뽑기’를 누르면 서버가 당첨자를 정하고 공이 떨어집니다.', W / 2, H / 2, W - 32);
    }
    if (ball) {
      ctx.beginPath(); ctx.arc(ball.x, ball.y, 9, 0, Math.PI * 2);
      ctx.fillStyle = ink; ctx.fill();
      ctx.beginPath(); ctx.arc(ball.x - 3, ball.y - 3, 3, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.fill();
    }
    if (banner) {
      ctx.font = `700 ${Math.min(26, W / 18)}px ${font}`;
      const tw = Math.min(W - 24, ctx.measureText(banner).width + 32);
      ctx.fillStyle = 'rgba(17,17,16,.82)'; ctx.beginPath(); ctx.roundRect(W / 2 - tw / 2, 8, tw, 40, 8); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillText(banner, W / 2, 28, W - 40);
    }
  };

  /* 정적 상태 다시 그리기 */
  useEffect(() => {
    if (playToken !== null) return;
    const last = winners.at(-1);
    draw(null, winners.length, last ? (winners.length === 1 ? `당첨 ${pad2(last.number)} ${last.name}` : `당첨 ${winners.length}명`) : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo, winners, playToken]);

  /* 애니메이션 */
  useEffect(() => {
    if (playToken === null || !round) return;
    landedRef.current = 0;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { cb.current.onLand(winners.length); cb.current.onDone(); return; }
    const { W, H, binH, binW, top, bottom } = geo;
    const idx = new Map(bins.map((s, i) => [s.studentId, i]));
    const paths = winners.map((w) => {
      const rand = mulberry32(hashString(`${round.draw.seed}:${w.order}`));
      const target = (idx.get(w.studentId) ?? 0) * binW + binW / 2;
      const x0 = W / 2 + (rand() - 0.5) * W * 0.3;
      const steps = mode === 'DROP' ? 9 : 7;
      const pts = [{ x: x0, y: 12 }];
      for (let i = 1; i < steps; i++) {
        const t = i / steps;
        const amp = mode === 'DROP' ? W * 0.18 : W * 0.42;
        const x = x0 + (target - x0) * t * t + (rand() - 0.5) * amp * (1 - t);
        pts.push({ x: Math.min(W - 10, Math.max(10, x)), y: top + (bottom - top) * (mode === 'DROP' ? t : Math.pow(t, 0.8)) });
      }
      pts.push({ x: target, y: H - binH - 18 });
      pts.push({ x: target, y: H - binH / 2 - 8 });
      return pts;
    });
    const seg = mode === 'DROP' ? 120 : 150, hold = 650;
    const perBall = (n: number) => (paths[n].length - 1) * seg + hold;
    let raf = 0, start = performance.now(), ball = 0;
    const tick = (now: number) => {
      const el = now - start;
      const pts = paths[ball];
      const moveDur = (pts.length - 1) * seg;
      if (el >= perBall(ball)) {
        ball++;
        if (ball >= paths.length) { cb.current.onDone(); return; }
        start = now;
        raf = requestAnimationFrame(tick);
        return;
      }
      if (el < moveDur) {
        const i = Math.floor(el / seg), u = (el % seg) / seg;
        const a = pts[i], b = pts[i + 1];
        const e = u * u; // 낙하 가속 느낌
        const hop = Math.sin(Math.PI * u) * (mode === 'DROP' ? 6 : 14);
        draw({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * e - hop }, ball, ball > 0 ? `${winners[ball - 1].order}등 ${pad2(winners[ball - 1].number)} ${winners[ball - 1].name}` : `${winners.length}명 추첨`);
      } else {
        if (landedRef.current < ball + 1) { landedRef.current = ball + 1; cb.current.onLand(ball + 1); }
        const w = winners[ball];
        draw(null, ball + 1, `${w.order}등 ${pad2(w.number)} ${w.name}`);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playToken]);

  return (
    <div className="dr-stage" ref={wrapRef}>
      <canvas ref={canvasRef} style={{ width: size.w, height: size.h }} role="img"
        aria-label={winners.length ? `핀볼 결과: ${winners.map((w) => `${w.order}등 ${w.name}`).join(', ')}` : '핀볼 판'} />
    </div>
  );
}

/* ======================= 공용: 히스토리 · 검증 ======================= */
function History({ type, grade, classNo, reloadKey, activeId, onPick }: {
  type: DrawType; grade: number; classNo: number; reloadKey: number; activeId: string | null; onPick: (id: string) => void;
}) {
  const { state } = useAsync((s) => getDraws({ grade, classNo, type, limit: 10 }, s), [grade, classNo, type, reloadKey]);
  return (
    <section className="card dr-panel" aria-labelledby={`dr-hist-${type}`}>
      <h2 id={`dr-hist-${type}`}>최근 기록</h2>
      {state.status === 'loading' ? <p className="muted">불러오는 중…</p>
        : state.status === 'error' ? <p className="dr-err">기록을 불러오지 못했습니다. ({state.message})</p>
          : state.data.items.length === 0 ? <p className="muted">아직 기록이 없습니다.</p>
            : (
              <ul className="dr-hist">
                {state.data.items.map((d) => (
                  <li key={d.drawId}>
                    <button type="button" className={d.drawId === activeId ? 'is-on' : ''} onClick={() => onPick(d.drawId)} aria-current={d.drawId === activeId}>
                      <span className="mono">{fmtTime(d.createdAt)}</span>
                      <span className="dr-histsum">{d.mode ? `${PINBALL_MODE_LABEL[d.mode]} · ` : ''}{d.summary}</span>
                      <span className="muted">{d.createdBy}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
    </section>
  );
}

function VerifyDialog({ drawId, onClose }: { drawId: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const { state } = useAsync((s) => getDrawVerification(drawId, s), [drawId]);
  useEffect(() => { ref.current?.showModal(); }, []);
  return (
    <dialog ref={ref} className="dr-dialog" onClose={onClose} aria-labelledby="dr-verify-h">
      <div className="dr-dialog-head">
        <h2 id="dr-verify-h">검증 자료</h2>
        <button type="button" className="btn btn-sm" onClick={() => ref.current?.close()}>닫기</button>
      </div>
      <p className="muted">같은 입력과 시드로 공개된 알고리즘을 돌리면 누구나 같은 결과를 얻을 수 있습니다.</p>
      {state.status === 'loading' ? <p className="status-msg">불러오는 중…</p>
        : state.status === 'error' ? <p className="dr-err" role="alert">{state.message}</p>
          : (
            <dl className="dr-verify">
              <dt>뽑기 ID</dt><dd className="mono">{state.data.drawId}</dd>
              <dt>시드</dt><dd className="mono">{state.data.seed}</dd>
              <dt>알고리즘</dt><dd>{state.data.algorithm}</dd>
              <dt>대상 번호 (오름차순)</dt><dd className="mono">{state.data.input.candidates.join(', ')}</dd>
              <dt>옵션</dt><dd><pre className="mono">{JSON.stringify(state.data.input.options, null, 2)}</pre></dd>
              <dt>결과</dt><dd className="mono">{state.data.result.map((x) => (x === null ? '–' : String(x))).join(', ')}</dd>
              <dt>결과 해시 (SHA-256)</dt><dd className="mono">{state.data.resultHash}</dd>
            </dl>
          )}
      <button type="button" className="btn btn-block" disabled={state.status !== 'ok'}
        onClick={() => state.status === 'ok' && navigator.clipboard?.writeText(JSON.stringify(state.data, null, 2))}>JSON 복사</button>
    </dialog>
  );
}
