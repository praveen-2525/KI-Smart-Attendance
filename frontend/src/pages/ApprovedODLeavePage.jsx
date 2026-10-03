import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { odApi, leaveApi } from "../services/api";
import { useAuth } from "../contexts/AuthContext";

function getTodayStr() {
  return new Date().toISOString().split("T")[0];
}

function formatDate(dateStr) {
  if (!dateStr) return "-";
  try {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return dateStr;
  }
}

export default function ApprovedODLeavePage() {
  const { user } = useAuth();
  const role = user?.role || "";

  const [selectedDate, setSelectedDate] = useState(getTodayStr());
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [useDateRange, setUseDateRange] = useState(false);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterYear, setFilterYear] = useState("");
  const [filterSection, setFilterSection] = useState("");
  const [filterDept, setFilterDept] = useState("");
  const [odPage, setOdPage] = useState(1);
  const [leavePage, setLeavePage] = useState(1);

  const isHOD = role === "hod";
  const isDEO = role === "deo";
  const showExtendedCols = isHOD || isDEO;

  const buildParams = useCallback((pageNum) => {
    const params = { page: pageNum, limit: 50 };
    if (useDateRange && fromDate && toDate) {
      params.fromDate = fromDate;
      params.toDate = toDate;
    } else {
      params.date = selectedDate;
    }
    if (search) params.search = search;
    if (filterYear) params.year = filterYear;
    if (filterSection) params.section = filterSection;
    if (filterDept) params.department = filterDept;
    return params;
  }, [selectedDate, fromDate, toDate, useDateRange, search, filterYear, filterSection, filterDept]);

  const showOD = filterType === "all" || filterType === "OD";
  const showLeave = filterType === "all" || filterType === "Leave";

  const { data: odData, isLoading: loadingOD } = useQuery({
    queryKey: ["approved-od", selectedDate, fromDate, toDate, useDateRange, search, filterYear, filterSection, filterDept, odPage, showOD],
    queryFn: () => odApi.getApproved(buildParams(odPage)),
    enabled: showOD,
    select: (res) => res.data,
    staleTime: 30000,
  });

  const { data: leaveData, isLoading: loadingLeave } = useQuery({
    queryKey: ["approved-leave", selectedDate, fromDate, toDate, useDateRange, search, filterYear, filterSection, filterDept, leavePage, showLeave],
    queryFn: () => leaveApi.getApproved(buildParams(leavePage)),
    enabled: showLeave,
    select: (res) => res.data,
    staleTime: 30000,
  });

  const isLoading = (showOD && loadingOD) || (showLeave && loadingLeave);

  const odRecords = (odData?.records || []).map((r) => ({ ...r, _type: "OD" }));
  const leaveRecords = (leaveData?.records || []).map((r) => ({ ...r, _type: "Leave" }));

  const allRecords =
    filterType === "OD"
      ? odRecords
      : filterType === "Leave"
      ? leaveRecords
      : [...odRecords, ...leaveRecords].sort((a, b) =>
          (a.studentName || "").localeCompare(b.studentName || "")
        );

  const totalOD = odData?.total || 0;
  const totalLeave = leaveData?.total || 0;
  const totalAll =
    filterType === "OD" ? totalOD : filterType === "Leave" ? totalLeave : totalOD + totalLeave;

  const handleTodayClick = () => {
    setSelectedDate(getTodayStr());
    setUseDateRange(false);
    setFromDate("");
    setToDate("");
    setOdPage(1);
    setLeavePage(1);
  };

  const handleSearch = (e) => {
    setSearch(e.target.value);
    setOdPage(1);
    setLeavePage(1);
  };

  const handleFilterType = (type) => {
    setFilterType(type);
    setOdPage(1);
    setLeavePage(1);
  };

  const displayDate =
    useDateRange && fromDate && toDate
      ? `${formatDate(fromDate)} - ${formatDate(toDate)}`
      : formatDate(selectedDate);

  return (
    <div className="page-content animate-fade-in">
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: "#e2e8f0" }}>
          Approved OD &amp; Leave
        </h2>
        <p style={{ color: "var(--gray-500)", fontSize: 14, marginTop: 4 }}>
          Showing approved students for:{" "}
          <strong style={{ color: "var(--primary-400)" }}>{displayDate}</strong>{" "}
          &bull; {totalAll} student{totalAll !== 1 ? "s" : ""} affected
        </p>
      </div>

      {/* Controls */}
      <div className="card" style={{ marginBottom: 20, padding: "16px 20px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
          {/* Date Mode */}
          <div>
            <label style={{ fontSize: 11, color: "var(--gray-500)", display: "block", marginBottom: 4, fontWeight: 600 }}>DATE MODE</label>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                className={`btn ${!useDateRange ? "btn-primary" : "btn-secondary"}`}
                style={{ fontSize: 12, padding: "5px 12px" }}
                onClick={() => { setUseDateRange(false); setOdPage(1); setLeavePage(1); }}
              >Single Date</button>
              <button
                className={`btn ${useDateRange ? "btn-primary" : "btn-secondary"}`}
                style={{ fontSize: 12, padding: "5px 12px" }}
                onClick={() => { setUseDateRange(true); setOdPage(1); setLeavePage(1); }}
              >Date Range</button>
            </div>
          </div>

          {/* Date Inputs */}
          {!useDateRange ? (
            <div>
              <label style={{ fontSize: 11, color: "var(--gray-500)", display: "block", marginBottom: 4, fontWeight: 600 }}>SELECT DATE</label>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => { setSelectedDate(e.target.value); setOdPage(1); setLeavePage(1); }}
                  className="form-input"
                  style={{ padding: "6px 10px", fontSize: 13 }}
                />
                <button className="btn btn-secondary" style={{ fontSize: 12, padding: "5px 12px" }} onClick={handleTodayClick}>Today</button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
              <div>
                <label style={{ fontSize: 11, color: "var(--gray-500)", display: "block", marginBottom: 4, fontWeight: 600 }}>FROM</label>
                <input type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setOdPage(1); setLeavePage(1); }} className="form-input" style={{ padding: "6px 10px", fontSize: 13 }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: "var(--gray-500)", display: "block", marginBottom: 4, fontWeight: 600 }}>TO</label>
                <input type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); setOdPage(1); setLeavePage(1); }} className="form-input" style={{ padding: "6px 10px", fontSize: 13 }} />
              </div>
              <button className="btn btn-secondary" style={{ fontSize: 12, padding: "5px 12px" }} onClick={handleTodayClick}>Reset</button>
            </div>
          )}

          {/* Type Filter */}
          <div>
            <label style={{ fontSize: 11, color: "var(--gray-500)", display: "block", marginBottom: 4, fontWeight: 600 }}>TYPE</label>
            <div style={{ display: "flex", gap: 6 }}>
              {["all", "OD", "Leave"].map((t) => (
                <button
                  key={t}
                  className={`btn ${filterType === t ? "btn-primary" : "btn-secondary"}`}
                  style={{ fontSize: 12, padding: "5px 12px" }}
                  onClick={() => handleFilterType(t)}
                >{t === "all" ? "All" : t}</button>
              ))}
            </div>
          </div>

          {/* Search */}
          <div style={{ flex: 1, minWidth: 180 }}>
            <label style={{ fontSize: 11, color: "var(--gray-500)", display: "block", marginBottom: 4, fontWeight: 600 }}>SEARCH</label>
            <input
              type="text"
              placeholder="Name / Reg No / Roll No"
              value={search}
              onChange={handleSearch}
              className="form-input"
              style={{ padding: "6px 10px", fontSize: 13, width: "100%" }}
            />
          </div>

          {/* Extended Filters */}
          {showExtendedCols && (
            <>
              <div>
                <label style={{ fontSize: 11, color: "var(--gray-500)", display: "block", marginBottom: 4, fontWeight: 600 }}>YEAR</label>
                <select value={filterYear} onChange={(e) => { setFilterYear(e.target.value); setOdPage(1); setLeavePage(1); }} className="form-input" style={{ padding: "6px 10px", fontSize: 13 }}>
                  <option value="">All Years</option>
                  <option>I Year</option>
                  <option>II Year</option>
                  <option>III Year</option>
                  <option>IV Year</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: "var(--gray-500)", display: "block", marginBottom: 4, fontWeight: 600 }}>SECTION</label>
                <select value={filterSection} onChange={(e) => { setFilterSection(e.target.value); setOdPage(1); setLeavePage(1); }} className="form-input" style={{ padding: "6px 10px", fontSize: 13 }}>
                  <option value="">All Sections</option>
                  <option>AIML</option>
                  <option>A</option>
                  <option>B</option>
                  <option>C</option>
                </select>
              </div>
            </>
          )}
          {isDEO && (
            <div>
              <label style={{ fontSize: 11, color: "var(--gray-500)", display: "block", marginBottom: 4, fontWeight: 600 }}>DEPARTMENT</label>
              <input
                type="text"
                placeholder="e.g. CSE(AI&ML)"
                value={filterDept}
                onChange={(e) => { setFilterDept(e.target.value); setOdPage(1); setLeavePage(1); }}
                className="form-input"
                style={{ padding: "6px 10px", fontSize: 13 }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Summary Badges */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <div style={{ background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)", borderRadius: 10, padding: "10px 16px", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 20 }}>🎫</span>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "var(--primary-400)" }}>{totalOD}</div>
            <div style={{ fontSize: 11, color: "var(--gray-500)" }}>Approved OD</div>
          </div>
        </div>
        <div style={{ background: "rgba(6,182,212,0.15)", border: "1px solid rgba(6,182,212,0.3)", borderRadius: 10, padding: "10px 16px", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 20 }}>📋</span>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "var(--info)" }}>{totalLeave}</div>
            <div style={{ fontSize: 11, color: "var(--gray-500)" }}>Approved Leave</div>
          </div>
        </div>
        <div style={{ background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: 10, padding: "10px 16px", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 20 }}>✅</span>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "var(--success)" }}>{totalAll}</div>
            <div style={{ fontSize: 11, color: "var(--gray-500)" }}>Total</div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {isLoading ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--gray-500)" }}>
            <div className="spinner" style={{ width: 28, height: 28, margin: "0 auto 12px" }} />
            Loading approved records...
          </div>
        ) : allRecords.length === 0 ? (
          <div style={{ padding: 60, textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#e2e8f0", marginBottom: 6 }}>
              No approved OD or Leave students
            </div>
            <div style={{ fontSize: 13, color: "var(--gray-500)" }}>
              No approved OD or Leave students for {displayDate}.
            </div>
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Roll No</th>
                  <th>Register No</th>
                  <th>Student Name</th>
                  {showExtendedCols && <th>Year</th>}
                  {showExtendedCols && <th>Section</th>}
                  {isDEO && <th>Department</th>}
                  <th>Type</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Details</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {allRecords.map((rec, idx) => {
                  const isOD = rec._type === "OD";
                  return (
                    <tr key={rec.id || idx}>
                      <td style={{ color: "var(--gray-500)", fontSize: 12 }}>{idx + 1}</td>
                      <td style={{ fontWeight: 600, color: "var(--primary-400)", fontSize: 13 }}>{rec.rollNumber || "-"}</td>
                      <td style={{ fontSize: 13, color: "#e2e8f0" }}>{rec.registerNumber || "-"}</td>
                      <td style={{ fontWeight: 600, color: "#e2e8f0" }}>{rec.studentName || "-"}</td>
                      {showExtendedCols && <td style={{ fontSize: 12, color: "var(--gray-400)" }}>{rec.year || "-"}</td>}
                      {showExtendedCols && <td style={{ fontSize: 12, color: "var(--gray-400)" }}>{rec.section || "-"}</td>}
                      {isDEO && <td style={{ fontSize: 12, color: "var(--gray-400)" }}>{rec.department || "-"}</td>}
                      <td>
                        <span style={{
                          display: "inline-flex", alignItems: "center", gap: 4,
                          padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 700,
                          background: isOD ? "rgba(99,102,241,0.2)" : "rgba(6,182,212,0.2)",
                          color: isOD ? "var(--primary-400)" : "var(--info)",
                          border: `1px solid ${isOD ? "rgba(99,102,241,0.4)" : "rgba(6,182,212,0.4)"}`,
                        }}>
                          {isOD ? "🎫" : "📋"} {rec._type}
                        </span>
                      </td>
                      <td style={{ fontSize: 13, color: "var(--gray-300)" }}>{formatDate(rec.fromDate)}</td>
                      <td style={{ fontSize: 13, color: "var(--gray-300)" }}>{formatDate(rec.toDate)}</td>
                      <td style={{ fontSize: 12, color: "var(--gray-500)", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {isOD ? (rec.eventName || rec.odType || "-") : (rec.leaveType || "-")}
                      </td>
                      <td>
                        <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: "rgba(16,185,129,0.2)", color: "var(--success)", border: "1px solid rgba(16,185,129,0.4)" }}>
                          Approved
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {(odData?.totalPages > 1 || leaveData?.totalPages > 1) && (
          <div style={{ padding: "12px 20px", borderTop: "1px solid var(--border-dark)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
            {(filterType === "all" || filterType === "OD") && odData?.totalPages > 1 && (
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "var(--gray-500)" }}>OD:</span>
                <button className="btn btn-secondary" style={{ fontSize: 12, padding: "3px 10px" }} disabled={odPage <= 1} onClick={() => setOdPage((p) => Math.max(1, p - 1))}>Prev</button>
                <span style={{ fontSize: 12, color: "var(--gray-400)" }}>{odPage} / {odData?.totalPages}</span>
                <button className="btn btn-secondary" style={{ fontSize: 12, padding: "3px 10px" }} disabled={odPage >= (odData?.totalPages || 1)} onClick={() => setOdPage((p) => p + 1)}>Next</button>
              </div>
            )}
            {(filterType === "all" || filterType === "Leave") && leaveData?.totalPages > 1 && (
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "var(--gray-500)" }}>Leave:</span>
                <button className="btn btn-secondary" style={{ fontSize: 12, padding: "3px 10px" }} disabled={leavePage <= 1} onClick={() => setLeavePage((p) => Math.max(1, p - 1))}>Prev</button>
                <span style={{ fontSize: 12, color: "var(--gray-400)" }}>{leavePage} / {leaveData?.totalPages}</span>
                <button className="btn btn-secondary" style={{ fontSize: 12, padding: "3px 10px" }} disabled={leavePage >= (leaveData?.totalPages || 1)} onClick={() => setLeavePage((p) => p + 1)}>Next</button>
              </div>
            )}
          </div>
        )}
      </div>

      {(role === "faculty" || role === "advisor") && (
        <div style={{ marginTop: 16, padding: "12px 16px", borderRadius: 10, background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", fontSize: 13, color: "var(--gray-400)" }}>
          <strong style={{ color: "var(--success)" }}>Attendance Integration:</strong>{" "}
          When marking attendance, students on approved OD or Leave for this date are automatically
          highlighted as <strong>OD - Approved</strong> or <strong>LEAVE - Approved</strong>.
        </div>
      )}
    </div>
  );
}

// Student view of their OWN approved OD and Leave
export function StudentApprovedODLeave() {
  const { user } = useAuth();
  const [filterType, setFilterType] = useState("all");

  const { data: odData, isLoading: loadingOD } = useQuery({
    queryKey: ["my-od", user?.login_id],
    queryFn: () => odApi.getMy(),
    select: (res) => res.data,
    enabled: !!user,
  });

  const { data: leaveData, isLoading: loadingLeave } = useQuery({
    queryKey: ["my-leave", user?.login_id],
    queryFn: () => leaveApi.getMy(),
    select: (res) => res.data,
    enabled: !!user,
  });

  const approvedOD = (odData?.requests || []).filter((r) => r.status === "Approved");
  const approvedLeave = (leaveData?.requests || []).filter((r) => r.status === "Approved");

  const allApproved =
    filterType === "OD"
      ? approvedOD.map((r) => ({ ...r, _type: "OD" }))
      : filterType === "Leave"
      ? approvedLeave.map((r) => ({ ...r, _type: "Leave" }))
      : [
          ...approvedOD.map((r) => ({ ...r, _type: "OD" })),
          ...approvedLeave.map((r) => ({ ...r, _type: "Leave" })),
        ].sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));

  const isLoading = loadingOD || loadingLeave;

  return (
    <div className="page-content animate-fade-in">
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: "#e2e8f0" }}>My Approved OD &amp; Leave</h2>
        <p style={{ color: "var(--gray-500)", fontSize: 14 }}>Your approved requests</p>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {[
          { key: "all", label: `All (${approvedOD.length + approvedLeave.length})` },
          { key: "OD", label: `OD (${approvedOD.length})` },
          { key: "Leave", label: `Leave (${approvedLeave.length})` },
        ].map((t) => (
          <button
            key={t.key}
            className={`btn ${filterType === t.key ? "btn-primary" : "btn-secondary"}`}
            style={{ fontSize: 13 }}
            onClick={() => setFilterType(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="card" style={{ textAlign: "center", padding: 40 }}>
          <div className="spinner" style={{ width: 28, height: 28, margin: "0 auto 12px" }} />
          Loading...
        </div>
      ) : allApproved.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 60 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#e2e8f0", marginBottom: 6 }}>No approved records</div>
          <div style={{ fontSize: 13, color: "var(--gray-500)" }}>Your approved OD and Leave requests will appear here.</div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Days</th>
                  <th>Details</th>
                  <th>Approved By</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {allApproved.map((rec, idx) => {
                  const isOD = rec._type === "OD";
                  return (
                    <tr key={rec.id || idx}>
                      <td>
                        <span style={{
                          display: "inline-flex", alignItems: "center", gap: 4,
                          padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 700,
                          background: isOD ? "rgba(99,102,241,0.2)" : "rgba(6,182,212,0.2)",
                          color: isOD ? "var(--primary-400)" : "var(--info)",
                        }}>
                          {isOD ? "🎫" : "📋"} {rec._type}
                        </span>
                      </td>
                      <td style={{ fontSize: 13 }}>{formatDate(rec.fromDate)}</td>
                      <td style={{ fontSize: 13 }}>{formatDate(rec.toDate)}</td>
                      <td style={{ fontSize: 13 }}>{rec.numberOfDays || 1}</td>
                      <td style={{ fontSize: 12, color: "var(--gray-400)" }}>
                        {isOD ? (rec.eventName || rec.odType || "-") : (rec.leaveType || (rec.reason && rec.reason.slice(0, 40)) || "-")}
                      </td>
                      <td style={{ fontSize: 12, color: "var(--gray-500)" }}>
                        {rec.approvedByRole || rec.approvedBy || "-"}
                      </td>
                      <td>
                        <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: "rgba(16,185,129,0.2)", color: "var(--success)" }}>
                          Approved
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
