"""
Authentication Router - login, logout, token refresh, password reset
"""
from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Request
from pydantic import BaseModel
from app.database import get_db
from app import models
from app.auth import (
    verify_password, get_password_hash, create_access_token,
    create_refresh_token, verify_token, get_current_user
)

router = APIRouter(prefix="/auth", tags=["Authentication"])


class VerifyStudentRequest(BaseModel):
    register_no: str

class LoginRequest(BaseModel):
    login_id: str
    password: str
    target_role: Optional[str] = None

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
    mongo_db = Depends(get_db)
):
    try:
        await mongo_db.command("ping")
    except Exception:
        raise HTTPException(status_code=503, detail="Authentication server is currently unavailable.")

    login_id = login_data.login_id.strip()
    target_role = login_data.target_role.lower() if login_data.target_role else None
    
    clean_id = login_id
    clean_email = login_id.lower()

    # Generic lookup query supporting both snake_case and camelCase field conventions
    student_query = {
        "$or": [
            {"email": clean_email},
            {"collegeEmail": clean_email},
            {"register_no": clean_id},
            {"registerNumber": clean_id},
            {"roll_number": clean_id},
            {"rollNumber": clean_id},
            {"login_id": clean_id}
        ]
    }

    staff_query = {
        "$or": [
            {"email": clean_email},
            {"collegeEmail": clean_email},
            {"login_id": clean_id}
        ]
    }
    
    # 1. Check student_accounts collection
    mongo_user = await mongo_db["student_accounts"].find_one(student_query)
    
    # 2. If not found in student_accounts, check staff_accounts collection
    if not mongo_user:
        mongo_user = await mongo_db["staff_accounts"].find_one(staff_query)

    # 3. Fallback check in users collection if present
    if not mongo_user:
        mongo_user = await mongo_db["users"].find_one({"$or": [{"email": clean_email}, {"login_id": clean_id}]})
    
    if not mongo_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials. Please check your details and try again."
        )
        
    role = str(mongo_user.get("role", "")).lower()
    raw_status = mongo_user.get("status") or mongo_user.get("accountStatus") or "ACTIVE"
    status_msg = str(raw_status).upper()

    # Backend Role Verification against target portal if provided
    if target_role and target_role != role:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="These credentials do not belong to the selected role."
        )

    # Check Account Status
    if status_msg == "INACTIVE":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your student account is inactive. Please contact the DEO."
        )
    elif status_msg == "SUSPENDED":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account has been suspended. Please contact the DEO."
        )
    elif status_msg != "ACTIVE":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your student account is not active. Please contact the DEO."
        )
        
    pw_hash = mongo_user.get("password_hash") or mongo_user.get("passwordHash") or ""
    password_valid = verify_password(login_data.password, pw_hash)

    if not password_valid and mongo_user.get("date_of_birth"):
        from app.routers.management import format_dob_password
        import re
        dob_pw = format_dob_password(str(mongo_user.get("date_of_birth")))
        input_clean = re.sub(r"\D", "", login_data.password.strip())
        if (input_clean == dob_pw or login_data.password.strip() == dob_pw) and verify_password(dob_pw, pw_hash):
            password_valid = True
        
    if not password_valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials. Please check your details and try again."
        )
        
    user_doc_id = str(mongo_user["_id"])
    import hashlib
    num_id = int(hashlib.md5(user_doc_id.encode()).hexdigest(), 16) % (10 ** 8)
    
    user = models.User(
        id=num_id,
        login_id=login_id,
        hashed_password=pw_hash,
        role=role,
        full_name=mongo_user.get("name") or mongo_user.get("fullName", "User"),
        email=mongo_user.get("email", ""),
        is_active=True,
        is_first_login=mongo_user.get("first_login", False)
    )

    target_coll = "student_accounts" if role == "student" else "staff_accounts"
    await mongo_db[target_coll].update_one(
        {"_id": mongo_user["_id"]},
        {"$set": {"last_login": datetime.now(timezone.utc).isoformat()}}
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
    mongo_db = Depends(get_db)
):
    payload = verify_token(refresh_data.refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token"
        )

    user_id = payload.get("sub")
    login_id = payload.get("login_id", "")
    role = payload.get("role", "student")

    if not user_id or not login_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")

    # Verify user still exists and is active - check both collections
    mongo_user = await mongo_db["student_accounts"].find_one({
        "$or": [
            {"register_no": login_id},
            {"roll_number": login_id},
            {"email": login_id.lower()}
        ]
    })
    if not mongo_user:
        mongo_user = await mongo_db["staff_accounts"].find_one({
            "$or": [{"email": login_id.lower()}, {"login_id": login_id}]
        })

    if not mongo_user or mongo_user.get("status", "INACTIVE") != "ACTIVE":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")

    access_token = create_access_token({"sub": user_id, "login_id": login_id, "role": role})
    new_refresh_token = create_refresh_token({"sub": user_id, "login_id": login_id, "role": role})

    import hashlib
    num_id = int(hashlib.md5(str(mongo_user["_id"]).encode()).hexdigest(), 16) % (10 ** 8)

    return TokenResponse(
        access_token=access_token,
        refresh_token=new_refresh_token,
        user_id=num_id,
        role=role,
        full_name=mongo_user.get("name", "User"),
        login_id=login_id,
        is_first_login=mongo_user.get("first_login", False)
    )


