#!/usr/bin/env bash
# Provision and start the real gnfd-sp storage providers for the local private
# Greenfield chain. Mirrors greenfield-storage-provider's deployment/localup
# make_config recipe (v1.10.1).
#
# Greenfield seals objects with erasure coding across a Global Virtual Group:
# 1 primary SP + N-1 secondary SPs (here 4 data + 2 parity = 6 secondaries).
# So ALL ${SPS} SPs must run for an object to seal — a single SP cannot.
#
# All SPs run inside this one container, so they reach each other (and the
# chain) over 127.0.0.1, matching the on-chain registered endpoints
# http://127.0.0.1:903x.
#
# Prereqs (installed by the Dockerfile): libstdc++, mariadb, mariadb-client,
# the gnfd-sp binary at build/bin/gnfd-sp, and a running chain on :26750.
set -euo pipefail

GREENFIELD_DIR=/opt/greenfield
SPS=${SPS:-7}
SPS_JSON=/tmp/sps.json

# greenfield-storage-provider localup port scheme (deployment/localup/env.info)
SP_START_PORT=10000          # base gRPC port; SP i uses SP_START_PORT + 1000*i
SP_START_ENDPOINT_PORT=9033  # gateway HTTP; SP i uses this + i
# sp0 P2P key from env.info → deterministic peer id used by the bootstrap entry.
SP0_P2P_PRIVATE_KEY=0710be1c04dfa07bd84bfc68f8b663071885a85031066bbb3b6bbed421cf9511
SP0_P2P_PEER=16Uiu2HAmG4KTyFsK71BVwjY4z6WwcNBVb6vAiuuL9ASWdqiTzNZH

CHAIN_ID=greenfield_9000-1
CHAIN_HTTP=127.0.0.1:26750
DB_USER=root
DB_PWD=sppass
DB_ADDR=127.0.0.1:3306
SP_DOMAIN=gnfd.test-sp.com

echo "=== [setup_sp] exporting ${SPS} SP key sets ==="
cd "${GREENFIELD_DIR}"
bash ./deployment/localup/localup.sh export_sps 1 "${SPS}" > "${SPS_JSON}" 2>/dev/null

echo "=== [setup_sp] ensuring MariaDB grants for TCP root ==="
mysql -u root <<SQL 2>/dev/null || true
CREATE USER IF NOT EXISTS 'root'@'127.0.0.1' IDENTIFIED BY '${DB_PWD}';
ALTER USER 'root'@'127.0.0.1' IDENTIFIED BY '${DB_PWD}';
GRANT ALL PRIVILEGES ON *.* TO 'root'@'127.0.0.1' WITH GRANT OPTION;
CREATE USER IF NOT EXISTS 'root'@'%' IDENTIFIED BY '${DB_PWD}';
ALTER USER 'root'@'%' IDENTIFIED BY '${DB_PWD}';
GRANT ALL PRIVILEGES ON *.* TO 'root'@'%' WITH GRANT OPTION;
FLUSH PRIVILEGES;
SQL

