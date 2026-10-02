"""
Authentication Router - login, logout, token refresh, password reset
"""
from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.database import get_db
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
    roll_number: str
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
    mongo_db = Depends(get_db)
):
    reg_no = data.register_no.strip()
    master = await mongo_db["student_master"].find_one({"register_no": reg_no})
    if not master:
        raise HTTPException(status_code=403, detail="Register Number not recognized. Please contact the college administrator.")
        
    existing_account = await mongo_db["student_accounts"].find_one({"register_no": reg_no})
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
    mongo_db = Depends(get_db)
):
    try:
        # Check DB connection
        await mongo_db.command("ping")
    except Exception:
        raise HTTPException(status_code=503, detail="Authentication server is currently unavailable.")

    import re
    if data.password != data.confirm_password:
        raise HTTPException(status_code=400, detail="Passwords do not match")
    
    roll_no = data.roll_number.strip()
    reg_no = data.register_no.strip()
    email = data.email.strip().lower()
    
    # Backend validations
    if not re.match(r"^[0-9]{2}AIM[0-9]{3}$", roll_no):
        raise HTTPException(status_code=400, detail="Roll Number must be in the format 24AIM040.")
    if not re.match(r"^[0-9]{12}$", reg_no):
        raise HTTPException(status_code=400, detail="Register Number must contain exactly 12 digits.")
    if not re.match(r"^[0-9]{10}$", data.phone.strip()):
        raise HTTPException(status_code=400, detail="Mobile Number must contain exactly 10 digits.")
    
    # 2. Check if already registered in student_accounts
    if await mongo_db["student_accounts"].find_one({"roll_number": roll_no}):
        raise HTTPException(status_code=400, detail="This Roll Number is already registered.")
        
    if await mongo_db["student_accounts"].find_one({"register_no": reg_no}):
        raise HTTPException(status_code=400, detail="This Register Number is already registered.")
        
    if await mongo_db["student_accounts"].find_one({"email": email}):
        raise HTTPException(status_code=400, detail="This College Email is already registered.")

    # 3. Create document in student_accounts using provided data
    new_student = {
        "roll_number": roll_no,
        "register_no": reg_no,
        "name": data.name,
        "date_of_birth": data.date_of_birth,
        "department": data.department,
        "department_code": "AIML" if data.department == "CSE(AI&ML)" else "",
        "year": data.year,
        "section": data.section,
        "email": email,
        "phone": data.phone.strip(),
        "password_hash": get_password_hash(data.password),
        "role": "STUDENT",
        "status": "ACTIVE",
        "first_login": False,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc)
    }
    
    result = await mongo_db["student_accounts"].insert_one(new_student)
    
    return {"message": "Registration successful", "id": str(result.inserted_id)}


@router.post("/login", response_model=TokenResponse)
async def login(
    request: Request,
    login_data: LoginRequest,
    db: Session = Depends(get_db),
    mongo_db = Depends(get_db)
):
    try:
        await mongo_db.command("ping")
    except Exception:
        raise HTTPException(status_code=503, detail="Authentication server is currently unavailable.")

    login_id = login_data.login_id.strip()
    
    import re
    # Determine type of login ID
    login_type = None
    query = None
    
    if re.match(r"^[0-9]{2}AIM[0-9]{3}$", login_id):
        login_type = "Roll Number"
        query = {"roll_number": login_id}
    elif re.match(r"^[0-9]{12}$", login_id):
        login_type = "Register Number"
        query = {"register_no": login_id}
    elif "@" in login_id:
        login_type = "College Email"
        query = {"email": login_id.lower()}
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Enter a valid Roll Number, 12-digit Register Number or College Email."
        )
    
    # 1. Check student_accounts collection
    mongo_user = await mongo_db["student_accounts"].find_one(query)
    
    if not mongo_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No account found for this {login_type}."
        )
        
    user_found = True
    password_valid = False
    role = mongo_user.get("role")
    status_msg = mongo_user.get("status", "INACTIVE")
    
    pw_hash = mongo_user.get("password_hash", "")
    password_valid = verify_password(login_data.password, pw_hash)
        
    if not password_valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect password."
        )
        
    if status_msg != "ACTIVE":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account is inactive. Please contact the administrator."
        )
        
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

    # Update last login in MongoDB
    await mongo_db["student_accounts"].update_one(
        {"_id": mongo_user["_id"]},
        {"$set": {"last_login": datetime.now(timezone.utc)}}
    )

    # TODO: Add Audit log for MongoDB


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
    
    # Check if we should update mongo instead
    if not hasattr(db, "commit"):
        await db["student_accounts"].update_one(
            {"register_no": current_user.login_id},
            {"$set": {"password_hash": current_user.hashed_password, "first_login": False}}
        )
    else:
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
async def get_me(current_user: models.User = Depends(get_current_user), mongo_db = Depends(get_db)):
    profile_data = {}
    user_role_str = str(current_user.role).upper()
    
    if "STUDENT" in user_role_str:
        # Fetch from MongoDB student_accounts
        mongo_student = await mongo_db["student_accounts"].find_one({
            "$or": [
                {"register_no": current_user.login_id},
                {"roll_number": current_user.login_id},
                {"email": current_user.login_id.lower()}
            ]
        })
        if mongo_student:
            profile_data = {
                "name": mongo_student.get("name", current_user.full_name),
                "full_name": mongo_student.get("name", current_user.full_name),
                "register_number": mongo_student.get("register_no", current_user.login_id),
                "roll_number": mongo_student.get("roll_number"),
                "year": mongo_student.get("year", "III Year"),
                "department": mongo_student.get("department", "CSE(AI&ML)"),
                "department_code": mongo_student.get("department_code", "AIML"),
                "section": mongo_student.get("section", "AIML"),
                "email": mongo_student.get("email", current_user.email),
                "phone": mongo_student.get("phone"),
                "student_id": str(mongo_student["_id"])
            }
        else:
            profile_data = {
                "name": current_user.full_name,
                "full_name": current_user.full_name,
                "register_number": current_user.login_id,
                "email": current_user.email
            }
            
    elif "FACULTY" in user_role_str or "ADVISOR" in user_role_str or "HOD" in user_role_str:
        profile_data = {"employee_id": current_user.login_id}

    return {
        "id": current_user.id,
        "login_id": current_user.login_id,
        "full_name": profile_data.get("full_name") or current_user.full_name,
        "email": profile_data.get("email") or current_user.email,
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
    if not hasattr(db, "commit"):
        pass # update mongo token here if needed
    else:
        db.commit()
    return {"message": "FCM token updated"}
