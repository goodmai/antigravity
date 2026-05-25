---
name: chipotle-lit
description: Build, debug, and reason about products using Lit Protocol Chipotle — a REST API for TEE-based programmable key management. Use when working with Lit Actions, PKP wallets, encrypt/decrypt flows, access control conditions, ChainSecured mode (Base), or the local dev stack (dstack + Anvil). Covers architecture, auth model, API reference, patterns, pricing, and integration with the Daskibo decentralized course platform.
---

# Chipotle / Lit Protocol — Product-Building Skill

Chipotle is Lit Protocol's hosted REST API for confidential compute and programmable key management. It runs JavaScript (Lit Actions) in a TEE, manages key pairs (PKPs) on-chain via Base, and handles billing through credits.

**Local docs:** `docs/` folder next to this file.
**Source:** https://github.com/LIT-Protocol/chipotle (branch: `next`)
**Live API:** https://api.chipotle.litprotocol.com/core/v1/
**Dashboard:** https://dashboard.chipotle.litprotocol.com
**OpenAPI:** https://api.chipotle.litprotocol.com/core/v1/swagger-ui

---

## Quick reference

### Endpoints (most-used)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/core/v1/new_account` | POST | Create account → returns `api_key` + `wallet_address` |
| `/core/v1/create_wallet` | GET | Mint a new PKP → returns `wallet_address` (= pkpId) |
| `/core/v1/lit_action` | POST | Execute a Lit Action in the TEE |
| `/core/v1/add_group` | POST | Create a group (binds PKPs + action CIDs) |
| `/core/v1/add_action` | POST | Register an IPFS action CID |
| `/core/v1/version` | GET | Server health + PKP address |
| `/core/v1/billing/balance` | GET | Credit balance |

Auth header: `X-Api-Key: <your-key>` or `Authorization: Bearer <your-key>`

### Minimal encrypt/decrypt (Node.js or browser)

```js
const BASE = 'https://api.chipotle.litprotocol.com'; // or http://localhost:8000 (mock)
const API_KEY = process.env.CHIPOTLE_API_KEY;

// 1. Get (or create) a PKP — pkpId is an Ethereum address
const { wallet_address: pkpId } = await (
  await fetch(`${BASE}/core/v1/create_wallet`, { headers: { 'X-Api-Key': API_KEY } })
).json();

// 2. Encrypt a secret
const encRes = await fetch(`${BASE}/core/v1/lit_action`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Api-Key': API_KEY },
  body: JSON.stringify({
    code: `async function main({ pkpId, secret }) {
      const ciphertext = await Lit.Actions.Encrypt({ pkpId, message: secret });
      return { ciphertext };
    }`,
    js_params: { pkpId, secret: 'my-master-key' },
  }),
});
const { response: { ciphertext } } = await encRes.json();

// 3. Decrypt (with access control gate)
const decRes = await fetch(`${BASE}/core/v1/lit_action`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Api-Key': API_KEY },
  body: JSON.stringify({
    code: `async function main({ pkpId, ciphertext, userAddress, allowedAddress }) {
      if (userAddress.toLowerCase() !== allowedAddress.toLowerCase()) {
        return { error: 'Access denied' };
      }
      const plaintext = await Lit.Actions.Decrypt({ pkpId, ciphertext });
      return { plaintext };
    }`,
    js_params: { pkpId, ciphertext, userAddress: '0xYourAddress', allowedAddress: '0xYourAddress' },
  }),
});
const { response: { plaintext } } = await decRes.json();
```

---

## Account modes

### API mode (default, managed)

- Account key is generated server-side, returned once as base64.
- Admin writes (create group, add action, mint PKP) → HTTP POST → server relays to Base.
- Gas paid by credits. No wallet required for admin.
- `managed = true` on-chain.

```js
// Create account (API mode)
const res = await fetch(`${BASE}/core/v1/new_account`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ accountName: 'My App' }),
});
const { api_key, wallet_address } = await res.json();
// SAVE api_key — shown ONCE, never recoverable
```

