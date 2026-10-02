"""
KI Smart Attendance+ - Main FastAPI Application
"""
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from app.database import connect_to_mongo, close_mongo_connection
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, HTTPException
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from app.config import settings

# Import routers
from app.routers.auth import router as auth_router
from app.routers.attendance import router as attendance_router
from app.routers.od import router as od_router
from app.routers.requests import (
    leave_router, late_router, correction_router,
    notif_router, timetable_router, audit_router
)
from app.routers.management import users_router, admin_router
from app.routers.reports import reports_router, qr_router, erp_router

limiter = Limiter(key_func=get_remote_address)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events."""
    # Connect to MongoDB
    await connect_to_mongo()
    
    # Create upload directory
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    
    print(f"✅ KI Smart Attendance+ started")
    print(f"📊 Database: {settings.MONGODB_DB_NAME}")
    print(f"📁 Uploads: {settings.UPLOAD_DIR}")
    
    yield
    
    await close_mongo_connection()
    print("🛑 KI Smart Attendance+ shutting down")



app = FastAPI(
    title="KI Smart Attendance+",
    description="""
    ## Smart Attendance, Smarter Student Management

    KI Smart Attendance+ is a smart attendance management and student support platform
    for engineering colleges. It works as a separate smart layer that can integrate
    with existing ERP systems through authorized APIs or approved data imports.

    ### Roles
    - **Student**: View attendance, submit OD/Leave/Correction requests, use Smart Planner
    - **Faculty**: Mark attendance, review corrections, view OD/Leave info
    - **Advisor**: Approve OD/Leave, verify proofs, manage assigned class
    - **HOD**: Department-level management, analytics, reports
    - **DEO**: Full administrative management, timetable, reports

    ### Key Features
    - Configurable attendance calculation (ERP-compatible formula)
    - Smart Attendance Planner with What-If simulation
    - Full OD workflow with proof verification
    - Leave management with automatic attendance marking
    - Attendance correction with audit trail
    - QR-based attendance (optional)
    - Offline-ready data sync API
    - Comprehensive audit logging
    """,
    version=settings.APP_VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan
)

# Rate limiting
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static files (uploads)
if os.path.exists(settings.UPLOAD_DIR):
    app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")

# Register routers
app.include_router(auth_router, prefix="/api/v1")
app.include_router(attendance_router, prefix="/api/v1")
app.include_router(od_router, prefix="/api/v1")
app.include_router(leave_router, prefix="/api/v1")
app.include_router(late_router, prefix="/api/v1")
app.include_router(correction_router, prefix="/api/v1")
app.include_router(notif_router, prefix="/api/v1")
app.include_router(timetable_router, prefix="/api/v1")
app.include_router(audit_router, prefix="/api/v1")
app.include_router(users_router, prefix="/api/v1")
app.include_router(admin_router, prefix="/api/v1")
app.include_router(reports_router, prefix="/api/v1")
app.include_router(qr_router, prefix="/api/v1")
app.include_router(erp_router, prefix="/api/v1")


# Error handlers
@app.exception_handler(SQLAlchemyError)
async def sqlalchemy_exception_handler(request: Request, exc: SQLAlchemyError):
    return JSONResponse(
        status_code=500,
        content={"detail": "Database error occurred. Please try again."}
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail}
    )


@app.get("/", tags=["Health"])
async def root():
    return {
        "app": "KI Smart Attendance+",
        "version": settings.APP_VERSION,
        "tagline": "Smart Attendance, Smarter Student Management",
        "status": "running",
        "docs": "/docs"
    }


@app.get("/health", tags=["Health"])
async def health_check():
    try:
        from app.database import SessionLocal
        db = SessionLocal()
        db.execute("SELECT 1")
        db.close()
        db_status = "healthy"
    except Exception:
        db_status = "unhealthy"
    return {"status": "ok", "database": db_status}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=settings.DEBUG)
