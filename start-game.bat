@echo off
REM Calavera Riches - Local Game Launcher (production preview)
REM Builds the production bundle then serves locally and opens browser.

cd /d "%~dp0"

echo ============================================
echo   CALAVERA RICHES - GAME (Local)
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

echo Building production bundle...
call npm run build
if errorlevel 1 (
    echo ERROR: build failed.
    pause
    exit /b 1
)
echo.

echo Starting preview server...
echo Browser akan terbuka otomatis dalam 3 detik.
echo Press Ctrl+C di window ini untuk stop server.
echo.

REM Open browser after 3 seconds to game URL
start "" cmd /c "timeout /t 3 /nobreak >nul & start http://localhost:4173/"

call npm run preview -- --port 4173 --strictPort
