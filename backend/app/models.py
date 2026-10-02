"""
KI Smart Attendance+ - Complete Database Models
PostgreSQL schema via SQLAlchemy ORM
"""

from sqlalchemy import (
    Column, Integer, String, Float, Boolean, DateTime, Date, Time,
    ForeignKey, Text, Enum, JSON, UniqueConstraint, Index
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from app.database import Base


# ============================================================
# ENUMS
# ============================================================

class UserRole(str, enum.Enum):
    STUDENT = "student"
    FACULTY = "faculty"
    ADVISOR = "advisor"
    HOD = "hod"
    DEO = "deo"


class AttendanceStatus(str, enum.Enum):
    PR = "PR"       # Present
    AB = "AB"       # Absent
    OD = "OD"       # On Duty
    LE = "LE"       # Leave
    ML = "ML"       # Medical Leave
    LL = "LL"       # Loss of Leave (configurable)
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
# CORE MODELS
# ============================================================

class Department(Base):
    __tablename__ = "departments"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False, unique=True)
    code = Column(String(20), nullable=False, unique=True)
    hod_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    classes = relationship("Class", back_populates="department")
    subjects = relationship("Subject", back_populates="department")
    hod = relationship("User", foreign_keys=[hod_id])


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    login_id = Column(String(50), unique=True, nullable=False, index=True)
    email = Column(String(255), unique=True, nullable=True)
    hashed_password = Column(String(255), nullable=False)
    role = Column(Enum(UserRole), nullable=False)
    full_name = Column(String(200), nullable=False)
    phone = Column(String(20), nullable=True)
    is_active = Column(Boolean, default=True)
    is_email_verified = Column(Boolean, default=False)
    is_first_login = Column(Boolean, default=True)
    last_login = Column(DateTime(timezone=True), nullable=True)
    password_reset_token = Column(String(255), nullable=True)
    password_reset_expires = Column(DateTime(timezone=True), nullable=True)
    fcm_token = Column(String(500), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    student_profile = relationship("Student", back_populates="user", uselist=False)
    faculty_profile = relationship("Faculty", back_populates="user", uselist=False)
    notifications = relationship("Notification", foreign_keys="Notification.user_id", back_populates="user")
    audit_logs = relationship("AuditLog", back_populates="user")


class Student(Base):
    __tablename__ = "students"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    register_number = Column(String(20), unique=True, nullable=False, index=True)
    roll_number = Column(String(20), nullable=True)
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=False)
    class_id = Column(Integer, ForeignKey("classes.id"), nullable=False)
    section_id = Column(Integer, ForeignKey("sections.id"), nullable=False)
    year = Column(Integer, nullable=False)
    semester = Column(Integer, nullable=False)
    academic_year = Column(String(20), nullable=False, default="2024-25")
    date_of_birth = Column(Date, nullable=True)
    address = Column(Text, nullable=True)
    guardian_name = Column(String(200), nullable=True)
    guardian_phone = Column(String(20), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    user = relationship("User", back_populates="student_profile")
    department = relationship("Department")
    class_ = relationship("Class", back_populates="students")
    section = relationship("Section", back_populates="students")
    attendance_records = relationship("AttendanceRecord", back_populates="student")
    od_requests = relationship("ODRequest", back_populates="student")
    leave_requests = relationship("LeaveRequest", back_populates="student")
    late_arrival_requests = relationship("LateArrivalRequest", back_populates="student")
    correction_requests = relationship("AttendanceCorrection", back_populates="student")


class Faculty(Base):
    __tablename__ = "faculty"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    employee_id = Column(String(20), unique=True, nullable=False, index=True)
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=False)
    designation = Column(String(100), nullable=True)
    is_advisor = Column(Boolean, default=False)
    advisor_section_id = Column(Integer, ForeignKey("sections.id"), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    user = relationship("User", back_populates="faculty_profile")
    department = relationship("Department")
    advisor_section = relationship("Section", foreign_keys=[advisor_section_id])
    timetable_entries = relationship("TimetableEntry", back_populates="faculty")
    attendance_records = relationship("AttendanceRecord", back_populates="marked_by_faculty")


class Class(Base):
    __tablename__ = "classes"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=False)
    year = Column(Integer, nullable=False)
    academic_year = Column(String(20), nullable=False, default="2024-25")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    department = relationship("Department", back_populates="classes")
    sections = relationship("Section", back_populates="class_")
    students = relationship("Student", back_populates="class_")


