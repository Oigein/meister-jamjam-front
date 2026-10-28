/* 알림 (docs/api/12-notifications.md) */
import { API_ORIGIN, USE_MOCK, api } from './client';
import type { CursorPage } from './types';

export type NotificationType =
  | 'EVIDENCE_APPROVED' | 'EVIDENCE_REJECTED' | 'MEISTER_SCORE_CHANGED'
  | 'SELF_REPORT_RECEIVED' | 'SELF_REPORT_STATUS_CHANGED' | 'SELF_REPORT_REPLIED';

export interface Notification {
  notificationId: string;
  type: NotificationType;
  title: string;
  body: string;
  targetUrl: string | null;
  isRead: boolean;
  createdAt: string;
}

export const getNotifications = (q: { unreadOnly?: boolean; cursor?: string | null; size?: number } = {}) =>
  api<CursorPage<Notification>>('/api/notifications', { query: { unreadOnly: q.unreadOnly ?? false, cursor: q.cursor, size: q.size ?? 20 } });

export const getUnreadCount = () => api<{ count: number }>('/api/notifications/unread-count');

export const markRead = (id: string) => api<void>(`/api/notifications/${id}/read`, { method: 'PATCH' });

export const markAllRead = () => api<void>('/api/notifications/read-all', { method: 'PATCH' });

/*
 * 실시간 알림 (SSE). 연결이 안 되면 30초마다 안 읽은 수를 다시 조회.
 * 반환값: 구독 해제 함수
 */
export function subscribeNotifications(onNotification: (n: Notification) => void, onFallbackTick: () => void) {
  if (USE_MOCK || typeof EventSource === 'undefined') {
    const t = setInterval(onFallbackTick, 30_000);
    return () => clearInterval(t);
  }
  let poll: ReturnType<typeof setInterval> | null = null;
  const es = new EventSource(`${API_ORIGIN}/api/notifications/stream`, { withCredentials: true });
  es.addEventListener('notification', (e) => {
    try { onNotification(JSON.parse((e as MessageEvent).data)); } catch { /* 형식 오류 무시 */ }
  });
  es.onerror = () => {
    if (es.readyState === EventSource.CLOSED && !poll) poll = setInterval(onFallbackTick, 30_000);
  };
  return () => { es.close(); if (poll) clearInterval(poll); };
}
