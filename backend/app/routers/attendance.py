"""
Attendance Router - MongoDB version
Handles student attendance viewing, calendar, planner, what-if simulation,
and faculty attendance marking - all using MongoDB (Motor async driver).
"""
from datetime import date, datetime, timedelta, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from app.database import get_db
from app import models
from app.auth import get_current_user, require_roles

router = APIRouter(prefix="/attendance", tags=["Attendance"])


# ============================================================
# STUDENT - VIEW MY ATTENDANCE
# ============================================================

@router.get("/my")
async def get_my_attendance(
    current_user: models.User = Depends(get_current_user),
    mongo_db=Depends(get_db)
):
    """Get logged-in student's attendance summary from MongoDB."""
    if str(current_user.role).lower() != "student":
        raise HTTPException(status_code=403, detail="Only students can access this endpoint")

    login_id = current_user.login_id
    student_doc = await mongo_db["student_accounts"].find_one({
        "$or": [
            {"register_no": login_id},
            {"roll_number": login_id},
            {"email": login_id.lower()}
        ]
    })
    if not student_doc:
        raise HTTPException(status_code=404, detail="Student profile not found")

    register_no = student_doc.get("register_no", "")

    # Get all attendance records for this student
    records = await mongo_db["attendance_records"].find(
        {"register_no": register_no}
    ).to_list(length=5000)

    # Compute summary per subject
    subject_map = {}
    total_credited = 0
    total_eligible = 0

    for r in records:
        subj_code = r.get("subject_code", "UNKNOWN")
        subj_name = r.get("subject_name", subj_code)
        status = r.get("status", "-")

        if subj_code not in subject_map:
            subject_map[subj_code] = {
                "subject_code": subj_code,
                "subject_name": subj_name,
                "total_hours": 0,
                "pr_hours": 0,
                "od_hours": 0,
                "ab_hours": 0,
                "le_hours": 0,
                "ml_hours": 0,
                "credited_hours": 0,
                "eligible_hours": 0,
            }

        sm = subject_map[subj_code]
        sm["total_hours"] += 1

        if status == "PR":
            sm["pr_hours"] += 1
            sm["credited_hours"] += 1
            sm["eligible_hours"] += 1
        elif status == "OD":
            sm["od_hours"] += 1
            sm["credited_hours"] += 1
            sm["eligible_hours"] += 1
        elif status == "LE":
            sm["le_hours"] += 1
            sm["eligible_hours"] += 1
        elif status == "ML":
            sm["ml_hours"] += 1
            sm["eligible_hours"] += 1
        elif status == "AB":
            sm["ab_hours"] += 1
            sm["eligible_hours"] += 1

    for sm in subject_map.values():
        pct = (sm["credited_hours"] / sm["eligible_hours"] * 100) if sm["eligible_hours"] > 0 else 0
        sm["percentage"] = round(pct, 2)
        sm["is_below_target"] = pct < 75
        total_credited += sm["credited_hours"]
        total_eligible += sm["eligible_hours"]

    overall_pct = (total_credited / total_eligible * 100) if total_eligible > 0 else 0

    return {
        "student_id": str(student_doc["_id"]),
        "register_number": register_no,
        "student_name": student_doc.get("name", current_user.full_name),
        "overall": {
            "total_hours": total_eligible,
            "pr_hours": sum(s["pr_hours"] for s in subject_map.values()),
            "od_hours": sum(s["od_hours"] for s in subject_map.values()),
            "ab_hours": sum(s["ab_hours"] for s in subject_map.values()),
            "le_hours": sum(s["le_hours"] for s in subject_map.values()),
            "ml_hours": sum(s["ml_hours"] for s in subject_map.values()),
            "credited_hours": total_credited,
            "eligible_hours": total_eligible,
            "percentage": round(overall_pct, 2),
            "is_below_target": overall_pct < 75,
            "target_percentage": 75.0
        },
        "subjects": list(subject_map.values())
    }


