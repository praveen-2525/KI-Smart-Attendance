from motor.motor_asyncio import AsyncIOMotorClient
from app.config import settings

client: AsyncIOMotorClient = None

async def connect_to_mongo():
    global client
    client = AsyncIOMotorClient(settings.MONGODB_URI)
    print("✅ Connected to MongoDB Atlas")

async def close_mongo_connection():
    global client
    if client:
        client.close()
        print("🛑 Closed MongoDB connection")

def get_db():
    """Dependency to get MongoDB database (Async)."""
    return client[settings.MONGODB_DB_NAME]


