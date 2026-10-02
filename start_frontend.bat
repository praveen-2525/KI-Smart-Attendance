@echo off
echo ============================================================
echo   KI Smart Attendance+ - Frontend Startup
echo ============================================================
echo.
cd /d "%~dp0frontend"

:: Check if node_modules exists
if not exist "node_modules" (
    echo Installing npm packages...
    npm install
)

echo.
echo Starting React frontend on http://localhost:5173
echo.
npm run dev

pause
