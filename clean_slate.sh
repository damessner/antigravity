#!/bin/bash
# clean_slate.sh — Reset the school management system to a clean state
# Usage: ./clean_slate.sh

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

clear
echo "=================================================="
echo "🏫 School Management System — Clean Slate Utility"
echo "=================================================="
echo ""

read -p "⚠️  WARNING: This will stop running containers and completely clear the database. Proceed? (y/N): " confirm_proceed
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

# Step 2: Stop containers
echo "⏹  Stopping Docker containers..."
docker compose down
echo ""

# Step 3: Wipe school_data directory contents
echo "🗑  Wiping school_data/ directory..."
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
    echo "   → Backups directory cleared."
  fi
else
  echo "   → school_data directory does not exist yet. Skipping wipe."
fi
echo ""

# Step 4: Optional backup import
BACKUP_FILE=""
read -p "📦 Import a backup file before starting? (y/N): " import_backup
if [[ "$import_backup" =~ ^[Yy]$ ]]; then
  read -p "   Enter full path to .json backup file: " BACKUP_FILE
  # Strip quotes if dragged and dropped
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

# Step 5: Restart containers
echo "🚀 Starting Docker containers..."
docker compose up -d
echo ""

# Wait for backend to be ready
echo "⏳ Waiting for backend to start (up to 30s)..."
API_URL="${NEXT_PUBLIC_API_URL:-http://localhost:4000}"
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

# Step 6: If a backup was selected, restore it via the API
if [ -n "$BACKUP_FILE" ] && [ "$backend_ready" = true ]; then
  echo "📥 Restoring backup via API..."
  mkdir -p "$SCRIPT_DIR/school_data/backups"
  cp "$BACKUP_FILE" "$SCRIPT_DIR/school_data/backups/$(basename "$BACKUP_FILE")"

  RESTORE_TMP="$(mktemp /tmp/restore_payload.XXXXXX.json)"
  printf '{"confirm":"RESTORE","data":%s}' "$(cat "$BACKUP_FILE")" > "$RESTORE_TMP"
  
  # Disable set -e temporarily to gracefully capture API response
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
