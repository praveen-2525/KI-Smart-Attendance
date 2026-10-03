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
        "status": "Pending"
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
        "status": "Pending",
        "advisorStatus": "PENDING",
        "hodStatus": "ACTION_REQUIRED",
        "approvalType": None,
        "approvedBy": None,
        "approvedByRole": None,
        "submittedAt": now_iso,
        "updatedAt": now_iso,
        "reviewedBy": None,
        "reviewedAt": None,
        "reviewerRemarks": None,
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
        "status": "Pending"
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

    if status_filter:
        if status_filter.lower() != "all":
            query_filter["status"] = status_filter
    else:
        # Default pending list shows requests that are overall "Pending"
        query_filter["status"] = "Pending"

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

    if od.get("status") != "Pending":
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

    # Prevent duplicate approval actions if request is already processed by HOD
    if od.get("status") in ["Approved", "Rejected"] or od.get("hodStatus") in ["APPROVED", "REJECTED"]:
        raise HTTPException(status_code=400, detail="This request has already been processed by HOD.")

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

        advisor_status_curr = od.get("advisorStatus", "PENDING")
        if status == "Approved":
            approval_type = "HOD_DIRECT_APPROVAL" if advisor_status_curr == "PENDING" else "NORMAL_HOD_APPROVAL"
            adv_status_new = "BYPASSED" if advisor_status_curr == "PENDING" else advisor_status_curr

            await mongo_db["od_requests"].update_one(
                {"_id": od["_id"]},
                {
                    "$set": {
                        "status": "Approved",
                        "hodStatus": "APPROVED",
                        "advisorStatus": adv_status_new,
                        "approvalType": approval_type,
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

            # Notify Student
            notif_msg = f"Your OD request for '{od.get('eventName')}' was approved directly by HOD." if approval_type == "HOD_DIRECT_APPROVAL" else f"Your OD request for '{od.get('eventName')}' was approved by HOD."
            await mongo_db["notifications"].insert_one({
                "user_id": od.get("studentId"),
                "email": od.get("collegeEmail"),
                "category": "OD_APPROVAL",
                "title": "OD Request Approved",
                "message": notif_msg,
                "reference_type": "od_request",
                "reference_id": od.get("requestId"),
                "is_read": False,
                "created_at": now_iso
            })

            return {
                "message": "OD request approved directly by HOD.",
                "status": "Approved",
                "approvalType": approval_type,
                "approvedBy": current_user.full_name or current_user.login_id
            }

        else: # HOD Rejects
            approval_type = "HOD_DIRECT_REJECTION"
            await mongo_db["od_requests"].update_one(
                {"_id": od["_id"]},
                {
                    "$set": {
                        "status": "Rejected",
                        "hodStatus": "REJECTED",
                        "approvalType": approval_type,
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
                "message": f"Your OD request for '{od.get('eventName')}' was rejected by HOD. Remarks: {reviewerRemarks or 'None'}",
                "reference_type": "od_request",
                "reference_id": od.get("requestId"),
                "is_read": False,
                "created_at": now_iso
            })

            return {"message": "OD request rejected by HOD.", "status": "Rejected", "approvalType": approval_type}

    # 2. ADVISOR ACTION
    elif user_role == "advisor":
        if status == "Approved":
            await mongo_db["od_requests"].update_one(
                {"_id": od["_id"]},
                {
                    "$set": {
                        "advisorStatus": "APPROVED",
                        "approvalType": "ADVISOR_APPROVAL",
                        "approvedBy": current_user.full_name or current_user.login_id,
                        "approvedByRole": "ADVISOR",
                        "hodStatus": "ACTION_REQUIRED",
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

            # Notify HOD
            dept = od.get("department", "")
            hod_accounts = await mongo_db["staff_accounts"].find({"role": "hod"}).to_list(length=10)
            for hod in hod_accounts:
                if not dept or hod.get("department", "").upper() == dept.upper() or "AI" in hod.get("department", "").upper():
                    await mongo_db["notifications"].insert_one({
                        "user_id": str(hod["_id"]),
                        "email": hod.get("email"),
                        "category": "OD_REQUEST",
                        "title": f"Advisor Approved OD: {od.get('studentName')}",
                        "message": f"Advisor approved OD request for {od.get('studentName')} ({od.get('registerNumber')}). HOD approval required.",
                        "reference_type": "od_request",
                        "reference_id": od.get("requestId"),
                        "is_read": False,
                        "created_at": now_iso
                    })

            return {"message": "OD request approved by Advisor. Sent for HOD final review.", "status": "Pending", "advisorStatus": "APPROVED"}

        else: # Advisor Rejects
            await mongo_db["od_requests"].update_one(
                {"_id": od["_id"]},
                {
                    "$set": {
                        "status": "Rejected",
                        "advisorStatus": "REJECTED",
                        "approvalType": "ADVISOR_REJECTION",
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
                "message": f"Your OD request for '{od.get('eventName')}' was rejected by Advisor.",
                "reference_type": "od_request",
                "reference_id": od.get("requestId"),
                "is_read": False,
                "created_at": now_iso
            })

            return {"message": "OD request rejected by Advisor.", "status": "Rejected"}

    # DEO / Admin fallback
    else:
        await mongo_db["od_requests"].update_one(
            {"_id": od["_id"]},
            {
                "$set": {
                    "status": status,
                    "approvedBy": current_user.full_name or current_user.login_id,
                    "approvedByRole": str(current_user.role).upper(),
                    "reviewedBy": current_user.full_name or current_user.login_id,
                    "reviewedAt": now_iso,
                    "reviewerRemarks": reviewerRemarks or "",
                    "updatedAt": now_iso
                }
            }
        )
        return {"message": f"OD request {status.lower()} by DEO.", "status": status}


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
    Only shows requests where: status=Approved AND selectedDate is within [fromDate, toDate].
    """
    user_role = str(current_user.role).lower()

    today_str = date.today().isoformat()
    if selected_date:
        check_date = selected_date
    else:
        check_date = today_str

    query_filter = {"status": "Approved"}

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


