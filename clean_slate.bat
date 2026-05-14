@echo off
chcp 65001 > nul
setlocal enabledelayedexpansion

cls
echo ==================================================
echo 🏫 School Management System — Factory Reset Utility
echo ==================================================
echo.
echo WARNING: This will STOP all running containers and COMPLETELY WIPE the database.
echo.
set /p proceed="Proceed with factory reset? (y/N): "
if /i not "!proceed!"=="y" (
    echo.
    echo Operation cancelled by user.
    pause
    exit /b 0
)

echo.
echo 🐳 Checking Docker status...
docker info > nul 2>&1
if errorlevel 1 (
    echo ❌ ERROR: Docker daemon is not running or accessible.
    echo Please start Docker Desktop and try again.
    echo.
    pause
    exit /b 1
)
echo    ✅ Docker is running.

echo.
echo ⏹  [1/3] Stopping running containers...
docker compose down --volumes --remove-orphans
timeout /t 3 /nobreak > nul

echo.
echo 🗑  [2/3] Forcefully purging database volumes using helper container...
docker run --rm -v "%CD%:/workspace" alpine rm -rf /workspace/school_data
echo    → Volumes successfully cleared.

echo.
echo 🚀 [3/3] Starting fresh containers...
docker compose up -d

echo.
echo ==================================================
echo ✅ SUCCESS: Factory reset complete!
echo The database is initializing cleanly from init.sql.
echo Frontend will be available at: http://localhost:3000
echo ==================================================
echo.
pause
