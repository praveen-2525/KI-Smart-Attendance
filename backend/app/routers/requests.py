"""
Leave, Late Arrival, Correction, Notification, Timetable, User Management Routers
"""
from datetime import date, datetime, time, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from sqlalchemy.orm import Session
from sqlalchemy import and_
from pydantic import BaseModel
from app.database import get_db
from app import models
from app.auth import get_current_user, require_roles
from app.notification_service import NotificationService
from app.audit_service import AuditService
from app.config import settings
from app.attendance_applier import apply_leave_to_attendance
import uuid, os

# ============================================================
# LEAVE ROUTER
# ============================================================
leave_router = APIRouter(prefix="/leave", tags=["Leave Requests"])


@leave_router.post("/submit")
async def submit_leave(
    from_date: str = Form(...),
    to_date: str = Form(...),
    reason: str = Form(...),
    description: str = Form(""),
    document: Optional[UploadFile] = File(None),
    current_user: models.User = Depends(require_roles(models.UserRole.STUDENT)),
    db: Session = Depends(get_db)
):
    student = current_user.student_profile
    if not student:
        raise HTTPException(status_code=404, detail="Student profile not found")

    # Check cutoff
    cutoff_str = _get_setting(db, "leave.cutoff_time", settings.LEAVE_CUTOFF_TIME)
    cutoff = time.fromisoformat(cutoff_str)
    now_time = datetime.now().time()

    from_dt = date.fromisoformat(from_date)
    # Only check cutoff if it's a same-day leave
    if from_dt == date.today() and now_time > cutoff:
        next_opening = _get_setting(db, "leave.next_opening_time", settings.LEAVE_NEXT_OPENING_TIME)
        raise HTTPException(
            status_code=400,
            detail=f"Today's leave request window is closed. Next opening time: {next_opening}"
        )

    doc_path = None
    if document:
        doc_path = await _save_upload(document, f"leave/{student.id}")

    leave = models.LeaveRequest(
        student_id=student.id,
        from_date=from_dt,
        to_date=date.fromisoformat(to_date),
        reason=reason,
        description=description,
        document_path=doc_path,
        status=models.LeaveStatus.SUBMITTED
    )
    db.add(leave)
    db.flush()

    audit = AuditService(db)
    audit.log_leave_action(leave, "SUBMITTED", current_user.id, current_user.role)

    notif = NotificationService(db)
    notif.notify_leave_submitted(leave)

    db.commit()
    return {"message": "Leave request submitted", "leave_id": leave.id}


@leave_router.get("/my")
async def get_my_leave_requests(
    current_user: models.User = Depends(require_roles(models.UserRole.STUDENT)),
    db: Session = Depends(get_db)
):
    student = current_user.student_profile
    requests = db.query(models.LeaveRequest).filter(
        models.LeaveRequest.student_id == student.id
    ).order_by(models.LeaveRequest.submitted_at.desc()).all()
    return {"requests": [_format_leave(r) for r in requests]}


@leave_router.get("/pending")
async def get_pending_leave_requests(
    current_user: models.User = Depends(require_roles(
        models.UserRole.ADVISOR, models.UserRole.HOD, models.UserRole.DEO
    )),
    db: Session = Depends(get_db)
):
    query = db.query(models.LeaveRequest).filter(
        models.LeaveRequest.status.in_([models.LeaveStatus.SUBMITTED, models.LeaveStatus.UNDER_REVIEW])
    )
    if current_user.role == models.UserRole.ADVISOR:
        faculty = current_user.faculty_profile
        if faculty and faculty.advisor_section_id:
            query = query.join(models.Student).filter(
                models.Student.section_id == faculty.advisor_section_id
            )
    return {"requests": [_format_leave(r, include_student=True) for r in query.all()]}


@leave_router.post("/{leave_id}/approve")
async def approve_leave(
    leave_id: int,
    notes: Optional[str] = None,
    current_user: models.User = Depends(require_roles(
        models.UserRole.ADVISOR, models.UserRole.HOD
    )),
    db: Session = Depends(get_db)
):
    leave = db.query(models.LeaveRequest).filter(models.LeaveRequest.id == leave_id).first()
    if not leave:
        raise HTTPException(status_code=404, detail="Leave request not found")

    now = datetime.now(timezone.utc)
    if current_user.role == models.UserRole.ADVISOR:
        leave.advisor_id = current_user.id
        leave.advisor_action = "approved"
        leave.advisor_notes = notes
        leave.advisor_actioned_at = now
    elif current_user.role == models.UserRole.HOD:
        leave.hod_id = current_user.id
        leave.hod_action = "approved"
        leave.hod_notes = notes
        leave.hod_actioned_at = now

    leave.status = models.LeaveStatus.APPROVED

    # Apply to attendance
    conflicts = await apply_leave_to_attendance(db, leave, current_user)
    leave.status = models.LeaveStatus.ATTENDANCE_MARKED
    leave.attendance_marked_at = now

    audit = AuditService(db)
    audit.log_leave_action(leave, "APPROVED_AND_APPLIED", current_user.id, current_user.role, notes)

    notif = NotificationService(db)
    notif.notify_leave_approved(leave)

    db.commit()
    return {"message": "Leave approved and attendance marked", "conflicts": len(conflicts)}


