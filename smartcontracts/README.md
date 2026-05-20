# Daskibo Academy — Smart Contracts & Storage Layer

BNB Greenfield decentralized course storage with AES-256-GCM encryption
and Chipotle/Lit Protocol DRM access control.

---

## Architecture overview

Course content never travels in plaintext. Every lesson is encrypted with a
random per-object data key (DEK); DEKs are wrapped under a bucket-level
master key; the master key is encrypted by a DRM server (Lit or Chipotle)
whose release policy is the on-chain Access Control Condition (ACC).

```
Lesson bytes  ──AES-GCM(DEK)──►  lesson.enc
DEK (32 B)    ──AES-GCM(Master)─► lesson.dek.enc
Master key    ──Lit/Chipotle──────► manifest.lit.json  (schema: daskibo.lit.acc/1)
```

The reader fetches the manifest, proves address ownership to the DRM server,
receives the master key, derives DEKs, and decrypts lessons in-browser.

---

## Five development flows

| Flow | Chain | Storage Provider | DRM server | Files used | Purpose |
|------|-------|-----------------|------------|-----------|---------|
| **A** — Mock SP | none | In-memory Node.js mock (`mock-sp.mjs`) | none | `smartcontracts/docker-compose.yml` | Fast UI + API iteration |
| **B** — Local chain | `greenfield_9000-1` (local) | Real SP in local network | none | `smartcontracts/greenfield-local/docker-compose.yml` | Real chain, clean state |
| **C** — Local DRM | testnet 5600 _or_ local | Testnet SP or mock | **Chipotle mock** on `localhost:8000` | `greenfield-testnet/docker-compose.yml` | Full DRM without paying credits |
| **D** — Testnet DRM | testnet 5600 | `gnfd-testnet-sp1.bnbchain.org` | Chipotle live API | same compose, `CHIPOTLE_URL=https://api.chipotle.litprotocol.com` | Pre-prod integration |
| **E** — Mainnet | `greenfield_1017-1` | Production SP | Lit mainnet / Chipotle funded | — | Production |

---

## Quick-start per flow

### Flow A — Mock SP (no chain, no keys needed)

```bash
docker compose -f smartcontracts/docker-compose.yml up -d
# frontend → http://localhost:8080
# mock SP  → http://localhost:9000
docker compose -f smartcontracts/docker-compose.yml down
```

Tests: `npm test` (vitest, all non-docker suites run automatically)

### Flow B — Local Greenfield chain

```bash
# Heavy: builds the Go node from source (~5 min first run)
docker compose -f smartcontracts/greenfield-local/docker-compose.yml up -d --build

# Wait for chain to produce blocks (~4 min start_period)
curl -s localhost:26750/status | jq .result.node_info.network  # → greenfield_9000-1

docker compose -f smartcontracts/greenfield-local/docker-compose.yml down -v
```

Tests: `RUN_GREENFIELD_LOCAL=1 npm test`

Ports: `26750` Tendermint RPC, `9033` SP gateway, `1317` Cosmos REST

### Flow C — Local DRM with Chipotle mock

```bash
export GREENFIELD_TESTNET_PRIVATE_KEY=0x...
export GREENFIELD_TESTNET_ADDRESS=0x...
export CHIPOTLE_PKP_KEY=0x...    # optional; printed on first run if omitted

# Terminal 1 — start mock key server
docker compose -f smartcontracts/greenfield-testnet/docker-compose.yml \
  up chipotle-mock

# Terminal 2 — publish a DRM-protected course
docker compose -f smartcontracts/greenfield-testnet/docker-compose.yml \
  run --rm chipotle-writer

# Browser — open reader with the bucket name printed by the writer
static-web-server --port 8099 --root smartcontracts/
# http://localhost:8099/bucket-reader.html?bucket=BUCKET&owner=0x...
```

Tests: `GREENFIELD_TESTNET_PRIVATE_KEY=... GREENFIELD_TESTNET_ADDRESS=... npm test`

### Flow D — Live Chipotle (funded credits)

Same as Flow C but set:
```bash
export CHIPOTLE_URL=https://api.chipotle.litprotocol.com
# Fund your Chipotle account (min $5) at https://chipotle.litprotocol.com
```

Then run the same `chipotle-writer` command. No mock needed.

---

## Key files

| File | Purpose |
|------|---------|
| `buckets/crypto-envelope.js` | AES-256-GCM hybrid encrypt/decrypt (DEK + master) |
| `buckets/lit-access.js` | LitClient interface + `createLitAccess()` orchestrator |
| `buckets/lit-sdk-chipotle.js` | Chipotle REST adapter implementing `LitClient` |
| `buckets/lit-sdk.js` | Real Lit Protocol CDN adapter |
| `greenfield-testnet/chipotle-mock.mjs` | Local Chipotle mock server (port 8000) |
| `greenfield-testnet/write-testnet.mjs` | Publish course (no DRM) |
| `greenfield-testnet/write-testnet-chipotle.mjs` | Publish course with Chipotle DRM |
| `bucket-builder.html` | Browser course builder (preview + publish via MetaMask) |
| `bucket-reader.html` | Browser DRM reader (Lit + Chipotle, MetaMask session) |
| `CHIPOTLE.md` | Full Chipotle DRM technical reference |
| `TESTING.md` | Test matrix and how to run |
| `COMPOSE.md` | Docker Compose file reference |

---

## Environment variables

| Variable | Required for | Description |
|----------|-------------|-------------|
| `GREENFIELD_TESTNET_PRIVATE_KEY` | Flows C, D | Hex private key, funded with testnet BNB |
| `GREENFIELD_TESTNET_ADDRESS` | Flows C, D | Matching 0x address |
| `GF_BUCKET` | optional | Bucket name override (default: auto-generated) |
| `LIT_ALLOWED_ADDRESS` | optional | Extra address to add to ACC |
| `CHIPOTLE_URL` | Flow C/D | Key server URL (default: `http://localhost:8000`) |
| `CHIPOTLE_PKP_KEY` | optional | Hex private key for mock PKP (persists across restarts) |
| `RUN_GREENFIELD_LOCAL` | Flow B test | Set to `1` to run local-chain docker test |

Never commit private keys. Use a `.env` file (gitignored).

---

## Infrastructure dependencies

| Tool | Path | Purpose |
|------|------|---------|
| Foundry/anvil | `~/.foundry/bin/anvil` | Local EVM node for Flow B experiments |
| dstack simulator | `~/GitHub/dstack/sdk/simulator/dstack-simulator` | Local TEE emulation for real Chipotle |
| static-web-server | `~/.local/bin/static-web-server` | Serve HTML files locally |
| Chipotle repo | `~/GitHub/chipotle` | Reference implementation + local Lit node |
| dstack repo | `~/GitHub/dstack` | TEE simulator source |
