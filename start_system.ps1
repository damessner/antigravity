# School Management System - Production Bootstrapper
# This script ensures Docker is running, starts the containers, and provides access info.

function Write-Header {
    param($Text)
    Write-Host "`n====================================================" -ForegroundColor Cyan
    Write-Host " $Text" -ForegroundColor White -BackgroundColor Blue
    Write-Host "====================================================`n" -ForegroundColor Cyan
}

# 1. Elevate Privileges
$currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "Requesting Administrator privileges..." -ForegroundColor Yellow
    Start-Process powershell.exe -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`"" -Verb RunAs
    exit
}

# Ensure we are in the script's directory (elevation resets CWD to System32)
Set-Location -Path $PSScriptRoot

Clear-Host

Write-Header "SCHOOL MANAGEMENT SYSTEM V2 - STARTUP"

# 2. Check Docker Installation
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] Docker is not installed. Please install Docker Desktop." -ForegroundColor Red
    Pause
    exit
}

# 3. Check if Docker is Running
Write-Host "Checking Docker status..." -NoNewline
$dockerCheck = docker info 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host " FAIL" -ForegroundColor Red
    Write-Host "[ERROR] Docker Desktop is not running. Please start it and try again." -ForegroundColor Red
    Pause
    exit
}
Write-Host " OK" -ForegroundColor Green

# 4. Start Containers
Write-Header "Starting Containers..."
docker compose up -d

if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Failed to start containers. Check docker-compose.yml" -ForegroundColor Red
    Pause
    exit
}

# 5. Wait for Health (Briefly)
Write-Host "Waiting for services to stabilize..."
Start-Sleep -Seconds 5

# 6. Display Status and Login Info
Clear-Host
Write-Header "SYSTEM READY - ACCESS INFORMATION"

$ip = (Get-NetIPAddress | Where-Object { $_.AddressFamily -eq 'InterNetwork' -and $_.InterfaceAlias -notmatch 'Loopback|vEthernet' } | Select-Object -First 1).IPAddress
if (-not $ip) { $ip = "localhost" }

Write-Host "The system is now accessible at:" -ForegroundColor White
Write-Host "  - Local:   " -NoNewline; Write-Host "http://localhost:3000" -ForegroundColor Cyan
Write-Host "  - Network: " -NoNewline; Write-Host "http://$($ip):3000" -ForegroundColor Cyan

Write-Host "`nDefault Credentials:" -ForegroundColor White
Write-Host "  - Username: " -NoNewline; Write-Host "da.messner" -ForegroundColor Yellow
Write-Host "  - Password: " -NoNewline; Write-Host "(set by administrator — change on first login)" -ForegroundColor Yellow
Write-Host "  ⚠️  This is highly experimental software — please report issues to the dev team." -ForegroundColor DarkYellow

Write-Header "CURRENT CONTAINER STATUS"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

Write-Host "`nKeep this window open to monitor logs (optional), or close it to continue." -ForegroundColor Gray
Write-Host "Press any key to exit this installer..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
