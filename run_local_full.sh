#!/bin/bash
# Full local devnet test: Anvil (BSC contracts) + chipotle-mock (Lit) +
# greenfield-local (private Greenfield chain, chain-id 9000).
#
# Usage: ./run_local_full.sh
#
# The Greenfield SDK needs an EIP-712 patch for local pre-Altai chains.
# This script installs npm deps, applies the patch, then manages the
# compose stack manually (detached start + wait) to avoid --abort-on-
# container-exit firing from the short-lived 'deploy' service.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/smartcontracts/docker-compose.yml"
RUNNER_CONTAINER="smartcontracts-local-full-e2e-1"

echo "==> Installing npm dependencies..."
(cd "$SCRIPT_DIR/smartcontracts/e2e"              && npm install --no-audit --no-fund)
(cd "$SCRIPT_DIR/smartcontracts/greenfield-testnet" && npm install --no-audit --no-fund)

echo "==> Applying Greenfield SDK local-chain EIP-712 patch..."
node "$SCRIPT_DIR/patch_sdk.cjs"

cleanup() {
    echo ""
    echo "==> Tearing down local-full stack..."
    docker compose -f "$COMPOSE_FILE" --profile local-full down --remove-orphans -v 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "==> Starting local-full stack (detached)..."
docker compose -f "$COMPOSE_FILE" --profile local-full up --build -d

# Wait for greenfield-local (healthcheck = /tmp/gvg_bootstrapped present, ~2 min)
echo "==> Waiting for greenfield-local to become healthy..."
for i in $(seq 1 120); do
    STATUS=$(docker inspect smartcontracts-greenfield-local-1 \
        --format='{{.State.Health.Status}}' 2>/dev/null || echo "starting")
    if [ "$STATUS" = "healthy" ]; then
        echo "    greenfield-local healthy after ${i}×5s"
        break
    fi
    if [ "$i" -eq 120 ]; then
        echo "ERROR: greenfield-local did not become healthy in 600s"
        docker logs smartcontracts-greenfield-local-1 | tail -20
        exit 1
    fi
    echo -n "."
    sleep 5
done

# Wait for chipotle-mock (fast, should already be healthy)
echo "==> Waiting for chipotle-mock..."
for i in $(seq 1 30); do
    STATUS=$(docker inspect smartcontracts-chipotle-mock-1 \
        --format='{{.State.Health.Status}}' 2>/dev/null || echo "starting")
    [ "$STATUS" = "healthy" ] && break
    sleep 3
done

echo "==> Streaming local-full-e2e logs..."
docker compose -f "$COMPOSE_FILE" --profile local-full logs -f local-full-e2e 2>&1 &
LOGS_PID=$!

# Wait for e2e runner to complete
docker wait "$RUNNER_CONTAINER" >/dev/null 2>&1 || true
kill "$LOGS_PID" 2>/dev/null || true

EXIT_CODE=$(docker inspect "$RUNNER_CONTAINER" \
    --format='{{.State.ExitCode}}' 2>/dev/null || echo "1")

echo ""
echo "========================================="
echo " local-full E2E done (exit code: $EXIT_CODE)"
echo "========================================="
exit "$EXIT_CODE"
