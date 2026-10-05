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
    """Two-stage OD request (stage 1: application approval, stage 2: completion proof)."""
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
    # Two-stage workflow fields (mirrored on the od_requests document)
    status: Optional[str] = None            # Pending Approval | Approved – Awaiting Completion Proof | Rejected | Fulfilled / Final Approved
    approvalBy: Optional[str] = None
    approvalDate: Optional[str] = None
    completionStatus: Optional[str] = None  # Completion Proof Pending Verification | Approved | Rejected
    completionProof: Optional[str] = None
    proofType: Optional[str] = None         # CERTIFICATE | GEO_TAGGED_PHOTO
    proofUrl: Optional[str] = None
    geoLocation: Optional[dict] = None
    completionSubmittedAt: Optional[str] = None
    completionVerifiedBy: Optional[str] = None
    completionVerifiedAt: Optional[str] = None
    finalStatus: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class ODCompletionProofModel(BaseModel):
    """Stage-2 submission; always references the original OD request ID."""
    proofId: str
    odRequestId: str
    studentId: str
    studentName: str
    registerNumber: str
    department: str
    year: str
    section: str
    eventName: str
    proofType: str                          # CERTIFICATE | GEO_TAGGED_PHOTO
    proofUrl: str
    geoLocation: Optional[dict] = None
    status: str = "Completion Proof Pending Verification"
    submittedAt: datetime = Field(default_factory=datetime.utcnow)
    verifiedBy: Optional[str] = None
    verifiedAt: Optional[str] = None

# Ensure to create indexes manually or via motor logic:
# db.students.create_index("register_no", unique=True)
# db.attendance_records.create_index([("register_no", 1), ("date", 1), ("period", 1)])
