#!/usr/bin/env bash
# ==============================================================================
# 🩺 generate_support_report.sh — One-Click Diagnostics
# Schulmanagement V2.3 — IT Admin Support Report Generator
# ==============================================================================
# Collects logs, container status, and host resource usage,
# sanitizes sensitive data, and compresses everything into a dated ZIP file.
#
# Usage: ./scripts/generate_support_report.sh
# Output: ./school_data/support_YYYY-MM-DD.zip
# ==============================================================================

set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TIMESTAMP=$(date +%Y-%m-%d)
REPORT_DIR=$(mktemp -d "/tmp/support_report_XXXXXX")
OUTPUT_DIR="$PROJECT_ROOT/school_data"
OUTPUT_ZIP="$OUTPUT_DIR/support_${TIMESTAMP}.zip"
LOG_LINES=100

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
BOLD='\033[1m'
RESET='\033[0m'

info()    { echo -e "${CYAN}ℹ️  $*${RESET}"; }
success() { echo -e "${GREEN}✅ $*${RESET}"; }
warn()    { echo -e "${YELLOW}⚠️  $*${RESET}"; }
step()    { echo -e "\n${BOLD}$*${RESET}"; }

# ── Sanitizer ─────────────────────────────────────────────────────────────────
# Removes passwords, secrets, tokens, and auth keys from text content.
sanitize() {
  sed \
    -e 's/\(PASSWORD[=: ]*\)[^[:space:]"'"'"'&;,}]*/\1[REDACTED]/gi' \
    -e 's/\(SECRET[=: ]*\)[^[:space:]"'"'"'&;,}]*/\1[REDACTED]/gi' \
    -e 's/\(TOKEN[=: ]*\)[^[:space:]"'"'"'&;,}]*/\1[REDACTED]/gi' \
    -e 's/\(AUTH_KEY[=: ]*\)[^[:space:]"'"'"'&;,}]*/\1[REDACTED]/gi' \
    -e 's/\(API_KEY[=: ]*\)[^[:space:]"'"'"'&;,}]*/\1[REDACTED]/gi' \
    -e 's/\(AUTHKEY[=: ]*\)[^[:space:]"'"'"'&;,}]*/\1[REDACTED]/gi' \
    -e 's/\(JWT[=: ]*\)[^[:space:]"'"'"'&;,}]*/\1[REDACTED]/gi' \
    -e 's/tskey-[A-Za-z0-9_-]*/[TAILSCALE_KEY_REDACTED]/g' \
    -e 's/eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*/[JWT_TOKEN_REDACTED]/g'
}

# ── Banner ────────────────────────────────────────────────────────────────────
clear
echo -e "${BOLD}${CYAN}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║   🩺  Schulmanagement V2.3 — Support Report Generator        ║"
echo "║   Collecting diagnostics for IT support submission            ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${RESET}"
echo -e "  Report date:   ${BOLD}${TIMESTAMP}${RESET}"
echo -e "  Temp folder:   ${BOLD}${REPORT_DIR}${RESET}"
echo -e "  Output ZIP:    ${BOLD}${OUTPUT_ZIP}${RESET}"
echo ""

mkdir -p "$OUTPUT_DIR"

# ── Section 1: System Info ────────────────────────────────────────────────────
step "📋 Step 1/6 — Collecting system information..."

{
  echo "=== System Information ==="
  echo "Generated: $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  echo "Hostname:  $(hostname)"
  echo "OS:        $(uname -a)"
  echo ""
  if command -v lsb_release &>/dev/null; then
    echo "Distribution:"
    lsb_release -a 2>/dev/null || true
    echo ""
  fi
  echo "Uptime: $(uptime)"
  echo ""
  echo "=== CPU Info ==="
  if [ -f /proc/cpuinfo ]; then
    grep -m1 "model name" /proc/cpuinfo || echo "N/A"
    echo "Cores: $(nproc)"
  else
    echo "N/A (non-Linux)"
  fi
} > "$REPORT_DIR/01_system_info.txt"
success "System info collected."

# ── Section 2: Resource Usage (RAM / Disk) ────────────────────────────────────
step "💾 Step 2/6 — Collecting resource usage (RAM / Disk)..."

