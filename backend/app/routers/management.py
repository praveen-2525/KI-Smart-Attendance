"""
User management, DEO management routers
"""
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from app.database import get_db
from app import models
from app.auth import get_current_user, require_roles, get_password_hash
from app.audit_service import AuditService

# ============================================================
# USER MANAGEMENT (DEO)
# ============================================================
users_router = APIRouter(prefix="/users", tags=["User Management"])


class CreateUserRequest(BaseModel):
    login_id: str
    password: str
    role: str
    full_name: str
    email: Optional[str] = None
    phone: Optional[str] = None


class CreateStudentRequest(BaseModel):
    login_id: str
    password: str
    full_name: str
    email: Optional[str] = None
    register_number: str
    department_id: int
    class_id: int
    section_id: int
    year: int
    semester: int
    academic_year: str = "2024-25"


class CreateFacultyRequest(BaseModel):
    login_id: str
    password: str
    full_name: str
    email: Optional[str] = None
    employee_id: str
    department_id: int
    designation: Optional[str] = None
    role: str = "faculty"
    is_advisor: bool = False
    advisor_section_id: Optional[int] = None


@users_router.post("/student")
async def create_student(
    data: CreateStudentRequest,
    current_user: models.User = Depends(require_roles(models.UserRole.DEO)),
    db: Session = Depends(get_db)
):
    # Check unique
    if db.query(models.User).filter(models.User.login_id == data.login_id).first():
        raise HTTPException(status_code=400, detail="Login ID already exists")
    if db.query(models.Student).filter(models.Student.register_number == data.register_number).first():
        raise HTTPException(status_code=400, detail="Register number already exists")

    user = models.User(
        login_id=data.login_id,
        hashed_password=get_password_hash(data.password),
        role=models.UserRole.STUDENT,
        full_name=data.full_name,
        email=data.email,
        is_active=True
    )
    db.add(user)
    db.flush()

    student = models.Student(
        user_id=user.id,
        register_number=data.register_number,
        department_id=data.department_id,
        class_id=data.class_id,
        section_id=data.section_id,
        year=data.year,
        semester=data.semester,
        academic_year=data.academic_year
    )
    db.add(student)

    audit = AuditService(db)
    audit.log("STUDENT_CREATED", "student", user_id=current_user.id, user_role=current_user.role,
              new_value={"login_id": data.login_id, "register_number": data.register_number})

    db.commit()
    return {"message": "Student created", "user_id": user.id}


@users_router.post("/faculty")
async def create_faculty(
    data: CreateFacultyRequest,
    current_user: models.User = Depends(require_roles(models.UserRole.DEO)),
    db: Session = Depends(get_db)
):
    if db.query(models.User).filter(models.User.login_id == data.login_id).first():
        raise HTTPException(status_code=400, detail="Login ID already exists")
    if db.query(models.Faculty).filter(models.Faculty.employee_id == data.employee_id).first():
        raise HTTPException(status_code=400, detail="Employee ID already exists")

    role = models.UserRole(data.role)
    user = models.User(
        login_id=data.login_id,
        hashed_password=get_password_hash(data.password),
        role=role,
        full_name=data.full_name,
        email=data.email,
        is_active=True
    )
    db.add(user)
    db.flush()

    faculty = models.Faculty(
        user_id=user.id,
        employee_id=data.employee_id,
        department_id=data.department_id,
        designation=data.designation,
        is_advisor=data.is_advisor,
        advisor_section_id=data.advisor_section_id
    )
    db.add(faculty)
    db.commit()
    return {"message": "Faculty created", "user_id": user.id}


@users_router.get("/students")
async def list_students(
    department_id: Optional[int] = None,
    class_id: Optional[int] = None,
    section_id: Optional[int] = None,
    year: Optional[int] = None,
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(50, le=200),
    current_user: models.User = Depends(require_roles(
        models.UserRole.DEO, models.UserRole.HOD, models.UserRole.ADVISOR
    )),
    db: Session = Depends(get_db)
):
    query = db.query(models.Student).filter(models.Student.is_active == True)
    if department_id:
        query = query.filter(models.Student.department_id == department_id)
    if class_id:
        query = query.filter(models.Student.class_id == class_id)
    if section_id:
        query = query.filter(models.Student.section_id == section_id)
    if year:
        query = query.filter(models.Student.year == year)
    if search:
        query = query.join(models.User).filter(
            models.User.full_name.ilike(f"%{search}%") |
            models.Student.register_number.ilike(f"%{search}%")
        )

    total = query.count()
    students = query.offset((page - 1) * limit).limit(limit).all()

    return {
        "total": total,
        "students": [
            {
                "id": s.id,
                "register_number": s.register_number,
                "name": s.user.full_name,
                "email": s.user.email,
                "year": s.year,
                "semester": s.semester,
                "department": s.department.name if s.department else None,
                "class_name": s.class_.name if s.class_ else None,
                "section": s.section.name if s.section else None,
                "is_active": s.user.is_active,
                "last_login": s.user.last_login
            } for s in students
        ]
    }


