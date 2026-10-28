/* 마역량 점수 부여 · 증빙자료 (docs/api/04-meister-award.md) */
import { api } from './client';
import type { EvidenceStatus, Page, PointType, ScoreType, StudentRef, TeacherRef } from './types';

/* ---------- 2.1 평가항목 ---------- */
export interface ScoreItem {
  itemId: number;
  scoreType: ScoreType;
  name: string;
  maxPoints: number;
  description: string | null;
}
export const getScoreItems = (scoreType?: ScoreType | null, signal?: AbortSignal) =>
  api<{ items: ScoreItem[] }>('/api/meister/score-items', { query: { scoreType }, signal });

/* ---------- 2.2 학생 검색 (교사) ---------- */
export interface TeacherStudent extends StudentRef {
  totalScore: number;
  pendingEvidenceCount: number;
}
export interface StudentSearch { q?: string; grade?: number | null; classNo?: number | null; number?: number | null; page?: number; }
export const searchStudents = (s: StudentSearch, signal?: AbortSignal) =>
  api<Page<TeacherStudent>>('/api/teacher/students', { query: { q: s.q, grade: s.grade, classNo: s.classNo, number: s.number, page: s.page }, signal });

/* ---------- 증빙자료 공통 ---------- */
export type AnalysisStatus = 'PROCESSING' | 'DONE' | 'FAILED';
export const ANALYSIS_STATUS_LABEL: Record<AnalysisStatus, string> = { PROCESSING: 'AI 분석 중', DONE: 'AI 분석 완료', FAILED: 'AI 분석 실패' };

export type ExtractedKind = 'CERTIFICATE' | 'AWARD' | 'PARTICIPATION' | 'OTHER';
export const EXTRACTED_KIND_LABEL: Record<ExtractedKind, string> = { CERTIFICATE: '자격증', AWARD: '상장', PARTICIPATION: '참가확인서', OTHER: '기타' };

/* 업로드 허용 형식 · 용량 (2.3) */
export const EVIDENCE_ACCEPT = '.jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf';
export const EVIDENCE_MAX_BYTES = 10 * 1024 * 1024;

/* ---------- 2.3 제출 (학생) ---------- */
export interface EvidenceSubmitInput { file: File; title: string; description?: string; scoreType?: ScoreType | null; }
export interface EvidenceSubmitResult {
  evidenceId: string;
  title: string;
  status: EvidenceStatus;
  analysisStatus: AnalysisStatus;
  createdAt: string;
}
export function submitEvidence(input: EvidenceSubmitInput) {
  const fd = new FormData();
  fd.append('file', input.file);
  fd.append('title', input.title);
  if (input.description) fd.append('description', input.description);
  if (input.scoreType) fd.append('scoreType', input.scoreType);
  return api<EvidenceSubmitResult>('/api/evidences', { method: 'POST', body: fd });
}

/* ---------- 2.4 내 제출 내역 (학생) ---------- */
export interface MyEvidenceItem {
  evidenceId: string;
  title: string;
  status: EvidenceStatus;
  rejectReason: string | null;
  approvedPoints: number | null;
  createdAt: string;
  reviewedAt: string | null;
  /* 명세 2.4 항목에는 없지만 목록에서 AI 분석 상태를 보여 주기 위해 추가 요청 (없으면 표시 생략) */
  analysisStatus?: AnalysisStatus | null;
}
export const getMyEvidences = (q: { status?: EvidenceStatus | null; page?: number }, signal?: AbortSignal) =>
  api<Page<MyEvidenceItem>>('/api/me/evidences', { query: { status: q.status, page: q.page }, signal });

/* ---------- 2.5 검토 목록 (교사) ---------- */
export interface TeacherEvidenceItem {
  evidenceId: string;
  student: StudentRef;
  title: string;
  status: EvidenceStatus;
  analysisStatus: AnalysisStatus;
  recommendedScoreType: ScoreType | null;
  expectedPoints: number | null;
  createdAt: string;
}
export const getTeacherEvidences = (q: { status?: EvidenceStatus | null; studentId?: string | null; page?: number }, signal?: AbortSignal) =>
  api<Page<TeacherEvidenceItem>>('/api/teacher/evidences', { query: { status: q.status, studentId: q.studentId, page: q.page }, signal });

/* 검토 대기 전체 (페이지를 끝까지 모음) */
export async function getAllPendingEvidences(signal?: AbortSignal) {
  const out: TeacherEvidenceItem[] = [];
  for (let page = 1; page <= 20; page++) {
    const p = await getTeacherEvidences({ status: 'PENDING', page }, signal);
    out.push(...p.items);
    if (p.page >= p.totalPages) break;
  }
  return out;
}

