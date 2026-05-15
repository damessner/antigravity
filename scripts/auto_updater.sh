#!/bin/bash
# ============================================================
# 🤖 Antigravity Automated Unattended Updater
# Designed for Cron / Scheduled Tasks
# ============================================================

# Configuration
INSTALL_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_FILE="$INSTALL_PATH/school_data/logs/auto_update.log"
BACKUP_DIR="$INSTALL_PATH/school_data/backups/auto_updates"

mkdir -p "$(dirname "$LOG_FILE")"
mkdir -p "$BACKUP_DIR"

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

cd "$INSTALL_PATH"

# 1. Check for updates
log "Checking for updates..."
git fetch origin main &>/dev/null
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

if [ "$LOCAL" == "$REMOTE" ]; then
    log "System is up to date. No action needed."
    exit 0
fi

log "Update found! Starting safe upgrade process..."

# 2. Create Safety Backup
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_PATH="$BACKUP_DIR/backup_before_update_$TIMESTAMP"
log "Creating safety backup at $BACKUP_PATH..."

mkdir -p "$BACKUP_PATH"
# Backup DB
if command -v docker &> /dev/null; then
    docker exec antigravity_db pg_dump -U postgres school_management > "$BACKUP_PATH/db_dump.sql" 2>/dev/null
fi
# Backup Files
cp -r "$INSTALL_PATH/school_data" "$BACKUP_PATH/school_data_files" &>/dev/null

log "Backup complete."

# 3. Pull Changes
log "Pulling latest changes from GitHub..."
git pull origin main >> "$LOG_FILE" 2>&1

# 4. Rebuild & Restart
if command -v docker &> /dev/null; then
    log "Rebuilding containers..."
    docker compose build >> "$LOG_FILE" 2>&1
    log "Restarting system..."
    docker compose up -d >> "$LOG_FILE" 2>&1
else
    # Termux or Native path
    log "Native installation detected. Updating via Android script..."
    ./scripts/update_android.sh --unattended >> "$LOG_FILE" 2>&1
fi

log "🎉 SUCCESS: System updated to version $REMOTE"
log "------------------------------------------------------------"
