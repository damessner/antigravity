# ============================================================
# start_system.ps1
# School Management System - One-Click Launcher
# ============================================================

$ErrorActionPreference = "Continue"

# Resolve script directory and project root
$ScriptDir = $PSScriptRoot
if (-not $ScriptDir) { $ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path }
$ProjectRoot = Split-Path -Parent $ScriptDir

# Wrap everything in try/finally to ensure the window stays open on error
try {
    $currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    if (-not $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        Write-Host "Requesting Administrator privileges..." -ForegroundColor Yellow
        $scriptPath = if ($PSCommandPath) { $PSCommandPath } else { Join-Path $ScriptDir "start_system.ps1" }
        Start-Process powershell.exe -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`"" -Verb RunAs
        exit
    }

    Set-Location -Path $ProjectRoot

    Clear-Host
    Write-Host "====================================================" -ForegroundColor Cyan
    Write-Host "🏫 School Management System - One-Click Launcher" -ForegroundColor White
    Write-Host "====================================================`n" -ForegroundColor Cyan

    # 1. Check if Docker is Running
    Write-Host ">> Checking Docker status..." -ForegroundColor Yellow
    docker info 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "   [FAIL] Docker Desktop is not running. Please start it and try again." -ForegroundColor Red
        exit
    }
    Write-Host "   [OK] Docker is running." -ForegroundColor Green

    # 2. Start the Stack
    Write-Host "`n>> Starting services (docker compose up -d)..." -ForegroundColor Yellow
    docker compose up -d 2>&1 | ForEach-Object { Write-Host "   $_" -ForegroundColor Gray }

    if ($LASTEXITCODE -ne 0) {
        Write-Host "`n   [FAIL] Some containers failed to start. Check logs below." -ForegroundColor Red
        docker compose logs --tail=20
        exit
    }

    Write-Host "`n   [OK] Services started successfully." -ForegroundColor Green

    # 3. Final Report
    Write-Host "`n====================================================" -ForegroundColor Cyan
    Write-Host "🚀 SYSTEM STATUS" -ForegroundColor White
    Write-Host "====================================================" -ForegroundColor Cyan
    docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

    Write-Host "`nKeep this window open to monitor logs (optional), or close it to continue." -ForegroundColor Gray

} catch {
    Write-Host "`n[ERROR] An unexpected error occurred during startup:" -ForegroundColor Red
    Write-Host $_ -ForegroundColor White
} finally {
    Write-Host "`nPress any key to exit this window..." -ForegroundColor Gray
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
}
