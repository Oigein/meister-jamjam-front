import { USE_MOCK, mock, post, request } from './client';
import { daysUntil, ddayLabel } from '../lib/format';

export type Scope = '교내' | '교외';
export interface Contest { id: string; scope: Scope; category: string; title: string; deadline: string; expected: number; examWarning?: string; }
export type NewContest = Omit<Contest, 'id'>;

export type RecMode = 'value' | 'high' | 'short';
export interface Recommendation { contestId: string; title: string; deadline: string; expected: number; reason: string; difficulty: number; efficiency: number; }
export interface RecommendationData { contextLine: string; items: Recommendation[]; }
export interface AskAnswer { text: string; contestIds: string[]; }

export const getContests = (signal?: AbortSignal) =>
  USE_MOCK ? mock(MOCK_CONTESTS) : request<Contest[]>('/contests', { signal });

export const getRecommendations = (mode: RecMode, signal?: AbortSignal) =>
  USE_MOCK ? mock(mockRecommend(mode), 250) : request<RecommendationData>(`/contests/recommendations?mode=${mode}`, { signal });

/* LLM 질문 — 반드시 백엔드가 LLM을 호출 (API 키를 브라우저에 두지 않기 위해) */
export const askContest = (question: string) =>
  USE_MOCK ? mock(mockAsk(question), 700) : post<AskAnswer>('/contests/ask', { question });

export async function createContest(input: NewContest): Promise<Contest> {
  if (!USE_MOCK) return post<Contest>('/contests', input);
  const c = { ...input, id: `c${Date.now()}` };
  MOCK_CONTESTS.push(c);
  return mock(c);
}

/* ---------- 목업 ---------- */
const MOCK_CONTESTS: Contest[] = [
  { id: 'c1', scope: '교내', category: '해커톤', title: '교내 해커톤 (2학기)', deadline: '2026-11-09', expected: 60 },
  { id: 'c2', scope: '교내', category: '경진대회', title: '교내 알고리즘 경진대회', deadline: '2026-11-17', expected: 40, examWarning: '시험 기간 주의 · 기말고사 1주 전 마감' },
  { id: 'c3', scope: '교외', category: '아이디어톤', title: '부산 SW 아이디어톤', deadline: '2026-11-06', expected: 30 },
  { id: 'c4', scope: '교외', category: '경진대회', title: '[전국] 고교 SW 개발대회', deadline: '2026-12-12', expected: 120 },
  { id: 'c5', scope: '교외', category: '해커톤', title: '[전국] 학생 해커톤', deadline: '2026-12-05', expected: 100 },
  { id: 'c6', scope: '교외', category: '공모전', title: '[지역] 청소년 SW 공모전', deadline: '2026-11-28', expected: 50, examWarning: '시험 기간 주의 · 기말고사 1주 전 마감' },
];

const REC_META: Record<string, { reason: string; difficulty: number; effortDays: number }> = {
  c1: { reason: '교내 대회라 수상 확률이 높고 팀 구성이 쉽습니다. 백엔드 역할 수요가 많습니다.', difficulty: 2, effortDays: 2 },
  c2: { reason: '하루 일정이고 준비 부담이 적습니다.', difficulty: 2, effortDays: 2 },
  c3: { reason: '기획 위주라 개발 부담이 적고 일정이 짧습니다.', difficulty: 1, effortDays: 2 },
  c4: { reason: '배점이 가장 높고 Spring · React 프로젝트 경험을 그대로 살릴 수 있습니다.', difficulty: 4, effortDays: 20 },
  c5: { reason: '전국 대회라 배점이 높고 백엔드 개발자로 팀에 합류하기 좋습니다.', difficulty: 4, effortDays: 3 },
  c6: { reason: '기존 프로젝트를 정리해 제출할 수 있습니다.', difficulty: 3, effortDays: 7 },
};
const REC_ORDER: Record<RecMode, string[]> = { value: ['c1', 'c2', 'c6'], high: ['c4', 'c5', 'c1'], short: ['c3', 'c2', 'c1'] };

function mockRecommend(mode: RecMode): RecommendationData {
  return {
    contextLine: '백엔드 · Spring, React · 현재 452점 · 목표 +48점 (A 등급)을 기준으로 추천합니다.',
    items: REC_ORDER[mode].map((id) => {
      const c = MOCK_CONTESTS.find((x) => x.id === id)!;
      const m = REC_META[id];
      return { contestId: id, title: c.title, deadline: c.deadline, expected: c.expected, reason: m.reason, difficulty: m.difficulty, efficiency: Math.round(c.expected / m.effortDays) };
    }),
  };
}

function mockAsk(question: string): AskAnswer {
  const words = question.split(/[\s,.?!]+/).filter((w) => w.length >= 2);
  const open = MOCK_CONTESTS.filter((c) => daysUntil(c.deadline) >= 0);
  const hits = open.filter((c) => words.some((w) => c.title.includes(w) || c.category.includes(w) || c.scope === w));
  const pick = (hits.length ? hits : open).sort((a, b) => a.deadline.localeCompare(b.deadline)).slice(0, 3);
  return {
    text: `[예시 응답 · LLM 연동 전] 질문과 관련 있어 보이는 대회는 ${pick.map((c) => `${c.title}(${ddayLabel(c.deadline)}, 예상 +${c.expected}점)`).join(', ')}입니다. 실제 서비스에서는 시험 일정과 내 역량 데이터를 함께 보고 답변합니다.`,
    contestIds: pick.map((c) => c.id),
  };
}
