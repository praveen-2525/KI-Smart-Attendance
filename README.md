# KI Smart Attendance+

## 🚀 Setup Instructions (MongoDB Atlas)

This application strictly uses MongoDB as the primary database.

### 1. How to create MongoDB Atlas cluster
1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) and create a free account.
2. Click **Build a Database** and select the free **M0 Sandbox** tier.
3. Choose a cloud provider and region, then click **Create**.
4. In the Security Quickstart, create a database user with a username and password. **Save these credentials.**
5. Under Network Access, add `0.0.0.0/0` (or your specific IP) to allow connections.

### 2. How to obtain MongoDB connection string
1. Go to your Database Deployments page.
2. Click **Connect** on your cluster.
3. Choose **Connect your application**.
4. Select **Python** and copy the connection string.
5. Replace `<password>` with the password of the database user you created.

### 3. How to configure .env
Create a `.env` file in the `backend/` directory using the provided `.env.example`.
Update the MongoDB variables:
```env
MONGODB_URI="mongodb+srv://<username>:<password>@cluster0.mongodb.net/?retryWrites=true&w=majority"
MONGODB_DB_NAME="KI_Smart_Attendance"
JWT_SECRET="ki-smart-attendance-dev-secret-key-2024"
```
*(Never hard-code credentials in source code. Always use `.env`)*

### 4. How to start backend
1. Open a terminal in the `backend/` folder.
2. Create and activate a Python virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```
3. Install dependencies (now using `motor` and `pymongo`):
   ```bash
   pip install -r requirements.txt
   ```
4. Seed the database with demo accounts:
   ```bash
   python scripts/seed_mongo.py
   ```
5. Start the FastAPI server:
   ```bash
   uvicorn app.main:app --reload
   ```

### 5. How to start frontend
1. Open a terminal in the `frontend/` folder.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the Vite development server:
   ```bash
   npm run dev
   ```

### 6. How to import students using CSV/Excel
1. Log in as a DEO using the demo account:
   - **Login ID:** `deo001`
   - **Password:** `DEO@12345`
2. Navigate to the **Import Students** quick action on the dashboard.
3. Upload a CSV file matching the schema:
   ```csv
   register_no,name,date_of_birth,department,year,section,email,phone
   23AIML001,Student Name,2007-08-15,CSE(AI&ML),3,A,student@example.com,9876543210
   ```
4. Review the validated preview and click **Confirm Import** to save directly to MongoDB.

### 7. How to test student login
1. Go to the login page (`http://localhost:5173/login`).
2. **First-time login:**
   - **Login ID:** Enter the student's Register Number (e.g., `23AIML001`).
   - **Password:** Enter the Date of Birth as formatted in the CSV (e.g., `2007-08-15` or `15-08-2007`).
3. Upon successful verification against MongoDB, you will be forced to create a new password.
4. Next login: Use the Register Number + New Password.

---
*Note: This backend has been migrated from PostgreSQL/SQLAlchemy to MongoDB/Motor. Routers and services must utilize `AsyncIOMotorClient` for all CRUD operations.*
