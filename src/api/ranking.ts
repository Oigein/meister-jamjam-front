/* 마역량 랭킹 (docs/api/02-ranking.md) */
import { api } from './client';

export interface RankingItem {
  rank: number;
  studentId: string;
  name: string;
  grade: number;
  classNo: number;
  number: number;
  totalScore: number;
  isMe: boolean;
}

export interface RankingResponse {
  grade: number | null;
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  myRank: { studentId: string; rank: number; totalScore: number; page: number } | null;
  items: RankingItem[];
}

export const getRanking = (q: { grade: number | null; page: number }, signal?: AbortSignal) =>
  api<RankingResponse>('/api/meister/rankings', { query: { grade: q.grade, page: q.page }, signal });
