# ============================================================
# launch_system.ps1
# 🏫 Schulmanagement Unified Launcher
# "Made with passion for teachers, by a teacher."
# ============================================================

$ErrorActionPreference = "Continue"

# Resolve script directory and project root
$ScriptDir = $PSScriptRoot
if (-not $ScriptDir -and $PSCommandPath) { $ScriptDir = Split-Path -Parent $PSCommandPath }
if (-not $ScriptDir) { $ScriptDir = Get-Location }
$ProjectRoot = Split-Path -Parent $ScriptDir

try {
    # Ensure Admin for Docker management
    $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if (-not $isAdmin) {
        Write-Host ">> Requesting Administrator privileges to manage Docker containers..." -ForegroundColor Yellow
        $scriptPath = if ($PSCommandPath) { $PSCommandPath } else { Join-Path $ScriptDir "launch_system.ps1" }
        Start-Process powershell -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`"" -Verb RunAs
        exit 0
    }

    if ($ProjectRoot) { Set-Location -LiteralPath $ProjectRoot }

    function Write-Banner($title) {
        Write-Host "`n  ############################################################" -ForegroundColor Cyan
        Write-Host "  #                                                          #" -ForegroundColor Cyan
        Write-Host "  #   $($title.PadRight(50))     #" -ForegroundColor White
        Write-Host "  #                                                          #" -ForegroundColor Cyan
        Write-Host "  ############################################################`n" -ForegroundColor Cyan
    }
    
    function Step($msg)     { Write-Host "  >> $msg" -ForegroundColor White }
    function Write-Ok($msg) { Write-Host "     [OK] $msg" -ForegroundColor Green }
    function Write-Warn($msg) { Write-Host "     [WARN] $msg" -ForegroundColor Yellow }
    function Write-Fail($msg) { Write-Host "     [FAIL] $msg" -ForegroundColor Red }
    function Write-Tip($msg)  { Write-Host "     [TIP] $msg" -ForegroundColor Cyan }

    Clear-Host
    Write-Banner "SCHULMANAGEMENT V2.3"
    Write-Host "  Bringing real-time order to the classroom. Starting the engine...`n" -ForegroundColor Gray

    # 1. Update Check
    if (Test-Path ".git") {
        Step "Syncing with GitHub mission control..."
        git fetch --quiet origin main 2>$null
        $local = git rev-parse 'HEAD' 2>$null
        $remote = git rev-parse 'origin/main' 2>$null
        if ($local -and $remote -and $local -ne $remote) {
            Write-Host "     [UPDATE AVAILABLE] A new version is ready on GitHub!" -ForegroundColor Green
            Write-Host "     -> Run '00_update_system.bat' to download." -ForegroundColor Yellow
        } else {
            Write-Ok "System is up to date."
        }
    }

    # 2. Docker Check
    Step "Checking Docker heartbeat..."
    docker info 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "Docker is not responding."
        Write-Host "     Please open Docker Desktop and wait for it to start." -ForegroundColor Yellow
        exit 1
    }
    Write-Ok "Docker is healthy and ready."

    # 3. Detect current state
    $runningContainers = docker ps --format "{{.Names}}" 2>&1 | Where-Object { $_ -match "school_|antigravity_" }
    
    if ($runningContainers) {
        Write-Host "`n  [STATUS] System is already active and serving." -ForegroundColor Green
        Write-Host "  1) Continue (Monitor and Verify)" -ForegroundColor White
        Write-Host "  2) Safe Refresh (Restart services for a clean start)" -ForegroundColor White
        Write-Host "  3) Stop Services (Halt for maintenance)" -ForegroundColor White
        Write-Host "  q) Exit Launcher" -ForegroundColor Gray
        
        $choice = Read-Host "`n  Selection"
        if ($choice -eq "2") {
            Write-Host "`n  >> Stopping current services..." -ForegroundColor White
            docker compose down --remove-orphans 2>&1 | ForEach-Object { Write-Host "     $_" -ForegroundColor Gray }
            Start-Sleep -Seconds 2
        } elseif ($choice -eq "3") {
            Write-Host "`n  >> Shutting down gracefully..." -ForegroundColor White
            docker compose down 2>&1 | ForEach-Object { Write-Host "     $_" -ForegroundColor Gray }
            Write-Ok "System is now offline."
            exit 0
        } elseif ($choice -eq "q") {
            exit 0
        }
    }

    # 4. Start the stack
    Write-Host "`n  >> Orchestrating containers (Backend, Frontend, Database)..." -ForegroundColor White
    docker compose up -d 2>&1 | ForEach-Object { Write-Host "     $_" -ForegroundColor Gray }
    
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "Launch failed. Check Docker Desktop logs."
        exit 1
    }
    Write-Ok "Services are deploying in the background."

    # 5. Wait for services
    Write-Host "`n  >> Validating health checks..." -ForegroundColor White
    Step "Pinging Backend API (Up to 60s)..."
    $backendReady = $false
    for ($i = 1; $i -le 60; $i++) {
        try {
            $r = Invoke-WebRequest -Uri "http://localhost:4000/api/setup/status" -UseBasicParsing -TimeoutSec 2 -ErrorAction SilentlyContinue
            if ($r.StatusCode -eq 200) { 
                Write-Ok "Backend is responsive ($i s)."
                $backendReady = $true
                break 
            }
        } catch {}
        Start-Sleep -Seconds 1
    }
    if (-not $backendReady) { Write-Warn "Backend is taking longer than usual to respond." }

    Step "Verifying Frontend GUI..."
    for ($j = 1; $j -le 30; $j++) {
        try {
            $r = Invoke-WebRequest -Uri "http://localhost:3000/" -UseBasicParsing -TimeoutSec 3 -ErrorAction SilentlyContinue
            if ($r.StatusCode -lt 400) { 
                Write-Ok "Frontend is live ($j s)."
                break 
            }
        } catch {}
        Start-Sleep -Seconds 1
    }

    # 6. Access Report
    Write-Banner "LAUNCH SUCCESSFUL"
    
    $localIp = (Get-NetIPAddress | Where-Object {
        $_.AddressFamily -eq 'InterNetwork' -and $_.InterfaceAlias -notmatch 'Loopback|vEthernet'
    } | Select-Object -First 1).IPAddress
    if (-not $localIp) { $localIp = "localhost" }

    Write-Host "  The system is now available for students and teachers:`n" -ForegroundColor Gray
    Write-Host "    -> On this PC:    http://localhost:3000" -ForegroundColor Green
    if ($localIp -ne "localhost") {
        Write-Host "    -> In Network:    http://$localIp:3000" -ForegroundColor Green
    }
    Write-Host ""
    
    Write-Tip "You can monitor live classroom movements using '04_system_health_monitor.bat'."
    Write-Host ""

} catch {
    Write-Host "`n  [ERROR] An unexpected issue occurred:" -ForegroundColor Red
    Write-Host "  $($_.Exception.Message)" -ForegroundColor White
} finally {
    Write-Host "`n  Ready for the first lesson. Press any key to close this launcher..." -ForegroundColor Gray
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
}
