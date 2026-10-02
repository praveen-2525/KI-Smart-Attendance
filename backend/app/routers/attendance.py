"""
Attendance Router - marking, viewing, history, planner, calendar
"""
from datetime import date, datetime, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import and_, func
from pydantic import BaseModel
from app.database import get_db
from app import models
from app.auth import get_current_user, require_roles
from app.attendance_engine import AttendanceEngine, AttendanceRule
from app.notification_service import NotificationService
from app.audit_service import AuditService

router = APIRouter(prefix="/attendance", tags=["Attendance"])


class AttendanceMarkRequest(BaseModel):
    student_id: int
    subject_id: int
    date: date
    period_number: int
    status: models.AttendanceStatus
    notes: Optional[str] = None


class BulkAttendanceMarkRequest(BaseModel):
    timetable_id: int
    date: date
    period_number: int
    subject_id: int
    section_id: int
    attendance_list: List[dict]  # [{student_id: int, status: str}, ...]


class WhatIfRequest(BaseModel):
    future_present: int = 0
    future_od: int = 0
    future_leave: int = 0
    future_absent: int = 0
    target_percentage: Optional[float] = None


@router.get("/my")
async def get_my_attendance(
    subject_id: Optional[int] = None,
    current_user: models.User = Depends(require_roles(models.UserRole.STUDENT)),
    db: Session = Depends(get_db)
):
    """Get logged-in student's attendance summary."""
    student = current_user.student_profile
    if not student:
        raise HTTPException(status_code=404, detail="Student profile not found")

    engine = AttendanceEngine.from_settings(db)
    summary = engine.compute_overall_summary(db, student.id)

    return {
        "student_id": student.id,
        "register_number": student.register_number,
        "student_name": current_user.full_name,
        "overall": {
            "total_hours": summary.total_hours,
            "pr_hours": summary.pr_hours,
            "od_hours": summary.od_hours,
            "ab_hours": summary.ab_hours,
            "le_hours": summary.le_hours,
            "ml_hours": summary.ml_hours,
            "credited_hours": summary.credited_hours,
            "eligible_hours": summary.eligible_hours,
            "percentage": summary.percentage,
            "is_below_target": summary.is_below_target,
            "target_percentage": summary.target_percentage
        },
        "subjects": [
            {
                "subject_id": s.subject_id,
                "subject_name": s.subject_name,
                "subject_code": s.subject_code,
                "total_hours": s.total_hours,
                "pr_hours": s.pr_hours,
                "od_hours": s.od_hours,
                "ab_hours": s.ab_hours,
                "le_hours": s.le_hours,
                "ml_hours": s.ml_hours,
                "credited_hours": s.credited_hours,
                "eligible_hours": s.eligible_hours,
                "percentage": s.percentage,
                "is_below_target": s.is_below_target
            }
            for s in summary.subjects
        ]
    }


@router.get("/history")
async def get_attendance_history(
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    subject_id: Optional[int] = None,
    status: Optional[str] = None,
    period: Optional[int] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(50, le=200),
    current_user: models.User = Depends(require_roles(models.UserRole.STUDENT)),
    db: Session = Depends(get_db)
):
    """Get attendance history with filters."""
    student = current_user.student_profile
    if not student:
        raise HTTPException(status_code=404, detail="Student profile not found")

    query = db.query(models.AttendanceRecord).filter(
        models.AttendanceRecord.student_id == student.id
    )

    if from_date:
        query = query.filter(models.AttendanceRecord.date >= from_date)
    if to_date:
        query = query.filter(models.AttendanceRecord.date <= to_date)
    if subject_id:
        query = query.filter(models.AttendanceRecord.subject_id == subject_id)
    if status:
        query = query.filter(models.AttendanceRecord.status == status)
    if period:
        query = query.filter(models.AttendanceRecord.period_number == period)

    total = query.count()
    records = query.order_by(
        models.AttendanceRecord.date.desc(),
        models.AttendanceRecord.period_number
    ).offset((page - 1) * limit).limit(limit).all()

    return {
        "total": total,
        "page": page,
        "limit": limit,
        "records": [
            {
                "id": r.id,
                "date": r.date,
                "period_number": r.period_number,
                "subject_id": r.subject_id,
                "subject_name": r.subject.name if r.subject else None,
                "subject_code": r.subject.code if r.subject else None,
                "status": r.status,
                "is_finalized": r.is_finalized,
                "marked_at": r.marked_at,
                "faculty_name": r.marked_by_faculty.user.full_name if r.marked_by_faculty else None
            }
            for r in records
        ]
    }


