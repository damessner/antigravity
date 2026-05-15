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
NC='\033[0m'

echo -e "${CYAN}============================================================${NC}"
echo -e "${WHITE}  🏫 Antigravity Proxmox Setup${NC}"
echo -e "${CYAN}============================================================${NC}"

# 1. Update & Prerequisites
echo -e "${WHITE}>> Updating system packages...${NC}"
apt-get update &>/dev/null
apt-get install -y curl sudo git gpg &>/dev/null

# 2. Install Official Docker Engine
echo -e "${WHITE}>> Installing Docker Engine...${NC}"
if ! command -v docker &> /dev/null; then
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
    apt-get update &>/dev/null
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin &>/dev/null
fi
echo -e "   ${GREEN}✅ Docker Ready${NC}"

# 3. Clone Repository
echo -e "${WHITE}>> Deploying Antigravity to /opt/antigravity...${NC}"
mkdir -p /opt/antigravity
git clone $REPO_URL /opt/antigravity &>/dev/null
cd /opt/antigravity

# 4. Permissions
echo -e "${WHITE}>> Setting permissions...${NC}"
chmod +x scripts/*.sh
chmod +x *.bat 2>/dev/null || true

# 5. Optional: Enable Auto-Updates (Cron)
echo -en "${CYAN}>> Enable automatic nightly updates & backups at 2:00 AM? (y/n): ${NC}"
read -r auto_update
if [[ "$auto_update" =~ ^([yY][eE][sS]|[yY])+$ ]]; then
    (crontab -l 2>/dev/null; echo "0 2 * * * /bin/bash /opt/antigravity/scripts/auto_updater.sh") | crontab -
    echo -e "   ${GREEN}✅ Auto-updates scheduled for 2:00 AM.${NC}"
fi

# 6. Initialize System

echo -e "${WHITE}>> Initializing Docker Stack...${NC}"
# We run build first to prepare images
docker compose build &>/dev/null

# 6. Success Message
echo -e "\n${CYAN}============================================================${NC}"
echo -e "${GREEN}  🎉 INSTALLATION COMPLETE!${NC}"
echo -e "${CYAN}============================================================${NC}"
echo -e "${WHITE}  You can now access the system at:${NC}"
echo -e "${CYAN}  http://$(hostname -I | awk '{print $1}'):3000${NC}"
echo -e ""
echo -e "${GRAY}  Management commands:${NC}"
echo -e "${GRAY}  - cd /opt/antigravity${NC}"
echo -e "${GRAY}  - ./scripts/update_system.sh${NC}"
echo -e "${GRAY}  - ./scripts/restart_system.sh${NC}"
echo -e "${CYAN}============================================================${NC}"
