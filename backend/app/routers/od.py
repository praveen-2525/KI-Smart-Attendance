"""
OD Request Router - complete OD workflow management with MongoDB
"""
import os
import uuid
import secrets
import re
from datetime import date, datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from app.database import get_db
from app import models
from app.auth import get_current_user, require_roles
from app.config import settings

router = APIRouter(tags=["OD Requests"])


def _generate_od_id():
    date_str = datetime.now().strftime("%Y%m%d")
    rand_str = secrets.token_hex(2).upper()
    return f"OD-{date_str}-{rand_str}"


# ============================================================
# OD TWO-STAGE WORKFLOW STATUS CONSTANTS
# ============================================================
OD_STATUS_PENDING = "Pending Approval"
OD_STATUS_AWAITING_PROOF = "Approved – Awaiting Completion Proof"
OD_STATUS_FINAL = "Fulfilled / Final Approved"
OD_STATUS_REJECTED = "Rejected"

COMPLETION_PENDING = "Completion Proof Pending Verification"
COMPLETION_APPROVED = "Approved"
COMPLETION_REJECTED = "Rejected"

PROOF_CERTIFICATE = "CERTIFICATE"
PROOF_GEO_PHOTO = "GEO_TAGGED_PHOTO"

STUDENT_OD_APPROVED_MSG = (
    "Your OD request has been approved. After completing the event, submit the "
    "required certificate or geo-tagged photo for final verification."
)
STUDENT_OD_REJECTED_MSG = "Your OD request has been rejected."
STUDENT_PROOF_SUBMITTED_MSG = "Completion proof submitted successfully. Awaiting verification."
STUDENT_OD_FINAL_MSG = (
    "Your OD completion proof has been approved. Your OD has been confirmed."
)
STUDENT_OD_ATTENDANCE_MSG = "Your OD has been confirmed and added to your attendance."
STUDENT_PROOF_REJECTED_MSG = (
    "Your OD completion proof has been rejected. Please submit the proof again."
)


async def _apply_final_od_to_attendance(mongo_db, od_doc, verified_by: str):
    """
    Apply 'OD' to the student's attendance records for the OD date range.
    Called ONLY after the completion proof receives final Advisor/HOD approval.
    Existing records inside the OD date range are updated to OD; unrelated
    records (other dates / other students) are never touched. For dates with
    no records yet, OD records are created from the class timetable.
    Returns (updated_count, created_count).
    """
    from datetime import timedelta

    register_no = od_doc.get("registerNumber")
    if not register_no:
        return 0, 0

    try:
        start_dt = date.fromisoformat(od_doc.get("fromDate"))
        end_dt = date.fromisoformat(od_doc.get("toDate"))
    except (TypeError, ValueError):
        return 0, 0

    if end_dt < start_dt:
        return 0, 0
    # Safety cap so a bad date range cannot rewrite months of attendance
    if (end_dt - start_dt).days > 31:
        end_dt = start_dt + timedelta(days=31)

    now_iso = datetime.now(timezone.utc).isoformat()
    updated = 0
    created = 0

    student_doc = await mongo_db["student_accounts"].find_one({
        "$or": [{"register_no": register_no}, {"roll_number": register_no}]
    })
    section = (student_doc or {}).get("section")

    current = start_dt
    while current <= end_dt:
        day_str = current.isoformat()

        records = await mongo_db["attendance_records"].find({
            "register_no": register_no,
            "date": day_str
        }).to_list(length=200)

        for rec in records:
            if rec.get("status") == "OD":
                continue  # already marked OD - idempotent
            await mongo_db["attendance_records"].update_one(
                {"_id": rec["_id"]},
                {"$set": {
                    "status": "OD",
                    "source": "OD_WORKFLOW",
                    "od_request_id": od_doc.get("requestId"),
                    "previous_status": rec.get("status"),
                    "notes": f"OD confirmed for '{od_doc.get('eventName')}' by {verified_by}",
                    "updated_at": now_iso,
                }}
            )
            updated += 1

        if not records:
            # No attendance yet for this date - create OD marks from timetable
            entries = await mongo_db["timetables"].find({
                "day_of_week": current.weekday()
            }).to_list(length=50)
            for entry in entries:
                entry_section = entry.get("section")
                if section and entry_section and str(entry_section).lower() != str(section).lower():
                    continue
                await mongo_db["attendance_records"].insert_one({
                    "register_no": register_no,
                    "student_name": od_doc.get("studentName", ""),
                    "subject_code": entry.get("subject_code", ""),
                    "subject_name": entry.get("subject_name", entry.get("subject_code", "")),
                    "date": day_str,
                    "period_number": entry.get("period_number"),
                    "status": "OD",
                    "source": "OD_WORKFLOW",
                    "od_request_id": od_doc.get("requestId"),
                    "faculty_name": entry.get("faculty_name", ""),
                    "start_time": entry.get("start_time"),
                    "end_time": entry.get("end_time"),
                    "marked_by": verified_by,
                    "marked_at": now_iso,
                    "section": entry_section or section or od_doc.get("section", ""),
                    "year": od_doc.get("year", ""),
                    "department": od_doc.get("department", ""),
                })
                created += 1

        current += timedelta(days=1)

    return updated, created


