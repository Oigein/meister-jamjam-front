import { fail, route } from '../server';
import { currentUser, notifications } from '../db';

const mine = () => notifications.filter((n) => n.userId === currentUser().userId);

route('GET', '/api/notifications', ({ query }) => {
  const size = Math.min(Number(query.get('size') ?? 20), 50);
  const list = mine().filter((n) => query.get('unreadOnly') !== 'true' || !n.isRead)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const start = query.get('cursor') ? Number(atob(query.get('cursor')!)) : 0;
  const items = list.slice(start, start + size).map(({ userId: _u, ...n }) => n);
  return { items, nextCursor: start + size < list.length ? btoa(String(start + size)) : null };
});

route('GET', '/api/notifications/unread-count', () => ({ count: mine().filter((n) => !n.isRead).length }));

route('PATCH', '/api/notifications/read-all', () => { mine().forEach((n) => { n.isRead = true; }); });

route('PATCH', '/api/notifications/:id/read', ({ params }) => {
  const n = mine().find((x) => x.notificationId === params.id);
  if (!n) fail(404, 'NOT_FOUND', '알림을 찾을 수 없습니다.');
  n.isRead = true;
});
