# REVIEW.md — Feasibility audit: Chipotle (Lit mainnet) + Greenfield testnet + NFT-gated access on BSC/opBNB testnet

**Date:** 2026-06-09 · **Reviewer view:** deployment feasibility / security
**Method:** repo code + config audit cross-checked against the in-repo
[Lit skill](../skills/lit/SKILL.md) and [Greenfield skill](../skills/greenfield/SKILL.md)
and the canonical docs they cite (verified June 2026).
**Related:** [audit.md](../smartcontracts/contracts/audit.md) (contract audit) ·
[NFT.md](../smartcontracts/contracts/NFT.md) · [RTM.md](./RTM.md) · [uc.md](./uc.md)

---

## 1. Target topology

```
 Identity / key release        Content storage             Access gate (read-only eth_call)
 ┌───────────────────────┐    ┌──────────────────────┐    ┌────────────────────────────────┐
 │ Chipotle (Lit v3) GA   │    │ BNB Greenfield TESTNET│    │ BSC testnet 97  (or opBNB 5611) │
 │ REST, TEE on Phala     │    │ greenfield_5600-1     │    │ CourseMarketplace.hasCourseAccess│
 │ Base mainnet 8453      │    │ SP gnfd-testnet-sp1   │    │  OR ClientNft.balanceOf>=1       │
 │ (account/PKP, Stripe$) │    │ ciphertext + manifest │    │  (soulbound)                     │
 └──────────┬────────────┘    └──────────┬───────────┘    └───────────────┬────────────────┘
            │ wrap/unwrap master key                 read .enc + manifest  │ eth_call (view)
            └──────────────── browser/reader ────────────────────────────-┘
```

Three independent networks: **payment/identity** (Chipotle on Base mainnet),
**storage** (Greenfield testnet), **access predicate** (BSC or opBNB testnet).
The access check is a read-only `eth_call` — it never costs gas and needs no
bridge ([uc.md Funding Matrix](./uc.md)).

## 2. Verdict

**Feasible — and already wired.** The exact combination ships as
[`smartcontracts/docker-compose.mainnet-lit.yml`](../smartcontracts/docker-compose.mainnet-lit.yml):
`deploy` (Foundry → BSC testnet 97) → `writer` (`write-devnet.mjs`, encrypt +
publish to Greenfield testnet 5600, gate via **real** Chipotle
`api.chipotle.litprotocol.com`) → `frontend`. Defaults: `NFT_GATING_CHAIN=bscTestnet`,
`CHIPOTLE_URL=https://api.chipotle.litprotocol.com`, `GREENFIELD_SP=gnfd-testnet-sp1`.

**Readiness — demo path:** ~85%. The crypto/contract layer and publish path are
production-shaped (178/179 forge tests green, 100% line/func — see
[audit.md](../smartcontracts/contracts/audit.md)); the shipped mainnet-lit flow
runs today with owner-EOA minting and the mock `wrap_for_buyer`.

**Readiness — trustless production:** ~55%. The decentralized enforcement
mechanisms exist **as code** but are **not provisioned** as live PKP actions (no
IPFS CID, no minted PKP, `claimSigner` is an EOA, `wrap_for_buyer` is mock-only)
— see **R-1b** (the main blocker). Other open items: **trust-model caveat (R-1)**,
**config wiring (R-2)**, **opBNB additive (R-3)** — none are architectural blockers.

## 3. Funding & network matrix (this combo)

| Surface | Network | Token | Funded for | Source |
| :-- | :-- | :-- | :-- | :-- |
| Contract deploy + buyer `purchase` | BSC testnet **97** (or opBNB **5611**) | tBNB | deploy gas, `registerCourse`, `purchase` (gas+price), `withdraw` | BSC/opBNB testnet faucet |
| Ciphertext storage | Greenfield testnet **5600** | tBNB (on GF) | `MsgCreateBucket`, upload, storage/read-quota | BSC-testnet tBNB → **cross-chain transfer** to Greenfield |
| Key release (Chipotle) | Base mainnet **8453** + Lit chain **175200** | **Stripe credits (USD, min $5)** | action runs (encrypt/decrypt), PKP/account | Stripe (`/billing/*`); **no testnet, no $LITKEY** |

