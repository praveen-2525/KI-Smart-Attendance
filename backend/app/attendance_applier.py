"""
Attendance Applier - applies OD/Leave to timetable periods, handles conflicts.
"""
from datetime import date, timedelta
from typing import List, Dict
from sqlalchemy.orm import Session
from sqlalchemy import and_
from app import models


async def apply_od_to_attendance(
    db: Session,
    od_request: models.ODRequest,
    approved_by_user: models.User
) -> List[Dict]:
    """
    Apply OD status to all eligible timetable periods between from_date and to_date.
    Returns list of conflicts detected.
    """
    conflicts = []
    student = od_request.student

    current = od_request.from_date
    while current <= od_request.to_date:
        # Find timetable entries for this day and student's section
        day_of_week = current.weekday()  # 0=Mon
        timetable_entries = db.query(models.TimetableEntry).filter(
            models.TimetableEntry.section_id == student.section_id,
            models.TimetableEntry.day_of_week == day_of_week,
            models.TimetableEntry.is_active == True
        ).all()

        for entry in timetable_entries:
            # Check existing attendance
            existing = db.query(models.AttendanceRecord).filter(
                and_(
                    models.AttendanceRecord.student_id == student.id,
                    models.AttendanceRecord.date == current,
                    models.AttendanceRecord.period_number == entry.period_number,
                    models.AttendanceRecord.subject_id == entry.subject_id
                )
            ).first()

            if existing:
                if existing.is_finalized and existing.status not in [
                    models.AttendanceStatus.NOT_MARKED, models.AttendanceStatus.AB
                ]:
                    # CONFLICT - finalized with a different real status
                    conflict = models.AttendanceConflict(
                        attendance_record_id=existing.id,
                        existing_status=existing.status,
                        proposed_status=models.AttendanceStatus.OD,
                        proposed_by="od_request",
                        proposed_id=od_request.id,
                        resolution=models.ConflictResolution.PENDING
                    )
                    db.add(conflict)
                    db.flush()
                    conflicts.append({
                        "date": str(current),
                        "period": entry.period_number,
                        "subject": entry.subject.name if entry.subject else None,
                        "existing_status": existing.status,
                        "conflict_id": conflict.id
                    })
                else:
                    # Apply OD
                    existing.status = models.AttendanceStatus.OD
                    existing.od_request_id = od_request.id
                    existing.is_finalized = True
            else:
                # Create new record with OD
                new_rec = models.AttendanceRecord(
                    student_id=student.id,
                    subject_id=entry.subject_id,
                    timetable_id=entry.id,
                    date=current,
                    period_number=entry.period_number,
                    status=models.AttendanceStatus.OD,
                    od_request_id=od_request.id,
                    is_finalized=True
                )
                db.add(new_rec)

        current += timedelta(days=1)

    db.flush()
    return conflicts


async def apply_leave_to_attendance(
    db: Session,
    leave_request: models.LeaveRequest,
    approved_by_user: models.User
) -> List[Dict]:
    """
    Apply Leave status to all eligible timetable periods.
    Returns list of conflicts.
    """
    conflicts = []
    student = leave_request.student

    current = leave_request.from_date
    while current <= leave_request.to_date:
        day_of_week = current.weekday()
        timetable_entries = db.query(models.TimetableEntry).filter(
            models.TimetableEntry.section_id == student.section_id,
            models.TimetableEntry.day_of_week == day_of_week,
            models.TimetableEntry.is_active == True
        ).all()

        for entry in timetable_entries:
            existing = db.query(models.AttendanceRecord).filter(
                and_(
                    models.AttendanceRecord.student_id == student.id,
                    models.AttendanceRecord.date == current,
                    models.AttendanceRecord.period_number == entry.period_number,
                    models.AttendanceRecord.subject_id == entry.subject_id
                )
            ).first()

            if existing:
                if existing.is_finalized and existing.status not in [
                    models.AttendanceStatus.NOT_MARKED, models.AttendanceStatus.AB
                ]:
                    conflict = models.AttendanceConflict(
                        attendance_record_id=existing.id,
                        existing_status=existing.status,
                        proposed_status=models.AttendanceStatus.LE,
                        proposed_by="leave_request",
                        proposed_id=leave_request.id,
                        resolution=models.ConflictResolution.PENDING
                    )
                    db.add(conflict)
                    db.flush()
                    conflicts.append({
                        "date": str(current),
                        "period": entry.period_number,
                        "subject": entry.subject.name if entry.subject else None,
                        "existing_status": existing.status,
                        "conflict_id": conflict.id
                    })
                else:
                    existing.status = models.AttendanceStatus.LE
                    existing.leave_request_id = leave_request.id
                    existing.is_finalized = True
            else:
                new_rec = models.AttendanceRecord(
                    student_id=student.id,
                    subject_id=entry.subject_id,
                    timetable_id=entry.id,
                    date=current,
                    period_number=entry.period_number,
                    status=models.AttendanceStatus.LE,
                    leave_request_id=leave_request.id,
                    is_finalized=True
                )
                db.add(new_rec)

        current += timedelta(days=1)

    db.flush()
    return conflicts
