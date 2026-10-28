/* 자진 신고 (docs/api/10-self-report.md) */
import { API_ORIGIN, api } from './client';
import type { Page, PreferredHandling, Role, SelfReportStatus, StudentRef } from './types';

export type SelfReportType = 'LOST_FOUND' | 'SCHOOL_RULE' | 'PEER_RELATION' | 'COUNSELING' | 'ETC';
export const SELF_REPORT_TYPES: SelfReportType[] = ['LOST_FOUND', 'SCHOOL_RULE', 'PEER_RELATION', 'COUNSELING', 'ETC'];
export const SELF_REPORT_TYPE_LABEL: Record<SelfReportType, string> = {
  LOST_FOUND: '물품 분실 · 습득',
  SCHOOL_RULE: '교칙 관련',
  PEER_RELATION: '교우 관계',
  COUNSELING: '고민 상담',
  ETC: '기타',
};

export type ChangeReason = 'SUBJECT' | 'COUNSELING' | 'ETC';
export const CHANGE_REASONS: ChangeReason[] = ['SUBJECT', 'COUNSELING', 'ETC'];
export const CHANGE_REASON_LABEL: Record<ChangeReason, string> = { SUBJECT: '교과 문제', COUNSELING: '상담 희망', ETC: '기타' };

export const PREFERRED_HANDLINGS: PreferredHandling[] = ['MEETING', 'WRITTEN_REPLY', 'NOTICE_ONLY'];
export const PREFERRED_HANDLING_LABEL: Record<PreferredHandling, string> = { MEETING: '면담 희망', WRITTEN_REPLY: '서면 답변', NOTICE_ONLY: '단순 알림' };

export const SELF_REPORT_STEPS: SelfReportStatus[] = ['UNREAD', 'READ', 'IN_PROGRESS', 'DONE'];

/* 상태 전이 (2.8) */
export const NEXT_STATUSES: Record<SelfReportStatus, SelfReportStatus[]> = {
  UNREAD: [],
  READ: ['IN_PROGRESS', 'DONE'],
  IN_PROGRESS: ['DONE'],
  DONE: [],
};

export const SELF_REPORT_LIMITS = { titleMax: 50, contentMax: 2000, replyMax: 1000, maxFiles: 3, maxFileBytes: 10 * 1024 * 1024, maxRecipients: 1 };

export interface TeacherSummary { teacherId: string; name: string; subject: string | null; position: string; }

export interface DefaultRecipient {
  teacher: TeacherSummary | null;
  isFallback: boolean;
  fallbackReason: string | null;
}

export interface SelfReportAttachment { attachmentId: string; fileName: string; sizeBytes: number; }

export interface SelfReportRecipient { teacherId: string; name: string; readAt: string | null; }

export interface SelfReportDetail {
  reportId: string;
  student: StudentRef;
  type: SelfReportType;
  title: string;
  content: string;
  recipients: SelfReportRecipient[];
  changeReason: ChangeReason | null;
  preferredHandling: PreferredHandling;
  attachments: SelfReportAttachment[];
  status: SelfReportStatus;
  editable: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MySelfReportItem {
  reportId: string;
  type: SelfReportType;
  title: string;
  status: SelfReportStatus;
  recipients: { teacherId: string; name: string }[];
  hasNewReply: boolean;
  createdAt: string;
}

export interface TeacherSelfReportItem {
  reportId: string;
  student: StudentRef;
  type: SelfReportType;
  title: string;
  status: SelfReportStatus;
  preferredHandling: PreferredHandling;
  hasNewReply: boolean;
  createdAt: string;
}

export interface SelfReportReply {
  replyId: string;
  author: { userId: string; name: string; role: Role };
  content: string;
  createdAt: string;
}

export interface SelfReportInput {
  type: SelfReportType;
  title: string;
  content: string;
  recipientIds: string[];
  changeReason: ChangeReason | null;
  preferredHandling: PreferredHandling;
  attachmentIds: string[];
}

const base = '/api/self-reports';

export const getDefaultRecipient = (signal?: AbortSignal) => api<DefaultRecipient>(`${base}/default-recipient`, { signal });

export const searchTeachers = (q: { q?: string; subject?: string; position?: string }, signal?: AbortSignal) =>
  api<{ items: TeacherSummary[] }>('/api/teachers', { query: q, signal });

export function uploadSelfReportAttachment(file: File, signal?: AbortSignal) {
  const fd = new FormData();
  fd.append('file', file);
  return api<SelfReportAttachment>(`${base}/attachments`, { method: 'POST', body: fd, signal });
}

export const submitSelfReport = (input: SelfReportInput) => api<SelfReportDetail>(base, { method: 'POST', body: input });

export const getMySelfReports = (q: { status?: SelfReportStatus | null; page?: number }, signal?: AbortSignal) =>
  api<Page<MySelfReportItem>>('/api/me/self-reports', { query: { status: q.status, page: q.page }, signal });

export const getTeacherSelfReports = (q: { status?: SelfReportStatus | null; page?: number }, signal?: AbortSignal) =>
  api<Page<TeacherSelfReportItem>>('/api/teacher/self-reports', { query: { status: q.status, page: q.page }, signal });

export const getSelfReport = (reportId: string, signal?: AbortSignal) =>
  api<SelfReportDetail>(`${base}/${encodeURIComponent(reportId)}`, { signal });

export const updateSelfReport = (reportId: string, patch: Partial<SelfReportInput>) =>
  api<SelfReportDetail>(`${base}/${encodeURIComponent(reportId)}`, { method: 'PATCH', body: patch });

export const withdrawSelfReport = (reportId: string) =>
  api<void>(`${base}/${encodeURIComponent(reportId)}`, { method: 'DELETE' });

export const changeSelfReportStatus = (reportId: string, status: SelfReportStatus) =>
  api<SelfReportDetail>(`${base}/${encodeURIComponent(reportId)}/status`, { method: 'PATCH', body: { status } });

export const getSelfReportReplies = (reportId: string, signal?: AbortSignal) =>
  api<{ items: SelfReportReply[] }>(`${base}/${encodeURIComponent(reportId)}/replies`, { signal });

export const postSelfReportReply = (reportId: string, content: string) =>
  api<SelfReportReply>(`${base}/${encodeURIComponent(reportId)}/replies`, { method: 'POST', body: { content } });

/* 첨부파일 다운로드 주소 (쿠키 인증, 서버가 권한 재확인) */
export const selfReportAttachmentUrl = (reportId: string, attachmentId: string) =>
  `${API_ORIGIN}${base}/${encodeURIComponent(reportId)}/attachments/${encodeURIComponent(attachmentId)}`;
