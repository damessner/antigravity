#!/bin/bash
# ============================================================
# 🐧 Antigravity Universal Linux Installer
# Optimized for Baremetal, VMs, and Raspberry Pi
# ============================================================

REPO_URL="https://github.com/damessner/antigravity.git"
INSTALL_DIR="antigravity"

# Colors
CYAN='\033[0;36m'
WHITE='\033[1;37m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
GRAY='\033[0;90m'
NC='\033[0m'

clear
echo -e "${CYAN}============================================================${NC}"
echo -e "${WHITE}  🏫 Antigravity Universal Linux Setup${NC}"
echo -e "${CYAN}============================================================${NC}"

# 1. Check for Root
if [ "$EUID" -ne 0 ]; then
  echo -e "${YELLOW} [INFO] This script may need sudo privileges for Docker.${NC}"
fi

# 2. Install Prerequisites (Git, Curl)
echo -e "${WHITE}>> Checking prerequisites...${NC}"
if ! command -v git &> /dev/null; then
    apt-get update && apt-get install -y git curl &>/dev/null
fi

# 3. Install Docker if missing
if ! command -v docker &> /dev/null; then
    echo -e "${WHITE}>> Installing Docker & Docker Compose...${NC}"
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh &>/dev/null
    rm get-docker.sh
fi
echo -e "   ${GREEN}✅ Docker Ready${NC}"

# 4. Clone and Prepare
echo -e "${WHITE}>> Downloading Antigravity...${NC}"
if [ -d "$INSTALL_DIR" ]; then
    cd "$INSTALL_DIR" && git pull origin main
else
    git clone $REPO_URL "$INSTALL_DIR"
    cd "$INSTALL_DIR"
fi

# 5. Fix permissions
chmod +x scripts/*.sh

# 6. Launch System
echo -e "${WHITE}>> Launching the system...${NC}"
./scripts/restart_system.sh --yes

# 7. Success
echo -e "\n${CYAN}============================================================${NC}"
echo -e "${GREEN}  🎉 LINUX DEPLOYMENT COMPLETE!${NC}"
echo -e "${CYAN}============================================================${NC}"
echo -e "${WHITE}  Access the platform at:${NC}"
echo -e "   ${CYAN}http://localhost:3000${NC}"
echo -e "   ${CYAN}http://$(hostname -I | awk '{print $1}'):3000${NC}"
echo -e ""
echo -e "${WHITE}  Management commands:${NC}"
echo -e "   - ${GRAY}./01_update_system.bat${NC} (Wait, use .sh on Linux!)"
echo -e "   - ${GRAY}./scripts/update_system.sh${NC}"
echo -e "   - ${GRAY}./scripts/restart_system.sh${NC}"
echo -e "${CYAN}============================================================${NC}"
