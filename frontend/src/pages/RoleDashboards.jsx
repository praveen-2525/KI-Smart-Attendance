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
  const qc = useQueryClient();
  const [reviewingId, setReviewingId] = useState(null);

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

  const reviewOD = async (id, action) => {
    setReviewingId(id);
    try {
      await odApi.review(id, action, '');
      toast.success(`OD request ${action.toLowerCase()} by HOD!`);
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
      toast.success(`Leave request ${action.toLowerCase()} by HOD!`);
      qc.invalidateQueries(['leave-pending']);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Action failed');
    } finally {
      setReviewingId(null);
    }
  };

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
        <p style={{ color: 'var(--gray-500)', fontSize: 14 }}>Department overview, substitute approval & pending actions</p>
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
        {/* Pending OD Requests */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0' }}>🎫 Pending OD Requests</h3>
            <button className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }}
              onClick={() => navigate('/od')}>View All</button>
          </div>
          {pendingOD?.requests?.slice(0, 5).map((od) => {
            const id = od.id || od.requestId;
            const advStatus = od.advisorStatus || 'PENDING';
            return (
              <div key={id} style={{
                background: 'var(--surface-dark-3)', borderRadius: 10,
                padding: '12px 14px', marginBottom: 10, borderLeft: '3px solid var(--warning)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0' }}>{od.eventName || od.event_name}</div>
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: 'rgba(245,158,11,0.2)', color: 'var(--warning)', fontWeight: 600 }}>
                    HOD Action Required
                  </span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 4 }}>
                  <strong>{od.studentName || od.student?.name}</strong> ({od.registerNumber || od.register_no}) • {od.department}
                </div>
                <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 2 }}>
                  📅 {od.fromDate} → {od.toDate} ({od.numberOfDays || 1} Days)
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ fontSize: 11, color: 'var(--gray-500)' }}>
                    Advisor: <span style={{ color: advStatus === 'APPROVED' ? 'var(--success)' : 'var(--warning)', fontWeight: 600 }}>{advStatus}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      className="btn btn-success"
                      style={{ fontSize: 11, padding: '3px 10px' }}
                      disabled={reviewingId === id}
                      onClick={() => reviewOD(id, 'Approved')}
                    >
                      ⚡ Direct Approve
                    </button>
                    <button
                      className="btn btn-danger"
                      style={{ fontSize: 11, padding: '3px 10px' }}
                      disabled={reviewingId === id}
                      onClick={() => reviewOD(id, 'Rejected')}
                    >
                      ❌ Reject
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
          {!pendingOD?.requests?.length && (
            <div style={{ color: 'var(--gray-600)', fontSize: 13, textAlign: 'center', padding: 20 }}>
              ✅ No pending OD requests
            </div>
          )}
        </div>

        {/* Pending Leave Requests */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0' }}>📋 Pending Leave Requests</h3>
            <button className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }}
              onClick={() => navigate('/leave')}>View All</button>
          </div>
          {pendingLeave?.requests?.slice(0, 5).map((lr) => {
            const id = lr.id || lr.requestId;
            const advStatus = lr.advisorStatus || 'PENDING';
            return (
              <div key={id} style={{
                background: 'var(--surface-dark-3)', borderRadius: 10,
                padding: '12px 14px', marginBottom: 10, borderLeft: '3px solid var(--info)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0' }}>
                    {lr.leaveType || lr.leave_type} ({lr.numberOfDays || 1} day)
                  </div>
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: 'rgba(6,182,212,0.2)', color: 'var(--info)', fontWeight: 600 }}>
                    HOD Action Required
                  </span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 4 }}>
                  <strong>{lr.studentName || lr.student?.name}</strong> ({lr.registerNumber}) • {lr.department}
                </div>
                <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 2 }}>
                  📅 {lr.fromDate} → {lr.toDate}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ fontSize: 11, color: 'var(--gray-500)' }}>
                    Advisor: <span style={{ color: advStatus === 'APPROVED' ? 'var(--success)' : 'var(--warning)', fontWeight: 600 }}>{advStatus}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      className="btn btn-success"
                      style={{ fontSize: 11, padding: '3px 10px' }}
                      disabled={reviewingId === id}
                      onClick={() => reviewLeave(id, 'Approved')}
                    >
                      ⚡ Direct Approve
                    </button>
                    <button
                      className="btn btn-danger"
                      style={{ fontSize: 11, padding: '3px 10px' }}
                      disabled={reviewingId === id}
                      onClick={() => reviewLeave(id, 'Rejected')}
                    >
                      ❌ Reject
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
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
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'registration' | 'students'

  // Student Registration Form State
  const [regForm, setRegForm] = useState({
    full_name: '',
    register_number: '',
    roll_number: '',
    email: '',
    personal_email: '',
    date_of_birth: '',
    gender: 'Male',
    department: 'CSE(AI&ML)',
    year: 'III Year',
    section: 'AIML',
    batch: '2022-2026',
    mobile_number: '',
    admission_number: '',
    account_status: 'ACTIVE',
  });
  const [registering, setRegistering] = useState(false);

  // Student Management List State
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [secFilter, setSecFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  // Deactivation Modal State
  const [selectedStudentForDeactivate, setSelectedStudentForDeactivate] = useState(null);
  const [deactivateReason, setDeactivateReason] = useState('');
  const [deactivating, setDeactivating] = useState(false);

  const { data: studentsData, isLoading: loadingStudents } = useQuery({
    queryKey: ['students-list', { search, department: deptFilter, year: yearFilter, section: secFilter, status: statusFilter, page }],
    queryFn: () => usersApi.listStudents({
      search: search || undefined,
      department: deptFilter || undefined,
      year: yearFilter || undefined,
      section: secFilter || undefined,
      status: statusFilter || undefined,
      page,
      limit: 15
    }),
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

  const handleRegisterStudent = async (e) => {
    e.preventDefault();
    if (!regForm.full_name.trim() || !regForm.register_number.trim() || !regForm.roll_number.trim() || !regForm.email.trim() || !regForm.date_of_birth) {
      toast.error('Student Name, Register Number, Roll Number, College Email, and Date of Birth are required.');
      return;
    }

    setRegistering(true);
    try {
      await usersApi.createStudent({
        ...regForm,
        date_of_birth: regForm.date_of_birth,
      });
      toast.success('Student registered successfully.');
      setRegForm({
        full_name: '',
        register_number: '',
        roll_number: '',
        email: '',
        personal_email: '',
        date_of_birth: '',
        gender: 'Male',
        department: 'CSE(AI&ML)',
        year: 'III Year',
        section: 'AIML',
        batch: '2022-2026',
        mobile_number: '',
        admission_number: '',
        account_status: 'ACTIVE',
      });
      qc.invalidateQueries(['students-list']);
      setActiveTab('students');
    } catch (err) {
      const detail = err.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Failed to register student.');
    } finally {
      setRegistering(false);
    }
  };

  const handleDeactivateStudent = async (e) => {
    e.preventDefault();
    if (!selectedStudentForDeactivate) return;
    if (!deactivateReason.trim()) {
      toast.error('Please enter a valid reason for deactivation.');
      return;
    }

    setDeactivating(true);
    try {
      await usersApi.deactivateStudent(selectedStudentForDeactivate.id, deactivateReason);
      toast.success(`Student ${selectedStudentForDeactivate.name} updated successfully.`);
      setSelectedStudentForDeactivate(null);
      setDeactivateReason('');
      qc.invalidateQueries(['students-list']);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to deactivate student.');
    } finally {
      setDeactivating(false);
    }
  };

  const totalPages = studentsData ? Math.ceil(studentsData.total / 15) : 1;

  const quickActions = [
    { label: 'Register Student', icon: '📝', color: '#6366f1', action: () => setActiveTab('registration') },
    { label: 'View My Students', icon: '👥', color: '#8b5cf6', action: () => setActiveTab('students') },
    { label: 'View Reports', icon: '📊', color: '#10b981', action: () => navigate('/reports') },
    { label: 'Audit Logs', icon: '🔍', color: '#ef4444', action: () => navigate('/audit') },
    { label: 'Timetable', icon: '📅', color: '#0ea5e9', action: () => navigate('/timetable') },
    { label: 'System Settings', icon: '⚙️', color: '#6b7280', action: () => navigate('/settings') },
    { label: 'OD Requests', icon: '🎫', color: '#f59e0b', action: () => navigate('/od') },
    { label: 'Leave Requests', icon: '📋', color: '#06b6d4', action: () => navigate('/leave') },
  ];

  return (
    <div className="page-content animate-fade-in" style={{ paddingBottom: 40 }}>
      {/* Header & Tabs */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 800, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>⚙️</span> DEO Dashboard
          </h2>
          <p style={{ color: 'var(--gray-400)', fontSize: 14, marginTop: 2 }}>
            Data Entry Officer Portal — Complete Student Registration & Management Control
          </p>
        </div>

        {/* Tab switcher */}
        <div style={{ display: 'flex', background: 'var(--surface-dark-2)', borderRadius: 12, padding: 4, border: '1px solid var(--border-dark)' }}>
          <button
            className={`btn btn-sm ${activeTab === 'overview' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setActiveTab('overview')}
            style={{ borderRadius: 8, padding: '8px 16px', fontSize: 13 }}
          >
            📊 Overview
          </button>
          <button
            className={`btn btn-sm ${activeTab === 'registration' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setActiveTab('registration')}
            style={{ borderRadius: 8, padding: '8px 16px', fontSize: 13 }}
          >
            📝 Student Registration
          </button>
          <button
            className={`btn btn-sm ${activeTab === 'students' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setActiveTab('students')}
            style={{ borderRadius: 8, padding: '8px 16px', fontSize: 13 }}
          >
            👥 My Students ({studentsData?.total || 0})
          </button>
        </div>
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <>
          <div className="grid-4 mb-6">
            {[
              { label: 'Total Registered Students', value: studentsData?.total || '-', icon: '👥', color: 'var(--primary-400)' },
              { label: 'Pending OD Requests', value: pendingOD?.requests?.length || 0, icon: '🎫', color: 'var(--warning)' },
              { label: 'Pending Leave Requests', value: pendingLeave?.requests?.length || 0, icon: '📋', color: 'var(--info)' },
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

          <div className="card mb-6">
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0', marginBottom: 16 }}>⚡ Quick Actions</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              {quickActions.map((qa) => (
                <div key={qa.label} className="quick-action" onClick={qa.action}>
                  <div className="quick-action-icon" style={{ background: `${qa.color}20` }}>
                    {qa.icon}
                  </div>
                  {qa.label}
                </div>
              ))}
            </div>
          </div>

          {/* Recent Students Preview */}
          {studentsData?.students?.length > 0 && (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, alignItems: 'center' }}>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0' }}>👥 Recent Active Students</h3>
                <button className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 12px' }}
                  onClick={() => setActiveTab('students')}>View All Students →</button>
              </div>
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Register No</th>
                      <th>Roll No</th>
                      <th>Department</th>
                      <th>Year & Section</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {studentsData.students.slice(0, 5).map((s) => (
                      <tr key={s.id || s.register_no}>
                        <td style={{ fontWeight: 600, color: '#f8fafc' }}>{s.name}</td>
                        <td style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--gray-400)' }}>{s.register_no}</td>
                        <td style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--gray-400)' }}>{s.roll_number || '-'}</td>
                        <td>{s.department}</td>
                        <td>{s.year} - {s.section}</td>
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
        </>
      )}

      {/* TAB 2: STUDENT REGISTRATION (DEO ONLY) */}
      {activeTab === 'registration' && (
        <div className="card" style={{ maxWidth: 950, margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, borderBottom: '1px solid var(--border-dark)', paddingBottom: 16 }}>
            <div>
              <h3 style={{ fontSize: 20, fontWeight: 800, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span>📝</span> DEO Student Registration
              </h3>
              <p style={{ color: 'var(--gray-400)', fontSize: 13, marginTop: 4 }}>
                Register new student accounts. Default login password will be set to the student's Date of Birth (DDMMYYYY).
              </p>
            </div>
            <div style={{ background: 'rgba(99,102,241,0.15)', color: 'var(--primary-400)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 20, padding: '4px 14px', fontSize: 12, fontWeight: 700 }}>
              DEO Controlled
            </div>
          </div>

          <form onSubmit={handleRegisterStudent}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 18 }}>
              {/* Student Name */}
              <div className="form-group">
                <label className="form-label">Student Name <span style={{ color: 'var(--danger)' }}>*</span></label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Praveen S"
                  value={regForm.full_name}
                  onChange={(e) => setRegForm({ ...regForm, full_name: e.target.value })}
                  required
                />
              </div>

              {/* Register Number */}
              <div className="form-group">
                <label className="form-label">Register Number <span style={{ color: 'var(--danger)' }}>*</span> (12 Digits)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. 7376241AI101"
                  value={regForm.register_number}
                  onChange={(e) => setRegForm({ ...regForm, register_number: e.target.value.trim() })}
                  required
                />
              </div>

              {/* Roll Number */}
              <div className="form-group">
                <label className="form-label">Roll Number <span style={{ color: 'var(--danger)' }}>*</span></label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. 24AIM040"
                  value={regForm.roll_number}
                  onChange={(e) => setRegForm({ ...regForm, roll_number: e.target.value.trim() })}
                  required
                />
              </div>

              {/* College Email */}
              <div className="form-group">
                <label className="form-label">College Email <span style={{ color: 'var(--danger)' }}>*</span></label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="e.g. student@kitech.edu.in"
                  value={regForm.email}
                  onChange={(e) => setRegForm({ ...regForm, email: e.target.value.trim().toLowerCase() })}
                  required
                />
              </div>

              {/* Personal Email */}
              <div className="form-group">
                <label className="form-label">Personal Email (Optional)</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="e.g. personal@gmail.com"
                  value={regForm.personal_email}
                  onChange={(e) => setRegForm({ ...regForm, personal_email: e.target.value.trim().toLowerCase() })}
                />
              </div>

              {/* Date of Birth */}
              <div className="form-group">
                <label className="form-label">Date of Birth <span style={{ color: 'var(--danger)' }}>*</span></label>
                <input
                  type="date"
                  className="form-input"
                  value={regForm.date_of_birth}
                  onChange={(e) => setRegForm({ ...regForm, date_of_birth: e.target.value })}
                  required
                />
                <span style={{ fontSize: 11, color: 'var(--gray-500)', marginTop: 4, display: 'block' }}>
                  Used as default login password (Format: DDMMYYYY)
                </span>
              </div>

              {/* Gender */}
              <div className="form-group">
                <label className="form-label">Gender</label>
                <select
                  className="form-select"
                  value={regForm.gender}
                  onChange={(e) => setRegForm({ ...regForm, gender: e.target.value })}
                >
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              {/* Department */}
              <div className="form-group">
                <label className="form-label">Department <span style={{ color: 'var(--danger)' }}>*</span></label>
                <select
                  className="form-select"
                  value={regForm.department}
                  onChange={(e) => setRegForm({ ...regForm, department: e.target.value })}
                >
                  <option value="CSE(AI&ML)">CSE(AI&ML)</option>
                  <option value="CSE">CSE</option>
                  <option value="ECE">ECE</option>
                  <option value="EEE">EEE</option>
                  <option value="MECH">MECH</option>
                  <option value="CIVIL">CIVIL</option>
                  <option value="IT">IT</option>
                </select>
              </div>

              {/* Year */}
              <div className="form-group">
                <label className="form-label">Year <span style={{ color: 'var(--danger)' }}>*</span></label>
                <select
                  className="form-select"
                  value={regForm.year}
                  onChange={(e) => setRegForm({ ...regForm, year: e.target.value })}
                >
                  <option value="I Year">I Year</option>
                  <option value="II Year">II Year</option>
                  <option value="III Year">III Year</option>
                  <option value="IV Year">IV Year</option>
                </select>
              </div>

              {/* Section */}
              <div className="form-group">
                <label className="form-label">Section <span style={{ color: 'var(--danger)' }}>*</span></label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. AIML, A, B"
                  value={regForm.section}
                  onChange={(e) => setRegForm({ ...regForm, section: e.target.value })}
                  required
                />
              </div>

              {/* Batch */}
              <div className="form-group">
                <label className="form-label">Batch</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. 2022-2026"
                  value={regForm.batch}
                  onChange={(e) => setRegForm({ ...regForm, batch: e.target.value })}
                />
              </div>

              {/* Phone Number */}
              <div className="form-group">
                <label className="form-label">Phone Number (10 Digits)</label>
                <input
                  type="tel"
                  className="form-input"
                  placeholder="e.g. 9876543210"
                  value={regForm.mobile_number}
                  onChange={(e) => setRegForm({ ...regForm, mobile_number: e.target.value.trim() })}
                />
              </div>

              {/* Admission Number */}
              <div className="form-group">
                <label className="form-label">Admission Number (Optional)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. ADM-2024-040"
                  value={regForm.admission_number}
                  onChange={(e) => setRegForm({ ...regForm, admission_number: e.target.value.trim() })}
                />
              </div>

              {/* Account Status */}
              <div className="form-group">
                <label className="form-label">Status</label>
                <select
                  className="form-select"
                  value={regForm.account_status}
                  onChange={(e) => setRegForm({ ...regForm, account_status: e.target.value })}
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="INACTIVE">INACTIVE</option>
                </select>
              </div>
            </div>

            <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setRegForm({
                  full_name: '', register_number: '', roll_number: '', email: '', personal_email: '',
                  date_of_birth: '', gender: 'Male', department: 'CSE(AI&ML)', year: 'III Year',
                  section: 'AIML', batch: '2022-2026', mobile_number: '', admission_number: '', account_status: 'ACTIVE'
                })}
              >
                Reset Form
              </button>
              <button type="submit" className="btn btn-primary" disabled={registering} style={{ padding: '10px 28px' }}>
                {registering ? <><span className="spinner" /> Registering Student...</> : '🚀 Register Student'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 3: STUDENT MANAGEMENT (MY STUDENTS LIST) */}
      {activeTab === 'students' && (
        <div className="space-y-4">
          {/* Filters card */}
          <div className="card">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              <input
                type="text"
                className="form-input"
                placeholder="Search Register No, Roll No, Name..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              />
              <select className="form-select" value={deptFilter} onChange={(e) => { setDeptFilter(e.target.value); setPage(1); }}>
                <option value="">All Departments</option>
                <option value="CSE(AI&ML)">CSE(AI&ML)</option>
                <option value="CSE">CSE</option>
                <option value="ECE">ECE</option>
                <option value="EEE">EEE</option>
                <option value="MECH">MECH</option>
                <option value="CIVIL">CIVIL</option>
                <option value="IT">IT</option>
              </select>
              <select className="form-select" value={yearFilter} onChange={(e) => { setYearFilter(e.target.value); setPage(1); }}>
                <option value="">All Years</option>
                <option value="I Year">I Year</option>
                <option value="II Year">II Year</option>
                <option value="III Year">III Year</option>
                <option value="IV Year">IV Year</option>
              </select>
              <select className="form-select" value={secFilter} onChange={(e) => { setSecFilter(e.target.value); setPage(1); }}>
                <option value="">All Sections</option>
                <option value="AIML">AIML</option>
                <option value="A">A</option>
                <option value="B">B</option>
                <option value="C">C</option>
              </select>
              <select className="form-select" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
                <option value="">All Statuses</option>
                <option value="ACTIVE">ACTIVE</option>
                <option value="INACTIVE">INACTIVE</option>
              </select>
            </div>
          </div>

          {/* Table */}
          <div className="card">
            {loadingStudents ? (
              <div style={{ textAlign: 'center', padding: 40 }}><span className="spinner" /> Loading registered students...</div>
            ) : (
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Student Name</th>
                      <th>Register No</th>
                      <th>Roll No</th>
                      <th>Department</th>
                      <th>Year</th>
                      <th>Section</th>
                      <th>College Email</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {studentsData?.students?.map((s, idx) => (
                      <tr key={s.id || s.register_no}>
                        <td style={{ color: 'var(--gray-500)', fontSize: 12 }}>{(page - 1) * 15 + idx + 1}</td>
                        <td style={{ fontWeight: 700, color: '#f8fafc' }}>{s.name}</td>
                        <td style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--primary-400)' }}>{s.register_no}</td>
                        <td style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--gray-400)' }}>{s.roll_number || '-'}</td>
                        <td style={{ fontSize: 12 }}>{s.department}</td>
                        <td>{s.year}</td>
                        <td>{s.section}</td>
                        <td style={{ fontSize: 12, color: 'var(--gray-400)' }}>{s.email}</td>
                        <td>
                          <span className={`badge badge-${s.status === 'ACTIVE' ? 'approved' : 'rejected'}`}>
                            {s.status || 'ACTIVE'}
                          </span>
                        </td>
                        <td>
                          {s.status === 'ACTIVE' ? (
                            <button
                              className="btn btn-danger"
                              style={{ fontSize: 11, padding: '4px 10px' }}
                              onClick={() => setSelectedStudentForDeactivate(s)}
                            >
                              🚫 Deactivate
                            </button>
                          ) : (
                            <button
                              className="btn btn-success"
                              style={{ fontSize: 11, padding: '4px 10px' }}
                              onClick={() => {
                                usersApi.toggleStatus(s.id).then(() => {
                                  toast.success('Student account reactivated successfully.');
                                  qc.invalidateQueries(['students-list']);
                                });
                              }}
                            >
                              ✅ Reactivate
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {!studentsData?.students?.length && (
                      <tr>
                        <td colSpan={10} style={{ textAlign: 'center', color: 'var(--gray-500)', padding: 40 }}>
                          No students registered matching criteria.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
                <button className="btn btn-secondary" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Prev</button>
                <span style={{ padding: '8px 16px', color: 'var(--gray-400)', fontSize: 13 }}>Page {page} of {totalPages}</span>
                <button className="btn btn-secondary" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* DEACTIVATION REASON MODAL */}
      {selectedStudentForDeactivate && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20
        }}>
          <div className="card animate-fade-in" style={{ width: '100%', maxWidth: 480, padding: 24, border: '1px solid var(--danger)' }}>
            <h3 style={{ fontSize: 18, fontWeight: 800, color: '#fca5a5', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>⚠️</span> Deactivate Student Account
            </h3>
            <p style={{ color: 'var(--gray-400)', fontSize: 13, marginBottom: 16 }}>
              You are deactivating <strong>{selectedStudentForDeactivate.name}</strong> ({selectedStudentForDeactivate.register_no}). The student will no longer be able to log in, but historical attendance, OD, and leave records will remain preserved.
            </p>

            <form onSubmit={handleDeactivateStudent}>
              <div className="form-group mb-4">
                <label className="form-label">Deactivation Reason <span style={{ color: 'var(--danger)' }}>*</span></label>
                <textarea
                  className="form-textarea"
                  rows={3}
                  placeholder="e.g. Student transferred, discontinued, or administrative hold..."
                  value={deactivateReason}
                  onChange={(e) => setDeactivateReason(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => { setSelectedStudentForDeactivate(null); setDeactivateReason(''); }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-danger"
                  disabled={deactivating}
                >
                  {deactivating ? <><span className="spinner" /> Deactivating...</> : 'Confirm Deactivation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
