#!/bin/bash
set -euo pipefail

# Daskibo DEMO launcher — fully local, MetaMask-driven course-sale demo.
# Brings up a local Anvil chain, deploys + seeds the marketplace, and leaves
# the frontend running on :8099. No real funds, no external config — a
# throwaway local chain you drive from the browser as Author / Client / Eve.
#
#   ./run_demo.sh            # up + wait for deploy, keep frontend running
#   ./run_demo.sh down       # stop + wipe the local chain
#
# Then open:  http://localhost:8099/course-demo.html
# Import the Anvil keys from .env (DEMO_*) into MetaMask and add the local
# network — see README "Local course demo".

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/smartcontracts/docker-compose.demo.yml"
cd "$SCRIPT_DIR/smartcontracts"

dc() { docker compose -f "$COMPOSE_FILE" "$@"; }

if [ "${1:-up}" = "down" ]; then
  echo "==> Stopping demo (and wiping the local chain)…"
  dc down -v --remove-orphans
  exit 0
fi

command -v docker >/dev/null 2>&1 || { echo "ERROR: docker not installed."; exit 1; }
docker info >/dev/null 2>&1 || { echo "ERROR: docker daemon not reachable."; exit 1; }

echo "========================================="
echo " Starting Daskibo DEMO (local Anvil)     "
echo "========================================="
echo "  Chain    → Anvil 31337 on http://127.0.0.1:8545"
echo "  Contracts→ Treasury / AccessPass / CourseMarketplace (local)"
echo "  Frontend → http://localhost:8099/course-demo.html"
echo ""

dc down -v --remove-orphans >/dev/null 2>&1 || true
dc up --build -d

# --- Wait for the one-shot deploy to finish ---
echo -n "==> Waiting for contracts to deploy…"
CODE=1
for _ in $(seq 1 300); do
  status=$(docker inspect daskibo-demo-deploy --format='{{.State.Status}}' 2>/dev/null || echo "missing")
  if [ "$status" = "exited" ]; then
    CODE=$(docker inspect daskibo-demo-deploy --format='{{.State.ExitCode}}')
    if [ "$CODE" = "0" ]; then echo " [OK]"; else
      echo " [FAILED exit=$CODE]"; docker logs daskibo-demo-deploy | tail -n 40
    fi
    break
  fi
  echo -n "."; sleep 2
done
[ "$CODE" = "0" ] || { echo "Deploy failed — see logs above."; exit 1; }

echo ""
echo "========================================="
echo " DEMO READY — frontend is live"
echo "========================================="
docker logs daskibo-demo-deploy 2>&1 | grep -A5 "DEMO CONTRACTS DEPLOYED" | tail -n 6 || true
echo ""
echo "  Open:     http://localhost:8099/course-demo.html"
echo "  RPC:      http://127.0.0.1:8545   (chain id 31337 / 0x7a69)"
echo "  Keys:     import DEMO_AUTHOR_PK / DEMO_CLIENT_PK / DEMO_EVE_PK from .env into MetaMask"
echo "  Stop:     ./run_demo.sh down"
