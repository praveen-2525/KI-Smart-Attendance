"""
Audit logging service - records every important action.
"""
from typing import Optional, Any, Dict
from sqlalchemy.orm import Session
from app import models


class AuditService:
    def __init__(self, db: Session):
        self.db = db

    def log(
        self,
        action: str,
        entity_type: str,
        entity_id: Optional[int] = None,
        user_id: Optional[int] = None,
        user_role: Optional[models.UserRole] = None,
        previous_value: Optional[Dict] = None,
        new_value: Optional[Dict] = None,
        reason: Optional[str] = None,
        related_request_id: Optional[int] = None,
        related_request_type: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None
    ) -> models.AuditLog:
        log = models.AuditLog(
            user_id=user_id,
            user_role=user_role,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            previous_value=previous_value,
            new_value=new_value,
            reason=reason,
            related_request_id=related_request_id,
            related_request_type=related_request_type,
            ip_address=ip_address,
            user_agent=user_agent
        )
        self.db.add(log)
        self.db.flush()
        return log

    def log_attendance_change(
        self,
        attendance_record: models.AttendanceRecord,
        previous_status: models.AttendanceStatus,
        new_status: models.AttendanceStatus,
        changed_by_user_id: int,
        changed_by_role: models.UserRole,
        reason: str,
        related_request_id: Optional[int] = None,
        related_request_type: Optional[str] = None
    ):
        self.log(
            action=f"ATTENDANCE_CHANGED: {previous_status} → {new_status}",
            entity_type="attendance_record",
            entity_id=attendance_record.id,
            user_id=changed_by_user_id,
            user_role=changed_by_role,
            previous_value={
                "status": previous_status,
                "date": str(attendance_record.date),
                "period": attendance_record.period_number,
                "subject_id": attendance_record.subject_id,
                "student_id": attendance_record.student_id
            },
            new_value={"status": new_status},
            reason=reason,
            related_request_id=related_request_id,
            related_request_type=related_request_type
        )

    def log_od_action(
        self,
        od_request: models.ODRequest,
        action: str,
        user_id: int,
        user_role: models.UserRole,
        notes: Optional[str] = None
    ):
        self.log(
            action=f"OD_{action.upper()}",
            entity_type="od_request",
            entity_id=od_request.id,
            user_id=user_id,
            user_role=user_role,
            new_value={"status": od_request.status, "action": action},
            reason=notes,
            related_request_id=od_request.id,
            related_request_type="od_request"
        )

    def log_leave_action(
        self,
        leave_request: models.LeaveRequest,
        action: str,
        user_id: int,
        user_role: models.UserRole,
        notes: Optional[str] = None
    ):
        self.log(
            action=f"LEAVE_{action.upper()}",
            entity_type="leave_request",
            entity_id=leave_request.id,
            user_id=user_id,
            user_role=user_role,
            new_value={"status": leave_request.status, "action": action},
            reason=notes,
            related_request_id=leave_request.id,
            related_request_type="leave_request"
        )