@leave_router.post("/{leave_id}/reject")
async def reject_leave(
    leave_id: int,
    reason: str,
    current_user: models.User = Depends(require_roles(
        models.UserRole.ADVISOR, models.UserRole.HOD
    )),
    db: Session = Depends(get_db)
):
    leave = db.query(models.LeaveRequest).filter(models.LeaveRequest.id == leave_id).first()
    if not leave:
        raise HTTPException(status_code=404, detail="Leave request not found")

    leave.status = models.LeaveStatus.REJECTED
    if current_user.role == models.UserRole.ADVISOR:
        leave.advisor_action = "rejected"
        leave.advisor_notes = reason
    else:
        leave.hod_action = "rejected"
        leave.hod_notes = reason

    db.commit()
    return {"message": "Leave request rejected"}


def _format_leave(lr, include_student=False):
    r = {
        "id": lr.id, "from_date": lr.from_date, "to_date": lr.to_date,
        "reason": lr.reason, "description": lr.description,
        "status": lr.status, "submitted_at": lr.submitted_at,
        "advisor_action": lr.advisor_action, "hod_action": lr.hod_action
    }
    if include_student and lr.student:
        r["student"] = {
            "id": lr.student.id,
            "register_number": lr.student.register_number,
            "name": lr.student.user.full_name
        }
    return r


# ============================================================
# LATE ARRIVAL ROUTER
# ============================================================
late_router = APIRouter(prefix="/late", tags=["Late Arrival"])


@late_router.post("/inform")
async def inform_late_arrival(
    arrival_date: str = Form(...),
    expected_arrival_time: str = Form(...),
    reason: str = Form(...),
    description: str = Form(""),
    document: Optional[UploadFile] = File(None),
    current_user: models.User = Depends(require_roles(models.UserRole.STUDENT)),
    db: Session = Depends(get_db)
):
    student = current_user.student_profile
    doc_path = None
    if document:
        doc_path = await _save_upload(document, f"late/{student.id}")

    late = models.LateArrivalRequest(
        student_id=student.id,
        date=date.fromisoformat(arrival_date),
        expected_arrival_time=time.fromisoformat(expected_arrival_time),
        reason=reason,
        description=description,
        document_path=doc_path
    )
    db.add(late)
    db.flush()

    # Find current period faculty
    now_time = datetime.now().time()
    day_of_week = datetime.now().weekday()
    current_period = db.query(models.TimetableEntry).filter(
        models.TimetableEntry.section_id == student.section_id,
        models.TimetableEntry.day_of_week == day_of_week,
        models.TimetableEntry.start_time <= now_time,
        models.TimetableEntry.end_time >= now_time,
        models.TimetableEntry.is_active == True
    ).first()

    notif = NotificationService(db)
    if current_period and current_period.faculty:
        late.notified_faculty_id = current_period.faculty_id
        notif.notify_late_arrival(late, current_period.faculty.user_id)

    # Notify advisor
    section = student.section
    if section and section.advisor:
        notif.create_notification(
            section.advisor.user_id,
            models.NotificationCategory.LATE_ARRIVAL,
            "Late Arrival Notification",
            f"{student.user.full_name} will arrive late at {expected_arrival_time}.",
            priority=models.NotificationPriority.INFORMATION,
            reference_type="late_arrival",
            reference_id=late.id
        )
        late.notified_advisor = True

    db.commit()
    return {"message": "Late arrival notification sent", "late_id": late.id}


@late_router.get("/my")
async def get_my_late_requests(
    current_user: models.User = Depends(require_roles(models.UserRole.STUDENT)),
    db: Session = Depends(get_db)
):
    student = current_user.student_profile
    requests = db.query(models.LateArrivalRequest).filter(
        models.LateArrivalRequest.student_id == student.id
    ).order_by(models.LateArrivalRequest.created_at.desc()).all()
    return {
        "requests": [
            {
                "id": r.id, "date": r.date, "expected_arrival_time": r.expected_arrival_time,
                "reason": r.reason, "status": r.status, "created_at": r.created_at
            } for r in requests
        ]
    }


