/*
 * 핀볼 · 자리뽑기 목업 (docs/api/11-draw.md)
 * - 시드는 서버(목업)가 crypto.getRandomValues로 생성 → FNV-1a 32bit 해시로 mulberry32 초기화 → Fisher-Yates
 * - 입력·시드·결과를 함께 저장해 검증 API로 공개
 */
import { fail, route, validationFail } from '../server';
import { TEACHER_KIM, currentUser, findStudent, isTeacherRole, isoKST, students, users, uuid, type MockStudent } from '../db';
import { hashString, mulberry32, shuffle } from '../../../lib/random';

type Pos = { row: number; col: number };
interface Layout { rows: number; cols: number; groupShape: string | null; disabledSeats: Pos[] }
interface Assignment extends Pos { studentId: string; number: number; name: string; fixed: boolean }
interface Winner { order: number; studentId: string; number: number; name: string }

interface StoredBase {
  drawId: string; grade: number; classNo: number; seed: string; createdBy: string; createdAt: string;
  verification: { algorithm: string; candidates: number[]; options: Record<string, unknown>; result: unknown[] };
}
interface StoredSeat extends StoredBase { type: 'SEAT'; layout: Layout; assignments: Assignment[]; emptySeats: Pos[]; warnings: string[] }
interface StoredPinball extends StoredBase { type: 'PINBALL'; mode: 'DROP' | 'BUMPER'; candidateCount: number; winners: Winner[]; previousDrawId: string | null }
type Stored = StoredSeat | StoredPinball;

const draws: Stored[] = []; // 최신이 앞

const SEAT_ALGORITHM = '목업: FNV-1a(seed) → mulberry32 PRNG + Fisher-Yates (사용 가능한 빈 자리 목록을 셔플한 뒤 번호순 학생에게 차례로 배정, 직전 자리 회피 시 같은 난수열로 최대 100회 재셔플), mock-v1';
const PINBALL_ALGORITHM = '목업: FNV-1a(seed) → mulberry32 PRNG + Fisher-Yates (번호순 후보를 셔플한 뒤 앞에서 winnerCount명), mock-v1';

/* ---------- 공통 도우미 ---------- */
function newServerSeed() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const prng = (seed: string) => mulberry32(hashString(seed));
const key = (p: Pos) => `${p.row}-${p.col}`;
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const userName = (id: string) => users.find((u) => u.userId === id)?.name ?? '알 수 없음';

function roster(grade: unknown, classNo: unknown): MockStudent[] {
  const g = Number(grade), c = Number(classNo);
  if (!Number.isInteger(g) || !Number.isInteger(c) || g < 1 || g > 3 || c < 1 || c > 4) {
    fail(404, 'CLASS_NOT_FOUND', '존재하지 않는 학급입니다. (학년 1~3, 반 1~4)');
  }
  return students.filter((s) => s.grade === g && s.classNo === c).sort((a, b) => a.number - b.number);
}

/* 교사 · 해당 학급 학생만 뽑기 가능 */
function assertCanDraw(grade: number, classNo: number) {
  const u = currentUser();
  if (isTeacherRole(u)) return;
  const s = findStudent(u.userId);
  if (!s || s.grade !== grade || s.classNo !== classNo) fail(403, 'FORBIDDEN', '우리 반 뽑기만 할 수 있습니다. 다른 학급은 담당 교사에게 요청하세요.');
}

function idList(v: unknown, field: string): string[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) validationFail([{ field, reason: 'INVALID', message: '학생 ID 목록 형식이 아닙니다.' }]);
  return [...new Set(v as string[])];
}

function assertInRoster(ids: string[], list: MockStudent[]) {
  const inClass = new Set(list.map((s) => s.studentId));
  const bad = ids.filter((id) => !inClass.has(id));
  if (bad.length) fail(400, 'STUDENT_NOT_IN_CLASS', '학급 명단에 없는 학생이 포함되어 있습니다.', { studentIds: bad });
}

async function sha256Hex(text: string) {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return hashString(text).toString(16).padStart(8, '0'); // 보안 컨텍스트가 아닐 때(목업 전용)
  }
}