class Section(Base):
    __tablename__ = "sections"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(10), nullable=False)
    class_id = Column(Integer, ForeignKey("classes.id"), nullable=False)
    advisor_faculty_id = Column(Integer, ForeignKey("faculty.id"), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (UniqueConstraint("name", "class_id", name="uq_section_class"),)

    # Relationships
    class_ = relationship("Class", back_populates="sections")
    students = relationship("Student", back_populates="section")
    advisor = relationship("Faculty", foreign_keys=[advisor_faculty_id])
    timetable_entries = relationship("TimetableEntry", back_populates="section")


class Subject(Base):
    __tablename__ = "subjects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    code = Column(String(20), nullable=False)
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=False)
    year = Column(Integer, nullable=False)
    semester = Column(Integer, nullable=False)
    credits = Column(Integer, default=3)
    is_lab = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (UniqueConstraint("code", "department_id", "semester", name="uq_subject"),)

    # Relationships
    department = relationship("Department", back_populates="subjects")
    timetable_entries = relationship("TimetableEntry", back_populates="subject")
    attendance_records = relationship("AttendanceRecord", back_populates="subject")


# ============================================================
# TIMETABLE
# ============================================================

class TimetableEntry(Base):
    __tablename__ = "timetable"

    id = Column(Integer, primary_key=True, index=True)
    section_id = Column(Integer, ForeignKey("sections.id"), nullable=False)
    subject_id = Column(Integer, ForeignKey("subjects.id"), nullable=False)
    faculty_id = Column(Integer, ForeignKey("faculty.id"), nullable=False)
    day_of_week = Column(Integer, nullable=False)  # 0=Mon, 1=Tue, ..., 6=Sun
    period_number = Column(Integer, nullable=False)
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)
    room = Column(String(50), nullable=True)
    academic_year = Column(String(20), nullable=False, default="2024-25")
    semester = Column(Integer, nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("section_id", "day_of_week", "period_number", "academic_year", "semester",
                         name="uq_timetable_slot"),
    )

    # Relationships
    section = relationship("Section", back_populates="timetable_entries")
    subject = relationship("Subject", back_populates="timetable_entries")
    faculty = relationship("Faculty", back_populates="timetable_entries")


class TimetableOverride(Base):
    """Substitute / cancelled / rescheduled classes"""
    __tablename__ = "timetable_overrides"

    id = Column(Integer, primary_key=True, index=True)
    timetable_id = Column(Integer, ForeignKey("timetable.id"), nullable=False)
    override_date = Column(Date, nullable=False)
    override_type = Column(String(20), nullable=False)  # substitute, cancelled, rescheduled
    substitute_faculty_id = Column(Integer, ForeignKey("faculty.id"), nullable=True)
    reason = Column(Text, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    timetable = relationship("TimetableEntry")
    substitute_faculty = relationship("Faculty", foreign_keys=[substitute_faculty_id])
    creator = relationship("User", foreign_keys=[created_by])


# ============================================================
# ATTENDANCE
# ============================================================

class AttendanceRecord(Base):
    __tablename__ = "attendance_records"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False)
    subject_id = Column(Integer, ForeignKey("subjects.id"), nullable=False)
    timetable_id = Column(Integer, ForeignKey("timetable.id"), nullable=True)
    marked_by_faculty_id = Column(Integer, ForeignKey("faculty.id"), nullable=True)
    date = Column(Date, nullable=False)
    period_number = Column(Integer, nullable=False)
    status = Column(Enum(AttendanceStatus), default=AttendanceStatus.NOT_MARKED)
    is_finalized = Column(Boolean, default=False)
    finalized_at = Column(DateTime(timezone=True), nullable=True)
    marked_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    # Reference to the source request (OD/Leave)
    od_request_id = Column(Integer, ForeignKey("od_requests.id"), nullable=True)
    leave_request_id = Column(Integer, ForeignKey("leave_requests.id"), nullable=True)
    notes = Column(Text, nullable=True)

    __table_args__ = (
        UniqueConstraint("student_id", "date", "period_number", "subject_id", name="uq_attendance"),
    )

    # Relationships
    student = relationship("Student", back_populates="attendance_records")
    subject = relationship("Subject", back_populates="attendance_records")
    timetable = relationship("TimetableEntry")
    marked_by_faculty = relationship("Faculty", back_populates="attendance_records")
    od_request = relationship("ODRequest")
    leave_request = relationship("LeaveRequest")
    corrections = relationship("AttendanceCorrection", back_populates="attendance_record")


