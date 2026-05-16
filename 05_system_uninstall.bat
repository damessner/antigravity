@echo off
TITLE Antigravity System Teardown
SETLOCAL EnableDelayedExpansion

:: Check for administrative privileges
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] Please run this script as Administrator.
    pause
    exit /b 1
)

echo ============================================================
echo  ^| ANTIGRAVITY SYSTEM TEARDOWN ^|
echo ============================================================
echo.
echo  [DANGER] This will stop and REMOVE all Antigravity containers.
echo.
set /p CONFIRM="Are you sure you want to proceed? (y/N): "
if /i not "!CONFIRM!"=="y" (
    echo Teardown cancelled.
    pause
    exit /b 0
)

echo.
echo [1/2] Stopping containers and removing volumes...
docker-compose down -v --remove-orphans

echo.
set /p IMAGES="[2/2] Do you also want to delete the Docker images to free space? (y/N): "
if /i "!IMAGES!"=="y" (
    echo Removing Docker images...
    docker-compose down --rmi all
)

echo.
echo ============================================================
echo   OK: System has been removed from Docker.
echo ============================================================
pause
