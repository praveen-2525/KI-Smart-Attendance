import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { odApi } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

export default function ODPage() {
  const { user } = useAuth();
  const isStudent = user?.role === 'student';
  const isReviewer = ['advisor', 'hod', 'deo'].includes(user?.role);
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState('form'); // 'form' | 'my-requests'
  const [selectedRequest, setSelectedRequest] = useState(null);

  // Form state
  const [form, setForm] = useState({
    odType: 'Symposium',
    eventName: '',
    organization: '',
    location: '',
    fromDate: '',
    toDate: '',
    startTime: '09:00',
    endTime: '17:00',
    purpose: '',
    facultyCoordinator: '',
    coordinatorContact: '',
    travelRequired: false,
    travelMode: 'Bus',
    parentPermission: false,
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

  // Profile missing check
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
  const { data: myODData, isLoading: loadingMy } = useQuery({
    queryKey: ['od-my'],
    queryFn: () => odApi.getMy(),
    enabled: isStudent,
    select: (res) => res.data,
  });

  const { data: pendingODData, isLoading: loadingPending } = useQuery({
    queryKey: ['od-pending'],
    queryFn: () => odApi.getPending(),
    enabled: isReviewer,
    select: (res) => res.data,
  });

  const reviewMutation = useMutation({
    mutationFn: ({ id, status, remarks }) => odApi.review(id, status, remarks),
    onSuccess: (res, vars) => {
      toast.success(`OD request ${vars.status.toLowerCase()} successfully!`);
      qc.invalidateQueries(['od-pending']);
      setSelectedRequest(null);
    },
    onError: (err) => {
      toast.error(err.response?.data?.detail || 'Failed to update OD request');
    }
  });

  const validate = () => {
    const errs = {};
    if (!form.eventName || form.eventName.trim().length < 2) {
      errs.eventName = 'Event / Program Name is required';
    }
    if (!form.organization || form.organization.trim().length < 2) {
      errs.organization = 'Organizing Institution / Company is required';
    }
    if (!form.location || form.location.trim().length < 2) {
      errs.location = 'Event Location is required';
    }
    if (!form.fromDate) errs.fromDate = 'From Date is required';
    if (!form.toDate) errs.toDate = 'To Date is required';
    if (form.fromDate && form.toDate && form.toDate < form.fromDate) {
      errs.toDate = 'To Date cannot be earlier than From Date';
    }
    if (form.fromDate && form.toDate && form.fromDate === form.toDate) {
      if (form.startTime && form.endTime && form.endTime <= form.startTime) {
        errs.endTime = 'Event End Time cannot be earlier than or equal to Event Start Time';
      }
    }
    if (!form.purpose || form.purpose.trim().length < 10) {
      errs.purpose = 'Purpose / Description must be at least 10 characters long';
    }
    if (!form.facultyCoordinator || form.facultyCoordinator.trim().length < 2) {
      errs.facultyCoordinator = 'Faculty Coordinator Name is required';
    }
    const cleanPhone = (form.coordinatorContact || '').replace(/\s+/g, '').replace(/-/g, '');
    if (!/^[6-9][0-9]{9}$/.test(cleanPhone)) {
      errs.coordinatorContact = 'Enter a valid 10-digit Indian mobile number (e.g. 9876543210)';
    }
    if (!docFile) {
      errs.document = 'Supporting document is required for OD request';
    }
    if (!form.parentPermission) {
      errs.parentPermission = 'Parent/Guardian Permission must be confirmed before submitting';
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
    fd.append('odType', form.odType);
    fd.append('eventName', form.eventName);
    fd.append('organization', form.organization);
    fd.append('location', form.location);
    fd.append('fromDate', form.fromDate);
    fd.append('toDate', form.toDate);
    fd.append('startTime', form.startTime);
    fd.append('endTime', form.endTime);
    fd.append('purpose', form.purpose);
    fd.append('facultyCoordinator', form.facultyCoordinator);
    fd.append('coordinatorContact', form.coordinatorContact);
    fd.append('travelRequired', form.travelRequired ? 'true' : 'false');
    if (form.travelRequired && form.travelMode) {
      fd.append('travelMode', form.travelMode);
    }
    fd.append('parentPermission', form.parentPermission ? 'true' : 'false');
    if (form.remarks) fd.append('remarks', form.remarks);
    if (docFile) fd.append('document', docFile);

    try {
      const res = await odApi.submit(fd);
      toast.success('OD request submitted successfully.');
      // Reset form
      setForm({
        odType: 'Symposium',
        eventName: '',
        organization: '',
        location: '',
        fromDate: '',
        toDate: '',
        startTime: '09:00',
        endTime: '17:00',
        purpose: '',
        facultyCoordinator: '',
        coordinatorContact: '',
        travelRequired: false,
        travelMode: 'Bus',
        parentPermission: false,
        remarks: '',
      });
      setDocFile(null);
      setErrors({});
      qc.invalidateQueries(['od-my']);
      setActiveTab('my-requests');
    } catch (err) {
      const detail = err.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Unable to submit your OD request right now. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setForm({
      odType: 'Symposium',
      eventName: '',
      organization: '',
      location: '',
      fromDate: '',
      toDate: '',
      startTime: '09:00',
      endTime: '17:00',
      purpose: '',
      facultyCoordinator: '',
      coordinatorContact: '',
      travelRequired: false,
      travelMode: 'Bus',
      parentPermission: false,
      remarks: '',
    });
    setDocFile(null);
    setErrors({});
    toast('Form reset successfully', { icon: '🧹' });
  };

  const requestsList = isStudent ? (myODData?.requests || []) : (pendingODData?.requests || []);

  const getStatusBadge = (status) => {
    switch (status) {
      case 'Approved':
        return <span className="badge badge-approved">✅ Approved</span>;
      case 'Rejected':
        return <span className="badge badge-rejected">❌ Rejected</span>;
      case 'Cancelled':
        return <span className="badge" style={{ background: 'rgba(148,163,184,0.15)', color: '#94a3b8' }}>🚫 Cancelled</span>;
      default:
        return <span className="badge badge-pending">⏳ Pending</span>;
    }
  };

  const OD_TYPES = [
    'Symposium',
    'Hackathon',
    'Workshop',
    'Internship',
    'Sports',
    'Cultural Event',
    'Placement/Interview',
    'Industrial Visit',
    'Competition',
    'College Event',
    'Other',
  ];

  return (
    <div className="page-content animate-fade-in" style={{ paddingBottom: 40 }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 800, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>🎫</span> On Duty (OD) Request
          </h2>
          <p style={{ color: 'var(--gray-400)', fontSize: 14, marginTop: 2 }}>
            {isStudent ? 'Apply for On-Duty attendance for hackathons, symposiums, sports & events.' : 'Review and process student On-Duty applications.'}
          </p>
        </div>

        {/* Tab switcher */}
        <div style={{ display: 'flex', background: 'var(--surface-dark-2)', borderRadius: 12, padding: 4, border: '1px solid var(--border-dark)' }}>
          <button
            className={`btn btn-sm ${activeTab === 'form' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setActiveTab('form')}
            style={{ borderRadius: 8, padding: '6px 16px', fontSize: 13 }}
          >
            ✏️ New OD Request
          </button>
          <button
            className={`btn btn-sm ${activeTab === 'my-requests' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setActiveTab('my-requests')}
            style={{ borderRadius: 8, padding: '6px 16px', fontSize: 13 }}
          >
            📂 {isStudent ? 'My Requests' : 'Pending Requests'} ({requestsList.length})
          </button>
        </div>
      </div>

      {/* Profile missing alert */}
      {missingProfileFields.length > 0 && (
        <div className="card mb-6" style={{ background: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.3)', color: '#fca5a5' }}>
          ⚠️ <strong>Incomplete Profile Information:</strong> The following profile details are missing: {missingProfileFields.join(', ')}. Please update your profile in settings or contact admin before applying.
        </div>
      )}

      {/* FORM TAB */}
      {activeTab === 'form' && (
        <div className="card mb-6" style={{ maxWidth: 950, margin: '0 auto' }}>
          {/* Read-Only Student Profile Card */}
          <div style={{
            background: 'var(--surface-dark-3)',
            borderRadius: 12,
            padding: '16px 20px',
            marginBottom: 24,
            border: '1px solid var(--border-dark)'
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary-400)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
              🔒 Authenticated Student Profile (Auto-Populated)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
              <div>
                <span style={{ fontSize: 11, color: 'var(--gray-500)', display: 'block' }}>Student Name</span>
                <strong style={{ fontSize: 14, color: '#f8fafc' }}>{user?.full_name || user?.name || 'N/A'}</strong>
              </div>
              <div>
                <span style={{ fontSize: 11, color: 'var(--gray-500)', display: 'block' }}>Register Number</span>
                <strong style={{ fontSize: 14, color: '#f8fafc' }}>{user?.register_number || user?.login_id || 'N/A'}</strong>
              </div>
              <div>
                <span style={{ fontSize: 11, color: 'var(--gray-500)', display: 'block' }}>Department</span>
                <strong style={{ fontSize: 14, color: '#f8fafc' }}>{user?.department || 'CSE(AI&ML)'}</strong>
              </div>
              <div>
                <span style={{ fontSize: 11, color: 'var(--gray-500)', display: 'block' }}>Year & Section</span>
                <strong style={{ fontSize: 14, color: '#f8fafc' }}>{user?.year || 'III Year'} - {user?.section || 'AIML'}</strong>
              </div>
              <div>
                <span style={{ fontSize: 11, color: 'var(--gray-500)', display: 'block' }}>College Email</span>
                <strong style={{ fontSize: 14, color: '#f8fafc' }}>{user?.email || 'N/A'}</strong>
              </div>
            </div>
          </div>

          <h3 style={{ fontSize: 18, fontWeight: 700, color: '#f8fafc', marginBottom: 20 }}>
            Event & On-Duty Details
          </h3>

          <form onSubmit={handleSubmit}>
            <div className="grid-2" style={{ rowGap: 18 }}>
              {/* OD Type */}
              <div className="form-group">
                <label className="form-label">OD Type <span style={{ color: 'var(--danger)' }}>*</span></label>
                <select
                  className="form-select"
                  value={form.odType}
                  onChange={(e) => setForm({ ...form, odType: e.target.value })}
                >
                  {OD_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              {/* Event Name */}
              <div className="form-group">
                <label className="form-label">Event / Program Name <span style={{ color: 'var(--danger)' }}>*</span></label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. National Level AI Hackathon 2026"
                  value={form.eventName}
                  onChange={(e) => setForm({ ...form, eventName: e.target.value })}
                  required
                />
                {errors.eventName && <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 4 }}>{errors.eventName}</div>}
              </div>

              {/* Organizing Institution */}
              <div className="form-group">
                <label className="form-label">Organizing Institution / Company <span style={{ color: 'var(--danger)' }}>*</span></label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. IIT Madras / Tech Corp"
                  value={form.organization}
                  onChange={(e) => setForm({ ...form, organization: e.target.value })}
                  required
                />
                {errors.organization && <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 4 }}>{errors.organization}</div>}
              </div>

              {/* Event Location */}
              <div className="form-group">
                <label className="form-label">Event Location <span style={{ color: 'var(--danger)' }}>*</span></label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Chennai / Campus Auditorium"
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  required
                />
                {errors.location && <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 4 }}>{errors.location}</div>}
              </div>

              {/* From Date */}
              <div className="form-group">
                <label className="form-label">From Date <span style={{ color: 'var(--danger)' }}>*</span></label>
                <input
                  type="date"
                  className="form-input"
                  value={form.fromDate}
                  onChange={(e) => setForm({ ...form, fromDate: e.target.value })}
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

              {/* Duration (Auto) */}
              <div className="form-group">
                <label className="form-label">Total Duration (Days)</label>
                <input
                  type="text"
                  className="form-input"
                  value={numberOfDays > 0 ? `${numberOfDays} Day(s)` : 'Select valid dates'}
                  readOnly
                  style={{ background: 'var(--surface-dark-4)', color: 'var(--primary-300)', fontWeight: 700 }}
                />
              </div>

              {/* Event Times */}
              <div className="form-group">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label className="form-label">Start Time <span style={{ color: 'var(--danger)' }}>*</span></label>
                    <input
                      type="time"
                      className="form-input"
                      value={form.startTime}
                      onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className="form-label">End Time <span style={{ color: 'var(--danger)' }}>*</span></label>
                    <input
                      type="time"
                      className="form-input"
                      value={form.endTime}
                      onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                      required
                    />
                  </div>
                </div>
                {errors.endTime && <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 4 }}>{errors.endTime}</div>}
              </div>

              {/* Purpose / Description */}
              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label className="form-label">Purpose / Description <span style={{ color: 'var(--danger)' }}>*</span></label>
                <textarea
                  className="form-textarea"
                  rows="3"
                  placeholder="Describe event details, role/participation, and relevance to academics (minimum 10 characters)..."
                  value={form.purpose}
                  onChange={(e) => setForm({ ...form, purpose: e.target.value })}
                  required
                />
                {errors.purpose && <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 4 }}>{errors.purpose}</div>}
              </div>

              {/* Faculty Coordinator Name */}
              <div className="form-group">
                <label className="form-label">Faculty Coordinator Name <span style={{ color: 'var(--danger)' }}>*</span></label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Dr. K. Ramesh"
                  value={form.facultyCoordinator}
                  onChange={(e) => setForm({ ...form, facultyCoordinator: e.target.value })}
                  required
                />
                {errors.facultyCoordinator && <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 4 }}>{errors.facultyCoordinator}</div>}
              </div>

              {/* Faculty Coordinator Contact */}
              <div className="form-group">
                <label className="form-label">Faculty Coordinator Contact <span style={{ color: 'var(--danger)' }}>*</span></label>
                <input
                  type="tel"
                  className="form-input"
                  placeholder="10-digit mobile number (e.g. 9876543210)"
                  maxLength="10"
                  value={form.coordinatorContact}
                  onChange={(e) => setForm({ ...form, coordinatorContact: e.target.value })}
                  required
                />
                {errors.coordinatorContact && <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 4 }}>{errors.coordinatorContact}</div>}
              </div>

              {/* Supporting Document */}
              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label className="form-label">
                  Supporting Document <span style={{ color: 'var(--danger)' }}>* (Required: Invitation letter, registration proof, etc.)</span>
                </label>
                <div style={{
                  border: errors.document ? '2px dashed var(--danger)' : '2px dashed var(--border-dark)',
                  borderRadius: 10,
                  padding: 16,
                  textAlign: 'center',
                  background: docFile ? 'rgba(16,185,129,0.05)' : 'var(--surface-dark-3)',
                  cursor: 'pointer'
                }} onClick={() => document.getElementById('od-doc-upload').click()}>
                  <input
                    id="od-doc-upload"
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
                    <div style={{ color: 'var(--gray-400)', fontSize: 13 }}>
                      📎 Click to upload event invitation, registration proof, or acceptance mail<br />
                      <span style={{ fontSize: 11, color: 'var(--gray-500)' }}>Allowed: PDF, JPG, PNG (Max 10MB)</span>
                    </div>
                  )}
                </div>
                {errors.document && <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 4 }}>{errors.document}</div>}
              </div>

              {/* Travel Required */}
              <div className="form-group">
                <label className="form-label">Travel Required?</label>
                <div style={{ display: 'flex', gap: 16, marginTop: 6 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="travelRequired"
                      checked={form.travelRequired === true}
                      onChange={() => setForm({ ...form, travelRequired: true })}
                    />
                    Yes
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="travelRequired"
                      checked={form.travelRequired === false}
                      onChange={() => setForm({ ...form, travelRequired: false })}
                    />
                    No
                  </label>
                </div>
              </div>

              {/* Travel Mode (Dynamic) */}
              {form.travelRequired && (
                <div className="form-group">
                  <label className="form-label">Travel Mode <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <select
                    className="form-select"
                    value={form.travelMode}
                    onChange={(e) => setForm({ ...form, travelMode: e.target.value })}
                  >
                    <option value="Bus">Bus</option>
                    <option value="Train">Train</option>
                    <option value="College Transport">College Transport</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              )}

              {/* Additional Remarks */}
              <div className="form-group" style={{ gridColumn: form.travelRequired ? 'span 1' : 'span 2' }}>
                <label className="form-label">Additional Remarks (Optional)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Any extra details..."
                  value={form.remarks}
                  onChange={(e) => setForm({ ...form, remarks: e.target.value })}
                />
              </div>

              {/* Parent Permission Checkbox */}
              <div className="form-group" style={{ gridColumn: 'span 2', background: 'rgba(99,102,241,0.08)', padding: 14, borderRadius: 10, border: '1px solid rgba(99,102,241,0.2)' }}>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', color: '#f8fafc', fontSize: 13 }}>
                  <input
                    type="checkbox"
                    style={{ marginTop: 2, width: 18, height: 18 }}
                    checked={form.parentPermission}
                    onChange={(e) => setForm({ ...form, parentPermission: e.target.checked })}
                    required
                  />
                  <span>
                    <strong>Parent / Guardian Permission Confirmed:</strong> I hereby declare that my parent/guardian is fully aware of and has granted permission for me to attend this event.
                  </span>
                </label>
                {errors.parentPermission && <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 6, marginLeft: 28 }}>{errors.parentPermission}</div>}
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
                  '📤 Submit OD Request'
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
              <div style={{ fontSize: 40, marginBottom: 12 }}>🎫</div>
              <h3 style={{ fontSize: 18, color: '#f8fafc', fontWeight: 700 }}>No OD Requests Found</h3>
              <p style={{ color: 'var(--gray-500)', fontSize: 14, marginTop: 4 }}>
                {isStudent ? 'You have not submitted any OD requests yet.' : 'No pending OD applications to review.'}
              </p>
              {isStudent && (
                <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setActiveTab('form')}>
                  + Submit New OD Request
                </button>
              )}
            </div>
          ) : (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-dark-3)', color: 'var(--gray-400)', borderBottom: '1px solid var(--border-dark)' }}>
                      <th style={{ padding: '14px 16px' }}>Request ID</th>
                      <th style={{ padding: '14px 16px' }}>Student Info</th>
                      <th style={{ padding: '14px 16px' }}>OD Type & Event</th>
                      <th style={{ padding: '14px 16px' }}>Dates & Duration</th>
                      <th style={{ padding: '14px 16px' }}>Location</th>
                      <th style={{ padding: '14px 16px' }}>Status</th>
                      <th style={{ padding: '14px 16px' }}>Submitted On</th>
                      <th style={{ padding: '14px 16px', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requestsList.map((req) => (
                      <tr key={req.requestId || req.id} style={{ borderBottom: '1px solid var(--border-dark)' }}>
                        <td style={{ padding: '14px 16px', fontWeight: 700, color: 'var(--primary-300)' }}>
                          {req.requestId || `OD-${req.id}`}
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ fontWeight: 600, color: '#f8fafc' }}>{req.studentName}</div>
                          <div style={{ fontSize: 11, color: 'var(--gray-500)' }}>{req.registerNumber}</div>
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ fontWeight: 600, color: '#e2e8f0' }}>{req.eventName}</div>
                          <div style={{ fontSize: 11, color: 'var(--primary-400)' }}>{req.odType}</div>
                        </td>
                        <td style={{ padding: '14px 16px', color: 'var(--gray-400)' }}>
                          📅 {req.fromDate} → {req.toDate}<br />
                          <span style={{ fontSize: 11, color: 'var(--primary-400)', fontWeight: 600 }}>
                            {req.numberOfDays} Day(s) ({req.startTime} - {req.endTime})
                          </span>
                        </td>
                        <td style={{ padding: '14px 16px', color: 'var(--gray-400)' }}>
                          📍 {req.location} ({req.organization})
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          {getStatusBadge(req.status)}
                        </td>
                        <td style={{ padding: '14px 16px', color: 'var(--gray-500)', fontSize: 12 }}>
                          {req.submittedAt ? new Date(req.submittedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A'}
                        </td>
                        <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => setSelectedRequest(req)}
                            style={{ color: 'var(--primary-400)' }}
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
          <div className="modal" style={{ maxWidth: 700 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                🎫 OD Request Details ({selectedRequest.requestId || selectedRequest.id})
              </h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelectedRequest(null)}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface-dark-3)', padding: '10px 14px', borderRadius: 8 }}>
                <span>Status:</span>
                {getStatusBadge(selectedRequest.status)}
              </div>

              <div className="grid-2" style={{ fontSize: 13, gap: 12 }}>
                <div>
                  <span style={{ color: 'var(--gray-500)', display: 'block' }}>Student Name</span>
                  <strong style={{ color: '#f8fafc' }}>{selectedRequest.studentName}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--gray-500)', display: 'block' }}>Register Number</span>
                  <strong style={{ color: '#f8fafc' }}>{selectedRequest.registerNumber}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--gray-500)', display: 'block' }}>Department & Class</span>
                  <strong style={{ color: '#f8fafc' }}>{selectedRequest.department} ({selectedRequest.year} - {selectedRequest.section})</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--gray-500)', display: 'block' }}>College Email</span>
                  <strong style={{ color: '#f8fafc' }}>{selectedRequest.collegeEmail}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--gray-500)', display: 'block' }}>OD Type & Event</span>
                  <strong style={{ color: 'var(--primary-300)' }}>{selectedRequest.odType} - {selectedRequest.eventName}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--gray-500)', display: 'block' }}>Organizing Entity</span>
                  <strong style={{ color: '#f8fafc' }}>{selectedRequest.organization} ({selectedRequest.location})</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--gray-500)', display: 'block' }}>Dates & Duration</span>
                  <strong style={{ color: '#f8fafc' }}>{selectedRequest.fromDate} → {selectedRequest.toDate} ({selectedRequest.numberOfDays} Days)</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--gray-500)', display: 'block' }}>Event Timing</span>
                  <strong style={{ color: '#f8fafc' }}>{selectedRequest.startTime} - {selectedRequest.endTime}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--gray-500)', display: 'block' }}>Faculty Coordinator</span>
                  <strong style={{ color: '#f8fafc' }}>{selectedRequest.facultyCoordinator} ({selectedRequest.coordinatorContact})</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--gray-500)', display: 'block' }}>Travel Details</span>
                  <strong style={{ color: '#f8fafc' }}>{selectedRequest.travelRequired ? `Yes (${selectedRequest.travelMode})` : 'No'}</strong>
                </div>
              </div>

              <div style={{ background: 'var(--surface-dark-4)', padding: 12, borderRadius: 8, fontSize: 13 }}>
                <span style={{ color: 'var(--gray-500)', display: 'block', marginBottom: 4 }}>Purpose / Description:</span>
                <p style={{ color: '#e2e8f0', margin: 0, whiteSpace: 'pre-wrap' }}>{selectedRequest.purpose}</p>
              </div>

              {selectedRequest.supportingDocument && (
                <div style={{ background: 'var(--surface-dark-4)', padding: 12, borderRadius: 8, fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>📄 Supporting Document Uploaded</span>
                  <a
                    href={`http://localhost:8000${selectedRequest.supportingDocument}`}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-sm btn-secondary"
                  >
                    View Document ↗
                  </a>
                </div>
              )}

              {selectedRequest.reviewerRemarks && (
                <div style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)', padding: 12, borderRadius: 8, fontSize: 13 }}>
                  <span style={{ color: 'var(--warning)', fontWeight: 700, display: 'block' }}>Faculty/HOD Remarks:</span>
                  <p style={{ color: '#e2e8f0', margin: '4px 0 0' }}>{selectedRequest.reviewerRemarks}</p>
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
                    ✅ Approve OD
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
                    ❌ Reject OD
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
