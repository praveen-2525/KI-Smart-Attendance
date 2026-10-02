import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { odApi } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

const STATUS_INFO = {
  submitted: { label: 'Submitted', color: '#60a5fa', icon: '📤' },
  under_review: { label: 'Under Review', color: '#f59e0b', icon: '👁️' },
  approved: { label: 'Approved', color: '#10b981', icon: '✅' },
  rejected: { label: 'Rejected', color: '#ef4444', icon: '❌' },
  event_completed: { label: 'Event Completed', color: '#8b5cf6', icon: '🎉' },
  proof_submitted: { label: 'Proof Submitted', color: '#f59e0b', icon: '📎' },
  proof_verified: { label: 'Proof Verified', color: '#10b981', icon: '✔️' },
  proof_rejected: { label: 'Proof Rejected', color: '#ef4444', icon: '❌' },
  attendance_marked: { label: 'OD Applied', color: '#10b981', icon: '🎯' },
};

function ODWorkflowStatus({ status }) {
  const steps = [
    { key: 'submitted', label: 'Submitted' },
    { key: 'approved', label: 'Approved' },
    { key: 'event_completed', label: 'Event Done' },
    { key: 'proof_submitted', label: 'Proof Uploaded' },
    { key: 'attendance_marked', label: 'OD Applied' },
  ];

  const stepOrder = steps.map(s => s.key);
  const currentIdx = stepOrder.findIndex(s => status === s || status === `proof_${s.split('_')[1] || ''}`);
  const effectiveIdx = Math.max(
    stepOrder.indexOf(status),
    status === 'proof_submitted' ? 3 : status === 'attendance_marked' ? 4 : -1
  );

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginTop: 12 }}>
      {steps.map((step, idx) => {
        const isDone = idx <= effectiveIdx;
        return (
          <div key={step.key} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
              background: isDone ? 'var(--gradient-brand)' : 'var(--surface-dark-4)',
              border: isDone ? 'none' : '2px solid var(--border-dark)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700, color: isDone ? 'white' : 'var(--gray-600)'
            }}>
              {idx + 1}
            </div>
            <div style={{
              flex: 1, height: 2, background: idx < effectiveIdx ? 'var(--primary-500)' : 'var(--surface-dark-4)'
            }} />
          </div>
        );
      })}
      <div style={{ width: 28, height: 28 }} />
    </div>
  );
}