@users_router.post("/students/import")
async def import_students(
    file: UploadFile = File(...),
    confirm: bool = Form(False),
    # Skipping role check for migration phase, or could add an async auth dependency later
    mongo_db = Depends(get_mongo_db)
):
    import csv
    import io
    from datetime import datetime as dt
    
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are supported")
        
    content = await file.read()
    text = content.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    
    required_cols = ["register_no", "name", "date_of_birth", "department", "year", "section", "email", "phone"]
    missing_cols = [c for c in required_cols if c not in reader.fieldnames]
    if missing_cols:
        raise HTTPException(status_code=400, detail=f"Missing columns: {', '.join(missing_cols)}")
        
    valid_rows = []
    invalid_rows = []
    
    master_coll = mongo_db["student_master"]
    
    # Pre-fetch existing register numbers to avoid duplicates
    existing_cursor = master_coll.find({}, {"register_no": 1})
    existing_reg_nos = {doc["register_no"] for doc in existing_cursor}
    
    for row_num, row in enumerate(reader, start=2):
        errors = []
        reg_no = row.get("register_no", "").strip()
        
        if not reg_no:
            errors.append("Missing register_no")
        elif reg_no in existing_reg_nos:
            errors.append(f"Register number {reg_no} already exists in master data")
            
        # Basic validation (could add more complex date/department validation here)
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
            existing_reg_nos.add(reg_no) # prevent duplicates in same file
            
    if confirm and not invalid_rows and valid_rows:
        docs_to_insert = [vr["data"] for vr in valid_rows]
        master_coll.insert_many(docs_to_insert)
        
        return {"message": f"Successfully imported {len(valid_rows)} students into master", "imported": len(valid_rows)}
        
    return {
        "total_processed": len(valid_rows) + len(invalid_rows),
        "valid_count": len(valid_rows),
        "invalid_count": len(invalid_rows),
        "valid_rows": valid_rows[:10], # preview first 10
        "invalid_rows": invalid_rows
    }


