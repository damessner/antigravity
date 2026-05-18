#!/usr/bin/env bash
# ============================================================
# 🏫 Antigravity Proxmox Installer
# ============================================================
# Copyright (c) 2026 David Messner
# Author: da.messner
# License: MIT | https://github.com/community-scripts/ProxmoxVE/raw/main/LICENSE
# ============================================================

# Sourcing the Community Build Functions
source <(curl -fsSL https://raw.githubusercontent.com/community-scripts/ProxmoxVE/main/misc/build.func)

# Override the default header_info with our beautiful custom Antigravity ASCII art
function header_info() {
  clear
  echo -e "\033[0;36m"
  cat <<'EOF'
    ___   _   _ _____ ___  ____  ____     _     ____   _   _  _____ __   __
   /   | / | / /_  __/  _|/ ___|/ __ \   / \   / ___| | | | |/_   _|\ \ / /
  / /| |/  |/ / / /  | | | |  _| /_/ /  / _ \ | |  _  | | | |  | |   \ V / 
 / ___ | /|  / / /  | |  | |_| |  _ <  / ___ \| |_| | | |_| |  | |    | |  
/_/  |_/_/ |_/ /_/ |___|  \____|_| \_\/_/   \_\\____|  \___/   |_|    |_|  
EOF
  echo -e "\033[1;37m                      >> EDUCATIONAL OS DEPLOYMENT <<\033[0m"
  echo ""
}


# ── App Configuration ────────────────────────────────────────────────────────
APP="antigravity"
var_tags="${var_tags:-education;docker}"
var_cpu="${var_cpu:-2}"
var_ram="${var_ram:-4096}"
var_disk="${var_disk:-32}"
var_os="${var_os:-debian}"
var_version="${var_version:-12}"
var_unprivileged="${var_unprivileged:-1}"

# Local terminal styling variables
WHITE='\033[1;37m'
NC='\033[0m'

# ── Header ──────────────────────────────────────────────────────────────────
header_info
variables
color
catch_errors

# ── Build Logic ─────────────────────────────────────────────────────────────
function update_script() {
    header_info
    if [[ ! -d /opt/antigravity ]]; then 
        msg_error "No ${APP} Installation Found!"; 
        exit; 
    fi
    msg_info "Updating ${APP}..."
    cd /opt/antigravity
    git pull --ff-only origin main
    docker compose pull
    docker compose up -d --remove-orphans
    msg_ok "Update Complete"
    exit
}

start
build_container
description

# ── Trigger Internal Setup ──────────────────────────────────────────────────
# This command runs inside the container immediately after creation
msg_info "Starting Antigravity Provisioning..."
lxc-attach -n $CTID -- bash -c "$(curl -fsSL https://raw.githubusercontent.com/damessner/antigravity/main/scripts/antigravity_setup.sh)"

msg_ok "Completed Successfully!"
echo -e "${APP} is now running!"
echo -e "Access it at: ${WHITE}http://$(pct exec $CTID -- hostname -I | awk '{print $1}'):3000${NC}"

