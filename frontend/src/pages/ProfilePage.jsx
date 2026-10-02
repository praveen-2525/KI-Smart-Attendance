import { useAuth } from '../contexts/AuthContext';

export default function ProfilePage() {
  const { user } = useAuth();

  if (!user) return null;

  const roleLabels = {
    student: 'Student',
    faculty: 'Faculty Member',
    advisor: 'Class Advisor',
    hod: 'Head of Department (HOD)',
    staff: 'Office Staff',
    deo: 'Data Entry Operator (DEO)'
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px', marginBottom: '32px', borderBottom: '1px solid var(--border-dark)', paddingBottom: '24px' }}>
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

        {/* Profile Grid */}
        <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#e2e8f0', marginBottom: '16px' }}>
          Personal & Academic Information
        </h2>
        
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
            <div style={{ fontSize: '15px', fontWeight: 600, color: '#e2e8f0' }}>{user.department || 'CSE(AI&ML)'}</div>
          </div>

          {user.year && (
            <div style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ fontSize: '12px', color: 'var(--gray-500)', marginBottom: '4px' }}>Academic Year</div>
              <div style={{ fontSize: '15px', fontWeight: 600, color: '#e2e8f0' }}>{user.year} Year</div>
            </div>
          )}

          {user.section && (
            <div style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ fontSize: '12px', color: 'var(--gray-500)', marginBottom: '4px' }}>Section</div>
              <div style={{ fontSize: '15px', fontWeight: 600, color: '#e2e8f0' }}>{user.section}</div>
            </div>
          )}

          <div style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ fontSize: '12px', color: 'var(--gray-500)', marginBottom: '4px' }}>College Email</div>
            <div style={{ fontSize: '15px', fontWeight: 600, color: '#e2e8f0' }}>{user.email || 'N/A'}</div>
          </div>

          {user.phone && (
            <div style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ fontSize: '12px', color: 'var(--gray-500)', marginBottom: '4px' }}>Mobile Number</div>
              <div style={{ fontSize: '15px', fontWeight: 600, color: '#e2e8f0' }}>{user.phone}</div>
            </div>
          )}
        </div>

        <div style={{ marginTop: '32px', paddingTop: '20px', borderTop: '1px solid var(--border-dark)', fontSize: '12px', color: 'var(--gray-500)' }}>
          Institution: Kangeyam Institute of Technology • KI Smart Attendance+ System
        </div>
      </div>
    </div>
  );
}