### ChainSecured mode (self-sovereign, Base blockchain)

- **Your own wallet (EOA / Safe / contract on Base) is the account owner on-chain.**
- Admin writes = wallet-signed transactions submitted directly to Base contracts.
- No account-level API key. Usage keys are still used for Lit Action execution.
- Gas paid from your wallet (Base ETH). Credits still cover Lit Action execution.
- `managed = false` on-chain.
- **Choose this for:** multisig governance, on-chain audit trail, zero trust in relay.

```js
// ChainSecured: register your existing wallet as owner via Base contract
// (submit tx directly, no HTTP POST to /new_account)
// Use the same /core/v1/lit_action endpoint for execution — only admin writes differ
```

**Key difference for our project (Daskibo mainnet):**
- API mode: quick setup, Alice's governance key = Chipotle account key
- ChainSecured mode: Alice's Safe on Base owns the Chipotle account → every group/action/PKP change requires Safe vote → full on-chain auditability

---

## Lit Actions — TEE JavaScript

Actions are immutable JS on IPFS, executed in Phala TEE. Available globals:

| Global | Description |
|--------|-------------|
| `params` | `js_params` passed by the caller |
| `ethers` | ethers.js v5 |
| `fetch` | HTTP requests (allowed from TEE) |
| `Lit.Actions.Encrypt({ pkpId, message })` | AES-GCM encrypt with PKP-derived key |
| `Lit.Actions.Decrypt({ pkpId, ciphertext })` | Decrypt with PKP-derived key |
| `Lit.Actions.getPrivateKey({ pkpId })` | Get PKP secp256k1 private key for signing |
| `Lit.Actions.getLitActionPrivateKey()` | Get this action's own identity key (from IPFS CID) |
| `Lit.Actions.setResponse({ response })` | Legacy: set response (prefer `return`) |

**Action identity:** `getLitActionPrivateKey()` returns a key derived from the IPFS CID — a unique, deterministic identity for exactly this code. Two different CIDs = two different identities. Fork-proofed proofs.

### Access control in Chipotle = plain JavaScript

No ACC builder. Write gating as code inside the action:

```js
// NFT gate
async function main({ pkpId, ciphertext, holderAddress, nftContract }) {
  const provider = new ethers.providers.JsonRpcProvider('https://mainnet.base.org');
  const nft = new ethers.Contract(nftContract, ['function balanceOf(address) view returns (uint256)'], provider);
  const balance = await nft.balanceOf(holderAddress);
  if (balance.eq(0)) return { error: 'NFT not held' };
  return { plaintext: await Lit.Actions.Decrypt({ pkpId, ciphertext }) };
}

// AccessPass gate (Daskibo pattern)
async function main({ pkpId, ciphertext, userAddress, courseId, accessPassContract, rpcUrl }) {
  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
  const ap = new ethers.Contract(accessPassContract, ['function hasAccess(address,uint256) view returns (bool)'], provider);
  const ok = await ap.hasAccess(userAddress, courseId);
  if (!ok) return { error: 'No valid AccessPass' };
  return { decrypted: await Lit.Actions.Decrypt({ pkpId, ciphertext }) };
}
```

---

## Groups — the permission primitive

A Group binds PKPs + Action CIDs + Usage API Keys:

```
Account
 └── Group
      ├── PKP (wallet): "0xCourseVault"
      ├── IPFS CID: "Qm...decryptAction"
      └── Usage API Key: scoped to execute in this group
```

"Can this action use this PKP?" = determined by group membership.
"Can this caller use this group?" = determined by API key scopes.

---

## Local development (Daskibo project)

**Local Chipotle mock** — `smartcontracts/greenfield-testnet/chipotle-mock.mjs`

Provides the same REST surface at `http://localhost:8000`. Uses Node.js `crypto.subtle` instead of TEE + IPFS.

