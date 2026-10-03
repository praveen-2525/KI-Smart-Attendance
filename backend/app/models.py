"""
KI Smart Attendance+ - Core Models & Enums
MongoDB-native: No SQLAlchemy ORM needed. Only pure Python dataclasses/enums.
"""
import enum
from pydantic import BaseModel
from typing import Optional


# ============================================================
# ENUMS
# ============================================================

class UserRole(str, enum.Enum):
    STUDENT = "student"
    FACULTY = "faculty"
    ADVISOR = "advisor"
    HOD = "hod"
    DEO = "deo"
    STAFF = "staff"


class AttendanceStatus(str, enum.Enum):
    PR = "PR"       # Present
    AB = "AB"       # Absent
    OD = "OD"       # On Duty
    LE = "LE"       # Leave
    ML = "ML"       # Medical Leave
    LL = "LL"       # Loss of Leave
    CANCELLED = "CANCELLED"
    NOT_MARKED = "-"


class ODStatus(str, enum.Enum):
    SUBMITTED = "submitted"
    UNDER_REVIEW = "under_review"
    APPROVED = "approved"
    REJECTED = "rejected"
    EVENT_COMPLETED = "event_completed"
    PROOF_SUBMITTED = "proof_submitted"
    PROOF_VERIFIED = "proof_verified"
    PROOF_REJECTED = "proof_rejected"
    ATTENDANCE_MARKED = "attendance_marked"


class LeaveStatus(str, enum.Enum):
    SUBMITTED = "submitted"
    UNDER_REVIEW = "under_review"
    APPROVED = "approved"
    REJECTED = "rejected"
    ATTENDANCE_MARKED = "attendance_marked"


class CorrectionStatus(str, enum.Enum):
    PENDING = "pending"
    FACULTY_REVIEW = "faculty_review"
    APPROVED = "approved"
    REJECTED = "rejected"
    ESCALATED = "escalated"


class NotificationCategory(str, enum.Enum):
    ATTENDANCE_SHORTAGE = "attendance_shortage"
    OD_REQUEST = "od_request"
    OD_APPROVAL = "od_approval"
    OD_PROOF_PENDING = "od_proof_pending"
    OD_VERIFICATION = "od_verification"
    LEAVE_REQUEST = "leave_request"
    LEAVE_APPROVAL = "leave_approval"
    LATE_ARRIVAL = "late_arrival"
    ATTENDANCE_EXCEPTION = "attendance_exception"
    ATTENDANCE_CORRECTION = "attendance_correction"
    TIMETABLE_CHANGE = "timetable_change"
    ANNOUNCEMENT = "announcement"
    SYNC_COMPLETE = "sync_complete"


class NotificationPriority(str, enum.Enum):
    CRITICAL = "critical"
    ATTENTION = "attention"
    PENDING = "pending"
    INFORMATION = "information"


class ODParticipationType(str, enum.Enum):
    PARTICIPANT = "participant"
    PRESENTER = "presenter"
    VOLUNTEER = "volunteer"
    COMPETITION = "competition"
    WORKSHOP = "workshop"
    SYMPOSIUM = "symposium"
    HACKATHON = "hackathon"
    SPORTS = "sports"
    OTHER = "other"


class ConflictResolution(str, enum.Enum):
    PENDING = "pending"
    KEEP_EXISTING = "keep_existing"
    APPLY_NEW = "apply_new"
    ESCALATED = "escalated"


class SyncStatus(str, enum.Enum):
    PENDING = "pending"
    SYNCING = "syncing"
    SYNCED = "synced"
    FAILED = "failed"
    CONFLICT = "conflict"


# ============================================================
# USER MODEL (Pydantic - for use in FastAPI dependencies)
# ============================================================

class User(BaseModel):
    """In-memory user object built from MongoDB document, used in Depends()."""
    id: int
    login_id: str
    role: str
    full_name: str
    email: Optional[str] = ""
    phone: Optional[str] = ""
    is_active: bool = True
    is_first_login: bool = False
    hashed_password: Optional[str] = None

    class Config:
        from_attributes = True


class AttendanceRecord(BaseModel):
    id: Optional[str] = None
    student_id: Optional[str] = None
    register_no: Optional[str] = None
    date: Optional[str] = None
    period: Optional[int] = 1
    subject_id: Optional[str] = None
    subject_name: Optional[str] = None
    faculty_id: Optional[str] = None
    status: str = "PR"
    source: Optional[str] = "MANUAL"

    class Config:
        from_attributes = True

