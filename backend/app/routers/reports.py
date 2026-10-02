"""
Reports, QR, ERP Integration routers
"""
import io
import json
import qrcode
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.database import get_db
from app import models
from app.auth import get_current_user, require_roles
from app.attendance_engine import AttendanceEngine
from app.config import settings

# ============================================================
# REPORTS ROUTER
# ============================================================
reports_router = APIRouter(prefix="/reports", tags=["Reports"])


@reports_router.get("/student/{student_id}")
async def student_report(
    student_id: int,
    format: str = Query("json", enum=["json", "pdf", "excel"]),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Generate student attendance report."""
    # Access control
    if current_user.role == models.UserRole.STUDENT:
        student = current_user.student_profile
        if student.id != student_id:
            raise HTTPException(status_code=403, detail="Access denied")
    else:
        student = db.query(models.Student).filter(models.Student.id == student_id).first()

    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    engine = AttendanceEngine.from_settings(db)
    summary = engine.compute_overall_summary(db, student.id)

    report_data = {
        "student": {
            "name": student.user.full_name,
            "register_number": student.register_number,
            "department": student.department.name if student.department else None,
            "year": student.year,
            "semester": student.semester,
            "section": student.section.name if student.section else None
        },
        "generated_at": datetime.now().isoformat(),
        "overall": {
            "total_hours": summary.total_hours,
            "pr_hours": summary.pr_hours,
            "od_hours": summary.od_hours,
            "ab_hours": summary.ab_hours,
            "le_hours": summary.le_hours,
            "credited_hours": summary.credited_hours,
            "percentage": summary.percentage,
            "is_below_target": summary.is_below_target,
            "target_percentage": summary.target_percentage
        },
        "subjects": [
            {
                "subject_name": s.subject_name,
                "subject_code": s.subject_code,
                "total_hours": s.total_hours,
                "pr_hours": s.pr_hours,
                "od_hours": s.od_hours,
                "ab_hours": s.ab_hours,
                "le_hours": s.le_hours,
                "credited_hours": s.credited_hours,
                "percentage": s.percentage,
                "is_below_target": s.is_below_target
            } for s in summary.subjects
        ]
    }

    if format == "json":
        return report_data
    elif format == "excel":
        return _generate_excel_report(report_data, student.user.full_name)
    elif format == "pdf":
        return _generate_pdf_report(report_data, student.user.full_name)


@reports_router.get("/department/{dept_id}/attendance")
async def department_attendance_report(
    dept_id: int,
    year: Optional[int] = None,
    section_id: Optional[int] = None,
    current_user: models.User = Depends(require_roles(
        models.UserRole.HOD, models.UserRole.DEO, models.UserRole.ADVISOR
    )),
    db: Session = Depends(get_db)
):
    """Department-level attendance report for HOD."""
    students_query = db.query(models.Student).filter(
        models.Student.department_id == dept_id,
        models.Student.is_active == True
    )
    if year:
        students_query = students_query.filter(models.Student.year == year)
    if section_id:
        students_query = students_query.filter(models.Student.section_id == section_id)

    students = students_query.all()
    engine = AttendanceEngine.from_settings(db)

    shortage_list = []
    total_students = len(students)
    below_target = 0

    for student in students:
        summary = engine.compute_overall_summary(db, student.id)
        if summary.is_below_target:
            below_target += 1
            shortage_list.append({
                "student_id": student.id,
                "register_number": student.register_number,
                "name": student.user.full_name,
                "section": student.section.name if student.section else None,
                "percentage": summary.percentage,
                "credits_needed": max(0, engine.calculate_classes_needed(
                    summary.credited_hours, summary.eligible_hours
                ).classes_needed_to_reach_target)
            })

    return {
        "department_id": dept_id,
        "total_students": total_students,
        "below_target": below_target,
        "attendance_rate": round((total_students - below_target) / total_students * 100, 2) if total_students > 0 else 0,
        "shortage_list": sorted(shortage_list, key=lambda x: x["percentage"])
    }


@reports_router.get("/hod/overview")
async def hod_overview(
    current_user: models.User = Depends(require_roles(models.UserRole.HOD, models.UserRole.DEO)),
    db: Session = Depends(get_db)
):
    """HOD dashboard overview statistics."""
    faculty = current_user.faculty_profile
    dept_id = faculty.department_id if faculty else None

    query = db.query(models.Student).filter(models.Student.is_active == True)
    if dept_id:
        query = query.filter(models.Student.department_id == dept_id)

    total_students = query.count()

    pending_od = db.query(models.ODRequest).filter(
        models.ODRequest.status == models.ODStatus.SUBMITTED
    ).count()
    pending_leave = db.query(models.LeaveRequest).filter(
        models.LeaveRequest.status == models.LeaveStatus.SUBMITTED
    ).count()
    pending_corrections = db.query(models.AttendanceCorrection).filter(
        models.AttendanceCorrection.status == models.CorrectionStatus.PENDING
    ).count()
    pending_proof = db.query(models.ODRequest).filter(
        models.ODRequest.status == models.ODStatus.PROOF_SUBMITTED
    ).count()
    exceptions = db.query(models.AttendanceException).filter(
        models.AttendanceException.acknowledged == False
    ).count()

    return {
        "total_students": total_students,
        "pending_od_requests": pending_od,
        "pending_leave_requests": pending_leave,
        "pending_correction_requests": pending_corrections,
        "pending_proof_verification": pending_proof,
        "unacknowledged_exceptions": exceptions
    }


def _generate_excel_report(report_data: dict, student_name: str) -> StreamingResponse:
    """Generate Excel report."""
    try:
        import openpyxl
        from openpyxl.styles import Font, PatternFill, Alignment
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Attendance Report"

        # Header
        ws['A1'] = "KI Smart Attendance+ Report"
        ws['A1'].font = Font(bold=True, size=14)
        ws['A2'] = f"Student: {student_name}"
        ws['A3'] = f"Generated: {report_data['generated_at']}"

        # Overall
        ws['A5'] = "Overall Attendance"
        ws['A5'].font = Font(bold=True)
        overall = report_data['overall']
        ws['A6'] = f"Total Hours: {overall['total_hours']}"
        ws['A7'] = f"Present: {overall['pr_hours']}"
        ws['A8'] = f"OD: {overall['od_hours']}"
        ws['A9'] = f"Absent: {overall['ab_hours']}"
        ws['A10'] = f"Leave: {overall['le_hours']}"
        ws['A11'] = f"Credited: {overall['credited_hours']}"
        ws['A12'] = f"Percentage: {overall['percentage']}%"

        # Subjects header
        headers = ["Subject", "Code", "Total", "PR", "OD", "AB", "LE", "Credited", "%"]
        for i, h in enumerate(headers, 1):
            cell = ws.cell(row=14, column=i, value=h)
            cell.font = Font(bold=True)

        for row, subj in enumerate(report_data['subjects'], 15):
            ws.cell(row=row, column=1, value=subj['subject_name'])
            ws.cell(row=row, column=2, value=subj['subject_code'])
            ws.cell(row=row, column=3, value=subj['total_hours'])
            ws.cell(row=row, column=4, value=subj['pr_hours'])
            ws.cell(row=row, column=5, value=subj['od_hours'])
            ws.cell(row=row, column=6, value=subj['ab_hours'])
            ws.cell(row=row, column=7, value=subj['le_hours'])
            ws.cell(row=row, column=8, value=subj['credited_hours'])
            ws.cell(row=row, column=9, value=f"{subj['percentage']}%")

        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)
        return StreamingResponse(
            buf,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename=attendance_report_{student_name}.xlsx"}
        )
    except ImportError:
        raise HTTPException(status_code=500, detail="openpyxl not installed")


def _generate_pdf_report(report_data: dict, student_name: str) -> StreamingResponse:
    """Generate PDF report."""
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
        from reportlab.lib.styles import getSampleStyleSheet
        from reportlab.lib import colors

        buf = io.BytesIO()
        doc = SimpleDocTemplate(buf, pagesize=A4)
        styles = getSampleStyleSheet()
        story = []

        story.append(Paragraph("KI Smart Attendance+ Report", styles['Title']))
        story.append(Paragraph(f"Student: {student_name}", styles['Normal']))
        story.append(Paragraph(f"Generated: {report_data['generated_at']}", styles['Normal']))
        story.append(Spacer(1, 20))

        overall = report_data['overall']
        story.append(Paragraph("Overall Attendance", styles['Heading2']))
        overall_data = [
            ["Metric", "Value"],
            ["Total Hours", str(overall['total_hours'])],
            ["Present (PR)", str(overall['pr_hours'])],
            ["On Duty (OD)", str(overall['od_hours'])],
            ["Absent (AB)", str(overall['ab_hours'])],
            ["Leave (LE)", str(overall['le_hours'])],
            ["Credited", str(overall['credited_hours'])],
            ["Attendance %", f"{overall['percentage']}%"],
        ]
        t = Table(overall_data)
        t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#6366f1')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ]))
        story.append(t)
        story.append(Spacer(1, 20))

        story.append(Paragraph("Subject-wise Attendance", styles['Heading2']))
        subj_data = [["Subject", "Code", "Total", "PR", "OD", "AB", "LE", "Credited", "%"]]
        for s in report_data['subjects']:
            subj_data.append([
                s['subject_name'], s['subject_code'], s['total_hours'],
                s['pr_hours'], s['od_hours'], s['ab_hours'], s['le_hours'],
                s['credited_hours'], f"{s['percentage']}%"
            ])
        st = Table(subj_data)
        st.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#6366f1')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f8f7ff')]),
        ]))
        story.append(st)

        doc.build(story)
        buf.seek(0)
        return StreamingResponse(
            buf,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=attendance_report_{student_name}.pdf"}
        )
    except ImportError:
        raise HTTPException(status_code=500, detail="reportlab not installed")


# ============================================================
# QR ATTENDANCE ROUTER
# ============================================================
qr_router = APIRouter(prefix="/qr", tags=["QR Attendance"])


@qr_router.post("/generate")
async def generate_qr(
    timetable_id: int,
    section_id: int,
    subject_id: int,
    period_number: int,
    current_user: models.User = Depends(require_roles(
        models.UserRole.FACULTY, models.UserRole.ADVISOR, models.UserRole.HOD
    )),
    db: Session = Depends(get_db)
):
    """Generate QR code for attendance."""
    faculty = current_user.faculty_profile
    if not faculty:
        raise HTTPException(status_code=403, detail="Faculty profile not found")

    expiry_seconds = int(_get_setting(db, "qr.expiry_seconds", str(settings.QR_EXPIRY_SECONDS)))
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=expiry_seconds)

    token = str(uuid.uuid4())
    session = models.QRSession(
        faculty_id=faculty.id,
        timetable_id=timetable_id,
        section_id=section_id,
        subject_id=subject_id,
        date=date.today(),
        period_number=period_number,
        qr_token=token,
        expires_at=expires_at
    )
    db.add(session)
    db.commit()

    # Generate QR image
    qr_data = json.dumps({
        "token": token,
        "session_id": session.id,
        "subject_id": subject_id,
        "period": period_number,
        "date": str(date.today())
    })
    qr = qrcode.QRCode(version=1, box_size=10, border=4)
    qr.add_data(qr_data)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)

    return StreamingResponse(
        buf, media_type="image/png",
        headers={
            "X-QR-Session-ID": str(session.id),
            "X-QR-Token": token,
            "X-Expires-At": expires_at.isoformat()
        }
    )


@qr_router.post("/scan")
async def scan_qr(
    token: str,
    current_user: models.User = Depends(require_roles(models.UserRole.STUDENT)),
    db: Session = Depends(get_db)
):
    """Student scans QR code."""
    session = db.query(models.QRSession).filter(
        models.QRSession.qr_token == token,
        models.QRSession.is_active == True
    ).first()

    if not session:
        raise HTTPException(status_code=404, detail="Invalid QR code")
    if session.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        session.is_active = False
        db.commit()
        raise HTTPException(status_code=400, detail="QR code has expired")

    student = current_user.student_profile
    if student.section_id != session.section_id:
        raise HTTPException(status_code=403, detail="QR code is not for your section")

    # Record scan
    scan = models.QRScan(
        qr_session_id=session.id,
        student_id=student.id,
        is_valid=True
    )
    db.add(scan)
    db.commit()

    return {
        "message": "QR scanned successfully. Awaiting faculty confirmation.",
        "scan_id": scan.id,
        "scanned_at": scan.scanned_at,
        "note": "QR scan creates attendance evidence only. Faculty must confirm final PR status."
    }


@qr_router.post("/{session_id}/confirm")
async def confirm_qr_attendance(
    session_id: int,
    student_ids: List[int],
    current_user: models.User = Depends(require_roles(
        models.UserRole.FACULTY, models.UserRole.ADVISOR, models.UserRole.HOD
    )),
    db: Session = Depends(get_db)
):
    """Faculty confirms QR-scanned students as present."""
    session = db.query(models.QRSession).filter(models.QRSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="QR session not found")

    confirmed = 0
    for student_id in student_ids:
        scan = db.query(models.QRScan).filter(
            models.QRScan.qr_session_id == session_id,
            models.QRScan.student_id == student_id
        ).first()
        if scan:
            scan.confirmed_present = True
            scan.confirmed_at = datetime.now(timezone.utc)

            # Mark PR
            existing = db.query(models.AttendanceRecord).filter(
                models.AttendanceRecord.student_id == student_id,
                models.AttendanceRecord.date == session.date,
                models.AttendanceRecord.period_number == session.period_number,
                models.AttendanceRecord.subject_id == session.subject_id
            ).first()

            faculty = current_user.faculty_profile
            if existing:
                existing.status = models.AttendanceStatus.PR
            else:
                rec = models.AttendanceRecord(
                    student_id=student_id,
                    subject_id=session.subject_id,
                    marked_by_faculty_id=faculty.id if faculty else None,
                    date=session.date,
                    period_number=session.period_number,
                    status=models.AttendanceStatus.PR
                )
                db.add(rec)
            confirmed += 1

    db.commit()
    return {"message": f"Confirmed {confirmed} students as present"}


# ============================================================
# ERP INTEGRATION ROUTER
# ============================================================
erp_router = APIRouter(prefix="/erp", tags=["ERP Integration"])


@erp_router.get("/status")
async def erp_sync_status(
    current_user: models.User = Depends(require_roles(models.UserRole.DEO, models.UserRole.HOD)),
    db: Session = Depends(get_db)
):
    """Get ERP sync status."""
    last_sync = db.query(models.ERPSyncLog).order_by(
        models.ERPSyncLog.started_at.desc()
    ).first()

    return {
        "integration_note": "Connect to your ERP via authorized API or approved CSV/Excel import. No unauthorized access is performed.",
        "last_sync": {
            "started_at": last_sync.started_at if last_sync else None,
            "completed_at": last_sync.completed_at if last_sync else None,
            "status": last_sync.status if last_sync else "never_synced",
            "records_imported": last_sync.records_imported if last_sync else 0,
            "records_updated": last_sync.records_updated if last_sync else 0,
            "records_failed": last_sync.records_failed if last_sync else 0,
            "sync_method": last_sync.sync_method if last_sync else None
        } if last_sync else None,
        "supported_methods": ["authorized_api", "csv_import", "excel_import"],
        "security_note": "All imports require DEO/HOD authorization. No ERP credentials are stored."
    }


@erp_router.post("/import/csv")
async def import_attendance_csv(
    file: UploadFile = File(...),
    sync_type: str = Query("attendance", enum=["attendance", "students", "subjects"]),
    current_user: models.User = Depends(require_roles(models.UserRole.DEO)),
    db: Session = Depends(get_db)
):
    """Import attendance data from authorized CSV export."""
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Only CSV files are accepted")

    content = await file.read()
    sync_log = models.ERPSyncLog(
        sync_method="csv",
        sync_type=sync_type,
        status="processing",
        file_name=file.filename,
        initiated_by=current_user.id
    )
    db.add(sync_log)
    db.flush()

    try:
        import csv, io as std_io
        reader = csv.DictReader(std_io.StringIO(content.decode('utf-8')))
        imported = 0
        failed = 0
        errors = []

        for row in reader:
            try:
                if sync_type == "attendance":
                    _process_attendance_row(db, row)
                    imported += 1
            except Exception as e:
                failed += 1
                errors.append({"row": dict(row), "error": str(e)})

        sync_log.status = "success" if failed == 0 else "partial"
        sync_log.records_imported = imported
        sync_log.records_failed = failed
        sync_log.error_details = errors[:20] if errors else None
        sync_log.completed_at = datetime.now(timezone.utc)

        db.commit()
        return {
            "message": "Import completed",
            "imported": imported,
            "failed": failed,
            "sync_id": sync_log.id
        }

    except Exception as e:
        sync_log.status = "failed"
        sync_log.error_details = {"error": str(e)}
        sync_log.completed_at = datetime.now(timezone.utc)
        db.commit()
        raise HTTPException(status_code=500, detail=f"Import failed: {str(e)}")


def _process_attendance_row(db: Session, row: dict):
    """Process a single attendance CSV row."""
    register_number = row.get("register_number", "").strip()
    subject_code = row.get("subject_code", "").strip()
    att_date = date.fromisoformat(row.get("date", ""))
    period = int(row.get("period", 1))
    status = row.get("status", "PR").upper()

    student = db.query(models.Student).filter(
        models.Student.register_number == register_number
    ).first()
    if not student:
        raise ValueError(f"Student {register_number} not found")

    subject = db.query(models.Subject).filter(
        models.Subject.code == subject_code
    ).first()
    if not subject:
        raise ValueError(f"Subject {subject_code} not found")

    existing = db.query(models.AttendanceRecord).filter(
        models.AttendanceRecord.student_id == student.id,
        models.AttendanceRecord.date == att_date,
        models.AttendanceRecord.period_number == period,
        models.AttendanceRecord.subject_id == subject.id
    ).first()

    if existing:
        existing.status = status
    else:
        rec = models.AttendanceRecord(
            student_id=student.id,
            subject_id=subject.id,
            date=att_date,
            period_number=period,
            status=status,
            notes="Imported from ERP"
        )
        db.add(rec)


def _get_setting(db: Session, key: str, default: str) -> str:
    setting = db.query(models.Setting).filter(models.Setting.key == key).first()
    return setting.value if setting else default
