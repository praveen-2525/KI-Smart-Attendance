import { useQuery } from '@tanstack/react-query';
import { attendanceApi, timetableApi, odApi, leaveApi, notifApi } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { Link } from 'react-router-dom';
import { RadialBarChart, RadialBar, Cell, ResponsiveContainer } from 'recharts';

const getAttendanceColor = (pct) => {
  if (pct >= 85) return 'var(--success)';
  if (pct >= 75) return 'var(--warning)';
  return 'var(--danger)';
};

const getAttendanceBg = (pct) => {
  if (pct >= 85) return 'rgba(16,185,129,0.1)';
  if (pct >= 75) return 'rgba(245,158,11,0.1)';
  return 'rgba(239,68,68,0.1)';
};

function AttendanceCircle({ percentage, size = 140 }) {
  const color = getAttendanceColor(percentage);
  const circumference = 2 * Math.PI * 50;
  const strokeDash = (percentage / 100) * circumference;

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 120 120">
        <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="10" />
        <circle
          cx="60" cy="60" r="50" fill="none"
          stroke={color} strokeWidth="10"
          strokeDasharray={`${strokeDash} ${circumference}`}
          strokeLinecap="round"
          transform="rotate(-90 60 60)"
          style={{ transition: 'stroke-dasharray 1s ease' }}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex',
        flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
      }}>
        <div style={{ fontSize: size * 0.18, fontWeight: 800, color }}>{percentage}%</div>
        <div style={{ fontSize: size * 0.1, color: 'var(--gray-500)' }}>Overall</div>
      </div>
    </div>
  );
}

