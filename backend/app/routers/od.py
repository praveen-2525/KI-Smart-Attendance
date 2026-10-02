"""
OD Request Router - complete OD workflow management
"""
import os
import uuid
from datetime import date, datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.database import get_db
from app import models
from app.auth import get_current_user, require_roles
from app.notification_service import NotificationService
from app.audit_service import AuditService
from app.config import settings
from app.attendance_applier import apply_od_to_attendance

router = APIRouter(prefix="/od", tags=["OD Requests"])


@router.post("/submit")
async def submit_od_request(
    event_name: str = Form(...),
    event_type: str = Form(...),
    participation_type: str = Form(...),
    from_date: str = Form(...),
    to_date: str = Form(...),
    event_date: str = Form(...),
    venue: str = Form(""),
    city: str = Form(""),
    institution_name: str = Form(""),
    is_own_college: bool = Form(False),
    description: str = Form(""),
    proof_file: UploadFile = File(...),
    current_user: models.User = Depends(require_roles(models.UserRole.STUDENT)),
    db: Session = Depends(get_db)
):
    """Submit a new OD request with registration proof."""
    student = current_user.student_profile
    if not student:
        raise HTTPException(status_code=404, detail="Student profile not found")

    # Save proof file
    file_path = await _save_upload(proof_file, f"od/{student.id}")

    od = models.ODRequest(
        student_id=student.id,
        event_name=event_name,
        event_type=event_type,
        participation_type=participation_type,
        from_date=date.fromisoformat(from_date),
        to_date=date.fromisoformat(to_date),
        event_date=date.fromisoformat(event_date),
        venue=venue,
        city=city,
        institution_name=institution_name,
        is_own_college=is_own_college,
        description=description,
        status=models.ODStatus.SUBMITTED
    )
    db.add(od)
    db.flush()

    # Save document
    doc = models.ODDocument(
        od_request_id=od.id,
        document_type="registration_proof",
        file_path=file_path,
        file_name=proof_file.filename,
        file_size=0,
        mime_type=proof_file.content_type,
        uploaded_by=current_user.id
    )
    db.add(doc)

    # Audit
    audit = AuditService(db)
    audit.log_od_action(od, "SUBMITTED", current_user.id, current_user.role)

    # Notify
    notif = NotificationService(db)
    notif.notify_od_submitted(od)

    db.commit()
    return {"message": "OD request submitted", "od_id": od.id, "status": od.status}


@router.get("/my")
async def get_my_od_requests(
    status: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, le=100),
    current_user: models.User = Depends(require_roles(models.UserRole.STUDENT)),
    db: Session = Depends(get_db)
):
    """Get student's OD requests."""
    student = current_user.student_profile
    query = db.query(models.ODRequest).filter(models.ODRequest.student_id == student.id)
    if status:
        query = query.filter(models.ODRequest.status == status)

    total = query.count()
    requests = query.order_by(models.ODRequest.created_at.desc()).offset((page - 1) * limit).limit(limit).all()

    return {
        "total": total,
        "requests": [_format_od(r) for r in requests]
    }


@router.get("/pending")
async def get_pending_od_requests(
    department_id: Optional[int] = None,
    section_id: Optional[int] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, le=100),
    current_user: models.User = Depends(require_roles(
        models.UserRole.ADVISOR, models.UserRole.HOD, models.UserRole.DEO
    )),
    db: Session = Depends(get_db)
):
    """Get pending OD requests for advisor/HOD review."""
    query = db.query(models.ODRequest).filter(
        models.ODRequest.status.in_([models.ODStatus.SUBMITTED, models.ODStatus.UNDER_REVIEW])
    )

    if current_user.role == models.UserRole.ADVISOR:
        faculty = current_user.faculty_profile
        if faculty and faculty.advisor_section_id:
            query = query.join(models.Student).filter(
                models.Student.section_id == faculty.advisor_section_id
            )

    if department_id:
        query = query.join(models.Student).filter(models.Student.department_id == department_id)
    if section_id:
        query = query.join(models.Student).filter(models.Student.section_id == section_id)

    total = query.count()
    requests = query.order_by(models.ODRequest.created_at.desc()).offset((page - 1) * limit).limit(limit).all()

    return {"total": total, "requests": [_format_od(r, include_student=True) for r in requests]}


