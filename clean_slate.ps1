# clean_slate.ps1 — Reset the school management system to a clean state
# Usage: .\clean_slate.ps1

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $ScriptDir

Write-Host "🏫 School Management System — Clean Slate Utility" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Stop containers
Write-Host "⏹  Stopping Docker containers..." -ForegroundColor Yellow
docker compose down
Write-Host ""

# Step 2: Wipe school_data directory contents
Write-Host "🗑  Wiping school_data/ directory..." -ForegroundColor Yellow
$SchoolDataDir = Join-Path $ScriptDir "school_data"
if (Test-Path $SchoolDataDir) {
    $DbDir = Join-Path $SchoolDataDir "db"
    if (Test-Path $DbDir) {
        Remove-Item -Path $DbDir -Recurse -Force -ErrorAction SilentlyContinue
    }
    Write-Host "   → Postgres data directory cleared." -ForegroundColor Green
    Write-Host ""
    
    $wipeBackups = Read-Host "   Also wipe school_data/backups/? (y/N)"
    if ($wipeBackups -match "^[Yy]$") {
        $BackupsDir = Join-Path $SchoolDataDir "backups"
        if (Test-Path $BackupsDir) {
            Get-ChildItem -Path $BackupsDir -Filter "*.json" | Remove-Item -Force
            Write-Host "   → Backups directory cleared." -ForegroundColor Green
        }
    }
}
Write-Host ""

# Step 3: Optional backup import
$BackupFile = ""
$importBackup = Read-Host "📦 Import a backup file before starting? (y/N)"
if ($importBackup -match "^[Yy]$") {
    $BackupFile = Read-Host "   Enter full path to .json backup file"
    # Remove surrounding quotes if user dragged and dropped the file into the console
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

# Step 4: Restart containers
Write-Host "🚀 Starting Docker containers..." -ForegroundColor Yellow
docker compose up -d
Write-Host ""

# Wait for backend to be ready
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
        # Catch connection refused or timeout errors silently
    }
    Start-Sleep -Seconds 1
    if ($i -eq 30) {
        Write-Host "   ⚠️  Backend did not respond in time. You may need to restore manually." -ForegroundColor DarkYellow
    }
}
Write-Host ""

# Step 5: If a backup was selected, restore it via the API
if ($BackupFile -ne "" -and $backendReady) {
    Write-Host "📥 Restoring backup via API..." -ForegroundColor Yellow
    $TargetBackupsDir = Join-Path $SchoolDataDir "backups"
    if (-not (Test-Path $TargetBackupsDir)) {
        New-Item -ItemType Directory -Path $TargetBackupsDir -Force | Out-Null
    }
    Copy-Item -Path $BackupFile -Destination (Join-Path $TargetBackupsDir (Split-Path $BackupFile -Leaf)) -Force
    
    # Read backup data
    $backupContent = Get-Content -Path $BackupFile -Raw
    # Construct JSON payload string directly to preserve structure
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
        Write-Host "   ⚠️  Restore failed: $_" -ForegroundColor DarkYellow
        Write-Host "   You can restore manually via the Admin Panel → System-Sicherung." -ForegroundColor DarkYellow
    }
    Write-Host ""
}

Write-Host "✅ Clean slate complete. Frontend: http://localhost:3000" -ForegroundColor Green
