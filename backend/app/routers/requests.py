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
leave_router = APIRouter(tags=["Leave Requests"])

import secrets
import re

def _generate_leave_id():
    date_str = datetime.now().strftime("%Y%m%d")
    rand_str = secrets.token_hex(2).upper()
    return f"LEV-{date_str}-{rand_str}"

async def _process_leave_submission(
    leave_type: str,
    from_date: str,
    to_date: str,
    reason: str,
    parent_name: str,
    parent_contact: str,
    emergency_contact: Optional[str] = None,
    remarks: Optional[str] = None,
    document: Optional[UploadFile] = None,
    current_user: models.User = None,
    mongo_db = None
):
    if not current_user:
        raise HTTPException(status_code=401, detail="Authentication required")

    # Fetch student profile from MongoDB student_accounts
    student_doc = await mongo_db["student_accounts"].find_one({"register_no": current_user.login_id})
    if not student_doc:
        student_doc = await mongo_db["student_accounts"].find_one({
            "$or": [
                {"roll_number": current_user.login_id},
                {"email": current_user.login_id.lower()}
            ]
        })
    if not student_doc:
        raise HTTPException(status_code=404, detail="Student profile not found in database.")

    # Profile validation
    missing_fields = []
    if not student_doc.get("name"): missing_fields.append("Student Name")
    if not student_doc.get("register_no"): missing_fields.append("Register Number")
    if not student_doc.get("department"): missing_fields.append("Department")
    if not student_doc.get("year"): missing_fields.append("Year")
    if not student_doc.get("section"): missing_fields.append("Section")
    if not student_doc.get("email"): missing_fields.append("College Email")
    if missing_fields:
        raise HTTPException(
            status_code=400,
            detail=f"Incomplete profile information. Missing: {', '.join(missing_fields)}. Please contact administrator."
        )

    # Field validations
    try:
        from_dt = date.fromisoformat(from_date)
        to_dt = date.fromisoformat(to_date)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD.")

    if to_dt < from_dt:
        raise HTTPException(status_code=400, detail="To Date cannot be earlier than From Date.")

    number_of_days = (to_dt - from_dt).days + 1

    if len(reason.strip()) < 10:
        raise HTTPException(status_code=400, detail="Reason for leave must be at least 10 characters.")

    if not parent_name or len(parent_name.strip()) < 2:
        raise HTTPException(status_code=400, detail="Parent/Guardian Name is required.")

    clean_parent_contact = parent_contact.strip().replace(" ", "").replace("-", "")
    if not re.match(r"^[6-9][0-9]{9}$", clean_parent_contact):
        raise HTTPException(status_code=400, detail="Parent contact number must be a valid 10-digit Indian mobile number starting with 6-9.")

    if leave_type == "Medical Leave" and not document:
        raise HTTPException(status_code=400, detail="Supporting document is required for Medical Leave.")

    doc_path = None
    if document:
        allowed_exts = [".pdf", ".jpg", ".jpeg", ".png"]
        ext = os.path.splitext(document.filename)[-1].lower()
        if ext not in allowed_exts:
            raise HTTPException(status_code=400, detail=f"Invalid document format '{ext}'. Allowed: PDF, JPG, JPEG, PNG.")
        
        # Check size limit (max 10MB)
        content = await document.read()
        if len(content) > 10 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="File size exceeds maximum limit of 10MB.")
        
        # Save file
        upload_dir = os.path.join(settings.UPLOAD_DIR, "leave")
        os.makedirs(upload_dir, exist_ok=True)
        filename = f"{uuid.uuid4()}{ext}"
        file_dest = os.path.join(upload_dir, filename)
        with open(file_dest, "wb") as f:
            f.write(content)
        doc_path = f"/uploads/leave/{filename}"

    # Check duplicate pending request
    existing_pending = await mongo_db["leave_requests"].find_one({
        "registerNumber": student_doc["register_no"],
        "leaveType": leave_type,
        "fromDate": from_date,
        "toDate": to_date,
        "status": "Pending"
    })
    if existing_pending:
        raise HTTPException(status_code=400, detail="A pending leave request for the exact same dates and leave type already exists.")

    request_id = _generate_leave_id()
    now_iso = datetime.now(timezone.utc).isoformat()

    leave_record = {
        "requestId": request_id,
        "studentId": str(student_doc["_id"]),
        "studentName": student_doc["name"],
        "registerNumber": student_doc["register_no"],
        "department": student_doc.get("department", "CSE(AI&ML)"),
        "year": student_doc.get("year", "III Year"),
        "section": student_doc.get("section", "AIML"),
        "collegeEmail": student_doc.get("email"),
        "leaveType": leave_type,
        "fromDate": from_date,
        "toDate": to_date,
        "numberOfDays": number_of_days,
        "reason": reason.strip(),
        "parentName": parent_name.strip(),
        "parentContact": clean_parent_contact,
        "supportingDocument": doc_path,
        "emergencyContact": emergency_contact.strip() if emergency_contact else "",
        "remarks": remarks.strip() if remarks else "",
        "status": "Pending",
        "submittedAt": now_iso,
        "updatedAt": now_iso,
        "reviewedBy": None,
        "reviewedAt": None,
        "reviewerRemarks": None
    }

    result = await mongo_db["leave_requests"].insert_one(leave_record)
    return {
        "message": "Leave request submitted successfully.",
        "requestId": request_id,
        "id": str(result.inserted_id),
        "status": "Pending"
    }

