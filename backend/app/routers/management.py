"""
User management, DEO management routers - MongoDB version
"""
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from pydantic import BaseModel
from app.database import get_db
from app import models
from app.auth import get_current_user, require_roles, get_password_hash

# ============================================================
# USER MANAGEMENT (DEO)
# ============================================================
users_router = APIRouter(prefix="/users", tags=["User Management"])


class InstitutionalUserCreate(BaseModel):
    full_name: str
    email: str
    password: str
    phone: Optional[str] = ""
    department: str
    date_of_birth: Optional[str] = ""
    role: str  # HOD, ADVISOR, FACULTY, STAFF, DEO
    status: str = "ACTIVE"
    designation: Optional[str] = None
    subjects: Optional[list[str]] = []
    assigned_classes: Optional[list[str]] = []
    assigned_year: Optional[str] = None
    assigned_section: Optional[str] = None
    office: Optional[str] = None


class StudentAccountCreate(BaseModel):
    student_id: Optional[str] = None
    full_name: str
    register_number: str
    roll_number: str
    email: str
    mobile_number: str
    department: str
    year: str
    section: str
    date_of_birth: str
    advisor: Optional[str] = ""
    parent_name: Optional[str] = ""
    parent_contact: Optional[str] = ""
    account_status: str = "ACTIVE"
    password: Optional[str] = None


def format_dob_password(dob_raw: str) -> str:
    """Extract DDMMYYYY from a date string (YYYY-MM-DD or DD-MM-YYYY or DD/MM/YYYY)."""
    if not dob_raw:
        return "15082005"
    clean = dob_raw.strip()
    import re
    digits = re.sub(r"\D", "", clean)
    if len(digits) == 8:
        if clean.startswith("19") or clean.startswith("20"):
            yyyy = digits[:4]
            mm = digits[4:6]
            dd = digits[6:8]
            return f"{dd}{mm}{yyyy}"
        else:
            return digits
    return "15082005"


class StudentDeactivateRequest(BaseModel):
    reason: Optional[str] = "Deactivated by DEO"


@users_router.post("/students")
@users_router.post("/student")
async def create_student_account(
    data: StudentAccountCreate,
    current_user: models.User = Depends(require_roles(models.UserRole.DEO)),
    mongo_db = Depends(get_db)
):
    import re
    email = data.email.strip().lower()
    reg_no = data.register_number.strip()
    roll_no = data.roll_number.strip()
    full_name = data.full_name.strip()
    dob = data.date_of_birth.strip() if data.date_of_birth else ""

    if not full_name or not reg_no or not roll_no or not email:
        raise HTTPException(status_code=400, detail="Full Name, Register Number, Roll Number, and College Email are required.")

    # Unique check across student_accounts and staff_accounts
    existing_reg = await mongo_db["student_accounts"].find_one({"register_no": reg_no})
    if existing_reg:
        raise HTTPException(status_code=400, detail="Student already exists with this Register Number.")

    existing_roll = await mongo_db["student_accounts"].find_one({"roll_number": roll_no})
    if existing_roll:
        raise HTTPException(status_code=400, detail="Student already exists with this Roll Number.")

    existing_email = await mongo_db["student_accounts"].find_one({"email": email})
    existing_staff_email = await mongo_db["staff_accounts"].find_one({"email": email})
    if existing_email or existing_staff_email:
        raise HTTPException(status_code=400, detail="A student account already exists with this email.")

    if data.password and data.password.strip():
        initial_pw = data.password.strip()
    else:
        initial_pw = format_dob_password(dob)

    if len(initial_pw) < 6:
        raise HTTPException(status_code=400, detail="Initial password must be at least 6 characters.")

    pw_hash = get_password_hash(initial_pw)
    now_iso = datetime.now(timezone.utc).isoformat()
    std_id = data.student_id.strip() if data.student_id and data.student_id.strip() else f"STU-{reg_no}"

    student_doc = {
        "student_id": std_id,
        "name": full_name,
        "fullName": full_name,
        "register_no": reg_no,
        "registerNumber": reg_no,
        "roll_number": roll_no,
        "rollNumber": roll_no,
        "email": email,
        "collegeEmail": email,
        "phone": data.mobile_number.strip(),
        "department": data.department.strip(),
        "department_code": "AIML" if "AI" in data.department.upper() or "AIML" in data.department.upper() else data.department.strip(),
        "year": data.year.strip(),
        "section": data.section.strip(),
        "date_of_birth": dob,
        "advisor": data.advisor.strip() if data.advisor else "",
        "parent_name": data.parent_name.strip() if data.parent_name else "",
        "parent_contact": data.parent_contact.strip() if data.parent_contact else "",
        "password_hash": pw_hash,
        "passwordHash": pw_hash,
        "role": "student",
        "status": data.account_status.strip().upper(),
        "accountStatus": data.account_status.strip().upper(),
        "first_login": False,
        "created_at": now_iso,
        "updated_at": now_iso,
        "created_by": str(current_user.id),
        "createdByDEO": True
    }

    result = await mongo_db["student_accounts"].insert_one(student_doc)
    doc_id = str(result.inserted_id)

    # Also keep student_master up to date
    await mongo_db["student_master"].update_one(
        {"register_no": reg_no},
        {"$set": {
            "register_no": reg_no,
            "name": full_name,
            "date_of_birth": dob,
            "department": data.department.strip(),
            "year": data.year.strip(),
            "section": data.section.strip(),
            "email": email,
            "phone": data.mobile_number.strip(),
            "status": "REGISTERED"
        }},
        upsert=True
    )

    # Log to audit_logs
    await mongo_db["audit_logs"].insert_one({
        "action": "STUDENT_CREATED_BY_DEO",
        "entity_type": "student_account",
        "entity_id": doc_id,
        "user_id": str(current_user.id),
        "user_role": str(current_user.role),
        "student_id": std_id,
        "register_no": reg_no,
        "created_at": now_iso
    })

    return {
        "message": f"Student account created successfully for {full_name}.",
        "id": doc_id,
        "student_id": std_id,
        "register_no": reg_no,
        "email": email,
        "status": data.account_status.strip().upper()
    }


