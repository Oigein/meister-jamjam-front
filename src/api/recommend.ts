/* 마역량 대회 추천 LLM · 학사 일정 · 추천 가이드라인 (docs/api/08-recommend.md) */
import { api, apiStream } from './client';
import type { ContestScope, ScoreType } from './types';

export type Major = 'BACKEND' | 'FRONTEND' | 'AI' | 'APP' | 'EMBEDDED' | 'ETC';
export const MAJORS: Major[] = ['BACKEND', 'FRONTEND', 'AI', 'APP', 'EMBEDDED', 'ETC'];
export const MAJOR_LABEL: Record<Major, string> = { BACKEND: '백엔드', FRONTEND: '프론트엔드', AI: 'AI', APP: '앱', EMBEDDED: '임베디드', ETC: '기타' };

export type RecommendType = 'VALUE' | 'HIGH_SCORE' | 'SHORT_TERM';
export const RECOMMEND_TYPES: RecommendType[] = ['VALUE', 'HIGH_SCORE', 'SHORT_TERM'];
export const RECOMMEND_TYPE_LABEL: Record<RecommendType, string> = { VALUE: '가성비', HIGH_SCORE: '고득점', SHORT_TERM: '단기 완수' };

export type ScheduleType = 'EXAM' | 'PROJECT' | 'EVENT';
export interface AcademicSchedule { scheduleId: number; type: ScheduleType; title: string; startDate: string; endDate: string; }
export interface ScheduleWarning { type: ScheduleType; title: string; startDate: string; endDate: string; }

export interface RecommendRequest {
  major?: Major | null;
  techStack?: string[];
  goal?: { targetScore?: number | null; description?: string | null };
  availableUntil?: string | null;
  types?: RecommendType[];
  includeExamPeriod?: boolean;
}

export interface Recommendation {
  contestId: number;
  contestName: string;
  recommendType: RecommendType;
  scope: ContestScope;
  tags: string[];
  expectedScore: number;
  deadline: string;
  dDay: number;
  difficulty: number; // 1~5
  prepHours: number;
  efficiencyScore: number; // expectedScore / prepHours
  reason: string;
  teamTip: string | null;
  scheduleWarnings: ScheduleWarning[];
}

export interface RecommendResponse {
  generatedAt: string;
  studentContext: { grade: number; totalScore: number; weakestArea: ScoreType | null };
  recommendations: Recommendation[];
  message: string | null;
}

export const getRecommendations = (body: RecommendRequest, signal?: AbortSignal) =>
  api<RecommendResponse>('/api/contest-recommendations', { method: 'POST', body, signal });

/* ---------- 추가 질의응답 ---------- */
export interface ChatRequest { conversationId: string | null; contestId?: number | null; message: string; }
export interface ChatResponse { conversationId: string; reply: string; createdAt: string; }

export const chat = (body: ChatRequest, signal?: AbortSignal) =>
  api<ChatResponse>('/api/contest-recommendations/chat', { method: 'POST', body, signal });

/*
 * 스트리밍 질의응답 (Accept: text/event-stream)
 * 명세는 이벤트 이름(delta, done)만 정하고 data 형식은 정하지 않아 아래처럼 가정:
 *   event: delta  data: {"text":"..."}            ← JSON이 아니면 data 문자열을 그대로 글자로 사용
 *   event: done   data: {"conversationId":"..."}  ← JSON이 아니면 data 문자열을 conversationId로 사용
 *   event: error  data: {"code":"...","message":"..."} (있으면 오류로 처리)
 * 반환값: done 이벤트의 conversationId (없으면 null)
 */
export async function chatStream(body: ChatRequest, onDelta: (text: string) => void, signal?: AbortSignal): Promise<string | null> {
  let conversationId: string | null = null;
  let streamError: Error | null = null;
  const parse = (data: string): unknown => { try { return JSON.parse(data); } catch { return data; } };
  await apiStream('/api/contest-recommendations/chat', body, (event, data) => {
    const v = parse(data);
    if (event === 'delta' || event === 'message') {
      const text = typeof v === 'string' ? v : v && typeof v === 'object' && typeof (v as { text?: unknown }).text === 'string' ? (v as { text: string }).text : '';
      if (text) onDelta(text);
    } else if (event === 'done') {
      if (typeof v === 'string') conversationId = v.trim() || null;
      else if (v && typeof v === 'object' && typeof (v as { conversationId?: unknown }).conversationId === 'string') conversationId = (v as { conversationId: string }).conversationId;
    } else if (event === 'error') {
      const msg = v && typeof v === 'object' && typeof (v as { message?: unknown }).message === 'string' ? (v as { message: string }).message : '답변을 받지 못했습니다.';
      streamError = new Error(msg);
    }
  }, signal);
  if (streamError) throw streamError;
  return conversationId;
}

/* ---------- 학사 일정 ---------- */
export const getAcademicSchedules = (q: { from?: string; to?: string } = {}, signal?: AbortSignal) =>
  api<{ items: AcademicSchedule[] }>('/api/academic-schedules', { query: q, signal });

/* ---------- 추천 가이드라인 (관리자) ---------- */
export interface RecommendationGuidelines { promptGuideline: string; examBufferDays: number; version: number; }

export const getGuidelines = (signal?: AbortSignal) =>
  api<RecommendationGuidelines>('/api/admin/recommendation-guidelines', { signal });

/* 마지막으로 읽은 version을 함께 보냄 → 그 사이 수정됐으면 409 VERSION_CONFLICT */
export const updateGuidelines = (body: RecommendationGuidelines) =>
  api<RecommendationGuidelines>('/api/admin/recommendation-guidelines', { method: 'PUT', body });
