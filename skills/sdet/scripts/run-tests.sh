#!/usr/bin/env bash
# SDET test orchestrator — one entry point per layer, self-skips on missing prereqs.
# Mirrors the layers documented in workflow_cicd.md.
#
# Usage: run-tests.sh <layer>
#   unit         vitest unit (jsdom, no network)        — always safe
#   typecheck    tsc strict                              — always safe
#   noany        scripts/check-no-any.sh                 — always safe
#   contracts    forge test -vvv (smartcontracts/contracts) — needs foundry
#   integration  all tests/*.docker.test.js              — needs docker
#   e2e-local    ./run_e2e_lit.sh (Flow B, clean genesis) — needs docker + CHIPOTLE_DIR/SIMULATOR_DIR
#   live         tests/*.live.test.js                    — needs GREENFIELD_TESTNET_PRIVATE_KEY (real funds)
#   devnet       node smartcontracts/e2e/run-e2e.mjs (Flow C) — needs testnet key (real funds)
#   all-local    unit+typecheck+noany+contracts+integration+e2e-local (no real funds)
#   all          all-local + live + devnet (SPENDS real native — confirm first)
#
# Exit 0 = pass or intentionally skipped; non-zero = real failure.
set -uo pipefail

# Resolve repo root (skill lives at <root>/skills/sdet/scripts/)
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

LAYER="${1:-all-local}"
RC=0

have()        { command -v "$1" >/dev/null 2>&1; }
have_docker() { have docker && docker info >/dev/null 2>&1; }
have_keys()   { [ -n "${GREENFIELD_TESTNET_PRIVATE_KEY:-}" ]; }
skip()        { echo "⏭️  SKIP $1: $2"; }
run()         { echo "▶️  $*"; "$@"; local r=$?; [ $r -ne 0 ] && RC=$r; return $r; }

layer_unit()      { run npm run test:unit; }
layer_typecheck() { run npm run typecheck; }
layer_noany()     { run npm run lint:noany; }

layer_contracts() {
  have forge || { skip contracts "foundry (forge) not installed"; return 0; }
  ( cd smartcontracts/contracts && forge test -vvv ); [ $? -ne 0 ] && RC=1; return 0
}

layer_integration() {
  have_docker || { skip integration "docker not available"; return 0; }
  # Run every docker test file; vitest globs them, files self-skip if needed.
  run npx vitest run "tests/**/*.docker.test.js"
}

layer_e2e_local() {
  have_docker || { skip e2e-local "docker not available"; return 0; }
  [ -d "${CHIPOTLE_DIR:-$HOME/GitHub/chipotle}" ] && [ -d "${SIMULATOR_DIR:-$HOME/GitHub/dstack/sdk/simulator}" ] \
    || { skip e2e-local "CHIPOTLE_DIR / SIMULATOR_DIR not present"; return 0; }
  run bash ./run_e2e_lit.sh
}

layer_live() {
  have_keys || { skip live "GREENFIELD_TESTNET_PRIVATE_KEY unset (real-funds tests)"; return 0; }
  run npx vitest run "tests/**/*.live.test.js"
}

layer_devnet() {
  have_keys || { skip devnet "GREENFIELD_TESTNET_PRIVATE_KEY unset (real-funds e2e)"; return 0; }
  run node smartcontracts/e2e/run-e2e.mjs
}

case "$LAYER" in
  unit)        layer_unit ;;
  typecheck)   layer_typecheck ;;
  noany)       layer_noany ;;
  contracts)   layer_contracts ;;
  integration) layer_integration ;;
  e2e-local)   layer_e2e_local ;;
  live)        layer_live ;;
  devnet)      layer_devnet ;;
  all-local)   layer_unit; layer_typecheck; layer_noany; layer_contracts; layer_integration; layer_e2e_local ;;
  all)         layer_unit; layer_typecheck; layer_noany; layer_contracts; layer_integration; layer_e2e_local; layer_live; layer_devnet ;;
  *) echo "Unknown layer: $LAYER"; echo "Layers: unit typecheck noany contracts integration e2e-local live devnet all-local all"; exit 2 ;;
esac

echo "──────────────────────────────"
[ $RC -eq 0 ] && echo "✅ run-tests.sh '$LAYER' OK" || echo "❌ run-tests.sh '$LAYER' had failures (rc=$RC)"
exit $RC
