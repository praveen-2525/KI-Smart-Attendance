import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getRoleDashboardPath } from '../utils/roleRedirect';
import toast from 'react-hot-toast';
import { API_BASE_URL } from '../services/api';

const ROLES = [
  {
    id: 'student',
    title: 'Student',
    icon: '👨‍🎓',
    desc: 'Access attendance, OD, leave and personal requests',
    badge: 'Student Portal'
  },
  {
    id: 'hod',
    title: 'HOD',
    icon: '👨‍💼',
    desc: 'Manage department students, attendance and approvals',
    badge: 'Department Head'
  },
  {
    id: 'advisor',
    title: 'Advisor',
    icon: '👨‍🏫',
    desc: 'Manage assigned students and requests',
    badge: 'Class Advisor'
  },
  {
    id: 'faculty',
    title: 'Faculty',
    icon: '👩‍🏫',
    desc: 'Manage classes, attendance and approved requests',
    badge: 'Faculty Member'
  },
  {
    id: 'staff',
    title: 'Staff',
    icon: '👨‍💻',
    desc: 'View approved OD and leave information',
    badge: 'Office Staff'
  },
  {
    id: 'deo',
    title: 'DEO',
    icon: '🧑‍💼',
    desc: 'Manage students, attendance corrections and records',
    badge: 'Data Entry Operator'
  }
];

