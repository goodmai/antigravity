# Daskibo Academy — Docker Compose Reference

Three compose files serve different development tiers. Each is entirely
self-contained; they are never combined with each other.

---

## `smartcontracts/docker-compose.yml` — Mock SP stack (Flow A)

**When to use**: Fast iteration on bucket console UI and SP API without a real
chain or credentials.

```bash
docker compose -f smartcontracts/docker-compose.yml up -d
docker compose -f smartcontracts/docker-compose.yml down
```

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| `frontend` | `nginx:1.27-alpine` | `8080→80` | Serves static `smartcontracts/` site |
| `mock-sp` | `node:22-alpine` | `9000` | In-memory Greenfield SP emulation |

**Services table details**:
- `frontend`: nginx with `smartcontracts/` mounted read-only at `/usr/share/nginx/html`. Healthcheck: `GET /index.html`.
- `mock-sp`: runs `smartcontracts/integration/mock-sp.mjs`. In-memory Maps for buckets/objects — state resets on restart. Healthcheck: `GET /healthz`.

**Used by**: `tests/greenfield-integration.docker.test.js` — starts this stack automatically when Docker is available.

**Troubleshooting**:
```bash
# Check nginx logs
docker compose -f smartcontracts/docker-compose.yml logs frontend
# Check mock SP
curl localhost:9000/healthz
```

---

## `smartcontracts/greenfield-local/docker-compose.yml` — Local chain (Flow B)

**When to use**: Testing against a real Greenfield chain without spending
testnet funds. Every boot starts from a fresh genesis (no persisted volume).

```bash
# First run builds the Go node from source (~5 min)
docker compose -f smartcontracts/greenfield-local/docker-compose.yml up -d --build

# Wait for chain (~4 min); poll until healthy:
curl -s localhost:26750/status | jq .result.node_info.network
# → "greenfield_9000-1"

docker compose -f smartcontracts/greenfield-local/docker-compose.yml down -v
```

| Service | Image | Ports | Purpose |
|---------|-------|-------|---------|
| `greenfield-local` | built from `greenfield-local/Dockerfile` | `26750`, `9033`, `1317` | Real Greenfield node + SP |

**Port mapping**:
- `26750` — validator0 Tendermint RPC
- `9033` — sp0 HTTP gateway (Greenfield SP API)
- `1317` — Cosmos REST API

**Build args**:
- `GREENFIELD_REF` (default: `master`) — git ref of `bnb-chain/greenfield` to build
- `VALIDATORS` (default: `1`) — number of validators in the local network
- `SPS` (default: `1`) — number of storage providers

**Chain constants** (see `smartcontracts/buckets/greenfield-constants.js`):
```js
GREENFIELD_LOCAL = {
  chainId: 9000,
  cosmosChainId: 'greenfield_9000-1',
  rpcUrl: 'http://localhost:26750',
  spEndpoint: 'http://localhost:9033',
}
```

**Healthcheck**: `wget -qO- http://localhost:26750/status | grep greenfield_9000-1`
`start_period: 240s` — allow 4 minutes before failing.

**Used by**: `tests/greenfield-local.docker.test.js` — runs only when `RUN_GREENFIELD_LOCAL=1`.

**Troubleshooting**:
```bash
# Tail node logs
docker compose -f smartcontracts/greenfield-local/docker-compose.yml logs -f
# Reset completely (wipes build cache layer too)
docker compose -f smartcontracts/greenfield-local/docker-compose.yml down -v
docker image rm $(docker images -q greenfield-local) 2>/dev/null || true
```

---

## `smartcontracts/greenfield-testnet/docker-compose.yml` — Testnet + DRM (Flows C & D)

**When to use**: End-to-end DRM publish/read testing against the real Greenfield
testnet (chain 5600) with the Chipotle mock or live Chipotle API.

Requires:
```bash
export GREENFIELD_TESTNET_PRIVATE_KEY=0x...   # funded testnet account
export GREENFIELD_TESTNET_ADDRESS=0x...
```

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| `chipotle-mock` | `node:22-bookworm` | `8000` | Local Chipotle DRM key server |
| `testnet-writer` | `node:22-bookworm` | — | Publish course to testnet (no DRM) |
| `chipotle-writer` | `node:22-bookworm` | — | Publish course to testnet with Chipotle DRM |

### `chipotle-mock`

Runs `greenfield-testnet/chipotle-mock.mjs`. Provides the Chipotle REST API
surface at port 8000 using local Node.js crypto (no TEE, no blockchain).