class AttendanceConflict(Base):
    """When OD/Leave tries to overwrite finalized attendance"""
    __tablename__ = "attendance_conflicts"

    id = Column(Integer, primary_key=True, index=True)
    attendance_record_id = Column(Integer, ForeignKey("attendance_records.id"), nullable=False)
    existing_status = Column(Enum(AttendanceStatus), nullable=False)
    proposed_status = Column(Enum(AttendanceStatus), nullable=False)
    proposed_by = Column(String(50), nullable=False)  # od_request, leave_request
    proposed_id = Column(Integer, nullable=True)  # ID of the OD/Leave request
    resolution = Column(Enum(ConflictResolution), default=ConflictResolution.PENDING)
    resolved_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    resolved_at = Column(DateTime(timezone=True), nullable=True)
    resolution_notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    attendance_record = relationship("AttendanceRecord")
    resolver = relationship("User", foreign_keys=[resolved_by])


# ============================================================
# OD REQUESTS
# ============================================================

class ODRequest(Base):
    __tablename__ = "od_requests"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False)
    event_name = Column(String(300), nullable=False)
    event_type = Column(String(100), nullable=False)
    participation_type = Column(Enum(ODParticipationType), nullable=False)
    from_date = Column(Date, nullable=False)
    to_date = Column(Date, nullable=False)
    event_date = Column(Date, nullable=False)
    venue = Column(String(300), nullable=True)
    city = Column(String(100), nullable=True)
    institution_name = Column(String(300), nullable=True)
    is_own_college = Column(Boolean, default=False)
    description = Column(Text, nullable=True)
    status = Column(Enum(ODStatus), default=ODStatus.SUBMITTED)
    # Approval
    advisor_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    advisor_action = Column(String(20), nullable=True)
    advisor_notes = Column(Text, nullable=True)
    advisor_actioned_at = Column(DateTime(timezone=True), nullable=True)
    hod_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    hod_action = Column(String(20), nullable=True)
    hod_notes = Column(Text, nullable=True)
    hod_actioned_at = Column(DateTime(timezone=True), nullable=True)
    # Proof
    proof_submitted_at = Column(DateTime(timezone=True), nullable=True)
    proof_verified_at = Column(DateTime(timezone=True), nullable=True)
    proof_verified_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    attendance_marked_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    student = relationship("Student", back_populates="od_requests")
    advisor = relationship("User", foreign_keys=[advisor_id])
    hod = relationship("User", foreign_keys=[hod_id])
    proof_verifier = relationship("User", foreign_keys=[proof_verified_by])
    documents = relationship("ODDocument", back_populates="od_request")


class ODDocument(Base):
    __tablename__ = "od_documents"

    id = Column(Integer, primary_key=True, index=True)
    od_request_id = Column(Integer, ForeignKey("od_requests.id"), nullable=False)
    document_type = Column(String(50), nullable=False)  # registration_proof, certificate, event_photo
    file_path = Column(String(500), nullable=False)
    file_name = Column(String(255), nullable=False)
    file_size = Column(Integer, nullable=True)
    mime_type = Column(String(100), nullable=True)
    uploaded_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    uploaded_at = Column(DateTime(timezone=True), server_default=func.now())
    description = Column(Text, nullable=True)

    od_request = relationship("ODRequest", back_populates="documents")
    uploader = relationship("User", foreign_keys=[uploaded_by])


# ============================================================
# LEAVE REQUESTS
# ============================================================

class LeaveRequest(Base):
    __tablename__ = "leave_requests"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False)
    from_date = Column(Date, nullable=False)
    to_date = Column(Date, nullable=False)
    reason = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    document_path = Column(String(500), nullable=True)
    status = Column(Enum(LeaveStatus), default=LeaveStatus.SUBMITTED)
    # Approval
    advisor_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    advisor_action = Column(String(20), nullable=True)
    advisor_notes = Column(Text, nullable=True)
    advisor_actioned_at = Column(DateTime(timezone=True), nullable=True)
    hod_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    hod_action = Column(String(20), nullable=True)
    hod_notes = Column(Text, nullable=True)
    hod_actioned_at = Column(DateTime(timezone=True), nullable=True)
    attendance_marked_at = Column(DateTime(timezone=True), nullable=True)
    submitted_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    student = relationship("Student", back_populates="leave_requests")
    advisor = relationship("User", foreign_keys=[advisor_id])
    hod = relationship("User", foreign_keys=[hod_id])


