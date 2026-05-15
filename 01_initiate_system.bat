@echo off
title Schulmanagement - Initialisierung
pushd "%~dp0"

if not exist "scripts\check_requirements.ps1" (
    echo ============================================================
    echo [INFO] Systemdateien fehlen in diesem Ordner.
    echo [INFO] Versuche, das System von GitHub herunterzuladen...
    echo ============================================================
    echo.
    powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Write-Host '>> Downloading Setup...'; $url='https://raw.githubusercontent.com/damessner/antigravity/main/scripts/setup_new_installation.ps1'; [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $cmd = Invoke-RestMethod -Uri $url; Invoke-Expression $cmd"
) else (
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "scripts\check_requirements.ps1"
)

popd
pause

