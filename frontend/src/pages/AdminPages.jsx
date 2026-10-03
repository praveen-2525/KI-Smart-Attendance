import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { reportsApi, erpApi, auditApi, adminApi, usersApi } from '../services/api';
import toast from 'react-hot-toast';
import { useState } from 'react';

// ============================================================
// REPORTS PAGE
// ============================================================
export function ReportsPage() {
  const { user } = useAuth();
  const isStudent = user?.role === 'student';

  const handleDownload = async (format) => {
    try {
      const res = await reportsApi.studentReport(user?.student_id, format);
      if (format !== 'json') {
        const blob = new Blob([res.data]);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `attendance_report.${format}`;
        a.click();
        toast.success('Report downloaded!');
      }
    } catch (err) {
      toast.error('Failed to generate report');
    }
  };

  const { data: hodOverview } = useQuery({
    queryKey: ['hod-overview'],
    queryFn: () => reportsApi.hodOverview(),
    enabled: ['hod', 'deo', 'advisor'].includes(user?.role),
    select: (res) => res.data,
  });

  return (
    <div className="page-content animate-fade-in">
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)' }}>📄 Reports</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Download and view attendance reports</p>
      </div>

      {isStudent && (
        <div className="card mb-6">
          <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 }}>My Attendance Report</h3>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
            Download your complete attendance report in various formats.
          </p>
          <div style={{ display: 'flex', gap: 12 }}>
            <button className="btn btn-primary" onClick={() => handleDownload('pdf')}>
              📄 Download PDF
            </button>
            <button className="btn btn-secondary" onClick={() => handleDownload('excel')}>
              📊 Download Excel
            </button>
          </div>
        </div>
      )}

      {hodOverview && (
        <div className="grid-2 mb-6">
          <div className="card">
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 }}>Department Overview</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { label: 'Total Students', value: hodOverview.total_students, color: 'var(--secondary)' },
                { label: 'Pending OD', value: hodOverview.pending_od_requests, color: 'var(--warning)' },
                { label: 'Pending Leave', value: hodOverview.pending_leave_requests, color: 'var(--info)' },
                { label: 'Proof Verification', value: hodOverview.pending_proof_verification, color: 'var(--accent-violet)' },
              ].map(item => (
                <div key={item.label} style={{
                  display: 'flex', justifyContent: 'space-between',
                  background: 'var(--bg-body)', borderRadius: 8, padding: '10px 14px'
                }}>
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{item.label}</span>
                  <span style={{ fontSize: 16, fontWeight: 700, color: item.color }}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 }}>Export Reports</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { label: 'Department Attendance Report', icon: '📊' },
                { label: 'Shortage List Report', icon: '⚠️' },
                { label: 'OD Summary Report', icon: '🎫' },
                { label: 'Leave Summary Report', icon: '📋' },
              ].map(item => (
                <button key={item.label} className="btn btn-secondary w-full" style={{ justifyContent: 'flex-start' }}>
                  {item.icon} {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// AUDIT LOG PAGE
// ============================================================
export function AuditPage() {
  const { data } = useQuery({
    queryKey: ['audit-logs'],
    queryFn: () => auditApi.getLogs({ limit: 50 }),
    select: (res) => res.data,
  });

  return (
    <div className="page-content animate-fade-in">
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)' }}>🔍 Audit Trail</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
          Complete record of all attendance changes and actions in the system.
        </p>
      </div>

      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Action</th>
                <th>Entity</th>
                <th>User</th>
                <th>Role</th>
                <th>Previous</th>
                <th>New</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {data?.logs?.map((log) => (
                <tr key={log.id}>
                  <td style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {log.created_at && new Date(log.created_at).toLocaleString('en-IN')}
                  </td>
                  <td>
                    <span style={{
                      fontSize: 12, fontWeight: 600,
                      color: log.action.includes('APPROVED') ? 'var(--success)' :
                             log.action.includes('REJECTED') ? 'var(--danger)' :
                             log.action.includes('CHANGED') ? 'var(--warning)' : 'var(--primary-400)'
                    }}>
                      {log.action}
                    </span>
                  </td>
                  <td style={{ fontSize: 12 }}>{log.entity_type} #{log.entity_id}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>#{log.user_id}</td>
                  <td><span className="badge badge-submitted" style={{ fontSize: 10 }}>{log.user_role}</span></td>
                  <td style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                    {log.previous_value ? JSON.stringify(log.previous_value).slice(0, 30) : '-'}
                  </td>
                  <td style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                    {log.new_value ? JSON.stringify(log.new_value).slice(0, 30) : '-'}
                  </td>
                  <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{log.reason || '-'}</td>
                </tr>
              ))}
              {!data?.logs?.length && (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 40 }}>
                    No audit logs yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// ERP INTEGRATION PAGE
// ============================================================
export function ERPPage() {
  const { data: erpStatus } = useQuery({
    queryKey: ['erp-status'],
    queryFn: () => erpApi.getStatus(),
    select: (res) => res.data,
  });

  const [csvFile, setCsvFile] = useState(null);
  const [importing, setImporting] = useState(false);

  const handleImport = async () => {
    if (!csvFile) { toast.error('Select a CSV file first'); return; }
    setImporting(true);
    try {
      const res = await erpApi.importCsv(csvFile, 'attendance');
      toast.success(`Imported ${res.data.imported} records (${res.data.failed} failed)`);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="page-content animate-fade-in">
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)' }}>🔗 ERP Integration</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
          Import attendance data from your existing ERP system via authorized methods only.
        </p>
      </div>

      <div className="card mb-6" style={{ background: 'rgba(16,185,129,0.05)', borderColor: 'rgba(16,185,129,0.2)' }}>
        <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.8 }}>
          <strong style={{ color: 'var(--success)', fontSize: 15 }}>🔒 Security Guarantee</strong><br />
          KI Smart Attendance+ does NOT perform any unauthorized ERP access. All data imports require:<br />
          • Authorized ERP API access (provided by IT admin)<br />
          • Approved CSV/Excel exports from ERP system<br />
          • DEO/HOD authorization for all import operations<br />
          <span style={{ color: 'var(--danger)' }}>Never: credential scraping, unauthorized API access, or private database connections</span>
        </div>
      </div>

      {erpStatus && (
        <div className="grid-2 mb-6">
          <div className="card">
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 }}>Last Sync Status</h3>
            {erpStatus.last_sync ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Status</span>
                  <span className={`badge badge-${erpStatus.last_sync.status === 'success' ? 'approved' : 'pending'}`}>
                    {erpStatus.last_sync.status}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Records Imported</span>
                  <span style={{ color: 'var(--success)', fontWeight: 700 }}>{erpStatus.last_sync.records_imported}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Records Updated</span>
                  <span style={{ color: 'var(--secondary)', fontWeight: 700 }}>{erpStatus.last_sync.records_updated}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Failed</span>
                  <span style={{ color: 'var(--danger)', fontWeight: 700 }}>{erpStatus.last_sync.records_failed}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Sync Time</span>
                  <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                    {erpStatus.last_sync.started_at && new Date(erpStatus.last_sync.started_at).toLocaleString()}
                  </span>
                </div>
              </div>
            ) : (
              <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: 20 }}>Never synced</div>
            )}
          </div>

          <div className="card">
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 }}>Import Data</h3>
            <div className="form-group">
              <label className="form-label">Import Method</label>
              <select className="form-select">
                <option>CSV Export from ERP</option>
                <option>Excel Export from ERP</option>
                <option>Authorized API (configure API key below)</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Upload Approved CSV</label>
              <input type="file" className="form-input" accept=".csv"
                onChange={e => setCsvFile(e.target.files[0])} />
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
              CSV format: register_number, subject_code, date (YYYY-MM-DD), period, status (PR/AB/OD/LE)
            </div>
            <button className="btn btn-primary w-full" onClick={handleImport} disabled={importing || !csvFile}>
              {importing ? <><span className="spinner" /> Importing...</> : '📥 Import Attendance Data'}
            </button>

            <div style={{ marginTop: 16, padding: 12, background: 'rgba(245,158,11,0.08)', borderRadius: 8 }}>
              <div style={{ fontSize: 12, color: 'var(--warning)' }}>
                ⚠️ To enable authorized API integration, provide your ERP API credentials in the system settings or contact IT admin.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// SETTINGS PAGE
