import { useCallback, useEffect, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { isTeacher, type Me } from '../api/me';
import {
  getNotifications, getUnreadCount, markAllRead, markRead, subscribeNotifications,
  type Notification,
} from '../api/notifications';
import { errorMessage } from '../api/client';
import { studentNo } from '../api/types';
import { avatarChar } from '../lib/format';
import { BellIcon } from './icons';
import './AppHeader.css';

function navFor(me: Me): { to: string; label: string; tag?: string }[] {
  if (isTeacher(me)) {
    return [
      { to: '/ranking', label: '랭킹' },
      { to: '/rules', label: '상벌점 기준' },
      { to: '/contests', label: '대회' },
      { to: '/teacher/self-reports', label: '자진 신고' },
      { to: '/draw', label: '뽑기' },
      { to: '/grading', label: '점수 부여', tag: me.role === 'ADMIN' ? '관리자' : '교사' },
    ];
  }
  return [
    { to: '/ranking', label: '랭킹' },
    { to: `/students/${me.userId}`, label: '내 역량' },
    { to: '/rules', label: '상벌점 기준' },
    { to: '/contests', label: '대회' },
    { to: '/me/evidences', label: '증빙 제출' },
    { to: '/reports', label: '자진 신고' },
    { to: '/draw', label: '뽑기' },
  ];
}

const timeLabel = (iso: string) => {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 60_000;
  if (diff < 1) return '방금';
  if (diff < 60) return `${Math.floor(diff)}분 전`;
  if (diff < 60 * 24) return `${Math.floor(diff / 60)}시간 전`;
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function AppHeader({ me }: { me: Me }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<Notification[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  const refreshCount = useCallback(() => { getUnreadCount().then((r) => setUnread(r.count)).catch(() => {}); }, []);

  // 안 읽은 수 + 실시간 알림
  useEffect(() => {
    refreshCount();
    return subscribeNotifications((n) => {
      setUnread((c) => c + (n.isRead ? 0 : 1));
      setItems((xs) => (xs ? [n, ...xs] : xs));
    }, refreshCount);
  }, [refreshCount]);

  // 처음 열 때 목록 조회
  useEffect(() => {
    if (!open || items) return;
    getNotifications().then((r) => { setItems(r.items); setCursor(r.nextCursor); }).catch((e) => { setError(errorMessage(e)); setItems([]); });
  }, [open, items]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  async function loadMore() {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const r = await getNotifications({ cursor });
      setItems((xs) => [...(xs ?? []), ...r.items]);
      setCursor(r.nextCursor);
    } catch (e) { setError(errorMessage(e)); } finally { setLoadingMore(false); }
  }

  async function readAll() {
    setItems((xs) => xs?.map((n) => ({ ...n, isRead: true })) ?? xs);
    setUnread(0);
    await markAllRead().catch(() => refreshCount());
  }

  async function openNotice(n: Notification) {
    if (!n.isRead) {
      setItems((xs) => xs?.map((x) => (x.notificationId === n.notificationId ? { ...x, isRead: true } : x)) ?? xs);
      setUnread((c) => Math.max(0, c - 1));
      markRead(n.notificationId).catch(() => refreshCount());
    }
    if (n.targetUrl) {
      setOpen(false);
      navigate(n.targetUrl);
    }
  }

  const sub = me.student ? studentNo(me.student) : me.role === 'ADMIN' ? '관리자' : '교사';

  return (
    <header className="hd">
      <div className="hd-in">
        <Link to="/ranking" className="hd-logo" aria-label="BSM 홈">
          <span className="logo-mark" aria-hidden="true">›</span>
          <span className="hd-logo-txt">BSM</span>
        </Link>

        <nav className="hd-nav" aria-label="주 메뉴">
          {navFor(me).map((n) => (
            <NavLink key={n.to} to={n.to}>{n.label}{n.tag && <span className="hd-tag">{n.tag}</span>}</NavLink>
          ))}
        </nav>

        <div className="hd-right">
          <div className="hd-bellwrap">
            <button type="button" className="hd-bell" aria-label={`알림 ${unread}개`} aria-expanded={open} onClick={() => setOpen(!open)}>
              <BellIcon />
              {unread > 0 && <span className="hd-badge">{unread > 99 ? '99+' : unread}</span>}
            </button>
            {open && (
              <>
                <div className="hd-backdrop" onClick={() => setOpen(false)} />
                <div className="hd-pop" role="dialog" aria-label="알림">
                  <div className="hd-pophead">
                    <strong>알림</strong>
                    {unread > 0 && <button type="button" className="linkbtn" onClick={readAll}>모두 읽음</button>}
                  </div>
                  {!items ? <p className="hd-popmsg">불러오는 중…</p>
                    : error ? <p className="hd-popmsg">{error}</p>
                    : items.length === 0 ? <p className="hd-popmsg">새 알림이 없습니다.</p>
                    : (
                      <ul>
                        {items.map((n) => (
                          <li key={n.notificationId}>
                            <button type="button" className={n.isRead ? '' : 'is-new'} onClick={() => openNotice(n)}>
                              <b>{n.title}</b>
                              <span>{n.body}</span>
                              <small className="mono">{timeLabel(n.createdAt)}</small>
                            </button>
                          </li>
                        ))}
                        {cursor && (
                          <li className="hd-more"><button type="button" onClick={loadMore} disabled={loadingMore}>{loadingMore ? '불러오는 중…' : '더 보기'}</button></li>
                        )}
                      </ul>
                    )}
                </div>
              </>
            )}
          </div>

          <Link to="/settings" className="hd-me" aria-label="설정">
            {me.profileImageUrl
              ? <img className="avatar" src={me.profileImageUrl} alt="" referrerPolicy="no-referrer" />
              : <span className="avatar" aria-hidden="true">{avatarChar(me.name)}</span>}
            <span className="hd-name">{me.name} <span className="mono muted">{sub}</span></span>
          </Link>
        </div>
      </div>
    </header>
  );
}
