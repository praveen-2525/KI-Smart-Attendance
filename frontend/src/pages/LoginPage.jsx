import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';
import { API_BASE_URL } from '../services/api';

export default function LoginPage() {
  const { login } = useAuth();
  const [activeTab, setActiveTab] = useState('login'); // 'login' or 'register'
  
  // Login state
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  
  // Register state
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
  const [loginError, setLoginError] = useState('');
  const [loading, setLoading] = useState(false);

  const validateLogin = () => {
    if (!loginId.trim()) {
      setLoginError("Login ID is required. Enter your Roll Number, Register Number or College Email.");
      return false;
    }
    
    if (!password) {
      setLoginError("Password is required.");
      return false;
    }
    
    // Check if it's one of the 3 formats
    const isRoll = /^[0-9]{2}AIM[0-9]{3}$/.test(loginId);
    const isReg = /^[0-9]{12}$/.test(loginId);
    const isEmail = loginId.includes('@');
    
    if (!isRoll && !isReg && !isEmail) {
      setLoginError("Enter a valid Roll Number, 12-digit Register Number or College Email.");
      return false;
    }
    
    setLoginError('');
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateLogin()) return;
    
    setLoading(true);
    setLoginError('');
    try {
      await login(loginId, password);
      toast.success('Login successful!');
    } catch (err) {
      const detail = err.response?.data?.detail;
      if (detail) {
        setLoginError(detail);
      } else {
        setLoginError('Authentication service is currently unavailable. Please try again later.');
      }
    } finally {
      setLoading(false);
    }
  };

  const validateRegister = (field = null) => {
    let errs = { ...errors };
    let isValid = true;
    
    const validateField = (name, value) => {
      switch (name) {
        case 'roll_number':
          if (!value) return "Roll Number is required.";
          if (value.length !== 8) return "Roll Number must contain exactly 8 characters.";
          if (!/^[0-9]{2}AIM[0-9]{3}$/.test(value)) return "Use uppercase AIM. Example: 24AIM040.";
          return "";
        case 'register_no':
          if (!value) return "Register Number is required.";
          if (/[a-zA-Z\s-]/.test(value)) return "Register Number can contain numbers only.";
          if (value.length !== 12 || !/^[0-9]{12}$/.test(value)) return "Register Number must contain exactly 12 digits.";
          return "";
        case 'name':
          if (!value.trim()) return "Full Name is required.";
          if (!/^[a-zA-Z\s]+$/.test(value)) return "Enter a valid full name (letters and spaces only).";
          return "";
        case 'date_of_birth':
          if (!value) return "Enter a valid date of birth.";
          return "";
        case 'email':
          if (!value.trim()) return "College Email is required.";
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "Enter a valid college email address.";
          return "";
        case 'phone':
          if (!value) return "Mobile Number is required.";
          if (/[a-zA-Z\s-]/.test(value)) return "Mobile Number can contain numbers only.";
          if (value.length !== 10 || !/^[0-9]{10}$/.test(value)) return "Mobile Number must contain exactly 10 digits.";
          return "";
        case 'password':
          if (!value) return "Password is required.";
          if (value.length < 8) return "Password must contain at least 8 characters.";
          return "";
        case 'confirm_password':
          if (value !== regData.password) return "Passwords do not match.";
          return "";
        default: return "";
      }
    };

    if (field) {
      errs[field] = validateField(field, regData[field]);
    } else {
      Object.keys(regData).forEach(key => {
        errs[key] = validateField(key, regData[key]);
      });
    }

    setErrors(errs);
    return Object.values(errs).every(x => x === "");
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!validateRegister()) return;
    
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(regData)
      });
      const data = await res.json();
      
      if (!res.ok) {
        // Simple heuristic to attach backend errors to specific fields if possible
        const detail = data.detail || '';
        if (detail.includes('Roll Number')) setErrors(prev => ({...prev, roll_number: detail}));
        else if (detail.includes('Register Number')) setErrors(prev => ({...prev, register_no: detail}));
        else if (detail.includes('Email')) setErrors(prev => ({...prev, email: detail}));
        else toast.error(detail || 'Registration failed');
      } else {
        toast.success('Registration successful!');
        setActiveTab('login');
        setLoginId(regData.roll_number || regData.register_no);
        setPassword('');
      }
    } catch (err) {
      toast.error('Authentication service is currently unavailable. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field, value) => {
    setRegData(prev => ({ ...prev, [field]: value }));
    // Clear error for that field when typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  return (
    <div className="login-page">
      <div className="login-bg" />

      {/* Left panel - Branding */}
      <div className="login-left">
        <div style={{ textAlign: 'center', maxWidth: 520 }}>
          <div style={{
            width: 80, height: 80, borderRadius: 20,
            background: 'var(--gradient-brand)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 24px', fontSize: 36,
            boxShadow: 'var(--shadow-glow)'
          }}>
            🎓
          </div>
          <div style={{ fontSize: 42, fontWeight: 800, lineHeight: 1.2, marginBottom: 12 }}>
            <span style={{ background: 'var(--gradient-brand)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              KI Smart
            </span>
            <br />
            <span style={{ color: '#e2e8f0' }}>Attendance+</span>
          </div>
          <p style={{ fontSize: 18, color: 'var(--gray-500)', marginBottom: 40 }}>
            Smart Attendance, Smarter Student Management
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, textAlign: 'left' }}>
            {[
              { icon: '📊', title: 'Smart Attendance Planner', desc: 'Calculate classes needed to reach 75%' },
              { icon: '🎯', title: 'OD & Leave Management', desc: 'Full workflow with proof verification' },
              { icon: '🔔', title: 'Real-time Notifications', desc: 'Instant alerts for all stakeholders' },
              { icon: '🔒', title: 'Role-Based Access', desc: 'Student, Faculty, Advisor, HOD, DEO' },
            ].map((f, i) => (
              <div key={i} style={{
                display: 'flex', gap: 12, alignItems: 'flex-start',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 12, padding: '12px 16px'
              }}>
                <span style={{ fontSize: 24 }}>{f.icon}</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0' }}>{f.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel - Login form */}
      <div className="login-right">
        <div className="login-card" style={{ width: '100%', maxWidth: '460px', padding: '32px 40px' }}>
          <h1 className="login-logo">KI Smart Attendance+</h1>
          <p className="login-tagline">Access your account</p>

          <div style={{ display: 'flex', gap: 10, marginBottom: 24, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
            <button 
              onClick={() => { setActiveTab('login'); setLoginError(''); }}
              style={{
                background: 'none', border: 'none', padding: '8px 16px', cursor: 'pointer',
                color: activeTab === 'login' ? 'var(--primary-400)' : 'var(--gray-500)',
                borderBottom: activeTab === 'login' ? '2px solid var(--primary-400)' : '2px solid transparent',
                fontWeight: activeTab === 'login' ? 700 : 500, fontSize: 14
              }}
            >
              LOGIN
            </button>
            <button 
              onClick={() => setActiveTab('register')}
              style={{
                background: 'none', border: 'none', padding: '8px 16px', cursor: 'pointer',
                color: activeTab === 'register' ? 'var(--primary-400)' : 'var(--gray-500)',
                borderBottom: activeTab === 'register' ? '2px solid var(--primary-400)' : '2px solid transparent',
                fontWeight: activeTab === 'register' ? 700 : 500, fontSize: 14
              }}
            >
              REGISTER
            </button>
          </div>

          {activeTab === 'login' ? (
            <form onSubmit={handleSubmit}>
              <div className="form-group mb-4">
                <label className="form-label">Login ID</label>
                <input
                  type="text"
                  className={`form-input ${loginError && !password ? 'error-input' : ''}`}
                  placeholder="Enter Roll Number, Register Number or College Email"
                  value={loginId}
                  onChange={(e) => { setLoginId(e.target.value); setLoginError(''); }}
                  autoComplete="username"
                />
              </div>

              <div className="form-group mb-2">
                <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                  Password
                  <a href="#" style={{ color: 'var(--primary-400)', fontSize: 12, textDecoration: 'none' }}>Forgot Password?</a>
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPwd ? 'text' : 'password'}
                    className={`form-input ${loginError && password ? 'error-input' : ''}`}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setLoginError(''); }}
                    autoComplete="current-password"
                    style={{ paddingRight: 44 }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd(!showPwd)}
                    style={{
                      position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--gray-500)', fontSize: 16
                    }}
                  >
                    {showPwd ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>
              
              {loginError && (
                <div style={{ color: '#ef4444', fontSize: 12, marginBottom: 16 }}>
                  {loginError}
                </div>
              )}

              <button
                type="submit"
                className="btn btn-primary w-full"
                disabled={loading}
                style={{ marginTop: 8, height: 46 }}
              >
                {loading ? <span className="spinner" /> : '→'}
                {' '}{loading ? 'Signing in...' : 'Sign In'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegister}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group mb-3">
                  <label className="form-label">Roll Number</label>
                  <input type="text" className={`form-input ${errors.roll_number ? 'error-input' : ''}`} placeholder="e.g. 24AIM040" value={regData.roll_number} onChange={e => handleInputChange('roll_number', e.target.value.trim())} onBlur={() => validateRegister('roll_number')} />
                  {errors.roll_number && <div style={{ color: '#ef4444', fontSize: 11, marginTop: 4 }}>{errors.roll_number}</div>}
                </div>
                <div className="form-group mb-3">
                  <label className="form-label">Register No.</label>
                  <input type="text" className={`form-input ${errors.register_no ? 'error-input' : ''}`} placeholder="12 digits" value={regData.register_no} onChange={e => handleInputChange('register_no', e.target.value.trim())} onBlur={() => validateRegister('register_no')} />
                  {errors.register_no && <div style={{ color: '#ef4444', fontSize: 11, marginTop: 4 }}>{errors.register_no}</div>}
                </div>
              </div>

              <div className="form-group mb-3">
                <label className="form-label">Full Name</label>
                <input type="text" className={`form-input ${errors.name ? 'error-input' : ''}`} placeholder="e.g. Praveen S" value={regData.name} onChange={e => handleInputChange('name', e.target.value)} onBlur={() => validateRegister('name')} />
                {errors.name && <div style={{ color: '#ef4444', fontSize: 11, marginTop: 4 }}>{errors.name}</div>}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group mb-3">
                  <label className="form-label">DOB</label>
                  <input type="date" className={`form-input ${errors.date_of_birth ? 'error-input' : ''}`} value={regData.date_of_birth} onChange={e => handleInputChange('date_of_birth', e.target.value)} onBlur={() => validateRegister('date_of_birth')} />
                  {errors.date_of_birth && <div style={{ color: '#ef4444', fontSize: 11, marginTop: 4 }}>{errors.date_of_birth}</div>}
                </div>
                <div className="form-group mb-3">
                  <label className="form-label">Department</label>
                  <select className="form-input" value={regData.department} onChange={e => handleInputChange('department', e.target.value)}>
                    <option>CSE(AI&ML)</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group mb-3">
                  <label className="form-label">Year</label>
                  <select className="form-input" value={regData.year} onChange={e => handleInputChange('year', e.target.value)}>
                    <option>III</option>
                  </select>
                </div>
                <div className="form-group mb-3">
                  <label className="form-label">Section</label>
                  <select className="form-input" value={regData.section} onChange={e => handleInputChange('section', e.target.value)}>
                    <option>AIML</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group mb-3">
                  <label className="form-label">College Email</label>
                  <input type="email" className={`form-input ${errors.email ? 'error-input' : ''}`} placeholder="student@college.edu" value={regData.email} onChange={e => handleInputChange('email', e.target.value.trim())} onBlur={() => validateRegister('email')} />
                  {errors.email && <div style={{ color: '#ef4444', fontSize: 11, marginTop: 4 }}>{errors.email}</div>}
                </div>
                <div className="form-group mb-3">
                  <label className="form-label">Mobile</label>
                  <input type="tel" className={`form-input ${errors.phone ? 'error-input' : ''}`} placeholder="10 digits" value={regData.phone} onChange={e => handleInputChange('phone', e.target.value.trim())} onBlur={() => validateRegister('phone')} />
                  {errors.phone && <div style={{ color: '#ef4444', fontSize: 11, marginTop: 4 }}>{errors.phone}</div>}
                </div>
              </div>

              <div className="form-group mb-3">
                <label className="form-label">Create Password</label>
                <input type="password" minLength="6" className={`form-input ${errors.password ? 'error-input' : ''}`} value={regData.password} onChange={e => handleInputChange('password', e.target.value)} onBlur={() => validateRegister('password')} />
                {errors.password && <div style={{ color: '#ef4444', fontSize: 11, marginTop: 4 }}>{errors.password}</div>}
              </div>

              <div className="form-group mb-4">
                <label className="form-label">Confirm Password</label>
                <input type="password" minLength="6" className={`form-input ${errors.confirm_password ? 'error-input' : ''}`} value={regData.confirm_password} onChange={e => handleInputChange('confirm_password', e.target.value)} onBlur={() => validateRegister('confirm_password')} />
                {errors.confirm_password && <div style={{ color: '#ef4444', fontSize: 11, marginTop: 4 }}>{errors.confirm_password}</div>}
              </div>

              <button type="submit" className="btn btn-primary w-full" disabled={loading} style={{ height: 46 }}>
                {loading ? <span className="spinner" /> : 'Create Account'}
              </button>
            </form>
          )}

          <div style={{ marginTop: 24, padding: '14px', background: 'rgba(99,102,241,0.08)', borderRadius: 10, border: '1px solid rgba(99,102,241,0.2)' }}>
            <div style={{ fontSize: 11, color: 'var(--gray-500)', lineHeight: 1.6 }}>
              <strong style={{ color: 'var(--primary-400)' }}>Secure System:</strong> This application is completely independent. Authentic accounts are required.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
