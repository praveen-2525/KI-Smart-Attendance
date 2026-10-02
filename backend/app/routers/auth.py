"""
Authentication Router - login, logout, token refresh, password reset
"""
from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.database import get_db, get_mongo_db
from app import models
from app.auth import (
    verify_password, get_password_hash, create_access_token,
    create_refresh_token, verify_token, get_current_user
)
from app.audit_service import AuditService

router = APIRouter(prefix="/auth", tags=["Authentication"])


class VerifyStudentRequest(BaseModel):
    register_no: str

class LoginRequest(BaseModel):
    login_id: str
    password: str

class RegisterRequest(BaseModel):
    register_no: str
    name: str
    date_of_birth: str
    department: str
    year: str
    section: str
    email: str
    phone: str
    password: str
    confirm_password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user_id: int
    role: str
    full_name: str
    login_id: str
    is_first_login: bool


class RefreshRequest(BaseModel):
    refresh_token: str


class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str


class PasswordResetRequest(BaseModel):
    login_id: str
    email: str


class FCMTokenUpdate(BaseModel):
    fcm_token: str

@router.post("/verify-student")
async def verify_student(
    data: VerifyStudentRequest,
    mongo_db = Depends(get_mongo_db)
):
    reg_no = data.register_no.strip()
    master = mongo_db["student_master"].find_one({"register_no": reg_no})
    if not master:
        raise HTTPException(status_code=403, detail="Register Number not recognized. Please contact the college administrator.")
        
    existing_account = mongo_db["student_accounts"].find_one({"register_no": reg_no})
    if existing_account:
        raise HTTPException(status_code=400, detail="This Register Number is already registered. Please sign in instead.")
        
    return {
        "register_no": master["register_no"],
        "name": master["name"],
        "date_of_birth": master["date_of_birth"],
        "department": master["department"],
        "department_code": master.get("department_code"),
        "year": master["year"],
        "section": master["section"]
    }

@router.post("/register")
async def register(
    data: RegisterRequest,
    mongo_db = Depends(get_mongo_db)
):
    if data.password != data.confirm_password:
        raise HTTPException(status_code=400, detail="Passwords do not match")
    
    reg_no = data.register_no.strip()
    
    # 1. Check if authorized student exists in student_master
    master = mongo_db["student_master"].find_one({"register_no": reg_no})
    if not master:
        raise HTTPException(status_code=403, detail="Register Number not recognized. Please contact the college administrator.")
    
    # 2. Check if already registered in student_accounts
    existing_account = mongo_db["student_accounts"].find_one({"register_no": reg_no})
    if existing_account:
        raise HTTPException(status_code=400, detail="This Register Number is already registered. Please sign in instead.")
        
    existing_email = mongo_db["student_accounts"].find_one({"email": data.email})
    if existing_email:
        raise HTTPException(status_code=400, detail="This email is already registered.")

    # 3. Create document in student_accounts using MASTER data for core fields
    new_student = {
        "student_master_id": str(master["_id"]),
        "register_no": reg_no,
        "name": master["name"],
        "date_of_birth": master["date_of_birth"],
        "department": master["department"],
        "department_code": master.get("department_code"),
        "year": master["year"],
        "section": master["section"],
        "email": data.email,
        "phone": data.phone,
        "password_hash": get_password_hash(data.password),
        "role": "STUDENT",
        "status": "ACTIVE",
        "first_login": False,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc)
    }
    
    result = mongo_db["student_accounts"].insert_one(new_student)
    
    # Update master record status
    mongo_db["student_master"].update_one(
        {"register_no": reg_no},
        {"$set": {"status": "REGISTERED"}}
    )
    
    return {"message": "Registration successful", "id": str(result.inserted_id)}


