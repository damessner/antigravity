#!/usr/bin/env bash
# ==============================================================================
# 🔐 setup_access.sh — Universal Exposure Wizard
# Schulmanagement V2.3 — Enterprise Remote Access Setup
# ==============================================================================
# This wizard configures remote access for the school management platform.
# It writes settings to .env and prepares the correct Docker Compose profiles.
#
# Usage: sudo ./scripts/setup_access.sh
# ==============================================================================

set -euo pipefail

# ── Helpers ──────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$PROJECT_ROOT/.env"
COMPOSE_FILE="$PROJECT_ROOT/docker-compose.prod.yml"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
BOLD='\033[1m'
RESET='\033[0m'

info()    { echo -e "${CYAN}ℹ️  $*${RESET}"; }
success() { echo -e "${GREEN}✅ $*${RESET}"; }
warn()    { echo -e "${YELLOW}⚠️  $*${RESET}"; }
error()   { echo -e "${RED}❌ $*${RESET}"; }
header()  { echo -e "\n${BOLD}${CYAN}$*${RESET}\n"; }

# Write or update a key=value pair in .env (no duplicate keys)
set_env_var() {
  local key="$1"
  local value="$2"
  if grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
    # Replace existing line (portable sed)
    sed -i "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
  else
    echo "${key}=${value}" >> "$ENV_FILE"
  fi
}

# ── Banner ───────────────────────────────────────────────────────────────────
clear
echo -e "${BOLD}${CYAN}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║   🔐  Schulmanagement V2.3 — Universal Exposure Wizard       ║"
echo "║   Configure secure remote access in under 2 minutes          ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${RESET}"

# ── Pre-flight checks ────────────────────────────────────────────────────────
header "🔍 Pre-flight Checks"

if ! command -v docker &>/dev/null; then
  error "Docker is not installed or not in PATH."
  error "Run check_requirements.sh first."
  exit 1
fi
success "Docker found: $(docker --version | head -1)"

if [ ! -f "$COMPOSE_FILE" ]; then
  error "docker-compose.prod.yml not found at $PROJECT_ROOT"
  error "Please ensure you are running this from the project directory."
  exit 1
fi
success "Production compose file found."

# Ensure .env exists
touch "$ENV_FILE"
info "Settings will be written to: $ENV_FILE"
echo ""

# ── Access Method Selection ───────────────────────────────────────────────────
header "🌐 Choose Your Remote Access Method"

echo -e "  ${BOLD}1) ☁️  Cloudflare Tunnels${RESET}  — Zero-config, no open ports required."
echo      "     Best for: Schools without a public IP or complex firewall."
echo      "     Requires: A free Cloudflare account and a Tunnel Token."
echo ""
echo -e "  ${BOLD}2) 🔒 Tailscale${RESET}             — Private WireGuard mesh network."
echo      "     Best for: Secure staff-only access without public exposure."
echo      "     Requires: A free Tailscale account and an Auth Key."
echo ""
echo -e "  ${BOLD}3) 🏠 Local / Traefik${RESET}       — Standard port 80/443 exposure."
echo      "     Best for: Schools with their own reverse proxy (Nginx, Caddy, Traefik)."
echo      "     Requires: DNS pointing to this server."
echo ""

read -rp "$(echo -e "${BOLD}Enter choice [1/2/3]:${RESET} ")" ACCESS_CHOICE
echo ""

