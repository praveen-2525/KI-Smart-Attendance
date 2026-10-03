import { useQuery } from '@tanstack/react-query';
import { attendanceApi, timetableApi, odApi, leaveApi, notifApi } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { Link } from 'react-router-dom';

const getAttendanceColor = (pct) => {
  if (pct >= 85) return 'var(--success)';
  if (pct >= 75) return 'var(--warning)';
  return 'var(--danger)';
};

const getAttendanceBg = (pct) => {
  if (pct >= 85) return 'var(--success-bg)';
  if (pct >= 75) return 'var(--warning-bg)';
  return 'var(--danger-bg)';
};

function AttendanceCircle({ percentage, size = 120 }) {
  const color = getAttendanceColor(percentage);
  const circumference = 2 * Math.PI * 45;
  const strokeDash = (percentage / 100) * circumference;

  return (
    <div style={{ position: 'relative', width: size, height: size, margin: '0 auto' }}>
      <svg width={size} height={size} viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="45" fill="none" stroke="var(--border)" strokeWidth="8" />
        <circle
          cx="50" cy="50" r="45" fill="none"
          stroke={color} strokeWidth="8"
          strokeDasharray={`${strokeDash} ${circumference}`}
          strokeLinecap="round"
          transform="rotate(-90 50 50)"
          style={{ transition: 'stroke-dasharray 1s ease' }}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex',
        flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
      }}>
        <div style={{ fontSize: size * 0.22, fontWeight: 700, color: 'var(--text-primary)' }}>{percentage}%</div>
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
      <div className="flex items-center justify-center" style={{ height: '60vh' }}>
        <div className="text-center text-muted">Loading your dashboard...</div>
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
    <div className="page-content">
      {/* Welcome Banner */}
      <div className="card mb-4" style={{ borderLeft: '4px solid var(--primary-500)' }}>
        <div className="card-body flex items-center justify-between">
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
              Welcome, {user?.full_name}
            </h2>
            <div className="text-muted flex gap-4" style={{ fontSize: 14 }}>
              <span>Department: {user?.department || 'N/A'}</span>
              <span>Year: {user?.year || 'N/A'}</span>
              <span>Reg No: {user?.register_number || 'N/A'}</span>
            </div>
          </div>
          <Link to="/profile" className="btn btn-outline">View Profile</Link>
        </div>
      </div>

      {/* Main stats grid */}
      <div className="grid grid-4 mb-4">
        {/* Overall Attendance */}
        <div className="card text-center" style={{ gridColumn: 'span 1' }}>
          <div className="card-body flex flex-col items-center justify-center">
            <h3 className="text-muted mb-3" style={{ fontSize: 14, fontWeight: 600 }}>Overall Attendance</h3>
            <AttendanceCircle percentage={Math.round(overallPct)} />
            <div className="mt-3">
              <div className="text-muted" style={{ fontSize: 12 }}>Target: {overall.target_percentage || 75}%</div>
              {isBelow && (
                <div className="badge badge-danger mt-1">Below Target</div>
              )}
            </div>
          </div>
        </div>

        {/* Stats Summary */}
        <div className="grid grid-2" style={{ gridColumn: 'span 3', gap: '24px' }}>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: 'var(--success-bg)', color: 'var(--success)' }}>✓</div>
            <div className="stat-content">
              <div className="stat-label">Present Hours</div>
              <div className="stat-value text-success">{overall.pr_hours || 0}</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: 'var(--info-bg)', color: 'var(--info)' }}>★</div>
            <div className="stat-content">
              <div className="stat-label">OD Hours</div>
              <div className="stat-value" style={{ color: 'var(--info)' }}>{overall.od_hours || 0}</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>✕</div>
            <div className="stat-content">
              <div className="stat-label">Absent Hours</div>
              <div className="stat-value text-danger">{overall.ab_hours || 0}</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: 'var(--warning-bg)', color: 'var(--warning)' }}>-</div>
            <div className="stat-content">
              <div className="stat-label">Leave Hours</div>
              <div className="stat-value" style={{ color: 'var(--warning)' }}>{overall.le_hours || 0}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-2 mb-4">
        {/* Pending Requests */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Pending Requests</h3>
          </div>
          <div className="card-body">
            <div className="flex justify-between items-center mb-3 p-3" style={{ background: 'var(--bg-body)', borderRadius: 'var(--border-radius-sm)', border: '1px solid var(--border)' }}>
              <div>
                <div style={{ fontWeight: 600 }}>OD Requests</div>
                <div className="text-muted" style={{ fontSize: 12 }}>Awaiting approval</div>
              </div>
              <div className="badge badge-warning">{pendingOD} Pending</div>
            </div>
            <div className="flex justify-between items-center p-3" style={{ background: 'var(--bg-body)', borderRadius: 'var(--border-radius-sm)', border: '1px solid var(--border)' }}>
              <div>
                <div style={{ fontWeight: 600 }}>Leave Requests</div>
                <div className="text-muted" style={{ fontSize: 12 }}>Awaiting approval</div>
              </div>
              <div className="badge badge-warning">{pendingLeave} Pending</div>
            </div>
          </div>
        </div>

        {/* Timetable / Classes Today */}
        <div className="card">
          <div className="card-header flex justify-between items-center">
            <h3 className="card-title">Today's Timetable</h3>
            <span className="badge badge-info">{timetable.length} Classes</span>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            {timetable.length > 0 ? (
              <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
                <table className="table" style={{ margin: 0 }}>
                  <tbody>
                    {timetable.map((t, idx) => {
                      const isCurrent = currentPeriod?.period_number === t.period_number;
                      return (
                        <tr key={idx} style={isCurrent ? { background: 'var(--info-bg)' } : {}}>
                          <td style={{ width: '40px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                            P{t.period_number}
                          </td>
                          <td>
                            <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{t.subject_name}</div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t.faculty_name}</div>
                          </td>
                          <td className="text-right text-muted" style={{ fontSize: 12 }}>
                            {t.start_time} - {t.end_time}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-state" style={{ border: 'none' }}>
                <div className="empty-state-title">No Classes Today</div>
                <div className="empty-state-desc">You have no scheduled classes for today.</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Subject-wise Attendance */}
      <div className="card mb-4">
        <div className="card-header flex justify-between items-center">
          <h3 className="card-title">Subject-wise Attendance</h3>
          <Link to="/attendance" className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }}>View Details</Link>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          {subjects.length > 0 ? (
            <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Subject Code</th>
                    <th>Subject Name</th>
                    <th className="text-right">Classes Held</th>
                    <th className="text-right">Attended</th>
                    <th className="text-right">Percentage</th>
                  </tr>
                </thead>
                <tbody>
                  {subjects.map((sub, idx) => (
                    <tr key={idx}>
                      <td style={{ fontWeight: 500 }}>{sub.subject_code}</td>
                      <td>{sub.subject_name}</td>
                      <td className="text-right">{sub.total_hours}</td>
                      <td className="text-right text-success">{sub.pr_hours}</td>
                      <td className="text-right">
                        <span className="badge" style={{ 
                          background: getAttendanceBg(sub.percentage),
                          color: getAttendanceColor(sub.percentage),
                          border: `1px solid ${getAttendanceColor(sub.percentage)}33`
                        }}>
                          {sub.percentage}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state" style={{ border: 'none' }}>
              <div className="empty-state-title">No Data Available</div>
              <div className="empty-state-desc">Attendance data is not yet available for this semester.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
