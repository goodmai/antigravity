#!/bin/bash
set -euo pipefail

# Daskibo DEVNET — fund the Bob + Eva test wallets on BSC testnet 97.
#
# Why this exists: the local Anvil demo uses the standard PUBLIC Anvil dev
# keys (DEMO_*_PK in .env) — those work fine on a throwaway local chain but
# are weaponized on every public testnet. Bot-sweepers monitor BSC testnet
# for transfers to those well-known addresses and drain them within seconds
# (we've seen the Anvil #2/#3 addresses with 1800+ outgoing txs each).
#
# For devnet (real BSC testnet) the personas are separate, NON-public keys
# you generate yourself and put in .env as BOB_PK / EVA_PK / BOB_ADDRESS
# / EVA_ADDRESS. This script:
#   1. checks their balances,
#   2. funds them from GREENFIELD_TESTNET_PRIVATE_KEY (the deployer, same key
#      that has tBNB on both BSC and Greenfield testnets),
#   3. confirms the transfers landed.
#
# Run:
#   ./fund_devnet.sh                       # tops everyone up to ≥ 0.01 tBNB
#   CLIENT_AMOUNT=0.05 ./fund_devnet.sh    # override amounts (in tBNB)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Load .env so PK / ADDRESS variables are visible to both shell and cast.
if [ -f .env ]; then
  set -a; . .env; set +a
fi

RPC="${BSC_TESTNET_RPC:-https://data-seed-prebsc-1-s1.binance.org:8545}"
# What "topped up" means. We won't refund accounts already above this.
CLIENT_AMOUNT="${CLIENT_AMOUNT:-0.01}"   # tBNB to ensure on the Client wallet
EVA_AMOUNT="${EVA_AMOUNT:-0.005}"        # tBNB to ensure on the Eva wallet
DRY_RUN="${DRY_RUN:-0}"

# Required env from .env.
need() { local v="$1"; if [ -z "${!v:-}" ]; then echo "ERROR: \$$v not set in .env"; exit 1; fi; }
need GREENFIELD_TESTNET_PRIVATE_KEY
need GREENFIELD_TESTNET_ADDRESS

DEPLOYER_ADDR="$GREENFIELD_TESTNET_ADDRESS"
DEPLOYER_PK="$GREENFIELD_TESTNET_PRIVATE_KEY"

# Personas. BOB_ADDRESS is required (paying client). EVA_ADDRESS is optional —
# Eva's role is "no purchase → no access"; she never sends transactions on
# devnet so she doesn't need tBNB. Refuse public Anvil DEMO_* keys — those
# are sweep-bot targets on every public testnet.
CLIENT_ADDR="${BOB_ADDRESS:-${CLIENT_ADDRESS:-}}"
EVA_ADDR="${EVA_ADDRESS:-}"
if [ -z "$CLIENT_ADDR" ]; then
  echo "ERROR: set BOB_ADDRESS in .env (must be a NON-public key)."
  echo "       Do NOT reuse DEMO_CLIENT_ADDR — sweep-bots drain it on BSC testnet."
  exit 1
fi
if [ "${CLIENT_ADDR,,}" = "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc" ] \
|| [ "${EVA_ADDR,,}"    = "0x90f79bf6eb2c4f870365e785982e1f101e93b906" ]; then
  echo "ERROR: refusing — that's a public Anvil dev address. Generate fresh keys."
  exit 1
fi

bal_wei() {  # cheap balance probe via RPC, no cast container needed
  curl -s -X POST -H 'content-type: application/json' \
    --data '{"jsonrpc":"2.0","method":"eth_getBalance","params":["'"$1"'","latest"],"id":1}' \
    "$RPC" | python3 -c 'import json,sys; print(int(json.load(sys.stdin)["result"],16))'
}
to_eth() { python3 -c "print($1 / 1e18)"; }

cast_send() {  # cast_send <to> <amount_eth>
  local to="$1" amt="$2"
  echo "→ sending $amt tBNB from $DEPLOYER_ADDR → $to"
  if [ "$DRY_RUN" = "1" ]; then echo "  (dry run; skipping)"; return; fi
  docker run --rm --entrypoint sh \
    -e PK="$DEPLOYER_PK" \
    ghcr.io/foundry-rs/foundry:latest -c \
    "cast send --rpc-url '$RPC' --private-key \"\$PK\" '$to' --value ${amt}ether 2>&1 | grep -E 'transactionHash|status'"
}

echo "════════════════════════════════════════════════════════════"
echo " Daskibo DEVNET funding · BSC testnet 97"
echo "   RPC:       $RPC"
echo "   Deployer:  $DEPLOYER_ADDR"
echo "   Bob:       $CLIENT_ADDR  (target ${CLIENT_AMOUNT} tBNB)"
echo "   Eva:       ${EVA_ADDR:-(skipped — EVA_ADDRESS not set)}  ${EVA_ADDR:+(target ${EVA_AMOUNT} tBNB)}"
echo "════════════════════════════════════════════════════════════"

deployer_bal=$(bal_wei "$DEPLOYER_ADDR")
echo "Deployer balance: $(to_eth $deployer_bal) tBNB"
if [ "$deployer_bal" -lt 1000000000000000 ]; then  # < 0.001 tBNB
  echo "WARN: deployer is almost empty. Refill it at https://www.bnbchain.org/en/testnet-faucet"
fi

FUND_LIST="Bob:$CLIENT_ADDR:$CLIENT_AMOUNT"
[ -n "$EVA_ADDR" ] && FUND_LIST="$FUND_LIST Eva:$EVA_ADDR:$EVA_AMOUNT"
for name_addr_amt in $FUND_LIST; do
  name="${name_addr_amt%%:*}"; rest="${name_addr_amt#*:}"
  addr="${rest%%:*}"; amt="${rest#*:}"
  curr_wei=$(bal_wei "$addr")
  target_wei=$(python3 -c "print(int($amt * 1e18))")
  echo "[${name}] current=$(to_eth $curr_wei) tBNB · target=$amt tBNB"
  if [ "$curr_wei" -ge "$target_wei" ]; then
    echo "  ✓ already above target — skipping"
    continue
  fi
  diff_wei=$(python3 -c "print($target_wei - $curr_wei)")
  diff_eth=$(to_eth $diff_wei)
  cast_send "$addr" "$diff_eth"
done

echo ""
echo "Waiting 6s for propagation…"
sleep 6
echo "── final balances ─────────────────────────────────────────"
BAL_LIST="Deployer:$DEPLOYER_ADDR Bob:$CLIENT_ADDR"
[ -n "$EVA_ADDR" ] && BAL_LIST="$BAL_LIST Eva:$EVA_ADDR"
for name_addr in $BAL_LIST; do
  name="${name_addr%%:*}"; addr="${name_addr#*:}"
  echo "  ${name}  $addr  $(to_eth $(bal_wei $addr)) tBNB"
done
echo "════════════════════════════════════════════════════════════"
echo "Done. Import BOB_PK into MetaMask (NOT the DEMO_*_PK)."
echo "      Eva needs no funds on devnet — she only fails the access check."
