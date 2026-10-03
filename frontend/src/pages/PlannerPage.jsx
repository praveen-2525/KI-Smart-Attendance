import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { attendanceApi } from '../services/api';

export default function PlannerPage() {
  const [targetPct, setTargetPct] = useState(75);
  const [whatIfData, setWhatIfData] = useState({ future_present: 0, future_od: 0, future_leave: 0, future_absent: 0 });
  const [whatIfResult, setWhatIfResult] = useState(null);
  const [selectedSubject, setSelectedSubject] = useState(null);

  const { data: plannerData, isLoading } = useQuery({
    queryKey: ['planner', targetPct],
    queryFn: () => attendanceApi.getPlanner(targetPct),
    select: (res) => res.data,
  });

  const whatIfMutation = useMutation({
    mutationFn: (data) => attendanceApi.whatIf(data, selectedSubject || undefined),
    onSuccess: (res) => setWhatIfResult(res.data),
  });

  const overall = plannerData?.overall || {};
  const subjects = plannerData?.subjects || [];

  if (isLoading) return (
    <div className="page-content" style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
      <div className="spinner" style={{ width: 40, height: 40, borderWidth: 3 }} />
    </div>
  );

  return (
    <div className="page-content animate-fade-in">
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)' }}>🎯 Smart Attendance Planner</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
          Calculate exactly how many classes you need to attend or can afford to miss.
        </p>
      </div>

      {/* Target slider */}
      <div className="card mb-6">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Target Attendance</span>
          <span style={{ fontSize: 24, fontWeight: 800, color: 'var(--secondary)' }}>{targetPct}%</span>
        </div>
        <input
          type="range"
          min={50} max={100} step={5}
          value={targetPct}
          onChange={(e) => setTargetPct(Number(e.target.value))}
          style={{ width: '100%', accentColor: 'var(--primary-500)' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
          <span>50%</span>
          <span>75% (Standard)</span>
          <span>100%</span>
        </div>
      </div>

      {/* Overall planner */}
      <div className="grid-2 mb-6">
        <div className="planner-card">
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>Current Overall</div>
            <div className="planner-value">{overall.current_percentage || 0}%</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
              {overall.current_credited || 0} credited / {overall.current_total || 0} eligible hours
            </div>
          </div>

          {overall.already_at_target ? (
            <div style={{
              background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)',
              borderRadius: 12, padding: 16
            }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>✅</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--success)' }}>
                You're above {targetPct}%!
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
                You can miss up to{' '}
                <span style={{ color: 'var(--success)', fontWeight: 700 }}>{overall.classes_can_miss}</span>
                {' '}more classes while staying at {targetPct}%.
              </div>
            </div>
          ) : (
            <div style={{
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 12, padding: 16
            }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>⚠️</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--danger)' }}>
                Below {targetPct}% Target
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
                You need{' '}
                <span style={{ color: 'var(--danger)', fontWeight: 700, fontSize: 18 }}>{overall.classes_needed}</span>
                {' '}more consecutive credited classes to reach {targetPct}%.
              </div>
            </div>
          )}

          <div style={{ marginTop: 16, fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic' }}>
            {overall.message}
          </div>
        </div>

        {/* What-If Simulator */}
        <div className="card">
          <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>🔮 What-If Simulator</h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
            Simulate future attendance scenarios
          </p>

          {/* Subject selector */}
          <div className="form-group">
            <label className="form-label">For Subject (optional)</label>
            <select
              className="form-select"
              value={selectedSubject || ''}
              onChange={(e) => setSelectedSubject(e.target.value || null)}
            >
              <option value="">Overall</option>
              {subjects.map((s) => (
                <option key={s.subject_id} value={s.subject_id}>{s.subject_name}</option>
              ))}
            </select>
          </div>

          <div className="grid-2">
            {[
              { key: 'future_present', label: 'Present', icon: '✅', color: 'var(--success)' },
              { key: 'future_od', label: 'OD', icon: '🎫', color: 'var(--secondary)' },
              { key: 'future_leave', label: 'Leave', icon: '📋', color: 'var(--warning)' },
              { key: 'future_absent', label: 'Absent', icon: '❌', color: 'var(--danger)' },
            ].map(({ key, label, icon, color }) => (
              <div key={key} className="form-group">
                <label className="form-label">{icon} {label} classes</label>
                <input
                  type="number"
                  className="form-input"
                  min={0}
                  value={whatIfData[key]}
                  onChange={(e) => setWhatIfData(d => ({ ...d, [key]: Number(e.target.value) }))}
                />
              </div>
            ))}
          </div>

          <button
            className="btn btn-primary w-full"
            onClick={() => whatIfMutation.mutate({ ...whatIfData, target_percentage: targetPct })}
            disabled={whatIfMutation.isLoading}
          >
            {whatIfMutation.isLoading ? <><span className="spinner" /> Calculating...</> : '→ Simulate'}
          </button>

          {whatIfResult && (
            <div style={{
              marginTop: 16, padding: 16,
              background: whatIfResult.reaches_target ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
              borderRadius: 12,
              border: `1px solid ${whatIfResult.reaches_target ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Current</span>
                <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {whatIfResult.original_percentage}%
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>After simulation</span>
                <span style={{
                  fontSize: 20, fontWeight: 800,
                  color: whatIfResult.reaches_target ? 'var(--success)' : 'var(--danger)'
                }}>
                  {whatIfResult.new_percentage}%
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Change</span>
                <span style={{
                  fontSize: 14, fontWeight: 700,
                  color: whatIfResult.percentage_change >= 0 ? 'var(--success)' : 'var(--danger)'
                }}>
                  {whatIfResult.percentage_change >= 0 ? '+' : ''}{whatIfResult.percentage_change}%
                </span>
              </div>
              <div style={{
                marginTop: 12, padding: '8px 12px', borderRadius: 8,
                background: whatIfResult.reaches_target ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                fontSize: 13, fontWeight: 600,
                color: whatIfResult.reaches_target ? 'var(--success)' : 'var(--danger)'
              }}>
                {whatIfResult.reaches_target ? '✅ Reaches target!' : `❌ Still below ${whatIfResult.target_percentage}%`}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Subject-wise planner */}
      <div className="card">
        <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 }}>
          Subject-wise Planning
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {subjects.map((s) => (
            <div key={s.subject_id} style={{
              background: 'var(--bg-body)',
              border: '1px solid var(--border)',
              borderRadius: 12, padding: 16
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{s.subject_name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{s.subject_code}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{
                    fontSize: 22, fontWeight: 800,
                    color: s.current_percentage >= 85 ? 'var(--success)' : s.current_percentage >= 75 ? 'var(--warning)' : 'var(--danger)'
                  }}>
                    {s.current_percentage}%
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {s.current_credited}/{s.current_total} hrs
                  </div>
                </div>
              </div>

              <div className="progress-bar" style={{ marginTop: 10 }}>
                <div
                  className={`progress-fill progress-${s.current_percentage >= 85 ? 'success' : s.current_percentage >= 75 ? 'warning' : 'danger'}`}
                  style={{ width: `${s.current_percentage}%` }}
                />
              </div>

              <div style={{ marginTop: 12, display: 'flex', gap: 10 }}>
                {s.already_at_target ? (
                  <div style={{
                    flex: 1, background: 'rgba(16,185,129,0.08)', borderRadius: 8,
                    padding: '8px 12px', fontSize: 12, color: 'var(--success)'
                  }}>
                    ✅ Above {targetPct}% — Can miss <strong>{s.classes_can_miss}</strong> more classes
                  </div>
                ) : (
                  <div style={{
                    flex: 1, background: 'rgba(239,68,68,0.08)', borderRadius: 8,
                    padding: '8px 12px', fontSize: 12, color: 'var(--danger)'
                  }}>
                    ⚠️ Need <strong>{s.classes_needed}</strong> more credited classes to reach {targetPct}%
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


