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
        "submittedAt": now_iso,
        "updatedAt": now_iso,
        "reviewedBy": None,
        "reviewedAt": None,
        "reviewerRemarks": None
    }

    result = await mongo_db["od_requests"].insert_one(od_record)
    return {
        "message": "OD request submitted successfully.",
        "requestId": request_id,
        "id": str(result.inserted_id),
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
    current_user: models.User = Depends(get_current_user),
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
            {"studentId": str(current_user.id)}
        ]
    }).sort("submittedAt", -1).to_list(length=200)

    for r in requests:
        r["id"] = str(r["_id"])
        del r["_id"]

    return {"requests": requests}


@router.get("/od-requests/pending")
@router.get("/od/pending")
async def get_pending_od_requests_mongo(
    current_user: models.User = Depends(require_roles(
        models.UserRole.ADVISOR, models.UserRole.HOD, models.UserRole.DEO
    )),
    mongo_db = Depends(get_db)
):
    requests = await mongo_db["od_requests"].find({
        "status": "Pending"
    }).sort("submittedAt", -1).to_list(length=200)

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

    if od.get("status") != "Pending":
        raise HTTPException(status_code=400, detail="Only pending requests can be cancelled.")

    now_iso = datetime.now(timezone.utc).isoformat()
    await mongo_db["od_requests"].update_one(
        {"_id": od["_id"]},
        {"$set": {"status": "Cancelled", "updatedAt": now_iso}}
    )
    return {"message": "OD request cancelled successfully.", "status": "Cancelled"}


@router.post("/od-requests/{request_id}/review")
async def review_od_request(
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

    od = await mongo_db["od_requests"].find_one(query)
    if not od:
        raise HTTPException(status_code=404, detail="OD request not found")

    now_iso = datetime.now(timezone.utc).isoformat()
    await mongo_db["od_requests"].update_one(
        {"_id": od["_id"]},
        {"$set": {
            "status": status,
            "reviewedBy": current_user.full_name or current_user.login_id,
            "reviewedAt": now_iso,
            "reviewerRemarks": reviewerRemarks,
            "updatedAt": now_iso
        }}
    )
    return {"message": f"OD request {status.lower()} successfully.", "status": status}
