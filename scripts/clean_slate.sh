#!/bin/bash
# clean_slate.sh — Reset the school management system to a clean state
# Usage: ./clean_slate.sh
# A backup is automatically downloaded before any data is wiped.

cleanup_and_exit() {
  local exit_code=$?
  echo ""
  if [ $exit_code -ne 0 ]; then
    echo "❌ An error occurred during execution (exit code: $exit_code)."
    echo "Please check the logs above for details."
  fi
  echo ""
  read -p "Press Enter to exit..."
  exit $exit_code
}

trap cleanup_and_exit EXIT

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Root check for Linux
if [[ "$OSTYPE" == "linux-gnu"* ]] && [ "$EUID" -ne 0 ]; then
  echo "This script might need root privileges for Docker operations."
  echo "Consider running with: sudo ./clean_slate.sh"
  echo ""
fi

clear
echo "=================================================="
echo "🏫 School Management System — Clean Slate Utility"
echo "=================================================="
echo ""
echo "⚠️  This will:"
echo "    1. Download a safety backup of the current database"
echo "    2. Stop all running containers"
echo "    3. Wipe the database"
echo "    4. Restart with a clean state"
echo ""

read -p "⚠️  WARNING: Proceed? (y/N): " confirm_proceed
if [[ ! "$confirm_proceed" =~ ^[Yy]$ ]]; then
  echo ""
  echo "Operation cancelled by user."
  exit 0
fi
echo ""

# Step 1: Check Docker status
echo "🐳 Checking Docker status..."
if ! docker info >/dev/null 2>&1; then
  echo "❌ Docker daemon is not running or accessible."
  echo "Please start Docker Desktop and try again."
  exit 1
else
  echo "   ✅ Docker is running."
fi
echo ""

# Step 2: Auto-backup before wiping
API_URL="${NEXT_PUBLIC_API_URL:-http://localhost:4000}"
BACKUP_SAVED=""

echo "💾 Step 1/4 — Attempting automatic safety backup..."
# Check if backend is running and reachable
if curl -sf "$API_URL/api/setup/status" > /dev/null 2>&1; then
  # We need a token — check if there's a cached admin session
  # Since we can't auto-login here, download via the backup API using admin credentials if passed
  echo "   ℹ️  Backend is running. Downloading backup via API..."
  
  mkdir -p "$SCRIPT_DIR/school_data/backups"
  TIMESTAMP=$(date +%Y-%m-%d_%H-%M-%S)
  BACKUP_PATH="$SCRIPT_DIR/school_data/backups/pre_clean_slate_${TIMESTAMP}.json"
  
  # Try to download using stored credentials (admin token not available in shell)
  # Fall back to pg_dump-style direct backup via docker exec if possible
  DB_CONTAINER=$(docker ps --format '{{.Names}}' 2>/dev/null | grep -E 'school_db|antigravity_db' | head -1)
  if [ -n "$DB_CONTAINER" ]; then
    echo "   🐘 Database container found: $DB_CONTAINER"
    echo "   📦 Exporting database schema + data via pg_dump..."
    docker exec "$DB_CONTAINER" pg_dump -U postgres school_management --data-only --inserts 2>/dev/null > "$BACKUP_PATH.sql" && \
      echo "   ✅ SQL backup saved: pre_clean_slate_${TIMESTAMP}.sql" && \
      BACKUP_SAVED="$BACKUP_PATH.sql" || \
      echo "   ⚠️  pg_dump failed — continuing without automatic backup"
  else
    echo "   ⚠️  No running database container found — skipping automatic backup"
  fi
else
  echo "   ℹ️  Backend not reachable (may already be stopped) — skipping automatic backup"
fi

if [ -n "$BACKUP_SAVED" ]; then
  echo "   ✅ Safety backup saved to: $BACKUP_SAVED"
else
  echo "   ⚠️  No automatic backup was created."
  echo ""
  read -p "   Continue without a backup? (y/N): " continue_no_backup
  if [[ ! "$continue_no_backup" =~ ^[Yy]$ ]]; then
    echo "   Operation cancelled. Please create a manual backup first via the Admin Panel."
    exit 0
  fi
