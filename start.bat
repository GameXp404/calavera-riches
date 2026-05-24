@echo off
REM Calavera Riches - Dev Launcher

cd /d "%~dp0"

echo ============================================
echo   CALAVERA RICHES - 1024 Ways Slot Game
echo ============================================
echo.

if not exist "node_modules\" (
    echo First run. Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo ERROR: npm install failed.
        pause
        exit /b 1
    )
    echo.
)

echo Starting Vite dev server on port 5520...
echo Browser akan terbuka otomatis (handled by Vite).
echo Press Ctrl+C di window ini untuk stop server.
echo.

call npm run dev
