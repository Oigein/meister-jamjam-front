import { USE_MOCK, mock, request } from './client';
import { mulberry32 } from '../lib/random';

export interface RankRow { id: string; rank: number; name: string; grade: number; cls: number; num: number; total: number; isMe?: boolean; }
export interface RankingPage {
  rows: RankRow[];
  count: number;
  maxScore: number;
  me: { rank: number; total: number; gap: number | null } | null;
}
export interface RankingQuery { grade: number; page: number; size: number; }

export function getRanking(q: RankingQuery, signal?: AbortSignal): Promise<RankingPage> {
  if (!USE_MOCK) return request(`/ranking?grade=${q.grade}&page=${q.page}&size=${q.size}`, { signal });

  const pool = mockStudents().filter((s) => !q.grade || s.grade === q.grade);
  pool.sort((a, b) => b.total - a.total || a.grade - b.grade || a.cls - b.cls || a.num - b.num);
  // 동점이면 같은 순위 (1, 2, 2, 4 …)
  const ranked: RankRow[] = [];
  pool.forEach((s, i) => ranked.push({ ...s, rank: i > 0 && s.total === pool[i - 1].total ? ranked[i - 1].rank : i + 1 }));

  const mine = ranked.find((r) => r.isMe);
  const above = mine && [...ranked].reverse().find((r) => r.total > mine.total);
  return mock({
    rows: ranked.slice((q.page - 1) * q.size, q.page * q.size),
    count: ranked.length,
    maxScore: ranked[0]?.total ?? 1,
    me: mine ? { rank: mine.rank, total: mine.total, gap: above ? above.total - mine.total : null } : null,
  });
}

/* ---------- 목업 데이터 (192명) ---------- */
const SURNAMES = '김이박최정강조윤장임한오서신권황안송홍전'.split('');
const GIVEN = ['민준', '서연', '도윤', '하은', '시우', '지우', '하린', '은호', '수아', '가은', '준서', '다은', '지호', '채원', '승민', '유진', '태윤', '소율', '서윤', '재원', '다온', '시윤', '예준', '주원'];

let cache: Omit<RankRow, 'rank'>[] | null = null;
function mockStudents() {
  if (!cache) {
    const rand = mulberry32(20261029);
    cache = [];
    for (let g = 1; g <= 3; g++) for (let c = 1; c <= 4; c++) for (let n = 1; n <= 16; n++) {
      const id = `${g}${c}${String(n).padStart(2, '0')}`;
      if (id === '2109') { cache.push({ id, name: '손범수', grade: g, cls: c, num: n, total: 452, isMe: true }); continue; }
      const name = SURNAMES[Math.floor(rand() * SURNAMES.length)] + GIVEN[Math.floor(rand() * GIVEN.length)];
      const base = g === 3 ? 390 : g === 2 ? 330 : 220;
      cache.push({ id, name, grade: g, cls: c, num: n, total: Math.round((base + rand() * 170) / 2) * 2 });
    }
  }
  return cache.map((s) => ({ ...s }));
}

/* 다른 목업(학생 상세, 점수 부여)에서 학번으로 학생 찾기 */
export const findMockStudent = (id: string) => mockStudents().find((s) => s.id === id) ?? null;