/* ---------- 자리 배치 계산 ---------- */
function computeSeats(list: MockStudent[], layout: Layout, excluded: string[], fixed: (Pos & { studentId: string })[], seed: string, prev: StoredSeat | null, avoidPreviousSeat = !!prev) {
  const exSet = new Set(excluded);
  const candidates = list.filter((s) => !exSet.has(s.studentId)); // 번호 오름차순
  const fixedIds = new Set(fixed.map((f) => f.studentId));
  const disabled = new Set(layout.disabledSeats.map(key));
  const fixedSeatKeys = new Set(fixed.map(key));

  const freeSeats: Pos[] = [];
  for (let r = 1; r <= layout.rows; r++) for (let c = 1; c <= layout.cols; c++) {
    const p = { row: r, col: c };
    if (!disabled.has(key(p)) && !fixedSeatKeys.has(key(p))) freeSeats.push(p);
  }
  const freeStudents = candidates.filter((s) => !fixedIds.has(s.studentId));
  if (freeStudents.length > freeSeats.length) {
    fail(400, 'NOT_ENOUGH_SEATS', `배치할 학생(${candidates.length}명)이 사용 가능한 자리(${freeSeats.length + fixed.length}석)보다 많습니다.`);
  }

  const prevSeat = new Map<string, string>(); // studentId → "r-c"
  if (prev) for (const a of prev.assignments) prevSeat.set(a.studentId, key(a));
  const conflicts = (perm: Pos[]) => freeStudents.reduce((n, s, i) => n + (prevSeat.get(s.studentId) === key(perm[i]) ? 1 : 0), 0);

  const rand = prng(seed);
  let best: Pos[] = [];
  let bestConflicts = Infinity;
  let attempts = 0;
  const maxAttempts = prev ? 100 : 1;
  for (let i = 0; i < maxAttempts; i++) {
    attempts++;
    const perm = shuffle([...freeSeats], rand);
    const n = prev ? conflicts(perm) : 0;
    if (n < bestConflicts) { best = perm; bestConflicts = n; }
    if (n === 0) break;
  }

  const byId = new Map(list.map((s) => [s.studentId, s]));
  const assignments: Assignment[] = [
    ...fixed.map((f) => { const s = byId.get(f.studentId)!; return { row: f.row, col: f.col, studentId: s.studentId, number: s.number, name: s.name, fixed: true }; }),
    ...freeStudents.map((s, i) => ({ row: best[i].row, col: best[i].col, studentId: s.studentId, number: s.number, name: s.name, fixed: false })),
  ].sort((a, b) => a.row - b.row || a.col - b.col);
  const emptySeats = best.slice(freeStudents.length).sort((a, b) => a.row - b.row || a.col - b.col);
  const warnings = prev && bestConflicts > 0 ? ['PREVIOUS_SEAT_UNAVOIDABLE'] : [];

  /* 검증 자료: 번호만 */
  const byKey = new Map(assignments.map((a) => [key(a), a.number]));
  const result: (number | null)[] = [];
  for (let r = 1; r <= layout.rows; r++) for (let c = 1; c <= layout.cols; c++) {
    if (!disabled.has(key({ row: r, col: c }))) result.push(byKey.get(key({ row: r, col: c })) ?? null);
  }
  const options = {
    rows: layout.rows,
    cols: layout.cols,
    groupShape: layout.groupShape,
    disabledSeats: layout.disabledSeats,
    fixedSeats: fixed.map((f) => ({ number: byId.get(f.studentId)!.number, row: f.row, col: f.col })).sort((a, b) => a.number - b.number),
    avoidPreviousSeat,
    previousDrawId: prev?.drawId ?? null,
    previousSeats: prev ? prev.assignments.filter((a) => !a.fixed).map((a) => ({ number: a.number, row: a.row, col: a.col })).sort((a, b) => a.number - b.number) : [],
    attempts,
    resultFormat: '사용하는 자리(disabledSeats 제외)를 행→열 순으로 나열한 학생 번호, 빈자리는 null',
  };
  return { assignments, emptySeats, warnings, verification: { algorithm: SEAT_ALGORITHM, candidates: candidates.map((s) => s.number), options, result } };
}

function parseLayout(v: unknown): Layout {
  const l = (v ?? {}) as Record<string, unknown>;
  const errs = [];
  if (!isInt(l.rows) || l.rows < 1 || l.rows > 10) errs.push({ field: 'layout.rows', reason: 'OUT_OF_RANGE', message: '줄 수는 1~10이어야 합니다.' });
  if (!isInt(l.cols) || l.cols < 1 || l.cols > 10) errs.push({ field: 'layout.cols', reason: 'OUT_OF_RANGE', message: '칸 수는 1~10이어야 합니다.' });
  if (errs.length) validationFail(errs);
  const rows = l.rows as number, cols = l.cols as number;
  const ds = Array.isArray(l.disabledSeats) ? (l.disabledSeats as Pos[]) : [];
  const seen = new Set<string>();
  const disabledSeats = ds
    .filter((p) => isInt(p?.row) && isInt(p?.col) && p.row >= 1 && p.row <= rows && p.col >= 1 && p.col <= cols)
    .filter((p) => (seen.has(key(p)) ? false : (seen.add(key(p)), true)))
    .map((p) => ({ row: p.row, col: p.col }));
  return { rows, cols, groupShape: typeof l.groupShape === 'string' ? l.groupShape : null, disabledSeats };
}

