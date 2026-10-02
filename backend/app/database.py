from motor.motor_asyncio import AsyncIOMotorClient
from app.config import settings
from sqlalchemy.orm import declarative_base

Base = declarative_base()

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
    """Seed predefined institutional accounts (HOD, Advisor, Faculty, Staff, DEO) if not existing."""
    from app.auth import get_password_hash
    from datetime import datetime, timezone

    predefined_users = [
        {
            "fullName": "AIML HOD",
            "name": "AIML HOD",
            "email": "hod.aiml@kitech.edu.in",
            "login_id": "hod.aiml@kitech.edu.in",
            "role": "HOD",
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
            "role": "ADVISOR",
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
            "role": "FACULTY",
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
            "role": "STAFF",
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
            "role": "DEO",
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
        existing = await db["staff_accounts"].find_one({"email": u_data["email"]})
        if not existing:
            pw_hash = get_password_hash(plain_pw)
            doc = {
                **u_data,
                "password_hash": pw_hash,
                "passwordHash": pw_hash,
                "first_login": False,
                "created_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc)
            }
            await db["staff_accounts"].insert_one(doc)
            print(f"[INFO] Auto-seeded institutional account: {u_data['email']} ({u_data['role']})")
        else:
            # Verify password hash exists and is valid
            pw_hash = existing.get("password_hash") or existing.get("passwordHash")
            if not pw_hash:
                new_pw_hash = get_password_hash(plain_pw)
                await db["staff_accounts"].update_one(
                    {"_id": existing["_id"]},
                    {"$set": {"password_hash": new_pw_hash, "passwordHash": new_pw_hash, "role": u_data["role"], "status": "ACTIVE", "accountStatus": "ACTIVE"}}
                )

async def close_mongo_connection():
    global client
    if client:
        client.close()
        print("[INFO] Closed MongoDB connection")

def get_db():
    """Dependency to get MongoDB database (Async)."""
    return client[settings.MONGODB_DB_NAME]