@users_router.post("/institutional")
async def create_institutional_user(
    data: InstitutionalUserCreate,
    current_user: models.User = Depends(require_roles(models.UserRole.DEO, models.UserRole.HOD)),
    mongo_db = Depends(get_db)
):
    valid_roles = ["HOD", "ADVISOR", "FACULTY", "STAFF", "DEO"]
    role_upper = data.role.strip().upper()
    if role_upper not in valid_roles:
        raise HTTPException(status_code=400, detail=f"Invalid institutional role. Must be one of {', '.join(valid_roles)}")

    email = data.email.strip().lower()

    # Email Uniqueness Check across staff_accounts and student_accounts
    existing_staff = await mongo_db["staff_accounts"].find_one({"email": email})
    existing_student = await mongo_db["student_accounts"].find_one({"email": email})

    if existing_staff or existing_student:
        raise HTTPException(status_code=400, detail="An account with this email already exists.")

    pw_hash = get_password_hash(data.password)

    user_doc = {
        "name": data.full_name.strip(),
        "email": email,
        "password_hash": pw_hash,
        "phone": data.phone.strip(),
        "department": data.department.strip(),
        "date_of_birth": data.date_of_birth.strip(),
        "role": role_upper.lower(),
        "status": data.status.strip().upper(),
        "designation": data.designation,
        "subjects": data.subjects or [],
        "assigned_classes": data.assigned_classes or [],
        "assigned_year": data.assigned_year,
        "assigned_section": data.assigned_section,
        "office": data.office,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": str(current_user.id)
    }

    result = await mongo_db["staff_accounts"].insert_one(user_doc)
    return {"message": f"{role_upper} account created successfully", "id": str(result.inserted_id)}


@users_router.get("/students")
async def list_students(
    department: Optional[str] = None,
    year: Optional[str] = None,
    section: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(50, le=200),
    current_user: models.User = Depends(require_roles(
        models.UserRole.DEO, models.UserRole.HOD, models.UserRole.ADVISOR, models.UserRole.FACULTY, models.UserRole.STAFF
    )),
    mongo_db = Depends(get_db)
):
    query_filter = {}
    if department:
        query_filter["department"] = department
    if year:
        query_filter["year"] = year
    if section:
        query_filter["section"] = section
    if status:
        query_filter["status"] = status.upper()
    if search:
        query_filter["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"register_no": {"$regex": search, "$options": "i"}},
            {"roll_number": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}}
        ]

    total = await mongo_db["student_accounts"].count_documents(query_filter)
    skip = (page - 1) * limit
    students = await mongo_db["student_accounts"].find(
        query_filter,
        {"password_hash": 0, "passwordHash": 0}  # Never return password hash
    ).skip(skip).limit(limit).to_list(length=limit)

    for s in students:
        s["id"] = str(s["_id"])
        del s["_id"]

    return {"total": total, "students": students}