# ============================================================
# LATE ARRIVAL
# ============================================================

class LateArrivalRequest(Base):
    __tablename__ = "late_arrival_requests"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False)
    date = Column(Date, nullable=False)
    expected_arrival_time = Column(Time, nullable=False)
    reason = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    document_path = Column(String(500), nullable=True)
    status = Column(String(20), default="submitted")  # submitted, acknowledged, closed
    notified_faculty_id = Column(Integer, ForeignKey("faculty.id"), nullable=True)
    notified_advisor = Column(Boolean, default=False)
    notified_hod = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    student = relationship("Student", back_populates="late_arrival_requests")
    notified_faculty = relationship("Faculty", foreign_keys=[notified_faculty_id])


# ============================================================
# ATTENDANCE CORRECTION
# ============================================================

class AttendanceCorrection(Base):
    __tablename__ = "attendance_corrections"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False)
    attendance_record_id = Column(Integer, ForeignKey("attendance_records.id"), nullable=False)
    current_status = Column(Enum(AttendanceStatus), nullable=False)
    claimed_status = Column(Enum(AttendanceStatus), nullable=False)
    explanation = Column(Text, nullable=False)
    evidence_path = Column(String(500), nullable=True)
    qr_scan_time = Column(DateTime(timezone=True), nullable=True)  # If QR was scanned
    status = Column(Enum(CorrectionStatus), default=CorrectionStatus.PENDING)
    reviewed_by_faculty_id = Column(Integer, ForeignKey("faculty.id"), nullable=True)
    faculty_decision = Column(String(20), nullable=True)
    faculty_notes = Column(Text, nullable=True)
    faculty_reviewed_at = Column(DateTime(timezone=True), nullable=True)
    advisor_reviewed = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    student = relationship("Student", back_populates="correction_requests")
    attendance_record = relationship("AttendanceRecord", back_populates="corrections")
    reviewed_by_faculty = relationship("Faculty", foreign_keys=[reviewed_by_faculty_id])


# ============================================================
# ATTENDANCE EXCEPTIONS
# ============================================================

class AttendanceException(Base):
    __tablename__ = "attendance_exceptions"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False)
    attendance_record_id = Column(Integer, ForeignKey("attendance_records.id"), nullable=False)
    date = Column(Date, nullable=False)
    period_number = Column(Integer, nullable=False)
    exception_type = Column(String(100), nullable=False)  # unexpected_absence, etc.
    previous_statuses = Column(JSON, nullable=True)  # e.g., [{"period": 1, "status": "PR"}, ...]
    current_status = Column(Enum(AttendanceStatus), nullable=False)
    notified_advisor = Column(Boolean, default=False)
    notified_hod = Column(Boolean, default=False)
    acknowledged = Column(Boolean, default=False)
    acknowledged_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    acknowledged_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    student = relationship("Student")
    attendance_record = relationship("AttendanceRecord")


# ============================================================
# QR ATTENDANCE
# ============================================================

class QRSession(Base):
    __tablename__ = "qr_sessions"

    id = Column(Integer, primary_key=True, index=True)
    faculty_id = Column(Integer, ForeignKey("faculty.id"), nullable=False)
    timetable_id = Column(Integer, ForeignKey("timetable.id"), nullable=False)
    section_id = Column(Integer, ForeignKey("sections.id"), nullable=False)
    subject_id = Column(Integer, ForeignKey("subjects.id"), nullable=False)
    date = Column(Date, nullable=False)
    period_number = Column(Integer, nullable=False)
    qr_token = Column(String(500), unique=True, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    faculty = relationship("Faculty")
    timetable = relationship("TimetableEntry")
    scans = relationship("QRScan", back_populates="qr_session")


class QRScan(Base):
    __tablename__ = "qr_scans"

    id = Column(Integer, primary_key=True, index=True)
    qr_session_id = Column(Integer, ForeignKey("qr_sessions.id"), nullable=False)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False)
    scanned_at = Column(DateTime(timezone=True), server_default=func.now())
    is_valid = Column(Boolean, default=True)
    confirmed_present = Column(Boolean, default=False)
    confirmed_at = Column(DateTime(timezone=True), nullable=True)
    ip_address = Column(String(50), nullable=True)

    qr_session = relationship("QRSession", back_populates="scans")
    student = relationship("Student")


