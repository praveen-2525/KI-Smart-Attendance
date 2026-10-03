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
    <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{
        background: 'var(--surface-dark-2)',
        border: '1px solid var(--border-dark)',
        borderRadius: '16px',
        padding: '32px',
        boxShadow: 'var(--shadow-lg)'
      }}>
        {/* Header avatar & basic info */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '32px', borderBottom: '1px solid var(--border-dark)', paddingBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
            <div style={{
              width: 80, height: 80, borderRadius: '50%',
              background: 'var(--gradient-brand)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 32, fontWeight: 700, color: 'white',
              boxShadow: 'var(--shadow-glow)'
            }}>
              {user.full_name ? user.full_name.split(' ').map(n => n[0]).slice(0, 2).join('') : '?'}
            </div>
            <div>
              <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#e2e8f0', margin: 0 }}>
                {user.full_name || 'User Profile'}
              </h1>
              <div style={{
                display: 'inline-block',
                marginTop: '6px',
                padding: '4px 12px',
                borderRadius: '20px',
                background: 'rgba(99,102,241,0.15)',
                border: '1px solid rgba(99,102,241,0.3)',
                color: 'var(--primary-400)',
                fontSize: '13px',
                fontWeight: 600
              }}>
                {roleLabels[user.role] || user.role}
              </div>
            </div>
          </div>
          {user.role === 'student' && !isEditing && (
            <button className="btn btn-primary" onClick={() => setIsEditing(true)}>
              Edit Profile
            </button>
          )}
        </div>

        {user.role === 'student' && missingProfileFields.length > 0 && !isEditing && (
          <div className="card mb-6" style={{ background: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.3)', color: '#fca5a5' }}>
            ⚠️ <strong>Action Required:</strong> Please edit your profile to add: {missingProfileFields.join(', ')}.
          </div>
        )}

        {/* Profile Grid */}
        <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#e2e8f0', marginBottom: '16px' }}>
          Personal & Academic Information
        </h2>
        
        {isEditing ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <div className="form-group">
              <label>Department <span className="text-danger">*</span></label>
              <input
                className="form-control"
                value={formData.department}
                onChange={e => setFormData({...formData, department: e.target.value})}
                placeholder="e.g. CSE(AI&ML)"
              />
            </div>
            <div className="form-group">
              <label>Year <span className="text-danger">*</span></label>
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
              <label>Section <span className="text-danger">*</span></label>
              <input
                className="form-control"
                value={formData.section}
                onChange={e => setFormData({...formData, section: e.target.value})}
                placeholder="e.g. A"
              />
            </div>
            <div className="form-group">
              <label>College Email <span className="text-danger">*</span></label>
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <div style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ fontSize: '12px', color: 'var(--gray-500)', marginBottom: '4px' }}>Full Name</div>
              <div style={{ fontSize: '15px', fontWeight: 600, color: '#e2e8f0' }}>{user.full_name || 'N/A'}</div>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ fontSize: '12px', color: 'var(--gray-500)', marginBottom: '4px' }}>Login / ID</div>
              <div style={{ fontSize: '15px', fontWeight: 600, color: '#e2e8f0' }}>{user.login_id || user.register_no || user.id || 'N/A'}</div>
            </div>

            {user.register_no && (
              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ fontSize: '12px', color: 'var(--gray-500)', marginBottom: '4px' }}>Register Number</div>
                <div style={{ fontSize: '15px', fontWeight: 600, color: '#e2e8f0' }}>{user.register_no}</div>
              </div>
            )}

            {user.roll_number && (
              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ fontSize: '12px', color: 'var(--gray-500)', marginBottom: '4px' }}>Roll Number</div>
                <div style={{ fontSize: '15px', fontWeight: 600, color: '#e2e8f0' }}>{user.roll_number}</div>
              </div>
            )}

            <div style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ fontSize: '12px', color: 'var(--gray-500)', marginBottom: '4px' }}>Department</div>
              <div style={{ fontSize: '15px', fontWeight: 600, color: '#e2e8f0' }}>{user.department || 'Not Set'}</div>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ fontSize: '12px', color: 'var(--gray-500)', marginBottom: '4px' }}>Academic Year</div>
              <div style={{ fontSize: '15px', fontWeight: 600, color: '#e2e8f0' }}>{user.year ? `${user.year} Year` : 'Not Set'}</div>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ fontSize: '12px', color: 'var(--gray-500)', marginBottom: '4px' }}>Section</div>
              <div style={{ fontSize: '15px', fontWeight: 600, color: '#e2e8f0' }}>{user.section || 'Not Set'}</div>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ fontSize: '12px', color: 'var(--gray-500)', marginBottom: '4px' }}>College Email</div>
              <div style={{ fontSize: '15px', fontWeight: 600, color: '#e2e8f0' }}>{user.email || 'Not Set'}</div>
            </div>

            {user.phone && (
              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ fontSize: '12px', color: 'var(--gray-500)', marginBottom: '4px' }}>Mobile Number</div>
                <div style={{ fontSize: '15px', fontWeight: 600, color: '#e2e8f0' }}>{user.phone}</div>
              </div>
            )}
          </div>
        )}

        <div style={{ marginTop: '32px', paddingTop: '20px', borderTop: '1px solid var(--border-dark)', fontSize: '12px', color: 'var(--gray-500)' }}>
          Institution: Kangeyam Institute of Technology • KI Smart Attendance+ System
        </div>
      </div>
    </div>
  );
}
