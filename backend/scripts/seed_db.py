"""
KI Smart Attendance+ - Database Seed Script
Creates demo data for CSE(AI&ML) department with realistic attendance.
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from datetime import date, time, datetime, timedelta
from sqlalchemy.orm import Session
from app.database import SessionLocal, engine
from app import models
from app.database import Base
from app.auth import get_password_hash
import random


def seed_database():
    # Create tables
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    try:
        print("🌱 Seeding KI Smart Attendance+ database...")

        # Check if already seeded
        if db.query(models.Department).first():
            print("✅ Database already seeded. Use --force to re-seed.")
            return

        # ============================================================
        # SETTINGS
        # ============================================================
        default_settings = [
            ("attendance.target_percentage", "75.0", "float", "Target attendance percentage", "attendance"),
            ("attendance.credit_pr", "true", "boolean", "Credit PR (Present) hours", "attendance"),
            ("attendance.credit_od", "true", "boolean", "Credit OD (On Duty) hours", "attendance"),
            ("attendance.credit_ml", "false", "boolean", "Credit ML (Medical Leave) - Check ERP", "attendance"),
            ("attendance.credit_ll", "false", "boolean", "Credit LL (Loss of Leave) - Check ERP", "attendance"),
            ("attendance.credit_le", "false", "boolean", "Credit LE (Leave) hours", "attendance"),
            ("attendance.exclude_le_from_total", "false", "boolean", "Exclude LE from total eligible hours", "attendance"),
            ("leave.cutoff_time", "09:00", "string", "Leave request cutoff time", "leave"),
            ("leave.next_opening_time", "09:00", "string", "Next day leave window opening time", "leave"),
            ("qr.expiry_seconds", "300", "integer", "QR code expiry in seconds", "qr"),
            ("academic.year", "2024-25", "string", "Current academic year", "academic"),
            ("academic.semester", "5", "integer", "Current semester", "academic"),
        ]
        for key, value, dtype, desc, category in default_settings:
            db.add(models.Setting(key=key, value=value, data_type=dtype, description=desc, category=category))
        db.flush()
        print("  ✓ Settings created")

        # ============================================================
        # DEPARTMENT
        # ============================================================
        dept = models.Department(name="Computer Science and Engineering (AI&ML)", code="CSE-AIML")
        db.add(dept)
        db.flush()
        print("  ✓ Department created: CSE(AI&ML)")

        # ============================================================
        # HOD USER
        # ============================================================
        hod_user = models.User(
            login_id="hod001",
            hashed_password=get_password_hash("HOD@12345"),
            role=models.UserRole.HOD,
            full_name="Dr. Rajesh Kumar",
            email="hod@college.edu",
            is_active=True
        )
        db.add(hod_user)
        db.flush()

        hod_faculty = models.Faculty(
            user_id=hod_user.id,
            employee_id="FAC001",
            department_id=dept.id,
            designation="Professor & HOD"
        )
        db.add(hod_faculty)
        db.flush()

        dept.hod_id = hod_user.id
        print("  ✓ HOD created: Dr. Rajesh Kumar (hod001 / HOD@12345)")

        # ============================================================
        # DEO USER
        # ============================================================
        deo_user = models.User(
            login_id="deo001",
            hashed_password=get_password_hash("DEO@12345"),
            role=models.UserRole.DEO,
            full_name="Mrs. Priya Anand",
            email="deo@college.edu",
            is_active=True
        )
        db.add(deo_user)
        db.flush()

        deo_faculty = models.Faculty(
            user_id=deo_user.id,
            employee_id="DEO001",
            department_id=dept.id,
            designation="Data Entry Operator"
        )
        db.add(deo_faculty)
        db.flush()
        print("  ✓ DEO created: Mrs. Priya Anand (deo001 / DEO@12345)")

        # ============================================================
        # CLASSES
        # ============================================================
        class_2 = models.Class(name="II CSE(AI&ML)", department_id=dept.id, year=2, academic_year="2024-25")
        class_3 = models.Class(name="III CSE(AI&ML)", department_id=dept.id, year=3, academic_year="2024-25")
        db.add_all([class_2, class_3])
        db.flush()
        print("  ✓ Classes created: II CSE(AI&ML), III CSE(AI&ML)")

        # ============================================================
        # FACULTY + ADVISOR
        # ============================================================
        faculty_data = [
            ("FAC002", "Dr. Meena Krishnan", "fac002", "FAC@12345", "Associate Professor", False),
            ("FAC003", "Mr. Suresh Babu", "fac003", "FAC@12345", "Assistant Professor", False),
            ("FAC004", "Dr. Lakshmi Priya", "fac004", "FAC@12345", "Associate Professor", False),
            ("FAC005", "Mr. Arjun Nair", "fac005", "FAC@12345", "Assistant Professor", False),
        ]

        faculty_objs = []
        for emp_id, name, login, pwd, desig, is_adv in faculty_data:
            u = models.User(
                login_id=login,
                hashed_password=get_password_hash(pwd),
                role=models.UserRole.FACULTY,
                full_name=name,
                email=f"{login}@college.edu",
                is_active=True
            )
            db.add(u)
            db.flush()
            f = models.Faculty(
                user_id=u.id,
                employee_id=emp_id,
                department_id=dept.id,
                designation=desig,
                is_advisor=is_adv
            )
            db.add(f)
            db.flush()
            faculty_objs.append(f)

        # Advisor
        adv_user = models.User(
            login_id="adv001",
            hashed_password=get_password_hash("ADV@12345"),
            role=models.UserRole.ADVISOR,
            full_name="Dr. Kavitha Sundaram",
            email="adv001@college.edu",
            is_active=True
        )
        db.add(adv_user)
        db.flush()
        adv_faculty = models.Faculty(
            user_id=adv_user.id,
            employee_id="FAC006",
            department_id=dept.id,
            designation="Associate Professor & Advisor",
            is_advisor=True
        )
        db.add(adv_faculty)
        db.flush()
        print("  ✓ Faculty created (fac002-fac005, adv001)")

        # ============================================================
        # SECTIONS
        # ============================================================
        section_a = models.Section(name="A", class_id=class_2.id, advisor_faculty_id=adv_faculty.id)
        section_b = models.Section(name="B", class_id=class_2.id)
        section_3a = models.Section(name="A", class_id=class_3.id)
        db.add_all([section_a, section_b, section_3a])
        db.flush()

        adv_faculty.advisor_section_id = section_a.id
        db.flush()
        print("  ✓ Sections created: II-A, II-B, III-A")

        # ============================================================
        # SUBJECTS (Semester 5 - II CSE AI&ML)
        # ============================================================
        subjects_data = [
            ("Design and Analysis of Algorithms", "DAA", 2, 5),
            ("Machine Learning", "ML", 2, 5),
            ("Database Management Systems", "DBMS", 2, 5),
            ("Object Oriented Analysis and Design", "OOAD", 2, 5),
            ("Big Data Analytics", "BDA", 2, 5),
        ]

        subject_objs = []
        for name, code, year, sem in subjects_data:
            s = models.Subject(
                name=name,
                code=code,
                department_id=dept.id,
                year=year,
                semester=sem,
                credits=4
            )
            db.add(s)
            db.flush()
            subject_objs.append(s)
        print("  ✓ Subjects created: DAA, ML, DBMS, OOAD, BDA")

        # ============================================================
        # TIMETABLE (Monday-Friday, Section A)
        # ============================================================
        # Period timings
        periods = [
            (1, time(9, 0), time(9, 50)),
            (2, time(9, 50), time(10, 40)),
            (3, time(10, 55), time(11, 45)),
            (4, time(11, 45), time(12, 35)),
            (5, time(13, 20), time(14, 10)),
            (6, time(14, 10), time(15, 0)),
        ]

        # Timetable layout [day][period] = (subject_idx, faculty_idx)
        tt_layout = {
            0: [(0, 0), (1, 1), (2, 2), (3, 3), (4, 4), (0, 0)],   # Mon
            1: [(1, 1), (0, 0), (3, 3), (2, 2), (0, 0), (4, 4)],   # Tue
            2: [(2, 2), (3, 3), (1, 1), (4, 4), (2, 2), (1, 1)],   # Wed
            3: [(4, 4), (2, 2), (0, 0), (1, 1), (3, 3), (2, 2)],   # Thu
            4: [(3, 3), (4, 4), (2, 2), (0, 0), (1, 1), (3, 3)],   # Fri
        }

        all_faculty = faculty_objs + [adv_faculty]
        for day, day_periods in tt_layout.items():
            for p_num, (subj_idx, fac_idx) in enumerate(day_periods, 1):
                _, start, end = periods[p_num - 1]
                tt = models.TimetableEntry(
                    section_id=section_a.id,
                    subject_id=subject_objs[subj_idx].id,
                    faculty_id=all_faculty[fac_idx].id,
                    day_of_week=day,
                    period_number=p_num,
                    start_time=start,
                    end_time=end,
                    academic_year="2024-25",
                    semester=5,
                    room="CS-101"
                )
                db.add(tt)
        db.flush()
        print("  ✓ Timetable created (5 days × 6 periods)")

        # ============================================================
        # STUDENTS
        # ============================================================
        students_data = [
            ("21CS001", "Arjun Sharma", "stu001", "STU@12345"),
            ("21CS002", "Priya Venkatesh", "stu002", "STU@12345"),
            ("21CS003", "Karthik Rajan", "stu003", "STU@12345"),
            ("21CS004", "Ananya Krishnan", "stu004", "STU@12345"),
            ("21CS005", "Rohit Mehta", "stu005", "STU@12345"),
        ]

        student_objs = []
        for reg, name, login, pwd in students_data:
            u = models.User(
                login_id=login,
                hashed_password=get_password_hash(pwd),
                role=models.UserRole.STUDENT,
                full_name=name,
                email=f"{login}@student.edu",
                is_active=True
            )
            db.add(u)
            db.flush()
            s = models.Student(
                user_id=u.id,
                register_number=reg,
                department_id=dept.id,
                class_id=class_2.id,
                section_id=section_a.id,
                year=2,
                semester=5,
                academic_year="2024-25"
            )
            db.add(s)
            db.flush()
            student_objs.append(s)
        print("  ✓ Students created: stu001-stu005 (STU@12345)")

        # ============================================================
        # ATTENDANCE RECORDS (realistic, past 60 days)
        # ============================================================
        print("  ⏳ Generating attendance records...")

        # Attendance percentages for demo student (stu001 = Arjun Sharma)
        # DAA: 68%, ML: 82%, DBMS: 91%, OOAD: 76%, BDA: 80%
        target_pcts = {
            subject_objs[0].id: 0.68,  # DAA
            subject_objs[1].id: 0.82,  # ML
            subject_objs[2].id: 0.91,  # DBMS
            subject_objs[3].id: 0.76,  # OOAD
            subject_objs[4].id: 0.80,  # BDA
        }

        demo_student = student_objs[0]  # Arjun Sharma

        today = date.today()
        start_date = today - timedelta(days=60)

        for day_offset in range(60):
            current = start_date + timedelta(days=day_offset)
            if current.weekday() >= 5:  # Skip weekends
                continue

            day_of_week = current.weekday()
            if day_of_week not in tt_layout:
                continue

            for student in student_objs:
                for p_num, (subj_idx, fac_idx) in enumerate(tt_layout[day_of_week], 1):
                    subj = subject_objs[subj_idx]
                    fac = all_faculty[fac_idx]

                    # Determine status
                    if student.id == demo_student.id:
                        # Use target percentages for demo student
                        pct = target_pcts.get(subj.id, 0.75)
                        rand = random.random()
                        if rand < pct:
                            status = models.AttendanceStatus.PR
                        elif rand < pct + 0.03:
                            status = models.AttendanceStatus.OD
                        elif rand < pct + 0.08:
                            status = models.AttendanceStatus.LE
                        else:
                            status = models.AttendanceStatus.AB
                    else:
                        # Random for others
                        rand = random.random()
                        if rand < 0.80:
                            status = models.AttendanceStatus.PR
                        elif rand < 0.85:
                            status = models.AttendanceStatus.OD
                        elif rand < 0.90:
                            status = models.AttendanceStatus.LE
                        else:
                            status = models.AttendanceStatus.AB

                    rec = models.AttendanceRecord(
                        student_id=student.id,
                        subject_id=subj.id,
                        marked_by_faculty_id=fac.id,
                        date=current,
                        period_number=p_num,
                        status=status,
                        is_finalized=True
                    )
                    db.add(rec)

        db.flush()
        print("  ✓ Attendance records created (60 days)")

        # ============================================================
        # DEMO OD REQUEST (submitted, pending)
        # ============================================================
        od = models.ODRequest(
            student_id=demo_student.id,
            event_name="Smart India Hackathon 2024",
            event_type="National Level Hackathon",
            participation_type=models.ODParticipationType.HACKATHON,
            from_date=today + timedelta(days=5),
            to_date=today + timedelta(days=6),
            event_date=today + timedelta(days=5),
            venue="IIT Madras",
            city="Chennai",
            institution_name="Indian Institute of Technology Madras",
            is_own_college=False,
            description="National level hackathon organized by AICTE",
            status=models.ODStatus.SUBMITTED
        )
        db.add(od)
        db.flush()

        od_doc = models.ODDocument(
            od_request_id=od.id,
            document_type="registration_proof",
            file_path="uploads/demo/sih_registration.pdf",
            file_name="sih_registration.pdf",
            uploaded_by=demo_student.user_id
        )
        db.add(od_doc)

        # ============================================================
        # DEMO LEAVE REQUEST
        # ============================================================
        leave = models.LeaveRequest(
            student_id=demo_student.id,
            from_date=today - timedelta(days=2),
            to_date=today - timedelta(days=2),
            reason="Medical",
            description="Fever - unable to attend college",
            status=models.LeaveStatus.APPROVED,
            advisor_id=adv_user.id,
            advisor_action="approved",
            advisor_actioned_at=datetime.now()
        )
        db.add(leave)

        # ============================================================
        # DEMO CORRECTION REQUEST
        # ============================================================
        # Find an AB record for demo student
        ab_record = db.query(models.AttendanceRecord).filter(
            models.AttendanceRecord.student_id == demo_student.id,
            models.AttendanceRecord.status == models.AttendanceStatus.AB
        ).first()

        if ab_record:
            correction = models.AttendanceCorrection(
                student_id=demo_student.id,
                attendance_record_id=ab_record.id,
                current_status=models.AttendanceStatus.AB,
                claimed_status=models.AttendanceStatus.PR,
                explanation="I was present in class. Faculty might have accidentally marked me absent.",
                status=models.CorrectionStatus.PENDING
            )
            db.add(correction)

        # ============================================================
        # DEMO NOTIFICATIONS
        # ============================================================
        notifs = [
            (demo_student.user_id, models.NotificationCategory.ATTENDANCE_SHORTAGE,
             "DAA Attendance Alert", "Your DAA attendance is 68%. You need additional classes to reach 75%.",
             models.NotificationPriority.ATTENTION),
            (demo_student.user_id, models.NotificationCategory.OD_REQUEST,
             "OD Request Submitted", "Your OD request for Smart India Hackathon 2024 has been submitted.",
             models.NotificationPriority.INFORMATION),
            (adv_user.id, models.NotificationCategory.OD_REQUEST,
             "New OD Request", "Arjun Sharma submitted an OD request for Smart India Hackathon 2024.",
             models.NotificationPriority.PENDING),
            (hod_user.id, models.NotificationCategory.OD_REQUEST,
             "New OD Request", "Arjun Sharma (21CS001) submitted an OD request.",
             models.NotificationPriority.PENDING),
        ]

        for uid, cat, title, msg, priority in notifs:
            db.add(models.Notification(
                user_id=uid,
                category=cat,
                priority=priority,
                title=title,
                message=msg,
                is_read=False
            ))

        # ============================================================
        # AUDIT LOGS
        # ============================================================
        db.add(models.AuditLog(
            user_id=demo_student.user_id,
            user_role=models.UserRole.STUDENT,
            action="OD_SUBMITTED",
            entity_type="od_request",
            entity_id=od.id,
            new_value={"event": "Smart India Hackathon 2024"}
        ))

        db.commit()

        print("\n✅ Database seeded successfully!")
        print("\n🔑 Demo Login Credentials:")
        print("  Student:  stu001 / STU@12345  (Arjun Sharma - DAA:68%, ML:82%)")
        print("  Faculty:  fac002 / FAC@12345  (Dr. Meena Krishnan)")
        print("  Advisor:  adv001 / ADV@12345  (Dr. Kavitha Sundaram)")
        print("  HOD:      hod001 / HOD@12345  (Dr. Rajesh Kumar)")
        print("  DEO:      deo001 / DEO@12345  (Mrs. Priya Anand)")
        print("\n🚀 Start the server: uvicorn app.main:app --reload")
        print("📚 API Docs: http://localhost:8000/docs")

    except Exception as e:
        db.rollback()
        print(f"❌ Error seeding database: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    import sys
    force = "--force" in sys.argv
    if force:
        print("⚠️  Force re-seed requested. Dropping and recreating tables...")
        Base.metadata.drop_all(bind=engine)
    seed_database()
