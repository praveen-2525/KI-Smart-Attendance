import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

// Icons (using emoji + SVG)
const Icons = {
  home: '🏠', attendance: '📊', planner: '🎯', od: '🎫', leave: '📋',
  late: '⏰', correction: '✏️', notifications: '🔔', timetable: '📅',
  reports: '📄', students: '👥', faculty: '👨‍🏫', settings: '⚙️',
  audit: '🔍', qr: '📱', erp: '🔗', logout: '🚪',
  classes: '🏛️', requests: '📨', alerts: '⚠️',
};

const navConfig = {
  student: [
    { path: '/student/dashboard', label: 'Dashboard', icon: Icons.home },
    { path: '/attendance', label: 'Attendance', icon: Icons.attendance },
    { label: 'Requests', section: true },
    { path: '/od', label: 'OD Request', icon: Icons.od },
    { path: '/leave', label: 'Leave Request', icon: Icons.leave },
    { path: '/late', label: 'Late Arrival', icon: Icons.late },
    { path: '/correction', label: 'Correction', icon: Icons.correction },
    { label: 'Records', section: true },
    { path: '/my-requests', label: 'My Requests', icon: Icons.requests },
    { path: '/approved-od-leave', label: 'Approved OD & Leave', icon: '✅' },
    { label: 'Other', section: true },
    { path: '/notifications', label: 'Notifications', icon: Icons.notifications },
    { path: '/profile', label: 'Profile', icon: '👤' },
  ],
  faculty: [
    { path: '/faculty/dashboard', label: 'Dashboard', icon: Icons.home },
    { path: '/classes', label: 'My Classes', icon: Icons.classes },
    { path: '/attendance', label: 'Attendance', icon: Icons.attendance },
    { label: 'Students', section: true },
    { path: '/approved-od-leave', label: 'Approved OD & Leave', icon: '✅' },
    { path: '/correction', label: 'Corrections', icon: Icons.correction },
    { label: 'Other', section: true },
    { path: '/notifications', label: 'Alerts', icon: Icons.alerts },
    { path: '/profile', label: 'Profile', icon: '👤' },
  ],
  advisor: [
    { path: '/advisor/dashboard', label: 'Dashboard', icon: Icons.home },
    { path: '/students', label: 'My Students', icon: Icons.students },
    { path: '/attendance', label: 'Attendance', icon: Icons.attendance },
    { label: 'Approvals', section: true },
    { path: '/od', label: 'OD Requests', icon: Icons.od },
    { path: '/leave', label: 'Leave Requests', icon: Icons.leave },
    { path: '/correction', label: 'Corrections', icon: Icons.correction },
    { label: 'Records', section: true },
    { path: '/approved-od-leave', label: 'Approved OD & Leave', icon: '✅' },
    { label: 'More', section: true },
    { path: '/notifications', label: 'Notifications', icon: Icons.notifications },
    { path: '/profile', label: 'Profile', icon: '👤' },
    { path: '/reports', label: 'Reports', icon: Icons.reports },
    { path: '/audit', label: 'Audit Log', icon: Icons.audit },
  ],
  hod: [
    { path: '/hod/dashboard', label: 'Dashboard', icon: Icons.home },
    { path: '/students', label: 'Students', icon: Icons.students },
    { path: '/faculty', label: 'Faculty', icon: Icons.faculty },
    { path: '/attendance', label: 'Attendance', icon: Icons.attendance },
    { label: 'Approvals', section: true },
    { path: '/od', label: 'OD Requests', icon: Icons.od },
    { path: '/leave', label: 'Leave Requests', icon: Icons.leave },
    { path: '/correction', label: 'Corrections', icon: Icons.correction },
    { label: 'Records', section: true },
    { path: '/approved-od-leave', label: 'Approved OD & Leave', icon: '✅' },
    { label: 'Analytics', section: true },
    { path: '/reports', label: 'Reports', icon: Icons.reports },
    { path: '/profile', label: 'Profile', icon: '👤' },
    { path: '/audit', label: 'Audit Log', icon: Icons.audit },
    { path: '/notifications', label: 'Notifications', icon: Icons.notifications },
  ],
  deo: [
    { path: '/deo/dashboard', label: 'Dashboard', icon: Icons.home },
    { path: '/students', label: 'Students', icon: Icons.students },
    { path: '/faculty', label: 'Faculty & Staff', icon: Icons.faculty },
    { label: 'Admin', section: true },
    { path: '/import-students', label: 'Import Students', icon: '📥' },
    { path: '/classes', label: 'Classes & Sections', icon: Icons.classes },
    { path: '/timetable', label: 'Timetable', icon: Icons.timetable },
    { path: '/settings', label: 'Settings', icon: Icons.settings },
    { label: 'OD & Leave', section: true },
    { path: '/approved-od-leave', label: 'Approved OD & Leave Records', icon: '✅' },
    { label: 'Data', section: true },
    { path: '/reports', label: 'Reports', icon: Icons.reports },
    { path: '/profile', label: 'Profile', icon: '👤' },
    { path: '/audit', label: 'Audit Log', icon: Icons.audit },
    { path: '/erp', label: 'ERP Integration', icon: Icons.erp },
  ],
  staff: [
    { path: '/staff/dashboard', label: 'Dashboard', icon: Icons.home },
    { label: 'Records', section: true },
    { path: '/approved-od-leave', label: 'Approved OD & Leave', icon: '✅' },
    { label: 'Other', section: true },
    { path: '/students', label: 'Student Search', icon: Icons.students },
    { path: '/notifications', label: 'Notifications', icon: Icons.notifications },
    { path: '/timetable', label: 'Timetable', icon: Icons.timetable },
    { path: '/profile', label: 'Profile', icon: '👤' },
  ],
};

export default function Sidebar({ notifCount = 0 }) {
  const { user, logout } = useAuth();
  const role = user?.role || 'student';
  const navItems = navConfig[role] || navConfig.student;

  const initials = user?.full_name
    ? user.full_name.split(' ').map(n => n[0]).slice(0, 2).join('')
    : '?';

  return (
    <div className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'var(--gradient-brand)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, flexShrink: 0
          }}>🎓</div>
          <div>
            <div className="sidebar-logo-text">KI Smart+</div>
            <div className="sidebar-logo-sub">Attendance Management</div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        {navItems.map((item, idx) => {
          if (item.section) {
            return <div key={idx} className="nav-section-label">{item.label}</div>;
          }

          const isNotif = item.path === '/notifications';

          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            >
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
              {isNotif && notifCount > 0 && (
                <span className="nav-badge">{notifCount}</span>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* User footer */}
      <div className="sidebar-footer">
        <div className="user-info">
          <div className="avatar">{initials}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="user-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.full_name}
            </div>
            <div className="user-role">{role}</div>
          </div>
          <button
            onClick={logout}
            title="Logout"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--gray-600)', fontSize: 16, padding: 4,
              borderRadius: 6, transition: 'var(--transition)'
            }}
            onMouseOver={e => e.currentTarget.style.color = 'var(--accent-rose)'}
            onMouseOut={e => e.currentTarget.style.color = 'var(--gray-600)'}
          >
            {Icons.logout}
          </button>
        </div>
      </div>
    </div>
  );
}
