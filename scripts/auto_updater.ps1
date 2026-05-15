# ============================================================
# 🤖 Antigravity Windows Automated Updater
# Designed for Task Scheduler
# ============================================================

$installPath = "$PSScriptRoot\.."
$logFile = "$installPath\school_data\logs\auto_update.log"
$backupDir = "$installPath\school_data\backups\auto_updates"

if (!(Test-Path (Split-Path $logFile))) { New-Item -ItemType Directory -Path (Split-Path $logFile) -Force | Out-Null }
if (!(Test-Path $backupDir)) { New-Item -ItemType Directory -Path $backupDir -Force | Out-Null }

function Write-Log($text) {
    $msg = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $text"
    Write-Host $msg
    $msg | Out-File -FilePath $logFile -Append
}

Set-Location $installPath

# 1. Check for updates
Write-Log "Checking for updates..."
git fetch origin main | Out-Null
$local = git rev-parse HEAD
$remote = git rev-parse origin/main

if ($local -eq $remote) {
    Write-Log "System is up to date. No action needed."
    exit
}

Write-Log "Update found! Starting safe upgrade process..."

# 2. Create Safety Backup
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupPath = "$backupDir\backup_before_update_$timestamp"
Write-Log "Creating safety backup at $backupPath..."

New-Item -ItemType Directory -Path $backupPath -Force | Out-Null

# Backup DB
docker exec antigravity_db pg_dump -U postgres school_management > "$backupPath\db_dump.sql" 2>$null

# Backup Files
Copy-Item -Path "$installPath\school_data" -Destination "$backupPath\school_data_files" -Recurse -Force

Write-Log "Backup complete."

# 3. Pull Changes
Write-Log "Pulling latest changes from GitHub..."
git pull origin main 2>&1 | Out-File -FilePath $logFile -Append

# 4. Rebuild & Restart
Write-Log "Rebuilding containers..."
docker compose build 2>&1 | Out-File -FilePath $logFile -Append

Write-Log "Restarting system..."
docker compose up -d 2>&1 | Out-File -FilePath $logFile -Append

Write-Log "🎉 SUCCESS: System updated to version $remote"
Write-Log "------------------------------------------------------------"