/* ---------- 2.6 상세 + AI 분석 ---------- */
export interface AiExtracted {
  kind: ExtractedKind;
  name: string | null;
  issuer: string | null;
  award: string | null;
  achievedAt: string | null;
}
export interface AiRecommendation {
  scoreType: ScoreType;
  itemId: number;
  itemName: string;
  expectedPoints: number;
  reason: string;
}
export interface DuplicateSuspect { detailId: string; content: string; createdAt: string; }
export interface AiAnalysis {
  status: AnalysisStatus;
  extracted: AiExtracted | null;
  recommendation: AiRecommendation | null;
  duplicateSuspect: DuplicateSuspect | null;
  analyzedAt: string | null;
}
export interface EvidenceReview {
  teacher: TeacherRef;
  reviewedAt: string;
  rejectReason: string | null;
  detailId: string | null;
}
export interface EvidenceFile {
  fileName: string;
  contentType: string;
  /* GET /api/evidences/{id}/file 주소. 목업에서는 업로드한 파일의 blob: 주소, 시드 데이터는 null */
  url: string | null;
}
export interface EvidenceDetail {
  evidenceId: string;
  student: StudentRef;
  title: string;
  description: string | null;
  file: EvidenceFile;
  status: EvidenceStatus;
  aiAnalysis: AiAnalysis | null;
  review: EvidenceReview | null;
  createdAt: string;
}
export const getEvidence = (id: string, signal?: AbortSignal) =>
  api<EvidenceDetail>(`/api/evidences/${encodeURIComponent(id)}`, { signal });

export const evidenceFileUrl = (id: string) => `/api/evidences/${encodeURIComponent(id)}/file`;

/* ---------- 2.7 재분석 ---------- */
export const reanalyzeEvidence = (id: string) =>
  api<{ analysisStatus: AnalysisStatus }>(`/api/evidences/${encodeURIComponent(id)}/analysis`, { method: 'POST' });

/* ---------- 2.8 승인 · 2.10 직접 부여 ---------- */
export interface ScoreGrantBody { scoreType: ScoreType; itemId: number; points: number; content: string; }
export interface ScoreDetailResult {
  detailId: string;
  scoreType: ScoreType;
  itemId: number;
  points: number;
  content: string;
  createdAt: string;
}
export interface StudentScoreResult { scoreType: ScoreType; rawScore: number; totalScore: number; }
export interface ApproveResult {
  evidenceId: string;
  status: EvidenceStatus;
  scoreDetail: ScoreDetailResult;
  studentScore: StudentScoreResult;
}
export const approveEvidence = (id: string, body: ScoreGrantBody) =>
  api<ApproveResult>(`/api/evidences/${encodeURIComponent(id)}/approve`, { method: 'POST', body });

/* ---------- 2.9 반려 ---------- */
export const rejectEvidence = (id: string, reason: string) =>
  api<{ evidenceId: string; status: EvidenceStatus; rejectReason: string }>(`/api/evidences/${encodeURIComponent(id)}/reject`, { method: 'POST', body: { reason } });

/* ---------- 2.10 직접 부여 ---------- */
export const grantMeisterScore = (body: ScoreGrantBody & { studentId: string }) =>
  api<{ scoreDetail: ScoreDetailResult; studentScore: StudentScoreResult }>('/api/meister-scores', { method: 'POST', body });

/* ---------- 2.11 부여 이력 (교사) ----------
 * 명세는 항목을 문장으로만 정의 → 아래 형식으로 가정
 */
export interface ScoreHistoryItem {
  detailId: string;
  student: StudentRef;
  scoreType: ScoreType;
  itemId: number | null;
  itemName: string | null;
  points: number;
  content: string;
  teacher: TeacherRef;
  createdAt: string;
  evidenceId: string | null;
}
export interface ScoreHistoryQuery {
  studentId?: string | null;
  teacherId?: string | null; // 'me' = 로그인한 교사
  scoreType?: ScoreType | null;
  from?: string | null; // YYYY-MM-DD
  to?: string | null;
  page?: number;
}
export const getScoreHistory = (q: ScoreHistoryQuery, signal?: AbortSignal) =>
  api<Page<ScoreHistoryItem>>('/api/teacher/meister-scores', { query: { ...q }, signal });

/* ---------- 2.12 상·벌점 부여 ---------- */
export interface MeritGrantBody {
  studentId: string;
  type: PointType;
  ruleId?: number | null;
  title: string;
  content?: string | null;
  points: number;
}
/* 상·벌점 조회 API(03 §2.5)의 항목 형식 + type */
export interface MeritPointItem {
  meritPointId: string;
  type: PointType;
  title: string;
  content: string | null;
  points: number;
  teacher: TeacherRef;
  createdAt: string;
}
export const grantMeritPoint = (body: MeritGrantBody) =>
  api<MeritPointItem>('/api/merit-points', { method: 'POST', body });

/* 날짜 표시 도우미: 2026-10-29T14:30:00+09:00 → 2026.10.29 14:30 */
export const fmtDateTime = (iso: string | null | undefined) =>
  iso ? `${iso.slice(0, 10).replace(/-/g, '.')} ${iso.slice(11, 16)}` : '—';
export const fmtDate = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).replace(/-/g, '.') : '—');