@users_router.get("/staff")
async def list_staff(
    department: Optional[str] = None,
    role: Optional[str] = None,
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(50, le=200),
    current_user: models.User = Depends(require_roles(
        models.UserRole.DEO, models.UserRole.HOD
    )),
    mongo_db = Depends(get_db)
):
    query_filter = {}
    if department:
        query_filter["department"] = department
    if role:
        query_filter["role"] = role.lower()
    if search:
        query_filter["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}},
            {"designation": {"$regex": search, "$options": "i"}}
        ]

    total = await mongo_db["staff_accounts"].count_documents(query_filter)
    skip = (page - 1) * limit
    staff = await mongo_db["staff_accounts"].find(
        query_filter,
        {"password_hash": 0, "passwordHash": 0}  # Never return password hash
    ).skip(skip).limit(limit).to_list(length=limit)

    for s in staff:
        s["id"] = str(s["_id"])
        del s["_id"]

    return {"total": total, "staff": staff}


@users_router.post("/students/import")
async def import_students(
    file: UploadFile = File(...),
    confirm: bool = Form(False),
    current_user: models.User = Depends(require_roles(
        models.UserRole.DEO, models.UserRole.HOD
    )),
    mongo_db = Depends(get_db)
):
    import csv
    import io

    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are supported")

    content = await file.read()
    text = content.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))

    required_cols = ["register_no", "name", "date_of_birth", "department", "year", "section", "email", "phone"]
    missing_cols = [c for c in required_cols if c not in (reader.fieldnames or [])]
    if missing_cols:
        raise HTTPException(status_code=400, detail=f"Missing columns: {', '.join(missing_cols)}")

    valid_rows = []
    invalid_rows = []

    master_coll = mongo_db["student_master"]
    existing_cursor = master_coll.find({}, {"register_no": 1})
    existing_reg_nos = {doc["register_no"] async for doc in existing_cursor}

    for row_num, row in enumerate(reader, start=2):
        errors = []
        reg_no = row.get("register_no", "").strip()

        if not reg_no:
            errors.append("Missing register_no")
        elif reg_no in existing_reg_nos:
            errors.append(f"Register number {reg_no} already exists in master data")

        dob_str = row.get("date_of_birth", "").strip()
        if not dob_str:
            errors.append("Missing date of birth")

        row_data = {
            "register_no": reg_no,
            "name": row.get("name", "").strip(),
            "date_of_birth": dob_str,
            "department": row.get("department", "").strip(),
            "year": row.get("year", "").strip(),
            "section": row.get("section", "").strip(),
            "email": row.get("email", "").strip(),
            "phone": row.get("phone", "").strip(),
            "status": "NOT REGISTERED"
        }

        if errors:
            invalid_rows.append({"row": row_num, "data": row_data, "errors": errors})
        else:
            valid_rows.append({"row": row_num, "data": row_data})
            existing_reg_nos.add(reg_no)

    if confirm and not invalid_rows and valid_rows:
        docs_to_insert = [vr["data"] for vr in valid_rows]
        await master_coll.insert_many(docs_to_insert)
        return {"message": f"Successfully imported {len(valid_rows)} students into master", "imported": len(valid_rows)}

    return {
        "total_processed": len(valid_rows) + len(invalid_rows),
        "valid_count": len(valid_rows),
        "invalid_count": len(invalid_rows),
        "valid_rows": valid_rows[:10],
        "invalid_rows": invalid_rows
    }


