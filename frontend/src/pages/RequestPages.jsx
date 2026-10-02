import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { lateApi, correctionApi } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

// ============================================================
// LATE ARRIVAL PAGE
// ============================================================
export function LateArrivalPage() {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    arrival_date: new Date().toISOString().split('T')[0],
    expected_arrival_time: '',
    reason: '',
    description: ''
  });
  const [docFile, setDocFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ['late-my'],
    queryFn: () => lateApi.getMy(),
    select: (res) => res.data,
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => fd.append(k, v));
    if (docFile) fd.append('document', docFile);
    try {
      await lateApi.inform(fd);
      toast.success('Late arrival notification sent!');
      setShowForm(false);
      qc.invalidateQueries(['late-my']);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to send notification');
    } finally {
      setSubmitting(false);
    }
  };

  const reasons = ['Bus Delay', 'Bus Missed', 'Traffic', 'Transport Issue', 'Personal Reason', 'Other'];

  return (
    <div className="page-content animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#e2e8f0' }}>⏰ Late Arrival / Inform</h2>
          <p style={{ color: 'var(--gray-500)', fontSize: 14 }}>
            Notify faculty and advisor about your late arrival.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? '✕ Cancel' : '+ Inform Late Arrival'}
        </button>
      </div>

      <div className="card mb-6" style={{ background: 'rgba(99,102,241,0.05)', borderColor: 'rgba(99,102,241,0.2)' }}>
        <div style={{ fontSize: 13, color: 'var(--gray-400)' }}>
          📌 <strong style={{ color: 'var(--primary-300)' }}>Note:</strong> Late arrival notification does <strong>not</strong> automatically mark you as Present.
          Faculty will verify your attendance and mark the appropriate status. This notification helps faculty and advisor
          know your expected arrival time.
        </div>
      </div>

      {showForm && (
        <div className="card mb-6">
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0', marginBottom: 16 }}>Inform Late Arrival</h3>
          <form onSubmit={handleSubmit}>
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Date *</label>
                <input type="date" className="form-input" value={form.arrival_date}
                  onChange={e => setForm(f => ({ ...f, arrival_date: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label className="form-label">Expected Arrival Time *</label>
                <input type="time" className="form-input" value={form.expected_arrival_time}
                  onChange={e => setForm(f => ({ ...f, expected_arrival_time: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label className="form-label">Reason *</label>
                <select className="form-select" value={form.reason}
                  onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} required>
                  <option value="">Select reason</option>
                  {reasons.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Supporting Document (optional)</label>
                <input type="file" className="form-input" accept="image/*,.pdf"
                  onChange={e => setDocFile(e.target.files[0])} />
              </div>
              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label className="form-label">Additional Details</label>
                <textarea className="form-textarea" value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
            </div>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? <><span className="spinner" /> Sending...</> : '📤 Send Notification'}
            </button>
          </form>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {data?.requests?.map((r) => (
          <div key={r.id} className="card">
            <div style={{ display: 'flex', justify: 'space-between', gap: 20 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0' }}>
                  {r.date} — Expected at {r.expected_arrival_time?.slice(0, 5)}
                </div>
                <div style={{ fontSize: 13, color: 'var(--gray-400)' }}>Reason: {r.reason}</div>
              </div>
              <div className={`badge badge-${r.status === 'acknowledged' ? 'approved' : 'submitted'}`}>
                {r.status}
              </div>
            </div>
          </div>
        ))}
        {!data?.requests?.length && !showForm && (
          <div className="card">
            <div className="empty-state">
              <div className="empty-state-icon">⏰</div>
              <div className="empty-state-title">No late arrival notifications</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// CORRECTION PAGE
// ============================================================
export function CorrectionPage() {
  const { user } = useAuth();
  const isStudent = user?.role === 'student';
  const isReviewer = ['faculty', 'advisor', 'hod'].includes(user?.role);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ attendance_record_id: '', claimed_status: 'PR', explanation: '' });
  const [submitting, setSubmitting] = useState(false);
  const qc = useQueryClient();

  const { data: myCorrections } = useQuery({
    queryKey: ['correction-my'],
    queryFn: () => correctionApi.getMy(),
    enabled: isStudent,
    select: (res) => res.data,
  });

  const { data: pendingCorrections } = useQuery({
    queryKey: ['correction-pending'],
    queryFn: () => correctionApi.getPending(),
    enabled: isReviewer,
    select: (res) => res.data,
  });

  const approveMutation = useMutation({
    mutationFn: ({ id }) => correctionApi.approve(id),
    onSuccess: () => { toast.success('Correction approved! Attendance updated.'); qc.invalidateQueries(['correction-pending']); },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }) => correctionApi.reject(id, reason),
    onSuccess: () => { toast.success('Correction rejected'); qc.invalidateQueries(['correction-pending']); },
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await correctionApi.submit({
        attendance_record_id: Number(form.attendance_record_id),
        claimed_status: form.claimed_status,
        explanation: form.explanation
      });
      toast.success('Correction request submitted!');
      setShowForm(false);
      qc.invalidateQueries(['correction-my']);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to submit correction');
    } finally {
      setSubmitting(false);
    }
  };

  const corrections = isStudent ? (myCorrections?.corrections || []) : (pendingCorrections?.corrections || []);

  const STATUS_COLORS = {
    pending: { color: '#f59e0b', label: '⏳ Pending' },
    faculty_review: { color: '#60a5fa', label: '👁️ Faculty Review' },
    approved: { color: '#10b981', label: '✅ Approved' },
    rejected: { color: '#ef4444', label: '❌ Rejected' },
    escalated: { color: '#8b5cf6', label: '↑ Escalated' },
  };

  return (
    <div className="page-content animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#e2e8f0' }}>✏️ Attendance Correction</h2>
          <p style={{ color: 'var(--gray-500)', fontSize: 14 }}>
            {isStudent ? 'Report incorrect attendance marks for faculty review.' : 'Review and process attendance correction requests.'}
          </p>
        </div>
        {isStudent && (
          <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
            {showForm ? '✕ Cancel' : '+ Report Wrong Attendance'}
          </button>
        )}
      </div>

      <div className="card mb-6" style={{ background: 'rgba(239,68,68,0.05)', borderColor: 'rgba(239,68,68,0.2)' }}>
        <div style={{ fontSize: 13, color: 'var(--gray-400)' }}>
          📌 <strong style={{ color: 'var(--accent-rose)' }}>Important:</strong> You cannot directly modify attendance.
          Submit a correction request with your attendance record ID and explanation. Faculty will review and approve/reject.
          All changes are logged in the audit trail.
        </div>
      </div>

      {showForm && isStudent && (
        <div className="card mb-6">
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0', marginBottom: 16 }}>Report Wrong Attendance</h3>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Attendance Record ID *</label>
              <input
                type="number"
                className="form-input"
                placeholder="Get ID from your attendance history"
                value={form.attendance_record_id}
                onChange={e => setForm(f => ({ ...f, attendance_record_id: e.target.value }))}
                required
              />
              <span className="form-error">Go to Attendance History to find the record ID for the wrong entry</span>
            </div>
            <div className="form-group">
              <label className="form-label">I was actually *</label>
              <select className="form-select" value={form.claimed_status}
                onChange={e => setForm(f => ({ ...f, claimed_status: e.target.value }))}>
                <option value="PR">Present (PR)</option>
                <option value="OD">On Duty (OD)</option>
                <option value="LE">Leave (LE)</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Explanation *</label>
              <textarea
                className="form-textarea"
                placeholder="Explain why you believe the attendance is wrong..."
                value={form.explanation}
                onChange={e => setForm(f => ({ ...f, explanation: e.target.value }))}
                required
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? <><span className="spinner" /> Submitting...</> : '📤 Submit Correction Request'}
            </button>
          </form>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {corrections.length === 0 ? (
          <div className="card">
            <div className="empty-state">
              <div className="empty-state-icon">✏️</div>
              <div className="empty-state-title">No correction requests</div>
              <div className="empty-state-desc">
                {isStudent ? 'No correction requests submitted yet.' : 'No pending correction requests.'}
              </div>
            </div>
          </div>
        ) : corrections.map((c) => {
          const statusInfo = STATUS_COLORS[c.status] || { color: 'var(--gray-400)', label: c.status };
          return (
            <div key={c.id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: statusInfo.color }}>
                      {statusInfo.label}
                    </div>
                    {c.record && (
                      <span style={{ fontSize: 13, color: '#e2e8f0' }}>
                        {c.record.subject_name} — {c.record.date} — P{c.record.period_number}
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 20, fontSize: 13, color: 'var(--gray-400)' }}>
                    <span>
                      Marked: <span className="badge badge-ab">{c.current_status}</span>
                    </span>
                    <span>→</span>
                    <span>
                      Claims: <span className="badge badge-pr">{c.claimed_status}</span>
                    </span>
                  </div>

                  <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 8 }}>
                    {c.explanation}
                  </div>

                  {isReviewer && c.student && (
                    <div style={{ marginTop: 6, fontSize: 13, color: 'var(--gray-500)' }}>
                      Student: <strong style={{ color: '#e2e8f0' }}>{c.student.name}</strong> ({c.student.register_number})
                    </div>
                  )}

                  {c.faculty_notes && (
                    <div style={{ marginTop: 6, fontSize: 12, color: 'var(--gray-500)', fontStyle: 'italic' }}>
                      Faculty note: {c.faculty_notes}
                    </div>
                  )}
                </div>

                {isReviewer && ['pending', 'faculty_review'].includes(c.status) && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-success btn-sm"
                      onClick={() => approveMutation.mutate({ id: c.id })}>
                      ✅ Approve
                    </button>
                    <button className="btn btn-danger btn-sm"
                      onClick={() => {
                        const reason = prompt('Reason for rejection:');
                        if (reason) rejectMutation.mutate({ id: c.id, reason });
                      }}>
                      ❌ Reject
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
