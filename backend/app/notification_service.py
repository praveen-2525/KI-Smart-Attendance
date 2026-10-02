"""
Notification service - handles in-app and FCM push notifications.
FCM integration is behind a feature flag; mock is used by default.
"""
from datetime import datetime, timezone
from typing import List, Optional
from sqlalchemy.orm import Session
from app import models
from app.config import settings


class NotificationService:
    """Create and send notifications to users."""

    def __init__(self, db: Session):
        self.db = db

    def create_notification(
        self,
        user_id: int,
        category: models.NotificationCategory,
        title: str,
        message: str,
        priority: models.NotificationPriority = models.NotificationPriority.INFORMATION,
        reference_type: Optional[str] = None,
        reference_id: Optional[int] = None,
        send_fcm: bool = True
    ) -> models.Notification:
        notif = models.Notification(
            user_id=user_id,
            category=category,
            priority=priority,
            title=title,
            message=message,
            reference_type=reference_type,
            reference_id=reference_id,
            is_read=False,
            fcm_sent=False
        )
        self.db.add(notif)
        self.db.flush()

        if send_fcm and settings.FIREBASE_ENABLED:
            self._send_fcm(user_id, title, message, notif.id)
        elif send_fcm:
            # Mock: just mark as sent
            notif.fcm_sent = True

        return notif

    def notify_od_submitted(self, od_request: models.ODRequest):
        student = od_request.student
        student_name = student.user.full_name

        # Find advisor and HOD
        section = student.section
        if section and section.advisor:
            advisor_user = section.advisor.user
            self.create_notification(
                user_id=advisor_user.id,
                category=models.NotificationCategory.OD_REQUEST,
                title="New OD Request",
                message=f"{student_name} ({student.register_number}) submitted an OD request for {od_request.event_name}.",
                priority=models.NotificationPriority.PENDING,
                reference_type="od_request",
                reference_id=od_request.id
            )

        dept = student.department
        if dept and dept.hod:
            self.create_notification(
                user_id=dept.hod.id,
                category=models.NotificationCategory.OD_REQUEST,
                title="New OD Request",
                message=f"{student_name} submitted an OD request for {od_request.event_name}.",
                priority=models.NotificationPriority.PENDING,
                reference_type="od_request",
                reference_id=od_request.id
            )

    def notify_od_approved(self, od_request: models.ODRequest):
        student = od_request.student
        self.create_notification(
            user_id=student.user_id,
            category=models.NotificationCategory.OD_APPROVAL,
            title="OD Request Approved",
            message=f"Your OD request for '{od_request.event_name}' has been approved. Please submit completion proof after the event.",
            priority=models.NotificationPriority.INFORMATION,
            reference_type="od_request",
            reference_id=od_request.id
        )

    def notify_od_rejected(self, od_request: models.ODRequest, reason: str):
        student = od_request.student
        self.create_notification(
            user_id=student.user_id,
            category=models.NotificationCategory.OD_APPROVAL,
            title="OD Request Rejected",
            message=f"Your OD request for '{od_request.event_name}' was rejected. Reason: {reason}",
            priority=models.NotificationPriority.ATTENTION,
            reference_type="od_request",
            reference_id=od_request.id
        )

    def notify_od_proof_submitted(self, od_request: models.ODRequest):
        student = od_request.student
        student_name = student.user.full_name

        section = student.section
        if section and section.advisor:
            self.create_notification(
                user_id=section.advisor.user_id,
                category=models.NotificationCategory.OD_VERIFICATION,
                title="OD Completion Proof Submitted",
                message=f"{student_name} submitted completion proof for '{od_request.event_name}'. Please verify.",
                priority=models.NotificationPriority.PENDING,
                reference_type="od_request",
                reference_id=od_request.id
            )

        dept = student.department
        if dept and dept.hod:
            self.create_notification(
                user_id=dept.hod.id,
                category=models.NotificationCategory.OD_VERIFICATION,
                title="OD Completion Proof Submitted",
                message=f"{student_name} submitted completion proof for '{od_request.event_name}'.",
                priority=models.NotificationPriority.PENDING,
                reference_type="od_request",
                reference_id=od_request.id
            )

    def notify_leave_submitted(self, leave_request: models.LeaveRequest):
        student = leave_request.student
        student_name = student.user.full_name

        section = student.section
        if section and section.advisor:
            self.create_notification(
                user_id=section.advisor.user_id,
                category=models.NotificationCategory.LEAVE_REQUEST,
                title="New Leave Request",
                message=f"{student_name} submitted a leave request from {leave_request.from_date} to {leave_request.to_date}.",
                priority=models.NotificationPriority.PENDING,
                reference_type="leave_request",
                reference_id=leave_request.id
            )

        dept = student.department
        if dept and dept.hod:
            self.create_notification(
                user_id=dept.hod.id,
                category=models.NotificationCategory.LEAVE_REQUEST,
                title="New Leave Request",
                message=f"{student_name} submitted a leave request.",
                priority=models.NotificationPriority.PENDING,
                reference_type="leave_request",
                reference_id=leave_request.id
            )

    def notify_leave_approved(self, leave_request: models.LeaveRequest):
        student = leave_request.student
        self.create_notification(
            user_id=student.user_id,
            category=models.NotificationCategory.LEAVE_APPROVAL,
            title="Leave Approved",
            message=f"Your leave from {leave_request.from_date} to {leave_request.to_date} has been approved.",
            priority=models.NotificationPriority.INFORMATION,
            reference_type="leave_request",
            reference_id=leave_request.id
        )

    def notify_correction_submitted(self, correction: models.AttendanceCorrection):
        student = correction.student
        record = correction.attendance_record
        subj = record.subject

        # Find faculty who marked attendance
        faculty = record.marked_by_faculty
        if faculty:
            self.create_notification(
                user_id=faculty.user_id,
                category=models.NotificationCategory.ATTENDANCE_CORRECTION,
                title="Attendance Correction Request",
                message=f"{student.user.full_name} reported wrong attendance for {subj.name} on {record.date}. Marked: {correction.current_status}, Claims: {correction.claimed_status}.",
                priority=models.NotificationPriority.ATTENTION,
                reference_type="correction",
                reference_id=correction.id
            )

    def notify_late_arrival(self, late_request: models.LateArrivalRequest, faculty_user_id: int):
        student = late_request.student
        self.create_notification(
            user_id=faculty_user_id,
            category=models.NotificationCategory.LATE_ARRIVAL,
            title="Late Arrival Notification",
            message=f"{student.user.full_name} ({student.register_number}) will arrive late at {late_request.expected_arrival_time}. Reason: {late_request.reason}.",
            priority=models.NotificationPriority.INFORMATION,
            reference_type="late_arrival",
            reference_id=late_request.id
        )

    def notify_attendance_exception(self, exception: models.AttendanceException):
        student = exception.student
        student_name = student.user.full_name

        section = student.section
        if section and section.advisor:
            self.create_notification(
                user_id=section.advisor.user_id,
                category=models.NotificationCategory.ATTENDANCE_EXCEPTION,
                title="Attendance Exception",
                message=f"Attendance exception detected for {student_name} on {exception.date}, Period {exception.period_number}. Status changed to {exception.current_status}.",
                priority=models.NotificationPriority.CRITICAL,
                reference_type="exception",
                reference_id=exception.id
            )

        dept = student.department
        if dept and dept.hod:
            self.create_notification(
                user_id=dept.hod.id,
                category=models.NotificationCategory.ATTENDANCE_EXCEPTION,
                title="Attendance Exception",
                message=f"Attendance exception: {student_name} - {exception.date}, Period {exception.period_number}.",
                priority=models.NotificationPriority.CRITICAL,
                reference_type="exception",
                reference_id=exception.id
            )

    def notify_attendance_shortage(self, student: models.Student, subject_name: str, percentage: float):
        self.create_notification(
            user_id=student.user_id,
            category=models.NotificationCategory.ATTENDANCE_SHORTAGE,
            title="Attendance Shortage Alert",
            message=f"{subject_name} attendance is {percentage:.1f}%. You may need additional credited classes to reach the target.",
            priority=models.NotificationPriority.ATTENTION,
            reference_type="student",
            reference_id=student.id
        )

    def _send_fcm(self, user_id: int, title: str, message: str, notification_id: int):
        """Send FCM push notification. Configure FIREBASE_CREDENTIALS_PATH to enable."""
        try:
            import firebase_admin
            from firebase_admin import credentials, messaging
            if not firebase_admin._apps:
                cred = credentials.Certificate(settings.FIREBASE_CREDENTIALS_PATH)
                firebase_admin.initialize_app(cred)

            user = self.db.query(models.User).filter(models.User.id == user_id).first()
            if user and user.fcm_token:
                msg = messaging.Message(
                    notification=messaging.Notification(title=title, body=message),
                    data={"notification_id": str(notification_id)},
                    token=user.fcm_token
                )
                messaging.send(msg)
        except Exception as e:
            print(f"FCM send failed: {e}")  # In production, use proper logging
