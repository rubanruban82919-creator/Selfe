@echo off
title RetinaGuard AI - Production WSGI Server (Waitress)
color 0B

echo ============================================================
echo   RetinaGuard AI - Production WSGI Web Server
echo ============================================================
echo.

cd /d "%~dp0"

if not exist "venv\Scripts\python.exe" (
    echo [ERROR] Virtual environment not found at .\venv.
    echo Please run setup first.
    pause
    exit /b 1
)

echo [*] Starting Production Server via Waitress on http://127.0.0.1:5000...
echo [*] Press Ctrl+C to stop the server.
echo.

.\venv\Scripts\python.exe -m waitress --listen=127.0.0.1:5000 --threads=4 wsgi:app

pause
