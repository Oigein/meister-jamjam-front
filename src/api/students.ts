/* 마역량 세부 조회 (docs/api/03-meister-detail.md) */
import { api } from './client';
import type { Page, PointType, ScoreType, TeacherRef } from './types';

/* 2.1 학생 기본 정보 */
export interface StudentDetail {
  studentId: string;
  name: string;
  grade: number;
  classNo: number;
  number: number;
  totalScore: number;
  rank: number;
  githubUrl: string | null;
  linkedinUrl: string | null;
  isMe: boolean;
}

/* 2.2 영역별 점수 */
export interface MeisterArea {
  scoreType: ScoreType;
  label: string;
  rawScore: number;
  convertedScore: number | null; // criteriaRegistered=false면 null
  grade: string | null;
  detailCount: number;
}
export interface MeisterScores {
  studentId: string;
  totalScore: number;
  criteriaRegistered: boolean;
  areas: MeisterArea[];
}

/* 2.3 점수 획득·변동 내역 */
export interface ScoreHistoryItem {
  detailId: string;
  scoreType: ScoreType;
  label: string;
  itemName: string | null;
  content: string;
  points: number; // 감소는 음수
  teacher: TeacherRef;
  evidence: { evidenceId: string; fileName: string } | null; // 다른 학생이 조회하면 null
  createdAt: string;
}
export type HistoryOrder = 'desc' | 'asc';

/* 2.4 환산 등급 기준 */
export interface GradeCriteriaArea {
  scoreType: ScoreType;
  label: string;
  maxRawScore: number;
  conversionRate: number;
  grades: { grade: string; minRawScore: number }[];
}
export interface GradeCriteria { registered: boolean; areas: GradeCriteriaArea[]; }

/* 2.5 상·벌점 (points는 항상 양수) */
export interface MeritPointItem {
  meritPointId: string;
  title: string;
  content: string | null;
  points: number;
  teacher: TeacherRef;
  createdAt: string;
}
interface MeritTotals { studentId: string; meritTotal: number; demeritTotal: number; net: number; }
export interface MeritPoints extends MeritTotals { merits: MeritPointItem[]; demerits: MeritPointItem[]; }
export interface MeritTeacherGroupItem { meritPointId: string; type: PointType; title: string; points: number; createdAt: string; }
export interface MeritTeacherGroup { teacher: TeacherRef; meritTotal: number; demeritTotal: number; items: MeritTeacherGroupItem[]; }
export interface MeritPointsByTeacher extends MeritTotals { byTeacher: MeritTeacherGroup[]; }

const sid = (id: string) => encodeURIComponent(id);

export const getStudent = (studentId: string, signal?: AbortSignal) =>
  api<StudentDetail>(`/api/students/${sid(studentId)}`, { signal });

export const getMeisterScores = (studentId: string, signal?: AbortSignal) =>
  api<MeisterScores>(`/api/students/${sid(studentId)}/meister-scores`, { signal });

export const getScoreHistory = (
  studentId: string,
  q: { scoreType?: ScoreType | null; order?: HistoryOrder; page?: number } = {},
  signal?: AbortSignal,
) => api<Page<ScoreHistoryItem>>(`/api/students/${sid(studentId)}/meister-scores/history`, {
  query: { scoreType: q.scoreType, order: q.order, page: q.page },
  signal,
});

export const getGradeCriteria = (signal?: AbortSignal) =>
  api<GradeCriteria>('/api/meister/grade-criteria', { signal });

export function getMeritPoints(studentId: string, groupBy?: 'none', signal?: AbortSignal): Promise<MeritPoints>;
export function getMeritPoints(studentId: string, groupBy: 'teacher', signal?: AbortSignal): Promise<MeritPointsByTeacher>;
export function getMeritPoints(studentId: string, groupBy: 'none' | 'teacher' = 'none', signal?: AbortSignal) {
  return api<MeritPoints | MeritPointsByTeacher>(`/api/students/${sid(studentId)}/merit-points`, { query: { groupBy }, signal });
}

/* 프로필 링크는 그리기 직전 표준 주소로 시작하는지 한 번 더 확인 (07-profile-links.md 2.3) */
export const GITHUB_PREFIX = 'https://github.com/';
export const LINKEDIN_PREFIX = 'https://www.linkedin.com/in/';
export const safeLink = (url: string | null | undefined, prefix: string) =>
  url && url.startsWith(prefix) && url.length > prefix.length ? url : null;
