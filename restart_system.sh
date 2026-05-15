#!/bin/bash
# ============================================================
# 🔄 restart_system.sh
# School Management System — Safe Restart Utility
# Brings the Docker stack down and back up, then shows system
# status, service health, URLs, and login guidance.
# Stays open until dismissed by the operator.
# Usage: ./restart_system.sh
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
GRAY='\033[0;90m'
NC='\033[0m'

print_header() {
  echo ""
  echo -e "${CYAN}============================================================${NC}"
  echo -e "${WHITE} $1${NC}"
  echo -e "${CYAN}============================================================${NC}"
  echo ""
}

step() { echo -e "${WHITE}🔄 $1${NC}"; }
ok()   { echo -e "   ${GREEN}✅ $1${NC}"; }
warn() { echo -e "   ${YELLOW}⚠️  $1${NC}"; }
fail() { echo -e "   ${RED}❌ $1${NC}"; }
info() { echo -e "   ${GRAY}ℹ️  $1${NC}"; }

clear
print_header "🏫 School Management System — Restart Utility"

echo -e "${YELLOW}This will stop and restart all containers cleanly.${NC}"
echo -e "${YELLOW}Existing data is preserved. No backup is performed.${NC}"
echo ""

# ── Preflight: Docker check ───────────────────────────────────────────────────
step "Checking Docker daemon..."
if ! docker info &>/dev/null 2>&1; then
  fail "Docker daemon is not running. Please start Docker Desktop / dockerd."
  echo ""
  read -p "Press Enter to exit..."
  exit 1
fi
ok "Docker daemon is running"
echo ""

# ── Step 1: Bring stack down ──────────────────────────────────────────────────
print_header "Step 1 · Stopping current containers"
step "Running: docker compose down --remove-orphans ..."
docker compose down --remove-orphans
if [ $? -ne 0 ]; then
  warn "docker compose down returned non-zero — continuing anyway"
fi
sleep 2
ok "Stack stopped"
echo ""

# ── Step 2: Bring stack up ────────────────────────────────────────────────────
print_header "Step 2 · Starting containers"
step "Running: docker compose up -d ..."
docker compose up -d
if [ $? -ne 0 ]; then
  fail "Failed to start containers. Run 'docker compose logs' for details."
  echo ""
  read -p "Press Enter to exit..."
  exit 1
fi
ok "docker compose up completed"
echo ""

# ── Step 3: Wait for backend ──────────────────────────────────────────────────
print_header "Step 3 · Waiting for services"
step "Waiting for backend API (up to 60s)..."
BACKEND_READY=false
for i in $(seq 1 60); do
  if curl -sf "http://localhost:4000/api/setup/status" &>/dev/null; then
    ok "Backend API ready (${i}s)"
    BACKEND_READY=true
    break
  fi
  sleep 1
done
if [ "$BACKEND_READY" = false ]; then
  warn "Backend did not respond within 60s — it may still be starting"
fi

step "Waiting for frontend (up to 30s)..."
for i in $(seq 1 30); do
  if curl -sf "http://localhost:3000/" &>/dev/null; then
    ok "Frontend ready (${i}s)"
    break
  fi
  sleep 1
done
echo ""

# ── Step 4: Status report ─────────────────────────────────────────────────────
print_header "Step 4 · System Status"

step "Container health:"
docker ps --format "   {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null
echo ""

step "Network info:"
# Detect local IP
LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
[ -z "$LOCAL_IP" ] && LOCAL_IP=$(ip route get 1.1.1.1 2>/dev/null | awk '/src/{print $NF; exit}')
[ -z "$LOCAL_IP" ] && LOCAL_IP="localhost"

echo ""
echo -e "   ${GREEN}🌐 System is available at:${NC}"
echo -e "   ${CYAN}  → Local:    http://localhost:3000${NC}"
if [ "$LOCAL_IP" != "localhost" ]; then
  echo -e "   ${CYAN}  → Network:  http://${LOCAL_IP}:3000${NC}"
fi
echo ""
echo -e "   ${WHITE}🔑 First Login:${NC}"
echo -e "   ${YELLOW}  → Username: da.messner${NC}"
echo -e "   ${YELLOW}  → Password: (as provided by administrator)${NC}"
echo -e "   ${GRAY}  → You will be asked to change your password on first login.${NC}"
echo ""
echo -e "   ${WHITE}📋 Useful commands:${NC}"
echo -e "   ${GRAY}  → View logs:         docker compose logs -f${NC}"
echo -e "   ${GRAY}  → Stop system:       docker compose down${NC}"
echo -e "   ${GRAY}  → Check status:      docker compose ps${NC}"
echo -e "   ${GRAY}  → Reset system:      ./clean_slate.sh${NC}"
echo ""

print_header "✅ Restart Complete"
echo -e "${GREEN}The system is restarting. Open a browser and navigate to:${NC}"
echo -e "${CYAN}  http://${LOCAL_IP}:3000${NC}"
echo ""
read -p "Press Enter to exit this window..."
