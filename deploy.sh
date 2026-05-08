#!/usr/bin/env bash
set -euo pipefail

# ── Colours ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

info()  { echo -e "${CYAN}${BOLD}[finwise]${RESET} $*"; }
ok()    { echo -e "${GREEN}✔${RESET}  $*"; }
warn()  { echo -e "${YELLOW}⚠${RESET}  $*"; }
fail()  { echo -e "${RED}✖${RESET}  $*" >&2; }
die()   { fail "$*"; exit 1; }

COMPOSE_FILE="docker_compose.yml"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Change to project root ─────────────────────────────────────────────────────
cd "$SCRIPT_DIR"

echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${BOLD}  Finwise — Deploy${RESET}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""

# ── 1. Prerequisites ───────────────────────────────────────────────────────────
info "Checking prerequisites…"

command -v docker &>/dev/null          || die "docker not found — install Docker first"
docker compose version &>/dev/null     || die "docker compose plugin not found"
[[ -f "$COMPOSE_FILE" ]]               || die "$COMPOSE_FILE not found (run from project root)"

ok "Docker $(docker --version | grep -oP '\d+\.\d+\.\d+')"
ok "Docker Compose $(docker compose version --short)"

# ── 2. .env check ─────────────────────────────────────────────────────────────
echo ""
info "Checking environment…"

ENV_FILE=".env"
ENV_MISSING=0

if [[ ! -f "$ENV_FILE" ]]; then
  warn ".env file not found — creating from .env.example"
  if [[ -f ".env.example" ]]; then
    cp .env.example "$ENV_FILE"
    warn "Created .env — you must fill in the required values before deploying"
  else
    die ".env.example not found either — cannot continue"
  fi
else
  ok ".env file found"
fi

# Load .env (ignore comments and blank lines)
set -o allexport
# shellcheck disable=SC1090
source <(grep -v '^\s*#' "$ENV_FILE" | grep -v '^\s*$') 2>/dev/null || true
set +o allexport

# Required variables (these have :? in docker_compose.yml and will abort compose)
declare -A REQUIRED_VARS=(
  [POSTGRES_PASSWORD]="Password for the PostgreSQL database"
  [JWT_SECRET]="Secret key for signing JWT tokens (use a long random string)"
)

# Optional variables with their defaults (informational only)
declare -A OPTIONAL_VARS=(
  [POSTGRES_USER]="finwise"
  [POSTGRES_DB]="finwise"
  [APP_PORT]="3002"
  [OLLAMA_URL]="http://host.docker.internal:11434"
)

for var in "${!REQUIRED_VARS[@]}"; do
  if [[ -z "${!var:-}" ]]; then
    fail "Required variable ${BOLD}$var${RESET} is not set  (${REQUIRED_VARS[$var]})"
    ENV_MISSING=1
  else
    ok "$var is set"
  fi
done

if [[ $ENV_MISSING -eq 1 ]]; then
  echo ""
  die "Fix the missing variables in ${ENV_FILE} and re-run deploy.sh"
fi

echo ""
info "Optional variables (using defaults where unset):"
for var in "${!OPTIONAL_VARS[@]}"; do
  val="${!var:-${OPTIONAL_VARS[$var]}}"
  echo -e "    ${var} = ${BOLD}${val}${RESET}"
done

# ── 3. Build & start ───────────────────────────────────────────────────────────
echo ""
info "Building and starting services…"
echo ""

docker compose -f "$COMPOSE_FILE" up --build -d

# ── 4. Wait for health checks ──────────────────────────────────────────────────
echo ""
info "Waiting for services to become healthy…"

SERVICES=("finwise-postgres-1" "finwise-server-1")
TIMEOUT=90
INTERVAL=3

for service in "${SERVICES[@]}"; do
  elapsed=0
  printf "    %-28s" "$service"
  while true; do
    status=$(docker inspect --format='{{.State.Health.Status}}' "$service" 2>/dev/null || echo "missing")
    if [[ "$status" == "healthy" ]]; then
      echo -e " ${GREEN}healthy${RESET}"
      break
    elif [[ "$status" == "unhealthy" ]]; then
      echo -e " ${RED}unhealthy${RESET}"
      fail "Service $service is unhealthy — check logs with: docker logs $service --tail 50"
      break
    elif [[ $elapsed -ge $TIMEOUT ]]; then
      echo -e " ${YELLOW}timed out${RESET}"
      warn "Service $service did not report healthy within ${TIMEOUT}s"
      break
    fi
    sleep $INTERVAL
    elapsed=$((elapsed + INTERVAL))
    printf "."
  done
done

# ── 5. Detect host IP ─────────────────────────────────────────────────────────
PORT="${APP_PORT:-3002}"

LOCAL_IP=""
# Try common interface names
for iface in en0 eth0 enp0s3 ens18 enp3s0; do
  ip=$(ip addr show "$iface" 2>/dev/null | grep -oP '(?<=inet )\d+\.\d+\.\d+\.\d+' | head -1) || true
  if [[ -z "$ip" ]]; then
    ip=$(ipconfig getifaddr "$iface" 2>/dev/null) || true
  fi
  if [[ -n "$ip" ]]; then
    LOCAL_IP="$ip"
    break
  fi
done

# ── 6. Summary ────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${GREEN}${BOLD}  Deploy complete${RESET}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""
echo -e "  Local      ${BOLD}http://localhost:${PORT}${RESET}"
if [[ -n "$LOCAL_IP" ]]; then
  echo -e "  Network    ${BOLD}http://${LOCAL_IP}:${PORT}${RESET}"
fi
echo ""
echo -e "  Logs       docker compose -f $COMPOSE_FILE logs -f"
echo -e "  Stop       docker compose -f $COMPOSE_FILE down"
echo -e "  Status     docker compose -f $COMPOSE_FILE ps"
echo ""
