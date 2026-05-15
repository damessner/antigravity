# ============================================================
# check_requirements.ps1
# 🏫 Schulmanagement Requirement Checker
# "Ensuring the digital classroom is solid."
# ============================================================

$ErrorActionPreference = "Continue"

# Resolve script directory and project root
$ScriptDir = $PSScriptRoot
if (-not $ScriptDir -and $PSCommandPath) { $ScriptDir = Split-Path -Parent $PSCommandPath }
if (-not $ScriptDir) { $ScriptDir = Get-Location }
$ProjectRoot = Split-Path -Parent $ScriptDir

try {
    # Ensure Admin
    $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if (-not $isAdmin) {
        Write-Host ">> Requesting Administrator privileges to verify system health..." -ForegroundColor Yellow
        $scriptPath = if ($PSCommandPath) { $PSCommandPath } else { Join-Path $ScriptDir "check_requirements.ps1" }
        Start-Process powershell -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`"" -Verb RunAs
        exit 0
    }

    if ($ProjectRoot) { Set-Location -LiteralPath $ProjectRoot }

    $PassCount = 0
    $WarnCount = 0
    $FailCount = 0

    function Write-Banner($title) {
        Write-Host "`n  ############################################################" -ForegroundColor Cyan
        Write-Host "  #                                                          #" -ForegroundColor Cyan
        Write-Host "  #   $($title.PadRight(50))     #" -ForegroundColor White
        Write-Host "  #                                                          #" -ForegroundColor Cyan
        Write-Host "  ############################################################`n" -ForegroundColor Cyan
    }
    
    function Step($msg)       { Write-Host "  >> $msg" -ForegroundColor White }
    function Write-CheckOk($msg)   { Write-Host "     [OK] $msg" -ForegroundColor Green;  $script:PassCount++ }
    function Write-CheckWarn($msg) { Write-Host "     [WARN] $msg" -ForegroundColor Yellow; $script:WarnCount++ }
    function Write-CheckFail($msg) { Write-Host "     [FAIL] $msg" -ForegroundColor Red;    $script:FailCount++ }
    function Write-CheckInfo($msg) { Write-Host "     [INFO] $msg" -ForegroundColor Gray }

    Clear-Host
    Write-Banner "SYSTEM HEALTH CHECK"
    Write-Host "  Verifying that all tools are ready for a smooth lesson.`n" -ForegroundColor Gray

    # 1. Operating System
    Step "Identifying Host Environment..."
    $winVer = (Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue).Caption
    if ($winVer) {
        Write-CheckOk "OS: $winVer"
    } else {
        Write-CheckInfo "OS: Windows (Version Unknown)"
    }

    # 2. Docker
    Step "Verifying Docker Infrastructure..."
    $dockerCmd = Get-Command docker -ErrorAction SilentlyContinue
    if ($dockerCmd) {
        $dockerVer = (docker --version 2>&1)
        Write-CheckOk "Docker Engine is installed ($dockerVer)"
    } else {
        Write-CheckFail "Docker was not found on this system."
        Write-Host "     -> Please install Docker Desktop from: https://docs.docker.com/desktop/windows/" -ForegroundColor Yellow
    }

    Step "Connecting to Docker Daemon..."
    $dockerInfo = docker info 2>&1
    if ($LASTEXITCODE -eq 0 -and $dockerInfo -notmatch "error during connect") {
        Write-CheckOk "Docker is running and accessible."
    } else {
        Write-CheckFail "Docker is installed but not running."
        Write-Host "     -> Open Docker Desktop and wait for the green status before continuing." -ForegroundColor Yellow
    }

    Step "Validating Docker Compose..."
    docker compose version 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-CheckOk "Docker Compose plugin is active."
    } else {
        Write-CheckFail "Docker Compose plugin missing. Update your Docker Desktop."
    }

    # 3. Required files
    Step "Auditing Project Structure..."
    $requiredFiles = @("docker-compose.yml", "db\init.sql", "backend\Dockerfile", "frontend\Dockerfile")
    foreach ($f in $requiredFiles) {
        if (Test-Path (Join-Path $ProjectRoot $f)) {
            Write-CheckOk "Confirmed: $f"
        } else {
            Write-CheckFail "Missing critical file: $f"
        }
    }

    Step "Verifying Configuration (.env)..."
    $envPath = Join-Path $ProjectRoot ".env"
    if (Test-Path $envPath) {
        $envContent = Get-Content $envPath -Raw -ErrorAction SilentlyContinue
        if ($envContent -match "JWT_SECRET=" -and $envContent -notmatch "SuperSecureAustrianSchool") {
            Write-CheckOk "Security: JWT Secret is customized."
        } else {
            Write-CheckWarn "Security: Using default JWT Secret. (Not critical for local testing)"
        }
    } else {
        Write-CheckWarn "No .env file found. Default settings will be used."
    }

    # 4. Storage
    Step "Checking Disk Space for Database..."
    try {
        $disk = Get-PSDrive -Name $((Split-Path -Qualifier $ProjectRoot).TrimEnd(':')) -ErrorAction SilentlyContinue
        if ($disk) {
            $freeGB = [math]::Round($disk.Free / 1GB, 1)
            if ($freeGB -gt 5) {
                Write-CheckOk "Storage: ${freeGB} GB available (Plenty)."
            } elseif ($freeGB -gt 1) {
                Write-CheckWarn "Storage: Only ${freeGB} GB left. Monitor closely."
            } else {
                Write-CheckFail "Storage: Critical! Only ${freeGB} GB available."
            }
        }
    } catch {
        Write-CheckInfo "Could not read disk space."
    }

    # Summary
    Write-Banner "AUDIT SUMMARY"
    Write-Host "     Successful Checks: $PassCount" -ForegroundColor Green
    if ($WarnCount -gt 0) { Write-Host "     Warnings:          $WarnCount" -ForegroundColor Yellow }
    if ($FailCount -gt 0) { Write-Host "     Failed Checks:     $FailCount" -ForegroundColor Red }
    Write-Host ""
    
    if ($FailCount -eq 0) {
        Write-Host "  Everything looks excellent! Your system is ready for the next lesson.`n" -ForegroundColor Green
        Write-Host "  -> Run '02_launch_system.bat' to start the platform." -ForegroundColor Gray
    } else {
        Write-Host "  Please resolve the failed items above to ensure a stable experience.`n" -ForegroundColor Red
    }

} catch {
    Write-Host "`n  [ERROR] Audit interrupted: $_" -ForegroundColor Red
} finally {
    Write-Host "  Press any key to close the audit window..." -ForegroundColor Gray
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
}
