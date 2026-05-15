# ============================================================
# launch_system.ps1
# School Management System - Unified Launcher & Monitor
# ============================================================

$ErrorActionPreference = "Continue"

# Resolve script directory and project root
$ScriptDir = $PSScriptRoot
if (-not $ScriptDir -and $PSCommandPath) { $ScriptDir = Split-Path -Parent $PSCommandPath }
if (-not $ScriptDir) { $ScriptDir = Get-Location }
$ProjectRoot = Split-Path -Parent $ScriptDir

# Wrap everything in try/finally to ensure the window stays open on error
try {
    # Ensure Admin for Docker management
    $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if (-not $isAdmin) {
        Write-Host "Requesting Administrator privileges..." -ForegroundColor Yellow
        $scriptPath = if ($PSCommandPath) { $PSCommandPath } else { Join-Path $ScriptDir "launch_system.ps1" }
        Start-Process powershell -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`"" -Verb RunAs
        exit 0
    }

    if ($ProjectRoot) { Set-Location -LiteralPath $ProjectRoot }

    function Write-Header($text) {
        Write-Host ""
        Write-Host "============================================================" -ForegroundColor Cyan
        Write-Host " $text" -ForegroundColor White
        Write-Host "============================================================" -ForegroundColor Cyan
        Write-Host ""
    }
    function Step($msg)     { Write-Host ">> $msg" -ForegroundColor White }
    function Write-Ok($msg) { Write-Host "   [OK] $msg" -ForegroundColor Green }
    function Write-Warn($msg) { Write-Host "   [WARN] $msg" -ForegroundColor Yellow }
    function Write-Fail($msg) { Write-Host "   [FAIL] $msg" -ForegroundColor Red }
    function Write-Info($msg) { Write-Host "   [INFO] $msg" -ForegroundColor Gray }

    Clear-Host
    Write-Header "🏫 School Management System - Launcher"

    # Preflight: Docker check
    Step "Checking Docker status..."
    docker info 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "Docker Desktop is not running."
        Write-Host "   Please start Docker Desktop and run this script again." -ForegroundColor Yellow
        exit 1
    }
    Write-Ok "Docker is ready"

    # Detect current state
    $runningContainers = docker ps --format "{{.Names}}" 2>&1 | Where-Object { $_ -match "school_|antigravity_" }
    
    if ($runningContainers) {
        Write-Host "`nSystem is already partially or fully running." -ForegroundColor Cyan
        Write-Host "1) Continue (Ensure everything is up)" -ForegroundColor White
        Write-Host "2) Safe Restart (Stop and Start again - recommended if buggy)" -ForegroundColor White
        Write-Host "3) Stop System" -ForegroundColor White
        Write-Host "q) Exit" -ForegroundColor Gray
        
        $choice = Read-Host "`nSelect an option"
        if ($choice -eq "2") {
            Write-Header "Performing Safe Restart..."
            docker compose down --remove-orphans 2>&1 | ForEach-Object { Write-Host "   $_" -ForegroundColor Gray }
            Start-Sleep -Seconds 2
        } elseif ($choice -eq "3") {
            Write-Header "Stopping System..."
            docker compose down 2>&1 | ForEach-Object { Write-Host "   $_" -ForegroundColor Gray }
            Write-Ok "System stopped."
            exit 0
        } elseif ($choice -eq "q") {
            exit 0
        }
    }

    # Start the stack
    Write-Header "Starting Services..."
    docker compose up -d 2>&1 | ForEach-Object { Write-Host "   $_" -ForegroundColor Gray }
    
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "Failed to start containers. Check Docker Desktop for errors."
        exit 1
    }
    Write-Ok "Containers are launching"

    # Wait for services
    Write-Header "Waiting for services to be ready..."
    Step "Checking Backend API (up to 60s)..."
    $backendReady = $false
    for ($i = 1; $i -le 60; $i++) {
        try {
            $r = Invoke-WebRequest -Uri "http://localhost:4000/api/setup/status" -UseBasicParsing -TimeoutSec 2 -ErrorAction SilentlyContinue
            if ($r.StatusCode -eq 200) { 
                Write-Ok "Backend ready ($i s)"
                $backendReady = $true
                break 
            }
        } catch {}
        Start-Sleep -Seconds 1
    }
    if (-not $backendReady) { Write-Warn "Backend did not respond within 60s - it might still be initializing database." }

    Step "Checking Frontend (up to 30s)..."
    for ($j = 1; $j -le 30; $j++) {
        try {
            $r = Invoke-WebRequest -Uri "http://localhost:3000/" -UseBasicParsing -TimeoutSec 3 -ErrorAction SilentlyContinue
            if ($r.StatusCode -lt 400) { 
                Write-Ok "Frontend ready ($j s)"
                break 
            }
        } catch {}
        Start-Sleep -Seconds 1
    }

    # Status Report
    Write-Header "System Status & Access"
    
    $localIp = (Get-NetIPAddress | Where-Object {
        $_.AddressFamily -eq 'InterNetwork' -and $_.InterfaceAlias -notmatch 'Loopback|vEthernet'
    } | Select-Object -First 1).IPAddress
    if (-not $localIp) { $localIp = "localhost" }

    Write-Host "   Access URLS:" -ForegroundColor White
    Write-Host "     -> This PC:  http://localhost:3000" -ForegroundColor Green
    if ($localIp -ne "localhost") {
        Write-Host "     -> Network:  http://$localIp:3000" -ForegroundColor Green
    }
    Write-Host ""
    
    Write-Host "   Containers:" -ForegroundColor White
    docker ps --format "     {{.Names}}`t{{.Status}}" 2>&1 | ForEach-Object { Write-Host $_ -ForegroundColor Gray }

    Write-Header "Launch Complete"
    Write-Host "The system is running in the background." -ForegroundColor White
    Write-Host "You can close this window now." -ForegroundColor Gray
    Write-Host ""

} catch {
    Write-Host "`n[ERROR] An unexpected error occurred:" -ForegroundColor Red
    Write-Host $_ -ForegroundColor White
} finally {
    Write-Host "`nPress any key to exit this window..." -ForegroundColor Gray
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
}
