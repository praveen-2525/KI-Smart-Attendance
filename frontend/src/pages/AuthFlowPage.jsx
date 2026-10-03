import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getRoleDashboardPath } from '../utils/roleRedirect';
import toast from 'react-hot-toast';
import { API_BASE_URL } from '../services/api';

const ROLES = [
  { id: 'student',  title: 'Student',   icon: '👨‍🎓', desc: 'Access attendance, OD, leave and personal requests', badge: 'Student Portal' },
  { id: 'hod',      title: 'HOD',        icon: '👨‍💼', desc: 'Manage department students, attendance and approvals', badge: 'Department Head' },
  { id: 'advisor',  title: 'Advisor',    icon: '👨‍🏫', desc: 'Manage assigned students and requests', badge: 'Class Advisor' },
  { id: 'faculty',  title: 'Faculty',    icon: '👩‍🏫', desc: 'Manage classes, attendance and approved requests', badge: 'Faculty Member' },
  { id: 'staff',    title: 'Staff',      icon: '👨‍💻', desc: 'View approved OD and leave information', badge: 'Office Staff' },
  { id: 'deo',      title: 'DEO',        icon: '🧑‍💼', desc: 'Manage students, attendance corrections and records', badge: 'Data Entry Operator' },
];

export default function AuthFlowPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  // Step 1: Role Selection, Step 2: Login
  const [step, setStep] = useState(1);
  const [selectedRole, setSelectedRole] = useState(null);

  // Login State
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [loading, setLoading] = useState(false);

  // Register state (for Student)
  const [activeTab, setActiveTab] = useState('login');
  const [regData, setRegData] = useState({
    roll_number: '',
    register_no: '',
    name: '',
    date_of_birth: '',
    department: 'CSE(AI&ML)',
    year: 'III',
    section: 'AIML',
    email: '',
    phone: '',
    password: '',
    confirm_password: ''
  });
  const [errors, setErrors] = useState({});

  const handleRoleSelect = (roleObj) => {
    setSelectedRole(roleObj);
    setLoginId('');
    setPassword('');
    setLoginError('');
    setActiveTab('login');
    setStep(2);
  };

  const handleBack = () => {
    setStep(1);
    setSelectedRole(null);
    setLoginError('');
  };

  const validateLogin = () => {
    if (!loginId.trim()) {
      setLoginError('Login ID is required. Enter your ID or College Email.');
      return false;
    }
    if (!password) {
      setLoginError('Password is required.');
      return false;
    }
    if (selectedRole && selectedRole.id !== 'student') {
      if (!loginId.includes('@')) {
        setLoginError('Please enter a valid institutional email address.');
        return false;
      }
    }
    setLoginError('');
    return true;
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    if (!validateLogin()) return;

    setLoading(true);
    setLoginError('');
    try {
      const user = await login(loginId, password, selectedRole?.id || null);
      toast.success(`Welcome back, ${user.full_name || 'User'}!`);
      navigate(getRoleDashboardPath(user.role), { replace: true });
    } catch (err) {
      let detail = err.response?.data?.detail;
      if (!detail) {
        detail = err.message === 'Network Error' || !err.response
          ? 'Unable to connect to the server. Please try again.'
          : 'Invalid email or password.';
      }
      setLoginError(detail);
    } finally {
      setLoading(false);
    }
  };

  const validateRegister = (field = null) => {
    let errs = { ...errors };
    const validateField = (name, value) => {
      switch (name) {
        case 'roll_number':
          if (!value) return 'Roll Number is required.';
          if (value.length !== 8) return 'Roll Number must contain exactly 8 characters.';
          if (!/^[0-9]{2}AIM[0-9]{3}$/.test(value)) return 'Use uppercase AIM. Example: 24AIM040.';
          return '';
        case 'register_no':
          if (!value) return 'Register Number is required.';
          if (/[a-zA-Z\s-]/.test(value)) return 'Register Number can contain numbers only.';
          if (value.length !== 12 || !/^[0-9]{12}$/.test(value)) return 'Register Number must contain 12 digits.';
          return '';
        case 'name':
          if (!value.trim()) return 'Full Name is required.';
          return '';
        case 'date_of_birth':
          if (!value) return 'Date of Birth is required.';
          return '';
        case 'email':
          if (!value.trim()) return 'College Email is required.';
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Enter a valid email.';
          return '';
        case 'phone':
          if (!value) return 'Mobile Number is required.';
          if (value.length !== 10) return 'Mobile Number must contain 10 digits.';
          return '';
        case 'password':
          if (!value) return 'Password is required.';
          if (value.length < 8) return 'Must be at least 8 characters.';
          return '';
        case 'confirm_password':
          if (value !== regData.password) return 'Passwords do not match.';
          return '';
        default: return '';
      }
    };

    if (field) {
      errs[field] = validateField(field, regData[field]);
    } else {
      Object.keys(regData).forEach(key => { errs[key] = validateField(key, regData[key]); });
    }
    setErrors(errs);
    return Object.values(errs).every(x => x === '');
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    if (!validateRegister()) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(regData),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.detail || 'Registration failed');
      } else {
        toast.success('Registration successful! Please login.');
        setActiveTab('login');
        setLoginId(regData.roll_number || regData.register_no);
        setPassword('');
      }
    } catch (err) {
      toast.error('Authentication service unavailable');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field, value) => {
    setRegData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }));
  };

  // STEP 1 — ROLE SELECTION
  if (step === 1) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'var(--bg-body)',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{
          background: 'var(--primary-600)',
          padding: '20px 40px',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
        }}>
          <div style={{
            width: 40, height: 40,
            background: 'rgba(255,255,255,0.15)',
            borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20,
          }}>🎓</div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'white' }}>KI Smart Attendance+</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>Kangeyam Institute of Technology</div>
          </div>
        </div>

        {/* Main content */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '48px 24px',
        }}>
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
              Welcome to KI Smart Attendance+
            </h1>
            <p style={{ fontSize: 15, color: 'var(--text-secondary)' }}>
              Please select your role to continue to the portal
            </p>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 16,
            width: '100%',
            maxWidth: 900,
          }}>
            {ROLES.map((r) => (
              <button
                key={r.id}
                onClick={() => handleRoleSelect(r)}
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--border-radius-lg)',
                  padding: 20,
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  fontFamily: 'inherit',
                }}
                onMouseOver={e => {
                  e.currentTarget.style.borderColor = 'var(--secondary)';
                  e.currentTarget.style.boxShadow = '0 0 0 2px rgba(0,82,204,0.1)';
                }}
                onMouseOut={e => {
                  e.currentTarget.style.borderColor = 'var(--border)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 28 }}>{r.icon}</span>
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: '3px 8px',
                    borderRadius: 4, background: 'var(--info-bg)',
                    color: 'var(--info)', border: '1px solid #bce4fa',
                  }}>
                    {r.badge}
                  </span>
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {r.title}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  {r.desc}
                </div>
                <div style={{ fontSize: 13, color: 'var(--secondary)', fontWeight: 600, marginTop: 4 }}>
                  Proceed to Login →
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          background: 'var(--bg-surface)',
          borderTop: '1px solid var(--border)',
          padding: '12px 40px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            © 2024 Kangeyam Institute of Technology. All rights reserved.
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            KI Smart Attendance+ v2.0
          </div>
        </div>
      </div>
    );
  }

  // STEP 2 — LOGIN / REGISTER
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-body)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        background: 'var(--primary-600)', padding: '16px 40px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 36, height: 36, background: 'rgba(255,255,255,0.15)',
            borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
          }}>🎓</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'white' }}>KI Smart Attendance+</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>Kangeyam Institute of Technology</div>
          </div>
        </div>
        <button
          onClick={handleBack}
          style={{
            background: 'rgba(255,255,255,0.1)',
            border: '1px solid rgba(255,255,255,0.2)',
            color: 'white', padding: '6px 14px',
            borderRadius: 4, cursor: 'pointer',
            fontSize: 13, fontFamily: 'inherit', fontWeight: 500,
          }}
        >
          ← Back to Role Selection
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
        <div className="login-card">
          {/* Role Badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <span style={{ fontSize: 28 }}>{selectedRole?.icon}</span>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
                {selectedRole?.title} Login
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                KI Smart Attendance+ — {selectedRole?.badge}
              </div>
            </div>
          </div>

          {/* Tabs — only show for student who can also register */}
          {selectedRole?.id === 'student' && (
            <div className="tabs" style={{ marginBottom: 20 }}>
              <button
                className={`tab${activeTab === 'login' ? ' active' : ''}`}
                onClick={() => setActiveTab('login')}
              >
                Sign In
              </button>
              <button
                className={`tab${activeTab === 'register' ? ' active' : ''}`}
                onClick={() => setActiveTab('register')}
              >
                New Registration
              </button>
            </div>
          )}

          {/* LOGIN FORM */}
          {activeTab === 'login' && (
            <form onSubmit={handleLoginSubmit}>
              <div className="form-group">
                <label className="form-label">
                  {selectedRole?.id === 'student' ? 'College Email / Register Number / Roll Number' : 'Institutional Email'}
                </label>
                <input
                  type={selectedRole?.id === 'student' ? 'text' : 'email'}
                  className="form-input"
                  placeholder={
                    selectedRole?.id === 'student'
                      ? 'e.g. student@kitech.edu.in or 737624...'
                      : `e.g. ${selectedRole?.id}.aiml@kitech.edu.in`
                  }
                  value={loginId}
                  onChange={e => { setLoginId(e.target.value); setLoginError(''); }}
                  autoComplete="username"
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                  Password
                  <a href="#" style={{ color: 'var(--secondary)', fontSize: 12, textDecoration: 'none', fontWeight: 400 }}>
                    Forgot Password?
                  </a>
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPwd ? 'text' : 'password'}
                    className="form-input"
                    placeholder="Enter your password"
                    value={password}
                    onChange={e => { setPassword(e.target.value); setLoginError(''); }}
                    autoComplete="current-password"
                    style={{ paddingRight: 44 }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd(!showPwd)}
                    style={{
                      position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--text-muted)', fontSize: 16,
                    }}
                  >
                    {showPwd ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>

              {loginError && (
                <div className="alert alert-danger" style={{ marginBottom: 16, fontSize: 13 }}>
                  {loginError}
                </div>
              )}

              <button
                type="submit"
                className="btn btn-primary w-full"
                disabled={loading}
                style={{ height: 42, marginTop: 4 }}
              >
                {loading ? <span className="spinner" /> : `Sign In as ${selectedRole?.title}`}
              </button>
            </form>
          )}

          {/* REGISTER FORM */}
          {activeTab === 'register' && selectedRole?.id === 'student' && (
            <form onSubmit={handleRegisterSubmit}>
              <div className="grid-2" style={{ gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">Roll Number <span className="text-danger">*</span></label>
                  <input
                    className={`form-input${errors.roll_number ? ' border-danger' : ''}`}
                    value={regData.roll_number}
                    onChange={e => handleInputChange('roll_number', e.target.value.toUpperCase())}
                    placeholder="e.g. 24AIM040"
                    maxLength={8}
                  />
                  {errors.roll_number && <div className="form-error">{errors.roll_number}</div>}
                </div>
                <div className="form-group">
                  <label className="form-label">Register Number <span className="text-danger">*</span></label>
                  <input
                    className={`form-input${errors.register_no ? ' border-danger' : ''}`}
                    value={regData.register_no}
                    onChange={e => handleInputChange('register_no', e.target.value.replace(/\D/g, ''))}
                    placeholder="12-digit number"
                    maxLength={12}
                  />
                  {errors.register_no && <div className="form-error">{errors.register_no}</div>}
                </div>
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label className="form-label">Full Name <span className="text-danger">*</span></label>
                  <input
                    className={`form-input${errors.name ? ' border-danger' : ''}`}
                    value={regData.name}
                    onChange={e => handleInputChange('name', e.target.value)}
                    placeholder="As per documents"
                  />
                  {errors.name && <div className="form-error">{errors.name}</div>}
                </div>
                <div className="form-group">
                  <label className="form-label">Date of Birth <span className="text-danger">*</span></label>
                  <input
                    type="date"
                    className={`form-input${errors.date_of_birth ? ' border-danger' : ''}`}
                    value={regData.date_of_birth}
                    onChange={e => handleInputChange('date_of_birth', e.target.value)}
                  />
                  {errors.date_of_birth && <div className="form-error">{errors.date_of_birth}</div>}
                </div>
                <div className="form-group">
                  <label className="form-label">Department</label>
                  <select className="form-input" value={regData.department} onChange={e => handleInputChange('department', e.target.value)}>
                    <option value="CSE(AI&ML)">CSE (AI&ML)</option>
                    <option value="CSE">CSE</option>
                    <option value="ECE">ECE</option>
                    <option value="EEE">EEE</option>
                    <option value="MECH">Mechanical</option>
                    <option value="CIVIL">Civil</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Year</label>
                  <select className="form-input" value={regData.year} onChange={e => handleInputChange('year', e.target.value)}>
                    <option value="I">I Year</option>
                    <option value="II">II Year</option>
                    <option value="III">III Year</option>
                    <option value="IV">IV Year</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Section</label>
                  <input
                    className="form-input"
                    value={regData.section}
                    onChange={e => handleInputChange('section', e.target.value.toUpperCase())}
                    placeholder="e.g. AIML or A"
                  />
                </div>
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label className="form-label">College Email <span className="text-danger">*</span></label>
                  <input
                    type="email"
                    className={`form-input${errors.email ? ' border-danger' : ''}`}
                    value={regData.email}
                    onChange={e => handleInputChange('email', e.target.value)}
                    placeholder="e.g. student@kitech.edu.in"
                  />
                  {errors.email && <div className="form-error">{errors.email}</div>}
                </div>
                <div className="form-group">
                  <label className="form-label">Mobile Number <span className="text-danger">*</span></label>
                  <input
                    className={`form-input${errors.phone ? ' border-danger' : ''}`}
                    value={regData.phone}
                    onChange={e => handleInputChange('phone', e.target.value.replace(/\D/g, ''))}
                    placeholder="10-digit number"
                    maxLength={10}
                  />
                  {errors.phone && <div className="form-error">{errors.phone}</div>}
                </div>
                <div className="form-group">
                  <label className="form-label">Password <span className="text-danger">*</span></label>
                  <input
                    type="password"
                    className={`form-input${errors.password ? ' border-danger' : ''}`}
                    value={regData.password}
                    onChange={e => handleInputChange('password', e.target.value)}
                    placeholder="Min. 8 characters"
                  />
                  {errors.password && <div className="form-error">{errors.password}</div>}
                </div>
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label className="form-label">Confirm Password <span className="text-danger">*</span></label>
                  <input
                    type="password"
                    className={`form-input${errors.confirm_password ? ' border-danger' : ''}`}
                    value={regData.confirm_password}
                    onChange={e => handleInputChange('confirm_password', e.target.value)}
                    placeholder="Re-enter password"
                  />
                  {errors.confirm_password && <div className="form-error">{errors.confirm_password}</div>}
                </div>
              </div>

              <button
                type="submit"
                className="btn btn-primary w-full"
                disabled={loading}
                style={{ height: 42, marginTop: 4 }}
              >
                {loading ? <span className="spinner" /> : 'Create Student Account'}
              </button>

              <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
                Already registered?{' '}
                <button
                  type="button"
                  onClick={() => setActiveTab('login')}
                  style={{ background: 'none', border: 'none', color: 'var(--secondary)', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}
                >
                  Sign in instead
                </button>
              </div>
            </form>
          )}

          <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border-light)', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
            Kangeyam Institute of Technology — KI Smart Attendance+ Portal
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{
        background: 'var(--bg-surface)', borderTop: '1px solid var(--border)',
        padding: '12px 40px', fontSize: 12, color: 'var(--text-muted)',
        textAlign: 'center',
      }}>
        © 2024 Kangeyam Institute of Technology. All rights reserved.
      </div>
    </div>
  );
}
