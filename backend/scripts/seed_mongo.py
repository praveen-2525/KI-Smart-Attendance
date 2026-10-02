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
    
    demo_accounts = [
        {"login_id": "student001", "role": "STUDENT", "name": "Demo Student", "status": "ACTIVE", "pwd": "STU@12345"},
        {"login_id": "fac002", "role": "FACULTY", "name": "Demo Faculty", "status": "ACTIVE", "pwd": "FAC@12345"},
        {"login_id": "adv001", "role": "ADVISOR", "name": "Demo Advisor", "status": "ACTIVE", "pwd": "ADV@12345"},
        {"login_id": "hod001", "role": "HOD", "name": "Demo HOD", "status": "ACTIVE", "pwd": "HOD@12345"},
        {"login_id": "deo001", "role": "DEO", "name": "Demo DEO", "status": "ACTIVE", "pwd": "DEO@12345"},
    ]
    
    # 1. Seed demo users
    for acc in demo_accounts:
        existing = users_collection.find_one({"login_id": acc["login_id"]})
        if not existing:
            print(f"Creating {acc['role']} demo account: {acc['login_id']}")
            user_doc = {
                "login_id": acc["login_id"],
                "role": acc["role"],
                "name": acc["name"],
                "status": acc["status"],
                "hashed_password": get_password_hash(acc["pwd"])
            }
            users_collection.insert_one(user_doc)
        else:
            print(f"Account {acc['login_id']} already exists.")
            
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

    # 3. Seed student_master for registration testing
    master_collection = db["student_master"]
    test_student = {
        "register_no": "24AIM040",
        "name": "Sample Student",
        "date_of_birth": "2007-05-25",
        "department": "CSE(AI&ML)",
        "department_code": "AIML",
        "year": "III",
        "section": "AIML",
        "status": "NOT REGISTERED"
    }
    
    if not master_collection.find_one({"register_no": test_student["register_no"]}):
        print(f"Creating test authorized student_master record: {test_student['register_no']}")
        master_collection.insert_one(test_student)
    else:
        print("Test student_master record already exists.")
            
    print("MongoDB connected successfully")
    print(f"Database: {db_name}")
    print("Seeding complete.")

if __name__ == "__main__":
    seed_database()
