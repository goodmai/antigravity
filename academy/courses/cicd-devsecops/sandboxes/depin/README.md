# Sandbox: depin (Akash CLI + IPFS Kubo)

Локальный IPFS-узел + Akash testnet-CLI для лабы 25.

## IPFS Kubo

```yaml
# docker-compose.yml
services:
  ipfs:
    image: ipfs/kubo:v0.30
    ports:
      - "4001:4001/tcp"
      - "4001:4001/udp"
      - "5001:5001"          # HTTP API
      - "8080:8080"          # Gateway
    volumes:
      - ipfs-data:/data/ipfs
volumes: { ipfs-data: {} }
```

```bash
docker compose up -d
docker compose exec ipfs ipfs id
docker compose exec ipfs ipfs add -r /path/to/dist
```

## Akash CLI

Akash живёт на отдельной CLI (`akash` или `provider-services`). На время курса
работаем с **Sandbox**-сетью (бесплатные тестовые токены).

```bash
# Установка CLI:
curl -sSfL https://raw.githubusercontent.com/akash-network/node/main/install.sh | bash
akash --help

# Sandbox network endpoints:
export AKASH_NODE="https://rpc.sandbox-01.aksh.pw:443"
export AKASH_CHAIN_ID="sandbox-01"
```

## Лабы

- [Lab 25 — Akash + IPFS](../../labs/25-akash-ipfs/)
