#!/bin/bash
# ============================================================
# 🏫 Antigravity Unraid Installer
# Automated deployment for Unraid Docker Compose
# ============================================================

REPO_URL="https://github.com/damessner/antigravity.git"
INSTALL_PATH="/mnt/user/appdata/antigravity"
COMPOSE_PROJECT_PATH="/boot/config/plugins/docker.compose/projects/antigravity"

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
echo -e "${WHITE}  🏫 Antigravity Unraid Setup${NC}"
echo -e "${CYAN}============================================================${NC}"

# 1. Check if running on Unraid
if [ ! -d "/boot/config/plugins" ]; then
    echo -e "${RED} [FAIL] This script is designed for Unraid only.${NC}"
    exit 1
fi

# 2. Create Appdata Folder
echo -e "${WHITE}>> Preparing Appdata folder...${NC}"

# Fix "dubious ownership" issues for Git on Unraid
git config --global --add safe.directory "$INSTALL_PATH"

if [ -d "$INSTALL_PATH" ]; then

    echo -e "${YELLOW} [INFO] Folder already exists. Updating existing installation...${NC}"
    cd "$INSTALL_PATH" && git pull origin main
else
    mkdir -p "$INSTALL_PATH"
    echo -e "${WHITE}>> Cloning Antigravity to $INSTALL_PATH...${NC}"
    git clone $REPO_URL "$INSTALL_PATH"
fi

# 3. Fix Permissions (Unraid Standard)
echo -e "${WHITE}>> Setting Unraid permissions (nobody:users)...${NC}"
chown -R nobody:users "$INSTALL_PATH"
chmod -R 775 "$INSTALL_PATH"

# 4. Optional: Enable Auto-Updates (Cron)
echo -en "${YELLOW}>> Enable automatic nightly updates & backups at 2:00 AM? (y/n): ${NC}"
read -r auto_update
if [[ "$auto_update" =~ ^([yY][eE][sS]|[yY])+$ ]]; then
    (crontab -l 2>/dev/null; echo "0 2 * * * /bin/bash $INSTALL_PATH/scripts/auto_updater.sh") | crontab -
    echo -e "   ${GREEN}✅ Auto-updates scheduled for 2:00 AM.${NC}"
fi

# 5. Integrate with Docker Compose Manager Plugin

echo -e "${WHITE}>> Integrating with Compose Manager plugin...${NC}"
# Check for common Unraid Compose Manager plugin paths
if [ -d "/boot/config/plugins/docker.compose" ] || [ -d "/boot/config/plugins/compose.manager" ]; then
    # Determine the actual path
    if [ -d "/boot/config/plugins/compose.manager" ]; then
        COMPOSE_PROJECT_PATH="/boot/config/plugins/compose.manager/projects/antigravity"
    fi
    
    mkdir -p "$COMPOSE_PROJECT_PATH"

    # Create the project file pointing to our appdata
    cp "$INSTALL_PATH/scripts/docker-compose.unraid.yml" "$COMPOSE_PROJECT_PATH/docker-compose.yml"
    echo -e "   ${GREEN}✅ Project registered in Unraid Docker tab.${NC}"
else
    echo -e "   ${YELLOW}⚠️  Compose Manager plugin not found. Please install it from CA.${NC}"
fi

# 5. Success Message
echo -e "\n${CYAN}============================================================${NC}"
echo -e "${GREEN}  🎉 UNRAID DEPLOYMENT READY!${NC}"
echo -e "${CYAN}============================================================${NC}"
echo -e "${WHITE}  Next Steps:${NC}"
echo -e "   1. Go to your Unraid ${CYAN}'Docker'${NC} tab."
echo -e "   2. Scroll to the bottom to find ${WHITE}'antigravity'${NC}."
echo -e "   3. Click ${CYAN}'Compose Up'${NC}."
echo -e ""
echo -e "  Manual startup command:"
echo -e "  ${GRAY}docker compose -f $INSTALL_PATH/scripts/docker-compose.unraid.yml up -d${NC}"
echo -e "${CYAN}============================================================${NC}"

read -p "Press Enter to exit..."
