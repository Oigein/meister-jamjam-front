/* 핀볼 · 자리뽑기 (docs/api/11-draw.md) — 결과는 서버가 정하고, 화면은 연출만 함 */
import { api } from './client';
import type { DrawType } from './types';

/* ---------- 학급 명단 ---------- */
export interface RosterStudent { studentId: string; number: number; name: string; }
export interface ClassRoster { grade: number; classNo: number; students: RosterStudent[]; }

export const getClassRoster = (grade: number, classNo: number, signal?: AbortSignal) =>
  api<ClassRoster>(`/api/classes/${grade}/${classNo}/students`, { signal });

/* ---------- 자리뽑기 ---------- */
export interface SeatPos { row: number; col: number; } // 1부터, 행 1 = 교탁 쪽
export interface SeatLayout { rows: number; cols: number; groupShape: string | null; disabledSeats: SeatPos[]; }
export interface FixedSeat extends SeatPos { studentId: string; }

export interface SeatDrawRequest {
  grade: number;
  classNo: number;
  layout: SeatLayout;
  excludedStudentIds: string[];
  fixedSeats: FixedSeat[];
  avoidPreviousSeat: boolean;
}

export interface SeatAssignment extends SeatPos { studentId: string; number: number; name: string; fixed: boolean; }
export type SeatWarning = 'PREVIOUS_SEAT_UNAVOIDABLE' | (string & {});

export interface SeatDraw {
  drawId: string;
  type: 'SEAT';
  grade: number;
  classNo: number;
  seed: string;
  /* 명세 응답에는 없지만 다시 보기에 필요. 없으면 배치·빈자리로 추정 */
  layout?: SeatLayout;
  assignments: SeatAssignment[];
  emptySeats: SeatPos[];
  warnings: SeatWarning[];
  createdAt: string;
}

export const drawSeats = (body: SeatDrawRequest) => api<SeatDraw>('/api/draws/seats', { method: 'POST', body });

/* ---------- 핀볼 ---------- */
export type PinballMode = 'DROP' | 'BUMPER';
export const PINBALL_MODE_LABEL: Record<PinballMode, string> = { DROP: '공 떨어뜨리기', BUMPER: '핀볼 타격' };

export interface PinballDrawRequest {
  grade: number;
  classNo: number;
  mode: PinballMode;
  winnerCount: number;
  excludedStudentIds: string[];
  allowDuplicate: boolean;
  previousDrawId: string | null;
}

export interface PinballWinner { order: number; studentId: string; number: number; name: string; }
export interface PinballDraw {
  drawId: string;
  type: 'PINBALL';
  mode: PinballMode;
  grade?: number;
  classNo?: number;
  seed: string;
  candidateCount: number;
  winners: PinballWinner[];
  previousDrawId?: string | null;
  createdAt: string;
}

export const drawPinball = (body: PinballDrawRequest) => api<PinballDraw>('/api/draws/pinball', { method: 'POST', body });

/* ---------- 히스토리 · 상세 · 검증 ---------- */
export interface DrawSummary {
  drawId: string;
  type: DrawType;
  mode: PinballMode | null;
  createdBy: string;
  createdAt: string;
  summary: string; // 자리뽑기: "16명 배치", 핀볼: 당첨자 이름
}

export const getDraws = (q: { grade: number; classNo: number; type?: DrawType; limit?: number }, signal?: AbortSignal) =>
  api<{ items: DrawSummary[] }>('/api/draws', { query: { grade: q.grade, classNo: q.classNo, type: q.type, limit: q.limit }, signal });

export type AnyDraw = SeatDraw | PinballDraw;
export const getDraw = (drawId: string, signal?: AbortSignal) => api<AnyDraw>(`/api/draws/${encodeURIComponent(drawId)}`, { signal });

export interface DrawVerification {
  drawId: string;
  seed: string;
  algorithm: string;
  input: { candidates: number[]; options: Record<string, unknown> };
  result: unknown[];
  resultHash: string;
}

export const getDrawVerification = (drawId: string, signal?: AbortSignal) =>
  api<DrawVerification>(`/api/draws/${encodeURIComponent(drawId)}/verification`, { signal });

export const SEAT_WARNING_LABEL: Record<string, string> = {
  PREVIOUS_SEAT_UNAVOIDABLE: '직전 자리를 모두 피할 수 없어, 겹치는 자리를 최대한 줄인 배치입니다.',
};
