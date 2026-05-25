# uc.md — Use Cases (Daskibo Greenfield Smart-Contracts)

Actors: **Visitor**, **Author/Publisher**, **Buyer/Client**,
**w3ext** (platform broker), **Treasury** (protocol cut),
**Owner/Governance**, **Lit network**, **Greenfield SP**.

---

### UC-01 — Base (unencrypted) page on Greenfield with search/publish/buy
The bucket console (`smartcontracts/index.html`) is itself a plain,
**unencrypted** static page. A user uploads/stores ordinary objects to a
public-read Greenfield bucket via the console (`saveObject`, **no Lit**),
**searches** buckets, **publishes** an (optionally encrypted) course, and
**purchases** access — all from one page. The unencrypted save path is
the baseline: any object stored without the Lit step is world-readable.
- Pre: wallet provider available for writes (signer backend).
- Flow: open page → enter owner → save object (unencrypted) → search →
  (Lit) publish course → purchase.
- Post: object retrievable via SP `view/download`; course discoverable.

### UC-02 — Author registers & publishes a course
Author defines lessons, the pipeline AES-encrypts objects, Lit-wraps the
bucket master under Access Control Conditions, manifest records
`lit`/sidecars; bucket created via the wallet-signed backend.
- Post: `manifest.lit` present; raw master never stored.

### UC-03 — Publisher has FREE access to own content
The author can always decrypt their own course without paying:
- Off-chain: `course-publish` OR-s the author address into the ACC.
- On-chain: `CourseMarketplace.hasCourseAccess(author,id) == true`
  unconditionally; the author **cannot/needs not purchase**
  (`AlreadyOwned`).

### UC-04 — Client purchases time-limited access
Buyer pays `price`; split = Treasury 20 % (push) + w3ext 20 % (pull) +
author remainder (pull); a **soulbound** AccessPass is minted with
`expiry = now + accessDuration` (0 = perpetual). After expiry
`hasCourseAccess` returns false → Lit stops releasing the key.

### UC-05 — Client decrypts purchased content
Reader fetches manifest + `.enc`, obtains Lit session sigs (wallet
SIWE), Lit checks the ACC (calls `hasCourseAccess` on BSC) → master
recovered → AES-decrypt. Unauthorized/expired ⇒ `ACCESS_DENIED`.

### UC-06 — Search / discover courses
Visitor lists/searches buckets (paginated; `LIST_TRUNCATED` instead of
silent truncation). Public manifest/sidecars are indexable; ciphertext
is opaque.

### UC-07 — Author withdraws revenue (pull)
Author calls `withdraw()` — pull-payment, effects-before-interaction,
reentrancy-guarded. Same for w3ext.

### UC-08 — Governance tunes parameters
Owner (Ownable2Step) sets bounded bps (≤ MAX each, sum ≤ 100 %) and
treasury/w3ext addresses; Treasury outflow is governance-only.

### UC-09 — Tamper / abuse attempts (must fail)
Tampered ciphertext or metadata ⇒ `DECRYPT_FAILED`; relocated wrapped
DEK ⇒ fail (AEAD AAD); soulbound transfer/approve ⇒ revert; flash-loaned
token can’t pass an address-allowlist ACC; reentrant `withdraw` blocked;
unsigned write ⇒ `NO_BACKEND`; owner≠signer ⇒ `OWNER_MISMATCH`.

### UC-10 — Operate Greenfield (mock / real-private / real-testnet)
Same client/orchestrator over Flow A (mock SP), Flow B (real private
chain, clean state), Flow C (real testnet, funded key). Flow B runs a
**real 7-SP `gnfd-sp` stack** (EC 4+2 over a GVG: 1 primary + 6
secondary), so objects actually seal; readiness gates on `/tmp/sp_ready`
and reads must retry until seal (~100 s). Validate Flow B only from a
**fresh genesis** (`run_e2e_lit.sh` does `down -v`), never by syncing a
stale node. SDK signing/addressing fixes for the local pre-Altai chain
live in `patch_sdk.cjs`; full RCA in `skills/bughunter/SKILL.md`.

### UC-11 — Cross-chain bucket lifecycle (optional)
Only if on-chain Greenfield bucket management is required: official
`CrossChain`/`BucketHub` wrapper with hub-auth, idempotent sequence,
refund-on-FailureAck. Default OFF (access is Lit-gated, no per-user
cross-chain).

### UC-12 — Paid access gating via Base network contracts (Scenario A)
Our smart contracts (`CourseMarketplace` & `AccessPass`) are deployed on Base network, while the course encrypted content is stored in BNB Greenfield. The Lit access control conditions (ACC) are configured with `chain: "base"`, querying the `hasCourseAccess` view method on Base. The user purchases the course on Base, and Lit verifies this to decrypt content from Greenfield.
- Pre: CourseMarketplace and AccessPass deployed on Base.
- Flow: Author registers course on Base -> Encrypts master key under Base custom ACC -> Saves ciphertext in BNB Greenfield. Buyer pays price on Base -> AccessPass NFT minted on Base. Buyer requests decryption -> Lit checks ACC on Base -> Decryption allowed.
- Post: Access only granted to valid Base NFT holders; Greenfield storage remains secure and fully private-gated.

