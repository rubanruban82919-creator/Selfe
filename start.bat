@echo off
title RetinaGuard AI – Clinical Server
echo ========================================================
echo   RetinaGuard AI - Diabetic Retinopathy Monitoring
echo   Starting local server...
echo ========================================================
echo.

if exist "%~dp0venv\Scripts\python.exe" (
    "%~dp0venv\Scripts\python.exe" "%~dp0app.py"
) else (
    python "%~dp0app.py"
)

pause