```bash
# Start mock (docker-compose)
docker compose -f smartcontracts/greenfield-testnet/docker-compose.yml up -d chipotle-mock
curl http://localhost:8000/core/v1/version  # → {"name":"chipotle-mock",...}

# Mock limitations vs real Chipotle:
# - ACC checked as: returnValueTest.value === userAddress (string compare, no on-chain)
# - NFT/balanceOf conditions NOT executed — always false on devnet
# - No IPFS: js_params.action dispatches internally (encrypt/decrypt)
# - CHIPOTLE_PKP_KEY env = single AES key (not threshold BLS like Lit)
```

**Real Chipotle local stack** (from chipotle repo):
```bash
# Requires: dstack simulator + Anvil (both installed at ~/GitHub/)
~/GitHub/dstack/sdk/simulator/dstack-simulator &
~/.foundry/bin/anvil --port 8545 &
cd ~/GitHub/chipotle && ./local_test.sh
# → Chipotle full stack on localhost:3000 + Anvil chain
```

**Adapter (LitClient interface)** — `smartcontracts/buckets/lit-sdk-chipotle.js`:
```js
import { createChipotleClient } from './smartcontracts/buckets/lit-sdk-chipotle.js';
const client = createChipotleClient({ chipotleUrl: 'http://localhost:8000' });
// → implements encrypt() / decrypt() same as LitClient
```

---

## Pricing (live API)

- **$0.01 per second** for management calls and Lit Action execution
- ECDSA signatures (< 1s) effectively **$0.01 each**
- Read-only ops (GET) are free
- Credit packages: $5/500cr · $10/1000cr · $25/2500cr · $50/5000cr
- Payment: Stripe (card or crypto: ETH, USDC, SOL, via Base)
- 402 error when balance exhausted

Our mock: free, no credits needed.

---

## Integration with Daskibo (this project)

The adapter file `lit-sdk-chipotle.js` implements the `LitClient` interface from `lit-access.js`.
`createLitAccess({ litClient })` wraps both Chipotle and real Lit Protocol identically.

| Tier | Adapter | Server |
|------|---------|--------|
| devnet (Flow B/C) | `createChipotleClient({ chipotleUrl: 'http://localhost:8000' })` | chipotle-mock |
| testnet (Flow D) | `createChipotleClient({ chipotleUrl: 'https://api.chipotle.litprotocol.com' })` | Chipotle live |
| mainnet (Flow E) | `createLitClient({ litNetwork: 'datil' })` | Lit Network |

manifest.lit fields for Chipotle: `litNetwork: "chipotle"`, `chipotleUrl`, `pkpId`.

See: `spec/CHIPOTLE.md`, `spec/crypto_RU.md` §Окружения, `spec/lit.md` §1a.

---

## Key security principles

1. **PKP private key never leaves TEE** — `getPrivateKey()` only works inside an action.
2. **AES-GCM symmetric key** derived from PKP inside TEE — never returned to caller.
3. **Ciphertext is safe to store anywhere** (IPFS, Greenfield, chain) — meaningless without TEE.
4. **Action CID = immutable commitment** — fork creates a new CID with a new identity.
5. **ChainSecured → Base blockchain** — every admin op is a wallet-signed tx, auditable on-chain.
6. **API mode account key** — shown once, never rotatable (contact support if lost). Store in secrets manager.
7. **Usage keys** — scoped to groups, rotatable, safe to give to services/cron jobs.

---

## See also (local docs)

- `docs/architecture.md` — Three-layer model (TEE + Base + IPFS)
- `docs/auth-model.md` — Account, API Key scopes, PKP, Group, Root Key
- `docs/account-modes.md` — API mode vs ChainSecured (Base) in detail
- `docs/lit-actions.md` — Lit Actions SDK, patterns, examples
- `docs/pricing.md` — Credits, packages, crypto payments
- `docs/api-reference.md` — All 34 API endpoints with schemas
- `docs/local-dev.md` — Local stack setup (mock + real Chipotle)
