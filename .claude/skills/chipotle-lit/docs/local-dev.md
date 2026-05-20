# Local Development

> Relevant files: `smartcontracts/greenfield-testnet/chipotle-mock.mjs`, `smartcontracts/buckets/lit-sdk-chipotle.js`

---

## Option 1: Chipotle Mock (recommended for MVP / devnet)

A Node.js in-process HTTP server that mirrors the Chipotle REST API surface.

**What it replaces:**
- TEE → Node.js `crypto.subtle` AES-GCM
- Base blockchain → in-process string compare for API key auth
- Phala KMS → single `CHIPOTLE_PKP_KEY` env var (AES key)
- IPFS → `js_params.action` dispatches to local handlers

**What it does NOT support:**
- NFT/balanceOf checks — always false on devnet (no real chain)
- Multi-key threshold BLS (single symmetric key only)
- Real IPFS CID execution — `code_cid` not supported; use inline `code`
- On-chain audit trail

### Start via docker-compose

```bash
docker compose -f smartcontracts/greenfield-testnet/docker-compose.yml up -d chipotle-mock
curl http://localhost:8000/core/v1/version
# → {"name":"chipotle-mock","version":"0.1.0","mode":"local-test","pkp":"0x..."}
```

### Env vars

```bash
CHIPOTLE_API_KEY=test-api-key          # any string works in mock mode
CHIPOTLE_PKP_KEY=<32-byte-hex>         # AES encryption key
CHIPOTLE_URL=http://localhost:8000     # service address
```

### Verify encrypt/decrypt

```bash
# Encrypt
curl -X POST http://localhost:8000/core/v1/lit_action \
  -H "X-Api-Key: test-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "async function main(p) { const ct = await Lit.Actions.Encrypt({pkpId:p.pkpId, message:p.secret}); return {ciphertext:ct}; }",
    "js_params": {"pkpId": "0x5b1C5b35F71A06FedEbBBb5b2d8CfB4180a24617", "secret": "my-key"}
  }'
# → {"response":{"ciphertext":"..."},"has_error":false}

# Decrypt
curl -X POST http://localhost:8000/core/v1/lit_action \
  -H "X-Api-Key: test-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "async function main(p) { const pt = await Lit.Actions.Decrypt({pkpId:p.pkpId, ciphertext:p.ciphertext}); return {decrypted:pt}; }",
    "js_params": {"pkpId": "0x5b1C5b35F71A06FedEbBBb5b2d8CfB4180a24617", "ciphertext": "<from above>"}
  }'
# → {"response":{"decrypted":"my-key"},"has_error":false}
```

---

## Option 2: Real Chipotle + Local Anvil (full local stack)

Runs the actual Chipotle server with TEE simulation, connecting to a local Anvil chain.

**Requires:** dstack simulator + Anvil + Chipotle repo cloned locally.

```bash
# Start dstack simulator
~/GitHub/dstack/sdk/simulator/dstack-simulator &

# Start Anvil on port 8545
~/.foundry/bin/anvil --port 8545 &

# Start full Chipotle stack
cd ~/GitHub/chipotle && ./local_test.sh
# → Chipotle on localhost:3000, Anvil chain
```

This option gives you: real TEE simulation, real Base contract interactions (via Anvil), real API key management. **Not required for MVP.**

---

## LitClient Adapter

`smartcontracts/buckets/lit-sdk-chipotle.js` implements the same `LitClient` interface as `lit-sdk.js`.

```js
import { createChipotleClient } from './smartcontracts/buckets/lit-sdk-chipotle.js';

// Point at mock
const client = createChipotleClient({ chipotleUrl: 'http://localhost:8000' });

// Point at live Chipotle
const client = createChipotleClient({ chipotleUrl: 'https://api.chipotle.litprotocol.com' });

// Both expose the same interface
await client.encrypt({ pkpId, message });
await client.decrypt({ pkpId, ciphertext });
```

Usage via `createLitAccess`:

```js
import { createLitAccess } from './smartcontracts/buckets/lit-access.js';
import { createChipotleClient } from './smartcontracts/buckets/lit-sdk-chipotle.js';

const litAccess = createLitAccess({
  litClient: createChipotleClient({ chipotleUrl: process.env.CHIPOTLE_URL }),
});
```

---

## Tier Mapping

| Tier | `CHIPOTLE_URL` | Server |
|------|----------------|--------|
| devnet (Flow B/C) | `http://localhost:8000` | chipotle-mock (docker) |
| testnet-Ch (Flow D) | `https://api.chipotle.litprotocol.com` | Chipotle live |
| testnet-Lit (Flow D alt) | Lit datil-test network | Lit SDK |
| mainnet (Flow E) | Lit datil network | Lit datil |

---

## Integration Tests

```bash
# Run all integration tests (starts docker-compose internally)
npm run test:integration

# Or run chipotle-specific tests only
npx jest tests/chipotle-drm.test.js
```

Test file: `tests/chipotle-drm.test.js` — 6 tests covering:
- encrypt/decrypt round-trip
- ACCESS_DENIED for wrong address
- `createLitAccess` wrapper integration

All tests use an in-process HTTP mock (no docker required for unit tests).

---

## Troubleshooting

**Mock won't start:**
```bash
docker compose -f smartcontracts/greenfield-testnet/docker-compose.yml logs chipotle-mock
```

**`CHIPOTLE_PKP_KEY` not set:** Mock will use a default test key. Set it in `.env` for consistent ciphertexts across restarts.

**`has_error: true` on decrypt:** Usually means the ciphertext was encrypted with a different `pkpId` or a different `CHIPOTLE_PKP_KEY`. Ensure both calls use the same `pkpId`.

**Wrong address rejection (expected behavior):**
```json
{"has_error": true, "error": "Address 0x000...001 is not in the access control conditions"}
```
This is correct — your action's address check is working.
