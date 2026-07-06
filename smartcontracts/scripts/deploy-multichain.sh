#!/usr/bin/env bash
# Multichain contract deploy for the `testnets` / `prod` compose profiles.
#
# Deploys the access NFTs (ClientNft/AuthorNft) + settlement (Treasury/
# AccessPass/CourseMarketplace) to every chain in DEPLOY_CHAINS (default
# "bsc,opbnb" — BSC is the PRIMARY/gating chain, opBNB the secondary), mints
# one ClientNft to the deployer, registers course #1, and writes:
#   /shared/$ADDR_FILE      — env file: unprefixed vars = primary chain,
#                             <CHAIN>_MARKETPLACE_ADDR etc. per chain
#   /host-demo/addresses.json — frontend config for the primary chain (plus a
#                             `chains` map with every deployment)
#
# Env (see docker-compose.yml):
#   PRIVATE_KEY / DEPLOYER_ADDR      funded deployer (validated below)
#   DEPLOY_CHAINS=bsc,opbnb          subset to deploy (e.g. "bsc" only)
#   BSC_CHAIN_ID/BSC_RPC, OPBNB_CHAIN_ID/OPBNB_RPC
#   COURSE_PRICE (wei), ADDR_FILE, EXPLORER, CHAIN_NAME
#   BSCSCAN_API_KEY (optional)       explorer verification on the BSC deploy
set -euo pipefail

ANVIL_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

if [ -z "${PRIVATE_KEY:-}" ] || [ -z "${DEPLOYER_ADDR:-}" ]; then
  echo "ERROR: set the deployer key/addr in .env (testnets: GREENFIELD_TESTNET_PRIVATE_KEY/_ADDRESS or DEVNET_DEPLOYER_KEY/_ADDR; prod: PROD_DEPLOYER_KEY/_ADDR)"
  exit 2
fi
# The well-known anvil dev key must never touch a public network — anyone
# would own the contracts.
if [ "$PRIVATE_KEY" = "$ANVIL_KEY" ]; then
  echo "REFUSING: well-known anvil dev key against public networks. Provide a real funded key."
  exit 2
fi

COURSE_PRICE="${COURSE_PRICE:-1000000000000000}"
ADDR_FILE="${ADDR_FILE:-net-addresses.env}"
DEPLOY_CHAINS="${DEPLOY_CHAINS:-bsc,opbnb}"

test -d lib/forge-std || forge install --no-git foundry-rs/forge-std
test -d lib/openzeppelin-contracts || forge install --no-git OpenZeppelin/openzeppelin-contracts@v5.6.1
forge build

cast_send_retry() {
  local rpc="$1"; shift
  local i=0
  while [ $i -lt 3 ]; do
    if cast send --rpc-url "$rpc" --private-key "$PRIVATE_KEY" "$@"; then
      return 0
    fi
    i=$((i+1))
    echo "  cast send failed (attempt $i/3) — refetching nonce in 4s…" >&2
    sleep 4
  done
  return 1
}

: > /shared/"$ADDR_FILE"
PRIMARY_MARKETPLACE=""; PRIMARY_CLIENT=""; PRIMARY_AUTHOR=""
PRIMARY_CHAIN_ID=""; PRIMARY_RPC=""
CHAINS_JSON=""

