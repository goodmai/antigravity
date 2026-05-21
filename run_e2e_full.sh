#!/bin/bash
set -euo pipefail

# Определение рабочей директории
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/smartcontracts/docker-compose.yml"

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

# --- Pre-flight: stop containers that conflict with e2e-full ports ---
# local_test.sh leaves behind lit-local-jaeger (ports 4317/4318/16686);
# chipotle-real needs 8000, chipotle-anvil needs 8545.
# Killing these before compose up prevents "port is already allocated" errors.
echo "==> Checking for conflicting containers on e2e-full ports..."
CONFLICT_PORTS=("4317" "4318" "16686" "8000" "8545" "9545" "7545" "26750" "9033" "1317")
for port in "${CONFLICT_PORTS[@]}"; do
    # Find containers that have this host port bound
    CONFLICTS=$(docker ps --format '{{.Names}}' --filter "publish=${port}" 2>/dev/null)
    if [ -n "$CONFLICTS" ]; then
        for cname in $CONFLICTS; do
            # Don't kill containers that are part of our own compose project
            if ! docker inspect "$cname" --format '{{index .Config.Labels "com.docker.compose.project"}}' 2>/dev/null | grep -q "smartcontracts"; then
                echo "    Stopping conflicting container '$cname' (port $port)..."
                docker stop "$cname" > /dev/null 2>&1 || true
            fi
        done
    fi
done

# Also do a clean compose down to remove any stale named containers
# (chipotle-real, chipotle-anvil, etc.) from a previous interrupted run.
echo "==> Cleaning up any stale e2e-full containers..."
(cd "$SCRIPT_DIR/smartcontracts" && docker compose --profile e2e-full down -v --remove-orphans 2>/dev/null) || true

# --- Cleanup Logic ---
LOGGER_PIDS=()
cleanup() {
    echo ""
    echo "==> Shutting down E2E Full Integration Stack..."
    for pid in "${LOGGER_PIDS[@]}"; do
        kill "$pid" 2>/dev/null || true
    done
    # Use -v to clean up volumes (dstack-shared, chipotle-config) for a fresh start next time
    docker compose --profile e2e-full down -v --remove-orphans 2>/dev/null || true
    echo "==> Cleanup complete."
}
trap cleanup EXIT INT TERM

echo "========================================="
echo " Starting E2E Full Integration Stack...  "
echo "========================================="

# Очистим старые логи отдельных контейнеров
SERVICES="frontend greenfield-local chipotle-jaeger chipotle-anvil chipotle-dstack-sim chipotle-deployer chipotle-real anvil deploy e2e"
for service in $SERVICES; do
    > "../logs/${service}.log"
done

# Запускаем сборку и запуск контейнеров в фоновом режиме
if ! docker compose --profile e2e-full up --build -d; then
    echo "ERROR: Failed to start docker compose stack"
    exit 1
fi

# Запуск фонового потокового логирования для каждого контейнера
for service in $SERVICES; do
    docker compose --profile e2e-full logs -f --no-color "$service" >> "../logs/${service}.log" 2>&1 &
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
wait_for_service "Jaeger" "chipotle-jaeger" || exit 1
wait_for_service "Chipotle Anvil" "chipotle-anvil" || exit 1
wait_for_service "Greenfield Local" "greenfield-local" || exit 1
wait_for_service "Chipotle Deployer" "chipotle-deployer" || exit 1
wait_for_service "Chipotle API" "chipotle-real" || exit 1
wait_for_service "User Anvil" "daskibo-anvil" || exit 1
wait_for_service "User Deployer" "daskibo-deploy" || exit 1

echo "========================================="
echo " Streaming E2E Test Suite logs...        "
echo "========================================="

# Стримим лог E2E теста на экран
docker compose --profile e2e-full logs -f e2e 2>&1 | tee ../logs/e2e-full-run.log

# Убедимся, что контейнер завершился
docker wait daskibo-e2e >/dev/null 2>&1 || true

# Получаем финальный exit code контейнера e2e
EXIT_CODE=$(docker inspect daskibo-e2e --format='{{.State.ExitCode}}' 2>/dev/null || echo "1")

echo "========================================="
echo " E2E Run complete (Exit Code: $EXIT_CODE) "
echo "========================================="

exit $EXIT_CODE


