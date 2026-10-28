/* 공통 타입·Enum (docs/api/00-common.md) */

export type Role = 'STUDENT' | 'TEACHER' | 'ADMIN';

export type ScoreType = 'JOB_BASIC' | 'MAJOR_SKILL' | 'CHARACTER_JOB_ETHIC' | 'HUMANITIES_LITERACY' | 'FOREIGN_LANGUAGE';
export const SCORE_TYPES: ScoreType[] = ['JOB_BASIC', 'MAJOR_SKILL', 'CHARACTER_JOB_ETHIC', 'HUMANITIES_LITERACY', 'FOREIGN_LANGUAGE'];
export const SCORE_TYPE_LABEL: Record<ScoreType, string> = {
  JOB_BASIC: '직업기초능력',
  MAJOR_SKILL: '전공직무능력',
  CHARACTER_JOB_ETHIC: '인성·직업윤리',
  HUMANITIES_LITERACY: '인문학적 소양',
  FOREIGN_LANGUAGE: '외국어능력',
};

export type PointType = 'MERIT' | 'DEMERIT';
export const POINT_TYPE_LABEL: Record<PointType, string> = { MERIT: '상점', DEMERIT: '벌점' };

export type ContestScope = 'IN_SCHOOL' | 'OUT_SCHOOL';
export const CONTEST_SCOPE_LABEL: Record<ContestScope, string> = { IN_SCHOOL: '교내', OUT_SCHOOL: '교외' };

export type EvidenceStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export const EVIDENCE_STATUS_LABEL: Record<EvidenceStatus, string> = { PENDING: '검토 대기', APPROVED: '승인', REJECTED: '반려' };

export type SelfReportStatus = 'UNREAD' | 'READ' | 'IN_PROGRESS' | 'DONE';
export const SELF_REPORT_STATUS_LABEL: Record<SelfReportStatus, string> = { UNREAD: '확인 전', READ: '확인 완료', IN_PROGRESS: '처리 중', DONE: '처리 완료' };

export type PreferredHandling = 'MEETING' | 'WRITTEN_REPLY' | 'NOTICE_ONLY';
export type FontScale = 'XS' | 'S' | 'M' | 'L' | 'XL';
export type BackgroundType = 'NONE' | 'GIF' | 'MP4';
export type BackgroundFit = 'COVER' | 'TILE' | 'CONTAIN';
export type DrawType = 'SEAT' | 'PINBALL';

/* 페이지 목록 / 커서 목록 */
export interface Page<T> { items: T[]; page: number; size: number; totalElements: number; totalPages: number; }
export interface CursorPage<T> { items: T[]; nextCursor: string | null; }

export interface TeacherRef { teacherId: string; name: string; }
export interface StudentRef { studentId: string; name: string; grade: number; classNo: number; number: number; }

/* 학번 표기: 2학년 1반 9번 → 2109 */
export const studentNo = (s: { grade: number; classNo: number; number: number }) =>
  `${s.grade}${s.classNo}${String(s.number).padStart(2, '0')}`;
