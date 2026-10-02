import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { notifApi } from '../services/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';

const PRIORITY_COLORS = {
  critical: 'var(--accent-rose)',
  attention: 'var(--warning)',
  pending: 'var(--primary-400)',
  information: 'var(--success)',
};

export default function TopBar({ title }) {
  const { user, logout } = useAuth();
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

  return (
    <>
      <div className="topbar">
        <h1 className="topbar-title">{title}</h1>
        <div className="topbar-actions">
          {/* Online/Offline indicator */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'rgba(16,185,129,0.1)',
            border: '1px solid rgba(16,185,129,0.2)',
            borderRadius: 20, padding: '4px 10px',
            fontSize: 12, color: 'var(--success)'
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)', display: 'inline-block' }} />
            Online
          </div>

          {/* Notifications button */}
          <button
            className="notif-btn"
            onClick={() => setNotifOpen(!notifOpen)}
            aria-label="Notifications"
          >
            🔔
            {unreadCount > 0 && <span className="notif-dot" />}
          </button>

          {/* Profile Dropdown */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setProfileOpen(!profileOpen)}
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid var(--border-dark)',
                borderRadius: 20, padding: '4px 12px 4px 6px',
                display: 'flex', alignItems: 'center', gap: 8,
                color: '#e2e8f0', cursor: 'pointer', fontSize: 13,
                fontWeight: 600
              }}
            >
              <div className="avatar" style={{ width: 28, height: 28, fontSize: 12 }}>
                {user?.full_name?.split(' ').map(n => n[0]).slice(0, 2).join('') || '?'}
              </div>
              <span>Profile ▼</span>
            </button>

            {profileOpen && (
              <div style={{
                position: 'absolute', right: 0, top: '120%',
                background: 'var(--surface-dark-2)',
                border: '1px solid var(--border-dark)',
                borderRadius: 14, padding: '8px', width: 200,
                boxShadow: 'var(--shadow-lg)', zIndex: 200
              }}>
                <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-dark)', marginBottom: 4 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#e2e8f0' }}>{user?.full_name}</div>
                  <div style={{ fontSize: 11, color: 'var(--gray-500)', textTransform: 'capitalize' }}>{user?.role}</div>
                </div>
                <a
                  href="/profile"
                  onClick={(e) => { e.preventDefault(); setProfileOpen(false); window.location.href = '/profile'; }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 12px', borderRadius: 8, color: '#e2e8f0',
                    fontSize: 13, textDecoration: 'none'
                  }}
                  onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                  onMouseOut={e => e.currentTarget.style.background = 'none'}
                >
                  👤 View Profile
                </a>
                <button
                  onClick={() => { setProfileOpen(false); logout(); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                    padding: '8px 12px', borderRadius: 8, color: '#ef4444',
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 13, textAlign: 'left', marginTop: 2
                  }}
                  onMouseOver={e => e.currentTarget.style.background = 'rgba(239,68,68,0.1)'}
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
          padding: '16px', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', borderBottom: '1px solid var(--border-dark)'
        }}>
          <div>
            <div style={{ fontWeight: 700, color: '#e2e8f0', fontSize: 16 }}>Notifications</div>
            <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>{unreadCount} unread</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
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
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray-500)', fontSize: 18 }}
            >
              ✕
            </button>
          </div>
        </div>

        {allNotif?.notifications?.length === 0 && (
          <div className="empty-state">
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
              <div className={`priority-dot priority-${n.priority}`} style={{ marginTop: 4 }} />
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

      {/* Overlay to close notif panel */}
      {notifOpen && (
        <div
          onClick={() => setNotifOpen(false)}
          style={{
            position: 'fixed', inset: 0,
            zIndex: 150,
          }}
        />
      )}
    </>
  );
}
