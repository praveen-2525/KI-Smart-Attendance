"""
Authentication utilities: JWT, password hashing, token management
"""
from datetime import datetime, timedelta, timezone
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.config import settings
from app.database import get_db
from app import models

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire, "type": "access"})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_refresh_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire, "type": "refresh"})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def verify_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload
    except JWTError:
        return None


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    mongo_db = Depends(get_db)
) -> models.User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    payload = verify_token(credentials.credentials)
    if payload is None:
        raise credentials_exception

    token_type = payload.get("type")
    if token_type != "access":
        raise credentials_exception

    user_id = payload.get("sub")
    login_id = payload.get("login_id")
    role = payload.get("role")
    
    if user_id is None or not login_id:
        raise credentials_exception

    # Query MongoDB student_accounts or users
    mongo_user = await mongo_db["student_accounts"].find_one({
        "$or": [
            {"register_no": login_id},
            {"roll_number": login_id},
            {"email": login_id.lower()}
        ]
    })
    
    if not mongo_user:
        mongo_user = await mongo_db["users"].find_one({"login_id": login_id})
        
    if not mongo_user:
        raise credentials_exception

    import hashlib
    num_id = int(hashlib.md5(str(mongo_user["_id"]).encode()).hexdigest(), 16) % (10 ** 8)
    
    user = models.User(
        id=num_id,
        login_id=login_id,
        role=role or mongo_user.get("role", "STUDENT"),
        full_name=mongo_user.get("name", "User"),
        email=mongo_user.get("email", ""),
        is_active=mongo_user.get("status", "ACTIVE") == "ACTIVE"
    )
        
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is disabled")
    return user


def require_roles(*roles: models.UserRole):
    """Role-based access control decorator factory."""
    async def role_checker(current_user: models.User = Depends(get_current_user)):
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required roles: {[r.value for r in roles]}"
            )
        return current_user
    return role_checker


# Convenience role dependencies
get_student_user = require_roles(models.UserRole.STUDENT)
get_faculty_user = require_roles(models.UserRole.FACULTY, models.UserRole.ADVISOR, models.UserRole.HOD, models.UserRole.DEO)
get_advisor_user = require_roles(models.UserRole.ADVISOR, models.UserRole.HOD, models.UserRole.DEO)
get_hod_user = require_roles(models.UserRole.HOD, models.UserRole.DEO)
get_deo_user = require_roles(models.UserRole.DEO)
get_any_authenticated = get_current_user
