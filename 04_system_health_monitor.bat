@echo off
title Schulmanagement Health Monitor
pushd "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "scripts\health_monitor.ps1"
popd
pause