```bash
# Start in background (for manual browser testing)
docker compose -f smartcontracts/greenfield-testnet/docker-compose.yml up -d chipotle-mock

# Check it's healthy
curl http://localhost:8000/core/v1/version
```

Environment:
- `CHIPOTLE_PKP_KEY` — persist the AES root key across restarts. If unset, a random key is generated and printed on startup. **Set this** if you want existing encrypted manifests to remain decryptable after a restart.
- `CHIPOTLE_PORT` — port override (default: `8000`)

Healthcheck: `curl -sf http://localhost:8000/core/v1/version`

### `testnet-writer`

Runs `write-testnet.mjs` — publishes a plaintext course (no DRM) to the real
testnet. Default command; used for baseline bucket-level testing.

```bash
docker compose -f smartcontracts/greenfield-testnet/docker-compose.yml \
  run --rm testnet-writer
```

Override to run a different script:
```bash
# Lit Protocol (port 7470 must be open)
docker compose ... run --rm testnet-writer node write-testnet-lit.mjs

# Chipotle mock (start chipotle-mock first)
docker compose ... run --rm testnet-writer node write-testnet-chipotle.mjs
```

### `chipotle-writer`

Runs `write-testnet-chipotle.mjs` with `CHIPOTLE_URL=http://chipotle-mock:8000`
hardcoded (Docker service DNS). Waits for `chipotle-mock` to pass its
healthcheck before starting (`depends_on: condition: service_healthy`).

```bash
docker compose -f smartcontracts/greenfield-testnet/docker-compose.yml \
  run --rm chipotle-writer
```

This is the canonical **Flow C** command. On success it prints:
```
ALL DONE — Chipotle-protected course published to Greenfield
```

To use live Chipotle instead of the mock (Flow D):
```bash
CHIPOTLE_URL=https://api.chipotle.litprotocol.com \
  docker compose -f smartcontracts/greenfield-testnet/docker-compose.yml \
  run --rm -e CHIPOTLE_URL testnet-writer node write-testnet-chipotle.mjs
```

(The `chipotle-writer` service hardcodes the mock URL, so for live Chipotle use
`testnet-writer` with an explicit override.)

### Environment variables for testnet compose

| Variable | Service | Description |
|----------|---------|-------------|
| `GREENFIELD_TESTNET_PRIVATE_KEY` | writer services | Account private key (hex) |
| `GREENFIELD_TESTNET_ADDRESS` | writer services | Matching 0x address |
| `GF_BUCKET` | writer services | Bucket name override |
| `LIT_ALLOWED_ADDRESS` | writer services | Extra address added to ACC |
| `CHIPOTLE_PKP_KEY` | chipotle-mock, chipotle-writer | Persistent mock PKP key |
| `CHIPOTLE_URL` | testnet-writer | Key server URL (not used by chipotle-writer — hardcoded) |

**Used by**: `tests/greenfield-testnet.live.test.js` — two test cases:
1. `testnet-writer` → expects output contains `bucket` and `ALL GOOD`
2. `chipotle-writer` → expects output contains `ALL DONE`

Both require `GREENFIELD_TESTNET_PRIVATE_KEY` and `GREENFIELD_TESTNET_ADDRESS`.

**Teardown**: The test `afterAll` runs `docker compose down --remove-orphans` to
stop `chipotle-mock` which is kept alive after `chipotle-writer` finishes.

**Troubleshooting**:
```bash
# Check chipotle-mock logs
docker compose -f smartcontracts/greenfield-testnet/docker-compose.yml logs chipotle-mock

# Run chipotle-writer interactively (see stdout in real-time)
docker compose -f smartcontracts/greenfield-testnet/docker-compose.yml \
  run --rm chipotle-writer sh -c 'npm install && node write-testnet-chipotle.mjs'

# Clean up all testnet compose state
docker compose -f smartcontracts/greenfield-testnet/docker-compose.yml down --remove-orphans
```

---

## Networking summary

| Compose | Internal DNS | Host ports |
|---------|-------------|-----------|
| `smartcontracts/docker-compose.yml` | `frontend`, `mock-sp` | `8080` (nginx), `9000` (mock SP) |
| `greenfield-local/docker-compose.yml` | `greenfield-local` | `26750`, `9033`, `1317` |
| `greenfield-testnet/docker-compose.yml` | `chipotle-mock`, `testnet-writer`, `chipotle-writer` | `8000` (chipotle-mock) |

Services in the same compose file reach each other by service name.
Cross-stack communication is via host ports only (run one stack at a time
to avoid port conflicts).
