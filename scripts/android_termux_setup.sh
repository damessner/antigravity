#!/data/data/com.termux/files/usr/bin/bash
# ============================================================
# 📱 Antigravity Android (Termux) Installer
# Native deployment for "Pocket Server" mode.
# ============================================================

REPO_URL="https://github.com/damessner/antigravity.git"
INSTALL_PATH="$HOME/antigravity"

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
echo -e "${WHITE}  🏫 Antigravity Android Setup (Termux)${NC}"
echo -e "${CYAN}============================================================${NC}"

# 1. Install Prerequisites
echo -e "${WHITE}>> Installing packages (Node.js, Postgres, Git)...${NC}"
pkg update -y &>/dev/null
pkg install -y nodejs-lts postgresql git curl ncurses-utils &>/dev/null

# 2. Database Initialization
echo -e "${WHITE}>> Initializing PostgreSQL database...${NC}"
if [ ! -d "$PREFIX/var/lib/postgresql" ]; then
    mkdir -p "$PREFIX/var/lib/postgresql"
    initdb "$PREFIX/var/lib/postgresql" &>/dev/null
fi

# Start Postgres if not running
if ! pg_ctl -D "$PREFIX/var/lib/postgresql" status &>/dev/null; then
    pg_ctl -D "$PREFIX/var/lib/postgresql" start &>/dev/null
    sleep 2
fi

# Create DB and User (ignore if exists)
createdb school_management 2>/dev/null || true
psql -d postgres -c "CREATE USER postgres WITH SUPERUSER PASSWORD 'postgres';" 2>/dev/null || true

# 3. Clone and Install
echo -e "${WHITE}>> Downloading Antigravity...${NC}"
if [ -d "$INSTALL_PATH" ]; then
    cd "$INSTALL_PATH" && git pull origin main
else
    git clone $REPO_URL "$INSTALL_PATH"
    cd "$INSTALL_PATH"
fi

# 4. Building Backend
echo -e "${WHITE}>> Building Backend...${NC}"
cd "$INSTALL_PATH/backend"
npm install --silent

# 5. Building Frontend
echo -e "${WHITE}>> Building Frontend... (this may take a few minutes)${NC}"
cd "$INSTALL_PATH/frontend"
npm install --silent

# 6. Setup PM2 for process management
echo -e "${WHITE}>> Setting up process manager (PM2)...${NC}"
npm install -g pm2 --silent &>/dev/null

# 7. Start Services
echo -e "${WHITE}>> Starting services...${NC}"
pm2 delete all &>/dev/null || true
cd "$INSTALL_PATH/backend"
pm2 start server.js --name "antigravity-api"
cd "$INSTALL_PATH/frontend"
# For Termux, we run the dev server or build/serve. Dev is easier for pocket mode.
pm2 start "npm run dev" --name "antigravity-ui"

# 8. Success Message
echo -e "\n${CYAN}============================================================${NC}"
echo -e "${GREEN}  🎉 POCKET SERVER IS LIVE!${NC}"
echo -e "${CYAN}============================================================${NC}"
echo -e "${WHITE}  Your Android phone is now a server.${NC}"
echo -e "${WHITE}  Access it at:${NC}"
echo -e "   ${CYAN}http://localhost:3000${NC}"
echo -e "   ${CYAN}http://$(ifconfig wlan0 | grep 'inet ' | awk '{print $2}'):3000${NC}"
echo -e ""
echo -e "${WHITE}  Useful commands:${NC}"
echo -e "   - ${GRAY}pm2 status${NC} (Check if running)"
echo -e "   - ${GRAY}pm2 logs${NC}   (See errors)"
echo -e "   - ${GRAY}pm2 restart all${NC}"
echo -e "${CYAN}============================================================${NC}"

read -p "Press Enter to exit..."
