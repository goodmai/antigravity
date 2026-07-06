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
Buyer pays `price`; split = Treasury 20 % + w3ext 20 % + author remainder, all
credited as **pull-payments** (no push during `purchase`, so a hostile treasury
can't DoS sales); a **soulbound** AccessPass is minted with `expiry = now +
accessDuration` (0 = perpetual) and a one-time `wrapNonce` for the P-A Lit-key
store. After expiry `hasCourseAccess` returns false → Lit stops releasing the
key. Each sale emits a per-course `saleNonce` (UC-15). The buyer then stores the
wrapped Lit key in their NFT (UC-05 / [NFT.md §2](../smartcontracts/contracts/NFT.md#2-как-в-nft-хранятся-lit-ключи-схема-p-a)).

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
**Boundary:** only the **owner** may change the commission **percentages**
(`setParams` → `treasuryBps`/`w3extBps`). An **author cannot** alter the
platform cut — they may only set/adjust their own course **price** (UC-14).

### UC-14 — Author reprices a course (percentage discount / markup)
The author sets a base price at `registerCourse`, then later runs a sale or a
price bump **in percent** via `CourseMarketplace.adjustPrice(courseId, bps)`:
negative = discount, positive = markup; successive adjustments compound off the
current price. The **platform commission percentage is unaffected** — the
protocol/w3ext cut stays the same *share* of whatever the new price is (the
absolute fee just scales with price). Author-only (`NotAuthor`); `BadPrice` if
the result would be ≤ 0 or overflow `uint96`. Emits `CoursePriceAdjusted`.
- Pre: caller is the course author.
- Flow: `registerCourse(price)` → `adjustPrice(id, -2000)` (−20 % sale) →
  buyer now pays the discounted price; `quote()` splits it at the unchanged bps.
- Post: `courses[id].price` updated; `treasuryBps`/`w3extBps` unchanged.

### UC-15 — Per-sale ordinal (sale nonce) on every purchase
Every `purchase()` emits `CoursePurchased` carrying an indexed, 1-based,
gap-free **`saleNonce`** = the Nth sale of that course (`salesCount[courseId]`
post-increment). It gives off-chain indexers / receipt systems a stable ordinal
per course without scanning balances, and is isolated per course (buying course
B never bumps A's counter).
- Pre: course active, AccessPass wired.
- Flow: buyer A → `saleNonce 1`; buyer B → `saleNonce 2`; …
- Post: `salesCount(courseId)` equals the last emitted `saleNonce`.

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
| ~~**Lit — `datil-dev` / `datil-test` / `datil`**~~ | ~~Chronicle Yellowstone~~ | — | ⚠️ **deprecated** — P2P Lit nets shut down 2026-02-25; use Chipotle | — |

Cheapest path to exercise the **full** scheme end-to-end on public infra: fund one
wallet with **BSC-testnet tBNB**, bridge some to **Greenfield testnet**, and use
**Chipotle** (`api.dev.litprotocol.com`) or the **Chipotle mock** for the DRM layer
— i.e. only the two BNB-family chains actually need native tokens. Chipotle
ChainSecured adds a third funded chain (Base). The local
Flow B stack (`run_e2e_lit.sh`, `greenfield_9000-1` + Anvil + Chipotle mock) needs
**no real funds at all** — genesis-funded test accounts cover everything.

Env wiring (Flow C / devnet, see `smartcontracts/greenfield-testnet/`):
```bash
export GREENFIELD_TESTNET_PRIVATE_KEY=0x...   # author/buyer wallet (also bridge source)
export GREENFIELD_TESTNET_ADDRESS=0x...
export GREENFIELD_RPC=https://gnfd-testnet-fullnode-tendermint-us.bnbchain.org
export GREENFIELD_SP=https://gnfd-testnet-sp1.bnbchain.org
export GREENFIELD_CHAIN_ID=5600
export CHIPOTLE_URL=http://localhost:8000      # mock; or Chipotle dev: https://api.dev.litprotocol.com
```
Writers: `write-testnet-chipotle.mjs` / `write-devnet.mjs` (Greenfield testnet +
Chipotle). ⚠️ `write-testnet-lit.mjs` / `write-mainnet.mjs` target the **deprecated**
Lit `datil*` P2P nets (shut down 2026-02-25) — migrate to Chipotle.