function SubmitODModal({ onClose, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    event_name: '', event_type: '', participation_type: 'participant',
    from_date: '', to_date: '', event_date: '', venue: '', city: '',
    institution_name: '', is_own_college: false, description: ''
  });
  const [proofFile, setProofFile] = useState(null);

  const participationTypes = [
    'participant', 'presenter', 'volunteer', 'competition',
    'workshop', 'symposium', 'hackathon', 'sports', 'other'
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!proofFile) { toast.error('Please upload registration proof'); return; }

    setLoading(true);
    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => fd.append(k, v));
    fd.append('proof_file', proofFile);

    try {
      await odApi.submit(fd);
      toast.success('OD request submitted successfully!');
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to submit OD request');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 600 }}>
        <h3 className="modal-title">📤 Submit OD Request</h3>
        <p className="modal-subtitle">Fill in the event details and upload registration proof.</p>

        <form onSubmit={handleSubmit}>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Event Name *</label>
              <input className="form-input" value={form.event_name}
                onChange={e => setForm(f => ({ ...f, event_name: e.target.value }))} required />
            </div>
            <div className="form-group">
              <label className="form-label">Event Type *</label>
              <input className="form-input" placeholder="e.g. Hackathon, Conference" value={form.event_type}
                onChange={e => setForm(f => ({ ...f, event_type: e.target.value }))} required />
            </div>
            <div className="form-group">
              <label className="form-label">Participation Type *</label>
              <select className="form-select" value={form.participation_type}
                onChange={e => setForm(f => ({ ...f, participation_type: e.target.value }))}>
                {participationTypes.map(p => (
                  <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Institution Name</label>
              <input className="form-input" value={form.institution_name}
                onChange={e => setForm(f => ({ ...f, institution_name: e.target.value }))} />
            </div>
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
            <div className="form-group">
              <label className="form-label">Event Date *</label>
              <input type="date" className="form-input" value={form.event_date}
                onChange={e => setForm(f => ({ ...f, event_date: e.target.value }))} required />
            </div>
            <div className="form-group">
              <label className="form-label">Venue</label>
              <input className="form-input" value={form.venue}
                onChange={e => setForm(f => ({ ...f, venue: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">City</label>
              <input className="form-input" value={form.city}
                onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">
                <input type="checkbox" checked={form.is_own_college}
                  onChange={e => setForm(f => ({ ...f, is_own_college: e.target.checked }))} />
                {' '}Our College event
              </label>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea className="form-textarea" value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>

          <div className="form-group">
            <label className="form-label">Registration Proof * (PDF/Image)</label>
            <div style={{
              border: '2px dashed var(--border-dark)', borderRadius: 10,
              padding: 20, textAlign: 'center', cursor: 'pointer',
              background: proofFile ? 'rgba(16,185,129,0.05)' : 'var(--surface-dark-3)'
            }}
              onClick={() => document.getElementById('proof-file').click()}>
              <input id="proof-file" type="file"
                accept="image/*,.pdf"
                style={{ display: 'none' }}
                onChange={e => setProofFile(e.target.files[0])} />
              {proofFile ? (
                <div style={{ color: 'var(--success)' }}>✅ {proofFile.name}</div>
              ) : (
                <div style={{ color: 'var(--gray-500)' }}>
                  📎 Click to upload registration proof<br />
                  <span style={{ fontSize: 12 }}>PDF, JPG, PNG (max 10MB)</span>
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? <><span className="spinner" /> Submitting...</> : '📤 Submit OD Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ProofModal({ od, onClose, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState([]);
  const [description, setDescription] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (files.length === 0) { toast.error('Upload at least one proof document'); return; }
    setLoading(true);
    const fd = new FormData();
    fd.append('description', description);
    files.forEach(f => fd.append('proof_files', f));
    try {
      await odApi.submitProof(od.id, fd);
      toast.success('Completion proof submitted!');
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to submit proof');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h3 className="modal-title">📎 Submit Completion Proof</h3>
        <p className="modal-subtitle">Upload certificate or attendance proof for: <strong>{od.event_name}</strong></p>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Upload Documents (Certificate, Photos, etc.)</label>
            <input type="file" className="form-input" multiple accept="image/*,.pdf"
              onChange={e => setFiles(Array.from(e.target.files))} />
            {files.length > 0 && (
              <div style={{ fontSize: 12, color: 'var(--success)', marginTop: 4 }}>
                {files.length} file(s) selected
              </div>
            )}
          </div>
          <div className="form-group">
            <label className="form-label">Description (optional)</label>
            <textarea className="form-textarea" value={description} onChange={e => setDescription(e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? <><span className="spinner" /> Uploading...</> : 'Submit Proof'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ODPage() {
  const { user } = useAuth();
  const isStudent = user?.role === 'student';
  const isReviewer = ['advisor', 'hod'].includes(user?.role);

  const [showSubmit, setShowSubmit] = useState(false);
  const [proofModal, setProofModal] = useState(null);
  const qc = useQueryClient();

  const { data: myOD } = useQuery({
    queryKey: ['od-my'],
    queryFn: () => odApi.getMy(),
    enabled: isStudent,
    select: (res) => res.data,
  });

  const { data: pendingOD } = useQuery({
    queryKey: ['od-pending'],
    queryFn: () => odApi.getPending(),
    enabled: isReviewer,
    select: (res) => res.data,
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, notes }) => odApi.approve(id, notes),
    onSuccess: () => { toast.success('OD approved!'); qc.invalidateQueries(['od-pending']); },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }) => odApi.reject(id, reason),
    onSuccess: () => { toast.success('OD rejected'); qc.invalidateQueries(['od-pending']); },
  });

  const verifyMutation = useMutation({
    mutationFn: ({ id, approved }) => odApi.verifyProof(id, approved),
    onSuccess: () => { toast.success('Proof processed!'); qc.invalidateQueries(['od-pending']); },
  });

  const requests = isStudent ? (myOD?.requests || []) : (pendingOD?.requests || []);

  return (
    <div className="page-content animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#e2e8f0' }}>🎫 OD Requests</h2>
          <p style={{ color: 'var(--gray-500)', fontSize: 14 }}>
            {isStudent ? 'Manage your On-Duty requests and event proofs' : 'Review and approve OD requests'}
          </p>
        </div>
        {isStudent && (
          <button className="btn btn-primary" onClick={() => setShowSubmit(true)}>
            + New OD Request
          </button>
        )}
      </div>

      {/* Important note about OD workflow */}
      <div className="card mb-6" style={{
        background: 'rgba(99,102,241,0.05)',
        borderColor: 'rgba(99,102,241,0.2)'
      }}>
        <div style={{ fontSize: 13, color: 'var(--gray-400)', lineHeight: 1.6 }}>
          <strong style={{ color: 'var(--primary-400)' }}>📌 OD Workflow:</strong>
          {' '}Approved OD does <strong>not</strong> immediately update your attendance.
          After the event, submit completion proof → Advisor/HOD verifies → System marks eligible periods as OD.
          Until proof is verified, attendance remains "<strong>-</strong>" (not marked).
        </div>
      </div>

      {/* OD Requests */}
      {requests.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">🎫</div>
            <div className="empty-state-title">No OD requests</div>
            <div className="empty-state-desc">
              {isStudent ? 'Submit your first OD request for events and competitions.' : 'No pending OD requests to review.'}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {requests.map((od) => {
            const statusInfo = STATUS_INFO[od.status] || { label: od.status, color: 'var(--gray-400)', icon: '?' };
            return (
              <div key={od.id} className="card" style={{ position: 'relative' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                      <span style={{ fontSize: 20 }}>{statusInfo.icon}</span>
                      <h3 style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0' }}>{od.event_name}</h3>
                      <span className={`badge badge-${od.status === 'attendance_marked' ? 'approved' : od.status === 'rejected' || od.status === 'proof_rejected' ? 'rejected' : od.status === 'approved' ? 'approved' : 'submitted'}`}>
                        {statusInfo.label}
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: 20, fontSize: 13, color: 'var(--gray-400)', flexWrap: 'wrap' }}>
                      <span>📅 {od.from_date} → {od.to_date}</span>
                      <span>📍 {od.venue || od.city || od.institution_name}</span>
                      <span>🎭 {od.participation_type}</span>
                    </div>

                    {isStudent && (
                      <ODWorkflowStatus status={od.status} />
                    )}

                    {isReviewer && od.student && (
                      <div style={{ marginTop: 8, fontSize: 13, color: 'var(--gray-500)' }}>
                        Student: <strong style={{ color: '#e2e8f0' }}>{od.student.name}</strong> ({od.student.register_number})
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {/* Student: Submit proof */}
                    {isStudent && od.status === 'approved' && (
                      <button className="btn btn-primary btn-sm" onClick={() => setProofModal(od)}>
                        📎 Submit Proof
                      </button>
                    )}

                    {/* Reviewer: Approve/Reject */}
                    {isReviewer && ['submitted', 'under_review'].includes(od.status) && (
                      <>
                        <button
                          className="btn btn-success btn-sm"
                          onClick={() => approveMutation.mutate({ id: od.id })}
                          disabled={approveMutation.isLoading}
                        >
                          ✅ Approve
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => {
                            const reason = prompt('Reason for rejection:');
                            if (reason) rejectMutation.mutate({ id: od.id, reason });
                          }}
                        >
                          ❌ Reject
                        </button>
                      </>
                    )}

                    {/* Reviewer: Verify proof */}
                    {isReviewer && od.status === 'proof_submitted' && (
                      <>
                        <button
                          className="btn btn-success btn-sm"
                          onClick={() => verifyMutation.mutate({ id: od.id, approved: true })}
                        >
                          ✅ Verify & Apply OD
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => verifyMutation.mutate({ id: od.id, approved: false })}
                        >
                          ❌ Reject Proof
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showSubmit && (
        <SubmitODModal
          onClose={() => setShowSubmit(false)}
          onSuccess={() => qc.invalidateQueries(['od-my'])}
        />
      )}

      {proofModal && (
        <ProofModal
          od={proofModal}
          onClose={() => setProofModal(null)}
          onSuccess={() => qc.invalidateQueries(['od-my'])}
        />
      )}
    </div>
  );
}
