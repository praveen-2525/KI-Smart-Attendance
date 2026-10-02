from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field

class StudentModel(BaseModel):
    register_no: str
    name: str
    date_of_birth: str
    department: str
    year: int
    section: str
    email: str
    phone: str
    role: str = "STUDENT"
    status: str = "ACTIVE"
    hashed_password: str
    is_first_login: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class AttendanceRecordModel(BaseModel):
    student_id: str
    register_no: str
    date: str
    period: int
    subject_id: str
    subject_name: str
    faculty_id: str
    status: str  # PR, AB, OD, LE, -
    source: str  # MANUAL, QR, OD_WORKFLOW, LEAVE_WORKFLOW, CORRECTION
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class ODRequestModel(BaseModel):
    student_id: str
    register_no: str
    event_name: str
    from_date: str
    to_date: str
    request_status: str
    approval_status: str
    proof_status: str
    verification_status: str
    approver_ids: List[str] = []
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

# Ensure to create indexes manually or via motor logic:
# db.students.create_index("register_no", unique=True)
# db.attendance_records.create_index([("register_no", 1), ("date", 1), ("period", 1)])
