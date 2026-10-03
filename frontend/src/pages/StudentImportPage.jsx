import { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi, usersApi } from '../services/api';
import toast from 'react-hot-toast';

export default function StudentImportPage() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const fileInputRef = useRef(null);
  const qc = useQueryClient();

  const importMutation = useMutation({
    mutationFn: (data) => usersApi.importStudents(data),
    onSuccess: (res) => {
      if (res.data.imported) {
        toast.success(`Successfully imported ${res.data.imported} students`);
        setFile(null);
        setPreview(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        qc.invalidateQueries(['students-list']);
      } else {
        setPreview(res.data);
      }
    },
    onError: (err) => {
      toast.error(err.response?.data?.detail || 'Failed to process file');
    }
  });

  const handleFileChange = (e) => {
    const f = e.target.files[0];
    if (f) {
      if (!f.name.endsWith('.csv')) {
        toast.error('Only CSV files are allowed');
        e.target.value = '';
        return;
      }
      setFile(f);
      setPreview(null);
      
      // Auto preview
      const fd = new FormData();
      fd.append('file', f);
      fd.append('confirm', 'false');
      importMutation.mutate(fd);
    }
  };

  const handleConfirmImport = () => {
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('confirm', 'true');
    importMutation.mutate(fd);
  };

  return (
    <div className="page-content animate-fade-in">
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)' }}>📥 Import Students</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
          Upload student master data via CSV
        </p>
      </div>

      <div className="card mb-6">
        <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 }}>Upload CSV</h3>
        
        <div style={{
          border: '2px dashed var(--border-dark)',
          borderRadius: 12, padding: 32, textAlign: 'center',
          background: file ? 'rgba(99,102,241,0.05)' : 'var(--surface-dark-3)',
          cursor: 'pointer', transition: 'var(--transition)'
        }} onClick={() => fileInputRef.current?.click()}>
          <input
            type="file"
            ref={fileInputRef}
            accept=".csv"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
          <div style={{ fontSize: 32, marginBottom: 12 }}>{file ? '📄' : '📤'}</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
            {file ? file.name : 'Click to select CSV file'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Required columns: register_no, name, date_of_birth, department, year, section, email, phone
          </div>
        </div>
      </div>

      {importMutation.isLoading && !preview && (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <span className="spinner" /> Analyzing CSV...
        </div>
      )}

      {preview && (
        <div className="animate-fade-in">
          <div className="grid-3 mb-6">
            <div className="stat-card">
              <div className="stat-value">{preview.total_processed}</div>
              <div className="stat-label">Total Rows</div>
            </div>
            <div className="stat-card" style={{ borderColor: 'rgba(16,185,129,0.2)' }}>
              <div className="stat-value" style={{ color: 'var(--success)' }}>{preview.valid_count}</div>
              <div className="stat-label">Valid Rows</div>
            </div>
            <div className="stat-card" style={{ borderColor: 'rgba(239,68,68,0.2)' }}>
              <div className="stat-value" style={{ color: 'var(--danger)' }}>{preview.invalid_count}</div>
              <div className="stat-label">Invalid Rows</div>
            </div>
          </div>

          {preview.invalid_count > 0 && (
            <div className="card mb-6" style={{ borderColor: 'rgba(239,68,68,0.3)' }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--danger)', marginBottom: 16 }}>
                ⚠️ Found {preview.invalid_count} errors
              </h3>
              <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                <table style={{ width: '100%', fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th>Row</th>
                      <th>Register No</th>
                      <th>Errors</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.invalid_rows.map((row, idx) => (
                      <tr key={idx}>
                        <td>{row.row}</td>
                        <td>{row.data.register_no || '-'}</td>
                        <td style={{ color: 'var(--danger)' }}>
                          <ul style={{ margin: 0, paddingLeft: 16 }}>
                            {row.errors.map((e, i) => <li key={i}>{e}</li>)}
                          </ul>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {preview.valid_count > 0 && (
            <div className="card mb-6">
              <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 }}>
                ✅ Preview (First 10 valid rows)
              </h3>
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Register No</th>
                      <th>Name</th>
                      <th>Dept</th>
                      <th>Year</th>
                      <th>Sec</th>
                      <th>DOB (Password)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.valid_rows.map((row, idx) => (
                      <tr key={idx}>
                        <td>{row.data.register_no}</td>
                        <td>{row.data.name}</td>
                        <td>{row.data.department}</td>
                        <td>{row.data.year}</td>
                        <td>{row.data.section}</td>
                        <td style={{ color: 'var(--text-muted)' }}>{row.data.formatted_dob}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              {preview.invalid_count === 0 && (
                <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    className="btn btn-primary"
                    onClick={handleConfirmImport}
                    disabled={importMutation.isLoading}
                  >
                    {importMutation.isLoading ? <><span className="spinner" /> Importing...</> : 'Import Students'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