> Per [Lit skill §1/§7](../skills/lit/SKILL.md): Chipotle has **no testnet** (Base
> mainnet only) — the "testnet" in this topology is **storage + gate**, while key
> release is paid-mainnet. The access `eth_call` is free (view).

## 4. Component feasibility

| Component | Status | Notes |
| :-- | :-- | :-- |
| **Chipotle (Lit v3) GA** | ✅ | Datil dead 2026-02-25, Naga sunset 2026-04-01 → Chipotle is the only live network; REST adapter `lit-sdk-chipotle.js` exists ([Lit skill §1](../skills/lit/SKILL.md)). |
| **Greenfield testnet** | ✅ | Endpoints current (`gnfd-testnet-fullnode-tendermint-us:443`, `gnfd-testnet-sp1`); writer round-trips manifest ([Greenfield skill matrix](../skills/greenfield/SKILL.md)). |
| **NFT gate on BSC testnet** | ✅ | `DeployAccessNfts` + `CourseMarketplace` to chain 97; soulbound `ClientNft`/`hasCourseAccess`; `CHAIN_RPCS.bscTestnet` resolves the reader RPC. |
| **NFT gate on opBNB testnet** | 🟡 additive | EVM-equivalent (chain 5611) — contracts deploy unchanged, but needs an `opbnbTestnet` RPC entry + redeploy (R-3). |
| **Contracts** | ✅ | Audited (audit.md Pass 1+2), 100% line/func coverage, sale-nonce + reprice landed. |

## 5. Findings

### R-1 — ACC is enforced **app-side**, not inside the Chipotle TEE  · Severity: High (trust model)

Chipotle **removed `Lit.Actions.checkConditions`**, so the NFT/expiry Access
Control Conditions are evaluated by whoever runs the decrypt adapter, not by the
decentralized network. In `lit-sdk-chipotle.js::decrypt` the gate is an `eth_call`
via `evaluateAcc(... ethCall: makeFetchEthCall(rpc))` **before** the Chipotle
decrypt call ([Lit skill §1/§8.3](../skills/lit/SKILL.md)).

Implication: on mainnet Chipotle the real cryptographic enforcement for paid
content is the **P-A scheme** — the master key is wrapped **address-bound per
buyer** (`AccessPass.encryptedKey`, `wrap_for_buyer`) and decrypt requires a
`signedProof` of that address — **not** the NFT balance check, which a hostile
client could skip. The `eth_call` NFT/expiry gate is a client-side policy layer.