# ── Option 1: Cloudflare Tunnels ─────────────────────────────────────────────
setup_cloudflare() {
  header "☁️  Cloudflare Tunnel Setup"
  echo "  How to get your Tunnel Token:"
  echo "  1. Go to https://one.dash.cloudflare.com → Zero Trust → Networks → Tunnels"
  echo "  2. Create a new Tunnel (type: Cloudflared)"
  echo "  3. Copy the token shown on the 'Install connector' page"
  echo ""

  while true; do
    read -rsp "$(echo -e "${BOLD}  Paste your Cloudflare Tunnel Token:${RESET} ")" CF_TOKEN
    echo ""
    if [[ -n "$CF_TOKEN" && ${#CF_TOKEN} -gt 20 ]]; then
      break
    fi
    warn "Token appears too short. Please paste the full token."
  done

  set_env_var "CLOUDFLARE_TUNNEL_TOKEN" "$CF_TOKEN"
  set_env_var "COMPOSE_PROFILES" "cloudflare"

  success "Cloudflare Tunnel token saved."
  echo ""
  info "The cloudflared sidecar will be started with the 'cloudflare' profile."
  echo ""
  echo -e "  ${BOLD}Next step — configure your Tunnel in Cloudflare Dashboard:${RESET}"
  echo "  • Add a Public Hostname pointing to http://school_frontend:3000"
  echo "  • Optionally add http://school_backend:4000 for API direct access"
  echo ""
}

# ── Option 2: Tailscale ───────────────────────────────────────────────────────
setup_tailscale() {
  header "🔒 Tailscale Setup"
  echo "  How to get your Auth Key:"
  echo "  1. Go to https://login.tailscale.com/admin/settings/keys"
  echo "  2. Click 'Generate auth key'"
  echo "  3. Recommended: check 'Reusable' and set an expiry"
  echo ""

  while true; do
    read -rsp "$(echo -e "${BOLD}  Paste your Tailscale Auth Key:${RESET} ")" TS_KEY
    echo ""
    if [[ "$TS_KEY" == tskey-* ]]; then
      break
    fi
    warn "Key should start with 'tskey-'. Please check and try again."
  done

  read -rp "$(echo -e "${BOLD}  Tailscale hostname for this server [schulmanagement]:${RESET} ")" TS_HOSTNAME
  TS_HOSTNAME="${TS_HOSTNAME:-schulmanagement}"

  set_env_var "TAILSCALE_AUTH_KEY" "$TS_KEY"
  set_env_var "TAILSCALE_HOSTNAME" "$TS_HOSTNAME"
  set_env_var "COMPOSE_PROFILES" "tailscale"

  success "Tailscale Auth Key and hostname saved."
  echo ""
  warn "Tailscale requires /dev/net/tun. Ensure TUN is available on your host."
  info "On Proxmox LXC, enable 'TUN' device in the container options."
  echo ""
  info "After starting, access your app at: http://${TS_HOSTNAME}:3000"
  echo ""
}

# ── Option 3: Local / Traefik ─────────────────────────────────────────────────
setup_local_traefik() {
  header "🏠 Local / Traefik / Reverse Proxy Setup"
  echo ""
  info "No additional sidecars will be started."
  echo ""
  echo "  Point your reverse proxy at:"
  echo "    • Frontend:  http://localhost:3000  (or http://school_frontend:3000)"
  echo "    • Backend:   http://localhost:4000  (or http://school_backend:4000)"
  echo ""
  echo "  Traefik label example (add to frontend service in your own compose override):"
  echo ""
  echo -e "  ${YELLOW}labels:"
  echo "    - 'traefik.enable=true'"
  echo "    - 'traefik.http.routers.schulmanagement.rule=Host(\`schule.example.at\`)'"
  echo -e "    - 'traefik.http.routers.schulmanagement.tls.certresolver=letsencrypt'${RESET}"
  echo ""

  read -rp "$(echo -e "${BOLD}  Enter your school's domain (e.g. schule.example.at) [skip]:${RESET} ")" SCHOOL_DOMAIN
  if [[ -n "$SCHOOL_DOMAIN" ]]; then
    set_env_var "SCHOOL_DOMAIN" "$SCHOOL_DOMAIN"
    success "Domain saved: $SCHOOL_DOMAIN"
  fi

  set_env_var "COMPOSE_PROFILES" ""
}

# ── Dispatch ──────────────────────────────────────────────────────────────────
case "$ACCESS_CHOICE" in
  1) setup_cloudflare ;;
  2) setup_tailscale  ;;
  3) setup_local_traefik ;;
  *)
    error "Invalid choice. Please run the script again and enter 1, 2, or 3."
    exit 1
    ;;
esac

# ── Optional: Rclone Cloud Backup ─────────────────────────────────────────────
header "☁️  Optional: Cloud Backup with Rclone"
echo "  Rclone can automatically encrypt and sync your backups"
echo "  to Google Drive, OneDrive, or any other supported cloud."
echo ""
read -rp "$(echo -e "${BOLD}  Enable Rclone cloud backup? (y/N):${RESET} ")" ENABLE_RCLONE
echo ""

