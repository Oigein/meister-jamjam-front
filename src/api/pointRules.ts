/* 상벌점 기준 (docs/api/05-point-rules.md) */
import { api } from './client';
import type { PointType } from './types';

export interface PointRule {
  ruleId: number;
  type: PointType;
  category: string;
  title: string;
  points: number; // 항상 양수
  description: string | null;
  note: string | null;
}

export interface PointRulesResponse { total: number; categories: string[]; items: PointRule[]; }

export const getPointRules = (q: { type?: PointType; category?: string[]; q?: string } = {}, signal?: AbortSignal) =>
  api<PointRulesResponse>('/api/point-rules', { query: { type: q.type, category: q.category, q: q.q }, signal });
