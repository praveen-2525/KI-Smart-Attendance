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
        print("[INFO] Created MongoDB indexes for leave_requests and od_requests")
    except Exception as e:
        print(f"[WARN] Index creation warning: {e}")

async def close_mongo_connection():
    global client
    if client:
        client.close()
        print("[INFO] Closed MongoDB connection")

def get_db():
    """Dependency to get MongoDB database (Async)."""
    return client[settings.MONGODB_DB_NAME]