for ((i=0; i<SPS; i++)); do
  sp_dir="${GREENFIELD_DIR}/sp_env/sp${i}"
  grpc_port=$((SP_START_PORT + 1000*i))
  http_port=$((SP_START_ENDPOINT_PORT + i))
  db_name="sp_${i}"

  echo "=== [setup_sp] sp${i}: grpc=${grpc_port} http=${http_port} db=${db_name} ==="
  mkdir -p "${sp_dir}/data"
  cp -f "${GREENFIELD_DIR}/build/bin/gnfd-sp" "${sp_dir}/gnfd-sp${i}"
  cd "${sp_dir}"
  ./gnfd-sp${i} config.dump >/dev/null 2>&1

  OPERATOR_ADDRESS=$(jq -r ".sp${i}.OperatorAddress" "${SPS_JSON}")
  OPERATOR_PK=$(jq -r ".sp${i}.OperatorPrivateKey" "${SPS_JSON}")
  FUNDING_PK=$(jq -r ".sp${i}.FundingPrivateKey" "${SPS_JSON}")
  SEAL_PK=$(jq -r ".sp${i}.SealPrivateKey" "${SPS_JSON}")
  APPROVAL_PK=$(jq -r ".sp${i}.ApprovalPrivateKey" "${SPS_JSON}")
  GC_PK=$(jq -r ".sp${i}.GcPrivateKey" "${SPS_JSON}")
  BLS_PK=$(jq -r ".sp${i}.BlsPrivateKey" "${SPS_JSON}")

  CFG=config.toml
  # app
  sed -i -e "s#GRPCAddress = '.*'#GRPCAddress = '127.0.0.1:${grpc_port}'#g" "${CFG}"
  # db (SpDB + BsDB)
  sed -i -e "s#User = '.*'#User = '${DB_USER}'#g" "${CFG}"
  sed -i -e "s#Passwd = '.*'#Passwd = '${DB_PWD}'#g" "${CFG}"
  sed -i -e "s#^Address = '.*'#Address = '${DB_ADDR}'#g" "${CFG}"
  sed -i -e "s#Database = '.*'#Database = '${db_name}'#g" "${CFG}"
  # piece store: local filesystem
  sed -i -e "s#Shards = .*#Shards = 0#g" "${CFG}"
  sed -i -e "s#Storage = '.*'#Storage = 'file'#g" "${CFG}"
  sed -i -e "s#BucketURL = '.*'#BucketURL = './data'#g" "${CFG}"
  sed -i -e "s#IAMType = '.*'#IAMType = 'SA'#g" "${CFG}"
  # chain
  sed -i -e "s#ChainID = '.*'#ChainID = '${CHAIN_ID}'#g" "${CFG}"
  sed -i -e "s#ChainAddress = \[.*\]#ChainAddress = \['http://${CHAIN_HTTP}'\]#g" "${CFG}"
  # sp account
  sed -i -e "s#SpOperatorAddress = '.*'#SpOperatorAddress = '${OPERATOR_ADDRESS}'#g" "${CFG}"
  sed -i -e "s#OperatorPrivateKey = '.*'#OperatorPrivateKey = '${OPERATOR_PK}'#g" "${CFG}"
  sed -i -e "s#FundingPrivateKey = '.*'#FundingPrivateKey = '${FUNDING_PK}'#g" "${CFG}"
  sed -i -e "s#SealPrivateKey = '.*'#SealPrivateKey = '${SEAL_PK}'#g" "${CFG}"
  sed -i -e "s#ApprovalPrivateKey = '.*'#ApprovalPrivateKey = '${APPROVAL_PK}'#g" "${CFG}"
  sed -i -e "s#GcPrivateKey = '.*'#GcPrivateKey = '${GC_PK}'#g" "${CFG}"
  sed -i -e "s#BlsPrivateKey = '.*'#BlsPrivateKey = '${BLS_PK}'#g" "${CFG}"
  # gateway: bind all interfaces; domain is the SP universal-endpoint vhost base
  sed -i -e "s#DomainName = '.*'#DomainName = '${SP_DOMAIN}'#g" "${CFG}"
  sed -i -e "s#^HTTPAddress = '.*'#HTTPAddress = '0.0.0.0:${http_port}'#g" "${CFG}"
  # metadata
  sed -i -e "s#IsMasterDB = .*#IsMasterDB = true#g" "${CFG}"
  sed -i -e "s#BsDBSwitchCheckIntervalSec = .*#BsDBSwitchCheckIntervalSec = 30#g" "${CFG}"
  # p2p
  if [ "${i}" -eq 0 ]; then
    sed -i -e "s#P2PAddress = '.*'#P2PAddress = '127.0.0.1:9633'#g" "${CFG}"
    sed -i -e "s#P2PPrivateKey = '.*'#P2PPrivateKey = '${SP0_P2P_PRIVATE_KEY}'#g" "${CFG}"
  else
    p2p_port=$((SP_START_PORT + 1000*i + 1))
    sed -i -e "s#P2PAddress = '.*'#P2PAddress = '127.0.0.1:${p2p_port}'#g" "${CFG}"
    sed -i -e "s#P2PBootstrap = \[\]#P2PBootstrap = \['${SP0_P2P_PEER}@127.0.0.1:9633'\]#g" "${CFG}"
  fi
  sed -i -e "s#MaxExecuteNumber = .*#MaxExecuteNumber = 1#g" "${CFG}"
  # monitor
  sed -i -e "s#MetricsHTTPAddress = '.*'#MetricsHTTPAddress = '127.0.0.1:$((grpc_port + 367))'#g" "${CFG}"
  sed -i -e "s#PProfHTTPAddress = '.*'#PProfHTTPAddress = '127.0.0.1:$((grpc_port + 368))'#g" "${CFG}"
  sed -i -e "s#ProbeHTTPAddress = '.*'#ProbeHTTPAddress = '127.0.0.1:$((grpc_port + 369))'#g" "${CFG}"
  # blocksyncer
  sed -i -e "s#Modules = \[\]#Modules = \['epoch','bucket','object','payment','group','permission','storage_provider','prefix_tree','virtual_group','sp_exit_events','object_id_map','general'\]#g" "${CFG}"
  sed -i -e "s#Workers = 0#Workers = 10#g" "${CFG}"
  sed -i -e "s#BsDBWriteAddress = '.*'#BsDBWriteAddress = '${DB_ADDR}'#g" "${CFG}"
  # manager
  sed -i -e "s#SubscribeSPExitEventIntervalMillisecond = .*#SubscribeSPExitEventIntervalMillisecond = 100#g" "${CFG}"
  sed -i -e "s#SubscribeSwapOutExitEventIntervalMillisecond = .*#SubscribeSwapOutExitEventIntervalMillisecond = 100#g" "${CFG}"
  sed -i -e "s#SubscribeBucketMigrateEventIntervalMillisecond = .*#SubscribeBucketMigrateEventIntervalMillisecond = 20#g" "${CFG}"
  sed -i -e "s#GVGPreferSPList = \[\]#GVGPreferSPList = \[1,2,3,4,5,6,7\]#g" "${CFG}"
  sed -i -e "s#EnableHealthyChecker = .*#EnableHealthyChecker = true#g" "${CFG}"

  mysql -h 127.0.0.1 -u root -p"${DB_PWD}" -e "CREATE DATABASE IF NOT EXISTS ${db_name};" 2>/dev/null

  pkill -f "gnfd-sp${i} --config" 2>/dev/null || true
  nohup ./gnfd-sp${i} --config "${CFG}" </dev/null >"${sp_dir}/sp.log" 2>&1 &
  echo "    sp${i} launched (pid $!, log ${sp_dir}/sp.log)"
done

echo "=== [setup_sp] all ${SPS} storage providers launched ==="