@router.get("/history")
async def get_attendance_history(
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    subject_code: Optional[str] = None,
    status: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(50, le=200),
    current_user: models.User = Depends(get_current_user),
    mongo_db=Depends(get_db)
):
    """Get attendance history with filters."""
    if str(current_user.role).lower() != "student":
        raise HTTPException(status_code=403, detail="Only students can access this endpoint")

    login_id = current_user.login_id
    student_doc = await mongo_db["student_accounts"].find_one({
        "$or": [
            {"register_no": login_id},
            {"roll_number": login_id},
            {"email": login_id.lower()}
        ]
    })
    if not student_doc:
        raise HTTPException(status_code=404, detail="Student profile not found")

    register_no = student_doc.get("register_no", "")
    query_filter = {"register_no": register_no}

    if from_date:
        query_filter.setdefault("date", {})["$gte"] = from_date
    if to_date:
        query_filter.setdefault("date", {})["$lte"] = to_date
    if subject_code:
        query_filter["subject_code"] = subject_code
    if status:
        query_filter["status"] = status

    total = await mongo_db["attendance_records"].count_documents(query_filter)
    skip = (page - 1) * limit
    records = await mongo_db["attendance_records"].find(
        query_filter
    ).sort("date", -1).skip(skip).limit(limit).to_list(length=limit)

    for r in records:
        r["id"] = str(r["_id"])
        del r["_id"]

    return {
        "total": total,
        "page": page,
        "limit": limit,
        "records": records
    }


@router.get("/calendar")
async def get_attendance_calendar(
    year: int,
    month: int,
    current_user: models.User = Depends(get_current_user),
    mongo_db=Depends(get_db)
):
    """Get calendar view of attendance for a given month."""
    if str(current_user.role).lower() != "student":
        raise HTTPException(status_code=403, detail="Only students can access this endpoint")

    login_id = current_user.login_id
    student_doc = await mongo_db["student_accounts"].find_one({
        "$or": [
            {"register_no": login_id},
            {"roll_number": login_id},
            {"email": login_id.lower()}
        ]
    })
    if not student_doc:
        raise HTTPException(status_code=404, detail="Student profile not found")

    register_no = student_doc.get("register_no", "")

    # Date range
    from_date = f"{year}-{str(month).zfill(2)}-01"
    if month == 12:
        to_date = f"{year + 1}-01-01"
    else:
        to_date = f"{year}-{str(month + 1).zfill(2)}-01"

    records = await mongo_db["attendance_records"].find({
        "register_no": register_no,
        "date": {"$gte": from_date, "$lt": to_date}
    }).sort([("date", 1), ("period_number", 1)]).to_list(length=2000)

    calendar_data = {}
    for r in records:
        d = r.get("date", "")
        if d not in calendar_data:
            calendar_data[d] = []
        calendar_data[d].append({
            "period_number": r.get("period_number"),
            "subject_code": r.get("subject_code"),
            "subject_name": r.get("subject_name"),
            "status": r.get("status", "-"),
            "start_time": r.get("start_time"),
            "end_time": r.get("end_time"),
            "faculty_name": r.get("faculty_name")
        })

    return {
        "year": year,
        "month": month,
        "calendar": calendar_data
    }


