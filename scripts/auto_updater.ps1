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

function Invoke-Rollback($reason) {
    Write-Log "❌ Update failed: $reason"
    Write-Log "Initiating automatic rollback..."

    if ($script:preUpdateCommit) {
        git reset --hard $script:preUpdateCommit 2>&1 | Out-File -FilePath $logFile -Append
    }

    if (Test-Path "$script:backupPath\db_dump.sql") {
        docker exec -i antigravity_db psql -U postgres school_management < "$script:backupPath\db_dump.sql" 2>&1 | Out-File -FilePath $logFile -Append
    }

    if (Test-Path "$script:backupPath\school_data_files") {
        if (Test-Path "$installPath\school_data") { Remove-Item -Path "$installPath\school_data" -Recurse -Force -ErrorAction SilentlyContinue }
        Copy-Item -Path "$script:backupPath\school_data_files" -Destination "$installPath\school_data" -Recurse -Force
    }

    docker compose build 2>&1 | Out-File -FilePath $logFile -Append
    docker compose up -d 2>&1 | Out-File -FilePath $logFile -Append

    Write-Log "Rollback process finished."
    exit 1
}

Set-Location $installPath

# 1. Check for updates
Write-Log "Checking for updates..."
git fetch origin main | Out-Null
$local = git rev-parse HEAD
$remote = git rev-parse origin/main
$script:preUpdateCommit = $local

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
try {
    git pull origin main 2>&1 | Out-File -FilePath $logFile -Append
    if ($LASTEXITCODE -ne 0) { throw "git pull failed" }
} catch {
    Invoke-Rollback "git pull failed"
}

# 4. Rebuild & Restart
Write-Log "Rebuilding containers..."
try {
    docker compose build 2>&1 | Out-File -FilePath $logFile -Append
    if ($LASTEXITCODE -ne 0) { throw "docker compose build failed" }
} catch {
    Invoke-Rollback "docker compose build failed"
}

Write-Log "Restarting system..."
try {
    docker compose up -d 2>&1 | Out-File -FilePath $logFile -Append
    if ($LASTEXITCODE -ne 0) { throw "docker compose up failed" }
} catch {
    Invoke-Rollback "docker compose up failed"
}

Write-Log "🎉 SUCCESS: System updated to version $remote"
Write-Log "------------------------------------------------------------"