@router.post("/{od_id}/approve")
async def approve_od_request(
    od_id: int,
    notes: Optional[str] = None,
    current_user: models.User = Depends(require_roles(
        models.UserRole.ADVISOR, models.UserRole.HOD
    )),
    db: Session = Depends(get_db)
):
    """Approve OD request."""
    od = db.query(models.ODRequest).filter(models.ODRequest.id == od_id).first()
    if not od:
        raise HTTPException(status_code=404, detail="OD request not found")

    now = datetime.now(timezone.utc)
    if current_user.role == models.UserRole.ADVISOR:
        od.advisor_id = current_user.id
        od.advisor_action = "approved"
        od.advisor_notes = notes
        od.advisor_actioned_at = now
    elif current_user.role == models.UserRole.HOD:
        od.hod_id = current_user.id
        od.hod_action = "approved"
        od.hod_notes = notes
        od.hod_actioned_at = now

    od.status = models.ODStatus.APPROVED

    audit = AuditService(db)
    audit.log_od_action(od, "APPROVED", current_user.id, current_user.role, notes)

    notif = NotificationService(db)
    notif.notify_od_approved(od)

    db.commit()
    return {"message": "OD request approved", "status": od.status}


@router.post("/{od_id}/reject")
async def reject_od_request(
    od_id: int,
    reason: str,
    current_user: models.User = Depends(require_roles(
        models.UserRole.ADVISOR, models.UserRole.HOD
    )),
    db: Session = Depends(get_db)
):
    """Reject OD request."""
    od = db.query(models.ODRequest).filter(models.ODRequest.id == od_id).first()
    if not od:
        raise HTTPException(status_code=404, detail="OD request not found")

    now = datetime.now(timezone.utc)
    if current_user.role == models.UserRole.ADVISOR:
        od.advisor_action = "rejected"
        od.advisor_notes = reason
        od.advisor_actioned_at = now
    elif current_user.role == models.UserRole.HOD:
        od.hod_action = "rejected"
        od.hod_notes = reason
        od.hod_actioned_at = now

    od.status = models.ODStatus.REJECTED

    audit = AuditService(db)
    audit.log_od_action(od, "REJECTED", current_user.id, current_user.role, reason)

    notif = NotificationService(db)
    notif.notify_od_rejected(od, reason)

    db.commit()
    return {"message": "OD request rejected"}


@router.post("/{od_id}/submit-proof")
async def submit_od_completion_proof(
    od_id: int,
    description: str = Form(""),
    proof_files: List[UploadFile] = File(...),
    current_user: models.User = Depends(require_roles(models.UserRole.STUDENT)),
    db: Session = Depends(get_db)
):
    """Submit OD completion proof after event."""
    student = current_user.student_profile
    od = db.query(models.ODRequest).filter(
        models.ODRequest.id == od_id,
        models.ODRequest.student_id == student.id
    ).first()

    if not od:
        raise HTTPException(status_code=404, detail="OD request not found")
    if od.status not in [models.ODStatus.APPROVED, models.ODStatus.EVENT_COMPLETED]:
        raise HTTPException(status_code=400, detail="OD must be approved before submitting proof")

    now = datetime.now(timezone.utc)
    od.status = models.ODStatus.PROOF_SUBMITTED
    od.proof_submitted_at = now

    for pf in proof_files:
        path = await _save_upload(pf, f"od_proof/{student.id}")
        doc = models.ODDocument(
            od_request_id=od.id,
            document_type="completion_proof",
            file_path=path,
            file_name=pf.filename,
            file_size=0,
            mime_type=pf.content_type,
            uploaded_by=current_user.id,
            description=description
        )
        db.add(doc)

    audit = AuditService(db)
    audit.log_od_action(od, "PROOF_SUBMITTED", current_user.id, current_user.role)

    notif = NotificationService(db)
    notif.notify_od_proof_submitted(od)

    db.commit()
    return {"message": "Completion proof submitted", "status": od.status}