fi
echo ""

# Step 3: Stop containers and clear network/volume locks
echo "⏹  Step 2/4 — Stopping Docker containers and clearing mappings..."
docker compose down --volumes --remove-orphans
sleep 3
echo ""

# Step 4: Wipe school_data directory contents
echo "🗑  Step 3/4 — Wiping school_data/ directory..."
if [ -d "$SCRIPT_DIR/school_data" ]; then
  if [ -d "$SCRIPT_DIR/school_data/db" ]; then
    rm -rf "$SCRIPT_DIR/school_data/db"
    echo "   → Postgres data directory cleared."
  else
    echo "   → Postgres data directory already clean."
  fi
  echo ""
  
  read -p "   Also wipe school_data/backups/? (y/N): " wipe_backups
  if [[ "$wipe_backups" =~ ^[Yy]$ ]]; then
    rm -f "$SCRIPT_DIR/school_data/backups/"*.json
    rm -f "$SCRIPT_DIR/school_data/backups/"*.sql 2>/dev/null || true
    echo "   → Backups directory cleared."
  fi
else
  echo "   → school_data directory does not exist yet. Skipping wipe."
fi
echo ""

# Step 5: Optional backup import
BACKUP_FILE=""
read -p "📦 Import a backup file before starting? (y/N): " import_backup
if [[ "$import_backup" =~ ^[Yy]$ ]]; then
  read -p "   Enter full path to .json backup file: " BACKUP_FILE
  BACKUP_FILE="${BACKUP_FILE%\"}"
  BACKUP_FILE="${BACKUP_FILE#\"}"
  BACKUP_FILE="${BACKUP_FILE%\'}"
  BACKUP_FILE="${BACKUP_FILE#\'}"
  
  if [ ! -f "$BACKUP_FILE" ]; then
    echo "   ❌ File not found: $BACKUP_FILE"
    echo "   Continuing without backup import."
    BACKUP_FILE=""
  else
    echo "   ✅ Backup file found: $BACKUP_FILE"
  fi
fi
echo ""

# Step 6: Restart containers
echo "🚀 Step 4/4 — Starting Docker containers..."
docker compose up -d
echo ""

# Wait for backend to be ready
echo "⏳ Waiting for backend to start (up to 30s)..."
backend_ready=false
for i in $(seq 1 30); do
  if curl -sf "$API_URL/api/setup/status" > /dev/null 2>&1; then
    echo "   ✅ Backend is ready."
    backend_ready=true
    break
  fi
  sleep 1
  if [ "$i" -eq 30 ]; then
    echo "   ⚠️  Backend did not respond in time. Check logs via 'docker compose logs backend'."
  fi
done
echo ""

# Step 7: If a backup was selected, restore it via the API
if [ -n "$BACKUP_FILE" ] && [ "$backend_ready" = true ]; then
  echo "📥 Restoring backup via API..."
  mkdir -p "$SCRIPT_DIR/school_data/backups"
  cp "$BACKUP_FILE" "$SCRIPT_DIR/school_data/backups/$(basename "$BACKUP_FILE")"

  RESTORE_TMP="$SCRIPT_DIR/restore_payload_tmp.json"
  printf '{"confirm":"RESTORE","data":%s}' "$(cat "$BACKUP_FILE")" > "$RESTORE_TMP"
  
  set +e
  RESPONSE=$(curl -sf -X POST "$API_URL/api/backup/restore" \
    -H "Content-Type: application/json" \
    --data-binary "@$RESTORE_TMP" 2>&1)
  RESTORE_STATUS=$?
  set -e
  
  rm -f "$RESTORE_TMP"

  if [ $RESTORE_STATUS -eq 0 ] && echo "$RESPONSE" | grep -q '"success":true'; then
    echo "   ✅ Backup restored successfully."
  else
    echo "   ⚠️  Restore via API returned: $RESPONSE"
    echo "   You can restore manually via the Admin Panel → System-Sicherung."
  fi
  echo ""
fi

echo "✅ Clean slate complete. Frontend available at: http://localhost:3000"

