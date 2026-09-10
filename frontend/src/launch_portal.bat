@echo off
title Final Year Project Management System Launcher
echo ========================================================
echo   Launching Final Year Project Management System
echo ========================================================
echo.

echo [1/3] Starting Backend API Server (Port 5000)...
start "FYPMS Backend" cmd /k "cd backend && node server.js"

echo [2/3] Starting Frontend Dev Server (Port 5173)...
start "FYPMS Frontend" cmd /k "cd frontend && npm run dev"

echo [3/3] Launching Web Portal in Default Browser...
timeout /t 3 /nobreak >nul
start http://localhost:5173

echo.
echo ========================================================
echo   System is now online!
echo   Close the background windows when finished.
echo ========================================================
pause