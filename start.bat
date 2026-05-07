@echo off
echo.
echo  =========================================
echo   PhotoPrint Pro — Local Setup
echo  =========================================
echo.

REM Check Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python not found. Download from https://python.org
    pause & exit /b 1
)

cd backend