@users_router.post("/students/{user_id}/deactivate")
@users_router.put("/{user_id}/toggle-status")
async def toggle_user_status(
    user_id: str,
    deactivate_data: Optional[StudentDeactivateRequest] = None,
    current_user: models.User = Depends(require_roles(models.UserRole.DEO)),
    mongo_db = Depends(get_db)
):
    from bson import ObjectId
    query_filter = {}
    if ObjectId.is_valid(user_id):
        query_filter["_id"] = ObjectId(user_id)
    else:
        query_filter["$or"] = [
            {"register_no": user_id},
            {"student_id": user_id},
            {"email": user_id.lower()}
        ]

    student = await mongo_db["student_accounts"].find_one(query_filter)
    if not student:
        raise HTTPException(status_code=404, detail="Student account not found")

    current_status = student.get("status", "ACTIVE").upper()
    new_status = "INACTIVE" if current_status == "ACTIVE" else "ACTIVE"
    reason = (deactivate_data.reason.strip() if deactivate_data and deactivate_data.reason else "Deactivated by DEO") if new_status == "INACTIVE" else ""
    now_iso = datetime.now(timezone.utc).isoformat()

    update_fields = {
        "status": new_status,
        "accountStatus": new_status,
        "updated_at": now_iso
    }
    if new_status == "INACTIVE":
        update_fields["deactivatedAt"] = now_iso
        update_fields["deactivated_at"] = now_iso
        update_fields["deactivatedBy"] = current_user.login_id
        update_fields["deactivated_by"] = current_user.login_id
        update_fields["deactivationReason"] = reason
        update_fields["deactivation_reason"] = reason

    await mongo_db["student_accounts"].update_one(
        {"_id": student["_id"]},
        {"$set": update_fields}
    )

    # Log to audit_logs
    await mongo_db["audit_logs"].insert_one({
        "action": "STUDENT_DEACTIVATED" if new_status == "INACTIVE" else "STUDENT_ACTIVATED",
        "entity_type": "student_account",
        "entity_id": str(student["_id"]),
        "user_id": str(current_user.id),
        "deactivated_by": current_user.login_id,
        "reason": reason,
        "created_at": now_iso
    })

    return {
        "message": f"Student account {'deactivated' if new_status == 'INACTIVE' else 'activated'} successfully.",
        "status": new_status,
        "student_id": str(student["_id"]),
        "register_no": student.get("register_no")
    }


@users_router.delete("/students/{user_id}")
@users_router.delete("/student/{user_id}")
async def delete_student_account(
    user_id: str,
    current_user: models.User = Depends(require_roles(models.UserRole.DEO)),
    mongo_db = Depends(get_db)
):
    from bson import ObjectId
    query_filter = {}
    if ObjectId.is_valid(user_id):
        query_filter["_id"] = ObjectId(user_id)
    else:
        query_filter["$or"] = [
            {"register_no": user_id},
            {"registerNumber": user_id},
            {"student_id": user_id},
            {"email": user_id.lower()},
            {"collegeEmail": user_id.lower()},
            {"roll_number": user_id},
            {"rollNumber": user_id}
        ]

    student = await mongo_db["student_accounts"].find_one(query_filter)
    if not student:
        student = await mongo_db["users"].find_one(query_filter)

    if not student:
        raise HTTPException(status_code=404, detail="Student account not found in database.")

    doc_id_str = str(student["_id"])
    reg_no = student.get("register_no") or student.get("registerNumber") or ""
    roll_no = student.get("roll_number") or student.get("rollNumber") or ""
    email = (student.get("email") or student.get("collegeEmail") or "").strip().lower()
    student_name = student.get("name") or student.get("fullName") or "Student"

    # 1. Permanently remove from student_accounts & users collections
    await mongo_db["student_accounts"].delete_many({
        "$or": [
            {"_id": student["_id"]},
            {"register_no": reg_no} if reg_no else {"_id": None},
            {"email": email} if email else {"_id": None}
        ]
    })

    await mongo_db["users"].delete_many({
        "$or": [
            {"login_id": reg_no} if reg_no else {"_id": None},
            {"login_id": email} if email else {"_id": None},
            {"email": email} if email else {"_id": None}
        ]
    })

    # 2. Delete master registration record if existing
    if reg_no:
        await mongo_db["student_master"].delete_many({"register_no": reg_no})

    # 3. Clean up associated notifications
    notif_filter = {"$or": [{"user_id": doc_id_str}]}
    if email:
        notif_filter["$or"].append({"email": email})
    await mongo_db["notifications"].delete_many(notif_filter)

    # 4. Clean up leave, OD, late arrival requests and corrections
    req_filter = {"$or": [{"studentId": doc_id_str}]}
    if reg_no:
        req_filter["$or"].append({"registerNumber": reg_no})
        req_filter["$or"].append({"register_no": reg_no})
    await mongo_db["leave_requests"].delete_many(req_filter)
    await mongo_db["od_requests"].delete_many(req_filter)
    await mongo_db["late_arrival_requests"].delete_many(req_filter)
    await mongo_db["attendance_corrections"].delete_many(req_filter)

    now_iso = datetime.now(timezone.utc).isoformat()

    # Log to audit_logs
    await mongo_db["audit_logs"].insert_one({
        "action": "STUDENT_PERMANENTLY_DELETED",
        "entity_type": "student_account",
        "entity_id": doc_id_str,
        "user_id": str(current_user.id),
        "deleted_by": current_user.login_id,
        "student_name": student_name,
        "register_no": reg_no,
        "email": email,
        "created_at": now_iso
    })

    return {
        "message": f"Student {student_name} ({reg_no}) permanently deleted successfully.",
        "student_id": doc_id_str,
        "register_no": reg_no
    }