{
  echo "=== Memory Usage ==="
  free -h 2>/dev/null || vm_stat 2>/dev/null || echo "Memory info unavailable"
  echo ""
  echo "=== Disk Usage ==="
  df -h 2>/dev/null || echo "Disk info unavailable"
  echo ""
  echo "=== Disk Usage (project data) ==="
  if [ -d "$PROJECT_ROOT/school_data" ]; then
    du -sh "$PROJECT_ROOT/school_data"/* 2>/dev/null || echo "school_data is empty"
  else
    echo "school_data directory not found"
  fi
} > "$REPORT_DIR/02_resource_usage.txt"
success "Resource usage collected."

# ── Section 3: Docker Status ──────────────────────────────────────────────────
step "🐳 Step 3/6 — Collecting Docker container status..."

if docker info >/dev/null 2>&1; then
  {
    echo "=== Docker Version ==="
    docker version 2>/dev/null || echo "N/A"
    echo ""
    echo "=== Running Containers (docker ps) ==="
    docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}\t{{.Image}}" 2>/dev/null || echo "N/A"
    echo ""
    echo "=== All Containers ==="
    docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}\t{{.Image}}" 2>/dev/null || echo "N/A"
    echo ""
    echo "=== Docker Compose Services ==="
    cd "$PROJECT_ROOT" && docker compose ps 2>/dev/null || true
    echo ""
    echo "=== Docker Disk Usage ==="
    docker system df 2>/dev/null || echo "N/A"
  } > "$REPORT_DIR/03_docker_status.txt"
  success "Docker status collected."
else
  echo "Docker daemon not running or not accessible." > "$REPORT_DIR/03_docker_status.txt"
  warn "Docker daemon not accessible — skipping container status."
fi

# ── Section 4: Container Logs ─────────────────────────────────────────────────
step "📜 Step 4/6 — Collecting last ${LOG_LINES} lines of container logs (sanitized)..."

CONTAINERS=("school_db" "school_backend" "school_frontend" "school_cloudflared" "school_tailscale" "school_rclone")
LOGS_DIR="$REPORT_DIR/logs"
mkdir -p "$LOGS_DIR"

for CONTAINER in "${CONTAINERS[@]}"; do
  if docker ps -a --format '{{.Names}}' 2>/dev/null | grep -q "^${CONTAINER}$"; then
    info "  Fetching logs: $CONTAINER"
    docker logs --tail "$LOG_LINES" "$CONTAINER" 2>&1 \
      | sanitize \
      > "$LOGS_DIR/${CONTAINER}.log" || echo "[Log collection failed for $CONTAINER]" > "$LOGS_DIR/${CONTAINER}.log"
  fi
done

# Also try compose-style logs from project root
if docker info >/dev/null 2>&1; then
  cd "$PROJECT_ROOT"
  docker compose logs --tail="$LOG_LINES" 2>/dev/null \
    | sanitize \
    > "$LOGS_DIR/compose_combined.log" || true
fi

success "Container logs collected and sanitized."

# ── Section 5: Environment / Config (sanitized) ───────────────────────────────
step "🔧 Step 5/6 — Collecting sanitized configuration..."

{
  echo "=== .env file (sanitized) ==="
  if [ -f "$PROJECT_ROOT/.env" ]; then
    sanitize < "$PROJECT_ROOT/.env"
  else
    echo ".env file not found (may be using defaults)"
  fi
  echo ""
  echo "=== Active Compose Profiles ==="
  grep "^COMPOSE_PROFILES=" "$PROJECT_ROOT/.env" 2>/dev/null || echo "None set (using default)"
  echo ""
  echo "=== Docker Compose File (prod) ==="
  if [ -f "$PROJECT_ROOT/docker-compose.prod.yml" ]; then
    sanitize < "$PROJECT_ROOT/docker-compose.prod.yml"
  else
    echo "docker-compose.prod.yml not found"
  fi
} > "$REPORT_DIR/05_config_sanitized.txt"
success "Configuration collected and sanitized."

# ── Section 6: Health Check Summary ──────────────────────────────────────────
step "🏥 Step 6/6 — Running quick health checks..."

{
  echo "=== Health Check Summary ==="
  echo "Generated: $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  echo ""

  for URL in "http://localhost:4000/api/setup/status" "http://localhost:3000"; do
    STATUS=$(curl -o /dev/null -s -w "%{http_code}" --max-time 5 "$URL" 2>/dev/null || echo "FAILED")
    echo "  $URL → HTTP $STATUS"
  done
  echo ""

  echo "=== Network Ports in Use ==="
  ss -tlnp 2>/dev/null | grep -E ':3000|:3001|:4000|:5433' || \
    netstat -tlnp 2>/dev/null | grep -E ':3000|:3001|:4000|:5433' || \
    echo "Port check tools (ss/netstat) not available"
} > "$REPORT_DIR/06_health_checks.txt"
success "Health checks complete."

# ── README in archive ─────────────────────────────────────────────────────────
cat > "$REPORT_DIR/README.txt" <<EOF
Schulmanagement V2.3 — Support Report
Generated: $(date -u '+%Y-%m-%dT%H:%M:%SZ')
Hostname:  $(hostname)

Contents:
  01_system_info.txt       — OS, CPU, uptime
  02_resource_usage.txt    — RAM, disk usage
  03_docker_status.txt     — Docker container status
  logs/                    — Last ${LOG_LINES} lines of each container log (sanitized)
  05_config_sanitized.txt  — .env and compose config (passwords REDACTED)
  06_health_checks.txt     — HTTP health check results

PRIVACY NOTE:
  All passwords, secrets, tokens, and auth keys have been automatically
  replaced with [REDACTED] before inclusion in this archive.
  Please still review the contents before sharing externally.

Submit this file to your IT support contact or the project maintainer.
EOF

# ── Compress ──────────────────────────────────────────────────────────────────
echo ""
info "📦 Compressing report..."

if command -v zip &>/dev/null; then
  (cd "$(dirname "$REPORT_DIR")" && zip -r "$OUTPUT_ZIP" "$(basename "$REPORT_DIR")" -x "*.DS_Store") >/dev/null
elif command -v tar &>/dev/null; then
  OUTPUT_ZIP="${OUTPUT_ZIP%.zip}.tar.gz"
  tar -czf "$OUTPUT_ZIP" -C "$(dirname "$REPORT_DIR")" "$(basename "$REPORT_DIR")" 2>/dev/null
else
  warn "Neither 'zip' nor 'tar' found. Raw report directory kept at:"
  warn "  $REPORT_DIR"
  echo ""
  warn "Install zip with: apt-get install -y zip"
  exit 0
fi

# Clean up temp directory
rm -rf "$REPORT_DIR"

echo ""
echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}${GREEN}║   ✅ Support report generated successfully!                   ║${RESET}"
echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════════════════════════╝${RESET}"
echo ""
echo -e "  📦 Report saved to: ${BOLD}${OUTPUT_ZIP}${RESET}"
echo -e "  📏 Size: $(du -sh "$OUTPUT_ZIP" 2>/dev/null | cut -f1 || echo 'unknown')"
echo ""
echo "  Please attach this file when contacting IT support."
echo ""
