"""
Leave, Late Arrival, Correction, Notification, Timetable, Audit Routers
All using MongoDB (Motor async driver)
"""
from datetime import date, datetime, time, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from pydantic import BaseModel
from app.database import get_db
from app import models
from app.auth import get_current_user, require_roles
from app.config import settings
import secrets, re, uuid, os

# ============================================================
# LEAVE ROUTER
# ============================================================
leave_router = APIRouter(tags=["Leave Requests"])


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

        content = await document.read()
        if len(content) > 10 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="File size exceeds maximum limit of 10MB.")

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
async def get_my_leave_requests(
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
async def get_pending_leave_requests(
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
    status: str = Form(...),  # "Approved" or "Rejected"
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

    # Log to audit_logs in MongoDB
    await mongo_db["audit_logs"].insert_one({
        "action": f"LEAVE_{status.upper()}",
        "entity_type": "leave_request",
        "entity_id": str(leave["_id"]),
        "user_id": str(current_user.id),
        "user_role": str(current_user.role),
        "reason": reviewerRemarks or "",
        "created_at": now_iso
    })

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
    mongo_db = Depends(get_db)
):
    doc_path = None
    if document:
        upload_dir = os.path.join(settings.UPLOAD_DIR, "late")
        os.makedirs(upload_dir, exist_ok=True)
        ext = os.path.splitext(document.filename)[-1].lower()
        filename = f"{uuid.uuid4()}{ext}"
        content = await document.read()
        with open(os.path.join(upload_dir, filename), "wb") as f:
            f.write(content)
        doc_path = f"/uploads/late/{filename}"

    now_iso = datetime.now(timezone.utc).isoformat()
    late_record = {
        "studentLoginId": current_user.login_id,
        "studentName": current_user.full_name,
        "date": arrival_date,
        "expected_arrival_time": expected_arrival_time,
        "reason": reason,
        "description": description,
        "document_path": doc_path,
        "status": "pending",
        "created_at": now_iso
    }
    result = await mongo_db["late_arrival_requests"].insert_one(late_record)
    return {"message": "Late arrival notification sent", "id": str(result.inserted_id)}


@late_router.get("/my")
async def get_my_late_requests(
    current_user: models.User = Depends(require_roles(models.UserRole.STUDENT)),
    mongo_db = Depends(get_db)
):
    requests = await mongo_db["late_arrival_requests"].find({
        "studentLoginId": current_user.login_id
    }).sort("created_at", -1).to_list(length=100)

    for r in requests:
        r["id"] = str(r["_id"])
        del r["_id"]

    return {"requests": requests}


# ============================================================
# ATTENDANCE CORRECTION ROUTER
# ============================================================
correction_router = APIRouter(prefix="/correction", tags=["Attendance Correction"])


class CorrectionRequest(BaseModel):
    attendance_record_id: str  # MongoDB ObjectId string
    claimed_status: str
    explanation: str


@correction_router.post("/submit")
async def submit_correction(
    data: CorrectionRequest,
    current_user: models.User = Depends(require_roles(models.UserRole.STUDENT)),
    mongo_db = Depends(get_db)
):
    now_iso = datetime.now(timezone.utc).isoformat()
    # Check for existing pending
    from bson import ObjectId
    existing = await mongo_db["attendance_corrections"].find_one({
        "attendance_record_id": data.attendance_record_id,
        "student_login_id": current_user.login_id,
        "status": "pending"
    })
    if existing:
        raise HTTPException(status_code=400, detail="A pending correction for this record already exists.")

    correction_doc = {
        "student_login_id": current_user.login_id,
        "student_name": current_user.full_name,
        "attendance_record_id": data.attendance_record_id,
        "claimed_status": data.claimed_status,
        "explanation": data.explanation,
        "status": "pending",
        "current_status": "AB",  # default assumption
        "faculty_notes": None,
        "reviewed_by": None,
        "reviewed_at": None,
        "created_at": now_iso,
        "updated_at": now_iso
    }

    result = await mongo_db["attendance_corrections"].insert_one(correction_doc)

    # Audit log
    await mongo_db["audit_logs"].insert_one({
        "action": "CORRECTION_SUBMITTED",
        "entity_type": "attendance_correction",
        "entity_id": str(result.inserted_id),
        "user_id": str(current_user.id),
        "user_role": str(current_user.role),
        "reason": data.explanation,
        "created_at": now_iso
    })

    return {"message": "Correction request submitted", "correction_id": str(result.inserted_id)}


@correction_router.get("/my")
async def get_my_corrections(
    current_user: models.User = Depends(require_roles(models.UserRole.STUDENT)),
    mongo_db = Depends(get_db)
):
    corrections = await mongo_db["attendance_corrections"].find({
        "student_login_id": current_user.login_id
    }).sort("created_at", -1).to_list(length=100)

    for c in corrections:
        c["id"] = str(c["_id"])
        del c["_id"]

    return {"corrections": corrections}


@correction_router.get("/pending")
async def get_pending_corrections(
    current_user: models.User = Depends(require_roles(
        models.UserRole.FACULTY, models.UserRole.ADVISOR, models.UserRole.HOD
    )),
    mongo_db = Depends(get_db)
):
    corrections = await mongo_db["attendance_corrections"].find({
        "status": {"$in": ["pending", "faculty_review"]}
    }).sort("created_at", -1).to_list(length=200)

    for c in corrections:
        c["id"] = str(c["_id"])
        del c["_id"]

    return {"corrections": corrections}


@correction_router.post("/{correction_id}/approve")
async def approve_correction(
    correction_id: str,
    notes: Optional[str] = None,
    current_user: models.User = Depends(require_roles(
        models.UserRole.FACULTY, models.UserRole.ADVISOR, models.UserRole.HOD
    )),
    mongo_db = Depends(get_db)
):
    from bson import ObjectId
    if not ObjectId.is_valid(correction_id):
        raise HTTPException(status_code=400, detail="Invalid correction ID")

    correction = await mongo_db["attendance_corrections"].find_one({"_id": ObjectId(correction_id)})
    if not correction:
        raise HTTPException(status_code=404, detail="Correction not found")

    now_iso = datetime.now(timezone.utc).isoformat()
    await mongo_db["attendance_corrections"].update_one(
        {"_id": ObjectId(correction_id)},
        {"$set": {
            "status": "approved",
            "faculty_notes": notes,
            "reviewed_by": current_user.full_name or current_user.login_id,
            "reviewed_at": now_iso,
            "updated_at": now_iso
        }}
    )

    await mongo_db["audit_logs"].insert_one({
        "action": "CORRECTION_APPROVED",
        "entity_type": "attendance_correction",
        "entity_id": correction_id,
        "user_id": str(current_user.id),
        "user_role": str(current_user.role),
        "reason": notes or "Approved",
        "created_at": now_iso
    })

    return {"message": "Correction approved"}


@correction_router.post("/{correction_id}/reject")
async def reject_correction(
    correction_id: str,
    reason: str,
    current_user: models.User = Depends(require_roles(
        models.UserRole.FACULTY, models.UserRole.ADVISOR, models.UserRole.HOD
    )),
    mongo_db = Depends(get_db)
):
    from bson import ObjectId
    if not ObjectId.is_valid(correction_id):
        raise HTTPException(status_code=400, detail="Invalid correction ID")

    correction = await mongo_db["attendance_corrections"].find_one({"_id": ObjectId(correction_id)})
    if not correction:
        raise HTTPException(status_code=404, detail="Correction not found")

    now_iso = datetime.now(timezone.utc).isoformat()
    await mongo_db["attendance_corrections"].update_one(
        {"_id": ObjectId(correction_id)},
        {"$set": {
            "status": "rejected",
            "faculty_notes": reason,
            "reviewed_by": current_user.full_name or current_user.login_id,
            "reviewed_at": now_iso,
            "updated_at": now_iso
        }}
    )

    await mongo_db["audit_logs"].insert_one({
        "action": "CORRECTION_REJECTED",
        "entity_type": "attendance_correction",
        "entity_id": correction_id,
        "user_id": str(current_user.id),
        "user_role": str(current_user.role),
        "reason": reason,
        "created_at": now_iso
    })

    return {"message": "Correction rejected"}


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
    mongo_db = Depends(get_db)
):
    query_filter = {"user_id": str(current_user.id)}
    if unread_only:
        query_filter["is_read"] = False
    if category:
        query_filter["category"] = category

    total = await mongo_db["notifications"].count_documents(query_filter)
    unread_count = await mongo_db["notifications"].count_documents({
        "user_id": str(current_user.id), "is_read": False
    })

    skip = (page - 1) * limit
    notifications = await mongo_db["notifications"].find(query_filter).sort(
        "created_at", -1
    ).skip(skip).limit(limit).to_list(length=limit)

    for n in notifications:
        n["id"] = str(n["_id"])
        del n["_id"]

    return {
        "total": total,
        "unread_count": unread_count,
        "notifications": notifications
    }


