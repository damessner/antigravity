# ============================================================
# check_requirements.ps1
# School Management System - Requirements Checker
# ============================================================

$ErrorActionPreference = "Continue"

# Resolve script directory and project root
$ScriptDir = $PSScriptRoot
if (-not $ScriptDir -and $PSCommandPath) { $ScriptDir = Split-Path -Parent $PSCommandPath }
if (-not $ScriptDir) { $ScriptDir = Get-Location }
$ProjectRoot = Split-Path -Parent $ScriptDir

# Wrap everything in try/finally to ensure the window stays open on error
try {
    $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if (-not $isAdmin) {
        Write-Host "Requesting Administrator privileges..." -ForegroundColor Yellow
        $scriptPath = if ($PSCommandPath) { $PSCommandPath } else { Join-Path $ScriptDir "check_requirements.ps1" }
        if (-not (Test-Path $scriptPath)) {
             Write-Host "ERROR: Could not find script at $scriptPath" -ForegroundColor Red
             Pause
             exit 1
        }
        Start-Process powershell -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`"" -Verb RunAs
        exit 0
    }

    if ($ProjectRoot) { Set-Location -LiteralPath $ProjectRoot }

    $PassCount = 0
    $WarnCount = 0
    $FailCount = 0

    function Write-Header($text) {
        Write-Host ""
        Write-Host "============================================================" -ForegroundColor Cyan
        Write-Host " $text" -ForegroundColor White
        Write-Host "============================================================" -ForegroundColor Cyan
        Write-Host ""
    }
    function Write-CheckOk($msg)   { Write-Host "   [OK] $msg" -ForegroundColor Green;  $script:PassCount++ }
    function Write-CheckWarn($msg) { Write-Host "   [WARN] $msg" -ForegroundColor Yellow; $script:WarnCount++ }
    function Write-CheckFail($msg) { Write-Host "   [FAIL] $msg" -ForegroundColor Red;    $script:FailCount++ }
    function Write-CheckInfo($msg) { Write-Host "   [INFO] $msg" -ForegroundColor Gray }
    function Step($msg)       { Write-Host ">> $msg" -ForegroundColor White }

    Clear-Host

    Write-Header "School Management System - Requirements Checker"
    Write-Host "This tool verifies that all required dependencies are installed" -ForegroundColor Yellow
    Write-Host "and up-to-date. No data is changed. Read-only check." -ForegroundColor Yellow
    Write-Host ""

    # 1. Operating System
    Write-Header "1. Operating System"
    Step "Detecting OS..."
    $osInfo = [System.Environment]::OSVersion
    $winVer = (Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue).Caption
    if ($winVer) {
        Write-CheckOk "OS: $winVer"
    } else {
        Write-CheckInfo "OS: $($osInfo.VersionString)"
    }

    # 2. Docker
    Write-Header "2. Docker"

    Step "Checking Docker installation..."
    $dockerCmd = Get-Command docker -ErrorAction SilentlyContinue
    if ($dockerCmd) {
        $dockerVer = (docker --version 2>&1)
        Write-CheckOk "Docker installed: $dockerVer"
    } else {
        Write-CheckFail "Docker NOT found. Install from https://docs.docker.com/desktop/windows/"
    }

    Step "Checking Docker daemon..."
    $dockerInfo = docker info 2>&1
    if ($LASTEXITCODE -eq 0 -and $dockerInfo -notmatch "error during connect") {
        Write-CheckOk "Docker daemon is running"
    } else {
        Write-CheckFail "Docker daemon is NOT running - please start Docker Desktop"
    }

    Step "Checking Docker Compose..."
    docker compose version 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-CheckOk "Docker Compose (plugin) installed"
    } else {
        Write-CheckFail "Docker Compose plugin NOT found - update Docker Desktop"
    }

    # 3. Required files
    Write-Header "3. Project Files"

    Step "Checking project structure..."
    $requiredFiles = @("docker-compose.yml", "db\init.sql", "backend\Dockerfile", "frontend\Dockerfile")
    foreach ($f in $requiredFiles) {
        $fullPath = Join-Path $ProjectRoot $f
        if (Test-Path $fullPath) {
            Write-CheckOk "Found: $f"
        } else {
            Write-CheckFail "Missing: $f"
        }
    }

    Step "Checking .env file..."
    $envPath = Join-Path $ProjectRoot ".env"
    if (Test-Path $envPath) {
        Write-CheckOk ".env file present"
        $envContent = Get-Content $envPath -Raw -ErrorAction SilentlyContinue
        if ($envContent -match "JWT_SECRET=" -and $envContent -notmatch "SuperSecureAustrianSchool") {
            Write-CheckOk "JWT_SECRET is customized"
        } else {
            Write-CheckWarn "JWT_SECRET is using the default - update .env for production security"
        }
        if ($envContent -match "DB_PASSWORD=" -and $envContent -notmatch "SuperSecretSchoolDbPass2026") {
            Write-CheckOk "DB_PASSWORD is customized"
        } else {
            Write-CheckWarn "DB_PASSWORD is using the default - update .env for production security"
        }
    } else {
        Write-CheckWarn ".env file not found"
    }

    # 4. Container Status
    Write-Header "4. Container Status"

    Step "Checking running containers..."
    docker info 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        $containerNames = @(
            @{ Label="Database"; Names=@("school_db","antigravity_db") },
            @{ Label="Backend";  Names=@("school_backend","antigravity_backend") },
            @{ Label="Frontend"; Names=@("school_frontend","antigravity_frontend") }
        )
        foreach ($ct in $containerNames) {
            $status = $null
            foreach ($name in $ct.Names) {
                $inspect = docker inspect --format='{{.State.Status}}' $name 2>&1
                if ($LASTEXITCODE -eq 0 -and $inspect -notmatch "Error") {
                    $status = $inspect.Trim()
                    break
                }
            }
            if ($status -eq "running") {
                Write-CheckOk "$($ct.Label) container: running"
            } else {
                Write-CheckInfo "$($ct.Label) container: $( if ($status) { $status } else { 'not found' } )"
            }
        }

        Write-Host ""
        Step "Container details:"
        docker ps --format "   {{.Names}}`t{{.Status}}`t{{.Ports}}" 2>&1 | ForEach-Object { Write-Host "   $_" -ForegroundColor Gray }
    }

    # 5. Service Health
    Write-Header "5. Service Health"

    Step "Probing backend API..."
    try {
        $resp = Invoke-WebRequest -Uri "http://localhost:4000/api/setup/status" -UseBasicParsing -TimeoutSec 3 -ErrorAction SilentlyContinue
        if ($resp.StatusCode -eq 200) { Write-CheckOk "Backend API reachable at http://localhost:4000" }
        else { Write-CheckInfo "Backend not reachable (status $($resp.StatusCode))" }
    } catch {
        Write-CheckInfo "Backend not reachable (may not be running)"
    }

    Step "Probing frontend..."
    try {
        $resp = Invoke-WebRequest -Uri "http://localhost:3000/" -UseBasicParsing -TimeoutSec 5 -ErrorAction SilentlyContinue
        if ($resp.StatusCode -lt 400) { Write-CheckOk "Frontend reachable at http://localhost:3000" }
        else { Write-CheckInfo "Frontend returned status $($resp.StatusCode)" }
    } catch {
        Write-CheckInfo "Frontend not reachable (may not be running)"
    }

    # 6. Disk Space
    Write-Header "6. Disk Space"

    Step "Checking available disk space..."
    try {
        $disk = Get-PSDrive -Name $((Split-Path -Qualifier $ProjectRoot).TrimEnd(':')) -ErrorAction SilentlyContinue
        if ($disk) {
            $freeGB = [math]::Round($disk.Free / 1GB, 1)
            if ($freeGB -gt 2) {
                Write-CheckOk "Available disk space: ${freeGB} GB"
            } elseif ($freeGB -gt 0.5) {
                Write-CheckWarn "Low disk space: ${freeGB} GB"
            } else {
                Write-CheckFail "Critical disk space: ${freeGB} GB"
            }
        }
    } catch {
        Write-CheckInfo "Could not determine disk space"
    }

    # Summary
    Write-Header "SUMMARY"
    Write-Host "   Passed:   $PassCount" -ForegroundColor Green
    if ($WarnCount -gt 0) { Write-Host "   Warnings: $WarnCount" -ForegroundColor Yellow }
    if ($FailCount -gt 0) { Write-Host "   Failed:   $FailCount" -ForegroundColor Red }
    Write-Host ""
    if ($FailCount -eq 0 -and $WarnCount -eq 0) {
        Write-Host "   System is ready to launch." -ForegroundColor Green
    } elseif ($FailCount -eq 0) {
        Write-Host "   System can start but review warnings." -ForegroundColor Yellow
    } else {
        Write-Host "   Fix failed checks before starting." -ForegroundColor Red
    }
    Write-Host ""

} catch {
    Write-Host "`n[ERROR] An unexpected error occurred:" -ForegroundColor Red
    Write-Host $_ -ForegroundColor White
} finally {
    Write-Host "`nPress any key to exit..." -ForegroundColor Gray
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
}