@router.post("/login", response_model=TokenResponse)
async def login(
    request: Request,
    login_data: LoginRequest,
    db: Session = Depends(get_db),
    mongo_db = Depends(get_mongo_db)
):
    login_id = login_data.login_id
    
    # 1. Check student_accounts collection
    mongo_user = mongo_db["student_accounts"].find_one({"register_no": login_id})
    if not mongo_user:
        # Fallback to users collection for FACULTY, DEO, etc. demo accounts
        mongo_user = mongo_db["users"].find_one({"login_id": login_id})
        
    user_found = mongo_user is not None
    password_valid = False
    role = None
    status_msg = "UNKNOWN"
    
    if mongo_user:
        # The prompt uses password_hash for students, hashed_password for older users
        pw_hash = mongo_user.get("password_hash") or mongo_user.get("hashed_password", "")
        password_valid = verify_password(login_data.password, pw_hash)
        role = mongo_user.get("role")
        status_msg = mongo_user.get("status", "INACTIVE")
        
    print(f"\nAuth Debug:\nlogin_id = {login_id}\nuser_found = {str(user_found).lower()}\nrole = {role}\nstatus = {status_msg}\npassword_valid = {str(password_valid).lower()}\n")
    
    if mongo_user and password_valid and status_msg == "ACTIVE":
        user_doc_id = str(mongo_user["_id"])
        import hashlib
        num_id = int(hashlib.md5(user_doc_id.encode()).hexdigest(), 16) % (10 ** 8)
        
        # Create a mock SQL user object to reuse the rest of the flow seamlessly
        user = models.User(
            id=num_id,
            login_id=login_id,
            hashed_password=pw_hash,
            role=role,
            full_name=mongo_user.get("name", "User"),
            is_active=True,
            is_first_login=mongo_user.get("first_login", False)
        )
    else:
        # Fallback to SQL database for non-demo accounts (legacy support while migrating)
        user = db.query(models.User).filter(models.User.login_id == login_id).first()
        if not user or not verify_password(login_data.password, user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid login ID or password"
            )

    if not getattr(user, 'is_active', True):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is disabled. Contact administrator."
        )

    # Update last login
    user.last_login = datetime.now(timezone.utc)
    # We only commit if it's an SQL user
    if hasattr(user, '_sa_instance_state'):
        db.commit()

    # Audit log (Assuming AuditService can handle it or we skip if MongoDB)
    if hasattr(user, '_sa_instance_state'):
        audit = AuditService(db)
        audit.log(
            action="USER_LOGIN",
            entity_type="user",
            entity_id=user.id,
            user_id=user.id,
            user_role=user.role,
            ip_address=request.client.host if request.client else None
        )
        db.commit()

    access_token = create_access_token({"sub": str(user.id), "login_id": user.login_id, "role": user.role})
    refresh_token = create_refresh_token({"sub": str(user.id), "login_id": user.login_id, "role": user.role})

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user_id=user.id,
        role=user.role,
        full_name=user.full_name,
        login_id=user.login_id,
        is_first_login=getattr(user, "is_first_login", False)
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    refresh_data: RefreshRequest,
    db: Session = Depends(get_db)
):
    payload = verify_token(refresh_data.refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token"
        )

    user_id = payload.get("sub")
    user = db.query(models.User).filter(models.User.id == int(user_id)).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    access_token = create_access_token({"sub": str(user.id), "role": user.role})
    new_refresh_token = create_refresh_token({"sub": str(user.id), "role": user.role})

    return TokenResponse(
        access_token=access_token,
        refresh_token=new_refresh_token,
        user_id=user.id,
        role=user.role,
        full_name=user.full_name,
        login_id=user.login_id,
        is_first_login=user.is_first_login
    )


@router.post("/change-password")
async def change_password(
    data: PasswordChangeRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if not verify_password(data.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    if len(data.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    current_user.hashed_password = get_password_hash(data.new_password)
    current_user.is_first_login = False
    db.commit()

    audit = AuditService(db)
    audit.log(
        action="PASSWORD_CHANGED",
        entity_type="user",
        entity_id=current_user.id,
        user_id=current_user.id,
        user_role=current_user.role
    )
    db.commit()

    return {"message": "Password changed successfully"}


@router.get("/me")
async def get_me(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db), mongo_db = Depends(get_mongo_db)):
    profile_data = {}

    is_sql_user = hasattr(current_user, '_sa_instance_state')
    
    if current_user.role == models.UserRole.STUDENT:
        student = current_user.student_profile if is_sql_user else None
        if student:
            profile_data = {
                "register_number": student.register_number,
                "year": student.year,
                "semester": student.semester,
                "academic_year": student.academic_year,
                "department": student.department.name if student.department else None,
                "department_code": student.department.code if student.department else None,
                "class_name": student.class_.name if student.class_ else None,
                "section": student.section.name if student.section else None,
                "student_id": student.id
            }
        else:
            # Fetch from MongoDB student_accounts
            mongo_student = mongo_db["student_accounts"].find_one({"register_no": current_user.login_id})
            if mongo_student:
                profile_data = {
                    "register_number": mongo_student["register_no"],
                    "year": mongo_student.get("year"),
                    "department": mongo_student.get("department"),
                    "department_code": mongo_student.get("department_code"),
                    "section": mongo_student.get("section"),
                }
            else:
                profile_data = {"register_number": current_user.login_id}
            
    elif current_user.role == models.UserRole.FACULTY:
        faculty = current_user.faculty_profile if is_sql_user else None
        if faculty:
            profile_data = {
                "employee_id": faculty.employee_id,
                "department": faculty.department.name if faculty.department else None,
                "designation": faculty.designation,
                "is_advisor": faculty.is_advisor,
                "faculty_id": faculty.id
            }
        elif not is_sql_user:
            profile_data = {"employee_id": current_user.login_id}

    return {
        "id": current_user.id,
        "login_id": current_user.login_id,
        "full_name": current_user.full_name,
        "email": current_user.email,
        "role": current_user.role,
        "is_active": current_user.is_active,
        "is_first_login": getattr(current_user, "is_first_login", False),
        "last_login": getattr(current_user, "last_login", None),
        **profile_data
    }


@router.put("/fcm-token")
async def update_fcm_token(
    data: FCMTokenUpdate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    current_user.fcm_token = data.fcm_token
    db.commit()
    return {"message": "FCM token updated"}
