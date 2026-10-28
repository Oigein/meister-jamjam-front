import { useEffect, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { getNotifications, markNotificationsRead, type Me, type Notice } from '../api/me';
import { avatarChar } from '../lib/format';
import { BellIcon } from './icons';
import './AppHeader.css';

const NAV: [string, string][] = [
  ['/ranking', '랭킹'],
  ['/students/me', '내 역량'],
  ['/rules', '상벌점 기준'],
  ['/contests', '대회'],
  ['/reports', '자진 신고'],
  ['/draw', '뽑기'],
];

export default function AppHeader({ me }: { me: Me }) {
  const [open, setOpen] = useState(false);
  const [notices, setNotices] = useState<Notice[] | null>(null);

  useEffect(() => {
    if (open && !notices) getNotifications().then(setNotices).catch(() => setNotices([]));
  }, [open, notices]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const unread = notices ? notices.filter((n) => !n.read).length : me.unread;
  const readAll = () => {
    setNotices((ns) => ns?.map((n) => ({ ...n, read: true })) ?? ns);
    markNotificationsRead().catch(() => {});
  };

  return (
    <header className="hd">
      <div className="hd-in">
        <Link to="/ranking" className="hd-logo" aria-label="BSM 홈">
          <span className="logo-mark" aria-hidden="true">›</span>
          <span className="hd-logo-txt">BSM</span>
        </Link>

        <nav className="hd-nav" aria-label="주 메뉴">
          {NAV.map(([to, label]) => <NavLink key={to} to={to}>{label}</NavLink>)}
          {me.role === 'teacher' && <NavLink to="/grading">점수 부여 <span className="hd-tag">교사</span></NavLink>}
        </nav>

        <div className="hd-right">
          <div className="hd-bellwrap">
            <button type="button" className="hd-bell" aria-label={`알림 ${unread}개`} aria-expanded={open} onClick={() => setOpen(!open)}>
              <BellIcon />
              {unread > 0 && <span className="hd-badge">{unread}</span>}
            </button>
            {open && (
              <>
                <div className="hd-backdrop" onClick={() => setOpen(false)} />
                <div className="hd-pop" role="dialog" aria-label="알림">
                  <div className="hd-pophead">
                    <strong>알림</strong>
                    {unread > 0 && <button type="button" className="linkbtn" onClick={readAll}>모두 읽음</button>}
                  </div>
                  {!notices ? <p className="hd-popmsg">불러오는 중…</p>
                    : notices.length === 0 ? <p className="hd-popmsg">새 알림이 없습니다.</p>
                    : (
                      <ul>
                        {notices.map((n) => (
                          <li key={n.id} className={n.read ? '' : 'is-new'}>
                            <span>{n.text}</span>
                            <small className="mono">{n.time}</small>
                          </li>
                        ))}
                      </ul>
                    )}
                </div>
              </>
            )}
          </div>

          <Link to="/settings" className="hd-me" aria-label="설정">
            <span className="avatar" aria-hidden="true">{avatarChar(me.name)}</span>
            <span className="hd-name">{me.name} <span className="mono muted">{me.studentNo}</span></span>
          </Link>
        </div>
      </div>
    </header>
  );
}
