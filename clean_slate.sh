#!/bin/bash
# clean_slate.sh — Reset the school management system to a clean state
# Usage: ./clean_slate.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🏫 School Management System — Clean Slate Utility"
echo "=================================================="
echo ""

# Step 1: Stop containers
echo "⏹  Stopping Docker containers..."
docker compose down
echo ""

# Step 2: Wipe school_data directory contents
echo "🗑  Wiping school_data/ directory..."
if [ -d "$SCRIPT_DIR/school_data" ]; then
  rm -rf "$SCRIPT_DIR/school_data/db"
  # Preserve backups directory structure but allow optional wipe
  echo "   → Postgres data directory cleared."
  echo ""
  read -p "   Also wipe school_data/backups/? (y/N): " wipe_backups
  if [[ "$wipe_backups" =~ ^[Yy]$ ]]; then
    rm -f "$SCRIPT_DIR/school_data/backups/"*.json
    echo "   → Backups directory cleared."
  fi
fi
echo ""

# Step 3: Optional backup import
BACKUP_FILE=""
read -p "📦 Import a backup file before starting? (y/N): " import_backup
if [[ "$import_backup" =~ ^[Yy]$ ]]; then
  read -p "   Enter full path to .json backup file: " BACKUP_FILE
  if [ ! -f "$BACKUP_FILE" ]; then
    echo "   ❌ File not found: $BACKUP_FILE"
    echo "   Continuing without backup import."
    BACKUP_FILE=""
  else
    echo "   ✅ Backup file found: $BACKUP_FILE"
  fi
fi
echo ""

# Step 4: Restart containers
echo "🚀 Starting Docker containers..."
docker compose up -d
echo ""

# Wait for backend to be ready
echo "⏳ Waiting for backend to start (up to 30s)..."
API_URL="${NEXT_PUBLIC_API_URL:-http://localhost:4000}"
for i in $(seq 1 30); do
  if curl -sf "$API_URL/api/setup/status" > /dev/null 2>&1; then
    echo "   ✅ Backend is ready."
    break
  fi
  sleep 1
  if [ "$i" -eq 30 ]; then
    echo "   ⚠️  Backend did not respond in time. You may need to restore manually."
  fi
done
echo ""

# Step 5: If a backup was selected, restore it via the API
if [ -n "$BACKUP_FILE" ]; then
  echo "📥 Restoring backup via API..."
  # Copy to backups directory so it is also stored as a reference
  mkdir -p "$SCRIPT_DIR/school_data/backups"
  cp "$BACKUP_FILE" "$SCRIPT_DIR/school_data/backups/$(basename "$BACKUP_FILE")"

  RESPONSE=$(curl -sf -X POST "$API_URL/api/backup/restore" \
    -H "Content-Type: application/json" \
    -d "{\"confirm\":\"RESTORE\",\"data\":$(cat "$BACKUP_FILE")}" 2>&1) || true

  if echo "$RESPONSE" | grep -q '"success":true'; then
    echo "   ✅ Backup restored successfully."
  else
    echo "   ⚠️  Restore via API returned: $RESPONSE"
    echo "   You can restore manually via the Admin Panel → System-Sicherung."
  fi
  echo ""
fi

echo "✅ Clean slate complete. Frontend: http://localhost:3000"
