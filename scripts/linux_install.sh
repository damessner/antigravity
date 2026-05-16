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
    echo -e "${YELLOW} [INFO] Existing installation found at $INSTALL_DIR.${NC}"
    echo -e "${RED} 🔥 DANGER ZONE: Do you want to trigger a FULL CLEAN SLATE?${NC}"
    echo -e "    This will wipe ALL data and reset the system to factory defaults."
    echo -en "${WHITE} >> Trigger Clean Slate? (y/N): ${NC}"
    read -r do_clean_slate
    
    if [[ "$do_clean_slate" =~ ^([yY][eE][sS]|[yY])+$ ]]; then
        echo -en "${RED}    Enter confirmation code to proceed: ${NC}"
        read -r confirm_code
        if [ "$confirm_code" == "weissenbach" ]; then
            echo -e "${RED} >> CLEAN SLATE INITIATED...${NC}"
            
            # Step out to a safe directory before wiping
            cd /tmp
            
            # Force stop containers if possible
            if [ -d "$OLDPWD/$INSTALL_DIR" ]; then
                echo -e "${YELLOW} >> Stopping existing containers...${NC}"
                cd "$OLDPWD/$INSTALL_DIR" && docker compose down -v --remove-orphans 2>/dev/null || true
                cd /tmp
            fi

            # Brute force removal of any remaining containers with "antigravity" in the name
            echo -e "${YELLOW} >> Force-removing any zombie Antigravity containers...${NC}"
            docker ps -a --format '{{.Names}}' | grep "antigravity" | xargs -I {} docker rm -f {} 2>/dev/null || true

            echo -e "${YELLOW} >> Wiping all data...${NC}"
            rm -rf "$OLDPWD/$INSTALL_DIR" 2>/dev/null || true
            sleep 1
            
            echo -e "${WHITE}>> Re-cloning fresh Antigravity...${NC}"
            git clone $REPO_URL "$OLDPWD/$INSTALL_DIR"
            cd "$OLDPWD/$INSTALL_DIR"
        else
            echo -e "${YELLOW} [INFO] Confirmation code incorrect. Proceeding with standard update.${NC}"
            cd "$INSTALL_DIR" && git pull origin main
        fi
    else
        echo -e "${WHITE}>> Updating existing installation...${NC}"
        cd "$INSTALL_DIR" && git pull origin main
    fi
else
    git clone $REPO_URL "$INSTALL_DIR"
    cd "$INSTALL_DIR"
fi

# 5. Fix permissions
chmod +x scripts/*.sh

# 6. Optional: Enable Auto-Updates (Cron)
echo -en "${YELLOW}>> Enable automatic nightly updates & backups at 2:00 AM? (y/n): ${NC}"
read -r auto_update
if [[ "$auto_update" =~ ^([yY][eE][sS]|[yY])+$ ]]; then
    (crontab -l 2>/dev/null; echo "0 2 * * * /bin/bash $(pwd)/scripts/auto_updater.sh") | crontab -
    echo -e "   ${GREEN}✅ Auto-updates scheduled for 2:00 AM.${NC}"
fi

# 7. Launch System
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
