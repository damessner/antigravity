#!/bin/bash
# Antigravity System Teardown Utility
# This script completely stops and removes the Docker stack.

RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${RED}============================================================${NC}"
echo -e "${RED} 🔥 ANTIGRAVITY SYSTEM TEARDOWN${NC}"
echo -e "${RED}============================================================${NC}"
echo -e "${YELLOW}This will stop all containers and remove them from Docker.${NC}"
echo -en "Are you sure you want to proceed? (y/N): "
read -r confirm

if [[ ! "$confirm" =~ ^([yY][eE][sS]|[yY])+$ ]]; then
    echo "Teardown cancelled."
    exit 0
fi

# Locate docker-compose file
COMPOSE_FILE="docker-compose.yml"
if [ -f "scripts/docker-compose.unraid.yml" ]; then
    COMPOSE_FILE="scripts/docker-compose.unraid.yml"
fi

echo -e "${YELLOW}>> Stopping containers and removing volumes/networks...${NC}"
docker compose -f "$COMPOSE_FILE" down -v --remove-orphans

echo -en "${YELLOW}>> Do you also want to delete the Docker images to free space? (y/N): ${NC}"
read -r delete_images
if [[ "$delete_images" =~ ^([yY][eE][sS]|[yY])+$ ]]; then
    echo -e "${YELLOW}>> Removing Docker images...${NC}"
    docker compose -f "$COMPOSE_FILE" down --rmi all
fi

echo -e "${RED}============================================================${NC}"
echo -e "  ✅ TEARDOWN COMPLETE"
echo -e "  Containers, volumes, and networks have been removed."
echo -e "${RED}============================================================${NC}"
