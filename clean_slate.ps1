# clean_slate.ps1 — Reset the school management system to a clean state
# Usage: .\clean_slate.ps1

# Ensure the script is running with Administrator privileges
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "Requesting Administrator privileges..." -ForegroundColor Yellow
    try {
        Start-Process powershell -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`"" -Verb RunAs -ErrorAction Stop
    } catch {
        Write-Host "Administrator privileges are required to run this script." -ForegroundColor Red
        Start-Sleep -Seconds 3
    }
    exit 0
}

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $ScriptDir

try {
    Clear-Host
    Write-Host "==================================================" -ForegroundColor Cyan
    Write-Host "🏫 School Management System — Clean Slate Utility" -ForegroundColor Cyan
    Write-Host "==================================================`n" -ForegroundColor Cyan

    Write-Host "⚠️  WARNING: This will stop running containers and completely clear the database." -ForegroundColor DarkYellow
    $proceed = Read-Host "Proceed with clean slate? (y/N)"
    if ($proceed -notmatch "^[Yy]$") {
        Write-Host "`nOperation cancelled by user." -ForegroundColor Yellow
        exit 0
    }
    Write-Host ""

    # Step 1: Check if docker is available
    Write-Host "🐳 Checking Docker status..." -ForegroundColor Yellow
    try {
        $dockerStatus = docker info 2>&1
        if ($LASTEXITCODE -ne 0 -or $dockerStatus -match "error during connect") {
            throw "Docker daemon is not running. Please start Docker Desktop and try again."
        }
        Write-Host "   ✅ Docker is running.`n" -ForegroundColor Green
    } catch {
        throw "Docker is not running or accessible. Error details: $_"
    }

    # Step 2: Stop containers
    Write-Host "⏹  Stopping Docker containers..." -ForegroundColor Yellow
    try {
        docker compose down
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to stop Docker containers."
        }
    } catch {
        throw "Error stopping containers: $_"
    }
    Write-Host ""

    # Step 3: Wipe school_data directory contents
    Write-Host "🗑  Wiping school_data/ directory..." -ForegroundColor Yellow
    $SchoolDataDir = Join-Path $ScriptDir "school_data"
    if (Test-Path $SchoolDataDir) {
        $DbDir = Join-Path $SchoolDataDir "db"
        if (Test-Path $DbDir) {
            try {
                Remove-Item -Path $DbDir -Recurse -Force -ErrorAction Stop
                Write-Host "   → Postgres data directory cleared." -ForegroundColor Green
            } catch {
                Write-Host "   ⚠️  Could not fully delete db directory. Files might be locked. Details: $_" -ForegroundColor DarkYellow
            }
        } else {
            Write-Host "   → Postgres data directory already clean." -ForegroundColor DarkGray
        }
        Write-Host ""
        
        $wipeBackups = Read-Host "   Also wipe school_data/backups/? (y/N)"
        if ($wipeBackups -match "^[Yy]$") {
            $BackupsDir = Join-Path $SchoolDataDir "backups"
            if (Test-Path $BackupsDir) {
                try {
                    Get-ChildItem -Path $BackupsDir -Filter "*.json" | Remove-Item -Force -ErrorAction Stop
                    Write-Host "   → Backups directory cleared." -ForegroundColor Green
                } catch {
                    Write-Host "   ⚠️  Could not clear backups: $_" -ForegroundColor DarkYellow
                }
            }
        }
    } else {
        Write-Host "   → school_data directory does not exist yet. Skipping wipe." -ForegroundColor DarkGray
    }
    Write-Host ""

    # Step 4: Optional backup import
    $BackupFile = ""
    $importBackup = Read-Host "📦 Import a backup file before starting? (y/N)"
    if ($importBackup -match "^[Yy]$") {
        $BackupFile = Read-Host "   Enter full path to .json backup file"
        $BackupFile = $BackupFile.Trim('"').Trim("'")
        if (-not (Test-Path $BackupFile -PathType Leaf)) {
            Write-Host "   ❌ File not found: $BackupFile" -ForegroundColor Red
            Write-Host "   Continuing without backup import." -ForegroundColor DarkYellow
            $BackupFile = ""
        } else {
            Write-Host "   ✅ Backup file found: $BackupFile" -ForegroundColor Green
        }
    }
    Write-Host ""

    # Step 5: Restart containers
    Write-Host "🚀 Starting Docker containers..." -ForegroundColor Yellow
    docker compose up -d
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to start Docker containers with 'docker compose up -d'."
    }
    Write-Host ""

    # Step 6: Wait for backend to be ready
    Write-Host "⏳ Waiting for backend to start (up to 30s)..." -ForegroundColor Yellow
    $ApiUrl = "http://localhost:4000"
    if ($env:NEXT_PUBLIC_API_URL) {
        $ApiUrl = $env:NEXT_PUBLIC_API_URL
    }

    $backendReady = $false
    for ($i = 1; $i -le 30; $i++) {
        try {
            $response = Invoke-WebRequest -Uri "$ApiUrl/api/setup/status" -UseBasicParsing -TimeoutSec 2 -ErrorAction SilentlyContinue
            if ($response.StatusCode -eq 200) {
                Write-Host "   ✅ Backend is ready." -ForegroundColor Green
                $backendReady = $true
                break
            }
        } catch {
            # Silently wait
        }
        Start-Sleep -Seconds 1
        if ($i -eq 30) {
            Write-Host "   ⚠️  Backend did not respond in time. Check logs via 'docker compose logs backend'." -ForegroundColor DarkYellow
        }
    }
    Write-Host ""

    # Step 7: Restore backup via API if requested
    if ($BackupFile -ne "" -and $backendReady) {
        Write-Host "📥 Restoring backup via API..." -ForegroundColor Yellow
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
                Write-Host "   ✅ Backup restored successfully." -ForegroundColor Green
            } else {
                Write-Host "   ⚠️  Restore via API returned: $responseContent" -ForegroundColor DarkYellow
                Write-Host "   You can restore manually via the Admin Panel → System-Sicherung." -ForegroundColor DarkYellow
            }
        } catch {
            Write-Host "   ⚠️  Restore failed. Server response: $_" -ForegroundColor DarkYellow
            if ($_.ErrorDetails) {
                Write-Host "   Details: $($_.ErrorDetails.Message)" -ForegroundColor DarkYellow
            }
            Write-Host "   You can restore manually via the Admin Panel → System-Sicherung." -ForegroundColor DarkYellow
        }
        Write-Host ""
    }

    Write-Host "✅ Clean slate complete. Frontend available at: http://localhost:3000" -ForegroundColor Green

} catch {
    Write-Host "`n❌ An error occurred during execution:" -ForegroundColor Red
    Write-Host $_ -ForegroundColor DarkRed
} finally {
    Write-Host "`nPress Enter to exit..." -ForegroundColor Cyan
    Read-Host
}