@router.get("/planner")
async def get_attendance_planner(
    target_percentage: Optional[float] = 75.0,
    current_user: models.User = Depends(get_current_user),
    mongo_db=Depends(get_db)
):
    """Smart Attendance Planner - MongoDB version."""
    if str(current_user.role).lower() != "student":
        raise HTTPException(status_code=403, detail="Only students can access this endpoint")

    login_id = current_user.login_id
    student_doc = await mongo_db["student_accounts"].find_one({
        "$or": [
            {"register_no": login_id},
            {"roll_number": login_id},
            {"email": login_id.lower()}
        ]
    })
    if not student_doc:
        raise HTTPException(status_code=404, detail="Student profile not found")

    register_no = student_doc.get("register_no", "")
    target = target_percentage or 75.0

    records = await mongo_db["attendance_records"].find(
        {"register_no": register_no}
    ).to_list(length=5000)

    # Build subject-level stats
    subject_map = {}
    for r in records:
        subj_code = r.get("subject_code", "UNKNOWN")
        subj_name = r.get("subject_name", subj_code)
        status = r.get("status", "-")

        if subj_code not in subject_map:
            subject_map[subj_code] = {
                "subject_code": subj_code,
                "subject_name": subj_name,
                "credited_hours": 0,
                "eligible_hours": 0,
            }
        sm = subject_map[subj_code]
        if status in ("PR", "OD"):
            sm["credited_hours"] += 1
            sm["eligible_hours"] += 1
        elif status in ("AB",):
            sm["eligible_hours"] += 1
        elif status in ("LE", "ML"):
            sm["eligible_hours"] += 1

    def _classes_needed(credited, total, target_pct):
        if total == 0:
            return {"classes_needed": 0, "classes_can_miss": 0, "already_at_target": False,
                    "current_percentage": 0.0, "message": "No classes yet"}
        pct = (credited / total) * 100
        already = pct >= target_pct
        if already:
            # How many can miss?
            # (credited) / (total + x) >= target/100
            # x <= credited/(target/100) - total
            can_miss = max(0, int(credited / (target_pct / 100) - total))
            return {
                "classes_needed": 0,
                "classes_can_miss": can_miss,
                "already_at_target": True,
                "current_percentage": round(pct, 2),
                "message": f"You can miss {can_miss} more class(es) and still maintain {target_pct}%"
            }
        else:
            # (credited + x) / (total + x) >= target/100
            # credited + x >= (target/100)(total + x)
            # credited + x >= target*total/100 + target*x/100
            # x - target*x/100 >= target*total/100 - credited
            # x(1 - target/100) >= target*total/100 - credited
            needed_num = target_pct / 100 * total - credited
            needed_den = 1 - target_pct / 100
            if needed_den <= 0:
                classes_needed = 9999
            else:
                classes_needed = int(needed_num / needed_den) + 1
            return {
                "classes_needed": classes_needed,
                "classes_can_miss": 0,
                "already_at_target": False,
                "current_percentage": round(pct, 2),
                "message": f"Attend {classes_needed} consecutive class(es) to reach {target_pct}%"
            }

    subject_planners = []
    total_credited_all = 0
    total_eligible_all = 0
    for sm in subject_map.values():
        plan = _classes_needed(sm["credited_hours"], sm["eligible_hours"], target)
        total_credited_all += sm["credited_hours"]
        total_eligible_all += sm["eligible_hours"]
        subject_planners.append({
            "subject_code": sm["subject_code"],
            "subject_name": sm["subject_name"],
            "current_credited": sm["credited_hours"],
            "current_total": sm["eligible_hours"],
            **plan,
            "target_percentage": target
        })

    overall_plan = _classes_needed(total_credited_all, total_eligible_all, target)

    return {
        "overall": {
            "current_credited": total_credited_all,
            "current_total": total_eligible_all,
            "target_percentage": target,
            **overall_plan
        },
        "subjects": subject_planners
    }


class WhatIfRequest(BaseModel):
    future_present: int = 0
    future_od: int = 0
    future_leave: int = 0
    future_absent: int = 0
    target_percentage: Optional[float] = None


@router.post("/planner/what-if")
async def what_if_simulation(
    data: WhatIfRequest,
    subject_id: Optional[str] = None,
    current_user: models.User = Depends(get_current_user),
    mongo_db=Depends(get_db)
):
    """What-if attendance simulation."""
    if str(current_user.role).lower() != "student":
        raise HTTPException(status_code=403, detail="Only students can access this endpoint")

    login_id = current_user.login_id
    student_doc = await mongo_db["student_accounts"].find_one({
        "$or": [
            {"register_no": login_id},
            {"roll_number": login_id},
            {"email": login_id.lower()}
        ]
    })
    if not student_doc:
        raise HTTPException(status_code=404, detail="Student profile not found")

    register_no = student_doc.get("register_no", "")
    records = await mongo_db["attendance_records"].find(
        {"register_no": register_no}
    ).to_list(length=5000)

    credited = 0
    total = 0
    for r in records:
        status = r.get("status", "-")
        if status in ("PR", "OD"):
            credited += 1
            total += 1
        elif status in ("AB", "LE", "ML"):
            total += 1

    original_pct = (credited / total * 100) if total > 0 else 0

    new_credited = credited + data.future_present + data.future_od
    new_total = total + data.future_present + data.future_od + data.future_leave + data.future_absent
    target = data.target_percentage or 75.0
    new_pct = (new_credited / new_total * 100) if new_total > 0 else 0

    return {
        "original_credited": credited,
        "original_total": total,
        "original_percentage": round(original_pct, 2),
        "future_present": data.future_present,
        "future_od": data.future_od,
        "future_leave": data.future_leave,
        "future_absent": data.future_absent,
        "new_credited": new_credited,
        "new_total": new_total,
        "new_percentage": round(new_pct, 2),
        "percentage_change": round(new_pct - original_pct, 2),
        "reaches_target": new_pct >= target,
        "target_percentage": target,
        "message": (
            f"You will reach {new_pct:.1f}% — {'✅ Above' if new_pct >= target else '❌ Below'} target {target}%"
        )
    }