@leave_router.post("/leave-requests")
@leave_router.post("/leave/submit")
async def create_leave_request(
    leaveType: str = Form(...),
    fromDate: str = Form(...),
    toDate: str = Form(...),
    reason: str = Form(...),
    parentName: str = Form(...),
    parentContact: str = Form(...),
    emergencyContact: Optional[str] = Form(""),
    remarks: Optional[str] = Form(""),
    document: Optional[UploadFile] = File(None),
    current_user: models.User = Depends(get_current_user),
    mongo_db = Depends(get_db)
):
    return await _process_leave_submission(
        leave_type=leaveType,
        from_date=fromDate,
        to_date=toDate,
        reason=reason,
        parent_name=parentName,
        parent_contact=parentContact,
        emergency_contact=emergencyContact,
        remarks=remarks,
        document=document,
        current_user=current_user,
        mongo_db=mongo_db
    )

@leave_router.get("/leave-requests/my")
@leave_router.get("/leave/my")
async def get_my_leave_requests_mongo(
    current_user: models.User = Depends(get_current_user),
    mongo_db = Depends(get_db)
):
    requests = await mongo_db["leave_requests"].find({
        "$or": [
            {"registerNumber": current_user.login_id},
            {"studentId": str(current_user.id)}
        ]
    }).sort("submittedAt", -1).to_list(length=200)

    for r in requests:
        r["id"] = str(r["_id"])
        del r["_id"]

    return {"requests": requests}

@leave_router.get("/leave-requests/pending")
@leave_router.get("/leave/pending")
async def get_pending_leave_requests_mongo(
    current_user: models.User = Depends(require_roles(
        models.UserRole.ADVISOR, models.UserRole.HOD, models.UserRole.DEO
    )),
    mongo_db = Depends(get_db)
):
    requests = await mongo_db["leave_requests"].find({
        "status": "Pending"
    }).sort("submittedAt", -1).to_list(length=200)

    for r in requests:
        r["id"] = str(r["_id"])
        del r["_id"]

    return {"requests": requests}

@leave_router.get("/leave-requests/{request_id}")
@leave_router.get("/leave/{request_id}")
async def get_leave_request_detail(
    request_id: str,
    current_user: models.User = Depends(get_current_user),
    mongo_db = Depends(get_db)
):
    from bson import ObjectId
    query = {"$or": [{"requestId": request_id}]}
    if ObjectId.is_valid(request_id):
        query["$or"].append({"_id": ObjectId(request_id)})

    leave = await mongo_db["leave_requests"].find_one(query)
    if not leave:
        raise HTTPException(status_code=404, detail="Leave request not found")

    leave["id"] = str(leave["_id"])
    del leave["_id"]
    return leave

@leave_router.post("/leave-requests/{request_id}/cancel")
async def cancel_leave_request(
    request_id: str,
    current_user: models.User = Depends(get_current_user),
    mongo_db = Depends(get_db)
):
    from bson import ObjectId
    query = {"$or": [{"requestId": request_id}]}
    if ObjectId.is_valid(request_id):
        query["$or"].append({"_id": ObjectId(request_id)})

    leave = await mongo_db["leave_requests"].find_one(query)
    if not leave:
        raise HTTPException(status_code=404, detail="Leave request not found")

    if leave.get("status") != "Pending":
        raise HTTPException(status_code=400, detail="Only pending requests can be cancelled.")

    now_iso = datetime.now(timezone.utc).isoformat()
    await mongo_db["leave_requests"].update_one(
        {"_id": leave["_id"]},
        {"$set": {"status": "Cancelled", "updatedAt": now_iso}}
    )
    return {"message": "Leave request cancelled successfully.", "status": "Cancelled"}

@leave_router.post("/leave-requests/{request_id}/review")
async def review_leave_request(
    request_id: str,
    status: str = Form(...), # "Approved" or "Rejected"
    reviewerRemarks: Optional[str] = Form(""),
    current_user: models.User = Depends(require_roles(
        models.UserRole.ADVISOR, models.UserRole.HOD
    )),
    mongo_db = Depends(get_db)
):
    if status not in ["Approved", "Rejected"]:
        raise HTTPException(status_code=400, detail="Status must be 'Approved' or 'Rejected'")

    from bson import ObjectId
    query = {"$or": [{"requestId": request_id}]}
    if ObjectId.is_valid(request_id):
        query["$or"].append({"_id": ObjectId(request_id)})

    leave = await mongo_db["leave_requests"].find_one(query)
    if not leave:
        raise HTTPException(status_code=404, detail="Leave request not found")

    now_iso = datetime.now(timezone.utc).isoformat()
    await mongo_db["leave_requests"].update_one(
        {"_id": leave["_id"]},
        {"$set": {
            "status": status,
            "reviewedBy": current_user.full_name or current_user.login_id,
            "reviewedAt": now_iso,
            "reviewerRemarks": reviewerRemarks,
            "updatedAt": now_iso
        }}
    )
    return {"message": f"Leave request {status.lower()} successfully.", "status": status}



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
