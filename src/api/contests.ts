/* 대회 정보 · 카테고리 · 북마크 (docs/api/06-contests.md) */
import { api } from './client';
import type { ContestScope, Page } from './types';

/* ---------- 카테고리 ---------- */
export interface ContestCategory { categoryId: number; name: string; isDefault: boolean; }
export interface CategoryAddResult extends ContestCategory { created: boolean; }

export const getCategories = (signal?: AbortSignal) =>
  api<{ items: ContestCategory[] }>('/api/contest-categories', { signal });

/* 201 created:true / 이미 있으면 200 created:false (기존 카테고리) */
export const addCategory = (name: string) =>
  api<CategoryAddResult>('/api/contest-categories', { method: 'POST', body: { name } });

/* ---------- 대회 ---------- */
export interface ContestItem {
  contestId: number;
  contestName: string;
  scope: ContestScope;
  category: { categoryId: number; name: string };
  tags: string[];
  startAt: string;
  finishAt: string;
  dDay: number; // 마감까지 남은 일수, 음수면 종료
  isBookmarked: boolean;
}
export interface ContestDetail extends ContestItem {
  content: string;
  author: { userId: string; name: string };
}

export interface ContestQuery { scope?: ContestScope | null; categoryId?: number | null; page?: number; }

export const getContests = (q: ContestQuery, signal?: AbortSignal) =>
  api<Page<ContestItem>>('/api/contests', { query: { scope: q.scope, categoryId: q.categoryId, page: q.page }, signal });

export const getContest = (contestId: number | string, signal?: AbortSignal) =>
  api<ContestDetail>(`/api/contests/${contestId}`, { signal });

export interface ContestInput {
  contestName: string;
  content: string;
  scope: ContestScope | null; // 기본값 없음 → 선택 안 하면 null로 보내 서버 검증
  categoryId: number | null;
  tagIds?: number[];
  startAt: string;
  finishAt: string;
}

export const createContest = (body: ContestInput) =>
  api<ContestDetail>('/api/contests', { method: 'POST', body });

export const updateContest = (contestId: number, body: ContestInput) =>
  api<ContestDetail>(`/api/contests/${contestId}`, { method: 'PUT', body });

export const deleteContest = (contestId: number) =>
  api<void>(`/api/contests/${contestId}`, { method: 'DELETE' });

/* ---------- 북마크 (학생) ---------- */
export const setBookmark = (contestId: number, on: boolean) =>
  api<void>(`/api/contests/${contestId}/bookmark`, { method: on ? 'PUT' : 'DELETE' });

export const getMyBookmarks = (page: number, signal?: AbortSignal) =>
  api<Page<ContestItem>>('/api/me/bookmarks', { query: { page }, signal });

/* ---------- 표시 도우미 ---------- */
export const dDayLabel = (n: number) => (n > 0 ? `D-${n}` : n === 0 ? 'D-DAY' : '종료');

/* "2026-11-14T09:00:00+09:00" → "11.14 09:00" */
export function shortDateTime(iso: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  return m ? `${m[2]}.${m[3]} ${m[4]}:${m[5]}` : iso;
}
export function shortDate(iso: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[2]}.${m[3]}` : iso;
}

/* <input type="datetime-local"> 값 ↔ 한국 시간 ISO 8601 */
export const isoToLocalInput = (iso: string) => iso.slice(0, 16);
export const localInputToIso = (v: string) => (v ? `${v.length === 16 ? `${v}:00` : v}+09:00` : '');
