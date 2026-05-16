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

rollback_update() {
    local reason="$1"
    log "❌ Update failed: $reason"
    log "Initiating automatic rollback..."

    if [ -n "$PRE_UPDATE_COMMIT" ]; then
        git reset --hard "$PRE_UPDATE_COMMIT" >> "$LOG_FILE" 2>&1 || log "Rollback warning: git reset failed."
    fi

    if [ -f "$BACKUP_PATH/db_dump.sql" ] && command -v docker &>/dev/null; then
        docker exec -i antigravity_db psql -U postgres school_management < "$BACKUP_PATH/db_dump.sql" >> "$LOG_FILE" 2>&1 \
          || log "Rollback warning: DB restore failed."
    fi

    if [ -d "$BACKUP_PATH/school_data_files" ]; then
        rm -rf "$INSTALL_PATH/school_data"
        cp -a "$BACKUP_PATH/school_data_files" "$INSTALL_PATH/school_data" \
          || log "Rollback warning: school_data restore failed."
    fi

    if command -v docker &>/dev/null; then
        docker compose build >> "$LOG_FILE" 2>&1 || log "Rollback warning: docker compose build failed."
        docker compose up -d >> "$LOG_FILE" 2>&1 || log "Rollback warning: docker compose up failed."
    fi

    log "Rollback process finished."
    exit 1
}

cd "$INSTALL_PATH"
git config core.filemode false

# 0. Check for Manual Trigger from Admin Panel

TRIGGER_FILE="$INSTALL_PATH/school_data/UPDATE_PENDING"
if [ -f "$TRIGGER_FILE" ]; then
    log "Manual update triggered from Admin Panel!"
    rm "$TRIGGER_FILE"
    FORCE_UPDATE=true
fi

# 1. Check for updates
log "Checking for updates..."

git fetch origin main &>/dev/null
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)
PRE_UPDATE_COMMIT="$LOCAL"

if [ "$LOCAL" == "$REMOTE" ] && [ "$FORCE_UPDATE" != "true" ]; then
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
git config core.filemode false
if ! git pull origin main >> "$LOG_FILE" 2>&1; then
    rollback_update "git pull failed"
fi

# 4. Rebuild & Restart
if command -v docker &> /dev/null; then
    log "Rebuilding containers..."
    if ! docker compose build >> "$LOG_FILE" 2>&1; then
        rollback_update "docker compose build failed"
    fi
    log "Restarting system..."
    if ! docker compose up -d >> "$LOG_FILE" 2>&1; then
        rollback_update "docker compose up failed"
    fi
else
    # Termux or Native path
    log "Native installation detected. Updating via Android script..."
    if ! ./scripts/update_android.sh --unattended >> "$LOG_FILE" 2>&1; then
        rollback_update "native update script failed"
    fi
fi

log "🎉 SUCCESS: System updated to version $REMOTE"
log "------------------------------------------------------------"