**Recommendation:** for a production gate, do **not** rely on the app-side
`balanceOf` check alone. Anchor enforcement on (a) address-bound P-A ciphertext +
`signedProof`, and (b) the `claim-signer` Lit Action (PKP) that signs the
mint **only if `hasCourseAccess` is true** ([NFT.md §4](../smartcontracts/contracts/NFT.md#4-lit-action--децентрализованный-claim-signer)).
Treat the reader's `eth_call` as defense-in-depth, and document that a
self-hosted reader is part of the TCB. Confirm whether a server-side reader (not
the buyer's browser) should perform the gate for paid tiers.

### R-2 — `ANVIL_RPC` must point at the gating chain (misnamed) · Severity: Medium (config)

`lit-sdk-chipotle.js` resolves the ACC reader RPC from `process.env.ANVIL_RPC`
(fallback `http://127.0.0.1:8545`). In this topology that env must be the **public
BSC testnet** (or opBNB testnet) RPC, e.g. `https://bsc-testnet-rpc.publicnode.com`
— otherwise the gate silently reads localhost. Browser readers instead use
`CHAIN_RPCS[chain]` via `rpcForChain()` (correct for `bscTestnet`). 

**Recommendation:** rename `ANVIL_RPC` → `GATING_RPC` (keep `ANVIL_RPC` as a
fallback alias) and set it explicitly in `docker-compose.mainnet-lit.yml`; assert
non-localhost when `CHIPOTLE_URL` is the real endpoint.

### R-1b — PKP actions are code-ready but **not provisioned** · Severity: High (blocker for the trustless path)

The enforcement mechanisms R-1 recommends exist as **code + contract + unit
tests**, but neither is deployed as a live PKP-backed Lit Action on real Chipotle:

- **`claim-signer.action.js`** (mint authorization): action JS written; contract
  side (`claimWithSig`/`setClaimSigner`/nonce/replay/deadline) fully forge-tested;
  EIP-712 digest byte-parity unit-tested (`tests/claim-eip712.test.js`). **Missing:**
  not pinned to IPFS (no CID), no Chipotle PKP minted/assigned to the CID,
  `DeployAccessNfts` sets `claimSigner = deployer` (an EOA, **not** a PKP), and
  **no caller** wires it in — `docker-compose.mainnet-lit.yml` mints directly via
  the owner key (`cast send … mint`). So today minting is centralized (owner EOA),
  not trustless.
- **`wrap_for_buyer`** (decrypt-side P-A address-binding — the actual key release):
  implemented **only in the mock** (`greenfield-testnet/chipotle-mock.mjs`,
  exercised by `e2e/run-devnet-pa.mjs`). On real Chipotle it is **not** a built-in
  REST endpoint — it must be deployed as a custom Lit Action backed by a PKP/vault
  holding the master key.

**To make the trustless path real:** (1) pin both actions to IPFS; (2) mint a
Chipotle PKP and assign it to each action CID; (3) `nft.setClaimSigner(pkpEvmAddr)`;
(4) add the caller that POSTs `claim-signer` and submits the returned signature to
`claimWithSig`; (5) deploy `wrap_for_buyer` as a PKP-backed action on real Chipotle
and point the reader at it. Until then the shipped mainnet-lit flow relies on the
**owner EOA for minting** and the **mock for `wrap_for_buyer`** — acceptable for a
demo, not for production. See [NFT.md §4](../smartcontracts/contracts/NFT.md#4-lit-action--децентрализованный-claim-signer)
and [Lit skill §7.5](../skills/lit/SKILL.md).

### R-3 — opBNB testnet support is additive · Severity: Medium (scope)

opBNB testnet (chain **5611**, RPC `https://opbnb-testnet-rpc.publicnode.com`,
EVM-equivalent OP-Stack, tBNB gas) is **not** in `CHAIN_RPCS` (only
ethereum/bsc/bscTestnet). To gate on opBNB:
1. add `opbnbTestnet: 'https://opbnb-testnet-rpc.publicnode.com'` to `CHAIN_RPCS`
   in `lit-acc-eval.js` (+ optional numeric `5611` alias);
2. deploy `DeployAccessNfts`/`CourseMarketplace` to opBNB testnet (same bytecode);
3. set `NFT_GATING_CHAIN=opbnbTestnet` and point `GATING_RPC`/`RPC_URL` at opBNB.

No contract changes are needed (EVM-equivalent). Verify the Lit `chain` identifier
string Chipotle/manifest expects matches what the reader maps.

### R-4 — Single-RPC evaluator: no true cross-chain OR · Severity: Medium

`evaluateAcc` takes a single `ethCall` reader, so an ACC like "NFT on bscTestnet
**OR** NFT on opBNB" cannot be evaluated against two chains at once. Each manifest
is effectively single-chain today.

**Recommendation:** if cross-chain OR is required, route per-condition by
`c.chain` to the matching RPC (use `rpcForChain` per condition), or move the
multi-chain merge into a `requireLitAction` (CID) path ([Lit skill §8](../skills/lit/SKILL.md)).

### R-5 — Greenfield testnet seal latency · Severity: Low (operational)

Objects seal asynchronously (~100–110 s after `putObject`); reads before seal
return `404/not sealed`, which is **not** an access denial. The writer already
round-trips the manifest; readers must use `readObjectWithRetry`
([Greenfield skill — Local SP-стек](../skills/greenfield/SKILL.md), [Lit skill §4](../skills/lit/SKILL.md)).
On public testnet SP this is usually faster but still asynchronous.

### R-6 — Per-condition read failure is non-fatal (fail-open within an OR set) · Severity: Low

`evaluateAcc` treats an on-chain read error as non-fatal and "tries the rest",
and skips contract conditions entirely if no `ethCall` reader is injected. With a
single NFT condition this fails closed (verdict not ok), but combined with an
address-allowlist OR it could let the allowlist pass during an RPC outage.

**Recommendation:** for paid gates, fail **closed** on reader/RPC error rather
than continuing the OR; add a test for the RPC-down path.

### R-7 — Cross-chain identity / funding split (Chipotle) · Severity: Info

Chipotle account = on-chain entity on **Base mainnet** (ChainSecured Diamond);
**management writes** use wallet signatures (`*_with_signature`), **action runs**
use a usage `X-Api-Key`, **funding is Stripe** (min $5) — `$LITKEY` does not pay
([Lit skill §7.4](../skills/lit/SKILL.md)). The compose currently uses only
`X-Api-Key` for everything (a known TODO): split management→signature vs
run→API-key before treating it as production identity.

### R-8 — Flash-loan resistance of the gate · Severity: Info (already mitigated)

Prefer `CourseMarketplace.hasCourseAccess` / soulbound `ClientNft` (non-transferable
⇒ not flash-loanable) over a spot `balanceOf` on a transferable token
([lit-acc.js header / Audit 3.2](../smartcontracts/buckets/lit-acc.js), [Lit skill §8.3](../skills/lit/SKILL.md)).
This topology already defaults to the soulbound `ClientNft`.

## 6. Go-live checklist

- [ ] Fund: Chipotle account via Stripe (≥ $5); BSC/opBNB testnet deployer with tBNB; Greenfield testnet key with bridged tBNB.
- [ ] Deploy `DeployAccessNfts` + `CourseMarketplace` to the chosen gate chain (97 or 5611); record addresses.
- [ ] Set `NFT_GATING_CHAIN`, `NFT_GATING_CONTRACT`/`MARKETPLACE_ADDR`, `COURSE_ID`.
- [ ] Set `GATING_RPC` (R-2) to a public gate-chain RPC; for opBNB also extend `CHAIN_RPCS` (R-3).
- [ ] Decide the enforcement TCB (R-1): server-side reader for paid tiers + P-A address-binding.
- [ ] **Provision the PKP actions (R-1b)** — pin `claim-signer` + `wrap_for_buyer` to IPFS, mint a Chipotle PKP per CID, `setClaimSigner(pkpEvmAddr)`, add the claim-signer caller, deploy `wrap_for_buyer` on real Chipotle. (Until done: minting is owner-EOA and `wrap_for_buyer` is mock-only.)
- [ ] Publish via `write-devnet.mjs`; verify manifest round-trip and `readObjectWithRetry` on the SP (R-5).
- [ ] Negative tests: pre-purchase DENIED, post-purchase ALLOWED, post-expiry DENIED, soulbound transfer reverts, RPC-down fails closed (R-6).

## 7. Sources

- In-repo: [Lit skill](../skills/lit/SKILL.md), [Greenfield skill](../skills/greenfield/SKILL.md), [audit.md](../smartcontracts/contracts/audit.md), [NFT.md](../smartcontracts/contracts/NFT.md), [uc.md](./uc.md); code: `docker-compose.mainnet-lit.yml`, `buckets/lit-sdk-chipotle.js`, `buckets/lit-acc-eval.js`, `greenfield-testnet/write-devnet.mjs`.
- Lit: [Naga sunset & v3 transition](https://spark.litprotocol.com/naga-network-sunset/), [docs.dev.litprotocol.com](https://docs.dev.litprotocol.com/).
- Greenfield: [network endpoints](https://docs.bnbchain.org/bnb-greenfield/for-developers/network-endpoint/endpoints/).
- opBNB: [network info](https://docs.bnbchain.org/bnb-opbnb/get-started/network-info/) (chain 5611), [Chainlist 5611](https://chainlist.org/chain/5611).
