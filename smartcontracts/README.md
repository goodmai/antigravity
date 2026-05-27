# Daskibo Academy — Smart Contracts & Storage Layer

[BNB Greenfield](../spec/wiki.md#greenfield) decentralized course storage with AES-256-GCM encryption
and Chipotle/[Lit Protocol](../spec/wiki.md#litkey) [DRM](../spec/wiki.md#drm) access control.

---

## Architecture overview

Course content never travels in plaintext. Every lesson is encrypted with a
random per-object data key (DEK); DEKs are wrapped under a bucket-level
master key; the master key is encrypted by a DRM server (Lit or Chipotle)
whose release policy is the on-chain [Access Control Condition (ACC)](../spec/wiki.md#acc).

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
| **Demo** — Local Anvil | `31337` (local) | none | none | `smartcontracts/docker-compose.demo.yml` · `run_demo.sh` | MetaMask course-sale demo (author/client/Eve) → [Local course demo](#local-course-demo-anvil--metamask) |

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

## Local course demo (Anvil + MetaMask)

A fully local, browser-driven demo of the **course-sale + DRM flow** — register a
course as the **author**, buy it as a **client**, watch **Eve** get locked out,
and open the **encrypted** lesson only when the wallet actually owns the course —
all on a throwaway local Anvil chain. No real funds, no keys to fund.

```bash
./run_demo.sh                 # local Anvil + deploy + seed + encrypt + frontend
# → open  http://localhost:8099/course-demo.html
./run_demo.sh down            # stop and wipe the local chain
```

`run_demo.sh` (compose: [`docker-compose.demo.yml`](docker-compose.demo.yml)) brings up:

- **anvil** — local EVM chain `31337` on `http://127.0.0.1:8545` (pre-funds 10
  dev accounts with 10000 ETH each),
- **demo-deploy** — deploys & wires `Treasury` + `AccessPass` +
  `CourseMarketplace`, seeds one sample course as the author, and writes
  `demo/addresses.json` for the page,
- **chipotle-mock** — local DRM key server (`:8000`) that releases a lesson's
  decryption key **only** when the caller satisfies the on-chain ACC
  (`CourseMarketplace.hasCourseAccess`),
- **demo-encrypt** — one-shot: AES-encrypts the seeded lesson and wraps its key
  behind that ACC → `demo/manifest-1.json`,
- **frontend** — nginx serving [`course-demo.html`](course-demo.html) +
  [`course-content.html`](course-content.html) (the gated reader) on `:8099`.

### Three personas (standard public Anvil keys — in `.env` as `DEMO_*`)

| Role | Anvil account | Address |
|------|---------------|---------|
| **Author** | #1 | `0x7099…79C8` |
| **Client** | #2 | `0x3C44…93BC` |
| **Eve** (intruder) | #3 | `0x90F7…b906` |

The page detects which role the connected MetaMask account is, and the access
matrix reads `hasCourseAccess()` for **all three** at once.

### Add the Anvil network to MetaMask

Easiest: open the page and click **"Add / switch Anvil network"** (uses
`wallet_addEthereumChain`). Or add it manually — MetaMask → *Networks → Add a
network → Add manually*:

| Field | Value |
|-------|-------|
| Network name | `Daskibo Anvil (local)` |
| New RPC URL | `http://127.0.0.1:8545` |
| Chain ID | `31337` |
| Currency symbol | `ETH` |

### Import the persona keys into MetaMask

MetaMask → account menu → **Import account** → paste the private key. From
`.env` (these are well-known public Anvil test keys — no real value):

```bash
DEMO_AUTHOR_PK=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
DEMO_CLIENT_PK=0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a
DEMO_EVE_PK=0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6
```

> ⚠️ These keys are public and only ever hold play-money on a local chain.
> **Never** send real funds to them or reuse them on a public network.

### Walk-through

1. **Author** account → *Register a course* (title, price, duration). You become
   its author and have free access to your own content.
2. Switch MetaMask to the **Client** account → *Catalog* → **Buy**. A soulbound
   `AccessPass` is minted; access flips to ✓.
3. Switch to **Eve** → try to read the matrix: Eve stays ✗ (never purchased).
4. **Access matrix** shows ✓/✗ for Author / Client / Eve across every course —
   verifying gating works for all three regardless of who is connected.
5. Once a course shows access ✓, its card swaps the **Buy** button for an
   **"Open course →"** link to the gated reader ([`course-content.html`](course-content.html)).
6. **Author** can *Withdraw* the proceeds credited by the sale (pull-payments).

### The gated reader (real DRM, not a public link)

The lesson body is **AES-256-GCM encrypted**; its master key is wrapped by the
Chipotle mock behind the course's ACC. Opening `course-content.html`:

1. requires **MetaMask** (no wallet → nothing decrypts);
2. verifies `hasCourseAccess(you, courseId)` on the demo chain;
3. signs an ownership proof and asks **Chipotle** for the key — Chipotle
   **re-checks the ACC on-chain**, so no NFT/AccessPass ⇒ no key;
4. decrypts and renders the lesson client-side.

So opening the link **incognito / without the NFT shows only the blurred
placeholder** — the ciphertext alone is useless. Only the seeded course #1 ships
encrypted content (the browser can't write new manifests to the read-only
frontend); courses you register yourself demonstrate the sale/gating, and the
reader reports "manifest not found" for them.

> On a fresh chain MetaMask may cache a stale nonce after `run_demo.sh down` +
> up. If a tx won't send, *Settings → Advanced → Clear activity tab data* for
> the local network.

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
| [`../spec/CHIPOTLE.md`](../spec/CHIPOTLE.md) | Full Chipotle DRM technical reference |
| [`../spec/TESTING.md`](../spec/TESTING.md) | Test matrix and how to run |
| [`../spec/COMPOSE.md`](../spec/COMPOSE.md) | Docker Compose file reference |
| [`../spec/`](../spec/) | All other specs & design docs (SPEC, AUDIT, sc, GREENFIELD, lit, uc, tc, …) |

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
| `DEMO_AUTHOR_PK` / `DEMO_CLIENT_PK` / `DEMO_EVE_PK` | Local demo | Public Anvil keys for the demo personas (import into MetaMask). No real value. |

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
