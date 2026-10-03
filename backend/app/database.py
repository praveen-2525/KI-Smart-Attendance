from motor.motor_asyncio import AsyncIOMotorClient
from app.config import settings

client: AsyncIOMotorClient = None

async def connect_to_mongo():
    global client
    client = AsyncIOMotorClient(settings.MONGODB_URI)
    print("[INFO] Connected to MongoDB Atlas")
    try:
        db = client[settings.MONGODB_DB_NAME]
        await db["leave_requests"].create_index("studentId")
        await db["leave_requests"].create_index("registerNumber")
        await db["leave_requests"].create_index("requestId", unique=True)
        await db["leave_requests"].create_index("status")
        await db["leave_requests"].create_index("submittedAt")

        await db["od_requests"].create_index("studentId")
        await db["od_requests"].create_index("registerNumber")
        await db["od_requests"].create_index("requestId", unique=True)
        await db["od_requests"].create_index("status")
        await db["od_requests"].create_index("submittedAt")

        await db["staff_accounts"].create_index("email", unique=True)
        await db["staff_accounts"].create_index("login_id")
        print("[INFO] Created MongoDB indexes for leave_requests, od_requests, and staff_accounts")

        await seed_institutional_accounts(db)
    except Exception as e:
        print(f"[WARN] Index creation / seeding warning: {e}")


async def seed_institutional_accounts(db):
    """Seed predefined institutional accounts (HOD, Advisor, Faculty, Staff, DEO) if not existing or repair hashes."""
    from app.auth import get_password_hash, verify_password
    from datetime import datetime, timezone

    predefined_users = [
        {
            "fullName": "AIML HOD",
            "name": "AIML HOD",
            "email": "hod.aiml@kitech.edu.in",
            "login_id": "hod.aiml@kitech.edu.in",
            "role": "hod",
            "department": "AIML",
            "mobileNumber": "",
            "phone": "",
            "dateOfBirth": None,
            "accountStatus": "ACTIVE",
            "status": "ACTIVE",
            "plain_password": "hod@aiml"
        },
        {
            "fullName": "AIML Advisor",
            "name": "AIML Advisor",
            "email": "advisor.aiml@kitech.edu.in",
            "login_id": "advisor.aiml@kitech.edu.in",
            "role": "advisor",
            "department": "AIML",
            "mobileNumber": "",
            "phone": "",
            "dateOfBirth": None,
            "accountStatus": "ACTIVE",
            "status": "ACTIVE",
            "plain_password": "advisor@aiml"
        },
        {
            "fullName": "AIML Faculty",
            "name": "AIML Faculty",
            "email": "faculty.aiml@kitech.edu.in",
            "login_id": "faculty.aiml@kitech.edu.in",
            "role": "faculty",
            "department": "AIML",
            "mobileNumber": "",
            "phone": "",
            "dateOfBirth": None,
            "accountStatus": "ACTIVE",
            "status": "ACTIVE",
            "plain_password": "faculty@aiml"
        },
        {
            "fullName": "AIML Staff",
            "name": "AIML Staff",
            "email": "staff.aiml@kitech.edu.in",
            "login_id": "staff.aiml@kitech.edu.in",
            "role": "staff",
            "department": "AIML",
            "mobileNumber": "",
            "phone": "",
            "dateOfBirth": None,
            "accountStatus": "ACTIVE",
            "status": "ACTIVE",
            "plain_password": "staff@aiml"
        },
        {
            "fullName": "AIML DEO",
            "name": "AIML DEO",
            "email": "deo.aiml@kitech.edu.in",
            "login_id": "deo.aiml@kitech.edu.in",
            "role": "deo",
            "department": "AIML",
            "mobileNumber": "",
            "phone": "",
            "dateOfBirth": None,
            "accountStatus": "ACTIVE",
            "status": "ACTIVE",
            "plain_password": "deo@aiml"
        }
    ]

    for u_data in predefined_users:
        plain_pw = u_data.pop("plain_password")
        email = u_data["email"].strip().lower()
        existing = await db["staff_accounts"].find_one({"email": email})

        pw_hash = get_password_hash(plain_pw)

        if not existing:
            doc = {
                **u_data,
                "email": email,
                "login_id": email,
                "password_hash": pw_hash,
                "passwordHash": pw_hash,
                "first_login": False,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
            await db["staff_accounts"].insert_one(doc)
            print(f"[INFO] Auto-seeded institutional account: {email} ({u_data['role']})")
        else:
            # Check if existing hash verifies plain_pw
            stored_hash = existing.get("password_hash") or existing.get("passwordHash") or ""
            needs_update = False
            if not stored_hash or not verify_password(plain_pw, stored_hash):
                needs_update = True

            if existing.get("role") != u_data["role"] or existing.get("status") != "ACTIVE":
                needs_update = True

            if needs_update:
                await db["staff_accounts"].update_one(
                    {"_id": existing["_id"]},
                    {"$set": {
                        "password_hash": pw_hash,
                        "passwordHash": pw_hash,
                        "role": u_data["role"].lower(),
                        "status": "ACTIVE",
                        "accountStatus": "ACTIVE",
                        "updated_at": datetime.now(timezone.utc).isoformat()
                    }}
                )
                print(f"[INFO] Repaired seed account: {email} ({u_data['role']})")

    # Seed demo student account
    student_email = "student.aiml@kitech.edu.in"
    existing_student = await db["student_accounts"].find_one({
        "$or": [
            {"email": student_email},
            {"register_no": "7376241AI101"},
            {"roll_number": "24AIM001"}
        ]
    })
    student_pw_hash = get_password_hash("student@aiml")
    if not existing_student:
        student_doc = {
            "name": "AIML Student",
            "fullName": "AIML Student",
            "email": student_email,
            "collegeEmail": student_email,
            "register_no": "7376241AI101",
            "registerNumber": "7376241AI101",
            "roll_number": "24AIM001",
            "rollNumber": "24AIM001",
            "department": "CSE(AI&ML)",
            "department_code": "AIML",
            "year": "III",
            "section": "AIML",
            "phone": "9876543210",
            "password_hash": student_pw_hash,
            "passwordHash": student_pw_hash,
            "role": "student",
            "status": "ACTIVE",
            "accountStatus": "ACTIVE",
            "first_login": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        await db["student_accounts"].insert_one(student_doc)
        print(f"[INFO] Auto-seeded demo student account: {student_email}")
    else:
        stored_s_hash = existing_student.get("password_hash") or existing_student.get("passwordHash") or ""
        if not stored_s_hash or not verify_password("student@aiml", stored_s_hash) or existing_student.get("status") != "ACTIVE":
            await db["student_accounts"].update_one(
                {"_id": existing_student["_id"]},
                {"$set": {
                    "password_hash": student_pw_hash,
                    "passwordHash": student_pw_hash,
                    "role": "student",
                    "status": "ACTIVE",
                    "accountStatus": "ACTIVE",
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }}
            )
            print(f"[INFO] Repaired demo student account: {student_email}")

async def close_mongo_connection():
    global client
    if client:
        client.close()
        print("[INFO] Closed MongoDB connection")

def get_db():
    """Dependency to get MongoDB database (Async)."""
    return client[settings.MONGODB_DB_NAME]