# ============================================================
# DEPARTMENT / SECTION / SUBJECT MANAGEMENT (MongoDB)
# ============================================================
admin_router = APIRouter(prefix="/admin", tags=["Administration"])


class DepartmentCreate(BaseModel):
    name: str
    code: str


class SectionCreate(BaseModel):
    department_code: str
    year: str
    section_name: str


class SubjectCreate(BaseModel):
    name: str
    code: str
    department_code: str
    year: str
    semester: str
    credits: int = 3
    is_lab: bool = False


class TimetableCreate(BaseModel):
    section: str
    subject_name: str
    subject_code: str
    faculty_name: str
    day_of_week: int  # 0=Monday..6=Sunday
    period_number: int
    start_time: str
    end_time: str
    room: Optional[str] = None
    academic_year: str = "2024-25"
    semester: str = "5"


class SettingUpdate(BaseModel):
    value: str


@admin_router.post("/departments")
async def create_department(
    data: DepartmentCreate,
    current_user: models.User = Depends(require_roles(models.UserRole.DEO)),
    mongo_db = Depends(get_db)
):
    existing = await mongo_db["departments"].find_one({"code": data.code})
    if existing:
        raise HTTPException(status_code=400, detail="Department code already exists")

    result = await mongo_db["departments"].insert_one({
        "name": data.name,
        "code": data.code,
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    return {"message": "Department created", "id": str(result.inserted_id)}


@admin_router.get("/departments")
async def list_departments(
    current_user: models.User = Depends(get_current_user),
    mongo_db = Depends(get_db)
):
    depts = await mongo_db["departments"].find({"is_active": True}).to_list(length=100)
    for d in depts:
        d["id"] = str(d["_id"])
        del d["_id"]
    return {"departments": depts}


@admin_router.get("/config/departments")
async def get_config_departments(
    mongo_db = Depends(get_db)
):
    depts = await mongo_db["departments"].find({}, {"_id": 0}).to_list(length=100)
    return {"departments": depts}


@admin_router.get("/config/years")
async def get_config_years(
    mongo_db = Depends(get_db)
):
    years = await mongo_db["years"].find({}, {"_id": 0}).to_list(length=50)
    return {"years": years}


@admin_router.get("/config/sections")
async def get_config_sections(
    mongo_db = Depends(get_db)
):
    sections = await mongo_db["sections"].find({}, {"_id": 0}).to_list(length=200)
    return {"sections": sections}


@admin_router.post("/config/sections")
async def add_config_section(
    data: SectionCreate,
    current_user: models.User = Depends(require_roles(models.UserRole.DEO, models.UserRole.HOD)),
    mongo_db = Depends(get_db)
):
    new_section = {
        "department_code": data.department_code,
        "year": data.year,
        "section_name": data.section_name,
        "status": "ACTIVE",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await mongo_db["sections"].insert_one(new_section)
    return {"message": "Section added successfully"}


@admin_router.put("/config/sections/{section_name}/toggle")
async def toggle_config_section(
    section_name: str,
    current_user: models.User = Depends(require_roles(models.UserRole.DEO, models.UserRole.HOD)),
    mongo_db = Depends(get_db)
):
    section = await mongo_db["sections"].find_one({"section_name": section_name})
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")

    new_status = "INACTIVE" if section.get("status") == "ACTIVE" else "ACTIVE"
    await mongo_db["sections"].update_one(
        {"section_name": section_name},
        {"$set": {"status": new_status}}
    )
    return {"message": f"Section {new_status}"}


@admin_router.get("/classes")
async def list_classes(
    department: Optional[str] = None,
    current_user: models.User = Depends(get_current_user),
    mongo_db = Depends(get_db)
):
    query_filter = {"is_active": True}
    if department:
        query_filter["department_code"] = department

    sections = await mongo_db["sections"].find(query_filter).to_list(length=200)
    for s in sections:
        s["id"] = str(s["_id"])
        del s["_id"]
    return {"classes": sections}


@admin_router.get("/sections")
async def list_sections(
    class_id: Optional[str] = None,
    current_user: models.User = Depends(get_current_user),
    mongo_db = Depends(get_db)
):
    query_filter = {}
    if class_id:
        query_filter["department_code"] = class_id

    sections = await mongo_db["sections"].find(query_filter).to_list(length=200)
    for s in sections:
        s["id"] = str(s["_id"])
        del s["_id"]
    return {"sections": sections}


@admin_router.post("/subjects")
async def create_subject(
    data: SubjectCreate,
    current_user: models.User = Depends(require_roles(models.UserRole.DEO, models.UserRole.HOD)),
    mongo_db = Depends(get_db)
):
    result = await mongo_db["subjects"].insert_one({
        "name": data.name,
        "code": data.code,
        "department_code": data.department_code,
        "year": data.year,
        "semester": data.semester,
        "credits": data.credits,
        "is_lab": data.is_lab,
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    return {"message": "Subject created", "id": str(result.inserted_id)}


@admin_router.get("/subjects")
async def list_subjects(
    department_code: Optional[str] = None,
    year: Optional[str] = None,
    semester: Optional[str] = None,
    current_user: models.User = Depends(get_current_user),
    mongo_db = Depends(get_db)
):
    query_filter = {"is_active": True}
    if department_code:
        query_filter["department_code"] = department_code
    if year:
        query_filter["year"] = year
    if semester:
        query_filter["semester"] = semester

    subjects = await mongo_db["subjects"].find(query_filter).to_list(length=200)
    for s in subjects:
        s["id"] = str(s["_id"])
        del s["_id"]
    return {"subjects": subjects}


@admin_router.post("/timetable")
async def create_timetable_entry(
    data: TimetableCreate,
    current_user: models.User = Depends(require_roles(models.UserRole.DEO, models.UserRole.HOD)),
    mongo_db = Depends(get_db)
):
    result = await mongo_db["timetables"].insert_one({
        "section": data.section,
        "subject_name": data.subject_name,
        "subject_code": data.subject_code,
        "faculty_name": data.faculty_name,
        "day_of_week": data.day_of_week,
        "period_number": data.period_number,
        "start_time": data.start_time,
        "end_time": data.end_time,
        "room": data.room,
        "academic_year": data.academic_year,
        "semester": data.semester,
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    return {"message": "Timetable entry created", "id": str(result.inserted_id)}


@admin_router.get("/settings")
async def get_settings(
    current_user: models.User = Depends(require_roles(models.UserRole.DEO, models.UserRole.HOD)),
    mongo_db = Depends(get_db)
):
    settings_list = await mongo_db["settings"].find({}).to_list(length=200)
    for s in settings_list:
        s["id"] = str(s["_id"])
        del s["_id"]
    return {"settings": settings_list}


@admin_router.put("/settings/{key}")
async def update_setting(
    key: str,
    data: SettingUpdate,
    current_user: models.User = Depends(require_roles(models.UserRole.DEO)),
    mongo_db = Depends(get_db)
):
    setting = await mongo_db["settings"].find_one({"key": key})
    if not setting:
        raise HTTPException(status_code=404, detail="Setting not found")

    old_val = setting.get("value")
    await mongo_db["settings"].update_one(
        {"key": key},
        {"$set": {"value": data.value, "updated_by": str(current_user.id), "updated_at": datetime.now(timezone.utc).isoformat()}}
    )

    await mongo_db["audit_logs"].insert_one({
        "action": "SETTING_UPDATED",
        "entity_type": "setting",
        "entity_id": key,
        "user_id": str(current_user.id),
        "user_role": str(current_user.role),
        "previous_value": {"value": old_val},
        "new_value": {"value": data.value},
        "created_at": datetime.now(timezone.utc).isoformat()
    })

    return {"message": "Setting updated"}