@router.get("/calendar")
async def get_attendance_calendar(
    year: int,
    month: int,
    current_user: models.User = Depends(require_roles(models.UserRole.STUDENT)),
    db: Session = Depends(get_db)
):
    """Get calendar view of attendance for a given month."""
    student = current_user.student_profile
    if not student:
        raise HTTPException(status_code=404, detail="Student profile not found")

    from_date = date(year, month, 1)
    # Last day of month
    if month == 12:
        to_date = date(year + 1, 1, 1) - timedelta(days=1)
    else:
        to_date = date(year, month + 1, 1) - timedelta(days=1)

    records = db.query(models.AttendanceRecord).filter(
        models.AttendanceRecord.student_id == student.id,
        models.AttendanceRecord.date >= from_date,
        models.AttendanceRecord.date <= to_date
    ).order_by(models.AttendanceRecord.date, models.AttendanceRecord.period_number).all()

    # Group by date
    calendar_data = {}
    for r in records:
        d = str(r.date)
        if d not in calendar_data:
            calendar_data[d] = []
        calendar_data[d].append({
            "period_number": r.period_number,
            "subject_id": r.subject_id,
            "subject_name": r.subject.name if r.subject else None,
            "subject_code": r.subject.code if r.subject else None,
            "status": r.status,
            "faculty_name": r.marked_by_faculty.user.full_name if r.marked_by_faculty else None,
            "start_time": None,  # From timetable if linked
            "end_time": None
        })

    # Add timetable info
    if records:
        timetable_map = {}
        for r in records:
            if r.timetable:
                key = f"{r.date}_{r.period_number}"
                timetable_map[key] = r.timetable

        for d, periods in calendar_data.items():
            for p in periods:
                key = f"{d}_{p['period_number']}"
                if key in timetable_map:
                    p["start_time"] = str(timetable_map[key].start_time)
                    p["end_time"] = str(timetable_map[key].end_time)

    return {
        "year": year,
        "month": month,
        "calendar": calendar_data
    }


@router.get("/planner")
async def get_attendance_planner(
    subject_id: Optional[int] = None,
    target_percentage: Optional[float] = None,
    current_user: models.User = Depends(require_roles(models.UserRole.STUDENT)),
    db: Session = Depends(get_db)
):
    """Smart Attendance Planner."""
    student = current_user.student_profile
    if not student:
        raise HTTPException(status_code=404, detail="Student profile not found")

    engine = AttendanceEngine.from_settings(db)
    summary = engine.compute_overall_summary(db, student.id)

    target = target_percentage or engine.rule.target_percentage

    # Overall planner
    overall_planner = engine.calculate_classes_needed(
        summary.credited_hours,
        summary.eligible_hours,
        target
    )

    # Subject-wise planner
    subject_planners = []
    for s in summary.subjects:
        planner = engine.calculate_classes_needed(s.credited_hours, s.eligible_hours, target)
        subject_planners.append({
            "subject_id": s.subject_id,
            "subject_name": s.subject_name,
            "subject_code": s.subject_code,
            "current_credited": s.credited_hours,
            "current_total": s.eligible_hours,
            "current_percentage": s.percentage,
            "target_percentage": target,
            "classes_needed": planner.classes_needed_to_reach_target,
            "classes_can_miss": planner.classes_can_miss,
            "already_at_target": planner.already_at_target,
            "message": planner.message
        })

    return {
        "overall": {
            "current_credited": overall_planner.current_credited,
            "current_total": overall_planner.current_total,
            "current_percentage": overall_planner.current_percentage,
            "target_percentage": target,
            "classes_needed": overall_planner.classes_needed_to_reach_target,
            "classes_can_miss": overall_planner.classes_can_miss,
            "already_at_target": overall_planner.already_at_target,
            "can_reach_target": overall_planner.can_reach_target,
            "message": overall_planner.message
        },
        "subjects": subject_planners
    }


