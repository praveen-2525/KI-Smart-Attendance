import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { leaveApi } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

export default function LeavePage() {
  const { user } = useAuth();
  const isStudent = user?.role === 'student';
  const isReviewer = ['advisor', 'hod'].includes(user?.role);
  const [showSubmit, setShowSubmit] = useState(false);
  const qc = useQueryClient();

  const [form, setForm] = useState({
    from_date: '', to_date: '', reason: '', description: ''
  });
  const [docFile, setDocFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const { data: myLeave } = useQuery({
    queryKey: ['leave-my'],
    queryFn: () => leaveApi.getMy(),
    enabled: isStudent,
    select: (res) => res.data,
  });

  const { data: pendingLeave } = useQuery({
    queryKey: ['leave-pending'],
    queryFn: () => leaveApi.getPending(),
    enabled: isReviewer,
    select: (res) => res.data,
  });

  const approveMutation = useMutation({
    mutationFn: ({ id }) => leaveApi.approve(id),
    onSuccess: () => { toast.success('Leave approved!'); qc.invalidateQueries(['leave-pending']); },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }) => leaveApi.reject(id, reason),
    onSuccess: () => { toast.success('Leave rejected'); qc.invalidateQueries(['leave-pending']); },
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => fd.append(k, v));
    if (docFile) fd.append('document', docFile);
    try {
      await leaveApi.submit(fd);
      toast.success('Leave request submitted!');
      setShowSubmit(false);
      qc.invalidateQueries(['leave-my']);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to submit leave');
    } finally {
      setSubmitting(false);
    }
  };

  const requests = isStudent ? (myLeave?.requests || []) : (pendingLeave?.requests || []);

  const STATUS_COLORS = {
    submitted: { color: '#60a5fa', bg: 'rgba(96,165,250,0.1)', label: '📤 Submitted' },
    under_review: { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', label: '👁️ Under Review' },
    approved: { color: '#10b981', bg: 'rgba(16,185,129,0.1)', label: '✅ Approved' },
    rejected: { color: '#ef4444', bg: 'rgba(239,68,68,0.1)', label: '❌ Rejected' },
    attendance_marked: { color: '#10b981', bg: 'rgba(16,185,129,0.1)', label: '✅ Leave Applied' },
  };

  return (
    <div className="page-content animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#e2e8f0' }}>📋 Leave Requests</h2>
          <p style={{ color: 'var(--gray-500)', fontSize: 14 }}>
            {isStudent ? 'Submit and track your leave requests' : 'Review and approve student leave requests'}
          </p>
        </div>
        {isStudent && (
          <button className="btn btn-primary" onClick={() => setShowSubmit(!showSubmit)}>
            {showSubmit ? '✕ Cancel' : '+ Request Leave'}
          </button>
        )}
      </div>

      {/* Leave cutoff notice */}
      <div className="card mb-4" style={{ background: 'rgba(245,158,11,0.05)', borderColor: 'rgba(245,158,11,0.2)' }}>
        <div style={{ fontSize: 13, color: 'var(--warning)' }}>
          ⏰ <strong>Leave Cutoff:</strong> Leave requests for today must be submitted before 9:00 AM.
          Approved leave automatically marks eligible periods as LE.
          Pending leave shows as "-" (not marked) until approved.
        </div>
      </div>

      {/* Submit form */}
      {showSubmit && isStudent && (
        <div className="card mb-6">
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0', marginBottom: 16 }}>New Leave Request</h3>
          <form onSubmit={handleSubmit}>
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">From Date *</label>
                <input type="date" className="form-input" value={form.from_date}
                  onChange={e => setForm(f => ({ ...f, from_date: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label className="form-label">To Date *</label>
                <input type="date" className="form-input" value={form.to_date}
                  onChange={e => setForm(f => ({ ...f, to_date: e.target.value }))} required />
              </div>
              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label className="form-label">Reason *</label>
                <select className="form-select" value={form.reason}
                  onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} required>
                  <option value="">Select reason</option>
                  {['Medical', 'Family Emergency', 'Personal', 'Festival', 'Other'].map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label className="form-label">Description</label>
                <textarea className="form-textarea" value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label className="form-label">Supporting Document (optional)</label>
                <input type="file" className="form-input" accept="image/*,.pdf"
                  onChange={e => setDocFile(e.target.files[0])} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowSubmit(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? <><span className="spinner" /> Submitting...</> : '📤 Submit Leave Request'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Requests list */}
      {requests.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">📋</div>
            <div className="empty-state-title">No leave requests</div>
            <div className="empty-state-desc">
              {isStudent ? 'No leave requests submitted yet.' : 'No pending leave requests to review.'}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {requests.map((lr) => {
            const statusInfo = STATUS_COLORS[lr.status] || { color: 'var(--gray-400)', bg: 'rgba(255,255,255,0.05)', label: lr.status };
            return (
              <div key={lr.id} className="card" style={{ borderColor: `${statusInfo.color}30` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                      <div style={{
                        background: statusInfo.bg, borderRadius: 8,
                        padding: '4px 10px', fontSize: 12, fontWeight: 600, color: statusInfo.color
                      }}>
                        {statusInfo.label}
                      </div>
                      <span style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0' }}>{lr.reason}</span>
                    </div>

                    <div style={{ fontSize: 13, color: 'var(--gray-400)' }}>
                      📅 {lr.from_date} → {lr.to_date}
                    </div>

                    {lr.description && (
                      <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 4 }}>{lr.description}</div>
                    )}

                    {isReviewer && lr.student && (
                      <div style={{ marginTop: 6, fontSize: 13, color: 'var(--gray-500)' }}>
                        Student: <strong style={{ color: '#e2e8f0' }}>{lr.student.name}</strong> ({lr.student.register_number})
                      </div>
                    )}

                    {lr.advisor_action && (
                      <div style={{ marginTop: 6, fontSize: 12, color: 'var(--gray-500)' }}>
                        Advisor: <span style={{ color: lr.advisor_action === 'approved' ? 'var(--success)' : 'var(--danger)' }}>
                          {lr.advisor_action}
                        </span>
                        {lr.advisor_notes && ` — ${lr.advisor_notes}`}
                      </div>
                    )}
                  </div>

                  {/* Reviewer actions */}
                  {isReviewer && ['submitted', 'under_review'].includes(lr.status) && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-success btn-sm"
                        onClick={() => approveMutation.mutate({ id: lr.id })}>
                        ✅ Approve
                      </button>
                      <button className="btn btn-danger btn-sm"
                        onClick={() => {
                          const reason = prompt('Rejection reason:');
                          if (reason) rejectMutation.mutate({ id: lr.id, reason });
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
      )}
    </div>
  );
}