# ============================================================
# FACULTY / ADVISOR / HOD - MARK ATTENDANCE (MongoDB)
# ============================================================

class AttendanceMarkRequest(BaseModel):
    register_no: str
    subject_code: str
    subject_name: str
    date: str  # YYYY-MM-DD
    period_number: int
    status: str  # PR, AB, OD, LE, ML
    faculty_name: Optional[str] = None
    notes: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None


class BulkAttendanceMarkRequest(BaseModel):
    date: str  # YYYY-MM-DD
    period_number: int
    subject_code: str
    subject_name: str
    section: str
    faculty_name: Optional[str] = None
    attendance_list: list  # [{register_no: str, status: str}, ...]


@router.post("/mark")
async def mark_attendance(
    data: AttendanceMarkRequest,
    current_user: models.User = Depends(require_roles(
        models.UserRole.FACULTY, models.UserRole.ADVISOR, models.UserRole.HOD, models.UserRole.DEO
    )),
    mongo_db=Depends(get_db)
):
    """Mark single student attendance."""
    # Validate student exists
    student = await mongo_db["student_accounts"].find_one({"register_no": data.register_no})
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    # Validate status
    valid_statuses = {"PR", "AB", "OD", "LE", "ML"}
    if data.status.upper() not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {', '.join(valid_statuses)}")

    filter_q = {
        "register_no": data.register_no,
        "date": data.date,
        "period_number": data.period_number,
        "subject_code": data.subject_code,
    }

    existing = await mongo_db["attendance_records"].find_one(filter_q)

    record_data = {
        "register_no": data.register_no,
        "student_name": student.get("name", ""),
        "subject_code": data.subject_code,
        "subject_name": data.subject_name,
        "date": data.date,
        "period_number": data.period_number,
        "status": data.status.upper(),
        "faculty_name": data.faculty_name or current_user.full_name,
        "notes": data.notes,
        "start_time": data.start_time,
        "end_time": data.end_time,
        "marked_by": str(current_user.id),
        "marked_at": datetime.now(timezone.utc).isoformat(),
        "section": student.get("section", ""),
        "year": student.get("year", ""),
        "department": student.get("department", ""),
    }

    if existing:
        prev_status = existing.get("status")
        await mongo_db["attendance_records"].update_one(
            {"_id": existing["_id"]},
            {"$set": {**record_data, "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
        # Audit log
        await mongo_db["audit_logs"].insert_one({
            "action": "ATTENDANCE_UPDATED",
            "entity_type": "attendance",
            "entity_id": data.register_no,
            "user_id": str(current_user.id),
            "user_role": str(current_user.role),
            "previous_value": {"status": prev_status},
            "new_value": {"status": data.status.upper()},
            "reason": f"Manual update by {current_user.role}",
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        return {"message": "Attendance updated successfully"}
    else:
        await mongo_db["attendance_records"].insert_one(record_data)
        # Audit log
        await mongo_db["audit_logs"].insert_one({
            "action": "ATTENDANCE_MARKED",
            "entity_type": "attendance",
            "entity_id": data.register_no,
            "user_id": str(current_user.id),
            "user_role": str(current_user.role),
            "new_value": {"status": data.status.upper()},
            "reason": f"Marked by {current_user.role}",
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        return {"message": "Attendance marked successfully"}


@router.post("/mark-bulk")
async def mark_attendance_bulk(
    data: BulkAttendanceMarkRequest,
    current_user: models.User = Depends(require_roles(
        models.UserRole.FACULTY, models.UserRole.ADVISOR, models.UserRole.HOD, models.UserRole.DEO
    )),
    mongo_db=Depends(get_db)
):
    """Mark attendance for entire section at once."""
    results = {"marked": 0, "updated": 0, "failed": 0, "errors": []}
    faculty_name = data.faculty_name or current_user.full_name

    for item in data.attendance_list:
        register_no = item.get("register_no")
        att_status = (item.get("status") or "AB").upper()

        try:
            student = await mongo_db["student_accounts"].find_one({"register_no": register_no})
            if not student:
                results["failed"] += 1
                results["errors"].append({"register_no": register_no, "error": "Student not found"})
                continue

            filter_q = {
                "register_no": register_no,
                "date": data.date,
                "period_number": data.period_number,
                "subject_code": data.subject_code,
            }
            existing = await mongo_db["attendance_records"].find_one(filter_q)

            record_data = {
                "register_no": register_no,
                "student_name": student.get("name", ""),
                "subject_code": data.subject_code,
                "subject_name": data.subject_name,
                "date": data.date,
                "period_number": data.period_number,
                "status": att_status,
                "faculty_name": faculty_name,
                "marked_by": str(current_user.id),
                "marked_at": datetime.now(timezone.utc).isoformat(),
                "section": data.section,
                "year": student.get("year", ""),
                "department": student.get("department", ""),
            }

            if existing:
                await mongo_db["attendance_records"].update_one(
                    {"_id": existing["_id"]},
                    {"$set": record_data}
                )
                results["updated"] += 1
            else:
                await mongo_db["attendance_records"].insert_one(record_data)
                results["marked"] += 1

        except Exception as e:
            results["failed"] += 1
            results["errors"].append({"register_no": register_no, "error": str(e)})

    # Audit log
    await mongo_db["audit_logs"].insert_one({
        "action": "BULK_ATTENDANCE_MARKED",
        "entity_type": "attendance",
        "entity_id": data.section,
        "user_id": str(current_user.id),
        "user_role": str(current_user.role),
        "new_value": {"date": data.date, "period": data.period_number, "results": results},
        "created_at": datetime.now(timezone.utc).isoformat()
    })

    return results


@router.get("/section/{section_name}")
async def get_section_attendance(
    section_name: str,
    date: str = Query(...),
    period: Optional[int] = None,
    current_user: models.User = Depends(require_roles(
        models.UserRole.FACULTY, models.UserRole.ADVISOR, models.UserRole.HOD, models.UserRole.DEO
    )),
    mongo_db=Depends(get_db)
):
    """Get section attendance for a given date."""
    query_filter = {"section": section_name}
    students = await mongo_db["student_accounts"].find(
        query_filter, {"password_hash": 0}
    ).to_list(length=500)

    result = []
    for student in students:
        register_no = student.get("register_no", "")
        att_filter = {"register_no": register_no, "date": date}
        if period:
            att_filter["period_number"] = period

        att_records = await mongo_db["attendance_records"].find(att_filter).to_list(length=50)
        for r in att_records:
            r["id"] = str(r["_id"])
            del r["_id"]

        # Check OD/Leave for this date
        od = await mongo_db["od_requests"].find_one({
            "registerNumber": register_no,
            "fromDate": {"$lte": date},
            "toDate": {"$gte": date},
            "status": "Approved"
        })
        leave = await mongo_db["leave_requests"].find_one({
            "registerNumber": register_no,
            "fromDate": {"$lte": date},
            "toDate": {"$gte": date},
            "status": "Approved"
        })

        result.append({
            "register_no": register_no,
            "student_name": student.get("name", ""),
            "roll_number": student.get("roll_number", ""),
            "attendance": att_records,
            "has_approved_od": od is not None,
            "has_approved_leave": leave is not None,
        })

    return {"section": section_name, "date": date, "students": result}


@router.get("/department-summary")
async def get_department_attendance_summary(
    department: Optional[str] = None,
    date: Optional[str] = None,
    current_user: models.User = Depends(require_roles(
        models.UserRole.HOD, models.UserRole.ADVISOR, models.UserRole.DEO
    )),
    mongo_db=Depends(get_db)
):
    """Get department-level attendance summary for HOD/Advisor/DEO."""
    filter_q = {}
    if department:
        filter_q["department"] = department
    if date:
        filter_q["date"] = date

    records = await mongo_db["attendance_records"].find(filter_q).to_list(length=10000)

    total = len(records)
    pr = sum(1 for r in records if r.get("status") == "PR")
    ab = sum(1 for r in records if r.get("status") == "AB")
    od = sum(1 for r in records if r.get("status") == "OD")
    le = sum(1 for r in records if r.get("status") == "LE")

    return {
        "total_records": total,
        "present": pr,
        "absent": ab,
        "on_duty": od,
        "on_leave": le,
        "attendance_rate": round(pr / total * 100, 2) if total > 0 else 0
    }


@router.get("/od-leave-status")
async def get_od_leave_status_for_date(
    check_date: Optional[str] = Query(None, alias="date"),
    department: Optional[str] = None,
    year: Optional[str] = None,
    section: Optional[str] = None,
    current_user: models.User = Depends(require_roles(
        models.UserRole.FACULTY, models.UserRole.ADVISOR, models.UserRole.HOD,
        models.UserRole.STAFF, models.UserRole.DEO
    )),
    mongo_db = Depends(get_db)
):
    """
    Returns a mapping of registerNumber -> approved_type ('OD' or 'LEAVE') for all students
    who have approved OD or Leave for the given date. Used by faculty during attendance marking
    to automatically flag students as 'OD - Approved' or 'LEAVE - Approved'.
    """
    today_str = date.today().isoformat()
    target_date = check_date if check_date else today_str

    q_filter = {
        "fromDate": {"$lte": target_date},
        "toDate": {"$gte": target_date}
    }

    if department:
        q_filter["department"] = department
    if year:
        q_filter["year"] = year
    if section:
        q_filter["section"] = section

    # OD is treated as approved for attendance only after FINAL approval
    # (completion proof verified) - two-stage OD workflow.
    od_q_filter = {
        **q_filter,
        "status": {"$in": ["Approved", "Fulfilled / Final Approved"]}
    }
    leave_q_filter = {**q_filter, "status": "Approved"}

    od_records = await mongo_db["od_requests"].find(od_q_filter, {
        "registerNumber": 1, "studentName": 1, "rollNumber": 1,
        "odType": 1, "fromDate": 1, "toDate": 1
    }).to_list(length=1000)

    leave_records = await mongo_db["leave_requests"].find(leave_q_filter, {
        "registerNumber": 1, "studentName": 1, "rollNumber": 1,
        "leaveType": 1, "fromDate": 1, "toDate": 1
    }).to_list(length=1000)

    status_map = {}

    for od in od_records:
        reg_no = od.get("registerNumber", "")
        if reg_no:
            status_map[reg_no] = {
                "type": "OD",
                "label": "OD - Approved",
                "studentName": od.get("studentName", ""),
                "rollNumber": od.get("rollNumber", ""),
                "detail": od.get("odType", "OD"),
                "fromDate": od.get("fromDate"),
                "toDate": od.get("toDate")
            }

    for lv in leave_records:
        reg_no = lv.get("registerNumber", "")
        if reg_no and reg_no not in status_map:
            status_map[reg_no] = {
                "type": "LEAVE",
                "label": "LEAVE - Approved",
                "studentName": lv.get("studentName", ""),
                "rollNumber": lv.get("rollNumber", ""),
                "detail": lv.get("leaveType", "Leave"),
                "fromDate": lv.get("fromDate"),
                "toDate": lv.get("toDate")
            }

    return {
        "date": target_date,
        "od_leave_students": status_map,
        "od_count": len(od_records),
        "leave_count": len(leave_records),
        "total_affected": len(status_map)
    }

