import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { authApi } from '../services/api';
import toast from 'react-hot-toast';

export default function ProfilePage() {
  const { user, updateUser } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    department: user?.department || '',
    year: user?.year || '',
    section: user?.section || '',
    email: user?.email || '',
  });
  const [saving, setSaving] = useState(false);

  if (!user) return null;

  const roleLabels = {
    student: 'Student',
    faculty: 'Faculty Member',
    advisor: 'Class Advisor',
    hod: 'Head of Department (HOD)',
    staff: 'Office Staff',
    deo: 'Data Entry Operator (DEO)'
  };

  const missingProfileFields = [];
  if (user.role === 'student') {
    if (!user.department) missingProfileFields.push('Department');
    if (!user.year) missingProfileFields.push('Year');
    if (!user.section) missingProfileFields.push('Section');
    if (!user.email) missingProfileFields.push('College Email');
  }

  const handleSave = async () => {
    setSaving(true);
    try {
      await authApi.updateProfile(formData);
      const res = await authApi.getMe();
      updateUser(res.data);
      toast.success('Profile updated successfully');
      setIsEditing(false);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">User Profile</h2>
        {user.role === 'student' && !isEditing && (
          <button className="btn btn-primary" onClick={() => setIsEditing(true)}>
            Edit Profile
          </button>
        )}
      </div>
      <div className="card-body">
        
        {/* Header avatar & basic info */}
        <div className="flex items-center gap-4 mb-4" style={{ paddingBottom: '24px', borderBottom: '1px solid var(--border)' }}>
          <div className="avatar" style={{ width: '64px', height: '64px', fontSize: '24px' }}>
            {user.full_name ? user.full_name.split(' ').map(n => n[0]).slice(0, 2).join('') : '?'}
          </div>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
              {user.full_name || 'User Profile'}
            </h1>
            <div className="badge badge-info mt-1">
              {roleLabels[user.role] || user.role}
            </div>
          </div>
        </div>

        {user.role === 'student' && missingProfileFields.length > 0 && !isEditing && (
          <div className="mb-4" style={{ background: 'var(--danger-bg)', border: '1px solid #ffd4d1', padding: '12px 16px', borderRadius: 'var(--border-radius)', color: 'var(--danger)', fontSize: '14px' }}>
            ⚠️ <strong>Action Required:</strong> Please edit your profile to add: {missingProfileFields.join(', ')}.
          </div>
        )}

        <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px' }}>
          Personal & Academic Information
        </h3>
        
        {isEditing ? (
          <div className="grid grid-2">
            <div className="form-group">
              <label className="form-label">Department <span className="text-danger">*</span></label>
              <input
                className="form-control"
                value={formData.department}
                onChange={e => setFormData({...formData, department: e.target.value})}
                placeholder="e.g. CSE(AI&ML)"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Year <span className="text-danger">*</span></label>
              <select
                className="form-control"
                value={formData.year}
                onChange={e => setFormData({...formData, year: e.target.value})}
              >
                <option value="">Select Year</option>
                <option value="I">I Year</option>
                <option value="II">II Year</option>
                <option value="III">III Year</option>
                <option value="IV">IV Year</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Section <span className="text-danger">*</span></label>
              <input
                className="form-control"
                value={formData.section}
                onChange={e => setFormData({...formData, section: e.target.value})}
                placeholder="e.g. A"
              />
            </div>
            <div className="form-group">
              <label className="form-label">College Email <span className="text-danger">*</span></label>
              <input
                className="form-control"
                type="email"
                value={formData.email}
                onChange={e => setFormData({...formData, email: e.target.value})}
                placeholder="e.g. student@ki.edu"
              />
            </div>
            <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '10px', marginTop: '10px' }}>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save Profile'}
              </button>
              <button className="btn btn-secondary" onClick={() => setIsEditing(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-3">
            <div>
              <div className="text-muted" style={{ fontSize: '12px' }}>Full Name</div>
              <div style={{ fontWeight: 500 }}>{user.full_name || 'N/A'}</div>
            </div>
            <div>
              <div className="text-muted" style={{ fontSize: '12px' }}>Login / ID</div>
              <div style={{ fontWeight: 500 }}>{user.login_id || user.register_no || user.id || 'N/A'}</div>
            </div>
            {user.register_no && (
              <div>
                <div className="text-muted" style={{ fontSize: '12px' }}>Register Number</div>
                <div style={{ fontWeight: 500 }}>{user.register_no}</div>
              </div>
            )}
            {user.roll_number && (
              <div>
                <div className="text-muted" style={{ fontSize: '12px' }}>Roll Number</div>
                <div style={{ fontWeight: 500 }}>{user.roll_number}</div>
              </div>
            )}
            <div>
              <div className="text-muted" style={{ fontSize: '12px' }}>Department</div>
              <div style={{ fontWeight: 500 }}>{user.department || 'Not Set'}</div>
            </div>
            <div>
              <div className="text-muted" style={{ fontSize: '12px' }}>Academic Year</div>
              <div style={{ fontWeight: 500 }}>{user.year ? `${user.year} Year` : 'Not Set'}</div>
            </div>
            <div>
              <div className="text-muted" style={{ fontSize: '12px' }}>Section</div>
              <div style={{ fontWeight: 500 }}>{user.section || 'Not Set'}</div>
            </div>
            <div>
              <div className="text-muted" style={{ fontSize: '12px' }}>College Email</div>
              <div style={{ fontWeight: 500 }}>{user.email || 'Not Set'}</div>
            </div>
            {user.phone && (
              <div>
                <div className="text-muted" style={{ fontSize: '12px' }}>Mobile Number</div>
                <div style={{ fontWeight: 500 }}>{user.phone}</div>
              </div>
            )}
          </div>
        )}

        <div className="text-muted mt-4" style={{ fontSize: '12px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
          Institution: Kangeyam Institute of Technology • KI Smart Attendance+ System
        </div>
      </div>
    </div>
  );
}