// ============================================================
export function SettingsPage() {
  const { data } = useQuery({
    queryKey: ['settings'],
    queryFn: () => adminApi.getSettings(),
    select: (res) => res.data,
  });

  const [updating, setUpdating] = useState(null);

  const handleUpdate = async (key, newValue) => {
    setUpdating(key);
    try {
      await adminApi.updateSetting(key, newValue);
      toast.success('Setting updated');
    } catch (err) {
      toast.error('Failed to update setting');
    } finally {
      setUpdating(null);
    }
  };

  const categories = {};
  (data?.settings || []).forEach(s => {
    if (!categories[s.category]) categories[s.category] = [];
    categories[s.category].push(s);
  });

  return (
    <div className="page-content animate-fade-in">
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)' }}>⚙️ System Settings</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
          Configure attendance rules, leave policies, and system behavior.
        </p>
      </div>

      {Object.entries(categories).map(([category, settings]) => (
        <div key={category} className="card mb-6">
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16, textTransform: 'capitalize' }}>
            {category} Settings
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {settings.map((s) => (
              <div key={s.key} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                background: 'var(--bg-body)', borderRadius: 8, padding: '12px 16px'
              }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{s.key}</div>
                  {s.description && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{s.description}</div>}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    className="form-input"
                    style={{ width: 140, padding: '6px 10px', fontSize: 13 }}
                    defaultValue={s.value}
                    onBlur={(e) => {
                      if (e.target.value !== s.value) {
                        handleUpdate(s.key, e.target.value);
                      }
                    }}
                  />
                  {updating === s.key && <span className="spinner" style={{ width: 14, height: 14 }} />}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}


