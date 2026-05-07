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

REM Install dependencies
echo [1/3] Installing Python dependencies...
pip install -r requirements.txt

if %errorlevel% neq 0 (
    echo [ERROR] pip install failed. Check your internet connection.
    pause & exit /b 1
)

echo.
echo [2/3] Starting rembg server on http://localhost:5000 ...
echo       (First run downloads the AI model ~170MB — one time only)
echo.
echo [3/3] Open frontend\index.html in your browser
echo.
echo  Press Ctrl+C to stop the server.
echo.

python server.py
pause