@notif_router.post("/{notif_id}/read")
async def mark_notification_read(
    notif_id: str,
    current_user: models.User = Depends(get_current_user),
    mongo_db = Depends(get_db)
):
    from bson import ObjectId
    if not ObjectId.is_valid(notif_id):
        raise HTTPException(status_code=400, detail="Invalid notification ID")

    result = await mongo_db["notifications"].update_one(
        {"_id": ObjectId(notif_id), "user_id": str(current_user.id)},
        {"$set": {"is_read": True, "read_at": datetime.now(timezone.utc).isoformat()}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"message": "Marked as read"}


@notif_router.post("/read-all")
async def mark_all_read(
    current_user: models.User = Depends(get_current_user),
    mongo_db = Depends(get_db)
):
    now_iso = datetime.now(timezone.utc).isoformat()
    await mongo_db["notifications"].update_many(
        {"user_id": str(current_user.id), "is_read": False},
        {"$set": {"is_read": True, "read_at": now_iso}}
    )
    return {"message": "All notifications marked as read"}


# ============================================================
# TIMETABLE ROUTER
# ============================================================
timetable_router = APIRouter(prefix="/timetable", tags=["Timetable"])


@timetable_router.get("/today")
async def get_today_timetable(
    current_user: models.User = Depends(get_current_user),
    mongo_db = Depends(get_db)
):
    day_of_week = datetime.now().weekday()
    day_names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

    # Fetch student info to determine section
    student_doc = None
    if "STUDENT" in str(current_user.role).upper():
        student_doc = await mongo_db["student_accounts"].find_one({
            "$or": [
                {"register_no": current_user.login_id},
                {"roll_number": current_user.login_id}
            ]
        })

    section = student_doc.get("section", "AIML") if student_doc else None

    timetable_query = {"day_of_week": day_of_week}
    if section:
        timetable_query["section"] = section

    entries = await mongo_db["timetables"].find(timetable_query).sort("period_number", 1).to_list(length=50)
    for e in entries:
        e["id"] = str(e["_id"])
        del e["_id"]

    return {"day": day_of_week, "day_name": day_names[day_of_week], "timetable": entries}


@timetable_router.get("/week")
async def get_week_timetable(
    section_id: Optional[str] = None,
    current_user: models.User = Depends(get_current_user),
    mongo_db = Depends(get_db)
):
    query_filter = {}
    if section_id:
        query_filter["section"] = section_id
    elif "STUDENT" in str(current_user.role).upper():
        student_doc = await mongo_db["student_accounts"].find_one({
            "$or": [
                {"register_no": current_user.login_id},
                {"roll_number": current_user.login_id}
            ]
        })
        if student_doc:
            query_filter["section"] = student_doc.get("section", "AIML")

    entries = await mongo_db["timetables"].find(query_filter).sort(
        [("day_of_week", 1), ("period_number", 1)]
    ).to_list(length=200)

    week = {}
    for e in entries:
        e["id"] = str(e["_id"])
        del e["_id"]
        day = str(e.get("day_of_week", 0))
        if day not in week:
            week[day] = []
        week[day].append(e)

    return {"week": week}


# ============================================================
# AUDIT LOG ROUTER
# ============================================================
audit_router = APIRouter(prefix="/audit", tags=["Audit Logs"])


@audit_router.get("/")
async def get_audit_logs(
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    user_id: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(50, le=200),
    current_user: models.User = Depends(require_roles(
        models.UserRole.HOD, models.UserRole.DEO, models.UserRole.ADVISOR
    )),
    mongo_db = Depends(get_db)
):
    query_filter = {}
    if entity_type:
        query_filter["entity_type"] = entity_type
    if entity_id:
        query_filter["entity_id"] = entity_id
    if user_id:
        query_filter["user_id"] = user_id

    total = await mongo_db["audit_logs"].count_documents(query_filter)
    skip = (page - 1) * limit
    logs = await mongo_db["audit_logs"].find(query_filter).sort(
        "created_at", -1
    ).skip(skip).limit(limit).to_list(length=limit)

    for log in logs:
        log["id"] = str(log["_id"])
        del log["_id"]

    return {"total": total, "logs": logs}