### UC-13 — Multi-chain gating with BNB smart contracts and Base-based Lit (Scenario B)
Our smart contracts are deployed on BNB Chain (BSC) for purchases, but Lit gates the Greenfield objects by checking either the BNB purchase state (`chain: "bsc"`) or a Base-based NFT/credential (`chain: "base"`), or simply Lit verifies the BNB contract conditions. This represents a cross-chain setup where Greenfield storage, BNB payments, and Base-based access are bridged via Lit's multi-chain evaluation engine.
- Pre: CourseMarketplace and AccessPass deployed on BNB Chain.
- Flow: Author registers course on BNB Chain -> Encrypts master key under BNB Chain ACC -> Saves ciphertext in BNB Greenfield. Lit evaluates the BNB Chain state from its Base-configured environments or nodes. Buyer purchases on BNB Chain. Buyer requests decryption -> Lit checks BNB Chain contract -> Decryption allowed.

---

## Funding Matrix — where native gas is required (test/devnet scheme)

Reference scheme: **NFT (CourseMarketplace + AccessPass) on BNB · ciphertext in Greenfield
testnet/devnet · key release via test/local Lit**. Two on-chain networks must be
funded with **native tBNB** (they are *separate* chains that happen to share the
BNB token); the Lit layer's funding depends on which flavor you pick. The Lit
access *check* itself is always a read-only `eth_call` (view) — **never** costs gas.

| Network | Chain id | Native token | Funded for | Source |
| :-- | :-- | :-- | :-- | :-- |
| **BSC Testnet** | `97` | **tBNB** | deploy `CourseMarketplace`/`AccessPass`, `registerCourse`, buyer `purchase` (gas + `price`), `withdraw` | BNB Chain testnet faucet → wallet |
| **Greenfield Testnet** | `greenfield_5600-1` (`5600`) | **tBNB (on Greenfield)** | `MsgCreateBucket`, object upload, storage + read-quota fees, SP settlement | claim tBNB on BSC testnet, **cross-chain transfer** to Greenfield (or Greenfield faucet) |
| **Lit — Chipotle mock** (`litNetwork: chipotle`, `localhost:8000`) | — | **none** | nothing — TEE simulated locally, free | n/a |
| **Lit — Chipotle live** (`api.chipotle.litprotocol.com`) | — (PKP on Base) | **credits (USD)**, not native | Lit Action execution; PKP minted on Base, gas paid from credits | Stripe (card / ETH·USDC·SOL via Base) |
| **Lit — Chipotle ChainSecured** | Base / Base Sepolia | **Base ETH** | wallet-signed admin writes (create group / mint PKP) directly to Base contracts | Base (Sepolia) faucet; credits still cover action exec |
| **Lit — `datil-dev`** | Chronicle Yellowstone | **none** | free remote testnet (rate-limited), no Capacity Credits | n/a |
| **Lit — `datil-test` / `datil`** | Chronicle Yellowstone | **tstLPX / LPX** | mint Capacity Credits NFT on Chronicle Yellowstone to lift rate limits / use paid net | Yellowstone faucet (`tstLPX`) / bridge (`LPX`) |

Cheapest path to exercise the **full** scheme end-to-end on public infra: fund one
wallet with **BSC-testnet tBNB**, bridge some to **Greenfield testnet**, and use
**`datil-dev`** (free) or **Chipotle mock** for Lit — i.e. only the two BNB-family
chains actually need native tokens. Paid Lit (`datil`/`datil-test`) or Chipotle
ChainSecured add a third funded chain (Chronicle Yellowstone or Base). The local
Flow B stack (`run_e2e_lit.sh`, `greenfield_9000-1` + Anvil + Chipotle mock) needs
**no real funds at all** — genesis-funded test accounts cover everything.

Env wiring (Flow C / devnet, see `smartcontracts/greenfield-testnet/`):
```bash
export GREENFIELD_TESTNET_PRIVATE_KEY=0x...   # author/buyer wallet (also bridge source)
export GREENFIELD_TESTNET_ADDRESS=0x...
export GREENFIELD_RPC=https://gnfd-testnet-fullnode-tendermint-us.bnbchain.org
export GREENFIELD_SP=https://gnfd-testnet-sp1.bnbchain.org
export GREENFIELD_CHAIN_ID=5600
export CHIPOTLE_URL=http://localhost:8000      # mock; or live/datil via write-testnet-lit.mjs
```
Writers: `write-testnet-chipotle.mjs` (Greenfield testnet + Chipotle), `write-testnet-lit.mjs`
(`datil-dev` free / `datil-test` paid), `write-mainnet.mjs` (`datil` + real funds).

