#!/bin/bash
set -euo pipefail

# This entrypoint script bootstraps a local PRIVATE Greenfield network
# with 1 validator and 7 storage providers.
# It then creates a Global Virtual Group (GVG) family required for data storage.

echo "=== Greenfield Local Node Bootstrap Entrypoint ==="

# Clean old data
rm -rf deployment/localup/.local

# Start the network
echo "Starting Greenfield network with localup.sh..."
# Pass VALIDATORS and SPS env vars if set, otherwise use defaults
VALIDATORS=${VALIDATORS:-1}
SPS=${SPS:-7}

# Start Tendermint and Cosmos SDK node
# Use 'all' to ensure fresh initialization and genesis generation
bash ./deployment/localup/localup.sh all "${VALIDATORS}" "${SPS}" &

# Wait for node to be ready and bootstrap GVG
(
  echo "=== GVG bootstrap daemon started ==="
  # Wait for RPC port to open
  echo "Waiting for Tendermint RPC to start..."
  until curl -s http://127.0.0.1:26750/status >/dev/null 2>&1; do
    sleep 2
  done
  echo "Tendermint RPC is UP!"

  # Wait for a few blocks to ensure network is stable
  echo "Waiting for block height to reach 12 (Prairie upgrade height for GVG enablement)..."
  while true; do
    CURRENT_HEIGHT=$(curl -s http://127.0.0.1:26750/status | jq -r '.result.sync_info.latest_block_height // 0')
    if [ "$CURRENT_HEIGHT" -ge 12 ]; then
      break
    fi
    echo "Current block height: $CURRENT_HEIGHT"
    sleep 5
  done

  echo "Block height $CURRENT_HEIGHT >= 12. Proceeding to bootstrap GVG..."

  # Extract SP0 operator private key
  echo "Extracting SP0 operator private key..."
  export OPERATOR_PRIVATE_KEY=$(bash ./deployment/localup/localup.sh export_sps "${VALIDATORS}" "${SPS}" | jq -r '.sp0.OperatorPrivateKey')
  if [ -n "$OPERATOR_PRIVATE_KEY" ]; then
    echo "Successfully extracted operator key (ends with ...${OPERATOR_PRIVATE_KEY: -6})"
  else
    echo "ERROR: Failed to extract OPERATOR_PRIVATE_KEY!"
    exit 1
  fi

  # Extract Validator 0 (Genesis Account 0) credentials
  echo "Extracting Validator 0 credentials..."
  VAL0_ADDR=$(./build/bin/gnfd keys show validator0 -a --keyring-backend test --home deployment/localup/.local/validator0)
  # Pipe 'y' for confirmation of unsafe export
  VAL0_PK=$(echo "y" | ./build/bin/gnfd keys export validator0 --unarmored-hex --unsafe --keyring-backend test --home deployment/localup/.local/validator0)
  
  echo "VAL0_ADDR=$VAL0_ADDR"
  # Save to a shared volume if available, or just log clearly for run_e2e_lit.sh to capture
  echo "FOUND_VAL0_ADDR=$VAL0_ADDR"
  echo "FOUND_VAL0_PK=$VAL0_PK"

  # Fund Alice's known test account (from Anvil) on Greenfield
  ALICE_ADDR="0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
  echo "Funding Alice test account ($ALICE_ADDR) from validator0..."
  FUNDING_START_HEIGHT=$(curl -s http://127.0.0.1:26750/status | jq -r '.result.sync_info.latest_block_height // 0')
  # Send 10^21 units (1000 "full" BNB if 18 decimals)
  if ./build/bin/gnfd tx bank send validator0 "$ALICE_ADDR" 1000000000000000000000BNB \
    --keyring-backend test \
    --home deployment/localup/.local/validator0 \
    --chain-id greenfield_9000-1 \
    --node http://127.0.0.1:26750 \
    -y --broadcast-mode sync; then
    echo "Waiting for Alice faucet transfer to commit..."
    while true; do
      CURRENT_HEIGHT=$(curl -s http://127.0.0.1:26750/status | jq -r '.result.sync_info.latest_block_height // 0')
      if [ "$CURRENT_HEIGHT" -gt "$FUNDING_START_HEIGHT" ]; then
        break
      fi
      sleep 2
    done
    ./build/bin/gnfd q bank balances "$ALICE_ADDR" \
      --node http://127.0.0.1:26750 \
      -o json || echo "WARNING: Could not query Alice balance"
  else
    echo "WARNING: Faucet transfer failed"
  fi

  # Run the compiled bootstrap_gvg binary
  export RPC_ADDR="http://127.0.0.1:26750"
  export CHAIN_ID="greenfield_9000-1"
  
  echo "Running bootstrap_gvg..."
  if /usr/local/bin/bootstrap_gvg; then
    # Wait for transaction to be committed
    echo "Waiting for transaction to be committed..."
    sleep 5

    # Verify the GVG family was actually created on-chain
    echo "Verifying GVG family exists on-chain..."
    ./build/bin/gnfd q virtualgroup global-virtual-group-families 10 --node http://127.0.0.1:26750 -o json || echo "Query failed"

    # Final signal that GVG is ready
    touch /tmp/gvg_bootstrapped
    echo "=== GVG Sentinel File Created successfully at /tmp/gvg_bootstrapped ==="

    # ── Bring up the real storage providers ─────────────────────────────
    # Greenfield seals objects with erasure coding across the GVG (1 primary +
    # 6 secondary SPs), so ALL ${SPS} gnfd-sp daemons must run for uploads to
    # seal and be downloadable. They share this container and reach each other
    # and the chain over 127.0.0.1.
    echo "=== Initializing MariaDB (SP metadata + blocksyncer store) ==="
    mkdir -p /run/mysqld /var/lib/mysql
    chown -R mysql:mysql /run/mysqld /var/lib/mysql
    if [ ! -d /var/lib/mysql/mysql ]; then
      mariadb-install-db --user=mysql --datadir=/var/lib/mysql --skip-test-db >/tmp/mysql_install.log 2>&1
    fi
    nohup mysqld_safe --user=mysql --datadir=/var/lib/mysql >/tmp/mysqld.log 2>&1 &
    echo "Waiting for MariaDB to accept connections..."
    until mysqladmin -u root ping >/dev/null 2>&1; do sleep 1; done
    echo "MariaDB is UP"

    echo "=== Starting ${SPS} gnfd-sp storage providers ==="
    SPS="${SPS}" bash /usr/local/bin/setup_sp.sh

    echo "Waiting for ${SPS} SP gateways to start listening..."
    for _t in $(seq 1 90); do
      # `|| true` keeps the pipeline (grep exits 1 until a gateway is up) from
      # tripping `set -euo pipefail` and killing this subshell before we reach
      # the sp_ready sentinel below.
      up=$(netstat -tln 2>/dev/null | grep -oE ":903[3-9]" | sort -u | wc -l || true)
      [ "${up:-0}" -ge "${SPS}" ] && break
      sleep 2
    done
    echo "SP gateways listening: $(netstat -tln 2>/dev/null | grep -oE ':903[3-9]' | sort -u | tr '\n' ' ')"
    touch /tmp/sp_ready
    echo "=== SP Sentinel File Created successfully at /tmp/sp_ready ==="
  else
    echo "=== ERROR: GVG Bootstrap Failed! ==="
    exit 1
  fi
) &

# Keep container alive and tail validator0 logs
echo "=== Streaming validator0 logs ==="
tail -f deployment/localup/.local/validator0/*.log 2>/dev/null || tail -f /dev/null
