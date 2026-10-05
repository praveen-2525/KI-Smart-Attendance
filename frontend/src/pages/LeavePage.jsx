import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { leaveApi, API_BASE_URL } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

export default function LeavePage() {
  const { user } = useAuth();
  const isStudent = user?.role === 'student';
  const isReviewer = ['advisor', 'hod', 'deo'].includes(user?.role);
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState(isStudent ? 'form' : 'my-requests'); // 'form' | 'my-requests'
  const [selectedRequest, setSelectedRequest] = useState(null);

  // Form state
  const [form, setForm] = useState({
    leaveType: 'Casual Leave',
    fromDate: '',
    toDate: '',
    reason: '',
    parentName: '',
    parentContact: '',
    emergencyContact: '',
    remarks: '',
  });

  const [docFile, setDocFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});

  // Auto-calculate number of days
  const numberOfDays = useMemo(() => {
    if (!form.fromDate || !form.toDate) return 0;
    const start = new Date(form.fromDate);
    const end = new Date(form.toDate);
    if (isNaN(start) || isNaN(end) || end < start) return 0;
    const diffTime = Math.abs(end - start);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  }, [form.fromDate, form.toDate]);

  // Profile completeness check
  const missingProfileFields = useMemo(() => {
    const missing = [];
    if (!user?.full_name && !user?.name) missing.push('Full Name');
    if (!user?.register_number && !user?.login_id) missing.push('Register Number');
    if (!user?.department) missing.push('Department');
    if (!user?.year) missing.push('Year');
    if (!user?.section) missing.push('Section');
    if (!user?.email) missing.push('College Email');
    return missing;
  }, [user]);

  // Queries
  const { data: myLeaveData, isLoading: loadingMy } = useQuery({
    queryKey: ['leave-my'],
    queryFn: () => leaveApi.getMy(),
    enabled: isStudent,
    select: (res) => res.data,
  });

  const { data: pendingLeaveData, isLoading: loadingPending } = useQuery({
    queryKey: ['leave-pending'],
    queryFn: () => leaveApi.getPending(),
    enabled: isReviewer,
    select: (res) => res.data,
  });

  const reviewMutation = useMutation({
    mutationFn: ({ id, status, remarks }) => leaveApi.review(id, status, remarks),
    onSuccess: (res) => {
      // Surface the backend's confirmation verbatim: "Leave request approved successfully."
      toast.success(res?.data?.message || 'Leave request updated successfully.');
      qc.invalidateQueries(['leave-pending']);
      qc.invalidateQueries(['leave-my']);
      setSelectedRequest(null);
    },
    onError: (err) => {
      toast.error(err.response?.data?.detail || 'Failed to update request');
    }
  });

  const validate = () => {
    const errs = {};
    if (!form.fromDate) errs.fromDate = 'From Date is required';
    if (!form.toDate) errs.toDate = 'To Date is required';
    if (form.fromDate && form.toDate && form.toDate < form.fromDate) {
      errs.toDate = 'To Date cannot be earlier than From Date';
    }
    if (!form.reason || form.reason.trim().length < 10) {
      errs.reason = 'Reason must be at least 10 characters long';
    }
    if (!form.parentName || form.parentName.trim().length < 2) {
      errs.parentName = 'Parent/Guardian Name is required';
    }
    const cleanPhone = (form.parentContact || '').replace(/\s+/g, '').replace(/-/g, '');
    if (!/^[6-9][0-9]{9}$/.test(cleanPhone)) {
      errs.parentContact = 'Enter a valid 10-digit Indian mobile number (e.g. 9876543210)';
    }
    if (form.leaveType === 'Medical Leave' && !docFile) {
      errs.document = 'Supporting document is required for Medical Leave';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) {
      toast.error('Please fix validation errors before submitting.');
      return;
    }

    if (missingProfileFields.length > 0) {
      toast.error(`Cannot submit: Missing profile info (${missingProfileFields.join(', ')}).`);
      return;
    }

    setSubmitting(true);
    const fd = new FormData();
    fd.append('leaveType', form.leaveType);
    fd.append('fromDate', form.fromDate);
    fd.append('toDate', form.toDate);
    fd.append('reason', form.reason);
    fd.append('parentName', form.parentName);
    fd.append('parentContact', form.parentContact);
    if (form.emergencyContact) fd.append('emergencyContact', form.emergencyContact);
    if (form.remarks) fd.append('remarks', form.remarks);
    if (docFile) fd.append('document', docFile);

    try {
      const res = await leaveApi.submit(fd);
      toast.success('Leave request submitted successfully.');
      // Reset form
      setForm({
        leaveType: 'Casual Leave',
        fromDate: '',
        toDate: '',
        reason: '',
        parentName: '',
        parentContact: '',
        emergencyContact: '',
        remarks: '',
      });
      setDocFile(null);
      setErrors({});
      qc.invalidateQueries(['leave-my']);
      setActiveTab('my-requests');
    } catch (err) {
      const detail = err.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Unable to submit your request right now. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setForm({
      leaveType: 'Casual Leave',
      fromDate: '',
      toDate: '',
      reason: '',
      parentName: '',
      parentContact: '',
      emergencyContact: '',
      remarks: '',
    });
    setDocFile(null);
    setErrors({});
    toast('Form reset successfully', { icon: '🧹' });
  };

  const requestsList = isStudent ? (myLeaveData?.requests || []) : (pendingLeaveData?.requests || []);

  const getStatusBadge = (status) => {
    switch (status) {
      case 'Approved':
        return <span className="badge badge-approved">✅ Approved</span>;
      case 'Rejected':
        return <span className="badge badge-rejected">❌ Rejected</span>;
      case 'Cancelled':
        return <span className="badge" style={{ background: 'rgba(148,163,184,0.15)', color: 'var(--text-secondary)' }}>🚫 Cancelled</span>;
      default:
        return <span className="badge badge-pending">⏳ Pending</span>;
    }
  };

  return (
    <div className="page-content animate-fade-in" style={{ paddingBottom: 40 }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>📋</span> Student Leave Request
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 2 }}>
            {isStudent ? 'Submit formal leave application and track approval status.' : 'Review and process student leave applications.'}
          </p>
        </div>

        {/* Tab switcher */}
        <div style={{ display: 'flex', background: 'var(--bg-surface)', borderRadius: 12, padding: 4, border: '1px solid var(--border)' }}>
          {isStudent && (
            <button
              className={`btn btn-sm ${activeTab === 'form' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setActiveTab('form')}
              style={{ borderRadius: 8, padding: '6px 16px', fontSize: 13 }}
            >
              ✏️ New Leave Request
            </button>
          )}
          <button
            className={`btn btn-sm ${activeTab === 'my-requests' || !isStudent ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setActiveTab('my-requests')}
            style={{ borderRadius: 8, padding: '6px 16px', fontSize: 13 }}
          >
            📂 {isStudent ? 'My Requests' : 'Pending Requests'} ({requestsList.length})
          </button>
        </div>
      </div>

      {/* Profile missing alert */}
      {isStudent && missingProfileFields.length > 0 && (
        <div className="card mb-6" style={{ background: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.3)', color: '#fca5a5' }}>
          ⚠️ <strong>Incomplete Profile Information:</strong> The following profile details are missing: {missingProfileFields.join(', ')}. Please update your profile in settings or contact admin before applying.
        </div>
      )}

      {/* FORM TAB - STUDENT ONLY */}
      {activeTab === 'form' && isStudent && (
        <div className="card mb-6" style={{ maxWidth: 900, margin: '0 auto' }}>
          {/* Read-Only Student Profile Card */}
          <div style={{
            background: 'var(--bg-body)',
            borderRadius: 12,
            padding: '16px 20px',
            marginBottom: 24,
            border: '1px solid var(--border)'
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--secondary)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
              🔒 Authenticated Student Profile (Auto-Populated)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
              <div>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block' }}>Student Name</span>
                <strong style={{ fontSize: 14, color: 'var(--text-primary)' }}>{user?.full_name || user?.name || 'N/A'}</strong>
              </div>
              <div>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block' }}>Register Number</span>
                <strong style={{ fontSize: 14, color: 'var(--text-primary)' }}>{user?.register_number || user?.login_id || 'N/A'}</strong>
              </div>
              <div>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block' }}>Department</span>
                <strong style={{ fontSize: 14, color: 'var(--text-primary)' }}>{user?.department || 'CSE(AI&ML)'}</strong>
              </div>
              <div>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block' }}>Year & Section</span>
                <strong style={{ fontSize: 14, color: 'var(--text-primary)' }}>{user?.year || 'III Year'} - {user?.section || 'AIML'}</strong>
              </div>
              <div>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block' }}>College Email</span>
                <strong style={{ fontSize: 14, color: 'var(--text-primary)' }}>{user?.email || 'N/A'}</strong>
              </div>
            </div>
          </div>

          <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 20 }}>
            Leave Application Details
          </h3>

          <form onSubmit={handleSubmit}>
            <div className="grid-2" style={{ rowGap: 18 }}>
              {/* Leave Type */}
              <div className="form-group">
                <label className="form-label">Leave Type <span style={{ color: 'var(--danger)' }}>*</span></label>
                <select
                  className="form-select"
                  value={form.leaveType}
                  onChange={(e) => setForm({ ...form, leaveType: e.target.value })}
                >
                  <option value="Casual Leave">Casual Leave</option>
                  <option value="Medical Leave">Medical Leave (Requires Proof)</option>
                  <option value="Personal Leave">Personal Leave</option>
                  <option value="Emergency Leave">Emergency Leave</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              {/* Number of Days (Auto) */}
              <div className="form-group">
                <label className="form-label">Total Duration (Days)</label>
                <input
                  type="text"
                  className="form-input"
                  value={numberOfDays > 0 ? `${numberOfDays} Day(s)` : 'Select valid dates'}
                  readOnly
                  style={{ background: 'var(--surface-dark-4)', color: 'var(--secondary)', fontWeight: 700 }}
                />
              </div>

              {/* From Date */}
              <div className="form-group">
                <label className="form-label">From Date <span style={{ color: 'var(--danger)' }}>*</span></label>
                <input
                  type="date"
                  className="form-input"
                  value={form.fromDate}
                  onChange={(e) => {
                    setForm({ ...form, fromDate: e.target.value });
                    if (errors.fromDate) setErrors({ ...errors, fromDate: undefined });
                  }}
                  required
                />
                {errors.fromDate && <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 4 }}>{errors.fromDate}</div>}
              </div>

              {/* To Date */}
              <div className="form-group">
                <label className="form-label">To Date <span style={{ color: 'var(--danger)' }}>*</span></label>
                <input
                  type="date"
                  className="form-input"
                  min={form.fromDate || undefined}
                  value={form.toDate}
                  onChange={(e) => setForm({ ...form, toDate: e.target.value })}
                  required
                />
                {errors.toDate && <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 4 }}>{errors.toDate}</div>}
              </div>

              {/* Reason for Leave */}
              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label className="form-label">Reason for Leave <span style={{ color: 'var(--danger)' }}>*</span></label>
                <textarea
                  className="form-textarea"
                  rows="3"
                  placeholder="Provide detailed explanation for your leave request (minimum 10 characters)..."
                  value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  required
                />
                {errors.reason && <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 4 }}>{errors.reason}</div>}
              </div>

              {/* Parent Name */}
              <div className="form-group">
                <label className="form-label">Parent / Guardian Name <span style={{ color: 'var(--danger)' }}>*</span></label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Rajesh Kumar"
                  value={form.parentName}
                  onChange={(e) => setForm({ ...form, parentName: e.target.value })}
                  required
                />
                {errors.parentName && <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 4 }}>{errors.parentName}</div>}
              </div>

              {/* Parent Contact Number */}
              <div className="form-group">
                <label className="form-label">Parent Contact Number <span style={{ color: 'var(--danger)' }}>*</span></label>
                <input
                  type="tel"
                  className="form-input"
                  placeholder="10-digit mobile number (e.g. 9876543210)"
                  maxLength="10"
                  value={form.parentContact}
                  onChange={(e) => setForm({ ...form, parentContact: e.target.value })}
                  required
                />
                {errors.parentContact && <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 4 }}>{errors.parentContact}</div>}
              </div>

              {/* Supporting Document */}
              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label className="form-label">
                  Supporting Document {form.leaveType === 'Medical Leave' ? <span style={{ color: 'var(--danger)' }}>* (Required for Medical Leave)</span> : '(Optional)'}
                </label>
                <div style={{
                  border: errors.document ? '2px dashed var(--danger)' : '2px dashed var(--border-dark)',
                  borderRadius: 10,
                  padding: 16,
                  textAlign: 'center',
                  background: docFile ? 'rgba(16,185,129,0.05)' : 'var(--surface-dark-3)',
                  cursor: 'pointer'
                }} onClick={() => document.getElementById('leave-doc-upload').click()}>
                  <input
                    id="leave-doc-upload"
                    type="file"
                    accept=".pdf,image/jpeg,image/png,image/jpg"
                    style={{ display: 'none' }}
                    onChange={(e) => setDocFile(e.target.files[0])}
                  />
                  {docFile ? (
                    <div style={{ color: 'var(--success)', fontWeight: 600, fontSize: 14 }}>
                      📄 Selected: {docFile.name} ({(docFile.size / 1024 / 1024).toFixed(2)} MB)
                    </div>
                  ) : (
                    <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                      📎 Click to upload supporting document (Medical Certificate, etc.)<br />
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Allowed: PDF, JPG, PNG (Max 10MB)</span>
                    </div>
                  )}
                </div>
                {errors.document && <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 4 }}>{errors.document}</div>}
              </div>

              {/* Emergency Contact */}
              <div className="form-group">
                <label className="form-label">Emergency Contact (Optional)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Alternative contact info"
                  value={form.emergencyContact}
                  onChange={(e) => setForm({ ...form, emergencyContact: e.target.value })}
                />
              </div>

              {/* Additional Remarks */}
              <div className="form-group">
                <label className="form-label">Additional Remarks (Optional)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Any additional information..."
                  value={form.remarks}
                  onChange={(e) => setForm({ ...form, remarks: e.target.value })}
                />
              </div>
            </div>

            {/* Form Actions */}
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border-dark)' }}>
              <button type="button" className="btn btn-secondary" onClick={handleReset} disabled={submitting}>
                🔄 Reset Form
              </button>
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? (
                  <>
                    <span className="spinner" style={{ width: 16, height: 16, borderRightColor: 'transparent' }} /> Submitting...
                  </>
                ) : (
                  '📤 Submit Leave Request'
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MY REQUESTS / PENDING TAB */}
      {activeTab === 'my-requests' && (
        <div>
          {requestsList.length === 0 ? (
            <div className="card text-center" style={{ padding: '40px 20px' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
              <h3 style={{ fontSize: 18, color: 'var(--text-primary)', fontWeight: 700 }}>No Leave Requests Found</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 4 }}>
                {isStudent ? 'You have not submitted any leave requests yet.' : 'No pending leave applications to review.'}
              </p>
              {isStudent && (
                <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setActiveTab('form')}>
                  + Submit New Leave Request
                </button>
              )}
            </div>
          ) : (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-body)', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>
                      <th style={{ padding: '14px 16px' }}>Request ID</th>
                      <th style={{ padding: '14px 16px' }}>Student Info</th>
                      <th style={{ padding: '14px 16px' }}>Leave Type</th>
                      <th style={{ padding: '14px 16px' }}>Dates & Duration</th>
                      <th style={{ padding: '14px 16px' }}>Reason</th>
                      <th style={{ padding: '14px 16px' }}>Status</th>
                      <th style={{ padding: '14px 16px' }}>Submitted On</th>
                      <th style={{ padding: '14px 16px', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requestsList.map((req) => (
                      <tr key={req.requestId || req.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '14px 16px', fontWeight: 700, color: 'var(--secondary)' }}>
                          {req.requestId || `LEV-${req.id}`}
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{req.studentName}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{req.registerNumber}</div>
                        </td>
                        <td style={{ padding: '14px 16px', color: 'var(--text-primary)', fontWeight: 500 }}>
                          {req.leaveType}
                        </td>
                        <td style={{ padding: '14px 16px', color: 'var(--text-secondary)' }}>
                          📅 {req.fromDate} → {req.toDate}<br />
                          <span style={{ fontSize: 11, color: 'var(--secondary)', fontWeight: 600 }}>
                            {req.numberOfDays} Day(s)
                          </span>
                        </td>
                        <td style={{ padding: '14px 16px', color: 'var(--text-secondary)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {req.reason}
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          {getStatusBadge(req.status)}
                        </td>
                        <td style={{ padding: '14px 16px', color: 'var(--text-muted)', fontSize: 12 }}>
                          {req.submittedAt ? new Date(req.submittedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A'}
                        </td>
                        <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => setSelectedRequest(req)}
                            style={{ color: 'var(--secondary)' }}
                          >
                            👁️ Details
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* DETAILED REQUEST MODAL */}
      {selectedRequest && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 650 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                📋 Leave Request Details ({selectedRequest.requestId || selectedRequest.id})
              </h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelectedRequest(null)}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ background: 'var(--bg-body)', padding: '12px 16px', borderRadius: 10, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, fontSize: 13 }}>
                <div>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block' }}>Advisor Status</span>
                  <strong style={{ color: selectedRequest.advisorStatus === 'APPROVED' ? 'var(--success)' : selectedRequest.advisorStatus === 'BYPASSED' ? 'var(--info)' : 'var(--warning)' }}>
                    {selectedRequest.advisorStatus || 'PENDING'}
                  </strong>
                </div>
                <div>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block' }}>HOD Status</span>
                  <strong style={{ color: selectedRequest.hodStatus === 'APPROVED' ? 'var(--success)' : selectedRequest.hodStatus === 'REJECTED' ? 'var(--danger)' : 'var(--warning)' }}>
                    {selectedRequest.hodStatus || 'ACTION_REQUIRED'}
                  </strong>
                </div>
                <div>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block' }}>Final Status</span>
                  {getStatusBadge(selectedRequest.status)}
                </div>
              </div>

              {selectedRequest.approvalType && (
                <div style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', padding: '10px 14px', borderRadius: 8, fontSize: 13 }}>
                  <span style={{ color: 'var(--secondary)', fontWeight: 700 }}>Approval Method: </span>
                  <span style={{ color: 'var(--text-primary)' }}>
                    {selectedRequest.approvalType === 'HOD_DIRECT_APPROVAL' ? '⚡ Direct HOD Approval (Advisor Bypassed)' : selectedRequest.approvalType === 'NORMAL_HOD_APPROVAL' ? '✅ Approved by HOD (Post Advisor Review)' : selectedRequest.approvalType}
                  </span>
                  {selectedRequest.approvedBy && (
                    <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 2 }}>
                      Approved By: <strong>{selectedRequest.approvedBy}</strong> ({selectedRequest.approvedByRole || 'HOD'})
                    </div>
                  )}
                </div>
              )}

              <div className="grid-2" style={{ fontSize: 13, gap: 12 }}>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block' }}>Student Name</span>
                  <strong style={{ color: 'var(--text-primary)' }}>{selectedRequest.studentName}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block' }}>Register Number</span>
                  <strong style={{ color: 'var(--text-primary)' }}>{selectedRequest.registerNumber}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block' }}>Department & Class</span>
                  <strong style={{ color: 'var(--text-primary)' }}>{selectedRequest.department} ({selectedRequest.year} - {selectedRequest.section})</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block' }}>College Email</span>
                  <strong style={{ color: 'var(--text-primary)' }}>{selectedRequest.collegeEmail}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block' }}>Leave Type</span>
                  <strong style={{ color: 'var(--secondary)' }}>{selectedRequest.leaveType}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block' }}>Duration</span>
                  <strong style={{ color: 'var(--text-primary)' }}>{selectedRequest.fromDate} → {selectedRequest.toDate} ({selectedRequest.numberOfDays} Days)</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block' }}>Parent/Guardian</span>
                  <strong style={{ color: 'var(--text-primary)' }}>{selectedRequest.parentName} ({selectedRequest.parentContact})</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block' }}>Emergency Contact</span>
                  <strong style={{ color: 'var(--text-primary)' }}>{selectedRequest.emergencyContact || 'N/A'}</strong>
                </div>
              </div>

              <div style={{ background: 'var(--surface-dark-4)', padding: 12, borderRadius: 8, fontSize: 13 }}>
                <span style={{ color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Reason for Leave:</span>
                <p style={{ color: 'var(--text-primary)', margin: 0, whiteSpace: 'pre-wrap' }}>{selectedRequest.reason}</p>
              </div>

              {selectedRequest.supportingDocument && (
                <div style={{ background: 'var(--surface-dark-4)', padding: 12, borderRadius: 8, fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>📄 Supporting Document Uploaded</span>
                  <a
                    href={`${API_BASE_URL}${selectedRequest.supportingDocument}`}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-sm btn-secondary"
                  >
                    View Document ↗
                  </a>
                </div>
              )}

              {/* Approval History Timeline */}
              {selectedRequest.approvalHistory && selectedRequest.approvalHistory.length > 0 && (
                <div style={{ background: 'var(--bg-body)', padding: 12, borderRadius: 8, fontSize: 12 }}>
                  <span style={{ color: 'var(--text-secondary)', fontWeight: 700, display: 'block', marginBottom: 8 }}>📜 Audit & Approval History</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {selectedRequest.approvalHistory.map((item, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-primary)', background: 'var(--surface-dark-4)', padding: '6px 10px', borderRadius: 6 }}>
                        <span>
                          <strong>{item.action}</strong> by {item.role} {item.approvalType ? `(${item.approvalType})` : ''}
                        </span>
                        <span style={{ color: 'var(--text-muted)' }}>
                          {item.timestamp ? new Date(item.timestamp).toLocaleString('en-IN') : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedRequest.reviewerRemarks && (
                <div style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)', padding: 12, borderRadius: 8, fontSize: 13 }}>
                  <span style={{ color: 'var(--warning)', fontWeight: 700, display: 'block' }}>Faculty/HOD Remarks:</span>
                  <p style={{ color: 'var(--text-primary)', margin: '4px 0 0' }}>{selectedRequest.reviewerRemarks}</p>
                </div>
              )}

              {/* Reviewer Action Buttons */}
              {isReviewer && selectedRequest.status === 'Pending' && (
                <div style={{ display: 'flex', gap: 10, marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border-dark)' }}>
                  <button
                    className="btn btn-success"
                    style={{ flex: 1 }}
                    onClick={() => {
                      const remarks = prompt('Enter remarks (optional):');
                      reviewMutation.mutate({ id: selectedRequest.requestId || selectedRequest.id, status: 'Approved', remarks });
                    }}
                  >
                    ✅ Approve Leave
                  </button>
                  <button
                    className="btn btn-danger"
                    style={{ flex: 1 }}
                    onClick={() => {
                      const remarks = prompt('Reason for rejection:');
                      if (remarks) {
                        reviewMutation.mutate({ id: selectedRequest.requestId || selectedRequest.id, status: 'Rejected', remarks });
                      }
                    }}
                  >
                    ❌ Reject Leave
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


