@echo off
echo ============================================================
echo   KI Smart Attendance+ - Backend Startup
echo ============================================================
echo.
cd /d "%~dp0backend"

:: Check if venv exists
if not exist "venv\Scripts\activate.bat" (
    echo Creating virtual environment...
    python -m venv venv
)

:: Activate venv
call venv\Scripts\activate

:: Install dependencies
echo Installing/checking dependencies...
pip install -r requirements.txt -q

:: Check if DB exists, if not seed it
if not exist "ki_attendance.db" (
    echo First run detected - seeding demo database...
    python scripts/seed_db.py
)

echo.
echo Starting FastAPI backend on http://localhost:8000
echo API Docs: http://localhost:8000/docs
echo.
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

pause
