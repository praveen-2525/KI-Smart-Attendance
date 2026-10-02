import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const { login } = useAuth();
  const [activeTab, setActiveTab] = useState('login'); // 'login' or 'register'
  
  // Login state
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  
  // Register state
  const [regData, setRegData] = useState({
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
  const [regStep, setRegStep] = useState(1);
  
  const [loading, setLoading] = useState(false);

  const demoAccounts = [
    { label: 'Student', id: 'student001', pwd: 'STU@12345', color: '#6366f1' },
    { label: 'Faculty', id: 'fac002', pwd: 'FAC@12345', color: '#10b981' },
    { label: 'Advisor', id: 'adv001', pwd: 'ADV@12345', color: '#f59e0b' },
    { label: 'HOD', id: 'hod001', pwd: 'HOD@12345', color: '#8b5cf6' },
    { label: 'DEO', id: 'deo001', pwd: 'DEO@12345', color: '#ef4444' },
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(loginId, password);
      toast.success('Login successful!');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyStudent = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('http://localhost:8000/api/v1/auth/verify-student', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ register_no: regData.register_no })
      });
      const data = await res.json();
      
      if (!res.ok) {
        toast.error(data.detail || 'Verification failed');
      } else {
        setRegData({
          ...regData,
          name: data.name,
          date_of_birth: data.date_of_birth,
          department: data.department,
          year: data.year,
          section: data.section
        });
        setRegStep(2);
        toast.success("Student verified successfully");
      }
    } catch (err) {
      toast.error('Verification error');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (regData.password !== regData.confirm_password) {
      toast.error("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('http://localhost:8000/api/v1/auth/register', {
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
        setRegStep(1);
        setLoginId(regData.register_no);
        setPassword('');
      }
    } catch (err) {
      toast.error('An error occurred during registration');
    } finally {
      setLoading(false);
    }
  };

  const resetRegister = () => {
    setActiveTab('register');
    setRegStep(1);
    setRegData({...regData, register_no: ''});
  };

  const fillDemo = (acc) => {
    setActiveTab('login');
    setLoginId(acc.id);
    setPassword(acc.pwd);
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

          {/* Feature highlights */}
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
        <div className="login-card" style={{ width: '100%', maxWidth: '420px', padding: '32px 40px' }}>
          <h1 className="login-logo">KI Smart Attendance+</h1>
          <p className="login-tagline">Access your account</p>

          <div style={{ display: 'flex', gap: 10, marginBottom: 24, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
            <button 
              onClick={() => setActiveTab('login')}
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
              onClick={() => { setActiveTab('register'); setRegStep(1); }}
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
              <div className="form-group">
                <label className="form-label">Register Number / Login ID</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Enter your login ID"
                  value={loginId}
                  onChange={(e) => setLoginId(e.target.value)}
                  required
                  autoComplete="username"
                />
              </div>

              <div className="form-group">
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
                    onChange={(e) => setPassword(e.target.value)}
                    required
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
          ) : regStep === 1 ? (
            <form onSubmit={handleVerifyStudent}>
              <div className="form-group mb-4">
                <label className="form-label">Register Number</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="e.g. 24AIM040"
                  required 
                  value={regData.register_no} 
                  onChange={e => setRegData({...regData, register_no: e.target.value.trim()})} 
                />
                <div style={{fontSize: 11, color: 'var(--gray-500)', marginTop: 8}}>
                  We will verify this number against authorized college records.
                </div>
              </div>
              <button type="submit" className="btn btn-primary w-full" disabled={loading} style={{ height: 46 }}>
                {loading ? <span className="spinner" /> : 'Verify Student'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegister}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ fontSize: 12, color: 'var(--gray-400)' }}>Authorized Details</span>
                <a href="#" onClick={(e) => { e.preventDefault(); resetRegister(); }} style={{ fontSize: 12, color: 'var(--primary-400)', textDecoration: 'none' }}>Change Register No</a>
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group mb-3">
                  <label className="form-label">Register No.</label>
                  <input type="text" className="form-input" disabled value={regData.register_no} style={{opacity: 0.7}} />
                </div>
                <div className="form-group mb-3">
                  <label className="form-label">Full Name</label>
                  <input type="text" className="form-input" disabled value={regData.name} style={{opacity: 0.7}} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group mb-3">
                  <label className="form-label">DOB</label>
                  <input type="text" className="form-input" disabled value={regData.date_of_birth} style={{opacity: 0.7}} />
                </div>
                <div className="form-group mb-3">
                  <label className="form-label">Department</label>
                  <input type="text" className="form-input" disabled value={regData.department} style={{opacity: 0.7}} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group mb-3">
                  <label className="form-label">Year</label>
                  <input type="text" className="form-input" disabled value={regData.year} style={{opacity: 0.7}} />
                </div>
                <div className="form-group mb-3">
                  <label className="form-label">Section</label>
                  <input type="text" className="form-input" disabled value={regData.section} style={{opacity: 0.7}} />
                </div>
              </div>
              
              <div style={{ margin: '16px 0', borderBottom: '1px solid rgba(255,255,255,0.1)' }}></div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group mb-3">
                  <label className="form-label">College Email</label>
                  <input type="email" className="form-input" required value={regData.email} onChange={e => setRegData({...regData, email: e.target.value})} />
                </div>
                <div className="form-group mb-3">
                  <label className="form-label">Mobile</label>
                  <input type="tel" className="form-input" required value={regData.phone} onChange={e => setRegData({...regData, phone: e.target.value})} />
                </div>
              </div>

              <div className="form-group mb-3">
                <label className="form-label">Create Password</label>
                <input type="password" minLength="6" className="form-input" required value={regData.password} onChange={e => setRegData({...regData, password: e.target.value})} />
              </div>

              <div className="form-group mb-4">
                <label className="form-label">Confirm Password</label>
                <input type="password" minLength="6" className="form-input" required value={regData.confirm_password} onChange={e => setRegData({...regData, confirm_password: e.target.value})} />
              </div>

              <button type="submit" className="btn btn-primary w-full" disabled={loading} style={{ height: 46 }}>
                {loading ? <span className="spinner" /> : 'Create Account'}
              </button>
            </form>
          )}

          {/* Demo accounts */}
          <div style={{ marginTop: 28 }}>
            <div style={{
              fontSize: 12, color: 'var(--gray-600)', textAlign: 'center',
              marginBottom: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1
            }}>
              Demo Accounts
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {demoAccounts.map((acc) => (
                <button
                  key={acc.id}
                  type="button"
                  onClick={() => fillDemo(acc)}
                  style={{
                    background: 'var(--surface-dark-3)',
                    border: `1px solid ${acc.color}33`,
                    borderRadius: 8,
                    padding: '8px 4px',
                    cursor: 'pointer',
                    color: acc.color,
                    fontSize: 12,
                    fontWeight: 600,
                    transition: 'var(--transition)',
                    fontFamily: 'var(--font-primary)'
                  }}
                  onMouseOver={e => e.currentTarget.style.background = `${acc.color}15`}
                  onMouseOut={e => e.currentTarget.style.background = 'var(--surface-dark-3)'}
                >
                  {acc.label}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 11, color: 'var(--gray-700)', textAlign: 'center', marginTop: 8 }}>
              Click to fill credentials automatically
            </div>
          </div>

          <div style={{ marginTop: 24, padding: '14px', background: 'rgba(99,102,241,0.08)', borderRadius: 10, border: '1px solid rgba(99,102,241,0.2)' }}>
            <div style={{ fontSize: 11, color: 'var(--gray-500)', lineHeight: 1.6 }}>
              <strong style={{ color: 'var(--primary-400)' }}>Security Notice:</strong> This system works alongside your existing ERP. No unauthorized ERP access is performed. All actions are logged.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