const prevSeatDraw = (grade: number, classNo: number) =>
  (draws.find((d) => d.type === 'SEAT' && d.grade === grade && d.classNo === classNo) as StoredSeat | undefined) ?? null;

const seatResponse = (d: StoredSeat) => ({
  drawId: d.drawId, type: d.type, grade: d.grade, classNo: d.classNo, seed: d.seed, layout: d.layout,
  assignments: d.assignments, emptySeats: d.emptySeats, warnings: d.warnings, createdAt: d.createdAt,
});
const pinballResponse = (d: StoredPinball) => ({
  drawId: d.drawId, type: d.type, mode: d.mode, grade: d.grade, classNo: d.classNo, seed: d.seed,
  candidateCount: d.candidateCount, winners: d.winners, previousDrawId: d.previousDrawId, createdAt: d.createdAt,
});

/* ---------- 예시 이력: 2학년 1반 지난 자리 배치 (직전 자리 중복 방지 확인용) ---------- */
{
  const list = roster(2, 1);
  const layout: Layout = { rows: 5, cols: 4, groupShape: null, disabledSeats: [] };
  const seed = '5eed0000c0ffee00a1b2c3d4e5f60718';
  const r = computeSeats(list, layout, [], [], seed, null);
  const d = new Date(); d.setDate(d.getDate() - 28); d.setHours(9, 10, 0, 0);
  draws.push({ drawId: uuid(), type: 'SEAT', grade: 2, classNo: 1, seed, layout, ...r, createdBy: TEACHER_KIM, createdAt: isoKST(d) });
}

/* ---------- 라우트 ---------- */
route('GET', '/api/classes/:grade/:classNo/students', ({ params }) => {
  const list = roster(params.grade, params.classNo);
  return {
    grade: Number(params.grade),
    classNo: Number(params.classNo),
    students: list.map((s) => ({ studentId: s.studentId, number: s.number, name: s.name })),
  };
});

route('POST', '/api/draws/seats', ({ body }) => {
  const b = (body ?? {}) as Record<string, unknown>;
  const list = roster(b.grade, b.classNo);
  const grade = Number(b.grade), classNo = Number(b.classNo);
  assertCanDraw(grade, classNo);
  const layout = parseLayout(b.layout);
  const excluded = idList(b.excludedStudentIds, 'excludedStudentIds');

  const rawFixed = b.fixedSeats ?? [];
  if (!Array.isArray(rawFixed)) validationFail([{ field: 'fixedSeats', reason: 'INVALID', message: '고정 자리 형식이 아닙니다.' }]);
  const fixed = (rawFixed as Record<string, unknown>[]).map((f) => ({ studentId: String(f?.studentId ?? ''), row: Number(f?.row), col: Number(f?.col) }));
  assertInRoster([...excluded, ...fixed.map((f) => f.studentId)], list);

  const disabled = new Set(layout.disabledSeats.map(key));
  const seatSeen = new Set<string>(), stuSeen = new Set<string>();
  for (const f of fixed) {
    const outOfRange = !isInt(f.row) || !isInt(f.col) || f.row < 1 || f.row > layout.rows || f.col < 1 || f.col > layout.cols;
    if (outOfRange) fail(400, 'FIXED_SEAT_CONFLICT', `고정 자리(${f.row}줄 ${f.col}번째)가 교실 범위를 벗어났습니다.`);
    if (disabled.has(key(f))) fail(400, 'FIXED_SEAT_CONFLICT', `고정 자리(${f.row}줄 ${f.col}번째)는 사용하지 않는 자리입니다.`);
    if (seatSeen.has(key(f))) fail(400, 'FIXED_SEAT_CONFLICT', `한 자리(${f.row}줄 ${f.col}번째)에 학생 두 명을 고정할 수 없습니다.`);
    if (stuSeen.has(f.studentId)) fail(400, 'FIXED_SEAT_CONFLICT', '한 학생을 두 자리에 고정할 수 없습니다.');
    if (excluded.includes(f.studentId)) fail(400, 'FIXED_SEAT_CONFLICT', '제외한 학생은 고정할 수 없습니다.');
    seatSeen.add(key(f)); stuSeen.add(f.studentId);
  }

  const prev = b.avoidPreviousSeat === true ? prevSeatDraw(grade, classNo) : null;
  const seed = newServerSeed();
  const r = computeSeats(list, layout, excluded, fixed, seed, prev, b.avoidPreviousSeat === true);
  const d: StoredSeat = { drawId: uuid(), type: 'SEAT', grade, classNo, seed, layout, ...r, createdBy: currentUser().userId, createdAt: isoKST() };
  draws.unshift(d);
  return seatResponse(d);
});