export default function AuthFlowPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  
  // Step 1: Landing, Step 2: Role Selection, Step 3: Login
  const [step, setStep] = useState(1);
  const [selectedRole, setSelectedRole] = useState(null);
  
  // Login State
  const [activeTab, setActiveTab] = useState('login'); // 'login' or 'register'
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [loading, setLoading] = useState(false);

  // Register state (for Student)
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
    setStep(3);
  };

  const handleBack = () => {
    if (step === 3) {
      setStep(2);
    } else if (step === 2) {
      setStep(1);
    }
  };

  const validateLogin = () => {
    if (!loginId.trim()) {
      setLoginError("Login ID is required. Enter your ID or College Email.");
      return false;
    }
    if (!password) {
      setLoginError("Password is required.");
      return false;
    }
    // For non-student roles, only email is accepted
    if (selectedRole && selectedRole.id !== 'student') {
      if (!loginId.includes('@')) {
        setLoginError("Please enter a valid institutional email address.");
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
      const dashboardPath = getRoleDashboardPath(user.role);
      navigate(dashboardPath, { replace: true });
    } catch (err) {
      let detail = err.response?.data?.detail;
      if (!detail) {
        if (err.message === 'Network Error' || !err.response) {
          detail = "Unable to connect to the server. Please try again.";
        } else {
          detail = "Invalid email or password.";
        }
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
          if (!value) return "Roll Number is required.";
          if (value.length !== 8) return "Roll Number must contain exactly 8 characters.";
          if (!/^[0-9]{2}AIM[0-9]{3}$/.test(value)) return "Use uppercase AIM. Example: 24AIM040.";
          return "";
        case 'register_no':
          if (!value) return "Register Number is required.";
          if (/[a-zA-Z\s-]/.test(value)) return "Register Number can contain numbers only.";
          if (value.length !== 12 || !/^[0-9]{12}$/.test(value)) return "Register Number must contain 12 digits.";
          return "";
        case 'name':
          if (!value.trim()) return "Full Name is required.";
          return "";
        case 'date_of_birth':
          if (!value) return "Date of Birth is required.";
          return "";
        case 'email':
          if (!value.trim()) return "College Email is required.";
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "Enter a valid email.";
          return "";
        case 'phone':
          if (!value) return "Mobile Number is required.";
          if (value.length !== 10) return "Mobile Number must contain 10 digits.";
          return "";
        case 'password':
          if (!value) return "Password is required.";
          if (value.length < 8) return "Must be at least 8 characters.";
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

  const handleRegisterSubmit = async (e) => {
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

  return (
    <div className="login-page" style={{ minHeight: '100vh', position: 'relative' }}>
      <div className="login-bg" />

      {/* Top Header with Back Navigation & Step Indicator */}
      {step > 1 && (
        <div style={{
          position: 'absolute', top: 20, left: 24, right: 24,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          zIndex: 10
        }}>
          <button
            onClick={handleBack}
            style={{
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.15)',
              color: '#e2e8f0',
              padding: '8px 16px',
              borderRadius: '20px',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 14,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              backdropFilter: 'blur(10px)',
              transition: 'var(--transition)'
            }}
          >
            ← Back
          </button>

          {/* Step Indicator */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'rgba(15,23,42,0.8)',
            border: '1px solid rgba(255,255,255,0.1)',
            padding: '6px 16px',
            borderRadius: '20px',
            fontSize: 13,
            color: 'var(--gray-400)',
            backdropFilter: 'blur(10px)'
          }}>
            <span style={{ color: step >= 1 ? 'var(--primary-400)' : 'inherit', fontWeight: step === 1 ? 700 : 400 }}>
              {step > 1 ? '① ✓' : '① Welcome'}
            </span>
            <span>→</span>
            <span style={{ color: step >= 2 ? 'var(--primary-400)' : 'inherit', fontWeight: step === 2 ? 700 : 400 }}>
              {step > 2 ? '② ✓' : '② Select Role'}
            </span>
            <span>→</span>
            <span style={{ color: step >= 3 ? 'var(--primary-400)' : 'inherit', fontWeight: step === 3 ? 700 : 400 }}>
              ③ Login
            </span>
            <span>→</span>
            <span style={{ color: step >= 4 ? 'var(--primary-400)' : 'inherit' }}>
              ④ Dashboard
            </span>
          </div>
        </div>
      )}

      {/* STEP 1: LANDING PAGE */}
      {step === 1 && (
        <div style={{
          minHeight: '100vh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', padding: '40px 20px',
          maxWidth: 900, margin: '0 auto', textAlign: 'center', zIndex: 2, position: 'relative'
        }}>
          <div style={{
            width: 90, height: 90, borderRadius: 24,
            background: 'var(--gradient-brand)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 44, margin: '0 auto 24px',
            boxShadow: 'var(--shadow-glow)'
          }}>🎓</div>

          <h1 style={{ fontSize: 48, fontWeight: 800, lineHeight: 1.2, marginBottom: 12 }}>
            <span style={{ background: 'var(--gradient-brand)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              KI Smart
            </span>
            <br />
            <span style={{ color: '#e2e8f0' }}>Attendance+</span>
          </h1>
          <p style={{ fontSize: 20, color: 'var(--gray-400)', marginBottom: 48, maxWidth: 600 }}>
            Smart Attendance, Smarter Student Management
          </p>

          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 20, width: '100%', marginBottom: 48, textAlign: 'left'
          }}>
            {[
              { icon: '📊', title: 'Smart Attendance Planner', desc: 'Calculate classes needed to reach 75%' },
              { icon: '🎯', title: 'OD & Leave Management', desc: 'Full workflow with proof verification' },
              { icon: '🔔', title: 'Real-time Notifications', desc: 'Instant alerts for all stakeholders' },
              { icon: '🔐', title: 'Role-Based Access', desc: 'Student, Faculty, Advisor, HOD, DEO, Staff' },
            ].map((f, i) => (
              <div key={i} style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 16, padding: '20px',
                backdropFilter: 'blur(10px)',
                transition: 'transform 0.2s ease',
              }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>{f.icon}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0', marginBottom: 4 }}>{f.title}</div>
                <div style={{ fontSize: 13, color: 'var(--gray-500)', lineHeight: 1.5 }}>{f.desc}</div>
              </div>
            ))}
          </div>

          <button
            onClick={() => setStep(2)}
            style={{
              background: 'var(--gradient-brand)',
              color: 'white', border: 'none',
              padding: '16px 48px', borderRadius: 30,
              fontSize: 18, fontWeight: 700,
              cursor: 'pointer', boxShadow: 'var(--shadow-glow)',
              display: 'flex', alignItems: 'center', gap: 12,
              transition: 'transform 0.2s ease'
            }}
          >
            NEXT →
          </button>
        </div>
      )}

      {/* STEP 2: ROLE SELECTION PAGE */}
      {step === 2 && (
        <div style={{
          minHeight: '100vh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', padding: '80px 20px 40px',
          maxWidth: 1000, margin: '0 auto', textAlign: 'center', zIndex: 2, position: 'relative'
        }}>
          <h1 style={{ fontSize: 36, fontWeight: 800, color: '#e2e8f0', marginBottom: 8 }}>
            Welcome to KI Smart Attendance+
          </h1>
          <p style={{ fontSize: 16, color: 'var(--gray-400)', marginBottom: 40 }}>
            Select your role to continue
          </p>

          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 20, width: '100%'
          }}>
            {ROLES.map((r) => (
              <div
                key={r.id}
                onClick={() => handleRoleSelect(r)}
                style={{
                  background: 'rgba(30, 41, 59, 0.7)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: 20, padding: 24,
                  textAlign: 'left', cursor: 'pointer',
                  backdropFilter: 'blur(12px)',
                  transition: 'all 0.2s ease',
                  position: 'relative',
                  display: 'flex', flexDirection: 'column', justifyContent: 'space-between'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.borderColor = 'var(--primary-400)';
                  e.currentTarget.style.transform = 'translateY(-4px)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <span style={{ fontSize: 36 }}>{r.icon}</span>
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: '4px 10px',
                      borderRadius: 12, background: 'rgba(99,102,241,0.15)',
                      color: 'var(--primary-400)', border: '1px solid rgba(99,102,241,0.3)'
                    }}>
                      {r.badge}
                    </span>
                  </div>
                  <h3 style={{ fontSize: 20, fontWeight: 700, color: '#e2e8f0', marginBottom: 8 }}>
                    Login as {r.title}
                  </h3>
                  <p style={{ fontSize: 13, color: 'var(--gray-400)', lineHeight: 1.5, marginBottom: 20 }}>
                    {r.desc}
                  </p>
                </div>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  color: 'var(--primary-400)', fontWeight: 600, fontSize: 14
                }}>
                  Proceed to Login →
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* STEP 3: ROLE LOGIN PAGE */}
      {step === 3 && selectedRole && (
        <div className="login-right" style={{
          minHeight: '100vh', display: 'flex', alignItems: 'center',
          justifyContent: 'center', padding: '80px 20px 40px', width: '100%'
        }}>
          <div className="login-card" style={{ width: '100%', maxWidth: '460px', padding: '36px 40px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <span style={{ fontSize: 32 }}>{selectedRole.icon}</span>
              <div>
                <h1 className="login-logo" style={{ fontSize: 24, margin: 0 }}>
                  {selectedRole.title} Login
                </h1>
                <p style={{ fontSize: 13, color: 'var(--gray-500)', margin: 0 }}>
                  Sign in to your {selectedRole.title.toLowerCase()} account
                </p>
              </div>
            </div>

            <form onSubmit={handleLoginSubmit}>
              <div className="form-group mb-4">
                <label className="form-label">
                  {selectedRole.id === 'student' ? 'College Email / Register Number' : 'Email ID'}
                </label>
                <input
                  type={selectedRole.id === 'student' ? 'text' : 'email'}
                  className="form-input"
                  placeholder={selectedRole.id === 'student' ? 'e.g. student@kitech.edu.in or 7376241AI101' : `e.g. ${selectedRole.id}.aiml@kitech.edu.in`}
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
                      className="form-input"
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
                  <div style={{ color: '#ef4444', fontSize: 13, margin: '12px 0' }}>
                    {loginError}
                  </div>
                )}

                <button
                  type="submit"
                  className="btn btn-primary w-full"
                  disabled={loading}
                  style={{ marginTop: 16, height: 46 }}
                >
                  {loading ? <span className="spinner" /> : 'Sign In as ' + selectedRole.title}
                </button>
              </form>
          </div>
        </div>
      )}
    </div>
  );
}
