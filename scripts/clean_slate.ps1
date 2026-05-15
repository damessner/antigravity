# clean_slate.ps1 - Reset the school management system to a clean state
# Usage: .\clean_slate.ps1

$ErrorActionPreference = "Stop"
$skipPause = $false

# Wrap the entire execution logic including setup paths inside try/finally so the window NEVER closes instantly on startup errors.
try {
    # Resolve script directory and project root
    $ScriptDir = $PSScriptRoot
    if (-not $ScriptDir -and $PSCommandPath) {
        $ScriptDir = Split-Path -Parent $PSCommandPath
    }
    if (-not $ScriptDir) {
        $ScriptDir = Get-Location
    }
    $ProjectRoot = Split-Path -Parent $ScriptDir
    if ($ProjectRoot) {
        Set-Location -LiteralPath $ProjectRoot
    }

    # Ensure the script is running with Administrator privileges
    $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

    if (-not $isAdmin) {
        Write-Host "Requesting Administrator privileges via UAC..." -ForegroundColor Yellow
        $skipPause = $true
        $scriptPath = if ($PSCommandPath) { $PSCommandPath } else { Join-Path $ScriptDir "clean_slate.ps1" }
        Start-Process powershell -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`"" -Verb RunAs -ErrorAction Stop
        exit 0
    }

    $LogFile = Join-Path $ProjectRoot "clean_slate_execution.log"
    # Initialize or clear previous run log safely
    "=== Clean Slate Run Log ($(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')) ===" | Out-File -FilePath $LogFile -Encoding utf8

    function Write-Log {
        [CmdletBinding()]
        param(
            [Parameter(Mandatory=$true, Position=0)]
            [string]$Message,
            [ConsoleColor]$ForegroundColor = [ConsoleColor]::Gray
        )
        if ($PSBoundParameters.ContainsKey('ForegroundColor')) {
            Write-Host $Message -ForegroundColor $ForegroundColor
        } else {
            Write-Host $Message
        }
        Add-Content -Path $LogFile -Value $Message -Encoding utf8
    }

    Clear-Host
    Write-Log "==================================================" -ForegroundColor Cyan
    Write-Log "School Management System - Clean Slate Utility" -ForegroundColor Cyan
    Write-Log "==================================================" -ForegroundColor Cyan
    Write-Log ""

    Write-Log "WARNING: This will:" -ForegroundColor DarkYellow
    Write-Log "    1. Download a safety backup of the current database" -ForegroundColor DarkYellow
    Write-Log "    2. Stop all running containers" -ForegroundColor DarkYellow
    Write-Log "    3. Wipe the database" -ForegroundColor DarkYellow
    Write-Log "    4. Restart with a clean state" -ForegroundColor DarkYellow
    Write-Log ""

    $proceed = Read-Host "Proceed with clean slate? (y/N)"
    if ($proceed -notmatch "^[Yy]$") {
        Write-Log "Operation cancelled by user." -ForegroundColor Yellow
        exit 0
    }
    Write-Log ""

    # Step 1: Check if docker is available
    Write-Log "Checking Docker status..." -ForegroundColor Yellow
    try {
        $prevEA = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        $dockerStatus = docker info 2>&1
        $ErrorActionPreference = $prevEA
        if ($LASTEXITCODE -ne 0 -or $dockerStatus -match "error during connect") {
            throw "Docker daemon is not running. Please start Docker Desktop and try again."
        }
        Write-Log "   [OK] Docker is running." -ForegroundColor Green
    } catch {
        throw "Docker is not running or accessible. Error details: $_"
    }

    # Step 1b: Auto-backup before wiping
    Write-Log "Step 1/4 - Attempting automatic safety backup..." -ForegroundColor Yellow
    $ApiUrl = if ($env:NEXT_PUBLIC_API_URL) { $env:NEXT_PUBLIC_API_URL } else { "http://localhost:4000" }
    $BackupSaved = $false

    # Try pg_dump via docker exec if DB container is running
    $dbContainer = docker ps --format "{{.Names}}" 2>&1 | Where-Object { $_ -match "school_db|antigravity_db" } | Select-Object -First 1
    if ($dbContainer) {
        Write-Log "   Database container found: $dbContainer" -ForegroundColor Gray
        $BackupsDir = Join-Path $ProjectRoot "school_data\backups"
        if (-not (Test-Path $BackupsDir)) { New-Item -ItemType Directory -Path $BackupsDir -Force | Out-Null }
        $Timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
        $SqlBackupPath = Join-Path $BackupsDir "pre_clean_slate_${Timestamp}.sql"
        try {
            Write-Log "   Exporting database via pg_dump..." -ForegroundColor Gray
            docker exec $dbContainer pg_dump -U postgres school_management --data-only --inserts 2>&1 | Out-File -FilePath $SqlBackupPath -Encoding utf8
            if ($LASTEXITCODE -eq 0) {
                Write-Log "   [OK] Safety backup saved: pre_clean_slate_${Timestamp}.sql" -ForegroundColor Green
                $BackupSaved = $true
            } else {
                Write-Log "   [WARN] pg_dump failed - continuing without automatic backup" -ForegroundColor DarkYellow
                Remove-Item $SqlBackupPath -ErrorAction SilentlyContinue
            }
        } catch {
            Write-Log "   [WARN] Backup error: $_" -ForegroundColor DarkYellow
        }
    } else {
        Write-Log "   No running database container found - skipping automatic backup" -ForegroundColor Gray
    }

    if (-not $BackupSaved) {
        Write-Log "   [WARN] No automatic backup was created." -ForegroundColor DarkYellow
        $continueAnyway = Read-Host "   Continue without a backup? (y/N)"
        if ($continueAnyway -notmatch "^[Yy]$") {
            Write-Log "   Operation cancelled." -ForegroundColor Yellow
            exit 0
        }
    }
    Write-Log ""

    # Step 2: Stop containers
    Write-Log "Step 2/4 - Stopping Docker containers..." -ForegroundColor Yellow
    try {
        $prevEA = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        docker compose down --volumes --remove-orphans 2>&1 | Tee-Object -FilePath $LogFile -Append
        $execCode = $LASTEXITCODE
        $ErrorActionPreference = $prevEA
        if ($execCode -ne 0) {
            throw "Failed to stop Docker containers."
        }
        Start-Sleep -Seconds 3
    } catch {
        throw "Error stopping containers: $_"
    }
    Write-Log ""

    # Step 3: Wipe school_data directory
    Write-Log "Step 3/4 - Wiping school_data/ directory..." -ForegroundColor Yellow
    $SchoolDataDir = Join-Path $ProjectRoot "school_data"
    if (Test-Path $SchoolDataDir) {
        $DbDir = Join-Path $SchoolDataDir "db"
        if (Test-Path $DbDir) {
            try {
                Remove-Item -Path $DbDir -Recurse -Force -ErrorAction Stop
                Write-Log "   Postgres data directory cleared." -ForegroundColor Green
            } catch {
                Write-Log "   [WARN] Could not fully delete db directory: $_" -ForegroundColor DarkYellow
            }
        }
        
        Write-Log ""
        $wipeBackups = Read-Host "   Also wipe school_data/backups/? (y/N)"
        if ($wipeBackups -match "^[Yy]$") {
            $BackupsDir = Join-Path $SchoolDataDir "backups"
            if (Test-Path $BackupsDir) {
                try {
                    Get-ChildItem -Path $BackupsDir -Filter "*.json" | Remove-Item -Force -ErrorAction Stop
                    Write-Log "   Backups directory cleared." -ForegroundColor Green
                } catch {
                    Write-Log "   [WARN] Could not clear backups: $_" -ForegroundColor DarkYellow
                }
            }
        }
    }
    Write-Log ""

    # Step 4: Optional backup import
    $BackupFile = ""
    $importBackup = Read-Host "Import a backup file before starting? (y/N)"
    if ($importBackup -match "^[Yy]$") {
        $BackupFile = Read-Host "   Enter full path to .json backup file"
        $BackupFile = $BackupFile.Trim('"').Trim("'")
        if (-not (Test-Path $BackupFile -PathType Leaf)) {
            Write-Log "   [ERROR] File not found: $BackupFile" -ForegroundColor Red
            $BackupFile = ""
        } else {
            Write-Log "   [OK] Backup file found." -ForegroundColor Green
        }
    }
    Write-Log ""

    # Step 5: Restart containers
    Write-Log "Step 4/4 - Starting Docker containers..." -ForegroundColor Yellow
    $prevEA = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    docker compose up -d 2>&1 | Tee-Object -FilePath $LogFile -Append
    $execCode = $LASTEXITCODE
    $ErrorActionPreference = $prevEA
    if ($execCode -ne 0) {
        throw "Failed to start Docker containers."
    }
    Write-Log ""

    # Step 6: Wait for backend
    Write-Log "Waiting for backend to start (up to 60s)..." -ForegroundColor Yellow
    $ApiUrl = "http://localhost:4000"
    if ($env:NEXT_PUBLIC_API_URL) {
        $ApiUrl = $env:NEXT_PUBLIC_API_URL
    }

    $backendReady = $false
    for ($i = 1; $i -le 60; $i++) {
        try {
            $response = Invoke-WebRequest -Uri "$ApiUrl/api/setup/status" -UseBasicParsing -TimeoutSec 2 -ErrorAction SilentlyContinue
            if ($response -and $response.StatusCode -eq 200) {
                Write-Log "   [OK] Backend is ready." -ForegroundColor Green
                $backendReady = $true
                break
            }
        } catch {}
        Start-Sleep -Seconds 1
    }
    Write-Host ""

    # Step 7: Restore backup via API if requested
    if ($BackupFile -ne "" -and $backendReady) {
        Write-Log "Restoring backup via API..." -ForegroundColor Yellow
        $TargetBackupsDir = Join-Path $SchoolDataDir "backups"
        if (-not (Test-Path $TargetBackupsDir)) {
            New-Item -ItemType Directory -Path $TargetBackupsDir -Force | Out-Null
        }
        Copy-Item -Path $BackupFile -Destination (Join-Path $TargetBackupsDir (Split-Path $BackupFile -Leaf)) -Force
        
        $backupContent = Get-Content -Path $BackupFile -Raw
        $payload = @{
            confirm = "RESTORE"
            data = $backupContent | ConvertFrom-Json
        } | ConvertTo-Json -Depth 100
        
        try {
            $restoreResponse = Invoke-WebRequest -Uri "$ApiUrl/api/backup/restore" -Method Post -Body $payload -ContentType "application/json" -UseBasicParsing
            if ($restoreResponse.Content -match "`"success`":true") {
                Write-Log "   [OK] Backup restored successfully." -ForegroundColor Green
            } else {
                Write-Log "   [WARN] Restore returned error: $($restoreResponse.Content)" -ForegroundColor DarkYellow
            }
        } catch {
            Write-Log "   [WARN] Restore failed: $_" -ForegroundColor DarkYellow
        }
        Write-Log ""
    }

    Write-Log "SUCCESS: Clean slate complete. http://localhost:3000" -ForegroundColor Green

} catch {
    Write-Host "`n[ERROR] An error occurred:" -ForegroundColor Red
    Write-Host $_ -ForegroundColor White
} finally {
    if (-not $skipPause) {
        Write-Host "`nPress Enter to exit..." -ForegroundColor Cyan
        Read-Host | Out-Null
    }
}
