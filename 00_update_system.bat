@echo off
title Schulmanagement - Update
pushd "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "scripts\update_system.ps1"
popd
pause