export default function StudentDashboard() {
  const { user } = useAuth();

  const { data: attData, isLoading: attLoading } = useQuery({
    queryKey: ['my-attendance'],
    queryFn: () => attendanceApi.getMy(),
    select: (res) => res.data,
  });

  const { data: ttData } = useQuery({
    queryKey: ['timetable-today'],
    queryFn: () => timetableApi.getToday(),
    select: (res) => res.data,
  });

  const { data: odData } = useQuery({
    queryKey: ['od-my', 'submitted'],
    queryFn: () => odApi.getMy({ status: 'submitted' }),
    select: (res) => res.data,
  });

  const { data: leaveData } = useQuery({
    queryKey: ['leave-my'],
    queryFn: () => leaveApi.getMy(),
    select: (res) => res.data,
  });

  const { data: notifData } = useQuery({
    queryKey: ['notifications-unread-count'],
    queryFn: () => notifApi.getAll({ unread_only: true, limit: 1 }),
    select: (res) => res.data,
  });

  if (attLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <div>
          <div className="spinner" style={{ width: 40, height: 40, borderWidth: 3, margin: '0 auto 12px' }} />
          <div style={{ color: 'var(--gray-500)' }}>Loading your dashboard...</div>
        </div>
      </div>
    );
  }

  const overall = attData?.overall || {};
  const subjects = attData?.subjects || [];
  const timetable = ttData?.timetable || [];
  const pendingOD = odData?.total || 0;
  const pendingLeave = leaveData?.requests?.filter(r => r.status === 'submitted').length || 0;
  const unreadNotif = notifData?.unread_count || 0;
  const overallPct = overall.percentage || 0;
  const isBelow = overall.is_below_target;

  // Find current period
  const now = new Date();
  const nowTime = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  const currentPeriod = timetable.find(t => t.start_time <= nowTime && t.end_time >= nowTime);

  return (
    <div className="page-content animate-fade-in">
      {/* Welcome Banner */}
      <div style={{
        background: 'var(--gradient-brand)',
        borderRadius: 'var(--border-radius-xl)',
        padding: '24px 28px',
        marginBottom: 24,
        position: 'relative',
        overflow: 'hidden'
      }}>
        <div style={{
          position: 'absolute', right: -20, top: -20,
          width: 160, height: 160,
          background: 'rgba(255,255,255,0.05)',
          borderRadius: '50%'
        }} />
        <div style={{
          position: 'absolute', right: 40, bottom: -40,
          width: 100, height: 100,
          background: 'rgba(255,255,255,0.05)',
          borderRadius: '50%'
        }} />
        <div style={{ position: 'relative' }}>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', marginBottom: 4 }}>
            Welcome back 👋
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: 'white', marginBottom: 4 }}>
            {user?.full_name}
          </h2>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', display: 'flex', gap: 16 }}>
            <span>📚 {user?.department || 'CSE(AI&ML)'}</span>
            <span>📋 Year {user?.year}</span>
            <span>🔢 {user?.register_number}</span>
          </div>
        </div>
      </div>

      {/* Main stats grid */}
      <div className="grid-4 mb-6">
        {/* Overall Attendance - BIG */}
        <div style={{ gridColumn: 'span 1' }}>
          <div className="stat-card" style={{
            background: getAttendanceBg(overallPct),
            border: `1px solid ${getAttendanceColor(overallPct)}33`,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '24px', minHeight: 180
          }}>
            <AttendanceCircle percentage={Math.round(overallPct)} />
            <div style={{ marginTop: 12, textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>
                Target: {overall.target_percentage || 75}%
              </div>
              {isBelow && (
                <div style={{
                  marginTop: 8, fontSize: 11, color: 'var(--danger)',
                  background: 'rgba(239,68,68,0.1)',
                  borderRadius: 8, padding: '4px 10px', display: 'inline-block'
                }}>
                  ⚠️ Below target
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Stats cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="stat-card" style={{ padding: '16px', flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div className="stat-value" style={{ fontSize: 22, color: 'var(--success)' }}>{overall.pr_hours || 0}</div>
                <div className="stat-label">Present Hours</div>
              </div>
              <div style={{ fontSize: 24 }}>✅</div>
            </div>
          </div>
          <div className="stat-card" style={{ padding: '16px', flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div className="stat-value" style={{ fontSize: 22, color: 'var(--primary-400)' }}>{overall.od_hours || 0}</div>
                <div className="stat-label">OD Hours</div>
              </div>
              <div style={{ fontSize: 24 }}>🎫</div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="stat-card" style={{ padding: '16px', flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div className="stat-value" style={{ fontSize: 22, color: 'var(--danger)' }}>{overall.ab_hours || 0}</div>
                <div className="stat-label">Absent Hours</div>
              </div>
              <div style={{ fontSize: 24 }}>❌</div>
            </div>
          </div>
          <div className="stat-card" style={{ padding: '16px', flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div className="stat-value" style={{ fontSize: 22, color: 'var(--warning)' }}>{overall.le_hours || 0}</div>
                <div className="stat-label">Leave Hours</div>
              </div>
              <div style={{ fontSize: 24 }}>📋</div>
            </div>
          </div>
        </div>

        {/* Today + Pending */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="stat-card" style={{ padding: '16px', flex: 1 }}>
            <div style={{ fontSize: 20 }}>📅</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0', marginTop: 4 }}>{timetable.length}</div>
            <div className="stat-label">Classes Today</div>
            {currentPeriod && (
              <div style={{
                marginTop: 8, fontSize: 11, color: 'var(--primary-300)',
                background: 'rgba(99,102,241,0.1)', borderRadius: 6, padding: '3px 8px'
              }}>
                Current: P{currentPeriod.period_number} {currentPeriod.subject_name}
              </div>
            )}
          </div>
          <div className="stat-card" style={{ padding: '16px', flex: 1 }}>
            <div style={{ fontSize: 20 }}>🔔</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: unreadNotif > 0 ? 'var(--warning)' : '#e2e8f0', marginTop: 4 }}>
              {unreadNotif}
            </div>
            <div className="stat-label">Notifications</div>
          </div>
        </div>
      </div>

      {/* Subject Attendance */}
      <div className="grid-2 mb-6">
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0' }}>Subject-wise Attendance</h3>
            <Link to="/attendance" className="btn btn-ghost btn-sm">View All →</Link>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {subjects.length === 0 && (
              <div className="empty-state">
                <div className="empty-state-desc">No attendance data yet</div>
              </div>
            )}
            {subjects.slice(0, 5).map((s) => (
              <div key={s.subject_id} className="subject-card">
                <div style={{ flex: 1 }}>
                  <div className="subject-name">{s.subject_name}</div>
                  <div className="subject-code">{s.subject_code}</div>
                  <div className="progress-bar">
                    <div
                      className={`progress-fill progress-${
                        s.percentage >= 85 ? 'success' : s.percentage >= 75 ? 'warning' : 'danger'
                      }`}
                      style={{ width: `${s.percentage}%` }}
                    />
                  </div>
                </div>
                <div style={{ textAlign: 'right', marginLeft: 16 }}>
                  <div style={{
                    fontSize: 20, fontWeight: 800,
                    color: getAttendanceColor(s.percentage)
                  }}>
                    {s.percentage}%
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--gray-500)' }}>
                    {s.credited_hours}/{s.total_hours}
                  </div>
                  {s.is_below_target && (
                    <span className="badge badge-ab" style={{ fontSize: 9, marginTop: 4 }}>Low</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Today's Timetable + Quick Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card" style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0' }}>Today's Schedule</h3>
              <span style={{ fontSize: 12, color: 'var(--gray-500)' }}>
                {new Date().toLocaleDateString('en-IN', { weekday: 'long' })}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {timetable.length === 0 && (
                <div className="empty-state">
                  <div className="empty-state-desc">No classes today</div>
                </div>
              )}
              {timetable.map((t) => (
                <div key={t.id} className={`period-card${t.is_current ? ' current' : ''}`}>
                  <div className="period-number">P{t.period_number}</div>
                  <div style={{ flex: 1 }}>
                    <div className="period-subject">{t.subject_name}</div>
                    <div className="period-faculty">{t.faculty_name}</div>
                  </div>
                  <div className="period-time">{t.start_time?.slice(0, 5)} - {t.end_time?.slice(0, 5)}</div>
                  {t.is_current && (
                    <div style={{
                      background: 'var(--gradient-brand)', color: 'white',
                      fontSize: 10, fontWeight: 700, padding: '2px 8px',
                      borderRadius: 10, whiteSpace: 'nowrap'
                    }}>
                      NOW
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="card">
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0', marginBottom: 14 }}>Quick Actions</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {[
                { label: 'Smart Planner', icon: '🎯', to: '/planner', color: '#6366f1' },
                { label: 'Request OD', icon: '🎫', to: '/od', color: '#8b5cf6' },
                { label: 'Request Leave', icon: '📋', to: '/leave', color: '#f59e0b' },
                { label: 'Inform Late', icon: '⏰', to: '/late', color: '#10b981' },
                { label: 'Correction', icon: '✏️', to: '/correction', color: '#ef4444' },
                { label: 'Calendar', icon: '📅', to: '/attendance?tab=calendar', color: '#0ea5e9' },
              ].map((qa) => (
                <Link key={qa.label} to={qa.to} className="quick-action">
                  <div className="quick-action-icon" style={{ background: `${qa.color}20` }}>
                    {qa.icon}
                  </div>
                  {qa.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Pending requests */}
      {(pendingOD > 0 || pendingLeave > 0) && (
        <div className="card" style={{ background: 'rgba(245,158,11,0.05)', borderColor: 'rgba(245,158,11,0.2)' }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--warning)', marginBottom: 12 }}>
            ⏳ Pending Requests
          </h3>
          <div style={{ display: 'flex', gap: 12 }}>
            {pendingOD > 0 && (
              <Link to="/od" style={{ textDecoration: 'none' }}>
                <div className="badge badge-pending">{pendingOD} OD Pending</div>
              </Link>
            )}
            {pendingLeave > 0 && (
              <Link to="/leave" style={{ textDecoration: 'none' }}>
                <div className="badge badge-pending">{pendingLeave} Leave Pending</div>
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
