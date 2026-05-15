#!/bin/bash
# ============================================================
# 🔍 check_requirements.sh
# School Management System — Requirements Checker & Updater
# Stays open and lists all checks, verifications, and actions.
# Usage: ./check_requirements.sh
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
GRAY='\033[0;90m'
NC='\033[0m' # No Color

PASS=0
WARN=0
FAIL=0

print_header() {
  echo ""
  echo -e "${CYAN}============================================================${NC}"
  echo -e "${WHITE} $1${NC}"
  echo -e "${CYAN}============================================================${NC}"
  echo ""
}

check_ok()   { echo -e "   ${GREEN}✅ $1${NC}"; ((PASS++)); }
check_warn() { echo -e "   ${YELLOW}⚠️  $1${NC}"; ((WARN++)); }
check_fail() { echo -e "   ${RED}❌ $1${NC}"; ((FAIL++)); }
check_info() { echo -e "   ${GRAY}ℹ️  $1${NC}"; }
step()       { echo -e "${WHITE}🔎 $1${NC}"; }

clear

print_header "🏫 School Management System — Requirements Checker"

echo -e "${YELLOW}This tool verifies that all required dependencies are installed"
echo -e "and up-to-date. No data is changed. Read-only check.${NC}"
echo ""

# ──────────────────────────────────────────────
# 1. Operating System
# ──────────────────────────────────────────────
print_header "1 · Operating System"
step "Detecting OS..."
if [ -f /etc/os-release ]; then
  . /etc/os-release
  check_ok "OS: $NAME $VERSION_ID"
else
  UNAME_S=$(uname -s)
  case "$UNAME_S" in
    Darwin) check_ok "OS: macOS ($(sw_vers -productVersion 2>/dev/null || echo 'unknown'))" ;;
    *)      check_info "OS: $UNAME_S (unverified)" ;;
  esac
fi

# ──────────────────────────────────────────────
# 2. Docker
# ──────────────────────────────────────────────
print_header "2 · Docker"

