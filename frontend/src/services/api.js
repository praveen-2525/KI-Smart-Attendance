import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - handle token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = localStorage.getItem('refresh_token');
        if (!refreshToken) throw new Error('No refresh token');

        const response = await axios.post(`${API_URL}/auth/refresh`, {
          refresh_token: refreshToken,
        });

        const { access_token, refresh_token } = response.data;
        localStorage.setItem('access_token', access_token);
        localStorage.setItem('refresh_token', refresh_token);

        originalRequest.headers.Authorization = `Bearer ${access_token}`;
        return api(originalRequest);
      } catch (refreshError) {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('user');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

// Auth APIs
export const authApi = {
  login: (loginId, password) => api.post('/auth/login', { login_id: loginId, password }),
  getMe: () => api.get('/auth/me'),
  changePassword: (currentPassword, newPassword) =>
    api.post('/auth/change-password', { current_password: currentPassword, new_password: newPassword }),
};

// Attendance APIs
export const attendanceApi = {
  getMy: () => api.get('/attendance/my'),
  getHistory: (params) => api.get('/attendance/history', { params }),
  getCalendar: (year, month) => api.get('/attendance/calendar', { params: { year, month } }),
  getPlanner: (targetPct) => api.get('/attendance/planner', { params: { target_percentage: targetPct } }),
  whatIf: (data, subjectId) => api.post('/attendance/planner/what-if', data, { params: { subject_id: subjectId } }),
  markAttendance: (data) => api.post('/attendance/mark', data),
  markBulk: (data) => api.post('/attendance/mark-bulk', data),
  getSectionAttendance: (sectionId, date, period) =>
    api.get(`/attendance/section/${sectionId}`, { params: { date, period } }),
};

// OD APIs
export const odApi = {
  submit: (formData) => api.post('/od-requests', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  getMy: (params) => api.get('/od-requests/my', { params }),
  getPending: (params) => api.get('/od-requests/pending', { params }),
  get: (odId) => api.get(`/od-requests/${odId}`),
  cancel: (odId) => api.post(`/od-requests/${odId}/cancel`),
  review: (odId, status, reviewerRemarks) => {
    const fd = new FormData();
    fd.append('status', status);
    if (reviewerRemarks) fd.append('reviewerRemarks', reviewerRemarks);
    return api.post(`/od-requests/${odId}/review`, fd);
  },
};

// Leave APIs
export const leaveApi = {
  submit: (formData) => api.post('/leave-requests', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  getMy: () => api.get('/leave-requests/my'),
  getPending: () => api.get('/leave-requests/pending'),
  get: (leaveId) => api.get(`/leave-requests/${leaveId}`),
  cancel: (leaveId) => api.post(`/leave-requests/${leaveId}/cancel`),
  review: (leaveId, status, reviewerRemarks) => {
    const fd = new FormData();
    fd.append('status', status);
    if (reviewerRemarks) fd.append('reviewerRemarks', reviewerRemarks);
    return api.post(`/leave-requests/${leaveId}/review`, fd);
  },
};

// Late Arrival APIs
export const lateApi = {
  inform: (formData) => api.post('/late/inform', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  getMy: () => api.get('/late/my'),
};

// Correction APIs
export const correctionApi = {
  submit: (data) => api.post('/correction/submit', data),
  getMy: () => api.get('/correction/my'),
  getPending: () => api.get('/correction/pending'),
  approve: (id, notes) => api.post(`/correction/${id}/approve`, null, { params: { notes } }),
  reject: (id, reason) => api.post(`/correction/${id}/reject`, null, { params: { reason } }),
};

// Notification APIs
export const notifApi = {
  getAll: (params) => api.get('/notifications/', { params }),
  markRead: (id) => api.post(`/notifications/${id}/read`),
  markAllRead: () => api.post('/notifications/read-all'),
};

// Timetable APIs
export const timetableApi = {
  getToday: () => api.get('/timetable/today'),
  getWeek: (sectionId) => api.get('/timetable/week', { params: { section_id: sectionId } }),
};

// Reports APIs
export const reportsApi = {
  studentReport: (studentId, format) => api.get(`/reports/student/${studentId}`, {
    params: { format },
    responseType: format !== 'json' ? 'blob' : 'json',
  }),
  departmentReport: (deptId, params) => api.get(`/reports/department/${deptId}/attendance`, { params }),
  hodOverview: () => api.get('/reports/hod/overview'),
};

// Admin APIs
export const adminApi = {
  getDepartments: () => api.get('/admin/departments'),
  getClasses: (deptId) => api.get('/admin/classes', { params: { department_id: deptId } }),
  getSections: (classId) => api.get('/admin/sections', { params: { class_id: classId } }),
  getSubjects: (params) => api.get('/admin/subjects', { params }),
  getSettings: () => api.get('/admin/settings'),
  updateSetting: (key, value) => api.put(`/admin/settings/${key}`, { value }),
  createDepartment: (data) => api.post('/admin/departments', data),
  createClass: (data) => api.post('/admin/classes', data),
  createSection: (data) => api.post('/admin/sections', data),
  createSubject: (data) => api.post('/admin/subjects', data),
  createTimetable: (data) => api.post('/admin/timetable', data),
};

// User management APIs
export const usersApi = {
  listStudents: (params) => api.get('/users/students', { params }),
  createStudent: (data) => api.post('/users/student', data),
  createFaculty: (data) => api.post('/users/faculty', data),
  toggleStatus: (userId) => api.put(`/users/${userId}/toggle-status`),
  importStudents: (formData) => api.post('/users/students/import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
};

// ERP APIs
export const erpApi = {
  getStatus: () => api.get('/erp/status'),
  importCsv: (file, syncType) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post('/erp/import/csv', fd, {
      params: { sync_type: syncType },
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
};

// Audit APIs
export const auditApi = {
  getLogs: (params) => api.get('/audit/', { params }),
};

export default api;