@router.post("/change-password")
async def change_password(
    data: PasswordChangeRequest,
    current_user: models.User = Depends(get_current_user),
    mongo_db = Depends(get_db)
):
    # Get the user document to verify current password - check both collections
    login_id = current_user.login_id
    role = str(current_user.role).lower()
    mongo_user = None
    collection_used = None

    if role == "student":
        mongo_user = await mongo_db["student_accounts"].find_one({
            "$or": [
                {"register_no": login_id},
                {"roll_number": login_id},
                {"email": login_id.lower()}
            ]
        })
        collection_used = "student_accounts"
    else:
        mongo_user = await mongo_db["staff_accounts"].find_one({
            "$or": [{"email": login_id.lower()}, {"login_id": login_id}]
        })
        collection_used = "staff_accounts"

    # Fallback - search both if not found
    if not mongo_user:
        mongo_user = await mongo_db["student_accounts"].find_one({
            "$or": [
                {"register_no": login_id},
                {"roll_number": login_id},
                {"email": login_id.lower()}
            ]
        })
        collection_used = "student_accounts"
    if not mongo_user:
        mongo_user = await mongo_db["staff_accounts"].find_one({
            "$or": [{"email": login_id.lower()}, {"login_id": login_id}]
        })
        collection_used = "staff_accounts"

    if not mongo_user:
        raise HTTPException(status_code=404, detail="User account not found")

    stored_hash = mongo_user.get("password_hash", "")
    if not verify_password(data.current_password, stored_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    if len(data.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    new_hash = get_password_hash(data.new_password)
    now_iso = datetime.now(timezone.utc).isoformat()

    # Update in the correct collection
    update_result = await mongo_db[collection_used].update_one(
        {"_id": mongo_user["_id"]},
        {"$set": {"password_hash": new_hash, "first_login": False, "updated_at": now_iso}}
    )

    if update_result.matched_count == 0:
        # Try the other collection as fallback
        other_coll = "staff_accounts" if collection_used == "student_accounts" else "student_accounts"
        await mongo_db[other_coll].update_one(
            {"_id": mongo_user["_id"]},
            {"$set": {"password_hash": new_hash, "first_login": False, "updated_at": now_iso}}
        )

    # Audit log
    await mongo_db["audit_logs"].insert_one({
        "action": "PASSWORD_CHANGED",
        "entity_type": "user",
        "entity_id": str(mongo_user["_id"]),
        "user_id": str(current_user.id),
        "user_role": str(current_user.role),
        "created_at": now_iso
    })

    return {"message": "Password changed successfully"}


@router.get("/me")
async def get_me(current_user: models.User = Depends(get_current_user), mongo_db = Depends(get_db)):
    profile_data = {}
    user_role_str = str(current_user.role).upper()
    login_id = current_user.login_id
    
    if "STUDENT" in user_role_str:
        # Fetch from MongoDB student_accounts
        mongo_student = await mongo_db["student_accounts"].find_one({
            "$or": [
                {"register_no": login_id},
                {"roll_number": login_id},
                {"email": login_id.lower()}
            ]
        })
        if mongo_student:
            profile_data = {
                "name": mongo_student.get("name", current_user.full_name),
                "full_name": mongo_student.get("name", current_user.full_name),
                "register_number": mongo_student.get("register_no", login_id),
                "register_no": mongo_student.get("register_no", login_id),
                "roll_number": mongo_student.get("roll_number"),
                "year": mongo_student.get("year", ""),
                "department": mongo_student.get("department", ""),
                "department_code": mongo_student.get("department_code", ""),
                "section": mongo_student.get("section", ""),
                "email": mongo_student.get("email", ""),
                "phone": mongo_student.get("phone", ""),
                "student_id": str(mongo_student["_id"])
            }
        else:
            profile_data = {
                "name": current_user.full_name,
                "full_name": current_user.full_name,
                "register_number": login_id,
                "register_no": login_id,
                "email": getattr(current_user, "email", "")
            }
    else:
        # For all staff roles (HOD, ADVISOR, FACULTY, STAFF, DEO)
        mongo_staff = await mongo_db["staff_accounts"].find_one({
            "$or": [{"email": login_id.lower()}, {"login_id": login_id}]
        })
        if mongo_staff:
            profile_data = {
                "name": mongo_staff.get("name", current_user.full_name),
                "full_name": mongo_staff.get("name", current_user.full_name),
                "email": mongo_staff.get("email", ""),
                "phone": mongo_staff.get("phone", ""),
                "department": mongo_staff.get("department", ""),
                "designation": mongo_staff.get("designation", ""),
                "assigned_year": mongo_staff.get("assigned_year", ""),
                "assigned_section": mongo_staff.get("assigned_section", ""),
                "subjects": mongo_staff.get("subjects", []),
                "office": mongo_staff.get("office", ""),
                "staff_id": str(mongo_staff["_id"])
            }
        else:
            profile_data = {
                "name": current_user.full_name,
                "full_name": current_user.full_name,
                "email": getattr(current_user, "email", "")
            }

    return {
        "id": current_user.id,
        "login_id": login_id,
        "full_name": profile_data.get("full_name") or current_user.full_name,
        "email": profile_data.get("email") or getattr(current_user, "email", ""),
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
    mongo_db = Depends(get_db)
):
    if mongo_db is not None:
        await mongo_db["student_accounts"].update_one(
            {"login_id": current_user.login_id},
            {"$set": {"fcm_token": data.fcm_token}}
        )
    return {"message": "FCM token updated"}
