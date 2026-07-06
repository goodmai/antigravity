#!/usr/bin/env bash
# Seed the DRM content-unlock scenario for spec 06 (@content), against the
# local-full stack (Anvil :9545 + chipotle-mock :8000).
#
#   1. Recreate Anvil fresh + redeploy → no courses yet, nobody owns anything
#      (so Bob is genuinely denied BEFORE he buys).
#   2. Register course #1 "Intro to Greenfield" as the Author (anvil #1) →
#      nextCourseId starts at 1, so the first registerCourse is course #1.
#   3. Re-encrypt the lesson and write demo/manifest-1.json wrapped behind
#      hasCourseAccess(:userAddress, 1), keyed to the CURRENT chipotle-mock PKP
#      (the mock regenerates its PKP on restart → stale ciphertext otherwise).
#
# Run after the local-full stack is up; needs `cast` (Foundry) + node on PATH.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SC="$(cd "$HERE/.." && pwd)"                 # .../smartcontracts
RPC="${RPC_URL:-http://localhost:9545}"
CHIPOTLE="${CHIPOTLE_URL:-http://localhost:8000}"
AUTHOR_PK="0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"  # anvil #1 = Author (0x7099…)

echo "→ [1/3] Recreating Anvil + redeploy (fresh state)…"
( cd "$SC" && docker compose -f docker-compose.yml --profile local-full up -d --force-recreate anvil deploy )
docker wait daskibo-deploy >/dev/null
# Deterministic deploy → addresses unchanged; refresh addresses.json from the
# deploy logs anyway so marketplace/rpcUrl are always in sync for the manifest.
LOG="$(docker logs daskibo-deploy 2>&1)"
pick() { printf '%s' "$LOG" | grep -i "$1" | grep -oiE '0x[0-9a-f]{40}' | tail -1; }
TREASURY="$(pick 'Treasury ')"; ACCESSPASS="$(pick 'AccessPass ')"; MARKET="$(pick 'CourseMarketplace')"
[ -n "$MARKET" ] || { echo "::error::could not parse marketplace address from deploy logs"; exit 1; }
mkdir -p "$SC/demo"
cat > "$SC/demo/addresses.json" <<JSON
{
  "chainId": 31337,
  "chainIdHex": "0x7a69",
  "chainName": "Daskibo Anvil (local)",
  "rpcUrl": "http://127.0.0.1:9545",
  "treasury": "$TREASURY",
  "accessPass": "$ACCESSPASS",
  "marketplace": "$MARKET"
}
JSON

echo "→ [2/3] Registering course #1 as the Author at $MARKET…"
HASH="$(cast keccak "Intro to Greenfield|daskibo-demo-101")"
cast send --rpc-url "$RPC" --private-key "$AUTHOR_PK" "$MARKET" \
  "registerCourse(uint96,bytes32,string,uint64)" 10000000000000000 "$HASH" "daskibo-demo-101" 0 >/dev/null
echo "   course #1 registered"

echo "→ [3/3] Encrypting lesson + writing demo/manifest-1.json (chipotle $CHIPOTLE)…"
( cd "$SC/greenfield-testnet" \
  && ( [ -d node_modules ] || npm install --no-audit --no-fund >/dev/null 2>&1 ) \
  && SHARED_DIR="$SC/demo" CHIPOTLE_URL="$CHIPOTLE" CHIPOTLE_PUBLIC_URL="$CHIPOTLE" \
     DEMO_COURSE_ID=1 DEMO_COURSE_TITLE="Intro to Greenfield" node demo-encrypt.mjs )

echo "✓ Seeded course #1 + manifest-1.json — ready for spec 06 (@content)."
