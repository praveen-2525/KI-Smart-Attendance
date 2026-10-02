import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { attendanceApi } from '../services/api';
import { format, subMonths, addMonths } from 'date-fns';

const STATUS_STYLES = {
  PR: { bg: 'rgba(16,185,129,0.15)', color: '#10b981', label: 'Present' },
  AB: { bg: 'rgba(239,68,68,0.15)', color: '#ef4444', label: 'Absent' },
  OD: { bg: 'rgba(99,102,241,0.15)', color: '#818cf8', label: 'On Duty' },
  LE: { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b', label: 'Leave' },
  ML: { bg: 'rgba(139,92,246,0.15)', color: '#a78bfa', label: 'Medical Leave' },
  '-': { bg: 'rgba(255,255,255,0.03)', color: 'var(--gray-600)', label: 'Not Marked' },
};

function AttendanceCalendar({ year, month }) {
  const [selectedDate, setSelectedDate] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['attendance-calendar', year, month],
    queryFn: () => attendanceApi.getCalendar(year, month),
    select: (res) => res.data,
  });

  if (isLoading) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--gray-500)' }}>Loading calendar...</div>;

  const calendar = data?.calendar || {};
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDay = new Date(year, month - 1, 1).getDay();

  const getDayStatus = (day) => {
    const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const records = calendar[dateStr];
    if (!records || records.length === 0) return null;
    const statuses = [...new Set(records.map(r => r.status))].filter(s => s !== '-');
    if (statuses.length === 0) return '-';
    if (statuses.length === 1) return statuses[0];
    return 'mixed';
  };

  const cells = [];
  // Empty cells for first day
  for (let i = 0; i < firstDay; i++) {
    cells.push(<div key={`empty-${i}`} />);
  }

  const today = new Date();
  for (let day = 1; day <= daysInMonth; day++) {
    const status = getDayStatus(day);
    const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const isToday = today.getFullYear() === year && today.getMonth() + 1 === month && today.getDate() === day;
    const isSelected = selectedDate === dateStr;

    let cellClass = 'calendar-cell';
    if (status) cellClass += ` ${status.toLowerCase()}`;
    else cellClass += ' empty';
    if (isToday) cellClass += ' today';

    cells.push(
      <div
        key={day}
        className={cellClass}
        onClick={() => setSelectedDate(isSelected ? null : dateStr)}
        style={{
          outline: isSelected ? '2px solid var(--primary-400)' : 'none',
          minHeight: 36
        }}
      >
        <span style={{ fontSize: 13, fontWeight: isToday ? 700 : 500 }}>{day}</span>
        {status && status !== '-' && (
          <span style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase' }}>
            {status === 'mixed' ? 'MIX' : status}
          </span>
        )}
      </div>
    );
  }

  const selectedRecords = selectedDate ? (calendar[selectedDate] || []) : [];

  return (
    <div>
      {/* Calendar grid */}
      <div className="calendar-grid" style={{ gap: 6 }}>
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
          <div key={d} className="calendar-day-header">{d}</div>
        ))}
        {cells}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, marginTop: 16, flexWrap: 'wrap' }}>
        {Object.entries(STATUS_STYLES).filter(([k]) => k !== '-').map(([status, style]) => (
          <div key={status} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{
              width: 14, height: 14, borderRadius: 4,
              background: style.bg, border: `1px solid ${style.color}40`
            }} />
            <span style={{ fontSize: 12, color: 'var(--gray-500)' }}>{status} - {style.label}</span>
          </div>
        ))}
      </div>

      {/* Selected date detail */}
      {selectedDate && (
        <div style={{
          marginTop: 20, background: 'var(--surface-dark-3)',
          border: '1px solid var(--border-dark)', borderRadius: 12, padding: 16
        }}>
          <div style={{ fontWeight: 700, color: '#e2e8f0', marginBottom: 12 }}>
            📅 {new Date(selectedDate).toLocaleDateString('en-IN', {
              weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
            })}
          </div>
          {selectedRecords.length === 0 ? (
            <div style={{ color: 'var(--gray-500)', fontSize: 13 }}>No attendance records for this date</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {selectedRecords.map((r, idx) => {
                const style = STATUS_STYLES[r.status] || STATUS_STYLES['-'];
                return (
                  <div key={idx} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    background: style.bg, borderRadius: 8, padding: '8px 12px'
                  }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: 8,
                      background: `${style.color}20`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 700, color: style.color, fontSize: 12
                    }}>
                      P{r.period_number}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>{r.subject_name}</div>
                      {r.faculty_name && <div style={{ fontSize: 11, color: 'var(--gray-500)' }}>{r.faculty_name}</div>}
                      {r.start_time && <div style={{ fontSize: 11, color: 'var(--gray-600)' }}>{r.start_time?.slice(0,5)} - {r.end_time?.slice(0,5)}</div>}
                    </div>
                    <span className={`badge badge-${r.status?.toLowerCase()}`}>{r.status}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SubjectDetail({ subjects }) {
  const [selected, setSelected] = useState(null);

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {subjects.map((s) => (
          <div
            key={s.subject_id}
            className="subject-card"
            style={{ cursor: 'pointer' }}
            onClick={() => setSelected(selected?.subject_id === s.subject_id ? null : s)}
          >
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div className="subject-name">{s.subject_name}</div>
                  <div className="subject-code">{s.subject_code}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{
                    fontSize: 24, fontWeight: 800,
                    color: s.percentage >= 85 ? 'var(--success)' : s.percentage >= 75 ? 'var(--warning)' : 'var(--danger)'
                  }}>
                    {s.percentage}%
                  </div>
                  {s.is_below_target && <div style={{ fontSize: 10, color: 'var(--danger)' }}>⚠ Below 75%</div>}
                </div>
              </div>
              <div className="progress-bar" style={{ marginTop: 8 }}>
                <div
                  className={`progress-fill progress-${s.percentage >= 85 ? 'success' : s.percentage >= 75 ? 'warning' : 'danger'}`}
                  style={{ width: `${s.percentage}%` }}
                />
              </div>
            </div>

            {/* Expanded detail */}
            {selected?.subject_id === s.subject_id && (
              <div style={{ width: '100%', marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 8 }}>
                {[
                  { label: 'Total', value: s.total_hours, color: 'var(--gray-400)' },
                  { label: 'Present', value: s.pr_hours, color: 'var(--success)' },
                  { label: 'OD', value: s.od_hours, color: 'var(--primary-400)' },
                  { label: 'Leave', value: s.le_hours, color: 'var(--warning)' },
                  { label: 'Absent', value: s.ab_hours, color: 'var(--danger)' },
                ].map((item) => (
                  <div key={item.label} style={{
                    background: 'var(--surface-dark-4)', borderRadius: 8,
                    padding: '8px', textAlign: 'center'
                  }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: item.color }}>{item.value}</div>
                    <div style={{ fontSize: 10, color: 'var(--gray-600)', marginTop: 2 }}>{item.label}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AttendancePage() {
  const [tab, setTab] = useState('overview');
  const [calMonth, setCalMonth] = useState(new Date());
  const [historyFilters, setHistoryFilters] = useState({});

  const { data: attData, isLoading } = useQuery({
    queryKey: ['my-attendance'],
    queryFn: () => attendanceApi.getMy(),
    select: (res) => res.data,
  });

  const { data: historyData } = useQuery({
    queryKey: ['attendance-history', historyFilters],
    queryFn: () => attendanceApi.getHistory(historyFilters),
    enabled: tab === 'history',
    select: (res) => res.data,
  });

  const overall = attData?.overall || {};
  const subjects = attData?.subjects || [];

  const tabs = [
    { id: 'overview', label: '📊 Overview' },
    { id: 'calendar', label: '📅 Calendar' },
    { id: 'history', label: '📋 History' },
  ];

  return (
    <div className="page-content animate-fade-in">
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: '#e2e8f0' }}>My Attendance</h2>
        <p style={{ color: 'var(--gray-500)', fontSize: 14 }}>
          Attendance formula: (PR + OD) / Total × 100 — as per ERP configuration
        </p>
      </div>

      {/* Overall summary card */}
      <div className="card mb-6" style={{
        background: 'linear-gradient(135deg, rgba(99,102,241,0.1) 0%, rgba(139,92,246,0.05) 100%)',
        border: '1px solid rgba(99,102,241,0.2)'
      }}>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
          {[
            { label: 'Total Hours', value: overall.total_hours || 0, color: 'var(--gray-300)' },
            { label: 'Present (PR)', value: overall.pr_hours || 0, color: 'var(--success)' },
            { label: 'On Duty (OD)', value: overall.od_hours || 0, color: 'var(--primary-400)' },
            { label: 'Absent (AB)', value: overall.ab_hours || 0, color: 'var(--danger)' },
            { label: 'Leave (LE)', value: overall.le_hours || 0, color: 'var(--warning)' },
            { label: 'Credited', value: overall.credited_hours || 0, color: 'var(--primary-300)' },
          ].map((item) => (
            <div key={item.label} style={{ textAlign: 'center', flex: '1 1 80px' }}>
              <div style={{ fontSize: 26, fontWeight: 800, color: item.color }}>{item.value}</div>
              <div style={{ fontSize: 11, color: 'var(--gray-500)' }}>{item.label}</div>
            </div>
          ))}
          <div style={{
            marginLeft: 'auto', textAlign: 'center',
            background: 'rgba(99,102,241,0.15)',
            borderRadius: 16, padding: '16px 24px',
            border: '1px solid rgba(99,102,241,0.3)'
          }}>
            <div style={{
              fontSize: 36, fontWeight: 900,
              color: overall.percentage >= 85 ? 'var(--success)' : overall.percentage >= 75 ? 'var(--warning)' : 'var(--danger)'
            }}>
              {overall.percentage || 0}%
            </div>
            <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>Overall Attendance</div>
            {overall.is_below_target && (
              <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 4 }}>⚠ Below {overall.target_percentage}%</div>
            )}
          </div>
        </div>
      </div>

      {/* Tab navigation */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: 'var(--surface-dark-3)', borderRadius: 10, padding: 4, width: 'fit-content' }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`btn btn-sm ${tab === t.id ? 'btn-primary' : 'btn-ghost'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'overview' && (
        <div className="card">
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0', marginBottom: 16 }}>
            Subject-wise Attendance
          </h3>
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
          ) : (
            <SubjectDetail subjects={subjects} />
          )}
        </div>
      )}

      {tab === 'calendar' && (
        <div className="card">
          {/* Month navigation */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setCalMonth(subMonths(calMonth, 1))}
            >
              ← Prev
            </button>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0' }}>
              {format(calMonth, 'MMMM yyyy')}
            </h3>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setCalMonth(addMonths(calMonth, 1))}
              disabled={calMonth >= new Date()}
            >
              Next →
            </button>
          </div>
          <AttendanceCalendar year={calMonth.getFullYear()} month={calMonth.getMonth() + 1} />
        </div>
      )}

      {tab === 'history' && (
        <div className="card">
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            <select
              className="form-select"
              style={{ width: 'auto' }}
              onChange={(e) => setHistoryFilters(f => ({ ...f, status: e.target.value || undefined }))}
            >
              <option value="">All Status</option>
              <option value="PR">Present</option>
              <option value="AB">Absent</option>
              <option value="OD">On Duty</option>
              <option value="LE">Leave</option>
            </select>
            <input
              type="date"
              className="form-input"
              style={{ width: 'auto' }}
              onChange={(e) => setHistoryFilters(f => ({ ...f, from_date: e.target.value || undefined }))}
              placeholder="From Date"
            />
            <input
              type="date"
              className="form-input"
              style={{ width: 'auto' }}
              onChange={(e) => setHistoryFilters(f => ({ ...f, to_date: e.target.value || undefined }))}
              placeholder="To Date"
            />
          </div>

          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Period</th>
                  <th>Subject</th>
                  <th>Faculty</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {historyData?.records?.map((r) => {
                  const style = STATUS_STYLES[r.status] || STATUS_STYLES['-'];
                  return (
                    <tr key={r.id}>
                      <td>{r.date && new Date(r.date).toLocaleDateString('en-IN')}</td>
                      <td>P{r.period_number}</td>
                      <td>
                        <div style={{ fontWeight: 600, color: '#e2e8f0' }}>{r.subject_name}</div>
                        <div style={{ fontSize: 11, color: 'var(--gray-500)' }}>{r.subject_code}</div>
                      </td>
                      <td style={{ color: 'var(--gray-400)', fontSize: 13 }}>{r.faculty_name || '-'}</td>
                      <td>
                        <span className={`badge badge-${r.status?.toLowerCase()}`}>{r.status}</span>
                      </td>
                    </tr>
                  );
                })}
                {!historyData?.records?.length && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', color: 'var(--gray-600)', padding: 40 }}>
                      No records found
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
