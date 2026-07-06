#!/usr/bin/env bash
# Launch Chrome with MetaMask for Daskibo UI testing and Synpress e2e.
#
# MetaMask (ID: hebhblbkkdabgoldnojllkipeoacjioc) is pre-installed in
# .chrome-user-data — no --load-extension needed.
# Accounts already configured: Alice (Author), Bob (Client), Eve (other).
#
# Run BEFORE: claude code session, Playwright tests, or manual testing.
set -e

USER_DATA_DIR="/home/g/projects/antigravity/.chrome-user-data"
DEMO_URL="http://localhost:8085/course-demo.html"
DEBUG_PORT=9222

echo "Stopping any Chrome on port ${DEBUG_PORT}…"
fuser -k ${DEBUG_PORT}/tcp 2>/dev/null || true
pkill -f "remote-debugging-port=${DEBUG_PORT}" 2>/dev/null || true
sleep 1

echo "Starting Chrome (DISPLAY=:0)…"
DISPLAY=:0 google-chrome \
  --user-data-dir="$USER_DATA_DIR" \
  --remote-debugging-port="${DEBUG_PORT}" \
  --remote-allow-origins='*' \
  --no-sandbox \
  --no-first-run \
  --no-default-browser-check \
  "$DEMO_URL" \
  2>/tmp/chrome-daskibo.log &

CHROME_PID=$!
echo "Chrome PID: ${CHROME_PID}"
sleep 3

TABS=$(curl -s "http://localhost:${DEBUG_PORT}/json" 2>/dev/null)
MM_PRESENT=$(echo "$TABS" | python3 -c "import sys,json; ts=json.load(sys.stdin); print('YES' if any('hebhblbkkdabgoldnojllkipeoacjioc' in t.get('url','') for t in ts) else 'NO')" 2>/dev/null)
echo "MetaMask loaded: ${MM_PRESENT}"
echo "Tabs:"
echo "$TABS" | python3 -c "import sys,json; [print(' ',t.get('type','').ljust(12),t.get('url','')[:70]) for t in json.load(sys.stdin)]" 2>/dev/null

echo ""
echo "Chrome ready on port ${DEBUG_PORT}."
echo "MetaMask ID: hebhblbkkdabgoldnojllkipeoacjioc"
echo "Accounts: Alice (Author) | Bob (Client) | Eve (other)"
echo "Network:  Daskibo Local Anvil (chainId 31337, RPC :9545)"