@users_router.put("/{user_id}/toggle-status")
async def toggle_user_status(
    user_id: int,
    current_user: models.User = Depends(require_roles(models.UserRole.DEO)),
    db: Session = Depends(get_db)
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_active = not user.is_active
    db.commit()
    return {"message": f"User {'activated' if user.is_active else 'deactivated'}", "is_active": user.is_active}


# ============================================================
# DEPARTMENT / CLASS / SECTION / SUBJECT MANAGEMENT
# ============================================================
admin_router = APIRouter(prefix="/admin", tags=["Administration"])


class DepartmentCreate(BaseModel):
    name: str
    code: str


class ClassCreate(BaseModel):
    name: str
    department_id: int
    year: int
    academic_year: str = "2024-25"


class SectionCreate(BaseModel):
    name: str
    class_id: int
    advisor_faculty_id: Optional[int] = None


class SubjectCreate(BaseModel):
    name: str
    code: str
    department_id: int
    year: int
    semester: int
    credits: int = 3
    is_lab: bool = False


class TimetableCreate(BaseModel):
    section_id: int
    subject_id: int
    faculty_id: int
    day_of_week: int
    period_number: int
    start_time: str
    end_time: str
    room: Optional[str] = None
    academic_year: str = "2024-25"
    semester: int = 1


@admin_router.post("/departments")
async def create_department(
    data: DepartmentCreate,
    current_user: models.User = Depends(require_roles(models.UserRole.DEO)),
    db: Session = Depends(get_db)
):
    dept = models.Department(name=data.name, code=data.code)
    db.add(dept)
    db.commit()
    return {"message": "Department created", "id": dept.id}


@admin_router.get("/departments")
async def list_departments(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    depts = db.query(models.Department).filter(models.Department.is_active == True).all()
    return {
        "departments": [
            {"id": d.id, "name": d.name, "code": d.code} for d in depts
        ]
    }


@admin_router.post("/classes")
async def create_class(
    data: ClassCreate,
    current_user: models.User = Depends(require_roles(models.UserRole.DEO)),
    db: Session = Depends(get_db)
):
    cls = models.Class(**data.dict())
    db.add(cls)
    db.commit()
    return {"message": "Class created", "id": cls.id}


@admin_router.get("/classes")
async def list_classes(
    department_id: Optional[int] = None,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(models.Class).filter(models.Class.is_active == True)
    if department_id:
        query = query.filter(models.Class.department_id == department_id)
    classes = query.all()
    return {
        "classes": [
            {
                "id": c.id, "name": c.name, "year": c.year,
                "department_id": c.department_id,
                "department_name": c.department.name if c.department else None
            } for c in classes
        ]
    }


@admin_router.post("/sections")
async def create_section(
    data: SectionCreate,
    current_user: models.User = Depends(require_roles(models.UserRole.DEO)),
    db: Session = Depends(get_db)
):
    section = models.Section(**data.dict())
    db.add(section)
    db.commit()
    return {"message": "Section created", "id": section.id}


@admin_router.get("/sections")
async def list_sections(
    class_id: Optional[int] = None,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(models.Section).filter(models.Section.is_active == True)
    if class_id:
        query = query.filter(models.Section.class_id == class_id)
    sections = query.all()
    return {
        "sections": [
            {
                "id": s.id, "name": s.name, "class_id": s.class_id,
                "advisor_faculty_id": s.advisor_faculty_id
            } for s in sections
        ]
    }


@admin_router.post("/subjects")
async def create_subject(
    data: SubjectCreate,
    current_user: models.User = Depends(require_roles(models.UserRole.DEO)),
    db: Session = Depends(get_db)
):
    subject = models.Subject(**data.dict())
    db.add(subject)
    db.commit()
    return {"message": "Subject created", "id": subject.id}


@admin_router.get("/subjects")
async def list_subjects(
    department_id: Optional[int] = None,
    year: Optional[int] = None,
    semester: Optional[int] = None,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(models.Subject).filter(models.Subject.is_active == True)
    if department_id:
        query = query.filter(models.Subject.department_id == department_id)
    if year:
        query = query.filter(models.Subject.year == year)
    if semester:
        query = query.filter(models.Subject.semester == semester)
    subjects = query.all()
    return {
        "subjects": [
            {
                "id": s.id, "name": s.name, "code": s.code,
                "credits": s.credits, "is_lab": s.is_lab,
                "department_id": s.department_id, "year": s.year, "semester": s.semester
            } for s in subjects
        ]
    }


@admin_router.get("/config/departments")
async def get_mongo_departments(mongo_db = Depends(get_mongo_db)):
    depts = list(mongo_db["departments"].find({}, {"_id": 0}))
    return {"departments": depts}

@admin_router.get("/config/years")
async def get_mongo_years(mongo_db = Depends(get_mongo_db)):
    years = list(mongo_db["years"].find({}, {"_id": 0}))
    return {"years": years}

@admin_router.get("/config/sections")
async def get_mongo_sections(mongo_db = Depends(get_mongo_db)):
    sections = list(mongo_db["sections"].find({}, {"_id": 0}))
    return {"sections": sections}

@admin_router.post("/config/sections")
async def add_mongo_section(
    data: dict, # expecting { department_code, year, section_name }
    mongo_db = Depends(get_mongo_db)
):
    new_section = {
        "department_code": data["department_code"],
        "year": data["year"],
        "section_name": data["section_name"],
        "status": "ACTIVE"
    }
    mongo_db["sections"].insert_one(new_section)
    return {"message": "Section added successfully"}

@admin_router.put("/config/sections/{section_name}/toggle")
async def toggle_mongo_section(
    section_name: str,
    mongo_db = Depends(get_mongo_db)
):
    section = mongo_db["sections"].find_one({"section_name": section_name})
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")
        
    new_status = "INACTIVE" if section.get("status") == "ACTIVE" else "ACTIVE"
    mongo_db["sections"].update_one(
        {"section_name": section_name},
        {"$set": {"status": new_status}}
    )
    return {"message": f"Section {new_status}"}

@admin_router.post("/timetable")
async def create_timetable_entry(
    data: TimetableCreate,
    current_user: models.User = Depends(require_roles(models.UserRole.DEO, models.UserRole.HOD)),
    db: Session = Depends(get_db)
):
    from datetime import time as time_type
    entry = models.TimetableEntry(
        section_id=data.section_id,
        subject_id=data.subject_id,
        faculty_id=data.faculty_id,
        day_of_week=data.day_of_week,
        period_number=data.period_number,
        start_time=time_type.fromisoformat(data.start_time),
        end_time=time_type.fromisoformat(data.end_time),
        room=data.room,
        academic_year=data.academic_year,
        semester=data.semester
    )
    db.add(entry)
    db.commit()
    return {"message": "Timetable entry created", "id": entry.id}


# Settings management
class SettingUpdate(BaseModel):
    value: str


@admin_router.get("/settings")
async def get_settings(
    current_user: models.User = Depends(require_roles(models.UserRole.DEO, models.UserRole.HOD)),
    db: Session = Depends(get_db)
):
    settings_list = db.query(models.Setting).all()
    return {
        "settings": [
            {"key": s.key, "value": s.value, "description": s.description, "category": s.category}
            for s in settings_list
        ]
    }


@admin_router.put("/settings/{key}")
async def update_setting(
    key: str,
    data: SettingUpdate,
    current_user: models.User = Depends(require_roles(models.UserRole.DEO)),
    db: Session = Depends(get_db)
):
    setting = db.query(models.Setting).filter(models.Setting.key == key).first()
    if not setting:
        raise HTTPException(status_code=404, detail="Setting not found")
    old_val = setting.value
    setting.value = data.value
    setting.updated_by = current_user.id

    audit = AuditService(db)
    audit.log("SETTING_UPDATED", "setting", entity_id=setting.id,
              user_id=current_user.id, user_role=current_user.role,
              previous_value={"value": old_val}, new_value={"value": data.value})

    db.commit()
    return {"message": "Setting updated"}
