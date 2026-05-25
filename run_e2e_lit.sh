#!/bin/bash
set -euo pipefail

# Work directory resolution
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/smartcontracts/docker-compose.lit.yml"

if [ ! -f "$COMPOSE_FILE" ]; then
    echo "ERROR: Docker compose file not found at $COMPOSE_FILE"
    exit 1
fi

cd "$SCRIPT_DIR/smartcontracts"
mkdir -p ../logs

# --- Dependency Checks ---
echo "==> Validating environment..."
export SIMULATOR_DIR="${SIMULATOR_DIR:-$HOME/GitHub/dstack/sdk/simulator}"
export CHIPOTLE_DIR="${CHIPOTLE_DIR:-$HOME/GitHub/chipotle}"
export GREENFIELD_REF="${GREENFIELD_REF:-v1.10.7}"

if [ ! -d "$SIMULATOR_DIR" ]; then
    echo "ERROR: dstack simulator not found at $SIMULATOR_DIR"
    echo "Please set SIMULATOR_DIR or clone to ~/GitHub/dstack"
    exit 1
fi

if [ ! -d "$CHIPOTLE_DIR" ]; then
    echo "ERROR: chipotle repository not found at $CHIPOTLE_DIR"
    echo "Please set CHIPOTLE_DIR or clone to ~/GitHub/chipotle"
    exit 1
fi

if ! command -v docker &>/dev/null; then
    echo "ERROR: docker is not installed."
    exit 1
fi

if ! docker info > /dev/null 2>&1; then
    echo "ERROR: docker daemon is not reachable."
    exit 1
fi

# --- Pre-flight: stop containers that conflict with e2e-lit ports ---
echo "==> Checking for conflicting containers on e2e-lit ports..."
CONFLICT_PORTS=("4317" "4318" "16686" "8000" "8545" "7545" "26750" "9033" "1317")
for port in "${CONFLICT_PORTS[@]}"; do
    CONFLICTS=$(docker ps --format '{{.Names}}' --filter "publish=${port}" 2>/dev/null)
    if [ -n "$CONFLICTS" ]; then
        for cname in $CONFLICTS; do
            if ! docker inspect "$cname" --format '{{index .Config.Labels "com.docker.compose.project"}}' 2>/dev/null | grep -q "smartcontracts"; then
                echo "    Stopping conflicting container '$cname' (port $port)..."
                docker stop "$cname" > /dev/null 2>&1 || true
            fi
        done
    fi
done

# Clean compose down to remove any stale named containers
echo "==> Cleaning up any stale e2e-lit containers..."
(cd "$SCRIPT_DIR/smartcontracts" && docker compose -f "$COMPOSE_FILE" down -v --remove-orphans 2>/dev/null) || true

# --- Cleanup Logic ---
LOGGER_PIDS=()
cleanup() {
    echo ""
    echo "==> Shutting down E2E Lit Integration Stack..."
    for pid in "${LOGGER_PIDS[@]}"; do
        kill "$pid" 2>/dev/null || true
    done
    if [ "${SKIP_CLEANUP:-0}" != "1" ]; then
        docker compose -f "$COMPOSE_FILE" down -v --remove-orphans 2>/dev/null || true
    fi
    echo "==> Cleanup complete."
}
trap cleanup EXIT INT TERM

echo "========================================="
echo " Starting E2E Lit Integration Stack...   "
echo "========================================="

# Clean old log files
SERVICES="greenfield-local chipotle-jaeger chipotle-anvil chipotle-dstack-sim chipotle-deployer chipotle-bootstrap chipotle-real deploy-nft e2e-lit"
for service in $SERVICES; do
    > "../logs/${service}-lit.log"
done

# Patch the bind-mounted greenfield-js-sdk copies before bringing the stack up.
# The e2e and greenfield-testnet node_modules are mounted into the e2e
# container (read-only), so the patch must be applied on the host first. It
# fixes EIP-712 signing for the local pre-Altai chain and rewrites the SP
# object endpoints to path-style against the local gnfd-sp gateway.
echo "==> Applying greenfield-js-sdk local patches..."
(cd "$SCRIPT_DIR" && node patch_sdk.cjs) || {
    echo "ERROR: patch_sdk.cjs failed (is node installed and node_modules present?)"
    exit 1
}

# Start building and running containers in detached mode
if ! docker compose -f "$COMPOSE_FILE" up --build -d; then
    echo "ERROR: Failed to start docker compose lit stack"
    exit 1
fi

# Start background log streaming for each container
for service in $SERVICES; do
    docker compose -f "$COMPOSE_FILE" logs -f --no-color "$service" >> "../logs/${service}-lit.log" 2>&1 &
    LOGGER_PIDS+=($!)
done

echo "Real-time log streams started in ../logs/"

# --- Readiness Waiting ---
wait_for_service() {
    local name="$1"
    local container="$2"
    local timeout=300
    echo -n "Waiting for $name ($container)..."
    for i in $(seq 1 "$timeout"); do
        # Check health status if available
        local status=$(docker inspect "$container" --format='{{.State.Health.Status}}' 2>/dev/null || echo "no-healthcheck")
        if [ "$status" == "healthy" ]; then
            echo " [OK]"
            return 0
        fi
        
        # If no healthcheck, check if running and not exited
        if [ "$status" == "no-healthcheck" ]; then
            if docker inspect "$container" --format='{{.State.Running}}' 2>/dev/null | grep -q "true"; then
                echo " [Started]"
                return 0
            fi
        fi

        # Check if exited
        if docker inspect "$container" --format='{{.State.Status}}' 2>/dev/null | grep -q "exited"; then
            local code=$(docker inspect "$container" --format='{{.State.ExitCode}}')
            if [ "$code" == "0" ]; then
                echo " [Completed]"
                return 0
            else
                echo " [FAILED (Exit Code: $code)]"
                docker logs "$container" | tail -n 20
                return 1
            fi
        fi

        echo -n "."
        sleep 2
    done
    echo " [TIMEOUT]"
    return 1
}

# Wait for critical infrastructure
wait_for_service "Jaeger" "chipotle-jaeger-lit" || exit 1
wait_for_service "Chipotle Anvil" "chipotle-anvil-lit" || exit 1
wait_for_service "Greenfield Local" "greenfield-local-lit" || exit 1

wait_for_service "Chipotle Deployer" "chipotle-deployer-lit" || exit 1
wait_for_service "Chipotle API" "chipotle-real-lit" || exit 1
wait_for_service "Deploy NFT" "deploy-nft-lit" || exit 1

echo "========================================="
echo " Streaming E2E Lit Test Suite logs...    "
echo "========================================="

# Stream the log of the e2e-lit container to screen
docker compose -f "$COMPOSE_FILE" logs -f e2e-lit 2>&1 | tee ../logs/e2e-lit-run.log

# Ensure the container exited
docker wait e2e-lit-runner >/dev/null 2>&1 || true

# Get final exit code of the e2e-lit container
EXIT_CODE=$(docker inspect e2e-lit-runner --format='{{.State.ExitCode}}' 2>/dev/null || echo "1")

echo "========================================="
echo " E2E Lit Run complete (Exit Code: $EXIT_CODE) "
echo "========================================="

exit $EXIT_CODE
