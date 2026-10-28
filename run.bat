@echo off
setlocal EnableDelayedExpansion
title IoT Health Monitoring System Launcher
cd /d "%~dp0"

echo ======================================================================
echo    AI-Enabled IoT Remote Patient Health Monitoring System (ESP32)
echo ======================================================================
echo.

rem 1. Check Python
where python >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python is not installed or not in PATH.
    echo Please install Python 3.10+ and add it to PATH.
    pause
    exit /b 1
)

rem 2. Check Node / npm
where npm >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js or npm is not installed or not in PATH.
    echo Please install Node.js from https://nodejs.org/ to run the frontend.
    pause
    exit /b 1
)

rem 3. Start Backend
echo [1/3] Starting FastAPI Backend on http://localhost:8001...
if exist "backend\.venv\Scripts\activate.bat" (
    start "Health Monitoring - Backend" cmd /k "cd /d "%~dp0backend" && call .venv\Scripts\activate.bat && python -m uvicorn app.main:app --reload --port 8001"
) else (
    start "Health Monitoring - Backend" cmd /k "cd /d "%~dp0backend" && python -m uvicorn app.main:app --reload --port 8001"
)

rem 4. Start Frontend
echo [2/3] Starting React Frontend on http://localhost:5173...
start "Health Monitoring - Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"

rem 5. Open Browser
echo [3/3] Opening Dashboard in browser...
ping 127.0.0.1 -n 4 >nul
start http://localhost:5173

echo.
echo ======================================================================
echo    System successfully launched!
echo    - Frontend : http://localhost:5173
echo    - Backend  : http://localhost:8001 (API docs: http://localhost:8001/docs)
echo    - Node ID  : esp32-01
echo ======================================================================
echo.
echo Keep this window open or minimize it. To stop, close the spawned command windows.
pause