@router.post("/planner/what-if")
async def what_if_simulation(
    data: WhatIfRequest,
    subject_id: Optional[int] = None,
    current_user: models.User = Depends(require_roles(models.UserRole.STUDENT)),
    db: Session = Depends(get_db)
):
    """What-if attendance simulation."""
    student = current_user.student_profile
    if not student:
        raise HTTPException(status_code=404, detail="Student profile not found")

    engine = AttendanceEngine.from_settings(db)
    summary = engine.compute_overall_summary(db, student.id)

    if subject_id:
        subj_summary = next((s for s in summary.subjects if s.subject_id == subject_id), None)
        if not subj_summary:
            raise HTTPException(status_code=404, detail="Subject not found in your records")
        result = engine.what_if_simulation(
            subj_summary.credited_hours, subj_summary.eligible_hours,
            data.future_present, data.future_od, data.future_leave, data.future_absent,
            data.target_percentage
        )
    else:
        result = engine.what_if_simulation(
            summary.credited_hours, summary.eligible_hours,
            data.future_present, data.future_od, data.future_leave, data.future_absent,
            data.target_percentage
        )

    return {
        "original_credited": result.original_credited,
        "original_total": result.original_total,
        "original_percentage": result.original_percentage,
        "future_present": result.future_present,
        "future_od": result.future_od,
        "future_leave": result.future_leave,
        "future_absent": result.future_absent,
        "new_credited": result.new_credited,
        "new_total": result.new_total,
        "new_percentage": result.new_percentage,
        "percentage_change": result.percentage_change,
        "reaches_target": result.reaches_target,
        "target_percentage": result.target_percentage,
        "message": result.message
    }


# ============================================================
# FACULTY - MARK ATTENDANCE
# ============================================================

@router.post("/mark")
async def mark_attendance(
    data: AttendanceMarkRequest,
    current_user: models.User = Depends(require_roles(
        models.UserRole.FACULTY, models.UserRole.ADVISOR, models.UserRole.HOD
    )),
    db: Session = Depends(get_db)
):
    """Mark single student attendance."""
    faculty = current_user.faculty_profile
    if not faculty:
        raise HTTPException(status_code=403, detail="Faculty profile not found")

    # Check existing record
    existing = db.query(models.AttendanceRecord).filter(
        and_(
            models.AttendanceRecord.student_id == data.student_id,
            models.AttendanceRecord.date == data.date,
            models.AttendanceRecord.period_number == data.period_number,
            models.AttendanceRecord.subject_id == data.subject_id
        )
    ).first()

    audit = AuditService(db)
    notif = NotificationService(db)

    if existing:
        if existing.is_finalized and existing.status != models.AttendanceStatus.NOT_MARKED:
            # Already finalized - check for conflict
            raise HTTPException(
                status_code=409,
                detail=f"Attendance already finalized as {existing.status}. Use correction request to change."
            )
        prev_status = existing.status
        existing.status = data.status
        existing.marked_by_faculty_id = faculty.id
        existing.notes = data.notes

        audit.log_attendance_change(
            existing, prev_status, data.status,
            current_user.id, current_user.role, "Faculty marked attendance"
        )

        # Check for exception (was PR now AB with prior PR)
        _check_attendance_exception(db, data.student_id, data.date, data.period_number, data.status, notif)

    else:
        new_record = models.AttendanceRecord(
            student_id=data.student_id,
            subject_id=data.subject_id,
            marked_by_faculty_id=faculty.id,
            date=data.date,
            period_number=data.period_number,
            status=data.status,
            notes=data.notes
        )
        db.add(new_record)
        db.flush()
        audit.log_attendance_change(
            new_record, models.AttendanceStatus.NOT_MARKED, data.status,
            current_user.id, current_user.role, "Faculty marked attendance"
        )

    db.commit()
    return {"message": "Attendance marked successfully"}


