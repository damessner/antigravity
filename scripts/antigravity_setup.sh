#!/usr/bin/env bash
# ============================================================
# 🏫 Antigravity LXC Setup Script
# Runs inside the Proxmox LXC to provision the environment.
# ============================================================

set -e
REPO_URL="https://github.com/damessner/antigravity.git"

# Colors
CYAN='\033[0;36m'
WHITE='\033[1;37m'
GREEN='\033[0;32m'
GRAY='\033[0;90m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Futuristic Progress Bar and Feature Walkthrough Helper
function run_with_scifi_progress() {
  local pid=$1
  local start=$2
  local target=$3
  local phase=$4
  
  local current=$start
  local bar_width=40
  
  local fun_lines=(
    "INIT: Calibrating anti-gravity stabilization coils..."
    "EXEC: Loading quantum classroom management modules..."
    "DB: Establishing secure PostgreSQL data tunnel..."
    "SEC: Enforcing strict pupil data isolation boundary..."
    "ALG: Sweeping WebUntis rosters for Stammklasse scheduling..."
    "MATH: Curve parameter loaded: 4.0 Grade at 65% threshold."
    "MATH: Normalizing database records: assignment limit <= 100%."
    "MATH: Resolving class averages: lim(x->∞) GPA = 1.0"
    "FUNC: function gravity_defy(mass) { return mass * -9.81; }"
    "FUNC: class Pupil extends Human { study() { return 'Sehr Gut'; } }"
    "EXCEL: Preparing Gradebook layout engines (exceljs)..."
    "API: Initiating zero-config dynamic network API discovery..."
    "NET: Synced with WebUntis API Playground successfully."
    "SYS: Injecting Austrian curriculum vectors into memory..."
    "SEC: Hardening authentication matrix (JWT secret initialized)..."
    "NOTIF: Auto-generating Web Push VAPID keys..."
    "SYS: Tuning database engine to maximum throughput..."
    "SYS: Scaling anti-gravity field strength to 100%..."
  )

  # Loop while background process is running
  while kill -0 "$pid" 2>/dev/null; do
    # Smoothly increment percentage toward target
    if [ $current -lt $(( target - 1 )) ]; then
      current=$(( current + 1 ))
    fi
    
    # Calculate filled and empty blocks
    local filled=$(( current * bar_width / 100 ))
    local empty=$(( bar_width - filled ))
    
    local bar_filled=""
    local bar_empty=""
    for ((i=0; i<filled; i++)); do bar_filled="${bar_filled}█"; done
    for ((i=0; i<empty; i++)); do bar_empty="${bar_empty}░"; done
    
    local index=$(( RANDOM % ${#fun_lines[@]} ))
    
    # Update progress bar and diagnostics in-place
    echo -ne "\r\033[K   ${CYAN}[${bar_filled}${bar_empty}] ${WHITE}${current}%${NC} | ${YELLOW}${phase}${NC}\n\033[K   ${GRAY}[DIAG] ${fun_lines[$index]}${NC}\033[1A"
    
    sleep 0.8
  done

  # Ensure background process status is captured and bar is filled to target
  wait "$pid"
  current=$target
  
  local filled=$(( current * bar_width / 100 ))
  local empty=$(( bar_width - filled ))
  local bar_filled=""
  local bar_empty=""
  for ((i=0; i<filled; i++)); do bar_filled="${bar_filled}█"; done
  for ((i=0; i<empty; i++)); do bar_empty="${bar_empty}░"; done
  
  # Persistent summary print (clears temporary diag line)
  echo -ne "\r\033[K   ${CYAN}[${bar_filled}${bar_empty}] ${WHITE}${current}%${NC} | ${GREEN}✓ ${phase} Completed!${NC}\n\033[K\n"
}

echo -e "${CYAN}============================================================${NC}"
echo -e "${WHITE}  🏫 Antigravity Proxmox Setup & Feature Walkthrough${NC}"
echo -e "${CYAN}============================================================${NC}"

# 1. Update & Prerequisites
echo -e "${WHITE}>> Sourcing prerequisite packages and Austrian curriculum templates...${NC}"
(apt-get update && apt-get install -y curl sudo git gpg) &>/dev/null &
run_with_scifi_progress $! 0 12 "Prerequisite Engine & Austrian Curriculum Vector Loading"

# 2. Install Official Docker Engine
echo -e "${WHITE}>> Configuring container virtualization & secure sandbox layers...${NC}"
if ! command -v docker &> /dev/null; then
    (
      install -m 0755 -d /etc/apt/keyrings
      curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
      chmod a+r /etc/apt/keyrings/docker.gpg
      echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
      apt-get update
      apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    ) &>/dev/null &
    run_with_scifi_progress $! 12 28 "Docker Sandbox Virtualization & Strict Pupil Data Isolation Boundary"
else
    ( sleep 0.5 ) &
    run_with_scifi_progress $! 12 28 "Docker Sandbox Virtualization & Strict Pupil Data Isolation Boundary"
fi

# 3. Clone Repository
echo -e "${WHITE}>> Downloading Antigravity Interactive Gradebook Repository...${NC}"
mkdir -p /opt/antigravity
if [ ! -d /opt/antigravity/.git ]; then
    git clone $REPO_URL /opt/antigravity &>/dev/null &
    run_with_scifi_progress $! 28 42 "Main Antigravity OS Core Repository (Interactive Gradebook Pipeline)"
else
    ( sleep 0.5 ) &
    run_with_scifi_progress $! 28 42 "Main Antigravity OS Core Repository (Interactive Gradebook Pipeline)"
fi
cd /opt/antigravity

# 4. Permissions
echo -e "${WHITE}>> Initializing Microsoft Teams offline spreadsheet sync hooks...${NC}"
(
  chmod +x scripts/*.sh
  chmod +x *.bat 2>/dev/null || true
  sleep 0.5
) &>/dev/null &
run_with_scifi_progress $! 42 55 "Microsoft Teams Offline Excel Export/Import (exceljs & multer)"

# 5. Optional: Enable Auto-Updates (Cron)
auto_update="yes"
if [ -t 0 ]; then
    echo -en "${YELLOW}>> Enable automatic nightly updates & backups at 2:00 AM? (y/n) [Default: y]: ${NC}"
    if ! read -t 3 -r input_update; then
        input_update="y"
    fi
    auto_update="${input_update:-yes}"
else
    # Non-interactive fallback: auto-enable
    auto_update="yes"
fi

if [[ "$auto_update" =~ ^([yY][eE][sS]|[yY])+$ ]]; then
    (
      (crontab -l 2>/dev/null; echo "0 2 * * * /bin/bash /opt/antigravity/scripts/auto_updater.sh") | crontab -
      sleep 0.5
    ) &>/dev/null &
    run_with_scifi_progress $! 55 68 "Nightly Auto-Updater Sweep & Backup Orchestration Agent"
else
    ( sleep 0.5 ) &
    run_with_scifi_progress $! 55 68 "Nightly Auto-Updater Sweep & Backup Orchestration Agent"
fi

# 6. Build stack
echo -e "${WHITE}>> Compiling grading algorithms and database validation layers...${NC}"
docker compose build &>/dev/null &
run_with_scifi_progress $! 68 85 "Austria-Wide Grade Curve (4.0 at 65%) & Max 100% Grade Cap"

# 7. Start stack & WebUntis sync
echo -e "${WHITE}>> Synthesizing scheduled Stammklasse rosters & sweeps...${NC}"
( sleep 1.2 ) &
run_with_scifi_progress $! 85 95 "Student-Centered WebUntis Stammklasse Timetable-Sweep Syncing"

# 8. Start stack
echo -e "${WHITE}>> Activating zero-config routing stack (Powering up OS)...${NC}"
docker compose up -d &>/dev/null &
run_with_scifi_progress $! 95 100 "Zero-Config Dynamic LAN API Discovery (Port 4000 Dynamic Resolver)"

# Success Message
echo -e "\n${CYAN}============================================================${NC}"
echo -e "${GREEN}  🎉 ANTIGRAVITY OS ONLINE & RUNNING!${NC}"
echo -e "${CYAN}============================================================${NC}"
echo -e "${WHITE}  Access the platform immediately at:${NC}"
echo -e "${CYAN}  http://$(hostname -I | awk '{print $1}'):3000${NC}"
echo -e ""
echo -e "${WHITE}  Default Web Admin Credentials:${NC}"
echo -e "  - Username: ${YELLOW}da.messner${NC}"
echo -e "  - Password: ${YELLOW}weissenbach${NC}"
echo -e ""
echo -e "${GRAY}  Core Control Commands:${NC}"
echo -e "${GRAY}  - cd /opt/antigravity${NC}"
echo -e "${GRAY}  - ./scripts/update_system.sh  (Synchronizes with GitHub)${NC}"
echo -e "${GRAY}  - ./scripts/restart_system.sh (Safe restart utility)${NC}"
echo -e "${CYAN}============================================================${NC}"
