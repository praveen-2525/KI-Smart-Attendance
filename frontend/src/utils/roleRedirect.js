export function getRoleDashboardPath(role) {
  if (!role) return '/login';
  const r = role.toString().trim().toLowerCase();
  switch (r) {
    case 'hod':
      return '/hod/dashboard';
    case 'advisor':
      return '/advisor/dashboard';
    case 'faculty':
      return '/faculty/dashboard';
    case 'staff':
      return '/staff/dashboard';
    case 'deo':
      return '/deo/dashboard';
    case 'student':
      return '/student/dashboard';
    default:
      return '/student/dashboard';
  }
}
