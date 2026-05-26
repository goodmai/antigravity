#!/bin/bash
set -euo pipefail

# Daskibo DEVNET launcher — deploy contracts to BSC testnet, publish an
# NFT-gated course to Greenfield testnet (Lit datil-dev), and leave the
# reader frontend running on :8099. Unlike run_e2e_lit.sh this stack is
# PERSISTENT: it brings the frontend up and does NOT tear it down on exit.
#
#   DEVNET_DEPLOYER_KEY / _ADDR            funded tBNB on BSC testnet (97)
#   GREENFIELD_TESTNET_PRIVATE_KEY / _ADDRESS  funded tBNB on Greenfield (5600)
#   (a single funded testnet wallet usually serves both)
#
#   ./run_devnet.sh            # up + wait for deploy/publish, keep frontend
#   ./run_devnet.sh down       # stop the frontend

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/smartcontracts/docker-compose.devnet.yml"
cd "$SCRIPT_DIR/smartcontracts"
mkdir -p ../logs

dc() { docker compose -f "$COMPOSE_FILE" "$@"; }

if [ "${1:-up}" = "down" ]; then
  echo "==> Stopping devnet…"
  dc down --remove-orphans
  exit 0
fi

# --- Dependency checks ---
command -v docker >/dev/null 2>&1 || { echo "ERROR: docker not installed."; exit 1; }
docker info >/dev/null 2>&1 || { echo "ERROR: docker daemon not reachable."; exit 1; }

# A funded BSC-testnet deployer key is required; default it to the Greenfield
# testnet key when unset (common case: one wallet funded on both chains).
export DEVNET_DEPLOYER_KEY="${DEVNET_DEPLOYER_KEY:-${GREENFIELD_TESTNET_PRIVATE_KEY:-}}"
export DEVNET_DEPLOYER_ADDR="${DEVNET_DEPLOYER_ADDR:-${GREENFIELD_TESTNET_ADDRESS:-}}"

missing=0
for v in DEVNET_DEPLOYER_KEY DEVNET_DEPLOYER_ADDR GREENFIELD_TESTNET_PRIVATE_KEY GREENFIELD_TESTNET_ADDRESS; do
  if [ -z "${!v:-}" ]; then echo "ERROR: \$$v is not set"; missing=1; fi
done
if [ "$missing" = "1" ]; then
  echo ""
  echo "Set a funded testnet wallet, e.g.:"
  echo "  export GREENFIELD_TESTNET_PRIVATE_KEY=0x...   # tBNB on BSC + Greenfield"
  echo "  export GREENFIELD_TESTNET_ADDRESS=0x..."
  exit 1
fi

echo "========================================="
echo " Starting Daskibo DEVNET (real testnets) "
echo "========================================="
echo "  Contracts → BSC testnet 97   (${BSC_TESTNET_RPC:-data-seed-prebsc-1-s1.bnbchain.org:8545})"
echo "  Storage   → Greenfield testnet 5600"
echo "  Lit       → datil-dev (free)"
echo ""

# Clean any stale one-shot containers, then build + start.
dc down --remove-orphans >/dev/null 2>&1 || true
dc up --build -d

# --- Wait for the one-shot deploy + publish to finish ---
wait_exit() {  # container name → echoes exit code once stopped
  local c="$1" timeout="${2:-600}"
  echo -n "==> Waiting for $c…"
  for _ in $(seq 1 "$timeout"); do
    local status code
    status=$(docker inspect "$c" --format='{{.State.Status}}' 2>/dev/null || echo "missing")
    if [ "$status" = "exited" ]; then
      code=$(docker inspect "$c" --format='{{.State.ExitCode}}')
      [ "$code" = "0" ] && echo " [OK]" || { echo " [FAILED exit=$code]"; docker logs "$c" | tail -n 30; }
      echo "$code"; return
    fi
    echo -n "."; sleep 2
  done
  echo " [TIMEOUT]"; echo "1"
}

DEPLOY_CODE=$(wait_exit daskibo-devnet-deploy 600 | tail -n1)
[ "$DEPLOY_CODE" = "0" ] || { echo "Deploy failed — see logs above."; exit 1; }

WRITER_CODE=$(wait_exit daskibo-devnet-writer 600 | tail -n1)
[ "$WRITER_CODE" = "0" ] || { echo "Publish failed — see logs above."; exit 1; }

echo ""
echo "========================================="
echo " DEVNET READY — frontend is live"
echo "========================================="
docker logs daskibo-devnet-writer 2>&1 | grep -A2 "bucket-reader.html" | tail -n 3 || true
echo ""
echo "  Reader:   http://localhost:8099/bucket-reader.html  (see bucket name above)"
echo "  Builder:  http://localhost:8099/bucket-builder.html"
echo "  Addresses: docker compose -f $COMPOSE_FILE run --rm --no-deps devnet-deploy cat /shared/devnet-addresses.env"
echo ""
echo "  Stop:     ./run_devnet.sh down"
