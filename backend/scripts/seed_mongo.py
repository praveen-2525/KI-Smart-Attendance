import os
from pymongo import MongoClient
import bcrypt

def get_password_hash(password: str) -> str:
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
    return hashed.decode('utf-8')

def seed_database():
    uri = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
    db_name = os.getenv("MONGODB_DB_NAME", "KI_Smart_Attendance")
    
    print("Connecting to MongoDB Atlas...")
    client = MongoClient(uri)
    db = client[db_name]
    
    users_collection = db["users"]
    
    # 1. No demo users are seeded as per security requirements.
            
    # 2. Seed configuration collections
    print("Seeding configurations...")
    db["departments"].update_one(
        {"department_code": "AIML"},
        {"$set": {"department_name": "CSE(AI&ML)", "status": "ACTIVE"}},
        upsert=True
    )
    
    db["years"].update_one(
        {"department_code": "AIML", "year": "III"},
        {"$set": {"status": "ACTIVE"}},
        upsert=True
    )
    
    db["sections"].update_one(
        {"department_code": "AIML", "year": "III", "section_name": "AIML"},
        {"$set": {"status": "ACTIVE"}},
        upsert=True
    )

    # 3. No student accounts seeded by default.
    print("MongoDB connected successfully")
    print(f"Database: {db_name}")
    print("Seeding complete.")

if __name__ == "__main__":
    seed_database()
