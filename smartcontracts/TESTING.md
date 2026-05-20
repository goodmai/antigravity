# Daskibo Academy — Test Reference

## How to run

```bash
# Default: all unit + in-process integration tests (no Docker, no keys)
npm test

# Watch mode
npm run test:watch   # or: npx vitest --watch

# Single file
npx vitest run tests/chipotle-drm.test.js

# Docker-based integration (mock SP + nginx)
npm test   # greenfield-integration.docker.test.js auto-starts compose when Docker is available

# Live testnet (spends real testnet gas)
export GREENFIELD_TESTNET_PRIVATE_KEY=0x...
export GREENFIELD_TESTNET_ADDRESS=0x...
npm test   # greenfield-testnet.live.test.js activates automatically

# Local Greenfield chain (builds Go node, ~5 min)
RUN_GREENFIELD_LOCAL=1 npm test
```

---

## Test matrix

| Test file | Type | Speed | Gate condition | What it covers |
|-----------|------|-------|---------------|----------------|
| `lit-access.test.js` | unit | fast | — | `createLitAccess` orchestrator, `classify()` error codes |
| `crypto-envelope.test.js` | unit | fast | — | AES-256-GCM envelope: encrypt, decrypt, DEK wrap, passphrase wrap |
| `chipotle-drm.test.js` | in-process integration | fast | — | Chipotle mock server (in-proc), encrypt/decrypt, `ACCESS_DENIED` path |
| `course-publish.test.js` | unit | fast | — | `planCoursePublish` lesson planning and manifest shape |
| `course-read.test.js` | unit | fast | — | `readCourseManifest` and lesson index |
| `course-template.test.js` | unit | fast | — | Course template generation |
| `greenfield-buckets.test.js` | unit | fast | — | Bucket name validation, metadata encoding |
| `greenfield-sp.test.js` | unit | fast | — | SP endpoint URL construction |
| `greenfield-sdk-tx.test.js` | unit | fast | — | SDK transaction builder helpers |
| `greenfield-wallet-core.test.js` | unit | fast | — | Wallet derivation and signing |
| `greenfield-wallet-backend.test.js` | unit | fast | — | Backend wallet adapter |
| `greenfield-backend-contract.test.js` | unit | fast | — | Backend contract interaction |
| `sp-emulation-backend.test.js` | unit | fast | — | SP emulation backend API |
| `greenfield-ui.test.js` | unit | fast | — | UI component logic |
| `wallet-provider.test.js` | unit | fast | — | MetaMask / injected provider detection |
| `lit-pricing.test.js` | unit | fast | — | Lit credit pricing calculations |
| `web3.test.js` | unit | fast | — | Web3 utility functions |
| `web3-quiz.test.js` | unit | fast | — | Quiz interaction logic |
| `web3-rpc.test.js` | unit | fast | — | RPC helpers |
| `web3-sandbox.test.js` | unit | fast | — | Sandbox environment |
| `web3-sandbox-embed.test.js` | unit | fast | — | Sandbox embed API |
| `web3-sandbox-erc20.test.js` | unit | fast | — | ERC-20 sandbox interactions |
| `greenfield-integration.docker.test.js` | docker integration | medium | Docker daemon available | nginx + mock-sp: bucket create, object save, read round-trip |
| `greenfield-local.docker.test.js` | docker integration | slow (4-5 min) | Docker + `RUN_GREENFIELD_LOCAL=1` | Real local Greenfield chain: chain-id, block production |
| `greenfield-testnet.live.test.js` | live testnet | slow (varies) | Docker + `GREENFIELD_TESTNET_PRIVATE_KEY` + `GREENFIELD_TESTNET_ADDRESS` | Real testnet: plain write + Chipotle DRM write (chain 5600) |

---

## Test tiers

### Tier 1 — Unit / in-process (always run)

No environment variables, no Docker, no network. Runs in vitest jsdom environment.

- WebCrypto: import `webcrypto` from `node:crypto` explicitly — do **not** rely on the jsdom global.
- Fetch: available natively in Node 22+; no polyfill needed.
- In-process servers: use `http.createServer` + `listen(0, ...)` to get a random free port.

Gate: none — these run in `npm test` by default.

### Tier 2 — Docker integration (runs when Docker is available)

The test file calls `execSync('docker info')` and skips the describe block if Docker is
unreachable. Tests bring up compose stacks via `execFileSync('docker', ['compose', ...])`.

Gate: Docker daemon reachable.

### Tier 3 — Live testnet (opt-in)

Spends real testnet BNB. Requires a funded account.

Gate: `GREENFIELD_TESTNET_PRIVATE_KEY` and `GREENFIELD_TESTNET_ADDRESS` both set.

Fund a testnet account:
```
https://docs.bnbchain.org/bnb-greenfield/getting-started/get-test-bnb/
```

### Tier 4 — Local chain (opt-in)

Builds the Greenfield Go node from source. First build takes ~5 min; subsequent runs use
the Docker build cache. Every boot starts from a fresh genesis (no persistent volume).

Gate: `RUN_GREENFIELD_LOCAL=1` environment variable.

---

## Environment variable reference

| Variable | Tier | Description |
|----------|------|-------------|
| `RUN_GREENFIELD_LOCAL` | 4 | Set to `1` to enable local-chain docker test |
| `GREENFIELD_TESTNET_PRIVATE_KEY` | 3 | Hex private key with testnet BNB |
| `GREENFIELD_TESTNET_ADDRESS` | 3 | Matching 0x Ethereum address |
| `GF_BUCKET` | 3 | Override bucket name (default: auto) |
| `LIT_ALLOWED_ADDRESS` | 3 | Additional address to add to ACC |
| `CHIPOTLE_PKP_KEY` | 3 | Persist the Chipotle mock PKP across restarts |
| `CHIPOTLE_URL` | 3/4 | Chipotle server URL (default: `http://localhost:8000`) |

---

## How to add a new test

### Adding a Tier 1 (unit) test

1. Create `tests/my-feature.test.js`
2. Import from `vitest`: `import { describe, it, expect } from 'vitest'`
3. If you need crypto: `import { webcrypto } from 'node:crypto'`
4. No special gate needed — it runs automatically

```js
import { describe, it, expect } from 'vitest';
import { webcrypto } from 'node:crypto';
import { myFunction } from '../smartcontracts/buckets/my-module.js';

describe('myFunction', () => {
  it('does the thing', () => {
    expect(myFunction('input')).toBe('expected');
  });
});
```

### Adding a Tier 2 (docker) test

1. Create `tests/my-feature.docker.test.js`
2. Add the Docker availability gate at the top:
```js
import { execSync, execFileSync } from 'node:child_process';
function dockerAvailable() {
  try { execSync('docker info', { stdio: 'ignore' }); return true; }
  catch { return false; }
}
const d = dockerAvailable() ? describe : describe.skip;
```
3. Use `execFileSync('docker', ['compose', '-f', '...', 'run', '--rm', 'service'])` to drive compose

### Adding a Tier 3 (live testnet) test

Add to `tests/greenfield-testnet.live.test.js` inside the existing `d(...)` describe block.
The `ENABLED` gate already checks for Docker + private key + address.

### Adding an in-process HTTP mock (Tier 1)

Use `http.createServer` + `listen(0, ...)` for a random port:

```js
import http from 'node:http';
import { beforeAll, afterAll } from 'vitest';

let server, baseUrl;
beforeAll(async () => {
  server = http.createServer((req, res) => { /* ... */ });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
afterAll(() => server.close());
```