if [[ "$ENABLE_RCLONE" =~ ^[Yy]$ ]]; then
  echo -e "  ${BOLD}Cloud Provider:${RESET}"
  echo "    1) Google Drive"
  echo "    2) OneDrive"
  echo "    3) Other (I'll configure rclone.conf manually)"
  echo ""
  read -rp "$(echo -e "${BOLD}  Choose provider [1/2/3]:${RESET} ")" RCLONE_PROVIDER
  echo ""

  RCLONE_CONF_DIR="$PROJECT_ROOT/school_data/rclone"
  mkdir -p "$RCLONE_CONF_DIR"

  case "$RCLONE_PROVIDER" in
    1) REMOTE_TYPE="drive"; REMOTE_NAME="gdrive" ;;
    2) REMOTE_TYPE="onedrive"; REMOTE_NAME="onedrive" ;;
    *) REMOTE_TYPE=""; REMOTE_NAME="myremote" ;;
  esac

  if [[ -n "$REMOTE_TYPE" ]]; then
    info "Launching interactive rclone config for '$REMOTE_NAME'..."
    info "This will open a browser for OAuth authentication."
    echo ""

    if command -v rclone &>/dev/null; then
      rclone config create "$REMOTE_NAME" "$REMOTE_TYPE" --config "$RCLONE_CONF_DIR/rclone.conf"
      success "rclone remote '$REMOTE_NAME' configured."
    else
      warn "rclone is not installed on this host."
      warn "Install it with: curl https://rclone.org/install.sh | sudo bash"
      warn "Then run: rclone config --config $RCLONE_CONF_DIR/rclone.conf"
      warn "Create a remote named '$REMOTE_NAME' of type '$REMOTE_TYPE'."
      info "Skipping interactive config. You can configure rclone.conf manually."
    fi
  else
    info "Place your rclone.conf at: $RCLONE_CONF_DIR/rclone.conf"
    info "The remote name to use will be set in RCLONE_REMOTE_PATH."
  fi

  read -rp "$(echo -e "${BOLD}  Remote path for backups [${REMOTE_NAME}:schulmanagement/backups]:${RESET} ")" RCLONE_PATH
  RCLONE_PATH="${RCLONE_PATH:-${REMOTE_NAME}:schulmanagement/backups}"
  set_env_var "RCLONE_REMOTE_PATH" "$RCLONE_PATH"

  read -rsp "$(echo -e "${BOLD}  Optional: Encryption password for backups (leave blank to skip):${RESET} ")" RCLONE_PASS
  echo ""
  if [[ -n "$RCLONE_PASS" ]]; then
    set_env_var "RCLONE_CRYPT_PASSWORD" "$RCLONE_PASS"
    success "Encryption password saved."
  fi

  read -rp "$(echo -e "${BOLD}  Sync interval in seconds [300]:${RESET} ")" RCLONE_INTERVAL
  RCLONE_INTERVAL="${RCLONE_INTERVAL:-300}"
  set_env_var "RCLONE_SYNC_INTERVAL" "$RCLONE_INTERVAL"

  # Append 'rclone' to the COMPOSE_PROFILES value
  CURRENT_PROFILES=$(grep "^COMPOSE_PROFILES=" "$ENV_FILE" 2>/dev/null | cut -d= -f2 || echo "")
  if [[ -z "$CURRENT_PROFILES" ]]; then
    set_env_var "COMPOSE_PROFILES" "rclone"
  else
    set_env_var "COMPOSE_PROFILES" "${CURRENT_PROFILES},rclone"
  fi

  success "Rclone sidecar configured. Syncing to: $RCLONE_PATH every ${RCLONE_INTERVAL}s"
fi

# ── Launch ────────────────────────────────────────────────────────────────────
header "🚀 Ready to Launch"

FINAL_PROFILES=$(grep "^COMPOSE_PROFILES=" "$ENV_FILE" 2>/dev/null | cut -d= -f2 || echo "")
if [[ -n "$FINAL_PROFILES" ]]; then
  PROFILE_FLAGS=""
  IFS=',' read -ra PROFILE_ARR <<< "$FINAL_PROFILES"
  for p in "${PROFILE_ARR[@]}"; do
    [[ -n "$p" ]] && PROFILE_FLAGS+=" --profile $p"
  done
  LAUNCH_CMD="docker compose -f docker-compose.prod.yml$PROFILE_FLAGS up -d"
else
  LAUNCH_CMD="docker compose -f docker-compose.prod.yml up -d"
fi

echo -e "  Configuration saved to: ${BOLD}$ENV_FILE${RESET}"
echo -e "  Active profiles: ${BOLD}${FINAL_PROFILES:-none (core services only)}${RESET}"
echo ""
echo -e "  Launch command: ${YELLOW}${LAUNCH_CMD}${RESET}"
echo ""

read -rp "$(echo -e "${BOLD}  Launch the system now? (Y/n):${RESET} ")" LAUNCH_NOW
if [[ ! "$LAUNCH_NOW" =~ ^[Nn]$ ]]; then
  echo ""
  info "Starting Schulmanagement with selected profile(s)..."
  cd "$PROJECT_ROOT"
  eval "$LAUNCH_CMD"
  echo ""
  success "System launched! 🎉"
  echo ""
  echo "  Access at:"
  echo "    🌐 http://localhost:3000"
  [[ "$ACCESS_CHOICE" == "2" ]] && echo "    🔒 http://${TS_HOSTNAME:-schulmanagement}:3000 (via Tailscale)"
  echo ""
  echo "  Default admin login: da.messner / weissenbach"
  echo "  (You will be prompted to change the password on first login)"
else
  echo ""
  info "Setup complete. Run the following command when ready:"
  echo -e "  ${YELLOW}${LAUNCH_CMD}${RESET}"
fi

echo ""
success "Universal Exposure Wizard complete. ✨"
echo ""