# ============================================================
# ATTENDANCE CORRECTION ROUTER
# ============================================================
correction_router = APIRouter(prefix="/correction", tags=["Attendance Correction"])


class CorrectionRequest(BaseModel):
    attendance_record_id: int
    claimed_status: str
    explanation: str


@correction_router.post("/submit")
async def submit_correction(
    data: CorrectionRequest,
    current_user: models.User = Depends(require_roles(models.UserRole.STUDENT)),
    db: Session = Depends(get_db)
):
    student = current_user.student_profile
    record = db.query(models.AttendanceRecord).filter(
        models.AttendanceRecord.id == data.attendance_record_id,
        models.AttendanceRecord.student_id == student.id
    ).first()

    if not record:
        raise HTTPException(status_code=404, detail="Attendance record not found")

    # Check if correction already pending
    existing = db.query(models.AttendanceCorrection).filter(
        models.AttendanceCorrection.attendance_record_id == record.id,
        models.AttendanceCorrection.status == models.CorrectionStatus.PENDING
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Correction already pending for this record")

    # Check for QR evidence
    qr_scan = db.query(models.QRScan).filter(
        models.QRScan.student_id == student.id
    ).filter(
        # Approximate: find QR scans on same date/period
    ).first()

    correction = models.AttendanceCorrection(
        student_id=student.id,
        attendance_record_id=record.id,
        current_status=record.status,
        claimed_status=data.claimed_status,
        explanation=data.explanation,
        status=models.CorrectionStatus.PENDING
    )
    db.add(correction)
    db.flush()

    audit = AuditService(db)
    audit.log(
        action="CORRECTION_SUBMITTED",
        entity_type="attendance_correction",
        entity_id=correction.id,
        user_id=current_user.id,
        user_role=current_user.role,
        previous_value={"status": str(record.status)},
        new_value={"claimed_status": data.claimed_status},
        reason=data.explanation
    )

    notif = NotificationService(db)
    notif.notify_correction_submitted(correction)

    db.commit()
    return {"message": "Correction request submitted", "correction_id": correction.id}


@correction_router.get("/my")
async def get_my_corrections(
    current_user: models.User = Depends(require_roles(models.UserRole.STUDENT)),
    db: Session = Depends(get_db)
):
    student = current_user.student_profile
    corrections = db.query(models.AttendanceCorrection).filter(
        models.AttendanceCorrection.student_id == student.id
    ).order_by(models.AttendanceCorrection.created_at.desc()).all()
    return {"corrections": [_format_correction(c) for c in corrections]}


@correction_router.get("/pending")
async def get_pending_corrections(
    current_user: models.User = Depends(require_roles(
        models.UserRole.FACULTY, models.UserRole.ADVISOR, models.UserRole.HOD
    )),
    db: Session = Depends(get_db)
):
    corrections = db.query(models.AttendanceCorrection).filter(
        models.AttendanceCorrection.status.in_([
            models.CorrectionStatus.PENDING, models.CorrectionStatus.FACULTY_REVIEW
        ])
    ).all()
    return {"corrections": [_format_correction(c, include_student=True) for c in corrections]}


@correction_router.post("/{correction_id}/approve")
async def approve_correction(
    correction_id: int,
    notes: Optional[str] = None,
    current_user: models.User = Depends(require_roles(
        models.UserRole.FACULTY, models.UserRole.ADVISOR, models.UserRole.HOD
    )),
    db: Session = Depends(get_db)
):
    correction = db.query(models.AttendanceCorrection).filter(
        models.AttendanceCorrection.id == correction_id
    ).first()
    if not correction:
        raise HTTPException(status_code=404, detail="Correction not found")

    # Update attendance
    record = correction.attendance_record
    prev_status = record.status
    record.status = correction.claimed_status

    correction.status = models.CorrectionStatus.APPROVED
    if hasattr(current_user, "faculty_profile") and current_user.faculty_profile:
        correction.reviewed_by_faculty_id = current_user.faculty_profile.id
    correction.faculty_decision = "approved"
    correction.faculty_notes = notes
    correction.faculty_reviewed_at = datetime.now(timezone.utc)

    audit = AuditService(db)
    audit.log_attendance_change(
        record, prev_status, correction.claimed_status,
        current_user.id, current_user.role,
        f"Correction approved: {notes}",
        related_request_id=correction.id,
        related_request_type="correction"
    )

    # Notify student
    notif = NotificationService(db)
    notif.create_notification(
        correction.student.user_id,
        models.NotificationCategory.ATTENDANCE_CORRECTION,
        "Correction Approved",
        f"Your attendance correction for {record.subject.name if record.subject else ''} on {record.date} has been approved. Status changed to {correction.claimed_status}.",
        priority=models.NotificationPriority.INFORMATION
    )

    db.commit()
    return {"message": "Correction approved"}


@correction_router.post("/{correction_id}/reject")
async def reject_correction(
    correction_id: int,
    reason: str,
    current_user: models.User = Depends(require_roles(
        models.UserRole.FACULTY, models.UserRole.ADVISOR, models.UserRole.HOD
    )),
    db: Session = Depends(get_db)
):
    correction = db.query(models.AttendanceCorrection).filter(
        models.AttendanceCorrection.id == correction_id
    ).first()
    if not correction:
        raise HTTPException(status_code=404, detail="Correction not found")

    correction.status = models.CorrectionStatus.REJECTED
    correction.faculty_decision = "rejected"
    correction.faculty_notes = reason
    correction.faculty_reviewed_at = datetime.now(timezone.utc)

    notif = NotificationService(db)
    notif.create_notification(
        correction.student.user_id,
        models.NotificationCategory.ATTENDANCE_CORRECTION,
        "Correction Rejected",
        f"Your attendance correction request was rejected. Reason: {reason}",
        priority=models.NotificationPriority.ATTENTION
    )

    db.commit()
    return {"message": "Correction rejected"}


def _format_correction(c, include_student=False):
    result = {
        "id": c.id,
        "attendance_record_id": c.attendance_record_id,
        "current_status": c.current_status,
        "claimed_status": c.claimed_status,
        "explanation": c.explanation,
        "status": c.status,
        "faculty_decision": c.faculty_decision,
        "faculty_notes": c.faculty_notes,
        "created_at": c.created_at,
        "record": {
            "date": c.attendance_record.date if c.attendance_record else None,
            "period_number": c.attendance_record.period_number if c.attendance_record else None,
            "subject_name": c.attendance_record.subject.name if c.attendance_record and c.attendance_record.subject else None
        } if c.attendance_record else None
    }
    if include_student and c.student:
        result["student"] = {
            "id": c.student.id,
            "register_number": c.student.register_number,
            "name": c.student.user.full_name
        }
    return result


# ============================================================
# NOTIFICATIONS ROUTER
# ============================================================
notif_router = APIRouter(prefix="/notifications", tags=["Notifications"])


@notif_router.get("/")
async def get_notifications(
    unread_only: bool = False,
    category: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, le=100),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(models.Notification).filter(
        models.Notification.user_id == current_user.id
    )
    if unread_only:
        query = query.filter(models.Notification.is_read == False)
    if category:
        query = query.filter(models.Notification.category == category)

    total = query.count()
    notifications = query.order_by(
        models.Notification.created_at.desc()
    ).offset((page - 1) * limit).limit(limit).all()

    return {
        "total": total,
        "unread_count": db.query(models.Notification).filter(
            models.Notification.user_id == current_user.id,
            models.Notification.is_read == False
        ).count(),
        "notifications": [
            {
                "id": n.id, "category": n.category, "priority": n.priority,
                "title": n.title, "message": n.message,
                "reference_type": n.reference_type, "reference_id": n.reference_id,
                "is_read": n.is_read, "created_at": n.created_at
            } for n in notifications
        ]
    }


@notif_router.post("/{notif_id}/read")
async def mark_notification_read(
    notif_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    notif = db.query(models.Notification).filter(
        models.Notification.id == notif_id,
        models.Notification.user_id == current_user.id
    ).first()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")
    notif.is_read = True
    notif.read_at = datetime.now(timezone.utc)
    db.commit()
    return {"message": "Marked as read"}


@notif_router.post("/read-all")
async def mark_all_read(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    db.query(models.Notification).filter(
        models.Notification.user_id == current_user.id,
        models.Notification.is_read == False
    ).update({"is_read": True, "read_at": datetime.now(timezone.utc)})
    db.commit()
    return {"message": "All notifications marked as read"}


# ============================================================
# TIMETABLE ROUTER
# ============================================================
timetable_router = APIRouter(prefix="/timetable", tags=["Timetable"])


@timetable_router.get("/today")
async def get_today_timetable(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    day_of_week = datetime.now().weekday()

    if current_user.role == models.UserRole.STUDENT:
        student = current_user.student_profile
        if not student:
            raise HTTPException(status_code=404, detail="Student profile not found")
        section_id = student.section_id
    elif current_user.role in [models.UserRole.FACULTY, models.UserRole.ADVISOR]:
        # Return faculty's classes today
        faculty = current_user.faculty_profile
        if not faculty:
            raise HTTPException(status_code=404, detail="Faculty profile not found")
        entries = db.query(models.TimetableEntry).filter(
            models.TimetableEntry.faculty_id == faculty.id,
            models.TimetableEntry.day_of_week == day_of_week,
            models.TimetableEntry.is_active == True
        ).order_by(models.TimetableEntry.period_number).all()
        return {"day": day_of_week, "timetable": [_format_tt(e) for e in entries]}
    else:
        return {"day": day_of_week, "timetable": []}

    entries = db.query(models.TimetableEntry).filter(
        models.TimetableEntry.section_id == section_id,
        models.TimetableEntry.day_of_week == day_of_week,
        models.TimetableEntry.is_active == True
    ).order_by(models.TimetableEntry.period_number).all()

    now_time = datetime.now().time()
    result = []
    for e in entries:
        tt = _format_tt(e)
        tt["is_current"] = e.start_time <= now_time <= e.end_time
        result.append(tt)

    return {"day": day_of_week, "timetable": result}


@timetable_router.get("/week")
async def get_week_timetable(
    section_id: Optional[int] = None,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if section_id is None and current_user.role == models.UserRole.STUDENT:
        section_id = current_user.student_profile.section_id

    query = db.query(models.TimetableEntry).filter(
        models.TimetableEntry.is_active == True
    )
    if section_id:
        query = query.filter(models.TimetableEntry.section_id == section_id)

    entries = query.order_by(
        models.TimetableEntry.day_of_week,
        models.TimetableEntry.period_number
    ).all()

    week = {}
    for e in entries:
        day = e.day_of_week
        if day not in week:
            week[day] = []
        week[day].append(_format_tt(e))

    return {"week": week}


def _format_tt(e: models.TimetableEntry):
    return {
        "id": e.id,
        "day_of_week": e.day_of_week,
        "period_number": e.period_number,
        "start_time": str(e.start_time),
        "end_time": str(e.end_time),
        "subject_id": e.subject_id,
        "subject_name": e.subject.name if e.subject else None,
        "subject_code": e.subject.code if e.subject else None,
        "faculty_id": e.faculty_id,
        "faculty_name": e.faculty.user.full_name if e.faculty and e.faculty.user else None,
        "section_id": e.section_id,
        "room": e.room
    }


# ============================================================
# AUDIT LOG ROUTER
# ============================================================
audit_router = APIRouter(prefix="/audit", tags=["Audit Logs"])


@audit_router.get("/")
async def get_audit_logs(
    entity_type: Optional[str] = None,
    entity_id: Optional[int] = None,
    user_id: Optional[int] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(50, le=200),
    current_user: models.User = Depends(require_roles(
        models.UserRole.HOD, models.UserRole.DEO, models.UserRole.ADVISOR
    )),
    db: Session = Depends(get_db)
):
    query = db.query(models.AuditLog)
    if entity_type:
        query = query.filter(models.AuditLog.entity_type == entity_type)
    if entity_id:
        query = query.filter(models.AuditLog.entity_id == entity_id)
    if user_id:
        query = query.filter(models.AuditLog.user_id == user_id)

    total = query.count()
    logs = query.order_by(models.AuditLog.created_at.desc()).offset((page - 1) * limit).limit(limit).all()

    return {
        "total": total,
        "logs": [
            {
                "id": l.id, "action": l.action, "entity_type": l.entity_type,
                "entity_id": l.entity_id, "user_id": l.user_id, "user_role": l.user_role,
                "previous_value": l.previous_value, "new_value": l.new_value,
                "reason": l.reason, "created_at": l.created_at
            } for l in logs
        ]
    }


# ============================================================
# HELPER
# ============================================================
async def _save_upload(file: UploadFile, subfolder: str) -> str:
    upload_dir = os.path.join(settings.UPLOAD_DIR, subfolder)
    os.makedirs(upload_dir, exist_ok=True)
    ext = os.path.splitext(file.filename)[-1].lower()
    filename = f"{uuid.uuid4()}{ext}"
    file_path = os.path.join(upload_dir, filename)
    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)
    return file_path


def _get_setting(db: Session, key: str, default: str) -> str:
    setting = db.query(models.Setting).filter(models.Setting.key == key).first()
    return setting.value if setting else default