@router.post("/{od_id}/verify-proof")
async def verify_od_proof(
    od_id: int,
    approved: bool,
    notes: Optional[str] = None,
    current_user: models.User = Depends(require_roles(
        models.UserRole.ADVISOR, models.UserRole.HOD
    )),
    db: Session = Depends(get_db)
):
    """Verify OD completion proof and mark attendance."""
    od = db.query(models.ODRequest).filter(models.ODRequest.id == od_id).first()
    if not od:
        raise HTTPException(status_code=404, detail="OD request not found")

    now = datetime.now(timezone.utc)
    od.proof_verified_by = current_user.id
    od.proof_verified_at = now

    if approved:
        od.status = models.ODStatus.PROOF_VERIFIED
        # Apply OD to attendance
        conflicts = await apply_od_to_attendance(db, od, current_user)
        od.status = models.ODStatus.ATTENDANCE_MARKED
        od.attendance_marked_at = now

        audit = AuditService(db)
        audit.log_od_action(od, "PROOF_VERIFIED_AND_ATTENDANCE_APPLIED", current_user.id, current_user.role, notes)

        db.commit()
        return {
            "message": "OD proof verified. Attendance marked as OD.",
            "conflicts": len(conflicts),
            "conflict_details": conflicts
        }
    else:
        od.status = models.ODStatus.PROOF_REJECTED

        audit = AuditService(db)
        audit.log_od_action(od, "PROOF_REJECTED", current_user.id, current_user.role, notes)

        db.commit()
        return {"message": "OD proof rejected."}


@router.get("/{od_id}")
async def get_od_request(
    od_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    od = db.query(models.ODRequest).filter(models.ODRequest.id == od_id).first()
    if not od:
        raise HTTPException(status_code=404, detail="OD request not found")

    # Students can only see their own
    if current_user.role == models.UserRole.STUDENT:
        student = current_user.student_profile
        if od.student_id != student.id:
            raise HTTPException(status_code=403, detail="Access denied")

    return _format_od(od, include_student=True, include_docs=True)


def _format_od(od: models.ODRequest, include_student=False, include_docs=False):
    result = {
        "id": od.id,
        "event_name": od.event_name,
        "event_type": od.event_type,
        "participation_type": od.participation_type,
        "from_date": od.from_date,
        "to_date": od.to_date,
        "event_date": od.event_date,
        "venue": od.venue,
        "city": od.city,
        "institution_name": od.institution_name,
        "is_own_college": od.is_own_college,
        "description": od.description,
        "status": od.status,
        "advisor_action": od.advisor_action,
        "advisor_notes": od.advisor_notes,
        "hod_action": od.hod_action,
        "hod_notes": od.hod_notes,
        "proof_submitted_at": od.proof_submitted_at,
        "proof_verified_at": od.proof_verified_at,
        "created_at": od.created_at
    }
    if include_student and od.student:
        result["student"] = {
            "id": od.student.id,
            "register_number": od.student.register_number,
            "name": od.student.user.full_name
        }
    if include_docs:
        result["documents"] = [
            {
                "id": d.id,
                "type": d.document_type,
                "file_name": d.file_name,
                "uploaded_at": d.uploaded_at
            } for d in od.documents
        ]
    return result


async def _save_upload(file: UploadFile, subfolder: str) -> str:
    """Save uploaded file to storage directory."""
    upload_dir = os.path.join(settings.UPLOAD_DIR, subfolder)
    os.makedirs(upload_dir, exist_ok=True)
    ext = os.path.splitext(file.filename)[-1].lower()
    filename = f"{uuid.uuid4()}{ext}"
    file_path = os.path.join(upload_dir, filename)
    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)
    return file_path
