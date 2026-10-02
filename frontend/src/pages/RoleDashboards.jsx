import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { reportsApi, odApi, leaveApi, correctionApi, usersApi } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

// ============================================================
// HOD DASHBOARD
// ============================================================
export function HODDashboard() {
  const { data: overview } = useQuery({
    queryKey: ['hod-overview'],
    queryFn: () => reportsApi.hodOverview(),
    select: (res) => res.data,
  });

  const { data: pendingOD } = useQuery({
    queryKey: ['od-pending'],
    queryFn: () => odApi.getPending(),
    select: (res) => res.data,
  });

  const { data: pendingLeave } = useQuery({
    queryKey: ['leave-pending'],
    queryFn: () => leaveApi.getPending(),
    select: (res) => res.data,
  });

  const navigate = useNavigate();

  const stats = [
    { label: 'Total Students', value: overview?.total_students || 0, icon: '👥', color: 'var(--primary-400)' },
    { label: 'Pending OD', value: overview?.pending_od_requests || pendingOD?.requests?.length || 0, icon: '🎫', color: 'var(--warning)' },
    { label: 'Pending Leave', value: overview?.pending_leave_requests || pendingLeave?.requests?.length || 0, icon: '📋', color: 'var(--info)' },
    { label: 'Proof Pending', value: overview?.pending_proof_verification || 0, icon: '📎', color: 'var(--accent-violet)' },
    { label: 'Corrections', value: overview?.pending_correction_requests || 0, icon: '✏️', color: 'var(--accent-rose)' },
    { label: 'Exceptions', value: overview?.unacknowledged_exceptions || 0, icon: '⚠️', color: 'var(--danger)' },
  ];

  return (
    <div className="page-content animate-fade-in">
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: '#e2e8f0' }}>🏛️ HOD Dashboard</h2>
        <p style={{ color: 'var(--gray-500)', fontSize: 14 }}>Department overview and pending actions</p>
      </div>

      <div className="grid-3 mb-6">
        {stats.map((stat) => (
          <div key={stat.label} className="stat-card">
            <div className="stat-icon" style={{ background: `${stat.color}20` }}>
              <span style={{ fontSize: 20 }}>{stat.icon}</span>
            </div>
            <div className="stat-value" style={{ color: stat.color }}>{stat.value}</div>
            <div className="stat-label">{stat.label}</div>
          </div>
        ))}
      </div>

      <div className="grid-2">
        {/* Pending OD */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0' }}>🎫 Pending OD Requests</h3>
            <button className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }}
              onClick={() => navigate('/od')}>View All</button>
          </div>
          {pendingOD?.requests?.slice(0, 4).map((od) => (
            <div key={od.id || od.requestId} style={{
              background: 'var(--surface-dark-3)', borderRadius: 8,
              padding: '10px 14px', marginBottom: 8
            }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0' }}>{od.eventName || od.event_name}</div>
              <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>{od.studentName || od.student?.name}</div>
              <div style={{ fontSize: 12, color: 'var(--gray-600)', marginTop: 4 }}>
                {od.fromDate || od.from_date} → {od.toDate || od.to_date}
              </div>
            </div>
          ))}
          {!pendingOD?.requests?.length && (
            <div style={{ color: 'var(--gray-600)', fontSize: 13, textAlign: 'center', padding: 20 }}>
              ✅ No pending OD requests
            </div>
          )}
        </div>

        {/* Pending Leave */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0' }}>📋 Pending Leave Requests</h3>
            <button className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }}
              onClick={() => navigate('/leave')}>View All</button>
          </div>
          {pendingLeave?.requests?.slice(0, 4).map((lr) => (
            <div key={lr.id || lr.requestId} style={{
              background: 'var(--surface-dark-3)', borderRadius: 8,
              padding: '10px 14px', marginBottom: 8
            }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0' }}>
                {lr.leaveType || lr.leave_type} — {lr.numberOfDays || lr.number_of_days || 1} day(s)
              </div>
              <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>
                {lr.studentName || lr.student?.name}
              </div>
              <div style={{ fontSize: 12, color: 'var(--gray-600)' }}>
                {lr.fromDate || lr.from_date} → {lr.toDate || lr.to_date}
              </div>
            </div>
          ))}
          {!pendingLeave?.requests?.length && (
            <div style={{ color: 'var(--gray-600)', fontSize: 13, textAlign: 'center', padding: 20 }}>
              ✅ No pending leave requests
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// ADVISOR DASHBOARD
// ============================================================
export function AdvisorDashboard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [reviewingId, setReviewingId] = useState(null);

  const { data: pendingOD } = useQuery({
    queryKey: ['od-pending'],
    queryFn: () => odApi.getPending(),
    select: (res) => res.data,
  });

  const { data: pendingLeave } = useQuery({
    queryKey: ['leave-pending'],
    queryFn: () => leaveApi.getPending(),
    select: (res) => res.data,
  });

  const reviewOD = async (id, action) => {
    setReviewingId(id);
    try {
      await odApi.review(id, action, '');
      toast.success(`OD request ${action.toLowerCase()}!`);
      qc.invalidateQueries(['od-pending']);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Action failed');
    } finally {
      setReviewingId(null);
    }
  };

  const reviewLeave = async (id, action) => {
    setReviewingId(id);
    try {
      await leaveApi.review(id, action, '');
      toast.success(`Leave request ${action.toLowerCase()}!`);
      qc.invalidateQueries(['leave-pending']);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Action failed');
    } finally {
      setReviewingId(null);
    }
  };

  const totalPending = (pendingOD?.requests?.length || 0) + (pendingLeave?.requests?.length || 0);

  const stats = [
    { label: 'Pending OD', value: pendingOD?.requests?.length || 0, icon: '🎫', color: 'var(--warning)' },
    { label: 'Pending Leave', value: pendingLeave?.requests?.length || 0, icon: '📋', color: 'var(--info)' },
    { label: 'Total Actions', value: totalPending, icon: '📨', color: 'var(--accent-violet)' },
    { label: 'Today', value: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }), icon: '📅', color: 'var(--success)' },
  ];

  return (
    <div className="page-content animate-fade-in">
      {/* Welcome banner */}
      <div style={{
        background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
        borderRadius: 'var(--border-radius-xl)', padding: '24px 28px', marginBottom: 24
      }}>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', marginBottom: 4 }}>Welcome back, Advisor</div>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: 'white' }}>{user?.full_name}</h2>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 4 }}>
          {user?.department || 'CSE(AI&ML)'} •{' '}
          {totalPending > 0
            ? <span style={{ color: '#fde68a' }}>⚠️ {totalPending} pending action(s)</span>
            : <span>✅ All caught up!</span>
          }
        </div>
      </div>

      <div className="grid-4 mb-6">
        {stats.map((stat) => (
          <div key={stat.label} className="stat-card">
            <div className="stat-icon" style={{ background: `${stat.color}20` }}>
              <span style={{ fontSize: 20 }}>{stat.icon}</span>
            </div>
            <div className="stat-value" style={{ color: stat.color }}>{stat.value}</div>
            <div className="stat-label">{stat.label}</div>
          </div>
        ))}
      </div>

      <div className="grid-2">
        {/* Pending OD Requests - with approve/reject */}
        <div className="card">
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0', marginBottom: 16 }}>
            🎫 OD Requests — Action Required
          </h3>
          {pendingOD?.requests?.slice(0, 5).map((od) => {
            const id = od.id || od.requestId;
            return (
              <div key={id} style={{
                background: 'var(--surface-dark-3)', borderRadius: 10,
                padding: '12px 14px', marginBottom: 10
              }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0' }}>
                  {od.eventName || od.event_name}
                </div>
                <div style={{ fontSize: 12, color: 'var(--gray-400)', marginBottom: 4 }}>
                  {od.studentName || od.student?.name} • {od.fromDate || od.from_date} → {od.toDate || od.to_date}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button
                    className="btn btn-success"
                    style={{ fontSize: 12, padding: '4px 12px' }}
                    disabled={reviewingId === id}
                    onClick={() => reviewOD(id, 'Approved')}
                  >
                    ✅ Approve
                  </button>
                  <button
                    className="btn btn-danger"
                    style={{ fontSize: 12, padding: '4px 12px' }}
                    disabled={reviewingId === id}
                    onClick={() => reviewOD(id, 'Rejected')}
                  >
                    ❌ Reject
                  </button>
                </div>
              </div>
            );
          })}
          {!pendingOD?.requests?.length && (
            <div className="empty-state">
              <div className="empty-state-icon">🎫</div>
              <div className="empty-state-desc">No pending OD requests</div>
            </div>
          )}
        </div>

        {/* Pending Leave Requests - with approve/reject */}
        <div className="card">
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0', marginBottom: 16 }}>
            📋 Leave Requests — Action Required
          </h3>
          {pendingLeave?.requests?.slice(0, 5).map((lr) => {
            const id = lr.id || lr.requestId;
            return (
              <div key={id} style={{
                background: 'var(--surface-dark-3)', borderRadius: 10,
                padding: '12px 14px', marginBottom: 10
              }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0' }}>
                  {lr.leaveType || lr.leave_type}
                  {lr.numberOfDays && <span style={{ color: 'var(--gray-500)', fontWeight: 400 }}> — {lr.numberOfDays} day(s)</span>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--gray-400)', marginBottom: 4 }}>
                  {lr.studentName} • {lr.fromDate} → {lr.toDate}
                </div>
                <div style={{ fontSize: 12, color: 'var(--gray-600)', marginBottom: 8, fontStyle: 'italic' }}>
                  "{lr.reason?.slice(0, 80)}{lr.reason?.length > 80 ? '...' : ''}"
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="btn btn-success"
                    style={{ fontSize: 12, padding: '4px 12px' }}
                    disabled={reviewingId === id}
                    onClick={() => reviewLeave(id, 'Approved')}
                  >
                    ✅ Approve
                  </button>
                  <button
                    className="btn btn-danger"
                    style={{ fontSize: 12, padding: '4px 12px' }}
                    disabled={reviewingId === id}
                    onClick={() => reviewLeave(id, 'Rejected')}
                  >
                    ❌ Reject
                  </button>
                </div>
              </div>
            );
          })}
          {!pendingLeave?.requests?.length && (
            <div className="empty-state">
              <div className="empty-state-icon">📋</div>
              <div className="empty-state-desc">No pending leave requests</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// FACULTY DASHBOARD
// ============================================================
export function FacultyDashboard() {
  const { user } = useAuth();
  const { data: pendingCorrections } = useQuery({
    queryKey: ['correction-pending'],
    queryFn: () => correctionApi.getPending(),
    select: (res) => res.data,
  });

  const { data: pendingOD } = useQuery({
    queryKey: ['od-pending'],
    queryFn: () => odApi.getPending(),
    select: (res) => res.data,
  });

  const stats = [
    { label: 'Pending Corrections', value: pendingCorrections?.corrections?.length || 0, icon: '✏️', color: 'var(--warning)' },
    { label: 'OD Requests', value: pendingOD?.requests?.length || 0, icon: '🎫', color: 'var(--success)' },
    { label: "Today's Date", value: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }), icon: '📅', color: 'var(--primary-400)' },
    { label: 'Department', value: user?.department || 'AIML', icon: '🏛️', color: 'var(--info)' },
  ];

  return (
    <div className="page-content animate-fade-in">
      <div style={{
        background: 'var(--gradient-brand)',
        borderRadius: 'var(--border-radius-xl)', padding: '24px 28px', marginBottom: 24
      }}>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', marginBottom: 4 }}>Welcome back</div>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: 'white' }}>{user?.full_name}</h2>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>
          {user?.designation || 'Faculty'} • {user?.department || 'CSE(AI&ML)'}
        </div>
      </div>

      <div className="grid-4 mb-6">
        {stats.map((stat) => (
          <div key={stat.label} className="stat-card">
            <div className="stat-icon" style={{ background: `${stat.color}20` }}>
              <span style={{ fontSize: 20 }}>{stat.icon}</span>
            </div>
            <div className="stat-value" style={{ color: stat.color }}>{stat.value}</div>
            <div className="stat-label">{stat.label}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <h3 style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0', marginBottom: 16 }}>✏️ Pending Correction Requests</h3>
        {pendingCorrections?.corrections?.map((c) => (
          <div key={c.id} style={{
            background: 'var(--surface-dark-3)', borderRadius: 8,
            padding: '12px 14px', marginBottom: 8
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0' }}>
                  {c.student_name || c.student?.name || 'Student'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 4 }}>
                  Marked: <span style={{ color: 'var(--danger)', fontWeight: 700 }}>{c.current_status || 'AB'}</span>
                  {' → '}Claims: <span style={{ color: 'var(--success)', fontWeight: 700 }}>{c.claimed_status}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--gray-600)', marginTop: 4, fontStyle: 'italic' }}>
                  {c.explanation}
                </div>
              </div>
              <div className={`badge badge-${c.status}`}>{c.status}</div>
            </div>
          </div>
        ))}
        {!pendingCorrections?.corrections?.length && (
          <div className="empty-state">
            <div className="empty-state-desc">No pending correction requests</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// DEO DASHBOARD
// ============================================================
export function DEODashboard() {
  const navigate = useNavigate();
  const { data: students } = useQuery({
    queryKey: ['students-list'],
    queryFn: () => usersApi.listStudents({ limit: 5 }),
    select: (res) => res.data,
  });

  const { data: pendingLeave } = useQuery({
    queryKey: ['leave-pending'],
    queryFn: () => leaveApi.getPending(),
    select: (res) => res.data,
  });

  const { data: pendingOD } = useQuery({
    queryKey: ['od-pending'],
    queryFn: () => odApi.getPending(),
    select: (res) => res.data,
  });

  const quickActions = [
    { label: 'Import Students', icon: '📥', color: '#6366f1', path: '/import-students' },
    { label: 'View Students', icon: '👥', color: '#8b5cf6', path: '/students' },
    { label: 'View Reports', icon: '📊', color: '#10b981', path: '/reports' },
    { label: 'Audit Logs', icon: '🔍', color: '#ef4444', path: '/audit' },
    { label: 'Timetable', icon: '📅', color: '#0ea5e9', path: '/timetable' },
    { label: 'System Settings', icon: '⚙️', color: '#6b7280', path: '/settings' },
    { label: 'OD Requests', icon: '🎫', color: '#f59e0b', path: '/od' },
    { label: 'Leave Requests', icon: '📋', color: '#06b6d4', path: '/leave' },
  ];

  return (
    <div className="page-content animate-fade-in">
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: '#e2e8f0' }}>⚙️ DEO Dashboard</h2>
        <p style={{ color: 'var(--gray-500)', fontSize: 14 }}>Administrative management panel</p>
      </div>

      <div className="grid-4 mb-6">
        {[
          { label: 'Total Students', value: students?.total || '-', icon: '👥', color: 'var(--primary-400)' },
          { label: 'Pending OD', value: pendingOD?.requests?.length || 0, icon: '🎫', color: 'var(--warning)' },
          { label: 'Pending Leave', value: pendingLeave?.requests?.length || 0, icon: '📋', color: 'var(--info)' },
          { label: 'Department', value: 'AIML', icon: '🏛️', color: 'var(--success)' },
        ].map((item) => (
          <div key={item.label} className="stat-card">
            <div className="stat-icon" style={{ background: `${item.color}20` }}>
              <span style={{ fontSize: 20 }}>{item.icon}</span>
            </div>
            <div className="stat-value" style={{ color: item.color }}>{item.value}</div>
            <div className="stat-label">{item.label}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <h3 style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0', marginBottom: 16 }}>⚡ Quick Actions</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {quickActions.map((qa) => (
            <div key={qa.label} className="quick-action" onClick={() => navigate(qa.path)}>
              <div className="quick-action-icon" style={{ background: `${qa.color}20` }}>
                {qa.icon}
              </div>
              {qa.label}
            </div>
          ))}
        </div>
      </div>

      {/* Recent Students Preview */}
      {students?.students?.length > 0 && (
        <div className="card" style={{ marginTop: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, alignItems: 'center' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0' }}>👥 Recent Students</h3>
            <button className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }}
              onClick={() => navigate('/students')}>View All</button>
          </div>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Register No</th>
                  <th>Year</th>
                  <th>Section</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {students.students.slice(0, 5).map((s) => (
                  <tr key={s.id || s.register_no}>
                    <td style={{ fontWeight: 600 }}>{s.name}</td>
                    <td style={{ fontSize: 12, color: 'var(--gray-400)' }}>{s.register_no}</td>
                    <td>{s.year}</td>
                    <td>{s.section}</td>
                    <td>
                      <span className={`badge badge-${s.status === 'ACTIVE' ? 'approved' : 'rejected'}`}>
                        {s.status || 'ACTIVE'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
