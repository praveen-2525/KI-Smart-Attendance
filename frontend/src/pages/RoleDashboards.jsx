import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { reportsApi, odApi, leaveApi, correctionApi, usersApi } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

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

  const stats = [
    { label: 'Total Students', value: overview?.total_students || 0, icon: '👥', color: 'var(--primary-400)' },
    { label: 'Pending OD', value: overview?.pending_od_requests || 0, icon: '🎫', color: 'var(--warning)' },
    { label: 'Pending Leave', value: overview?.pending_leave_requests || 0, icon: '📋', color: 'var(--info)' },
    { label: 'Proof Pending', value: overview?.pending_proof_verification || 0, icon: '📎', color: 'var(--accent-violet)' },
    { label: 'Corrections', value: overview?.pending_correction_requests || 0, icon: '✏️', color: 'var(--accent-rose)' },
    { label: 'Exceptions', value: overview?.unacknowledged_exceptions || 0, icon: '⚠️', color: 'var(--danger)' },
  ];

  return (
    <div className="page-content animate-fade-in">
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: '#e2e8f0' }}>HOD Dashboard</h2>
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
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0', marginBottom: 16 }}>🎫 Pending OD Requests</h3>
          {pendingOD?.requests?.slice(0, 5).map((od) => (
            <div key={od.id} style={{
              background: 'var(--surface-dark-3)', borderRadius: 8,
              padding: '10px 14px', marginBottom: 8
            }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0' }}>{od.event_name}</div>
              {od.student && <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>{od.student.name}</div>}
              <div style={{ fontSize: 12, color: 'var(--gray-600)', marginTop: 4 }}>
                {od.from_date} → {od.to_date} • {od.participation_type}
              </div>
            </div>
          ))}
          {!pendingOD?.requests?.length && (
            <div style={{ color: 'var(--gray-600)', fontSize: 13, textAlign: 'center', padding: 20 }}>
              No pending OD requests
            </div>
          )}
        </div>

        {/* Pending Leave */}
        <div className="card">
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0', marginBottom: 16 }}>📋 Pending Leave Requests</h3>
          {pendingLeave?.requests?.slice(0, 5).map((lr) => (
            <div key={lr.id} style={{
              background: 'var(--surface-dark-3)', borderRadius: 8,
              padding: '10px 14px', marginBottom: 8
            }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0' }}>
                {lr.from_date} → {lr.to_date}
              </div>
              {lr.student && <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>{lr.student.name}</div>}
              <div style={{ fontSize: 12, color: 'var(--gray-600)' }}>{lr.reason}</div>
            </div>
          ))}
          {!pendingLeave?.requests?.length && (
            <div style={{ color: 'var(--gray-600)', fontSize: 13, textAlign: 'center', padding: 20 }}>
              No pending leave requests
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

  const stats = [
    { label: 'Pending Corrections', value: pendingCorrections?.corrections?.length || 0, icon: '✏️', color: 'var(--warning)' },
    { label: "Today's Classes", value: '-', icon: '📚', color: 'var(--primary-400)' },
    { label: 'OD Students Today', value: '-', icon: '🎫', color: 'var(--success)' },
    { label: 'Leave Students Today', value: '-', icon: '📋', color: 'var(--info)' },
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
          {user?.designation || 'Faculty'} • {user?.department}
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
                {c.student && <div style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0' }}>{c.student.name}</div>}
                {c.record && <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>
                  {c.record.subject_name} — {c.record.date} — P{c.record.period_number}
                </div>}
                <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 4 }}>
                  Marked: <span style={{ color: 'var(--danger)', fontWeight: 700 }}>{c.current_status}</span>
                  {' → '}Claims: <span style={{ color: 'var(--success)', fontWeight: 700 }}>{c.claimed_status}</span>
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

  return (
    <div className="page-content animate-fade-in">
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: '#e2e8f0' }}>DEO Dashboard</h2>
        <p style={{ color: 'var(--gray-500)', fontSize: 14 }}>Administrative management panel</p>
      </div>

      <div className="grid-4 mb-6">
        {[
          { label: 'Total Students', value: students?.total || '-', icon: '👥', color: 'var(--primary-400)', path: '/students' },
          { label: 'Departments', value: '1', icon: '🏛️', color: 'var(--success)', path: '/admin' },
          { label: 'ERP Sync', value: 'Pending', icon: '🔗', color: 'var(--warning)', path: '/erp' },
          { label: 'System Settings', value: '→', icon: '⚙️', color: 'var(--info)', path: '/settings' },
        ].map((item) => (
          <div key={item.label} className="stat-card" style={{ cursor: 'pointer' }}>
            <div className="stat-icon" style={{ background: `${item.color}20` }}>
              <span style={{ fontSize: 20 }}>{item.icon}</span>
            </div>
            <div className="stat-value" style={{ color: item.color }}>{item.value}</div>
            <div className="stat-label">{item.label}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <h3 style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0', marginBottom: 16 }}>Quick Actions</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {[
            { label: 'Import Students', icon: '📥', color: '#6366f1', path: '/import-students' },
            { label: 'Add Faculty', icon: '👨‍🏫+', color: '#8b5cf6', path: '/admin' },
            { label: 'Manage Timetable', icon: '📅', color: '#10b981', path: '/admin' },
            { label: 'Import ERP Data', icon: '🔗', color: '#f59e0b', path: '/erp' },
            { label: 'View Reports', icon: '📊', color: '#0ea5e9', path: '/reports' },
            { label: 'Audit Logs', icon: '🔍', color: '#ef4444', path: '/audit' },
            { label: 'System Settings', icon: '⚙️', color: '#6b7280', path: '/settings' },
            { label: 'ERP Integration', icon: '🔌', color: '#06b6d4', path: '/erp' },
          ].map((qa) => (
            <div key={qa.label} className="quick-action" onClick={() => navigate(qa.path)}>
              <div className="quick-action-icon" style={{ background: `${qa.color}20` }}>
                {qa.icon}
              </div>
              {qa.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