@router.post("/mark-bulk")
async def mark_attendance_bulk(
    data: BulkAttendanceMarkRequest,
    current_user: models.User = Depends(require_roles(
        models.UserRole.FACULTY, models.UserRole.ADVISOR, models.UserRole.HOD
    )),
    db: Session = Depends(get_db)
):
    """Mark attendance for entire section at once."""
    faculty = current_user.faculty_profile
    if not faculty:
        raise HTTPException(status_code=403, detail="Faculty profile not found")

    audit = AuditService(db)
    notif = NotificationService(db)

    results = {"marked": 0, "updated": 0, "failed": 0, "errors": []}

    for item in data.attendance_list:
        student_id = item.get("student_id")
        att_status = item.get("status")

        try:
            existing = db.query(models.AttendanceRecord).filter(
                and_(
                    models.AttendanceRecord.student_id == student_id,
                    models.AttendanceRecord.date == data.date,
                    models.AttendanceRecord.period_number == data.period_number,
                    models.AttendanceRecord.subject_id == data.subject_id
                )
            ).first()

            if existing:
                prev = existing.status
                existing.status = att_status
                existing.marked_by_faculty_id = faculty.id
                audit.log_attendance_change(existing, prev, att_status, current_user.id, current_user.role, "Bulk marking")
                results["updated"] += 1
            else:
                rec = models.AttendanceRecord(
                    student_id=student_id,
                    subject_id=data.subject_id,
                    marked_by_faculty_id=faculty.id,
                    date=data.date,
                    period_number=data.period_number,
                    status=att_status,
                    timetable_id=data.timetable_id
                )
                db.add(rec)
                db.flush()
                audit.log_attendance_change(rec, models.AttendanceStatus.NOT_MARKED, att_status, current_user.id, current_user.role, "Bulk marking")
                results["marked"] += 1

            # Check exceptions
            _check_attendance_exception(db, student_id, data.date, data.period_number, att_status, notif)

        except Exception as e:
            results["failed"] += 1
            results["errors"].append({"student_id": student_id, "error": str(e)})

    db.commit()
    return results


@router.get("/section/{section_id}")
async def get_section_attendance(
    section_id: int,
    date_filter: date = Query(..., alias="date"),
    period: Optional[int] = None,
    current_user: models.User = Depends(require_roles(
        models.UserRole.FACULTY, models.UserRole.ADVISOR, models.UserRole.HOD, models.UserRole.DEO
    )),
    db: Session = Depends(get_db)
):
    """Get section attendance for a given date."""
    section = db.query(models.Section).filter(models.Section.id == section_id).first()
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")

    students = db.query(models.Student).filter(
        models.Student.section_id == section_id,
        models.Student.is_active == True
    ).all()

    result = []
    for student in students:
        query = db.query(models.AttendanceRecord).filter(
            models.AttendanceRecord.student_id == student.id,
            models.AttendanceRecord.date == date_filter
        )
        if period:
            query = query.filter(models.AttendanceRecord.period_number == period)

        records = query.all()

        # Check OD/Leave status
        od = db.query(models.ODRequest).filter(
            models.ODRequest.student_id == student.id,
            models.ODRequest.from_date <= date_filter,
            models.ODRequest.to_date >= date_filter,
            models.ODRequest.status == models.ODStatus.APPROVED
        ).first()

        leave = db.query(models.LeaveRequest).filter(
            models.LeaveRequest.student_id == student.id,
            models.LeaveRequest.from_date <= date_filter,
            models.LeaveRequest.to_date >= date_filter,
            models.LeaveRequest.status == models.LeaveStatus.APPROVED
        ).first()

        result.append({
            "student_id": student.id,
            "register_number": student.register_number,
            "student_name": student.user.full_name,
            "attendance": [
                {
                    "id": r.id,
                    "period_number": r.period_number,
                    "subject_id": r.subject_id,
                    "status": r.status,
                    "is_finalized": r.is_finalized
                } for r in records
            ],
            "has_approved_od": od is not None,
            "has_approved_leave": leave is not None,
            "od_request_id": od.id if od else None,
            "leave_request_id": leave.id if leave else None
        })

    return {"section_id": section_id, "date": date_filter, "students": result}


def _check_attendance_exception(db, student_id, check_date, period_number, new_status, notif_service):
    """Check if attendance pattern triggers an exception alert."""
    if new_status != models.AttendanceStatus.AB:
        return

    # Get prior periods today
    prior = db.query(models.AttendanceRecord).filter(
        models.AttendanceRecord.student_id == student_id,
        models.AttendanceRecord.date == check_date,
        models.AttendanceRecord.period_number < period_number,
        models.AttendanceRecord.status == models.AttendanceStatus.PR
    ).all()

    if len(prior) >= 2:  # Was present for at least 2 prior periods
        # Create exception
        att_record = db.query(models.AttendanceRecord).filter(
            models.AttendanceRecord.student_id == student_id,
            models.AttendanceRecord.date == check_date,
            models.AttendanceRecord.period_number == period_number
        ).first()

        if att_record:
            exception = models.AttendanceException(
                student_id=student_id,
                attendance_record_id=att_record.id,
                date=check_date,
                period_number=period_number,
                exception_type="unexpected_absence",
                previous_statuses=[{"period": p.period_number, "status": p.status} for p in prior],
                current_status=new_status
            )
            db.add(exception)
            db.flush()
            notif_service.notify_attendance_exception(exception)
