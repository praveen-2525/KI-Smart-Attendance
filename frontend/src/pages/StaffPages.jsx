import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usersApi, notifApi, timetableApi, adminApi } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

// ============================================================
// STUDENTS LIST PAGE (HOD / DEO / ADVISOR)
// ============================================================
export function StudentsListPage() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [year, setYear] = useState('');
  const [section, setSection] = useState('');
  const [page, setPage] = useState(1);
  const [showAddStudent, setShowAddStudent] = useState(false);
  const [creatingStudent, setCreatingStudent] = useState(false);

  const [studentForm, setStudentForm] = useState({
    student_id: '',
    full_name: '',
    register_number: '',
    roll_number: '',
    email: '',
    mobile_number: '',
    department: 'CSE(AI&ML)',
    year: 'III Year',
    section: 'AIML',
    date_of_birth: '',
    advisor: '',
    parent_name: '',
    parent_contact: '',
    account_status: 'ACTIVE',
    password: '',
  });

  const qc = useQueryClient();

  const handleCreateStudent = async (e) => {
    e.preventDefault();
    if (!studentForm.full_name.trim() || !studentForm.register_number.trim() || !studentForm.roll_number || !studentForm.email) {
      toast.error('Full Name, Register No, Roll No, and College Email are required.');
      return;
    }
    setCreatingStudent(true);
    try {
      await usersApi.createStudent(studentForm);
      toast.success(`Student account created for ${studentForm.full_name}!`);
      setShowAddStudent(false);
      setStudentForm({
        student_id: '', full_name: '', register_number: '', roll_number: '',
        email: '', mobile_number: '', department: 'CSE(AI&ML)', year: 'III Year',
        section: 'AIML', date_of_birth: '', advisor: '', parent_name: '', parent_contact: '',
        account_status: 'ACTIVE', password: '',
      });
      qc.invalidateQueries(['students-list']);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to create student account');
    } finally {
      setCreatingStudent(false);
    }
  };

  const { data, isLoading } = useQuery({
    queryKey: ['students-list', { search, year, section, page }],
    queryFn: () => usersApi.listStudents({ search: search || undefined, year: year || undefined, section: section || undefined, page, limit: 20 }),
    select: (res) => res.data,
    keepPreviousData: true,
  });

  const toggleMutation = useMutation({
    mutationFn: (userId) => usersApi.toggleStatus(userId),
    onSuccess: () => {
      toast.success('Student status updated');
      qc.invalidateQueries(['students-list']);
    },
    onError: (err) => toast.error(err.response?.data?.detail || 'Failed to update status'),
  });

  const totalPages = data ? Math.ceil(data.total / 20) : 1;

  return (
    <div className="page-content animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#e2e8f0' }}>👥 Students</h2>
          <p style={{ color: 'var(--gray-500)', fontSize: 14 }}>
            {data?.total || 0} students registered
          </p>
        </div>
        {user?.role === 'deo' && (
          <button className="btn btn-primary" onClick={() => setShowAddStudent(!showAddStudent)}>
            {showAddStudent ? 'Cancel' : '➕ Add Student'}
          </button>
        )}
      </div>

      {showAddStudent && user?.role === 'deo' && (
        <div className="card mb-6" style={{ borderColor: 'rgba(99,102,241,0.4)', background: 'var(--surface-dark-2)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#e2e8f0' }}>
              👤 Create Complete Student Account
            </h3>
            <div style={{ background: 'rgba(16,185,129,0.15)', color: 'var(--success)', padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
              Role: STUDENT (Auto-Enforced)
            </div>
          </div>

          <form onSubmit={handleCreateStudent}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              <div className="form-group">
                <label className="form-label">Full Name *</label>
                <input type="text" className="form-input" placeholder="e.g. Praveen S" value={studentForm.full_name}
                  onChange={e => setStudentForm(f => ({ ...f, full_name: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label className="form-label">Register Number * (12 Digits)</label>
                <input type="text" className="form-input" placeholder="e.g. 7376241AI101" value={studentForm.register_number}
                  onChange={e => setStudentForm(f => ({ ...f, register_number: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label className="form-label">Roll Number *</label>
                <input type="text" className="form-input" placeholder="e.g. 24AIM040" value={studentForm.roll_number}
                  onChange={e => setStudentForm(f => ({ ...f, roll_number: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label className="form-label">College Email *</label>
                <input type="email" className="form-input" placeholder="student@kitech.edu.in" value={studentForm.email}
                  onChange={e => setStudentForm(f => ({ ...f, email: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label className="form-label">Mobile Number *</label>
                <input type="tel" className="form-input" placeholder="10-digit mobile number" value={studentForm.mobile_number}
                  onChange={e => setStudentForm(f => ({ ...f, mobile_number: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label className="form-label">Department *</label>
                <select className="form-input" value={studentForm.department} onChange={e => setStudentForm(f => ({ ...f, department: e.target.value }))}>
                  <option>CSE(AI&ML)</option>
                  <option>CSE</option>
                  <option>ECE</option>
                  <option>EEE</option>
                  <option>MECH</option>
                  <option>CIVIL</option>
                  <option>IT</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Year *</label>
                <select className="form-input" value={studentForm.year} onChange={e => setStudentForm(f => ({ ...f, year: e.target.value }))}>
                  <option value="I Year">I Year</option>
                  <option value="II Year">II Year</option>
                  <option value="III Year">III Year</option>
                  <option value="IV Year">IV Year</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Section *</label>
                <input type="text" className="form-input" placeholder="e.g. AIML, A, B" value={studentForm.section}
                  onChange={e => setStudentForm(f => ({ ...f, section: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label className="form-label">Date of Birth *</label>
                <input type="date" className="form-input" value={studentForm.date_of_birth}
                  onChange={e => setStudentForm(f => ({ ...f, date_of_birth: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label className="form-label">Student ID (Optional)</label>
                <input type="text" className="form-input" placeholder="Auto-generated if empty" value={studentForm.student_id}
                  onChange={e => setStudentForm(f => ({ ...f, student_id: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Assigned Advisor</label>
                <input type="text" className="form-input" placeholder="Advisor Name / ID" value={studentForm.advisor}
                  onChange={e => setStudentForm(f => ({ ...f, advisor: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Initial / Temp Password</label>
                <input type="password" className="form-input" placeholder="Default: Student@123" value={studentForm.password}
                  onChange={e => setStudentForm(f => ({ ...f, password: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Parent / Guardian Name</label>
                <input type="text" className="form-input" placeholder="Parent Name" value={studentForm.parent_name}
                  onChange={e => setStudentForm(f => ({ ...f, parent_name: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Parent / Guardian Contact</label>
                <input type="tel" className="form-input" placeholder="Parent 10-digit Phone" value={studentForm.parent_contact}
                  onChange={e => setStudentForm(f => ({ ...f, parent_contact: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Account Status</label>
                <select className="form-input" value={studentForm.account_status} onChange={e => setStudentForm(f => ({ ...f, account_status: e.target.value }))}>
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="INACTIVE">INACTIVE</option>
                </select>
              </div>
            </div>

            <div style={{ marginTop: 20, display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowAddStudent(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={creatingStudent}>
                {creatingStudent ? <><span className="spinner" /> Creating Student Account...</> : '🚀 Create Student Account'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="card mb-6">
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <input
            type="text"
            className="form-input"
            placeholder="Search by name, register no, roll no..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            style={{ flex: 1, minWidth: 200 }}
          />
          <select className="form-input" value={year} onChange={(e) => { setYear(e.target.value); setPage(1); }} style={{ width: 140 }}>
            <option value="">All Years</option>
            <option value="I">I Year</option>
            <option value="II">II Year</option>
            <option value="III">III Year</option>
            <option value="IV">IV Year</option>
          </select>
          <select className="form-input" value={section} onChange={(e) => { setSection(e.target.value); setPage(1); }} style={{ width: 140 }}>
            <option value="">All Sections</option>
            <option value="AIML">AIML</option>
            <option value="A">A</option>
            <option value="B">B</option>
          </select>
          <button className="btn btn-secondary" onClick={() => { setSearch(''); setYear(''); setSection(''); setPage(1); }}>
            Clear
          </button>
        </div>
      </div>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 60 }}><span className="spinner" /> Loading students...</div>
      ) : (
        <>
          <div className="card">
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Name</th>
                    <th>Register No</th>
                    <th>Roll No</th>
                    <th>Dept</th>
                    <th>Year</th>
                    <th>Section</th>
                    <th>Email</th>
                    <th>Status</th>
                    {user?.role === 'deo' && <th>Action</th>}
                  </tr>
                </thead>
                <tbody>
                  {data?.students?.map((s, idx) => (
                    <tr key={s.id || s.register_no}>
                      <td style={{ color: 'var(--gray-600)', fontSize: 12 }}>{(page - 1) * 20 + idx + 1}</td>
                      <td style={{ fontWeight: 600, color: '#e2e8f0' }}>{s.name}</td>
                      <td style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--gray-400)' }}>{s.register_no}</td>
                      <td style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--gray-400)' }}>{s.roll_number || '-'}</td>
                      <td style={{ fontSize: 12 }}>{s.department}</td>
                      <td>{s.year}</td>
                      <td>{s.section}</td>
                      <td style={{ fontSize: 12, color: 'var(--gray-500)' }}>{s.email}</td>
                      <td>
                        <span className={`badge badge-${s.status === 'ACTIVE' ? 'approved' : 'rejected'}`}>
                          {s.status || 'ACTIVE'}
                        </span>
                      </td>
                      {user?.role === 'deo' && (
                        <td>
                          <button
                            className={`btn btn-${s.status === 'ACTIVE' ? 'danger' : 'success'}`}
                            style={{ fontSize: 11, padding: '3px 10px' }}
                            onClick={() => toggleMutation.mutate(s.id)}
                            disabled={toggleMutation.isLoading}
                          >
                            {s.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                  {!data?.students?.length && (
                    <tr>
                      <td colSpan={10} style={{ textAlign: 'center', color: 'var(--gray-600)', padding: 40 }}>
                        No students found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
              <button className="btn btn-secondary" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Prev</button>
              <span style={{ padding: '8px 16px', color: 'var(--gray-400)', fontSize: 13 }}>Page {page} of {totalPages}</span>
              <button className="btn btn-secondary" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ============================================================
// STAFF / FACULTY LIST PAGE (HOD / DEO)
// ============================================================
export function FacultyListPage() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const qc = useQueryClient();

  const [form, setForm] = useState({
    full_name: '', email: '', password: '', phone: '',
    department: 'CSE(AI&ML)', role: 'FACULTY', designation: '',
    assigned_year: '', assigned_section: '', date_of_birth: ''
  });
  const [creating, setCreating] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['staff-list', { search, roleFilter }],
    queryFn: () => usersApi.listStaff({ search: search || undefined, role: roleFilter || undefined, limit: 100 }),
    select: (res) => res.data,
  });

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.full_name.trim() || !form.email.trim() || !form.password.trim()) {
      toast.error('Name, Email, and Password are required');
      return;
    }
    if (form.password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    setCreating(true);
    try {
      await usersApi.createInstitutionalUser(form);
      toast.success(`${form.role} account created successfully!`);
      setShowCreateForm(false);
      setForm({ full_name: '', email: '', password: '', phone: '', department: 'CSE(AI&ML)', role: 'FACULTY', designation: '', assigned_year: '', assigned_section: '', date_of_birth: '' });
      qc.invalidateQueries(['staff-list']);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to create account');
    } finally {
      setCreating(false);
    }
  };

  const roleBadgeColors = {
    hod: 'var(--accent-violet)', advisor: 'var(--info)', faculty: 'var(--primary-400)',
    staff: 'var(--gray-400)', deo: 'var(--warning)'
  };

  return (
    <div className="page-content animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#e2e8f0' }}>👨‍🏫 Faculty & Staff</h2>
          <p style={{ color: 'var(--gray-500)', fontSize: 14 }}>{data?.total || 0} institutional users</p>
        </div>
        {user?.role === 'deo' && (
          <button className="btn btn-primary" onClick={() => setShowCreateForm(!showCreateForm)}>
            {showCreateForm ? 'Cancel' : '+ Create Account'}
          </button>
        )}
      </div>

      {showCreateForm && user?.role === 'deo' && (
        <div className="card mb-6" style={{ borderColor: 'rgba(99,102,241,0.3)' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0', marginBottom: 20 }}>
            🔐 Create Institutional User Account
          </h3>
          <div style={{ padding: '12px 16px', background: 'rgba(245,158,11,0.08)', borderRadius: 8, marginBottom: 20, fontSize: 13, color: 'var(--warning)' }}>
            ⚠️ These accounts are for institutional staff only. Students must register through the public registration form.
          </div>
          <form onSubmit={handleCreate}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div className="form-group">
                <label className="form-label">Full Name *</label>
                <input type="text" className="form-input" placeholder="e.g. Dr. Rajesh Kumar" value={form.full_name}
                  onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label className="form-label">College Email *</label>
                <input type="email" className="form-input" placeholder="faculty@kit.edu" value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label className="form-label">Role *</label>
                <select className="form-input" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                  <option value="HOD">HOD</option>
                  <option value="ADVISOR">ADVISOR</option>
                  <option value="FACULTY">FACULTY</option>
                  <option value="STAFF">STAFF</option>
                  <option value="DEO">DEO</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Department *</label>
                <select className="form-input" value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))}>
                  <option>CSE(AI&ML)</option>
                  <option>CSE</option>
                  <option>ECE</option>
                  <option>EEE</option>
                  <option>MECH</option>
                  <option>CIVIL</option>
                  <option>IT</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Designation</label>
                <input type="text" className="form-input" placeholder="e.g. Assistant Professor" value={form.designation}
                  onChange={e => setForm(f => ({ ...f, designation: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Mobile Number</label>
                <input type="tel" className="form-input" placeholder="10 digits" value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              {['ADVISOR', 'FACULTY'].includes(form.role) && (
                <>
                  <div className="form-group">
                    <label className="form-label">Assigned Year</label>
                    <select className="form-input" value={form.assigned_year} onChange={e => setForm(f => ({ ...f, assigned_year: e.target.value }))}>
                      <option value="">Not Assigned</option>
                      <option value="I">I Year</option>
                      <option value="II">II Year</option>
                      <option value="III">III Year</option>
                      <option value="IV">IV Year</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Assigned Section</label>
                    <input type="text" className="form-input" placeholder="e.g. AIML, A, B" value={form.assigned_section}
                      onChange={e => setForm(f => ({ ...f, assigned_section: e.target.value }))} />
                  </div>
                </>
              )}
              <div className="form-group">
                <label className="form-label">Temporary Password *</label>
                <input type="password" className="form-input" placeholder="Min 8 characters" value={form.password} minLength={8}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label className="form-label">Date of Birth</label>
                <input type="date" className="form-input" value={form.date_of_birth}
                  onChange={e => setForm(f => ({ ...f, date_of_birth: e.target.value }))} />
              </div>
            </div>
            <div style={{ marginTop: 20, display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowCreateForm(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={creating}>
                {creating ? <><span className="spinner" /> Creating...</> : `Create ${form.role} Account`}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="card mb-6">
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <input type="text" className="form-input" placeholder="Search by name or email..."
            value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
          <select className="form-input" value={roleFilter} onChange={e => setRoleFilter(e.target.value)} style={{ width: 160 }}>
            <option value="">All Roles</option>
            <option value="hod">HOD</option>
            <option value="advisor">ADVISOR</option>
            <option value="faculty">FACULTY</option>
            <option value="staff">STAFF</option>
            <option value="deo">DEO</option>
          </select>
          <button className="btn btn-secondary" onClick={() => { setSearch(''); setRoleFilter(''); }}>Clear</button>
        </div>
      </div>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 60 }}><span className="spinner" /> Loading staff...</div>
      ) : (
        <div className="card">
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Department</th>
                  <th>Designation</th>
                  <th>Email</th>
                  <th>Assigned To</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data?.staff?.map((s, idx) => (
                  <tr key={s.id}>
                    <td style={{ color: 'var(--gray-600)', fontSize: 12 }}>{idx + 1}</td>
                    <td style={{ fontWeight: 600, color: '#e2e8f0' }}>{s.name}</td>
                    <td>
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 8,
                        background: `${roleBadgeColors[s.role] || 'var(--primary-400)'}20`,
                        color: roleBadgeColors[s.role] || 'var(--primary-400)',
                        textTransform: 'uppercase'
                      }}>{s.role}</span>
                    </td>
                    <td style={{ fontSize: 12 }}>{s.department}</td>
                    <td style={{ fontSize: 12, color: 'var(--gray-400)' }}>{s.designation || '-'}</td>
                    <td style={{ fontSize: 12, color: 'var(--gray-500)' }}>{s.email}</td>
                    <td style={{ fontSize: 12, color: 'var(--gray-400)' }}>
                      {s.assigned_year || s.assigned_section
                        ? `${s.assigned_year || ''} ${s.assigned_section || ''}`.trim()
                        : '-'}
                    </td>
                    <td>
                      <span className={`badge badge-${s.status === 'ACTIVE' ? 'approved' : 'rejected'}`}>
                        {s.status || 'ACTIVE'}
                      </span>
                    </td>
                  </tr>
                ))}
                {!data?.staff?.length && (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', color: 'var(--gray-600)', padding: 40 }}>
                      No staff accounts found.
                      {user?.role === 'deo' && ' Click "Create Account" to add institutional users.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// NOTIFICATIONS PAGE
// ============================================================
export function NotificationsPage() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => notifApi.getAll({ limit: 50 }),
    select: (res) => res.data,
  });

  const markRead = async (id) => {
    try {
      await notifApi.markRead(id);
      refetch();
    } catch (e) { /* ignore */ }
  };

  const markAllRead = async () => {
    try {
      await notifApi.markAllRead();
      toast.success('All notifications marked as read');
      refetch();
    } catch (e) { /* ignore */ }
  };

  const notifIcon = (type) => {
    switch ((type || '').toLowerCase()) {
      case 'od': return '🎫';
      case 'leave': return '📋';
      case 'correction': return '✏️';
      case 'warning': return '⚠️';
      default: return '🔔';
    }
  };

  return (
    <div className="page-content animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#e2e8f0' }}>🔔 Notifications</h2>
          <p style={{ color: 'var(--gray-500)', fontSize: 14 }}>
            {data?.unread_count > 0 ? `${data.unread_count} unread notification(s)` : 'All caught up!'}
          </p>
        </div>
        {data?.unread_count > 0 && (
          <button className="btn btn-secondary" onClick={markAllRead}>Mark All Read</button>
        )}
      </div>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 60 }}><span className="spinner" /></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {data?.notifications?.map((n) => (
            <div key={n.id} onClick={() => !n.is_read && markRead(n.id)} style={{
              background: n.is_read ? 'var(--surface-dark-2)' : 'rgba(99,102,241,0.08)',
              border: `1px solid ${n.is_read ? 'var(--border-dark)' : 'rgba(99,102,241,0.25)'}`,
              borderRadius: 12, padding: '14px 18px', cursor: n.is_read ? 'default' : 'pointer',
              display: 'flex', alignItems: 'flex-start', gap: 14, transition: 'var(--transition)'
            }}>
              <div style={{ fontSize: 24, flexShrink: 0, marginTop: 2 }}>{notifIcon(n.type)}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: n.is_read ? 500 : 700, color: n.is_read ? 'var(--gray-400)' : '#e2e8f0', fontSize: 14 }}>
                  {n.title || n.message}
                </div>
                {n.body && <div style={{ fontSize: 13, color: 'var(--gray-500)', marginTop: 4 }}>{n.body}</div>}
                <div style={{ fontSize: 11, color: 'var(--gray-600)', marginTop: 6 }}>
                  {n.created_at && new Date(n.created_at).toLocaleString('en-IN')}
                </div>
              </div>
              {!n.is_read && (
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--primary-400)', flexShrink: 0, marginTop: 6 }} />
              )}
            </div>
          ))}
          {!data?.notifications?.length && (
            <div className="card" style={{ textAlign: 'center', padding: 60 }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🔔</div>
              <div style={{ color: 'var(--gray-500)', fontSize: 15 }}>No notifications yet</div>
              <div style={{ color: 'var(--gray-600)', fontSize: 13, marginTop: 8 }}>
                You'll receive updates about your requests and attendance here.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// TIMETABLE PAGE
// ============================================================
export function TimetablePage() {
  const { user } = useAuth();
  const todayDow = new Date().getDay(); // 0=Sun
  const [activeDay, setActiveDay] = useState(todayDow === 0 ? 1 : todayDow);

  const { data: todayData, isLoading } = useQuery({
    queryKey: ['timetable-today'],
    queryFn: () => timetableApi.getToday(),
    select: (res) => res.data,
  });

  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const daysFull = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const todayPeriods = todayData?.periods || [];
  const currentTodayDow = new Date().getDay() === 0 ? 1 : new Date().getDay();

  return (
    <div className="page-content animate-fade-in">
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: '#e2e8f0' }}>📅 Timetable</h2>
        <p style={{ color: 'var(--gray-500)', fontSize: 14 }}>
          {user?.role === 'student'
            ? `${user?.department || ''} ${user?.year || ''} Year — ${user?.section || ''}`
            : 'Weekly class schedule'}
        </p>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, overflowX: 'auto', paddingBottom: 4 }}>
        {days.map((d, i) => {
          const dayNum = i + 1;
          const isToday = dayNum === currentTodayDow;
          return (
            <button key={d} onClick={() => setActiveDay(dayNum)} style={{
              padding: '8px 20px', borderRadius: 20, border: 'none', cursor: 'pointer',
              background: activeDay === dayNum ? 'var(--gradient-brand)' : 'var(--surface-dark-3)',
              color: activeDay === dayNum ? 'white' : isToday ? 'var(--primary-400)' : 'var(--gray-400)',
              fontWeight: activeDay === dayNum || isToday ? 700 : 500,
              fontSize: 13, flexShrink: 0,
              boxShadow: activeDay === dayNum ? 'var(--shadow-glow)' : 'none',
              transition: 'var(--transition)'
            }}>
              {d}{isToday ? ' ●' : ''}
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 60 }}><span className="spinner" /></div>
      ) : (
        <div className="card">
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0', marginBottom: 16 }}>
            {daysFull[activeDay - 1]} Schedule
          </h3>
          {activeDay === currentTodayDow && todayPeriods.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {todayPeriods.map((p, idx) => (
                <div key={idx} style={{
                  display: 'flex', alignItems: 'center', gap: 16,
                  background: 'var(--surface-dark-3)', borderRadius: 10, padding: '14px 18px',
                  borderLeft: '3px solid var(--primary-400)'
                }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 8,
                    background: 'rgba(99,102,241,0.15)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 700, color: 'var(--primary-400)', fontSize: 14, flexShrink: 0
                  }}>
                    {p.period_number || idx + 1}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, color: '#e2e8f0', fontSize: 14 }}>{p.subject_name || 'Subject'}</div>
                    <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 2 }}>
                      {p.subject_code && <span style={{ fontFamily: 'monospace' }}>{p.subject_code} • </span>}
                      {p.faculty_name && <span>{p.faculty_name}</span>}
                      {p.room && <span> • Room {p.room}</span>}
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--gray-400)', textAlign: 'right', flexShrink: 0 }}>
                    <div>{p.start_time}</div>
                    <div style={{ color: 'var(--gray-600)', fontSize: 10 }}>to</div>
                    <div>{p.end_time}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon">📅</div>
              <div className="empty-state-desc">
                {activeDay === currentTodayDow
                  ? 'No classes scheduled for today'
                  : `Select today's tab to view live schedule`}
              </div>
              <div style={{ fontSize: 12, color: 'var(--gray-600)', marginTop: 8 }}>
                Contact your class advisor or DEO if the timetable seems incorrect.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// CLASSES & SECTIONS PAGE (DEO / HOD)
// ============================================================
export function ClassesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showAddForm, setShowAddForm] = useState(false);
  const [sectionForm, setSectionForm] = useState({ department_code: 'AIML', year: 'III', section_name: '' });
  const [adding, setAdding] = useState(false);

  const { data: sectionsData, isLoading } = useQuery({
    queryKey: ['sections-list'],
    queryFn: () => adminApi.getSections(),
    select: (res) => res.data,
  });

  const handleAddSection = async (e) => {
    e.preventDefault();
    if (!sectionForm.section_name.trim()) {
      toast.error('Section name is required');
      return;
    }
    setAdding(true);
    try {
      await adminApi.createSection(sectionForm);
      toast.success('Section added successfully');
      setShowAddForm(false);
      setSectionForm({ department_code: 'AIML', year: 'III', section_name: '' });
      qc.invalidateQueries(['sections-list']);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to add section');
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="page-content animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#e2e8f0' }}>🏛️ Classes & Sections</h2>
          <p style={{ color: 'var(--gray-500)', fontSize: 14 }}>Manage academic sections and class configuration</p>
        </div>
        {['deo', 'hod'].includes(user?.role) && (
          <button className="btn btn-primary" onClick={() => setShowAddForm(!showAddForm)}>
            {showAddForm ? 'Cancel' : '+ Add Section'}
          </button>
        )}
      </div>

      {showAddForm && (
        <div className="card mb-6" style={{ borderColor: 'rgba(99,102,241,0.3)' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0', marginBottom: 16 }}>Add New Section</h3>
          <form onSubmit={handleAddSection}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
              <div className="form-group">
                <label className="form-label">Department Code</label>
                <select className="form-input" value={sectionForm.department_code}
                  onChange={e => setSectionForm(f => ({ ...f, department_code: e.target.value }))}>
                  <option>AIML</option><option>CSE</option><option>ECE</option>
                  <option>EEE</option><option>MECH</option><option>CIVIL</option><option>IT</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Year</label>
                <select className="form-input" value={sectionForm.year}
                  onChange={e => setSectionForm(f => ({ ...f, year: e.target.value }))}>
                  <option value="I">I Year</option><option value="II">II Year</option>
                  <option value="III">III Year</option><option value="IV">IV Year</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Section Name</label>
                <input type="text" className="form-input" placeholder="e.g. AIML, A, B"
                  value={sectionForm.section_name}
                  onChange={e => setSectionForm(f => ({ ...f, section_name: e.target.value.toUpperCase() }))} required />
              </div>
            </div>
            <div style={{ marginTop: 16, display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowAddForm(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={adding}>
                {adding ? <><span className="spinner" /> Adding...</> : 'Add Section'}
              </button>
            </div>
          </form>
        </div>
      )}

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 60 }}><span className="spinner" /></div>
      ) : (
        <div className="card">
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Department</th>
                  <th>Year</th>
                  <th>Section</th>
                  <th>Status</th>
                  {['deo', 'hod'].includes(user?.role) && <th>Action</th>}
                </tr>
              </thead>
              <tbody>
                {sectionsData?.sections?.map((s, idx) => (
                  <tr key={idx}>
                    <td style={{ fontWeight: 600 }}>{s.department_code}</td>
                    <td>{s.year}</td>
                    <td>{s.section_name}</td>
                    <td>
                      <span className={`badge badge-${(s.status || 'ACTIVE') === 'ACTIVE' ? 'approved' : 'rejected'}`}>
                        {s.status || 'ACTIVE'}
                      </span>
                    </td>
                    {['deo', 'hod'].includes(user?.role) && (
                      <td>
                        <button
                          className={`btn btn-${(s.status || 'ACTIVE') === 'ACTIVE' ? 'danger' : 'success'}`}
                          style={{ fontSize: 11, padding: '3px 10px' }}
                          onClick={async () => {
                            try {
                              const encoded = encodeURIComponent(s.section_name);
                              await fetch(`http://localhost:8000/api/v1/admin/config/sections/${encoded}/toggle`, {
                                method: 'PUT',
                                headers: { Authorization: `Bearer ${localStorage.getItem('access_token')}` }
                              });
                              qc.invalidateQueries(['sections-list']);
                              toast.success('Section status updated');
                            } catch (e) { toast.error('Failed'); }
                          }}
                        >
                          {(s.status || 'ACTIVE') === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
                {!sectionsData?.sections?.length && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', color: 'var(--gray-600)', padding: 40 }}>
                      No sections configured yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// STAFF DASHBOARD (read-only OD/Leave viewer)
// ============================================================
export function StaffDashboard() {
  const { user } = useAuth();
  return (
    <div className="page-content animate-fade-in">
      <div style={{
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 'var(--border-radius-xl)', padding: '28px 32px', marginBottom: 24
      }}>
        <div style={{ fontSize: 13, color: 'var(--gray-500)', marginBottom: 4 }}>Welcome back</div>
        <h2 style={{ fontSize: 24, fontWeight: 800, color: '#e2e8f0', margin: 0 }}>{user?.full_name}</h2>
        <div style={{ fontSize: 13, color: 'var(--gray-400)', marginTop: 6 }}>
          Office Staff • {user?.department || 'KIT'}
          {user?.office && <span> • {user.office}</span>}
        </div>
      </div>

      <div className="grid-3">
        {[
          { icon: '🎫', label: 'OD Requests', desc: 'View approved OD information', color: 'var(--warning)' },
          { icon: '📋', label: 'Leave Requests', desc: 'View approved leave records', color: 'var(--info)' },
          { icon: '📅', label: "Today", desc: new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' }), color: 'var(--success)' },
        ].map(item => (
          <div key={item.label} className="stat-card">
            <div className="stat-icon" style={{ background: `${item.color}20` }}>
              <span style={{ fontSize: 20 }}>{item.icon}</span>
            </div>
            <div className="stat-value" style={{ color: item.color, fontSize: 16 }}>{item.label}</div>
            <div className="stat-label">{item.desc}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginTop: 24 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0', marginBottom: 12 }}>ℹ️ Staff Portal</h3>
        <div style={{ fontSize: 14, color: 'var(--gray-400)', lineHeight: 1.8 }}>
          As office staff, you can view approved OD and leave notifications for processing.<br />
          <span style={{ color: 'var(--gray-600)', fontSize: 13 }}>
            For access issues or account changes, contact the DEO.
          </span>
        </div>
      </div>
    </div>
  );
}
