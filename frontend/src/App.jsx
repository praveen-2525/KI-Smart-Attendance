import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { getRoleDashboardPath } from './utils/roleRedirect';

// Layout components
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';

// Pages
import AuthFlowPage from './pages/AuthFlowPage';
import ProfilePage from './pages/ProfilePage';
import StudentDashboard from './pages/StudentDashboard';
import AttendancePage from './pages/AttendancePage';
import PlannerPage from './pages/PlannerPage';
import ODPage from './pages/ODPage';
import LeavePage from './pages/LeavePage';
import { LateArrivalPage, CorrectionPage } from './pages/RequestPages';
import { HODDashboard, FacultyDashboard, DEODashboard, AdvisorDashboard } from './pages/RoleDashboards';
import { ReportsPage, AuditPage, ERPPage, SettingsPage } from './pages/AdminPages';
import ChangePasswordPage from './pages/ChangePasswordPage';
import StudentImportPage from './pages/StudentImportPage';
import { StudentsListPage, FacultyListPage, NotificationsPage, TimetablePage, ClassesPage, StaffDashboard } from './pages/StaffPages';
import ApprovedODLeavePage, { StudentApprovedODLeave } from './pages/ApprovedODLeavePage';

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
  '/hod/dashboard': 'HOD Dashboard',
  '/advisor/dashboard': 'Advisor Dashboard',
  '/faculty/dashboard': 'Faculty Dashboard',
  '/staff/dashboard': 'Staff Dashboard',
  '/deo/dashboard': 'DEO Dashboard',
  '/student/dashboard': 'Student Dashboard',
  '/profile': 'User Profile',
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
  '/approved-od-leave': 'Approved OD & Leave',
  '/my-requests': 'My Requests',
};

function AppLayout() {
  const { user } = useAuth();
  const location = useLocation();
  const title = PAGE_TITLES[location.pathname] || 'KI Smart Attendance+';

  return (
    <div className="app-layout">
      <Sidebar />
      <div className="main-content">
        <TopBar title={title} />
        <div className="page-content" style={{ padding: 0 }}>
          <Routes>
            <Route path="/dashboard" element={<Navigate to={getRoleDashboardPath(user?.role)} replace />} />
            <Route path="/hod/dashboard" element={
              <ProtectedRoute allowedRoles={['hod']}>
                <HODDashboard />
              </ProtectedRoute>
            } />
            <Route path="/advisor/dashboard" element={
              <ProtectedRoute allowedRoles={['advisor']}>
                <AdvisorDashboard />
              </ProtectedRoute>
            } />
            <Route path="/faculty/dashboard" element={
              <ProtectedRoute allowedRoles={['faculty']}>
                <FacultyDashboard />
              </ProtectedRoute>
            } />
            <Route path="/staff/dashboard" element={
              <ProtectedRoute allowedRoles={['staff']}>
                <StaffDashboard />
              </ProtectedRoute>
            } />
            <Route path="/deo/dashboard" element={
              <ProtectedRoute allowedRoles={['deo']}>
                <DEODashboard />
              </ProtectedRoute>
            } />
            <Route path="/student/dashboard" element={
              <ProtectedRoute allowedRoles={['student']}>
                <StudentDashboard />
              </ProtectedRoute>
            } />
            
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/attendance" element={<AttendancePage />} />
            <Route path="/planner" element={<PlannerPage />} />
            <Route path="/od" element={
              ['faculty', 'staff'].includes(user?.role) ? <Navigate to="/approved-od-leave" replace /> : <ODPage />
            } />
            <Route path="/leave" element={
              ['faculty', 'staff'].includes(user?.role) ? <Navigate to="/approved-od-leave" replace /> : <LeavePage />
            } />
            <Route path="/late" element={<LateArrivalPage />} />
            <Route path="/correction" element={<CorrectionPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/audit" element={<AuditPage />} />
            <Route path="/erp" element={<ERPPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/import-students" element={<StudentImportPage />} />
            <Route path="/change-password" element={<ChangePasswordPage />} />
            <Route path="/students" element={<StudentsListPage />} />
            <Route path="/faculty" element={<FacultyListPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/timetable" element={<TimetablePage />} />
            <Route path="/classes" element={<ClassesPage />} />
            <Route path="/approved-od-leave" element={
              user?.role === 'student'
                ? <StudentApprovedODLeave />
                : <ProtectedRoute allowedRoles={['advisor','hod','faculty','staff','deo']}><ApprovedODLeavePage /></ProtectedRoute>
            } />
            <Route path="/my-requests" element={
              <ProtectedRoute allowedRoles={['student']}><ODPage /></ProtectedRoute>
            } />
            <Route path="*" element={<Navigate to={getRoleDashboardPath(user?.role)} replace />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}

function ProtectedRoute({ children, allowedRoles }) {
  const { user, loading } = useAuth();
  const location = useLocation();

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
  
  if (user.is_first_login && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }
  
  if (allowedRoles && allowedRoles.length > 0) {
    const userRole = (user?.role || '').toLowerCase();
    const isAllowed = allowedRoles.some(r => r.toLowerCase() === userRole);
    if (!isAllowed) {
      return <Navigate to={getRoleDashboardPath(userRole)} replace />;
    }
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
  if (user) return <Navigate to={getRoleDashboardPath(user.role)} replace />;
  return <AuthFlowPage />;
}

export default App;
