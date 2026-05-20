# Chipotle Architecture — Three Layers

> Source: `docs/architecture/index.mdx` · `docs/architecture/diagram.mdx`
> https://github.com/LIT-Protocol/chipotle (branch: next)

---

## The Three Layers

Chipotle is built on three composable layers with distinct concerns:

### 1. TEE Enclave (Phala / dstack)

- Holds the **root key** (master secret). Never leaves the enclave.
- Performs all sensitive operations: key derivation, auth checking, sandboxed JS execution.
- Acts as a **convenience relay** for admin transactions: verifies API key scopes, then signs and submits on-chain management txs to Base on your behalf.
- Derives signing key + symmetric key from root key **transiently** on demand — never persisted.

### 2. On-Chain Permissions (Base blockchain)

All authorization state lives on-chain in Base smart contracts:

| Contract | Role |
|----------|------|
| Account contract | Registers the owner address. All permissions flow from here. |
| API Key Registry | Maps key addresses → scopes. Owner-managed. |
| PKP Registry | List of PKP derivation path IDs owned by the Account. |
| Groups | Permission policies: `{PKP IDs, Action CIDs}`. |

The TEE reads these contracts on every request to decide whether to execute.

### 3. Lit Actions (IPFS)

- Immutable JS programs stored on IPFS, identified by **CID** (content ID).
- Not owned by anyone — public, reusable, content-addressed (like npm packages).
- TEE fetches by CID at execution time, runs in sandboxed JS with derived key material.
- **CID = immutable commitment to the code.** Fork = new CID = new identity.

---

## Self-Sovereign vs SaaS

**There are no modes.** SaaS vs self-sovereign is an emergent property of configuration:

| | SaaS (API mode) | Self-Sovereign (ChainSecured) |
|---|---|---|
| **Account Owner** | TEE-derived wallet (Stytch auth) | 3-of-5 SAFE / EOA on Base |
| **API Key Scopes** | Broad — full access via HTTP | Purpose-built, minimal scopes |
| **Structural Changes** | Via TEE relay (HTTP POST) | SAFE vote → direct on-chain tx |
| **Key Recovery** | Retain the API key | SAFE signers |
| **Leaked Key Blast Radius** | High | Minimal — scoped to specific groups |
| **`managed` flag on-chain** | `true` | `false` |
| **Gas for admin writes** | Covered by credits (server pays) | You pay from wallet (Base ETH) |

---

## Entity Relationships

```
USER / EXTERNAL                ON-CHAIN (BASE)             TEE ENCLAVE
─────────────────────────────  ──────────────────────────  ──────────────────────
Account Owner                  Account Contract             Root Key
 EOA / SAFE / TEE-derived   ──▶  owner address registered    master secret, never exported
      │ owns                                                      │ derives
      │                        API Key Registry             Auth + Key Derivation
API Key (private key)       ──▶  address → scopes mapping ◀──    verify scopes, derive keys
 Held by user, sent/request                                       │ provides keys
      │ sent over HTTPS            │ reads                        │
      └──────────────────────────▶ TEE                    Sandbox Execution
                                   │                        runs Lit Actions w/ key material
                                  PKP Registry                    │ fetched from IPFS
                                   derivation path IDs            ▼
                                      │ referenced         Lit Actions (IPFS)
                                  Groups               ◀──   Immutable JS, public CIDs
                                   {PKP refs, Action CIDs}
                                      │
                                  TX Relay
                                   signs + submits mgmt txs to Base
```

---

## Execution Flow (inside the TEE)

1. API key arrives over HTTPS → TEE derives address from key
2. On-chain lookup: what scopes does this address have?
3. Does the request target a specific group? Is the action CID in that group? Is the PKP in that group?
4. All checks pass → derive key material from root key using PKP's derivation path
5. Fetch Lit Action code from IPFS by CID
6. Execute in sandboxed JS environment with access to derived keys
7. Return result to caller (key material never leaves TEE)

---

## Security Properties

- **Root key** is managed by Phala's KMS. Only approved TEE build images can derive from it.
- **Key material** is derived transiently and discarded after execution — never persisted.
- **Audit trail**: with ChainSecured mode, every admin op is a wallet-signed Base tx.
- **Verifiable TEE**: check Phala Trust Center report at `https://api.chipotle.litprotocol.com/core/v1/version`

---

## Local dev equivalent

Our `chipotle-mock.mjs` emulates the same API surface:
- No TEE — Node.js `crypto.subtle` instead
- No Phala — AES-GCM key derived from `CHIPOTLE_PKP_KEY` env var
- No Base — ACC checked in-process (string compare only)
- No IPFS — `js_params.action` dispatches to local handlers
