#!/usr/bin/env bash
# add-evm-chain.sh — onboard a NEW EVM network onto the platform:
# deploy the NFT factory set (ClientNft/AuthorNft) + settlement
# (Treasury/AccessPass/CourseMarketplace), mint a ClientNft to the deployer,
# register course #1, and print the follow-up wiring (CHAIN_RPCS entry,
# compose env, addresses.json snippet).
#
# Usage:
#   PRIVATE_KEY=0x… DEPLOYER_ADDR=0x… \
#   ./add-evm-chain.sh <chainKey> <chainId> <rpcUrl> [explorerUrl]
#
#   chainKey  — the Lit-style chain identifier you'll use in ACC/manifests
#               (e.g. polygon, arbitrum, opbnb). camelCase, no spaces.
#   chainId   — EIP-155 numeric id.
#   rpcUrl    — public JSON-RPC endpoint (must support eth_call for readers).
#
# Optional env: COURSE_PRICE (wei, default 0.001), BSCSCAN_API_KEY-style
# verification is chain-specific — verify manually if needed.
#
# Requirements: foundry (forge/cast) on PATH; run from smartcontracts/contracts
# or let the script cd there itself.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
CONTRACTS_DIR="$HERE/../contracts"
ANVIL_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

CHAIN_KEY="${1:?usage: add-evm-chain.sh <chainKey> <chainId> <rpcUrl> [explorer]}"
CHAIN_ID="${2:?chainId required}"
RPC="${3:?rpcUrl required}"
EXPLORER="${4:-}"
COURSE_PRICE="${COURSE_PRICE:-1000000000000000}"

if [ -z "${PRIVATE_KEY:-}" ] || [ -z "${DEPLOYER_ADDR:-}" ]; then
  echo "ERROR: export PRIVATE_KEY and DEPLOYER_ADDR (funded on chain $CHAIN_ID)"; exit 2
fi
if [ "$PRIVATE_KEY" = "$ANVIL_KEY" ]; then
  echo "REFUSING: well-known anvil dev key against a public network."; exit 2
fi

ACTUAL_ID=$(cast chain-id --rpc-url "$RPC")
if [ "$ACTUAL_ID" != "$CHAIN_ID" ]; then
  echo "ERROR: RPC $RPC reports chain-id $ACTUAL_ID, expected $CHAIN_ID"; exit 2
fi
BAL=$(cast balance --rpc-url "$RPC" "$DEPLOYER_ADDR")
echo "→ [$CHAIN_KEY/$CHAIN_ID] deployer $DEPLOYER_ADDR balance: $BAL wei"
[ "$BAL" != "0" ] || { echo "ERROR: deployer unfunded on $CHAIN_KEY"; exit 3; }

cd "$CONTRACTS_DIR"
test -d lib/forge-std || forge install --no-git foundry-rs/forge-std
test -d lib/openzeppelin-contracts || forge install --no-git OpenZeppelin/openzeppelin-contracts@v5.6.1
forge build

echo "→ Deploying soulbound role NFTs…"
forge script script/DeployAccessNfts.s.sol:DeployAccessNfts \
  --rpc-url "$RPC" --private-key "$PRIVATE_KEY" --broadcast -vvv 2>&1 | tee /tmp/nft.out
CLIENT_NFT=$(grep -i ClientNft /tmp/nft.out | grep -oiE '0x[0-9a-f]{40}' | tail -1)
AUTHOR_NFT=$(grep -i AuthorNft /tmp/nft.out | grep -oiE '0x[0-9a-f]{40}' | tail -1)

echo "→ Deploying settlement (Treasury/AccessPass/CourseMarketplace)…"
forge script script/Deploy.s.sol:Deploy \
  --rpc-url "$RPC" --private-key "$PRIVATE_KEY" --broadcast -vvv 2>&1 | tee /tmp/mp.out
MARKETPLACE=$(grep -i CourseMarketplace /tmp/mp.out | grep -oiE '0x[0-9a-f]{40}' | tail -1)

[ -n "$CLIENT_NFT" ] && [ -n "$MARKETPLACE" ] || { echo "ERROR: address parse failed"; exit 1; }

echo "→ Minting one ClientNft (perpetual) to the deployer…"
cast send --rpc-url "$RPC" --private-key "$PRIVATE_KEY" "$CLIENT_NFT" "mint(address,uint64)" "$DEPLOYER_ADDR" 0
echo "→ Registering course #1…"
CHASH=$(cast keccak "daskibo-course-1")
cast send --rpc-url "$RPC" --private-key "$PRIVATE_KEY" "$MARKETPLACE" \
  "registerCourse(uint96,bytes32,string,uint64)" "$COURSE_PRICE" "$CHASH" "daskibo-course-1" 0

cat <<EOT

═══════════════════════════════════════════════════════════
NEW EVM CHAIN ONBOARDED: $CHAIN_KEY ($CHAIN_ID)
  ClientNft          $CLIENT_NFT
  AuthorNft          $AUTHOR_NFT
  CourseMarketplace  $MARKETPLACE
  courseId           1  (price $COURSE_PRICE wei)

NEXT STEPS (manual wiring):
1. smartcontracts/buckets/lit-acc-eval.js — add to CHAIN_RPCS:
     $CHAIN_KEY: '$RPC',
   and to CHAIN_ID_ALIASES:
     $CHAIN_ID: '$CHAIN_KEY',
2. Publish gated on this chain:
     NFT_GATING_CHAIN=$CHAIN_KEY MARKETPLACE_ADDR=$MARKETPLACE COURSE_ID=1 \\
       node greenfield-testnet/write-devnet.mjs   # or write-mainnet.mjs
3. Frontend demo/addresses.json — append to "chains":
     {"chain":"$CHAIN_KEY","chainId":$CHAIN_ID,"marketplace":"$MARKETPLACE","clientNft":"$CLIENT_NFT","authorNft":"$AUTHOR_NFT"}
4. (optional) docker-compose.yml — extend deploy-multichain.sh's case block
   with '$CHAIN_KEY) RPC=…; CID=$CHAIN_ID; PREFIX=…' to include it in the
   prod/testnets profiles.
${EXPLORER:+5. Verify contracts on $EXPLORER (chain-specific verifier).}
═══════════════════════════════════════════════════════════
EOT