async def _process_od_submission(
    od_type: str,
    event_name: str,
    organization: str,
    location: str,
    from_date: str,
    to_date: str,
    start_time: str,
    end_time: str,
    purpose: str,
    faculty_coordinator: str,
    coordinator_contact: str,
    travel_required: bool,
    travel_mode: Optional[str] = "",
    parent_permission: bool = False,
    remarks: Optional[str] = "",
    document: UploadFile = None,
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

    # Date validations
    try:
        from_dt = date.fromisoformat(from_date)
        to_dt = date.fromisoformat(to_date)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD.")

    if to_dt < from_dt:
        raise HTTPException(status_code=400, detail="To Date cannot be earlier than From Date.")

    number_of_days = (to_dt - from_dt).days + 1

    # Time validation if same day
    if from_dt == to_dt:
        if start_time and end_time and end_time <= start_time:
            raise HTTPException(status_code=400, detail="Event End Time cannot be earlier than or equal to Event Start Time.")

    if not event_name or len(event_name.strip()) < 2:
        raise HTTPException(status_code=400, detail="Event/Program Name is required.")

    if not organization or len(organization.strip()) < 2:
        raise HTTPException(status_code=400, detail="Organizing Institution/Company is required.")

    if not location or len(location.strip()) < 2:
        raise HTTPException(status_code=400, detail="Event Location is required.")

    if not purpose or len(purpose.strip()) < 10:
        raise HTTPException(status_code=400, detail="Purpose/Description must be at least 10 characters long.")

    if not faculty_coordinator or len(faculty_coordinator.strip()) < 2:
        raise HTTPException(status_code=400, detail="Faculty Coordinator Name is required.")

    clean_coord_contact = coordinator_contact.strip().replace(" ", "").replace("-", "")
    if not re.match(r"^[6-9][0-9]{9}$", clean_coord_contact):
        raise HTTPException(status_code=400, detail="Faculty coordinator contact must be a valid 10-digit Indian mobile number starting with 6-9.")

    if not parent_permission:
        raise HTTPException(status_code=400, detail="Parent/Guardian Permission checkbox must be confirmed before submitting.")

    if not document:
        raise HTTPException(status_code=400, detail="Supporting document is required for OD Request.")

    # Validate supporting document file
    allowed_exts = [".pdf", ".jpg", ".jpeg", ".png"]
    ext = os.path.splitext(document.filename)[-1].lower()
    if ext not in allowed_exts:
        raise HTTPException(status_code=400, detail=f"Invalid document format '{ext}'. Allowed: PDF, JPG, JPEG, PNG.")

    content = await document.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File size exceeds maximum limit of 10MB.")

    # Save file
    upload_dir = os.path.join(settings.UPLOAD_DIR, "od")
    os.makedirs(upload_dir, exist_ok=True)
    filename = f"{uuid.uuid4()}{ext}"
    file_dest = os.path.join(upload_dir, filename)
    with open(file_dest, "wb") as f:
        f.write(content)
    doc_path = f"/uploads/od/{filename}"

    # Check duplicate pending request
    existing_pending = await mongo_db["od_requests"].find_one({
        "registerNumber": student_doc["register_no"],
        "odType": od_type,
        "fromDate": from_date,
        "toDate": to_date,
        "status": {"$in": ["Pending", OD_STATUS_PENDING]}
    })
    if existing_pending:
        raise HTTPException(status_code=400, detail="A pending OD request for the exact same dates and OD type already exists.")

    request_id = _generate_od_id()
    now_iso = datetime.now(timezone.utc).isoformat()

    od_record = {
        "requestId": request_id,
        "studentId": str(student_doc["_id"]),
        "studentName": student_doc["name"],
        "registerNumber": student_doc["register_no"],
        "rollNumber": student_doc.get("roll_number", ""),
        "department": student_doc.get("department", "CSE(AI&ML)"),
        "year": student_doc.get("year", "III Year"),
        "section": student_doc.get("section", "AIML"),
        "collegeEmail": student_doc.get("email"),
        "odType": od_type,
        "eventName": event_name.strip(),
        "organization": organization.strip(),
        "location": location.strip(),
        "fromDate": from_date,
        "toDate": to_date,
        "numberOfDays": number_of_days,
        "startTime": start_time,
        "endTime": end_time,
        "purpose": purpose.strip(),
        "facultyCoordinator": faculty_coordinator.strip(),
        "coordinatorContact": clean_coord_contact,
        "supportingDocument": doc_path,
        "travelRequired": travel_required,
        "travelMode": travel_mode if travel_required else "",
        "parentPermission": parent_permission,
        "remarks": remarks.strip() if remarks else "",
        "status": OD_STATUS_PENDING,
        "advisorStatus": "PENDING",
        "hodStatus": "ACTION_REQUIRED",
        "approvalType": None,
        "approvalBy": None,
        "approvalDate": None,
        "approvedBy": None,
        "approvedByRole": None,
        "submittedAt": now_iso,
        "updatedAt": now_iso,
        "reviewedBy": None,
        "reviewedAt": None,
        "reviewerRemarks": None,
        # Stage-2 completion proof fields
        "completionStatus": None,
        "completionProof": None,
        "proofType": None,
        "proofUrl": None,
        "geoLocation": None,
        "completionSubmittedAt": None,
        "completionVerifiedBy": None,
        "completionVerifiedAt": None,
        "completionRemarks": None,
        "finalStatus": None,
        "approvalHistory": [
            {
                "action": "SUBMITTED",
                "userId": str(student_doc["_id"]),
                "role": "STUDENT",
                "timestamp": now_iso
            }
        ]
    }

    result = await mongo_db["od_requests"].insert_one(od_record)
    doc_id = str(result.inserted_id)

    # 1. Notify HOD of student's department
    dept = student_doc.get("department", "")
    hod_accounts = await mongo_db["staff_accounts"].find({"role": "hod"}).to_list(length=10)
    for hod in hod_accounts:
        if not dept or hod.get("department", "").upper() == dept.upper() or "AI" in hod.get("department", "").upper():
            await mongo_db["notifications"].insert_one({
                "user_id": str(hod["_id"]),
                "email": hod.get("email"),
                "category": "OD_REQUEST",
                "title": f"New OD Request: {student_doc['name']}",
                "message": f"{student_doc['name']} ({student_doc['register_no']}) submitted an OD request for {event_name.strip()} ({from_date} to {to_date}). Advisor: Pending | HOD: Action Required.",
                "reference_type": "od_request",
                "reference_id": request_id,
                "is_read": False,
                "created_at": now_iso
            })

    # 2. Notify Advisors
    advisors = await mongo_db["staff_accounts"].find({"role": "advisor"}).to_list(length=10)
    for adv in advisors:
        if not dept or adv.get("department", "").upper() == dept.upper() or "AI" in adv.get("department", "").upper():
            await mongo_db["notifications"].insert_one({
                "user_id": str(adv["_id"]),
                "email": adv.get("email"),
                "category": "OD_REQUEST",
                "title": f"New OD Request: {student_doc['name']}",
                "message": f"{student_doc['name']} ({student_doc['register_no']}) submitted an OD request for {event_name.strip()}.",
                "reference_type": "od_request",
                "reference_id": request_id,
                "is_read": False,
                "created_at": now_iso
            })

    return {
        "message": "OD request submitted successfully.",
        "requestId": request_id,
        "id": doc_id,
        "status": OD_STATUS_PENDING
    }


@router.post("/od-requests")
@router.post("/od/submit")
async def create_od_request(
    odType: str = Form(...),
    eventName: str = Form(...),
    organization: str = Form(...),
    location: str = Form(...),
    fromDate: str = Form(...),
    toDate: str = Form(...),
    startTime: str = Form(...),
    endTime: str = Form(...),
    purpose: str = Form(...),
    facultyCoordinator: str = Form(...),
    coordinatorContact: str = Form(...),
    travelRequired: bool = Form(False),
    travelMode: Optional[str] = Form(""),
    parentPermission: bool = Form(False),
    remarks: Optional[str] = Form(""),
    document: UploadFile = File(...),
    current_user: models.User = Depends(require_roles(models.UserRole.STUDENT)),
    mongo_db = Depends(get_db)
):
    return await _process_od_submission(
        od_type=odType,
        event_name=eventName,
        organization=organization,
        location=location,
        from_date=fromDate,
        to_date=toDate,
        start_time=startTime,
        end_time=endTime,
        purpose=purpose,
        faculty_coordinator=facultyCoordinator,
        coordinator_contact=coordinatorContact,
        travel_required=travelRequired,
        travel_mode=travelMode,
        parent_permission=parentPermission,
        remarks=remarks,
        document=document,
        current_user=current_user,
        mongo_db=mongo_db
    )


@router.get("/od-requests/my")
@router.get("/od/my")
async def get_my_od_requests_mongo(
    current_user: models.User = Depends(get_current_user),
    mongo_db = Depends(get_db)
):
    requests = await mongo_db["od_requests"].find({
        "$or": [
            {"registerNumber": current_user.login_id},
            {"studentId": str(current_user.id)},
            {"collegeEmail": current_user.email.lower() if current_user.email else ""}
        ]
    }).sort("submittedAt", -1).to_list(length=200)

    for r in requests:
        r["id"] = str(r["_id"])
        del r["_id"]

    return {"requests": requests}


@router.get("/od-requests/pending")
@router.get("/od/pending")
async def get_pending_od_requests_mongo(
    status_filter: Optional[str] = Query(None, alias="status"),
    department: Optional[str] = None,
    year: Optional[str] = None,
    section: Optional[str] = None,
    search: Optional[str] = None,
    approval_type: Optional[str] = None,
    tab: Optional[str] = Query(None),
    current_user: models.User = Depends(require_roles(
        models.UserRole.ADVISOR, models.UserRole.HOD, models.UserRole.DEO
    )),
    mongo_db = Depends(get_db)
):
    user_role = str(current_user.role).lower()
    query_filter = {}

    # Department Scope Enforcement for HOD & Advisor
    if user_role in ["hod", "advisor"]:
        staff_doc = await mongo_db["staff_accounts"].find_one({
            "$or": [{"email": current_user.email.lower() if current_user.email else ""}, {"login_id": current_user.login_id}]
        })
        user_dept = staff_doc.get("department") if staff_doc else None
        if user_dept:
            query_filter["$or"] = [
                {"department": user_dept},
                {"department": {"$regex": user_dept, "$options": "i"}}
            ]
            if "AI" in user_dept.upper() or "AIML" in user_dept.upper():
                query_filter["$or"].extend([
                    {"department": "CSE(AI&ML)"},
                    {"department": "AIML"}
                ])

    if department:
        query_filter["department"] = department
    if year:
        query_filter["year"] = year
    if section:
        query_filter["section"] = section
    if approval_type:
        query_filter["approvalType"] = approval_type

    def _add_or_filter(condition):
        """Combine an $or condition without clobbering existing filters."""
        if "$or" in query_filter:
            existing = query_filter.pop("$or")
            query_filter.setdefault("$and", []).extend([{"$or": existing}, {"$or": condition}])
        else:
            query_filter["$or"] = condition

    if tab:
        # Workflow tabs used by Advisor/HOD OD Requests screen
        if tab == "pending":
            query_filter["status"] = {"$in": ["Pending", OD_STATUS_PENDING]}
        elif tab == "approved":
            query_filter["status"] = OD_STATUS_AWAITING_PROOF
        elif tab == "completed":
            query_filter["status"] = OD_STATUS_FINAL
        elif tab == "rejected":
            _add_or_filter([{"status": OD_STATUS_REJECTED}, {"completionStatus": COMPLETION_REJECTED}])
        elif tab == "all":
            pass
        else:
            raise HTTPException(status_code=400, detail="Invalid tab. Use: pending, approved, completed, rejected, all.")
    elif status_filter:
        if status_filter.lower() != "all":
            query_filter["status"] = status_filter
    else:
        # Default pending list shows stage-1 requests awaiting approval
        query_filter["status"] = {"$in": ["Pending", OD_STATUS_PENDING]}

    if search:
        search_or = [
            {"studentName": {"$regex": search, "$options": "i"}},
            {"registerNumber": {"$regex": search, "$options": "i"}},
            {"eventName": {"$regex": search, "$options": "i"}}
        ]
        if "$or" in query_filter:
            query_filter["$and"] = [{"$or": query_filter.pop("$or")}, {"$or": search_or}]
        else:
            query_filter["$or"] = search_or

    requests = await mongo_db["od_requests"].find(query_filter).sort("submittedAt", -1).to_list(length=200)

    for r in requests:
        r["id"] = str(r["_id"])
        del r["_id"]

    return {"requests": requests}


@router.post("/od-requests/{request_id}/cancel")
async def cancel_od_request(
    request_id: str,
    current_user: models.User = Depends(get_current_user),
    mongo_db = Depends(get_db)
):
    from bson import ObjectId
    query = {"$or": [{"requestId": request_id}]}
    if ObjectId.is_valid(request_id):
        query["$or"].append({"_id": ObjectId(request_id)})

    od = await mongo_db["od_requests"].find_one(query)
    if not od:
        raise HTTPException(status_code=404, detail="OD request not found")

    if str(current_user.role).lower() == "student":
        if (
            od.get("registerNumber") != current_user.login_id
            and od.get("studentId") != str(current_user.id)
        ):
            raise HTTPException(status_code=403, detail="Access denied. You can only cancel your own OD requests.")

    if od.get("status") not in ["Pending", OD_STATUS_PENDING]:
        raise HTTPException(status_code=400, detail="Only pending requests can be cancelled.")

    now_iso = datetime.now(timezone.utc).isoformat()
    await mongo_db["od_requests"].update_one(
        {"_id": od["_id"]},
        {
            "$set": {"status": "Cancelled", "updatedAt": now_iso},
            "$push": {
                "approvalHistory": {
                    "action": "CANCELLED",
                    "userId": str(current_user.id),
                    "role": str(current_user.role).upper(),
                    "timestamp": now_iso
                }
            }
        }
    )
    return {"message": "OD request cancelled successfully.", "status": "Cancelled"}


@router.post("/od-requests/{request_id}/review")
async def review_od_request(
    request_id: str,
    status: str = Form(...), # "Approved" or "Rejected"
    reviewerRemarks: Optional[str] = Form(""),
    current_user: models.User = Depends(require_roles(
        models.UserRole.ADVISOR, models.UserRole.HOD, models.UserRole.DEO
    )),
    mongo_db = Depends(get_db)
):
    if status not in ["Approved", "Rejected"]:
        raise HTTPException(status_code=400, detail="Status must be 'Approved' or 'Rejected'")

    from bson import ObjectId
    query = {"$or": [{"requestId": request_id}]}
    if ObjectId.is_valid(request_id):
        query["$or"].append({"_id": ObjectId(request_id)})

    od = await mongo_db["od_requests"].find_one(query)
    if not od:
        raise HTTPException(status_code=404, detail="OD request not found")

    user_role = str(current_user.role).lower()
    now_iso = datetime.now(timezone.utc).isoformat()

    # Stage-1 request must still be awaiting first approval (two-stage OD workflow)
    already_processed = (
        od.get("status") in [OD_STATUS_AWAITING_PROOF, OD_STATUS_FINAL, "Approved", "Rejected", "Cancelled"]
        or od.get("completionStatus") in [COMPLETION_PENDING, COMPLETION_APPROVED]
    )
    if already_processed:
        raise HTTPException(status_code=400, detail="This request has already been processed.")

    # 1. HOD ACTION (Direct or Final Approval/Rejection)
    if user_role == "hod":
        # Department Security Check
        staff_doc = await mongo_db["staff_accounts"].find_one({
            "$or": [{"email": current_user.email.lower() if current_user.email else ""}, {"login_id": current_user.login_id}]
        })
        hod_dept = staff_doc.get("department", "") if staff_doc else ""
        req_dept = od.get("department", "")

        # Strict Department check
        if hod_dept and req_dept and hod_dept.upper() not in req_dept.upper() and req_dept.upper() not in hod_dept.upper():
            if not ("AI" in hod_dept.upper() and "AI" in req_dept.upper()):
                raise HTTPException(status_code=403, detail=f"Security Violation: HOD from {hod_dept} cannot process requests for department {req_dept}.")

        if status == "Approved":
            approval_type = "HOD_APPROVAL"
            adv_status_new = od.get("advisorStatus", "PENDING")
            if adv_status_new == "PENDING":
                adv_status_new = "NOT_REQUIRED"

            await mongo_db["od_requests"].update_one(
                {"_id": od["_id"]},
                {
                    "$set": {
                        "status": OD_STATUS_AWAITING_PROOF,
                        "hodStatus": "APPROVED",
                        "advisorStatus": adv_status_new,
                        "approvalType": approval_type,
                        "approvalBy": current_user.full_name or current_user.login_id,
                        "approvalDate": now_iso,
                        "approvedBy": current_user.full_name or current_user.login_id,
                        "approvedByRole": "HOD",
                        "reviewedBy": current_user.full_name or current_user.login_id,
                        "reviewedAt": now_iso,
                        "reviewerRemarks": reviewerRemarks or "",
                        "updatedAt": now_iso
                    },
                    "$push": {
                        "approvalHistory": {
                            "action": "APPROVED",
                            "userId": str(current_user.id),
                            "role": "HOD",
                            "approvalType": approval_type,
                            "timestamp": now_iso,
                            "remarks": reviewerRemarks or ""
                        }
                    }
                }
            )

            # Notify Student - stage 1 approved, completion proof now required
            await mongo_db["notifications"].insert_one({
                "user_id": od.get("studentId"),
                "email": od.get("collegeEmail"),
                "category": "OD_APPROVAL",
                "title": "OD Request Approved",
                "message": STUDENT_OD_APPROVED_MSG,
                "reference_type": "od_request",
                "reference_id": od.get("requestId"),
                "is_read": False,
                "created_at": now_iso
            })

            return {
                "message": "OD request approved successfully.",
                "status": OD_STATUS_AWAITING_PROOF,
                "approvalType": approval_type,
                "approvedBy": current_user.full_name or current_user.login_id
            }

        else: # HOD Rejects
            approval_type = "HOD_REJECTION"
            await mongo_db["od_requests"].update_one(
                {"_id": od["_id"]},
                {
                    "$set": {
                        "status": OD_STATUS_REJECTED,
                        "hodStatus": "REJECTED",
                        "approvalType": approval_type,
                        "approvalBy": current_user.full_name or current_user.login_id,
                        "approvalDate": now_iso,
                        "approvedBy": current_user.full_name or current_user.login_id,
                        "approvedByRole": "HOD",
                        "reviewedBy": current_user.full_name or current_user.login_id,
                        "reviewedAt": now_iso,
                        "reviewerRemarks": reviewerRemarks or "",
                        "updatedAt": now_iso
                    },
                    "$push": {
                        "approvalHistory": {
                            "action": "REJECTED",
                            "userId": str(current_user.id),
                            "role": "HOD",
                            "approvalType": approval_type,
                            "timestamp": now_iso,
                            "remarks": reviewerRemarks or ""
                        }
                    }
                }
            )

            # Notify Student
            await mongo_db["notifications"].insert_one({
                "user_id": od.get("studentId"),
                "email": od.get("collegeEmail"),
                "category": "OD_APPROVAL",
                "title": "OD Request Rejected",
                "message": STUDENT_OD_REJECTED_MSG,
                "reference_type": "od_request",
                "reference_id": od.get("requestId"),
                "is_read": False,
                "created_at": now_iso
            })

            return {"message": "OD request rejected successfully.", "status": OD_STATUS_REJECTED, "approvalType": approval_type}

    # 2. ADVISOR ACTION (single-stage approval - moves OD to completion proof stage)
    elif user_role == "advisor":
        if status == "Approved":
            await mongo_db["od_requests"].update_one(
                {"_id": od["_id"]},
                {
                    "$set": {
                        "status": OD_STATUS_AWAITING_PROOF,
                        "advisorStatus": "APPROVED",
                        "hodStatus": "NOT_REQUIRED",
                        "approvalType": "ADVISOR_APPROVAL",
                        "approvalBy": current_user.full_name or current_user.login_id,
                        "approvalDate": now_iso,
                        "approvedBy": current_user.full_name or current_user.login_id,
                        "approvedByRole": "ADVISOR",
                        "reviewedBy": current_user.full_name or current_user.login_id,
                        "reviewedAt": now_iso,
                        "reviewerRemarks": reviewerRemarks or "",
                        "updatedAt": now_iso
                    },
                    "$push": {
                        "approvalHistory": {
                            "action": "APPROVED",
                            "userId": str(current_user.id),
                            "role": "ADVISOR",
                            "approvalType": "ADVISOR_APPROVAL",
                            "timestamp": now_iso,
                            "remarks": reviewerRemarks or ""
                        }
                    }
                }
            )

            # Notify HOD that stage 1 was approved (visibility only)
            dept = od.get("department", "")
            hod_accounts = await mongo_db["staff_accounts"].find({"role": "hod"}).to_list(length=10)
            for hod in hod_accounts:
                if not dept or hod.get("department", "").upper() == dept.upper() or "AI" in hod.get("department", "").upper():
                    await mongo_db["notifications"].insert_one({
                        "user_id": str(hod["_id"]),
                        "email": hod.get("email"),
                        "category": "OD_REQUEST",
                        "title": f"Advisor Approved OD: {od.get('studentName')}",
                        "message": f"Advisor approved OD request for {od.get('studentName')} ({od.get('registerNumber')}). Awaiting completion proof.",
                        "reference_type": "od_request",
                        "reference_id": od.get("requestId"),
                        "is_read": False,
                        "created_at": now_iso
                    })

            # Notify Student - stage 1 approved, completion proof now required
            await mongo_db["notifications"].insert_one({
                "user_id": od.get("studentId"),
                "email": od.get("collegeEmail"),
                "category": "OD_APPROVAL",
                "title": "OD Request Approved",
                "message": STUDENT_OD_APPROVED_MSG,
                "reference_type": "od_request",
                "reference_id": od.get("requestId"),
                "is_read": False,
                "created_at": now_iso
            })

            return {
                "message": "OD request approved successfully.",
                "status": OD_STATUS_AWAITING_PROOF,
                "advisorStatus": "APPROVED"
            }

        else: # Advisor Rejects
            await mongo_db["od_requests"].update_one(
                {"_id": od["_id"]},
                {
                    "$set": {
                        "status": OD_STATUS_REJECTED,
                        "advisorStatus": "REJECTED",
                        "approvalType": "ADVISOR_REJECTION",
                        "approvalBy": current_user.full_name or current_user.login_id,
                        "approvalDate": now_iso,
                        "approvedBy": current_user.full_name or current_user.login_id,
                        "approvedByRole": "ADVISOR",
                        "reviewedBy": current_user.full_name or current_user.login_id,
                        "reviewedAt": now_iso,
                        "reviewerRemarks": reviewerRemarks or "",
                        "updatedAt": now_iso
                    },
                    "$push": {
                        "approvalHistory": {
                            "action": "REJECTED",
                            "userId": str(current_user.id),
                            "role": "ADVISOR",
                            "approvalType": "ADVISOR_REJECTION",
                            "timestamp": now_iso,
                            "remarks": reviewerRemarks or ""
                        }
                    }
                }
            )

            # Notify Student
            await mongo_db["notifications"].insert_one({
                "user_id": od.get("studentId"),
                "email": od.get("collegeEmail"),
                "category": "OD_APPROVAL",
                "title": "OD Request Rejected",
                "message": STUDENT_OD_REJECTED_MSG,
                "reference_type": "od_request",
                "reference_id": od.get("requestId"),
                "is_read": False,
                "created_at": now_iso
            })

            return {"message": "OD request rejected successfully.", "status": OD_STATUS_REJECTED}

    # DEO / Admin fallback
    else:
        new_status = OD_STATUS_AWAITING_PROOF if status == "Approved" else OD_STATUS_REJECTED
        await mongo_db["od_requests"].update_one(
            {"_id": od["_id"]},
            {
                "$set": {
                    "status": new_status,
                    "approvalBy": current_user.full_name or current_user.login_id,
                    "approvalDate": now_iso,
                    "approvedBy": current_user.full_name or current_user.login_id,
                    "approvedByRole": str(current_user.role).upper(),
                    "reviewedBy": current_user.full_name or current_user.login_id,
                    "reviewedAt": now_iso,
                    "reviewerRemarks": reviewerRemarks or "",
                    "updatedAt": now_iso
                },
                "$push": {
                    "approvalHistory": {
                        "action": status.upper(),
                        "userId": str(current_user.id),
                        "role": str(current_user.role).upper(),
                        "timestamp": now_iso,
                        "remarks": reviewerRemarks or ""
                    }
                }
            }
        )
        await mongo_db["notifications"].insert_one({
            "user_id": od.get("studentId"),
            "email": od.get("collegeEmail"),
            "category": "OD_APPROVAL",
            "title": "OD Request Approved" if status == "Approved" else "OD Request Rejected",
            "message": STUDENT_OD_APPROVED_MSG if status == "Approved" else STUDENT_OD_REJECTED_MSG,
            "reference_type": "od_request",
            "reference_id": od.get("requestId"),
            "is_read": False,
            "created_at": now_iso
        })
        return {
            "message": "OD request approved successfully." if status == "Approved" else "OD request rejected successfully.",
            "status": new_status
        }


@router.get("/od-requests/approved")
async def get_approved_od_requests(
    selected_date: Optional[str] = Query(None, alias="date"),
    from_date: Optional[str] = Query(None, alias="fromDate"),
    to_date: Optional[str] = Query(None, alias="toDate"),
    department: Optional[str] = None,
    year: Optional[str] = None,
    section: Optional[str] = None,
    search: Optional[str] = None,
    od_type: Optional[str] = Query(None, alias="odType"),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    current_user: models.User = Depends(require_roles(
        models.UserRole.ADVISOR, models.UserRole.HOD, models.UserRole.FACULTY,
        models.UserRole.STAFF, models.UserRole.DEO
    )),
    mongo_db = Depends(get_db)
):
    """
    Get approved OD records for a specific date (or date range).
    Only shows requests where: stage-1 or final approved AND selectedDate is within [fromDate, toDate].
    """
    user_role = str(current_user.role).lower()

    today_str = date.today().isoformat()
    if selected_date:
        check_date = selected_date
    else:
        check_date = today_str

    query_filter = {
        "status": {"$in": ["Approved", OD_STATUS_AWAITING_PROOF, OD_STATUS_FINAL]}
    }

    # Date filtering: approved requests that overlap with selected date or range
    if from_date and to_date:
        if "$and" not in query_filter:
            query_filter["$and"] = []
        query_filter["$and"].extend([
            {"fromDate": {"$lte": to_date}},
            {"toDate": {"$gte": from_date}}
        ])
    else:
        query_filter["fromDate"] = {"$lte": check_date}
        query_filter["toDate"] = {"$gte": check_date}

    # Department scope for HOD and Advisor
    if user_role in ["hod", "advisor"]:
        staff_doc = await mongo_db["staff_accounts"].find_one({
            "$or": [
                {"email": current_user.email.lower() if current_user.email else ""},
                {"login_id": current_user.login_id}
            ]
        })
        user_dept = staff_doc.get("department") if staff_doc else None
        if user_dept:
            dept_filter = [
                {"department": user_dept},
                {"department": {"$regex": user_dept, "$options": "i"}}
            ]
            if "AI" in user_dept.upper() or "AIML" in user_dept.upper():
                dept_filter.extend([
                    {"department": "CSE(AI&ML)"},
                    {"department": "AIML"}
                ])
            if "$and" in query_filter:
                query_filter["$and"].append({"$or": dept_filter})
            else:
                query_filter["$or"] = dept_filter

    if department:
        query_filter["department"] = department
    if year:
        query_filter["year"] = year
    if section:
        query_filter["section"] = section
    if od_type:
        query_filter["odType"] = od_type

    if search:
        search_or = [
            {"studentName": {"$regex": search, "$options": "i"}},
            {"registerNumber": {"$regex": search, "$options": "i"}},
            {"rollNumber": {"$regex": search, "$options": "i"}},
            {"eventName": {"$regex": search, "$options": "i"}}
        ]
        if "$or" in query_filter:
            existing_or = query_filter.pop("$or")
            if "$and" not in query_filter:
                query_filter["$and"] = []
            query_filter["$and"].extend([{"$or": existing_or}, {"$or": search_or}])
        elif "$and" in query_filter:
            query_filter["$and"].append({"$or": search_or})
        else:
            query_filter["$or"] = search_or

    page_num = page
    skip = (page_num - 1) * limit
    total = await mongo_db["od_requests"].count_documents(query_filter)
    records = await mongo_db["od_requests"].find(query_filter).sort(
        [("fromDate", 1), ("studentName", 1)]
    ).skip(skip).limit(limit).to_list(length=limit)

    for r in records:
        r["id"] = str(r["_id"])
        del r["_id"]

    return {
        "records": records,
        "total": total,
        "page": page_num,
        "limit": limit,
        "selectedDate": check_date,
        "totalPages": max(1, (total + limit - 1) // limit)
    }


# ============================================================
# STAGE 2 - OD COMPLETION PROOF SUBMISSION & VERIFICATION
# ============================================================

@router.get("/od-requests/completion-pending")
@router.get("/od/completion/pending")
async def get_od_completion_pending(
    department: Optional[str] = None,
    year: Optional[str] = None,
    section: Optional[str] = None,
    search: Optional[str] = None,
    current_user: models.User = Depends(require_roles(
        models.UserRole.ADVISOR, models.UserRole.HOD, models.UserRole.DEO
    )),
    mongo_db = Depends(get_db)
):
    """OD Completion Verification: all students awaiting completion proof review."""
    user_role = str(current_user.role).lower()
    query_filter = {"completionStatus": COMPLETION_PENDING}

    # Department Scope Enforcement for HOD & Advisor
    if user_role in ["hod", "advisor"]:
        staff_doc = await mongo_db["staff_accounts"].find_one({
            "$or": [{"email": current_user.email.lower() if current_user.email else ""}, {"login_id": current_user.login_id}]
        })
        user_dept = staff_doc.get("department") if staff_doc else None
        if user_dept:
            dept_filter = [
                {"department": user_dept},
                {"department": {"$regex": user_dept, "$options": "i"}}
            ]
            if "AI" in user_dept.upper() or "AIML" in user_dept.upper():
                dept_filter.extend([
                    {"department": "CSE(AI&ML)"},
                    {"department": "AIML"}
                ])
            query_filter["$or"] = dept_filter

    if department:
        query_filter["department"] = department
    if year:
        query_filter["year"] = year
    if section:
        query_filter["section"] = section

    if search:
        search_or = [
            {"studentName": {"$regex": search, "$options": "i"}},
            {"registerNumber": {"$regex": search, "$options": "i"}},
            {"eventName": {"$regex": search, "$options": "i"}}
        ]
        if "$or" in query_filter:
            existing_or = query_filter.pop("$or")
            query_filter["$and"] = [{"$or": existing_or}, {"$or": search_or}]
        else:
            query_filter["$or"] = search_or

    requests = await mongo_db["od_requests"].find(query_filter).sort(
        "completionSubmittedAt", -1
    ).to_list(length=200)

    for r in requests:
        r["id"] = str(r["_id"])
        del r["_id"]

    return {"requests": requests}


@router.post("/od-requests/{request_id}/completion-proof")
async def submit_completion_proof(
    request_id: str,
    proofType: str = Form(...),
    proof: UploadFile = File(...),
    latitude: Optional[str] = Form(""),
    longitude: Optional[str] = Form(""),
    locationAddress: Optional[str] = Form(""),
    remarks: Optional[str] = Form(""),
    current_user: models.User = Depends(require_roles(models.UserRole.STUDENT)),
    mongo_db = Depends(get_db)
):
    """
    Stage 2 submission by the student: certificate OR geo-tagged event photo.
    Always references the original OD request ID.
    """
    from bson import ObjectId
    query = {"$or": [{"requestId": request_id}]}
    if ObjectId.is_valid(request_id):
        query["$or"].append({"_id": ObjectId(request_id)})

    od = await mongo_db["od_requests"].find_one(query)
    if not od:
        raise HTTPException(status_code=404, detail="OD request not found")

    # Ownership - a student can only submit proof for their own OD request
    if (
        od.get("registerNumber") != current_user.login_id
        and od.get("studentId") != str(current_user.id)
        and od.get("collegeEmail", "").lower() != (current_user.email or "").lower()
    ):
        raise HTTPException(
            status_code=403,
            detail="Access denied. You can only submit completion proof for your own OD request."
        )

    if od.get("status") != OD_STATUS_AWAITING_PROOF:
        raise HTTPException(
            status_code=400,
            detail="Completion proof can be submitted only after the OD request has been approved."
        )

    if od.get("completionStatus") == COMPLETION_PENDING:
        raise HTTPException(status_code=400, detail="Completion proof already submitted. Awaiting verification.")

    proof_type = (proofType or "").strip().upper().replace("-", "_").replace(" ", "_")
    if proof_type in [PROOF_CERTIFICATE, "CERT", "CERTIFICATE_UPLOAD"]:
        proof_type = PROOF_CERTIFICATE
    elif proof_type in [PROOF_GEO_PHOTO, "GEOTAGGED_PHOTO", "GEO_PHOTO", "PHOTO", "GEO_TAGGED"]:
        proof_type = PROOF_GEO_PHOTO
    else:
        raise HTTPException(status_code=400, detail="Proof type must be a Certificate or a Geo-tagged Photo.")

    allowed_exts = [".pdf", ".jpg", ".jpeg", ".png"]
    ext = os.path.splitext(proof.filename or "")[-1].lower()
    if ext not in allowed_exts:
        raise HTTPException(status_code=400, detail=f"Invalid proof format '{ext}'. Allowed: PDF, JPG, JPEG, PNG.")
    if proof_type == PROOF_GEO_PHOTO and ext == ".pdf":
        raise HTTPException(status_code=400, detail="A geo-tagged photo must be an image file (JPG, JPEG or PNG).")

    content = await proof.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File size exceeds maximum limit of 10MB.")

    upload_dir = os.path.join(settings.UPLOAD_DIR, "od", "proof")
    os.makedirs(upload_dir, exist_ok=True)
    filename = f"{uuid.uuid4()}{ext}"
    file_dest = os.path.join(upload_dir, filename)
    with open(file_dest, "wb") as f:
        f.write(content)
    doc_path = f"/uploads/od/proof/{filename}"

    now_iso = datetime.now(timezone.utc).isoformat()

    geo_location = None
    if proof_type == PROOF_GEO_PHOTO:
        geo_location = {
            "latitude": (latitude or "").strip(),
            "longitude": (longitude or "").strip(),
            "address": (locationAddress or "").strip(),
            "capturedAt": now_iso,
        }

    proof_id = f"ODP-{datetime.now().strftime('%Y%m%d')}-{secrets.token_hex(2).upper()}"

    # Stage-2 submission record - always references the original OD request
    proof_record = {
        "proofId": proof_id,
        "odRequestId": od.get("requestId"),
        "odDocId": str(od["_id"]),
        "studentId": od.get("studentId"),
        "studentName": od.get("studentName"),
        "registerNumber": od.get("registerNumber"),
        "rollNumber": od.get("rollNumber", ""),
        "department": od.get("department", ""),
        "year": od.get("year", ""),
        "section": od.get("section", ""),
        "eventName": od.get("eventName"),
        "odType": od.get("odType"),
        "fromDate": od.get("fromDate"),
        "toDate": od.get("toDate"),
        "odDate": od.get("fromDate"),
        "proofType": proof_type,
        "proofFile": doc_path,
        "proofUrl": doc_path,
        "fileName": proof.filename or filename,
        "geoLocation": geo_location,
        "remarks": remarks.strip() if remarks else "",
        "status": COMPLETION_PENDING,
        "submittedAt": now_iso,
        "createdAt": now_iso,
        "verifiedBy": None,
        "verifiedAt": None,
    }
    await mongo_db["od_completion_proofs"].insert_one(proof_record)

    # Mirror stage-2 fields onto the original OD request
    await mongo_db["od_requests"].update_one(
        {"_id": od["_id"]},
        {
            "$set": {
                "completionStatus": COMPLETION_PENDING,
                "completionProof": doc_path,
                "proofType": proof_type,
                "proofUrl": doc_path,
                "geoLocation": geo_location,
                "completionSubmittedAt": now_iso,
                "completionRemarks": remarks.strip() if remarks else "",
                "completionVerifiedBy": None,
                "completionVerifiedAt": None,
                "updatedAt": now_iso
            },
            "$push": {
                "approvalHistory": {
                    "action": "COMPLETION_PROOF_SUBMITTED",
                    "userId": str(current_user.id),
                    "role": "STUDENT",
                    "proofType": proof_type,
                    "timestamp": now_iso,
                    "remarks": remarks.strip() if remarks else ""
                }
            }
        }
    )

    # Notify Advisors & HOD that proof awaits verification
    dept = od.get("department", "")
    proof_notif = {
        "category": "OD_REQUEST",
        "title": "OD Completion Proof Submitted",
        "message": f"{od.get('studentName')} ({od.get('registerNumber')}) submitted OD completion proof for '{od.get('eventName')}'. Pending verification.",
        "reference_type": "od_request",
        "reference_id": od.get("requestId"),
        "is_read": False,
        "created_at": now_iso
    }
    advisors = await mongo_db["staff_accounts"].find({"role": "advisor"}).to_list(length=20)
    for adv in advisors:
        if not dept or adv.get("department", "").upper() == dept.upper() or "AI" in adv.get("department", "").upper():
            await mongo_db["notifications"].insert_one({
                **proof_notif,
                "user_id": str(adv["_id"]),
                "email": adv.get("email")
            })
    hod_accounts = await mongo_db["staff_accounts"].find({"role": "hod"}).to_list(length=20)
    for hod in hod_accounts:
        if not dept or hod.get("department", "").upper() == dept.upper() or "AI" in hod.get("department", "").upper():
            await mongo_db["notifications"].insert_one({
                **proof_notif,
                "user_id": str(hod["_id"]),
                "email": hod.get("email")
            })

    return {
        "message": STUDENT_PROOF_SUBMITTED_MSG,
        "proofId": proof_id,
        "odRequestId": od.get("requestId"),
        "completionStatus": COMPLETION_PENDING,
        "status": od.get("status")
    }


@router.post("/od-requests/{request_id}/completion-review")
async def review_completion_proof(
    request_id: str,
    status: str = Form(...),  # "Approved" or "Rejected"
    reviewerRemarks: Optional[str] = Form(""),
    current_user: models.User = Depends(require_roles(
        models.UserRole.ADVISOR, models.UserRole.HOD, models.UserRole.DEO
    )),
    mongo_db = Depends(get_db)
):
    """
    Stage 2 verification by Advisor/HOD/DEO.
    Final approval marks attendance as OD (attendance is never touched before this).
    """
    if status not in ["Approved", "Rejected"]:
        raise HTTPException(status_code=400, detail="Status must be 'Approved' or 'Rejected'")

    from bson import ObjectId
    query = {"$or": [{"requestId": request_id}]}
    if ObjectId.is_valid(request_id):
        query["$or"].append({"_id": ObjectId(request_id)})

    od = await mongo_db["od_requests"].find_one(query)
    if not od:
        raise HTTPException(status_code=404, detail="OD request not found")

    if od.get("completionStatus") != COMPLETION_PENDING:
        raise HTTPException(status_code=400, detail="No completion proof is pending verification for this OD request.")

    user_role = str(current_user.role).lower()
    now_iso = datetime.now(timezone.utc).isoformat()
    reviewer_name = current_user.full_name or current_user.login_id

    # Department Security Check for HOD
    if user_role == "hod":
        staff_doc = await mongo_db["staff_accounts"].find_one({
            "$or": [{"email": current_user.email.lower() if current_user.email else ""}, {"login_id": current_user.login_id}]
        })
        hod_dept = staff_doc.get("department", "") if staff_doc else ""
        req_dept = od.get("department", "")
        if hod_dept and req_dept and hod_dept.upper() not in req_dept.upper() and req_dept.upper() not in hod_dept.upper():
            if not ("AI" in hod_dept.upper() and "AI" in req_dept.upper()):
                raise HTTPException(status_code=403, detail=f"Security Violation: HOD from {hod_dept} cannot process requests for department {req_dept}.")

    if status == "Approved":
        # FINAL APPROVAL - update OD request to Fulfilled
        await mongo_db["od_requests"].update_one(
            {"_id": od["_id"]},
            {
                "$set": {
                    "completionStatus": COMPLETION_APPROVED,
                    "status": OD_STATUS_FINAL,
                    "finalStatus": OD_STATUS_FINAL,
                    "completionVerifiedBy": reviewer_name,
                    "completionVerifiedAt": now_iso,
                    "completionVerifiedByRole": user_role.upper(),
                    "completionRemarks": reviewerRemarks or "",
                    "updatedAt": now_iso
                },
                "$push": {
                    "approvalHistory": {
                        "action": "COMPLETION_PROOF_APPROVED",
                        "userId": str(current_user.id),
                        "role": user_role.upper(),
                        "timestamp": now_iso,
                        "remarks": reviewerRemarks or ""
                    }
                }
            }
        )

        await mongo_db["od_completion_proofs"].update_many(
            {"odRequestId": od.get("requestId"), "status": COMPLETION_PENDING},
            {"$set": {
                "status": COMPLETION_APPROVED,
                "verifiedBy": reviewer_name,
                "verifiedAt": now_iso,
                "verifiedByRole": user_role.upper()
            }}
        )

        # Attendance integration - ONLY after final approval
        od["status"] = OD_STATUS_FINAL
        od["completionStatus"] = COMPLETION_APPROVED
        updated_count, created_count = await _apply_final_od_to_attendance(mongo_db, od, reviewer_name)

        await mongo_db["audit_logs"].insert_one({
            "action": "OD_COMPLETION_PROOF_APPROVED",
            "entity_type": "od_request",
            "entity_id": od.get("requestId"),
            "user_id": str(current_user.id),
            "user_role": user_role,
            "new_value": {
                "completionStatus": COMPLETION_APPROVED,
                "status": OD_STATUS_FINAL,
                "attendanceUpdated": updated_count,
                "attendanceCreated": created_count
            },
            "reason": reviewerRemarks or "",
            "created_at": now_iso
        })

        # Notify Student
        await mongo_db["notifications"].insert_one({
            "user_id": od.get("studentId"),
            "email": od.get("collegeEmail"),
            "category": "OD_APPROVAL",
            "title": "OD Completion Proof Approved",
            "message": STUDENT_OD_FINAL_MSG,
            "reference_type": "od_request",
            "reference_id": od.get("requestId"),
            "is_read": False,
            "created_at": now_iso
        })

        return {
            "message": "OD completion proof approved successfully. Your OD has been confirmed.",
            "status": OD_STATUS_FINAL,
            "completionStatus": COMPLETION_APPROVED,
            "attendanceUpdated": updated_count,
            "attendanceCreated": created_count
        }

    else:  # Reject completion proof - student may resubmit
        await mongo_db["od_requests"].update_one(
            {"_id": od["_id"]},
            {
                "$set": {
                    "completionStatus": COMPLETION_REJECTED,
                    "completionVerifiedBy": reviewer_name,
                    "completionVerifiedAt": now_iso,
                    "completionVerifiedByRole": user_role.upper(),
                    "completionRemarks": reviewerRemarks or "",
                    "updatedAt": now_iso
                },
                "$push": {
                    "approvalHistory": {
                        "action": "COMPLETION_PROOF_REJECTED",
                        "userId": str(current_user.id),
                        "role": user_role.upper(),
                        "timestamp": now_iso,
                        "remarks": reviewerRemarks or ""
                    }
                }
            }
        )

        await mongo_db["od_completion_proofs"].update_many(
            {"odRequestId": od.get("requestId"), "status": COMPLETION_PENDING},
            {"$set": {
                "status": COMPLETION_REJECTED,
                "verifiedBy": reviewer_name,
                "verifiedAt": now_iso,
                "verifiedByRole": user_role.upper()
            }}
        )

        await mongo_db["audit_logs"].insert_one({
            "action": "OD_COMPLETION_PROOF_REJECTED",
            "entity_type": "od_request",
            "entity_id": od.get("requestId"),
            "user_id": str(current_user.id),
            "user_role": user_role,
            "new_value": {"completionStatus": COMPLETION_REJECTED},
            "reason": reviewerRemarks or "",
            "created_at": now_iso
        })

        # Notify Student
        await mongo_db["notifications"].insert_one({
            "user_id": od.get("studentId"),
            "email": od.get("collegeEmail"),
            "category": "OD_APPROVAL",
            "title": "OD Completion Proof Rejected",
            "message": STUDENT_PROOF_REJECTED_MSG,
            "reference_type": "od_request",
            "reference_id": od.get("requestId"),
            "is_read": False,
            "created_at": now_iso
        })

        return {
            "message": "Completion proof rejected successfully.",
            "status": od.get("status"),
            "completionStatus": COMPLETION_REJECTED
        }


# NOTE: /od-requests/{request_id} detail route is registered LAST on purpose so it
# does not shadow literal routes such as /od-requests/approved and
# /od-requests/completion-pending (FastAPI matches routes in registration order).
@router.get("/od-requests/{request_id}")
@router.get("/od/{request_id}")
async def get_od_request_detail(
    request_id: str,
    current_user: models.User = Depends(get_current_user),
    mongo_db = Depends(get_db)
):
    from bson import ObjectId
    query = {"$or": [{"requestId": request_id}]}
    if ObjectId.is_valid(request_id):
        query["$or"].append({"_id": ObjectId(request_id)})

    od = await mongo_db["od_requests"].find_one(query)
    if not od:
        raise HTTPException(status_code=404, detail="OD request not found")

    # Enforce Student Data Security
    if str(current_user.role).lower() == "student":
        if (
            od.get("registerNumber") != current_user.login_id
            and od.get("studentId") != str(current_user.id)
            and od.get("collegeEmail", "").lower() != (current_user.email or "").lower()
        ):
            raise HTTPException(status_code=403, detail="Access denied. You can only view your own OD requests.")

    od["id"] = str(od["_id"])
    del od["_id"]
    return od


