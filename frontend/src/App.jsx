import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';

// Layout components
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';

// Pages
import LoginPage from './pages/LoginPage';
import StudentDashboard from './pages/StudentDashboard';
import AttendancePage from './pages/AttendancePage';
import PlannerPage from './pages/PlannerPage';
import ODPage from './pages/ODPage';
import LeavePage from './pages/LeavePage';
import { LateArrivalPage, CorrectionPage } from './pages/RequestPages';
import { HODDashboard, FacultyDashboard, DEODashboard } from './pages/RoleDashboards';
import { ReportsPage, AuditPage, ERPPage, SettingsPage } from './pages/AdminPages';
import ChangePasswordPage from './pages/ChangePasswordPage';
import StudentImportPage from './pages/StudentImportPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 2 * 60 * 1000,  // 2 mins
      refetchOnWindowFocus: false,
    },
  },
});

const PAGE_TITLES = {
  '/dashboard': 'Dashboard',
  '/attendance': 'My Attendance',
  '/planner': 'Smart Planner',
  '/od': 'OD Requests',
  '/leave': 'Leave Requests',
  '/late': 'Late Arrival',
  '/correction': 'Attendance Correction',
  '/notifications': 'Notifications',
  '/timetable': 'Timetable',
  '/reports': 'Reports',
  '/students': 'Students',
  '/faculty': 'Faculty',
  '/classes': 'Classes & Sections',
  '/settings': 'Settings',
  '/audit': 'Audit Log',
  '/erp': 'ERP Integration',
};

function AppLayout() {
  const { user } = useAuth();
  const path = window.location.pathname;
  const title = PAGE_TITLES[path] || 'KI Smart Attendance+';

  return (
    <div className="app-layout">
      <Sidebar />
      <div className="main-content">
        <TopBar title={title} />
        <div className="page-content" style={{ padding: 0 }}>
          <Routes>
            <Route path="/dashboard" element={<DashboardByRole />} />
            <Route path="/attendance" element={<AttendancePage />} />
            <Route path="/planner" element={<PlannerPage />} />
            <Route path="/od" element={<ODPage />} />
            <Route path="/leave" element={<LeavePage />} />
            <Route path="/late" element={<LateArrivalPage />} />
            <Route path="/correction" element={<CorrectionPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/audit" element={<AuditPage />} />
            <Route path="/erp" element={<ERPPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/import-students" element={<StudentImportPage />} />
            <Route path="/change-password" element={<ChangePasswordPage />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}

function DashboardByRole() {
  const { user } = useAuth();
  switch (user?.role) {
    case 'student': return <StudentDashboard />;
    case 'faculty': return <FacultyDashboard />;
    case 'advisor': return <HODDashboard />;
    case 'hod': return <HODDashboard />;
    case 'deo': return <DEODashboard />;
    default: return <StudentDashboard />;
  }
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const path = window.location.pathname;

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--surface-dark)', flexDirection: 'column', gap: 16
      }}>
        <div style={{
          width: 60, height: 60, borderRadius: 15,
          background: 'var(--gradient-brand)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 28, boxShadow: 'var(--shadow-glow)'
        }}>🎓</div>
        <div className="spinner" style={{ width: 30, height: 30, borderWidth: 3 }} />
        <div style={{ color: 'var(--gray-500)', fontSize: 14 }}>Loading KI Smart Attendance+...</div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  
  if (user.is_first_login && path !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }
  
  return children;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginRedirect />} />
            <Route path="/*" element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            } />
          </Routes>
          <Toaster
            position="top-right"
            toastOptions={{
              style: {
                background: 'var(--surface-dark-2)',
                color: '#e2e8f0',
                border: '1px solid var(--border-dark)',
                borderRadius: '12px',
                fontSize: '14px',
                boxShadow: 'var(--shadow-lg)',
              },
              success: { iconTheme: { primary: '#10b981', secondary: 'white' } },
              error: { iconTheme: { primary: '#ef4444', secondary: 'white' } },
            }}
          />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

function LoginRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/dashboard" replace />;
  return <LoginPage />;
}

export default App;