route('POST', '/api/draws/pinball', ({ body }) => {
  const b = (body ?? {}) as Record<string, unknown>;
  const list = roster(b.grade, b.classNo);
  const grade = Number(b.grade), classNo = Number(b.classNo);
  assertCanDraw(grade, classNo);
  if (b.mode !== 'DROP' && b.mode !== 'BUMPER') validationFail([{ field: 'mode', reason: 'INVALID', message: '모드는 DROP 또는 BUMPER입니다.' }]);
  if (!isInt(b.winnerCount) || b.winnerCount < 1) validationFail([{ field: 'winnerCount', reason: 'OUT_OF_RANGE', message: '당첨 인원은 1명 이상이어야 합니다.' }]);
  const excluded = idList(b.excludedStudentIds, 'excludedStudentIds');
  assertInRoster(excluded, list);
  const allowDuplicate = b.allowDuplicate === true;
  const winnerCount = b.winnerCount as number;

  /* 연속 추첨: previousDrawId부터 이어진 체인의 당첨자 */
  const previousDrawId = typeof b.previousDrawId === 'string' && b.previousDrawId ? b.previousDrawId : null;
  const chainWinners = new Set<string>();
  if (previousDrawId) {
    const p = draws.find((d) => d.drawId === previousDrawId);
    if (!p || p.type !== 'PINBALL' || p.grade !== grade || p.classNo !== classNo) {
      fail(400, 'INVALID_PREVIOUS_DRAW', '이어서 뽑을 수 없는 이전 결과입니다. (같은 학급의 핀볼 결과만 가능)');
    }
    for (let cur: StoredPinball | undefined = p as StoredPinball; cur; ) {
      cur.winners.forEach((w) => chainWinners.add(w.studentId));
      const prevId: string | null = cur.previousDrawId;
      cur = prevId ? (draws.find((d) => d.drawId === prevId && d.type === 'PINBALL') as StoredPinball | undefined) : undefined;
    }
  }

  const exSet = new Set(excluded);
  const candidates = list.filter((s) => !exSet.has(s.studentId) && (allowDuplicate || !chainWinners.has(s.studentId)));
  if (candidates.length < winnerCount) {
    fail(400, 'NOT_ENOUGH_CANDIDATES', `추첨 대상(${candidates.length}명)이 당첨 인원(${winnerCount}명)보다 적습니다.`);
  }

  const seed = newServerSeed();
  const picked = shuffle([...candidates], prng(seed)).slice(0, winnerCount);
  const winners: Winner[] = picked.map((s, i) => ({ order: i + 1, studentId: s.studentId, number: s.number, name: s.name }));
  const d: StoredPinball = {
    drawId: uuid(), type: 'PINBALL', mode: b.mode as 'DROP' | 'BUMPER', grade, classNo, seed, candidateCount: candidates.length, winners, previousDrawId,
    createdBy: currentUser().userId, createdAt: isoKST(),
    verification: {
      algorithm: PINBALL_ALGORITHM,
      candidates: candidates.map((s) => s.number),
      options: { mode: b.mode, winnerCount, allowDuplicate, previousDrawId },
      result: winners.map((w) => w.number),
    },
  };
  draws.unshift(d);
  return pinballResponse(d);
});

route('GET', '/api/draws', ({ query }) => {
  const g = query.get('grade'), c = query.get('classNo'), type = query.get('type');
  if (type && type !== 'SEAT' && type !== 'PINBALL') validationFail([{ field: 'type', reason: 'INVALID', message: '종류는 SEAT 또는 PINBALL입니다.' }]);
  let limit = Number(query.get('limit') ?? 10);
  if (!Number.isInteger(limit) || limit < 1) limit = 10;
  limit = Math.min(limit, 50);
  const items = draws
    .filter((d) => (!g || d.grade === Number(g)) && (!c || d.classNo === Number(c)) && (!type || d.type === type))
    .slice(0, limit)
    .map((d) => ({
      drawId: d.drawId,
      type: d.type,
      mode: d.type === 'PINBALL' ? d.mode : null,
      createdBy: userName(d.createdBy),
      createdAt: d.createdAt,
      summary: d.type === 'SEAT' ? `${d.assignments.length}명 배치` : d.winners.map((w) => w.name).join(', '),
    }));
  return { items };
});

const findDraw = (id: string) => draws.find((d) => d.drawId === id) ?? fail(404, 'DRAW_NOT_FOUND', '뽑기 결과를 찾을 수 없습니다.');

route('GET', '/api/draws/:drawId', ({ params }) => {
  const d = findDraw(params.drawId);
  return d.type === 'SEAT' ? seatResponse(d) : pinballResponse(d);
});

route('GET', '/api/draws/:drawId/verification', async ({ params }) => {
  const d = findDraw(params.drawId);
  const v = d.verification;
  return {
    drawId: d.drawId,
    seed: d.seed,
    algorithm: v.algorithm,
    input: { candidates: v.candidates, options: v.options },
    result: v.result,
    resultHash: await sha256Hex(JSON.stringify(v.result)),
  };
});