IFS=',' read -ra CHAINS <<< "$DEPLOY_CHAINS"
for chain in "${CHAINS[@]}"; do
  case "$chain" in
    bsc)   RPC="$BSC_RPC";   CID="$BSC_CHAIN_ID";   PREFIX=BSC ;;
    opbnb) RPC="$OPBNB_RPC"; CID="$OPBNB_CHAIN_ID"; PREFIX=OPBNB ;;
    *) echo "ERROR: unknown chain '$chain' in DEPLOY_CHAINS (known: bsc, opbnb)"; exit 2 ;;
  esac

  BAL=$(cast balance --rpc-url "$RPC" "$DEPLOYER_ADDR")
  echo "→ [$chain/$CID] deployer $DEPLOYER_ADDR balance: $BAL wei"
  if [ "$BAL" = "0" ]; then
    echo "ERROR: deployer has 0 balance on $chain ($CID) — fund it or set DEPLOY_CHAINS to skip this chain."
    exit 3
  fi

  VERIFY=""
  if [ "$chain" = "bsc" ] && [ -n "${BSCSCAN_API_KEY:-}" ]; then
    VERIFY="--verify --etherscan-api-key $BSCSCAN_API_KEY"
  fi

  echo "→ [$chain] deploying soulbound role NFTs…"
  forge script script/DeployAccessNfts.s.sol:DeployAccessNfts \
    --rpc-url "$RPC" --private-key "$PRIVATE_KEY" --broadcast $VERIFY -vvv 2>&1 | tee /tmp/nft.out
  CLIENT_NFT=$(grep -i ClientNft /tmp/nft.out | grep -oiE '0x[0-9a-f]{40}' | tail -1)
  AUTHOR_NFT=$(grep -i AuthorNft /tmp/nft.out | grep -oiE '0x[0-9a-f]{40}' | tail -1)

  echo "→ [$chain] deploying settlement (Treasury/AccessPass/CourseMarketplace)…"
  forge script script/Deploy.s.sol:Deploy \
    --rpc-url "$RPC" --private-key "$PRIVATE_KEY" --broadcast $VERIFY -vvv 2>&1 | tee /tmp/mp.out
  MARKETPLACE=$(grep -i CourseMarketplace /tmp/mp.out | grep -oiE '0x[0-9a-f]{40}' | tail -1)

  if [ -z "$CLIENT_NFT" ] || [ -z "$MARKETPLACE" ]; then
    echo "ERROR: could not parse deployed addresses from forge output ($chain)"
    exit 1
  fi

  echo "→ [$chain] minting one ClientNft (perpetual) to the deployer…"
  cast_send_retry "$RPC" "$CLIENT_NFT" "mint(address,uint64)" "$DEPLOYER_ADDR" 0
  echo "→ [$chain] registering course #1 on the marketplace…"
  CHASH=$(cast keccak "daskibo-course-1")
  cast_send_retry "$RPC" "$MARKETPLACE" "registerCourse(uint96,bytes32,string,uint64)" "$COURSE_PRICE" "$CHASH" "daskibo-course-1" 0

  {
    echo "${PREFIX}_CLIENT_NFT_ADDR=$CLIENT_NFT"
    echo "${PREFIX}_AUTHOR_NFT_ADDR=$AUTHOR_NFT"
    echo "${PREFIX}_MARKETPLACE_ADDR=$MARKETPLACE"
    echo "${PREFIX}_CHAIN_ID=$CID"
  } >> /shared/"$ADDR_FILE"

  CHAINS_JSON="$CHAINS_JSON{\"chain\":\"$chain\",\"chainId\":$CID,\"marketplace\":\"$MARKETPLACE\",\"clientNft\":\"$CLIENT_NFT\",\"authorNft\":\"$AUTHOR_NFT\"},"

  if [ -z "$PRIMARY_MARKETPLACE" ]; then
    PRIMARY_MARKETPLACE="$MARKETPLACE"; PRIMARY_CLIENT="$CLIENT_NFT"; PRIMARY_AUTHOR="$AUTHOR_NFT"
    PRIMARY_CHAIN_ID="$CID"; PRIMARY_RPC="$RPC"
  fi
done

# Unprefixed vars = primary (gating) chain — consumed by the writer.
{
  echo "CLIENT_NFT_ADDR=$PRIMARY_CLIENT"
  echo "AUTHOR_NFT_ADDR=$PRIMARY_AUTHOR"
  echo "MARKETPLACE_ADDR=$PRIMARY_MARKETPLACE"
  echo "COURSE_ID=1"
  echo "COURSE_PRICE=$COURSE_PRICE"
} >> /shared/"$ADDR_FILE"

CHAIN_HEX=$(printf '0x%x' "$PRIMARY_CHAIN_ID")
printf '%s\n' \
  '{' \
  "  \"chainId\": $PRIMARY_CHAIN_ID," \
  "  \"chainIdHex\": \"$CHAIN_HEX\"," \
  "  \"chainName\": \"${CHAIN_NAME:-BNB Smart Chain}\"," \
  "  \"rpcUrl\": \"$PRIMARY_RPC\"," \
  '  "treasury": "",' \
  '  "accessPass": "",' \
  "  \"marketplace\": \"$PRIMARY_MARKETPLACE\"," \
  "  \"clientNft\": \"$PRIMARY_CLIENT\"," \
  "  \"authorNft\": \"$PRIMARY_AUTHOR\"," \
  '  "courseId": 1,' \
  "  \"explorer\": \"${EXPLORER:-https://bscscan.com}\"," \
  "  \"chains\": [${CHAINS_JSON%,}]" \
  '}' > /host-demo/addresses.json
rm -f /host-demo/manifest-*.json

echo "═══════════════════════════════════════════════════════════"
echo "CONTRACTS DEPLOYED (${DEPLOY_CHAINS})"
cat /shared/"$ADDR_FILE"
echo "Frontend addresses.json → http://localhost:8099/demo/addresses.json"
echo "═══════════════════════════════════════════════════════════"
