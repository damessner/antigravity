# clean_slate.ps1 — Reset the school management system to a clean state
# Usage: .\clean_slate.ps1

$ErrorActionPreference = "Stop"
$skipPause = $false

# Wrap the entire execution logic including setup paths inside try/finally so the window NEVER closes instantly on startup errors.
try {
    # Reliably resolve script directory using automatic variables
    $ScriptDir = $PSScriptRoot
    if (-not $ScriptDir -and $PSCommandPath) {
        $ScriptDir = Split-Path -Parent $PSCommandPath
    }
    if (-not $ScriptDir) {
        $ScriptDir = Get-Location
    }
    if ($ScriptDir) {
        Set-Location -LiteralPath $ScriptDir
    }

    # Ensure the script is running with Administrator privileges
    $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

    if (-not $isAdmin) {
        Write-Host "Requesting Administrator privileges via UAC..." -ForegroundColor Yellow
        $skipPause = $true
        $scriptPath = $PSCommandPath
        if (-not $scriptPath) {
            $scriptPath = Join-Path (Get-Location) "clean_slate.ps1"
        }
        Start-Process powershell -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`"" -Verb RunAs -ErrorAction Stop
        exit 0
    }

    $LogFile = Join-Path $ScriptDir "clean_slate_execution.log"
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
    Write-Log "🏫 School Management System — Clean Slate Utility" -ForegroundColor Cyan
    Write-Log "==================================================`n" -ForegroundColor Cyan

    Write-Log "⚠️  This will:" -ForegroundColor DarkYellow
    Write-Log "    1. Download a safety backup of the current database" -ForegroundColor DarkYellow
    Write-Log "    2. Stop all running containers" -ForegroundColor DarkYellow
    Write-Log "    3. Wipe the database" -ForegroundColor DarkYellow
    Write-Log "    4. Restart with a clean state`n" -ForegroundColor DarkYellow

    $proceed = Read-Host "Proceed with clean slate? (y/N)"
    if ($proceed -notmatch "^[Yy]$") {
        Write-Log "`nOperation cancelled by user." -ForegroundColor Yellow
        exit 0
    }
    Write-Log ""

    # Step 1: Check if docker is available
    Write-Log "🐳 Checking Docker status..." -ForegroundColor Yellow
    try {
        $prevEA = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        $dockerStatus = docker info 2>&1
        $ErrorActionPreference = $prevEA
        if ($LASTEXITCODE -ne 0 -or $dockerStatus -match "error during connect") {
            throw "Docker daemon is not running. Please start Docker Desktop and try again."
        }
        Write-Log "   ✅ Docker is running.`n" -ForegroundColor Green
    } catch {
        throw "Docker is not running or accessible. Error details: $_"
    }

    # Step 1b: Auto-backup before wiping
    Write-Log "💾 Step 1/4 — Attempting automatic safety backup..." -ForegroundColor Yellow
    $ApiUrl = if ($env:NEXT_PUBLIC_API_URL) { $env:NEXT_PUBLIC_API_URL } else { "http://localhost:4000" }
    $BackupSaved = $false

    # Try pg_dump via docker exec if DB container is running
    $dbContainer = docker ps --format "{{.Names}}" 2>&1 | Where-Object { $_ -match "school_db|antigravity_db" } | Select-Object -First 1
    if ($dbContainer) {
        Write-Log "   🐘 Database container found: $dbContainer" -ForegroundColor Gray
        $BackupsDir = Join-Path $ScriptDir "school_data\backups"
        if (-not (Test-Path $BackupsDir)) { New-Item -ItemType Directory -Path $BackupsDir -Force | Out-Null }
        $Timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
        $SqlBackupPath = Join-Path $BackupsDir "pre_clean_slate_${Timestamp}.sql"
        try {
            Write-Log "   📦 Exporting database via pg_dump..." -ForegroundColor Gray
            docker exec $dbContainer pg_dump -U postgres school_management --data-only --inserts 2>&1 | Out-File -FilePath $SqlBackupPath -Encoding utf8
            if ($LASTEXITCODE -eq 0) {
                Write-Log "   ✅ Safety backup saved: pre_clean_slate_${Timestamp}.sql" -ForegroundColor Green
                $BackupSaved = $true
            } else {
                Write-Log "   ⚠️  pg_dump failed — continuing without automatic backup" -ForegroundColor DarkYellow
                Remove-Item $SqlBackupPath -ErrorAction SilentlyContinue
            }
        } catch {
            Write-Log "   ⚠️  Backup error: $_" -ForegroundColor DarkYellow
        }
    } else {
        Write-Log "   ℹ️  No running database container found — skipping automatic backup" -ForegroundColor Gray
    }

    if (-not $BackupSaved) {
        Write-Log "   ⚠️  No automatic backup was created." -ForegroundColor DarkYellow
        $continueAnyway = Read-Host "   Continue without a backup? (y/N)"
        if ($continueAnyway -notmatch "^[Yy]$") {
            Write-Log "   Operation cancelled. Create a manual backup via Admin Panel first." -ForegroundColor Yellow
            exit 0
        }
    }
    Write-Log ""

    # Step 2: Stop containers and clear network/volume locks
    Write-Log "⏹  Step 2/4 — Stopping Docker containers and clearing mappings..." -ForegroundColor Yellow
    try {
        $prevEA = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        docker compose down --volumes --remove-orphans 2>&1 | Tee-Object -FilePath $LogFile -Append
        $execCode = $LASTEXITCODE
        $ErrorActionPreference = $prevEA
        if ($execCode -ne 0) {
            throw "Failed to stop Docker containers."
        }
        # Give Windows kernel time to fully unlock lingering named file handles
        Start-Sleep -Seconds 3
    } catch {
        throw "Error stopping containers: $_"
    }
    Write-Log ""

    # Step 3: Wipe school_data directory contents
    Write-Log "🗑  Wiping school_data/ directory..." -ForegroundColor Yellow
    $SchoolDataDir = Join-Path $ScriptDir "school_data"
    if (Test-Path $SchoolDataDir) {
        $DbDir = Join-Path $SchoolDataDir "db"
        if (Test-Path $DbDir) {
            try {
                Remove-Item -Path $DbDir -Recurse -Force -ErrorAction Stop
                Write-Log "   → Postgres data directory cleared." -ForegroundColor Green
            } catch {
                Write-Log "   ⚠️  Could not fully delete db directory. Files might be locked. Details: $_" -ForegroundColor DarkYellow
            }
        } else {
            Write-Log "   → Postgres data directory already clean." -ForegroundColor DarkGray
        }
        Write-Log ""
        
        $wipeBackups = Read-Host "   Also wipe school_data/backups/? (y/N)"
        if ($wipeBackups -match "^[Yy]$") {
            $BackupsDir = Join-Path $SchoolDataDir "backups"
            if (Test-Path $BackupsDir) {
                try {
                    Get-ChildItem -Path $BackupsDir -Filter "*.json" | Remove-Item -Force -ErrorAction Stop
                    Write-Log "   → Backups directory cleared." -ForegroundColor Green
                } catch {
                    Write-Log "   ⚠️  Could not clear backups: $_" -ForegroundColor DarkYellow
                }
            }
        }
    } else {
        Write-Log "   → school_data directory does not exist yet. Skipping wipe." -ForegroundColor DarkGray
    }
    Write-Log ""

    # Step 4: Optional backup import
    $BackupFile = ""
    $importBackup = Read-Host "📦 Import a backup file before starting? (y/N)"
    if ($importBackup -match "^[Yy]$") {
        $BackupFile = Read-Host "   Enter full path to .json backup file"
        $BackupFile = $BackupFile.Trim('"').Trim("'")
        if (-not (Test-Path $BackupFile -PathType Leaf)) {
            Write-Log "   ❌ File not found: $BackupFile" -ForegroundColor Red
            Write-Log "   Continuing without backup import." -ForegroundColor DarkYellow
            $BackupFile = ""
        } else {
            Write-Log "   ✅ Backup file found: $BackupFile" -ForegroundColor Green
        }
    }
    Write-Log ""

    # Step 5: Restart containers
    Write-Log "🚀 Starting Docker containers..." -ForegroundColor Yellow
    $prevEA = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    docker compose up -d 2>&1 | Tee-Object -FilePath $LogFile -Append
    $execCode = $LASTEXITCODE
    $ErrorActionPreference = $prevEA
    if ($execCode -ne 0) {
        throw "Failed to start Docker containers with 'docker compose up -d'."
    }
    Write-Log ""

    # Step 6: Wait for backend to be ready
    Write-Log "⏳ Waiting for backend to start (up to 60s)..." -ForegroundColor Yellow
    $ApiUrl = "http://localhost:4000"
    if ($env:NEXT_PUBLIC_API_URL) {
        $ApiUrl = $env:NEXT_PUBLIC_API_URL
    }

    $backendReady = $false
    for ($i = 1; $i -le 60; $i++) {
        try {
            $response = Invoke-WebRequest -Uri "$ApiUrl/api/setup/status" -UseBasicParsing -TimeoutSec 2 -ErrorAction SilentlyContinue
            if ($response -and $response.StatusCode -eq 200) {
                Write-Log "   ✅ Backend is ready." -ForegroundColor Green
                $backendReady = $true
                break
            }
        } catch {
            # Silently wait
        }
        Start-Sleep -Seconds 1
        if ($i -eq 60) {
            Write-Log "   ⚠️  Backend did not respond in time. Check logs via 'docker compose logs backend'." -ForegroundColor DarkYellow
        }
    }
    Write-Log ""

    # Step 7: Restore backup via API if requested
    if ($BackupFile -ne "" -and $backendReady) {
        Write-Log "📥 Restoring backup via API..." -ForegroundColor Yellow
        $TargetBackupsDir = Join-Path $SchoolDataDir "backups"
        if (-not (Test-Path $TargetBackupsDir)) {
            New-Item -ItemType Directory -Path $TargetBackupsDir -Force | Out-Null
        }
        Copy-Item -Path $BackupFile -Destination (Join-Path $TargetBackupsDir (Split-Path $BackupFile -Leaf)) -Force
        
        $backupContent = Get-Content -Path $BackupFile -Raw
        $payloadString = "{`"confirm`":`"RESTORE`",`"data`":$backupContent}"
        
        try {
            $restoreResponse = Invoke-WebRequest -Uri "$ApiUrl/api/backup/restore" -Method Post -Body $payloadString -ContentType "application/json" -UseBasicParsing
            $responseContent = $restoreResponse.Content
            if ($responseContent -match "`"success`":true") {
                Write-Log "   ✅ Backup restored successfully." -ForegroundColor Green
            } else {
                Write-Log "   ⚠️  Restore via API returned: $responseContent" -ForegroundColor DarkYellow
                Write-Log "   You can restore manually via the Admin Panel → System-Sicherung." -ForegroundColor DarkYellow
            }
        } catch {
            Write-Log "   ⚠️  Restore failed. Server response: $_" -ForegroundColor DarkYellow
            if ($_.ErrorDetails) {
                Write-Log "   Details: $($_.ErrorDetails.Message)" -ForegroundColor DarkYellow
            }
            Write-Log "   You can restore manually via the Admin Panel → System-Sicherung." -ForegroundColor DarkYellow
        }
        Write-Log ""
    }

    Write-Log "✅ Clean slate complete. Frontend available at: http://localhost:3000" -ForegroundColor Green

} catch {
    Write-Host "`n❌ An error occurred during execution:" -ForegroundColor Red
    Write-Host "$_" -ForegroundColor DarkRed
    if (Get-Command Write-Log -ErrorAction SilentlyContinue) {
        Write-Log "`n❌ An error occurred during execution: $_" -ForegroundColor Red
        if ($_.ScriptStackTrace) {
            Add-Content -Path $LogFile -Value "`n--- Stack Trace ---`n$($_.ScriptStackTrace)" -Encoding utf8
        }
        Write-Host "Detailed logs have been saved to: $LogFile" -ForegroundColor Yellow
    }
} finally {
    if (-not $skipPause) {
        Write-Host "`nPress Enter to exit..." -ForegroundColor Cyan
        Read-Host
    }
}
