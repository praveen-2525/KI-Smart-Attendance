import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { notifApi } from '../services/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';

export default function TopBar({ title }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const qc = useQueryClient();

  const { data: notifData } = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: () => notifApi.getAll({ unread_only: true, limit: 20 }),
    refetchInterval: 30000,
    select: (res) => res.data,
  });

  const markReadMutation = useMutation({
    mutationFn: (id) => notifApi.markRead(id),
    onSuccess: () => qc.invalidateQueries(['notifications']),
  });

  const markAllMutation = useMutation({
    mutationFn: () => notifApi.markAllRead(),
    onSuccess: () => qc.invalidateQueries(['notifications']),
  });

  const { data: allNotif } = useQuery({
    queryKey: ['notifications', 'all'],
    queryFn: () => notifApi.getAll({ limit: 30 }),
    enabled: notifOpen,
    select: (res) => res.data,
  });

  const unreadCount = notifData?.unread_count || 0;
  const initials = user?.full_name
    ? user.full_name.split(' ').map(n => n[0]).slice(0, 2).join('')
    : '?';

  return (
    <>
      <div className="topbar">
        <h1 className="topbar-title">{title}</h1>
        <div className="topbar-actions">
          {/* Notifications button */}
          <button
            className="notif-btn"
            onClick={() => { setNotifOpen(!notifOpen); setProfileOpen(false); }}
            aria-label="Notifications"
          >
            🔔
            {unreadCount > 0 && <span className="notif-dot" />}
          </button>

          {/* Profile Dropdown */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => { setProfileOpen(!profileOpen); setNotifOpen(false); }}
              style={{
                background: 'var(--bg-body)',
                border: '1px solid var(--border)',
                borderRadius: 20,
                padding: '4px 12px 4px 6px',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                color: 'var(--text-primary)',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600,
                fontFamily: 'inherit',
                transition: 'var(--transition)',
              }}
              onMouseOver={e => e.currentTarget.style.borderColor = 'var(--gray-400)'}
              onMouseOut={e => e.currentTarget.style.borderColor = 'var(--border)'}
            >
              <div className="avatar" style={{ width: 28, height: 28, fontSize: 12 }}>
                {initials}
              </div>
              <span>{user?.full_name?.split(' ')[0] || 'Profile'}</span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>▼</span>
            </button>

            {profileOpen && (
              <div
                style={{
                  position: 'absolute',
                  right: 0,
                  top: 'calc(100% + 8px)',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--border-radius-lg)',
                  padding: '8px',
                  width: 220,
                  boxShadow: 'var(--shadow-lg)',
                  zIndex: 200,
                }}
              >
                <div style={{
                  padding: '8px 12px',
                  borderBottom: '1px solid var(--border-light)',
                  marginBottom: 4,
                }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>
                    {user?.full_name}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                    {user?.role}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => { setProfileOpen(false); navigate('/profile'); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                    padding: '8px 12px', borderRadius: 'var(--border-radius-sm)',
                    color: 'var(--text-primary)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 13, textAlign: 'left', fontFamily: 'inherit',
                  }}
                  onMouseOver={e => e.currentTarget.style.background = 'var(--bg-body)'}
                  onMouseOut={e => e.currentTarget.style.background = 'none'}
                >
                  👤 View Profile
                </button>
                <button
                  type="button"
                  onClick={() => { setProfileOpen(false); navigate('/change-password'); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                    padding: '8px 12px', borderRadius: 'var(--border-radius-sm)',
                    color: 'var(--text-primary)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 13, textAlign: 'left', fontFamily: 'inherit',
                  }}
                  onMouseOver={e => e.currentTarget.style.background = 'var(--bg-body)'}
                  onMouseOut={e => e.currentTarget.style.background = 'none'}
                >
                  🔑 Change Password
                </button>
                <div style={{ borderTop: '1px solid var(--border-light)', margin: '4px 0' }} />
                <button
                  type="button"
                  onClick={() => { setProfileOpen(false); logout(); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                    padding: '8px 12px', borderRadius: 'var(--border-radius-sm)',
                    color: 'var(--danger)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 13, textAlign: 'left', fontFamily: 'inherit',
                  }}
                  onMouseOver={e => e.currentTarget.style.background = 'var(--danger-bg)'}
                  onMouseOut={e => e.currentTarget.style.background = 'none'}
                >
                  🚪 Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Notification Panel */}
      <div className={`notif-panel${notifOpen ? ' open' : ''}`}>
        <div style={{
          padding: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--border)',
          background: '#fcfcfc',
        }}>
          <div>
            <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 15 }}>Notifications</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{unreadCount} unread</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllMutation.mutate()}
                className="btn btn-ghost btn-sm"
              >
                Mark all read
              </button>
            )}
            <button
              onClick={() => setNotifOpen(false)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-muted)', fontSize: 18, padding: '2px 6px',
                borderRadius: 4, fontFamily: 'inherit',
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {allNotif?.notifications?.length === 0 && (
          <div className="empty-state" style={{ border: 'none', margin: 16 }}>
            <div className="empty-state-icon">🔔</div>
            <div className="empty-state-title">All caught up!</div>
            <div className="empty-state-desc">No notifications yet</div>
          </div>
        )}

        {allNotif?.notifications?.map((n) => (
          <div
            key={n.id}
            className={`notif-item${!n.is_read ? ' unread' : ''}`}
            onClick={() => !n.is_read && markReadMutation.mutate(n.id)}
          >
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <div
                className={`priority-dot priority-${n.priority}`}
                style={{ marginTop: 4 }}
              />
              <div>
                <div className="notif-title">{n.title}</div>
                <div className="notif-msg">{n.message}</div>
                <div className="notif-time">
                  {n.created_at && formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Overlay to close panels */}
      {(notifOpen || profileOpen) && (
        <div
          onClick={() => { setNotifOpen(false); setProfileOpen(false); }}
          style={{ position: 'fixed', inset: 0, zIndex: 150 }}
        />
      )}
    </>
  );
}
