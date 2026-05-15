#!/data/data/com.termux/files/usr/bin/bash
# ============================================================
# 📱 Antigravity Android (Termux) Update Utility
# ============================================================

INSTALL_PATH="$HOME/antigravity"

# Colors
CYAN='\033[0;36m'
WHITE='\033[1;37m'
GREEN='\033[0;32m'
GRAY='\033[0;90m'
NC='\033[0m'

echo -e "${CYAN}============================================================${NC}"
echo -e "${WHITE}  🏫 Antigravity Android Update${NC}"
echo -e "${CYAN}============================================================${NC}"

if [ ! -d "$INSTALL_PATH" ]; then
    echo -e "${RED} [FAIL] Installation not found at $INSTALL_PATH${NC}"
    exit 1
fi

cd "$INSTALL_PATH"

# 1. Pull Changes
echo -e "${WHITE}>> Checking for updates on GitHub...${NC}"
git fetch origin main
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

if [ "$LOCAL" == "$REMOTE" ]; then
    echo -e "${GREEN} [OK] System is already up to date.${NC}"
else
    echo -e "${GREEN} [UPDATE FOUND] Downloading new version...${NC}"
    git pull origin main
    
    # 2. Re-install dependencies
    echo -e "${WHITE}>> Updating dependencies...${NC}"
    cd backend && npm install --silent
    cd ../frontend && npm install --silent
    
    # 3. Restart Services
    echo -e "${WHITE}>> Restarting services...${NC}"
    pm2 restart all
    
    echo -e "\n${GREEN} [SUCCESS] Update complete and services restarted!${NC}"
fi

echo ""
read -p "Press Enter to exit..."
