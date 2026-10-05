import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { odApi, API_BASE_URL } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

// Two-stage OD workflow statuses (kept in sync with the backend)
export const OD_STATUS_PENDING = 'Pending Approval';
export const OD_STATUS_AWAITING_PROOF = 'Approved – Awaiting Completion Proof';
export const OD_STATUS_FINAL = 'Fulfilled / Final Approved';
export const OD_STUDENT_AWAITING_LABEL = 'Approved – Submit Completion Proof';
export const COMPLETION_PENDING = 'Completion Proof Pending Verification';

const REVIEW_TABS = [
  { key: 'pending', label: 'Pending OD Requests' },
  { key: 'approved', label: 'Approved OD Requests' },
  { key: 'completion', label: 'OD Completion Verification' },
  { key: 'completed', label: 'Completed OD' },
  { key: 'rejected', label: 'Rejected' },
];

export default function ODPage() {
  const { user } = useAuth();
  const isStudent = user?.role === 'student';
  const isReviewer = ['advisor', 'hod', 'deo'].includes(user?.role);
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState(isStudent ? 'form' : 'pending'); // student: 'form' | 'my-requests'; reviewer: workflow tab
  const [selectedRequest, setSelectedRequest] = useState(null);

  // Stage-2 completion proof submission (student)
  const [proofRequest, setProofRequest] = useState(null);
  const [proofForm, setProofForm] = useState({
    proofType: 'CERTIFICATE',
    latitude: '',
    longitude: '',
    locationAddress: '',
    remarks: '',
  });
  const [proofFile, setProofFile] = useState(null);
  const [proofErrors, setProofErrors] = useState({});
  const [capturingLocation, setCapturingLocation] = useState(false);

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

  // Reviewer workflow tabs: pending | approved | completion | completed | rejected
  const { data: reviewData, isLoading: loadingReview } = useQuery({
    queryKey: ['od-review-tab', activeTab],
    queryFn: () =>
      activeTab === 'completion'
        ? odApi.getCompletionPending()
        : odApi.getPending({ tab: activeTab }),
    enabled: isReviewer,
    select: (res) => res.data,
  });

  const reviewMutation = useMutation({
    mutationFn: ({ id, status, remarks }) => odApi.review(id, status, remarks),
    onSuccess: (res, vars) => {
      toast.success(res?.data?.message || `OD request ${vars.status.toLowerCase()} successfully.`);
      qc.invalidateQueries(['od-review-tab']);
      qc.invalidateQueries(['od-pending']);
      qc.invalidateQueries(['od-my']);
      setSelectedRequest(null);
    },
    onError: (err) => {
      toast.error(err.response?.data?.detail || 'Failed to update OD request');
    }
  });

  // Stage-2: Advisor/HOD verifies the completion proof
  const completionMutation = useMutation({
    mutationFn: ({ id, status, remarks }) => odApi.reviewCompletion(id, status, remarks),
    onSuccess: (res) => {
      toast.success(res?.data?.message || 'Completion proof verified successfully.');
      qc.invalidateQueries(['od-review-tab']);
      qc.invalidateQueries(['od-pending']);
      qc.invalidateQueries(['od-my']);
      setSelectedRequest(null);
    },
    onError: (err) => {
      toast.error(err.response?.data?.detail || 'Failed to verify completion proof');
    }
  });

  // Stage-2: student submits certificate / geo-tagged photo
  const proofMutation = useMutation({
    mutationFn: ({ id, formData }) => odApi.submitCompletionProof(id, formData),
    onSuccess: (res) => {
      toast.success(res?.data?.message || 'Completion proof submitted successfully. Awaiting verification.');
      qc.invalidateQueries(['od-my']);
      closeProofModal();
    },
    onError: (err) => {
      const detail = err.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Unable to submit completion proof right now. Please try again.');
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

  const requestsList = isStudent ? (myODData?.requests || []) : (reviewData?.requests || []);

  // ---- Stage-2 completion proof helpers (student) ----
  const canSubmitProof = (req) =>
    req?.status === OD_STATUS_AWAITING_PROOF &&
    req?.completionStatus !== COMPLETION_PENDING &&
    req?.completionStatus !== 'Approved';

  const openProofModal = (req) => {
    setProofRequest(req);
    setProofForm({ proofType: 'CERTIFICATE', latitude: '', longitude: '', locationAddress: '', remarks: '' });
    setProofFile(null);
    setProofErrors({});
  };

  const closeProofModal = () => {
    setProofRequest(null);
    setProofFile(null);
    setProofErrors({});
  };

  const captureGeoLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by this browser. Enter the location manually.');
      return;
    }
    setCapturingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setProofForm((f) => ({
          ...f,
          latitude: String(pos.coords.latitude.toFixed(6)),
          longitude: String(pos.coords.longitude.toFixed(6)),
        }));
        setCapturingLocation(false);
        toast.success('Location captured successfully.');
      },
      () => {
        setCapturingLocation(false);
        toast.error('Could not capture location. Please enter it manually.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleProofSubmit = (e) => {
    e.preventDefault();
    const errs = {};
    if (!proofFile) {
      errs.file = proofForm.proofType === 'CERTIFICATE'
        ? 'Certificate file is required'
        : 'Geo-tagged event photo is required';
    }
    if (proofForm.proofType === 'GEO_TAGGED_PHOTO' && proofFile) {
      const ext = (proofFile.name.split('.').pop() || '').toLowerCase();
      if (!['jpg', 'jpeg', 'png'].includes(ext)) {
        errs.file = 'Geo-tagged photo must be a JPG or PNG image';
      }
    }
    if (proofForm.proofType === 'CERTIFICATE' && proofFile) {
      const ext = (proofFile.name.split('.').pop() || '').toLowerCase();
      if (!['pdf', 'jpg', 'jpeg', 'png'].includes(ext)) {
        errs.file = 'Certificate must be a PDF, JPG or PNG file';
      }
    }
    setProofErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const fd = new FormData();
    fd.append('proofType', proofForm.proofType);
    fd.append('proof', proofFile);
    fd.append('latitude', proofForm.latitude || '');
    fd.append('longitude', proofForm.longitude || '');
    fd.append('locationAddress', proofForm.locationAddress || '');
    fd.append('remarks', proofForm.remarks || '');
    proofMutation.mutate({ id: proofRequest.requestId || proofRequest.id, formData: fd });
  };

  const getStatusBadge = (status, forStudent = false) => {
    switch (status) {
      case 'Approved':
      case OD_STATUS_AWAITING_PROOF:
        return (
          <span className="badge badge-approved">
            {forStudent ? OD_STUDENT_AWAITING_LABEL : 'Approved – Awaiting Completion Proof'}
          </span>
        );
      case OD_STATUS_FINAL:
        return <span className="badge badge-approved">✓ OD Confirmed</span>;
      case 'Rejected':
        return <span className="badge badge-rejected">❌ Rejected</span>;
      case 'Cancelled':
        return <span className="badge" style={{ background: 'rgba(148,163,184,0.15)', color: 'var(--text-secondary)' }}>🚫 Cancelled</span>;
      default:
        return <span className="badge badge-pending">⏳ Pending Approval</span>;
    }
  };

  const getCompletionBadge = (completionStatus) => {
    switch (completionStatus) {
      case COMPLETION_PENDING:
        return <span className="badge badge-pending">Proof Pending Verification</span>;
      case 'Approved':
        return <span className="badge badge-approved">Proof Verified</span>;
      case 'Rejected':
        return <span className="badge badge-rejected">Proof Rejected</span>;
      default:
        return null;
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
          <h2 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>🎫</span> On Duty (OD) Request
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 2 }}>
            {isStudent ? 'Apply for On-Duty attendance for hackathons, symposiums, sports & events.' : 'Review and process student On-Duty applications.'}
          </p>
        </div>

        {/* Student tab switcher */}
        {isStudent && (
          <div style={{ display: 'flex', background: 'var(--bg-surface)', borderRadius: 12, padding: 4, border: '1px solid var(--border)' }}>
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
              📂 My Requests ({requestsList.length})
            </button>
          </div>
        )}
      </div>

      {/* Advisor/HOD/DEO workflow tabs */}
      {isReviewer && (
        <div style={{
          display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap',
          borderBottom: '1px solid var(--border)', paddingBottom: 10
        }}>
          {REVIEW_TABS.map((tab) => (
            <button
              key={tab.key}
              className={`btn btn-sm ${activeTab === tab.key ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setActiveTab(tab.key)}
              style={{ fontSize: 13, padding: '6px 14px' }}
            >
              {tab.label}{activeTab === tab.key ? ` (${requestsList.length})` : ''}
            </button>
          ))}
        </div>
      )}

      {/* Profile missing alert */}
      {isStudent && missingProfileFields.length > 0 && (
        <div className="card mb-6" style={{ background: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.3)', color: '#fca5a5' }}>
          ⚠️ <strong>Incomplete Profile Information:</strong> The following profile details are missing: {missingProfileFields.join(', ')}. Please update your profile in settings or contact admin before applying.
        </div>
      )}

      {/* FORM TAB - STUDENT ONLY */}
      {activeTab === 'form' && isStudent && (
        <div className="card mb-6" style={{ maxWidth: 950, margin: '0 auto' }}>
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
                  style={{ background: 'var(--surface-dark-4)', color: 'var(--secondary)', fontWeight: 700 }}
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
                    <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                      📎 Click to upload event invitation, registration proof, or acceptance mail<br />
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Allowed: PDF, JPG, PNG (Max 10MB)</span>
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
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', color: 'var(--text-primary)', fontSize: 13 }}>
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

      {/* MY REQUESTS / REVIEWER WORKFLOW TABS */}
      {(activeTab === 'my-requests' || isReviewer) && (
        <div>
          {/* Student banner: OD approved, awaiting completion proof (two-stage workflow) */}
          {isStudent && activeTab === 'my-requests' && requestsList.some((r) => canSubmitProof(r)) && (
            <div className="card mb-4" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.35)' }}>
              <div className="card-body" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--success)', marginBottom: 4 }}>
                    ✅ OD Request Approved
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                    Your OD request has been approved. After completing the event, submit the required certificate or geo-tagged photo for final verification.
                  </div>
                </div>
                <button
                  className="btn btn-primary"
                  onClick={() => openProofModal(requestsList.find((r) => canSubmitProof(r)))}
                >
                  📎 Submit Completion Proof
                </button>
              </div>
            </div>
          )}

          {requestsList.length === 0 ? (
            <div className="card text-center" style={{ padding: '40px 20px' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🎫</div>
              <h3 style={{ fontSize: 18, color: 'var(--text-primary)', fontWeight: 700 }}>No OD Requests Found</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 4 }}>
                {isStudent ? 'You have not submitted any OD requests yet.' : 'No OD applications in this view.'}
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
                    <tr style={{ background: 'var(--bg-body)', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>
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
                      <tr key={req.requestId || req.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '14px 16px', fontWeight: 700, color: 'var(--secondary)' }}>
                          {req.requestId || `OD-${req.id}`}
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{req.studentName}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{req.registerNumber}</div>
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{req.eventName}</div>
                          <div style={{ fontSize: 11, color: 'var(--secondary)' }}>{req.odType}</div>
                        </td>
                        <td style={{ padding: '14px 16px', color: 'var(--text-secondary)' }}>
                          📅 {req.fromDate} → {req.toDate}<br />
                          <span style={{ fontSize: 11, color: 'var(--secondary)', fontWeight: 600 }}>
                            {req.numberOfDays} Day(s) ({req.startTime} - {req.endTime})
                          </span>
                        </td>
                        <td style={{ padding: '14px 16px', color: 'var(--text-secondary)' }}>
                          📍 {req.location} ({req.organization})
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          {getStatusBadge(req.status, isStudent)}
                          {isStudent && getCompletionBadge(req.completionStatus) && (
                            <div style={{ marginTop: 4 }}>{getCompletionBadge(req.completionStatus)}</div>
                          )}
                        </td>
                        <td style={{ padding: '14px 16px', color: 'var(--text-muted)', fontSize: 12 }}>
                          {req.submittedAt ? new Date(req.submittedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A'}
                        </td>
                        <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                          {isReviewer && req.completionStatus === COMPLETION_PENDING ? (
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => setSelectedRequest(req)}
                              >
                                📄 View Proof
                              </button>
                              <button
                                className="btn btn-success btn-sm"
                                disabled={completionMutation.isLoading}
                                onClick={() => completionMutation.mutate({ id: req.requestId || req.id, status: 'Approved', remarks: '' })}
                              >
                                ✅ Approve
                              </button>
                              <button
                                className="btn btn-danger btn-sm"
                                disabled={completionMutation.isLoading}
                                onClick={() => {
                                  const remarks = prompt('Reason for rejecting the completion proof:');
                                  if (remarks !== null) {
                                    completionMutation.mutate({ id: req.requestId || req.id, status: 'Rejected', remarks });
                                  }
                                }}
                              >
                                ❌ Reject
                              </button>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                              {isStudent && canSubmitProof(req) && (
                                <button
                                  className="btn btn-primary btn-sm"
                                  onClick={() => openProofModal(req)}
                                >
                                  📎 Submit Completion Proof
                                </button>
                              )}
                              <button
                                className="btn btn-ghost btn-sm"
                                onClick={() => setSelectedRequest(req)}
                                style={{ color: 'var(--secondary)' }}
                              >
                                👁️ Details
                              </button>
                            </div>
                          )}
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
                  <span style={{ color: 'var(--text-muted)', display: 'block' }}>OD Type & Event</span>
                  <strong style={{ color: 'var(--secondary)' }}>{selectedRequest.odType} - {selectedRequest.eventName}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block' }}>Organizing Entity</span>
                  <strong style={{ color: 'var(--text-primary)' }}>{selectedRequest.organization} ({selectedRequest.location})</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block' }}>Dates & Duration</span>
                  <strong style={{ color: 'var(--text-primary)' }}>{selectedRequest.fromDate} → {selectedRequest.toDate} ({selectedRequest.numberOfDays} Days)</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block' }}>Event Timing</span>
                  <strong style={{ color: 'var(--text-primary)' }}>{selectedRequest.startTime} - {selectedRequest.endTime}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block' }}>Faculty Coordinator</span>
                  <strong style={{ color: 'var(--text-primary)' }}>{selectedRequest.facultyCoordinator} ({selectedRequest.coordinatorContact})</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block' }}>Travel Details</span>
                  <strong style={{ color: 'var(--text-primary)' }}>{selectedRequest.travelRequired ? `Yes (${selectedRequest.travelMode})` : 'No'}</strong>
                </div>
              </div>

              <div style={{ background: 'var(--surface-dark-4)', padding: 12, borderRadius: 8, fontSize: 13 }}>
                <span style={{ color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Purpose / Description:</span>
                <p style={{ color: 'var(--text-primary)', margin: 0, whiteSpace: 'pre-wrap' }}>{selectedRequest.purpose}</p>
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

              {/* Completion Proof section (Stage 2) */}
              {selectedRequest.completionStatus && (
                <div style={{ background: 'var(--bg-body)', padding: 12, borderRadius: 8, fontSize: 13 }}>
                  <span style={{ color: 'var(--text-secondary)', fontWeight: 700, display: 'block', marginBottom: 8 }}>
                    📎 OD Completion Proof (Stage 2)
                  </span>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface-dark-4)', padding: '8px 10px', borderRadius: 6 }}>
                    <span>
                      <strong>{selectedRequest.proofType === 'GEO_TAGGED_PHOTO' ? '📷 Geo-tagged Event Photo' : '📄 Certificate'}</strong>
                      {selectedRequest.geoLocation?.latitude && (
                        <span style={{ color: 'var(--text-muted)', fontSize: 12, display: 'block' }}>
                          📍 {selectedRequest.geoLocation.latitude}, {selectedRequest.geoLocation.longitude}
                          {selectedRequest.geoLocation.address ? ` — ${selectedRequest.geoLocation.address}` : ''}
                        </span>
                      )}
                      {selectedRequest.completionSubmittedAt && (
                        <span style={{ color: 'var(--text-muted)', fontSize: 12, display: 'block' }}>
                          Submitted: {new Date(selectedRequest.completionSubmittedAt).toLocaleString('en-IN')}
                        </span>
                      )}
                    </span>
                    {selectedRequest.proofUrl ? (
                      <a
                        href={`${API_BASE_URL}${selectedRequest.proofUrl}`}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-sm btn-secondary"
                      >
                        View Proof ↗
                      </a>
                    ) : (
                      <span className="badge badge-pending">Not submitted</span>
                    )}
                  </div>
                  <div style={{ marginTop: 8 }}>{getCompletionBadge(selectedRequest.completionStatus)}</div>
                </div>
              )}

              {/* Reviewer Action Buttons - Stage 1 (Pending Approval) */}
              {isReviewer && (selectedRequest.status === OD_STATUS_PENDING || selectedRequest.status === 'Pending') && (
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
                      if (remarks !== null) {
                        reviewMutation.mutate({ id: selectedRequest.requestId || selectedRequest.id, status: 'Rejected', remarks });
                      }
                    }}
                  >
                    ❌ Reject OD
                  </button>
                </div>
              )}

              {/* Reviewer Action Buttons - Stage 2 (Completion proof pending verification) */}
              {isReviewer && selectedRequest.completionStatus === COMPLETION_PENDING && (
                <div style={{ display: 'flex', gap: 10, marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border-dark)' }}>
                  <button
                    className="btn btn-success"
                    style={{ flex: 1 }}
                    disabled={completionMutation.isLoading}
                    onClick={() => completionMutation.mutate({ id: selectedRequest.requestId || selectedRequest.id, status: 'Approved', remarks: '' })}
                  >
                    ✅ Approve Completion Proof
                  </button>
                  <button
                    className="btn btn-danger"
                    style={{ flex: 1 }}
                    disabled={completionMutation.isLoading}
                    onClick={() => {
                      const remarks = prompt('Reason for rejecting the completion proof:');
                      if (remarks !== null) {
                        completionMutation.mutate({ id: selectedRequest.requestId || selectedRequest.id, status: 'Rejected', remarks });
                      }
                    }}
                  >
                    ❌ Reject Completion Proof
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* STAGE-2: OD COMPLETION PROOF SUBMISSION MODAL (STUDENT) */}
      {proofRequest && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 620 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                📎 OD Completion Proof ({proofRequest.requestId || proofRequest.id})
              </h3>
              <button className="btn btn-ghost btn-sm" onClick={closeProofModal}>✕</button>
            </div>

            {/* Original OD request context */}
            <div style={{ background: 'var(--bg-body)', padding: 14, borderRadius: 10, fontSize: 13, marginBottom: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: 11 }}>Original OD Request ID</span>
                <strong style={{ color: 'var(--secondary)' }}>{proofRequest.requestId || proofRequest.id}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: 11 }}>Student ID</span>
                <strong>{proofRequest.studentId || user?.id || 'N/A'}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: 11 }}>Student Name</span>
                <strong>{proofRequest.studentName || user?.full_name}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: 11 }}>Register Number</span>
                <strong>{proofRequest.registerNumber || user?.register_number || user?.login_id}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: 11 }}>Event Name</span>
                <strong>{proofRequest.eventName}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: 11 }}>Event Date</span>
                <strong>{proofRequest.fromDate}{proofRequest.toDate && proofRequest.toDate !== proofRequest.fromDate ? ` → ${proofRequest.toDate}` : ''}</strong>
              </div>
            </div>

            <form onSubmit={handleProofSubmit}>
              {/* Proof type selector: Option A certificate / Option B geo-tagged photo */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
                <label style={{
                  flex: 1, border: proofForm.proofType === 'CERTIFICATE' ? '2px solid var(--primary-500)' : '1px solid var(--border)',
                  borderRadius: 10, padding: 12, cursor: 'pointer', textAlign: 'center'
                }}>
                  <input
                    type="radio"
                    name="proofType"
                    checked={proofForm.proofType === 'CERTIFICATE'}
                    onChange={() => setProofForm({ ...proofForm, proofType: 'CERTIFICATE' })}
                    style={{ display: 'none' }}
                  />
                  <div style={{ fontSize: 22, marginBottom: 4 }}>📄</div>
                  <strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>Option A: Certificate</strong>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>PDF, JPG or PNG (Max 10MB)</div>
                </label>
                <label style={{
                  flex: 1, border: proofForm.proofType === 'GEO_TAGGED_PHOTO' ? '2px solid var(--primary-500)' : '1px solid var(--border)',
                  borderRadius: 10, padding: 12, cursor: 'pointer', textAlign: 'center'
                }}>
                  <input
                    type="radio"
                    name="proofType"
                    checked={proofForm.proofType === 'GEO_TAGGED_PHOTO'}
                    onChange={() => setProofForm({ ...proofForm, proofType: 'GEO_TAGGED_PHOTO' })}
                    style={{ display: 'none' }}
                  />
                  <div style={{ fontSize: 22, marginBottom: 4 }}>📷</div>
                  <strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>Option B: Geo-tagged Photo</strong>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>JPG or PNG image with location</div>
                </label>
              </div>

              {/* File upload */}
              <div className="form-group">
                <label className="form-label">
                  {proofForm.proofType === 'CERTIFICATE' ? 'Certificate File *' : 'Geo-tagged Event Photo *'}
                </label>
                <div style={{
                  border: proofErrors.file ? '2px dashed var(--danger)' : '2px dashed var(--border-dark)',
                  borderRadius: 10, padding: 16, textAlign: 'center',
                  background: proofFile ? 'rgba(16,185,129,0.05)' : 'var(--surface-dark-3)',
                  cursor: 'pointer'
                }} onClick={() => document.getElementById('od-proof-upload').click()}>
                  <input
                    id="od-proof-upload"
                    type="file"
                    accept={proofForm.proofType === 'CERTIFICATE' ? '.pdf,image/jpeg,image/png,image/jpg' : 'image/jpeg,image/png,image/jpg'}
                    style={{ display: 'none' }}
                    onChange={(e) => setProofFile(e.target.files[0])}
                  />
                  {proofFile ? (
                    <div style={{ color: 'var(--success)', fontWeight: 600, fontSize: 14 }}>
                      📄 Selected: {proofFile.name} ({(proofFile.size / 1024 / 1024).toFixed(2)} MB)
                    </div>
                  ) : (
                    <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                      📎 Click to upload your {proofForm.proofType === 'CERTIFICATE' ? 'completion certificate' : 'geo-tagged event photo'}<br />
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {proofForm.proofType === 'CERTIFICATE' ? 'Allowed: PDF, JPG, PNG (Max 10MB)' : 'Allowed: JPG, PNG (Max 10MB)'}
                      </span>
                    </div>
                  )}
                </div>
                {proofErrors.file && <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 4 }}>{proofErrors.file}</div>}
              </div>

              {/* Geo location fields (geo-tagged photo only) */}
              {proofForm.proofType === 'GEO_TAGGED_PHOTO' && (
                <div style={{ background: 'var(--bg-body)', borderRadius: 10, padding: 14, marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>📍 Location Information</strong>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={captureGeoLocation}
                      disabled={capturingLocation}
                    >
                      {capturingLocation ? <><span className="spinner" style={{ width: 12, height: 12 }} /> Capturing...</> : '📍 Capture Current Location'}
                    </button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <input
                      className="form-input"
                      placeholder="Latitude"
                      value={proofForm.latitude}
                      onChange={(e) => setProofForm({ ...proofForm, latitude: e.target.value })}
                    />
                    <input
                      className="form-input"
                      placeholder="Longitude"
                      value={proofForm.longitude}
                      onChange={(e) => setProofForm({ ...proofForm, longitude: e.target.value })}
                    />
                    <input
                      className="form-input"
                      style={{ gridColumn: 'span 2' }}
                      placeholder="Location address (e.g. Venue name, City)"
                      value={proofForm.locationAddress}
                      onChange={(e) => setProofForm({ ...proofForm, locationAddress: e.target.value })}
                    />
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                    Location information is stored with the proof for verification when geo-tagged photo is used.
                  </div>
 </div>
              )}

              {/* Remarks */}
              <div className="form-group">
                <label className="form-label">Remarks (Optional)</label>
                <input
                  className="form-input"
                  placeholder="Any additional details about the proof..."
                  value={proofForm.remarks}
                  onChange={(e) => setProofForm({ ...proofForm, remarks: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}>
                <button type="button" className="btn btn-secondary" onClick={closeProofModal} disabled={proofMutation.isLoading}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={proofMutation.isLoading}>
                  {proofMutation.isLoading ? (
                    <><span className="spinner" style={{ width: 14, height: 14, borderRightColor: 'transparent' }} /> Submitting...</>
                  ) : (
                    '📤 Submit Completion Proof'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}