# ============================================================
# NOTIFICATIONS
# ============================================================

class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    category = Column(Enum(NotificationCategory), nullable=False)
    priority = Column(Enum(NotificationPriority), default=NotificationPriority.INFORMATION)
    title = Column(String(300), nullable=False)
    message = Column(Text, nullable=False)
    reference_type = Column(String(50), nullable=True)  # od_request, leave_request, etc.
    reference_id = Column(Integer, nullable=True)
    is_read = Column(Boolean, default=False)
    read_at = Column(DateTime(timezone=True), nullable=True)
    fcm_sent = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", foreign_keys=[user_id], back_populates="notifications")


# ============================================================
# AUDIT LOGS
# ============================================================

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    user_role = Column(Enum(UserRole), nullable=True)
    action = Column(String(200), nullable=False)
    entity_type = Column(String(100), nullable=False)
    entity_id = Column(Integer, nullable=True)
    previous_value = Column(JSON, nullable=True)
    new_value = Column(JSON, nullable=True)
    reason = Column(Text, nullable=True)
    related_request_id = Column(Integer, nullable=True)
    related_request_type = Column(String(50), nullable=True)
    ip_address = Column(String(50), nullable=True)
    user_agent = Column(String(500), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="audit_logs")


# ============================================================
# DOCUMENTS (Document Vault)
# ============================================================

class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False)
    document_type = Column(String(100), nullable=False)
    file_path = Column(String(500), nullable=False)
    file_name = Column(String(255), nullable=False)
    file_size = Column(Integer, nullable=True)
    mime_type = Column(String(100), nullable=True)
    description = Column(Text, nullable=True)
    uploaded_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    student = relationship("Student")
    uploader = relationship("User", foreign_keys=[uploaded_by])


# ============================================================
# SYNC LOGS
# ============================================================

class SyncLog(Base):
    __tablename__ = "sync_logs"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=True)
    sync_type = Column(String(50), nullable=False)  # full, incremental, push
    status = Column(Enum(SyncStatus), default=SyncStatus.PENDING)
    records_synced = Column(Integer, default=0)
    records_failed = Column(Integer, default=0)
    error_details = Column(JSON, nullable=True)
    started_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)

    student = relationship("Student")


# ============================================================
# SETTINGS
# ============================================================

class Setting(Base):
    __tablename__ = "settings"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(100), unique=True, nullable=False)
    value = Column(Text, nullable=False)
    data_type = Column(String(20), default="string")  # string, integer, float, boolean, json
    description = Column(Text, nullable=True)
    category = Column(String(50), nullable=True)
    updated_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    updater = relationship("User", foreign_keys=[updated_by])


# ============================================================
# ERP INTEGRATION
# ============================================================

class ERPSyncLog(Base):
    __tablename__ = "erp_sync_logs"

    id = Column(Integer, primary_key=True, index=True)
    sync_method = Column(String(50), nullable=False)  # api, csv, excel
    sync_type = Column(String(50), nullable=False)  # attendance, students, subjects
    status = Column(String(20), nullable=False)  # success, partial, failed
    records_imported = Column(Integer, default=0)
    records_updated = Column(Integer, default=0)
    records_failed = Column(Integer, default=0)
    file_name = Column(String(255), nullable=True)
    error_details = Column(JSON, nullable=True)
    initiated_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    started_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)

    initiator = relationship("User", foreign_keys=[initiated_by])


# Indexes for performance
Index("idx_attendance_student_date", AttendanceRecord.student_id, AttendanceRecord.date)
Index("idx_attendance_subject_date", AttendanceRecord.subject_id, AttendanceRecord.date)
Index("idx_notification_user_read", Notification.user_id, Notification.is_read)
Index("idx_audit_log_entity", AuditLog.entity_type, AuditLog.entity_id)
Index("idx_od_request_student", ODRequest.student_id, ODRequest.status)
Index("idx_leave_request_student", LeaveRequest.student_id, LeaveRequest.status)
