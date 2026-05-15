# ============================================================
# 🔄 restart_system.ps1
# School Management System — Safe Restart Utility
# Brings the Docker stack down and back up, then shows system
# status, service health, URLs, and login guidance.
# Stays open until dismissed by the operator.
# Usage: .\restart_system.ps1
# ============================================================

$ErrorActionPreference = "Continue"

# Resolve script directory and elevate if needed
$ScriptDir = $PSScriptRoot
if (-not $ScriptDir -and $PSCommandPath) { $ScriptDir = Split-Path -Parent $PSCommandPath }
if (-not $ScriptDir) { $ScriptDir = Get-Location }

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "Requesting Administrator privileges..." -ForegroundColor Yellow
    $scriptPath = if ($PSCommandPath) { $PSCommandPath } else { Join-Path (Get-Location) "restart_system.ps1" }
    Start-Process powershell -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`"" -Verb RunAs
    exit 0
}

if ($ScriptDir) { Set-Location -LiteralPath $ScriptDir }

function Print-Header($text) {
    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host " $text" -ForegroundColor White
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host ""
}
function Step($msg) { Write-Host "🔄 $msg" -ForegroundColor White }
function Ok($msg)   { Write-Host "   ✅ $msg" -ForegroundColor Green }
function Warn($msg) { Write-Host "   ⚠️  $msg" -ForegroundColor Yellow }
function Fail($msg) { Write-Host "   ❌ $msg" -ForegroundColor Red }
function Info($msg) { Write-Host "   ℹ️  $msg" -ForegroundColor Gray }

Clear-Host
Print-Header "🏫 School Management System — Restart Utility"
Write-Host "This will stop and restart all containers cleanly." -ForegroundColor Yellow
Write-Host "Existing data is preserved. No backup is performed." -ForegroundColor Yellow
Write-Host ""

# ── Preflight: Docker check ───────────────────────────────────────────────────
Step "Checking Docker daemon..."
$dockerInfo = docker info 2>&1
if ($LASTEXITCODE -ne 0 -or $dockerInfo -match "error during connect") {
    Fail "Docker daemon is not running. Please start Docker Desktop."
    Write-Host ""
    Write-Host "Press any key to exit..." -ForegroundColor Gray
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit 1
}
Ok "Docker daemon is running"
Write-Host ""

# ── Step 1: Bring stack down ──────────────────────────────────────────────────
Print-Header "Step 1 · Stopping current containers"
Step "Running: docker compose down --remove-orphans ..."
docker compose down --remove-orphans 2>&1 | ForEach-Object { Write-Host "   $_" -ForegroundColor Gray }
if ($LASTEXITCODE -ne 0) {
    Warn "docker compose down returned non-zero — continuing anyway"
}
Start-Sleep -Seconds 2
Ok "Stack stopped"
Write-Host ""

# ── Step 2: Bring stack up ────────────────────────────────────────────────────
Print-Header "Step 2 · Starting containers"
Step "Running: docker compose up -d ..."
docker compose up -d 2>&1 | ForEach-Object { Write-Host "   $_" -ForegroundColor Gray }
if ($LASTEXITCODE -ne 0) {
    Fail "Failed to start containers. Run 'docker compose logs' for details."
    Write-Host ""
    Write-Host "Press any key to exit..." -ForegroundColor Gray
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit 1
}
Ok "docker compose up completed"
Write-Host ""

# ── Step 3: Wait for backend ──────────────────────────────────────────────────
Print-Header "Step 3 · Waiting for services"
Step "Waiting for backend API (up to 60s)..."
$backendReady = $false
for ($i = 1; $i -le 60; $i++) {
    try {
        $r = Invoke-WebRequest -Uri "http://localhost:4000/api/setup/status" -UseBasicParsing -TimeoutSec 2 -ErrorAction SilentlyContinue
        if ($r.StatusCode -eq 200) { Ok "Backend API ready (${i}s)"; $backendReady = $true; break }
    } catch {}
    Start-Sleep -Seconds 1
}
if (-not $backendReady) { Warn "Backend did not respond within 60s — it may still be starting" }

Step "Waiting for frontend (up to 30s)..."
for ($i = 1; $i -le 30; $i++) {
    try {
        $r = Invoke-WebRequest -Uri "http://localhost:3000/" -UseBasicParsing -TimeoutSec 3 -ErrorAction SilentlyContinue
        if ($r.StatusCode -lt 400) { Ok "Frontend ready (${i}s)"; break }
    } catch {}
    Start-Sleep -Seconds 1
}
Write-Host ""

# ── Step 4: Status report ─────────────────────────────────────────────────────
Print-Header "Step 4 · System Status"

Step "Container health:"
docker ps --format "   {{.Names}}`t{{.Status}}`t{{.Ports}}" 2>&1 | ForEach-Object { Write-Host $_ -ForegroundColor Gray }
Write-Host ""

Step "Network info:"
$localIp = (Get-NetIPAddress | Where-Object {
    $_.AddressFamily -eq 'InterNetwork' -and $_.InterfaceAlias -notmatch 'Loopback|vEthernet'
} | Select-Object -First 1).IPAddress
if (-not $localIp) { $localIp = "localhost" }

Write-Host ""
Write-Host "   🌐 System is available at:" -ForegroundColor Green
Write-Host "     → Local:    http://localhost:3000" -ForegroundColor Cyan
if ($localIp -ne "localhost") {
    Write-Host "     → Network:  http://${localIp}:3000" -ForegroundColor Cyan
}
Write-Host ""
Write-Host "   🔑 First Login:" -ForegroundColor White
Write-Host "     → Username: da.messner" -ForegroundColor Yellow
Write-Host "     → Password: (as provided by administrator)" -ForegroundColor Yellow
Write-Host "     → You will be asked to change your password on first login." -ForegroundColor Gray
Write-Host ""
Write-Host "   📋 Useful commands:" -ForegroundColor White
Write-Host "     → View logs:    docker compose logs -f" -ForegroundColor Gray
Write-Host "     → Stop system:  docker compose down" -ForegroundColor Gray
Write-Host "     → Check status: docker compose ps" -ForegroundColor Gray
Write-Host "     → Reset system: .\clean_slate.ps1" -ForegroundColor Gray
Write-Host ""

Print-Header "✅ Restart Complete"
Write-Host "The system is restarting. Open a browser and navigate to:" -ForegroundColor Green
Write-Host "  http://${localIp}:3000" -ForegroundColor Cyan
Write-Host ""
Write-Host "Press any key to exit this window..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
