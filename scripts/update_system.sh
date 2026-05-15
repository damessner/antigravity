#!/bin/bash
# ============================================================
# 🔄 update_system.sh
# School Management System — GitHub Synchronizer (Linux)
# ============================================================

REPO_URL="https://github.com/damessner/antigravity.git"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors
CYAN='\033[0;36m'
WHITE='\033[1;37m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
GRAY='\033[0;90m'
NC='\033[0m'

print_header() {
  echo -e "${CYAN}============================================================${NC}"
  echo -e "${WHITE} $1${NC}"
  echo -e "${CYAN}============================================================${NC}"
  echo ""
}

clear
print_header "🔄 System Update Utility (Linux/Unraid/Proxmox)"

cd "$PROJECT_ROOT" || exit 1

# 1. Check for Git
if ! command -v git &> /dev/null; then
    echo -e "${RED} [FAIL] Git is not installed.${NC}"
    echo -e " Please install git (e.g., 'apt install git' or via Unraid plugins)."
    exit 1
fi

# 2. Check if this is a Git repository
if [ ! -d ".git" ]; then
    echo -e "${YELLOW} [INFO] This folder was not downloaded via Git.${NC}"
    echo -e " To enable one-click updates, you should clone the repository using:"
    echo -e " ${CYAN}git clone $REPO_URL${NC}"
    exit 1
fi

# 3. Ensure Remote URL is correct
current_remote=$(git remote get-url origin 2>/dev/null)
if [ -z "$current_remote" ]; then
    echo -e "${GRAY} [INFO] Adding remote 'origin' pointing to $REPO_URL${NC}"
    git remote add origin "$REPO_URL"
elif [ "$current_remote" != "$REPO_URL" ] && [ "$current_remote" != "${REPO_URL}.git" ]; then
    # Check without .git as well
    if [ "$current_remote" != "${REPO_URL%.git}" ]; then
        echo -e "${GRAY} [INFO] Updating remote 'origin' to $REPO_URL (was $current_remote)${NC}"
        git remote set-url origin "$REPO_URL"
    fi
fi

# 4. Check for local changes
if [ -n "$(git status --porcelain)" ]; then
    echo -e "${YELLOW} [WARN] You have local changes in the folder.${NC}"
    echo -e "${GRAY} Updating might overwrite your changes or cause conflicts.${NC}"
    read -p " Proceed with update anyway? (y/N): " confirm
    if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
        echo " Update cancelled."
        exit 0
    fi
fi

# 5. Fetch and Pull
echo -e "${WHITE}>> Checking for updates on GitHub...${NC}"
git fetch origin main 2>&1 | while read line; do echo -e "   ${GRAY}$line${NC}"; done

local_hash=$(git rev-parse HEAD)
remote_hash=$(git rev-parse origin/main)
base_hash=$(git merge-base HEAD origin/main)

if [ "$local_hash" == "$remote_hash" ]; then
    echo -e "\n${GREEN} [OK] System is already up to date.${NC}"
elif [ "$local_hash" == "$base_hash" ]; then
    echo -e "\n${GREEN} [UPDATE FOUND] New version available!${NC}"
    read -p " Download and install update now? (y/N): " do_pull
    if [[ "$do_pull" =~ ^[Yy]$ ]]; then
        echo -e "${WHITE}>> Pulling changes...${NC}"
        git pull origin main 2>&1 | while read line; do echo -e "   ${GRAY}$line${NC}"; done
        
        echo -e "\n${WHITE}>> Rebuilding Docker containers to apply updates...${NC}"
        docker compose build 2>&1 | while read line; do echo -e "   ${GRAY}$line${NC}"; done
        
        # 6. Finalize
        echo -e "\n${GREEN} [SUCCESS] Update complete!${NC}"
        echo -en "${YELLOW}>> Would you like to restart the system now? (y/n): ${NC}"
        read -r response

        if [[ "$response" =~ ^([yY][eE][sS]|[yY])+$ ]]; then
            echo -e "${WHITE}>> Starting system...${NC}"
            ./scripts/restart_system.sh
        else
            echo -e "${GRAY}>> Update finished without restart. Run './scripts/restart_system.sh' manually when ready.${NC}"
        fi

        echo ""
        read -p "Press Enter to exit..."
    fi
elif [ "$remote_hash" == "$base_hash" ]; then
    echo -e "\n${CYAN} [INFO] You are ahead of the official version (Local Commits).${NC}"
else
    echo -e "\n${RED} [WARN] Version mismatch (Diverged). Manual resolution needed.${NC}"
fi

echo ""
read -p "Press Enter to exit..."