step "Checking Docker installation..."
if command -v docker &>/dev/null; then
  DOCKER_VER=$(docker --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
  check_ok "Docker installed: v${DOCKER_VER}"
else
  check_fail "Docker NOT found. Install from https://docs.docker.com/get-docker/"
fi

step "Checking Docker daemon..."
if docker info &>/dev/null 2>&1; then
  check_ok "Docker daemon is running"
else
  check_fail "Docker daemon is NOT running — start Docker Desktop / dockerd"
fi

step "Checking Docker Compose..."
if docker compose version &>/dev/null 2>&1; then
  COMPOSE_VER=$(docker compose version --short 2>/dev/null || echo "unknown")
  check_ok "Docker Compose (plugin) installed: v${COMPOSE_VER}"
elif command -v docker-compose &>/dev/null; then
  COMPOSE_VER=$(docker-compose --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
  check_warn "Legacy docker-compose found: v${COMPOSE_VER} — consider upgrading to Compose V2 plugin"
else
  check_fail "Docker Compose NOT found"
fi

# ──────────────────────────────────────────────
# 3. Required files
# ──────────────────────────────────────────────
print_header "3 · Project Files"

step "Checking project structure..."
for f in docker-compose.yml db/init.sql backend/Dockerfile frontend/Dockerfile; do
  if [ -f "$SCRIPT_DIR/$f" ]; then
    check_ok "Found: $f"
  else
    check_fail "Missing: $f"
  fi
done

step "Checking .env file..."
if [ -f "$SCRIPT_DIR/.env" ]; then
  check_ok ".env file present"
  # Check for critical overrides
  if grep -q "JWT_SECRET=" "$SCRIPT_DIR/.env" 2>/dev/null && ! grep -q "SuperSecureAustrianSchool" "$SCRIPT_DIR/.env" 2>/dev/null; then
    check_ok "JWT_SECRET is customized ✅"
  else
    check_warn "JWT_SECRET is using the default — update .env for production security"
  fi
  if grep -q "DB_PASSWORD=" "$SCRIPT_DIR/.env" 2>/dev/null && ! grep -q "SuperSecretSchoolDbPass2026" "$SCRIPT_DIR/.env" 2>/dev/null; then
    check_ok "DB_PASSWORD is customized ✅"
  else
    check_warn "DB_PASSWORD is using the default — update .env for production security"
  fi
else
  check_warn ".env file not found — Docker Compose will use built-in defaults (acceptable for first run)"
fi

# ──────────────────────────────────────────────
# 4. Docker images / container status
# ──────────────────────────────────────────────
print_header "4 · Container Status"

step "Checking running containers..."
if docker info &>/dev/null 2>&1; then
  DB_STATUS=$(docker inspect --format='{{.State.Status}}' school_db 2>/dev/null || docker inspect --format='{{.State.Status}}' antigravity_db 2>/dev/null || echo "not found")
  BE_STATUS=$(docker inspect --format='{{.State.Status}}' school_backend 2>/dev/null || docker inspect --format='{{.State.Status}}' antigravity_backend 2>/dev/null || echo "not found")
  FE_STATUS=$(docker inspect --format='{{.State.Status}}' school_frontend 2>/dev/null || docker inspect --format='{{.State.Status}}' antigravity_frontend 2>/dev/null || echo "not found")

  [ "$DB_STATUS" = "running" ] && check_ok "Database container: running" || check_info "Database container: $DB_STATUS"
  [ "$BE_STATUS" = "running" ] && check_ok "Backend container: running"  || check_info "Backend container: $BE_STATUS"
  [ "$FE_STATUS" = "running" ] && check_ok "Frontend container: running" || check_info "Frontend container: $FE_STATUS"

  echo ""
  step "Container details:"
  docker ps --format "   {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || check_info "No containers running"
fi

# ──────────────────────────────────────────────
# 5. Backend API reachability
# ──────────────────────────────────────────────
print_header "5 · Service Health"

step "Probing backend API..."
if curl -sf "http://localhost:4000/api/setup/status" &>/dev/null; then
  check_ok "Backend API reachable at http://localhost:4000"
else
  check_info "Backend not reachable on localhost:4000 (may not be running)"
fi

step "Probing frontend..."
if curl -sf "http://localhost:3000/" &>/dev/null; then
  check_ok "Frontend reachable at http://localhost:3000"
else
  check_info "Frontend not reachable on localhost:3000 (may not be running)"
fi

# ──────────────────────────────────────────────
# 6. Disk space
# ──────────────────────────────────────────────
print_header "6 · Disk Space"

step "Checking available disk space..."
AVAIL_KB=$(df -k "$SCRIPT_DIR" 2>/dev/null | tail -1 | awk '{print $4}')
if [ -n "$AVAIL_KB" ]; then
  AVAIL_GB=$(echo "scale=1; $AVAIL_KB / 1048576" | bc 2>/dev/null || echo "?")
  if [ "$AVAIL_KB" -gt 2097152 ]; then  # > 2 GB
    check_ok "Available disk space: ${AVAIL_GB} GB"
  elif [ "$AVAIL_KB" -gt 524288 ]; then  # > 512 MB
    check_warn "Low disk space: ${AVAIL_GB} GB — backups and logs need room"
  else
    check_fail "Critical disk space: ${AVAIL_GB} GB — system may not start"
  fi
fi

# ──────────────────────────────────────────────
# Summary
# ──────────────────────────────────────────────
echo ""
echo -e "${CYAN}============================================================${NC}"
echo -e "${WHITE} SUMMARY${NC}"
echo -e "${CYAN}============================================================${NC}"
echo ""
echo -e "   ${GREEN}✅ Passed: $PASS${NC}"
[ "$WARN" -gt 0 ] && echo -e "   ${YELLOW}⚠️  Warnings: $WARN${NC}"
[ "$FAIL" -gt 0 ] && echo -e "   ${RED}❌ Failed: $FAIL${NC}"
echo ""
if [ "$FAIL" -eq 0 ] && [ "$WARN" -eq 0 ]; then
  echo -e "   ${GREEN}🚀 All checks passed! System is ready to launch.${NC}"
elif [ "$FAIL" -eq 0 ]; then
  echo -e "   ${YELLOW}🟡 System can start but review warnings above.${NC}"
else
  echo -e "   ${RED}🛑 Fix the failed checks before starting the system.${NC}"
fi
echo ""
read -p "Press Enter to exit..."
