# Smart Contract Audit — Daskibo DRM Platform
**Pass 1:** 2026-05-29 · **Pass 2:** 2026-06-09  
**Branch:** claude/greenfield-smartcontracts-setup-2HS95  
**Scope:** `contracts/src/` (8 contracts, 5 interfaces)  
**Forge test baseline:** 144 → 158 (Pass 1) → **179 passed** (Pass 2), 0 failures  
**Coverage:** 100% line/function on all contracts; 100% branch except
`AccessPass` 87.5% (2 unreachable defensive guards — see [NFT.md §5](./NFT.md#5-покрытие-тестами-foundry)).

---

## Executive Summary

The codebase is well-structured and shows prior hardening work (Ownable2Step on
`CourseMarketplace`/`Treasury`/`AccessPass`, inline reentrancy guard, full
pull-payment model, `EmptyCiphertext` guard, `StaleToken` guard, timestamp-ACC
expiry enforcement). No critical or high vulnerabilities remain open. No
reentrancy, integer-overflow, or access-control-bypass issues were found in the
Pass-2 scope.

**Pass 1 — four bugs fixed:**

| ID  | Severity | Contract                | Title                                        |
|-----|----------|-------------------------|----------------------------------------------|
| H-1 | High     | `AccessPass`            | Stale-token nonce drain after renewal        |
| M-2 | Medium   | `SoulboundAccessNft`    | `setClaimSigner(0)` disables claim mechanism |
| M-3 | Medium   | `GreenfieldGroupGate`   | `setGroup(course, 0)` bricks all access ops  |
| M-5 | Medium   | `AccessPass`            | No ownership transfer mechanism              |

**Pass 2 — review of the new `CourseMarketplace` features** (per-course sale
nonce + author percentage discount/markup, see [sc.md §2](../../spec/sc.md) /
[RTM.md §4](../../spec/RTM.md)):

| ID  | Severity | Contract            | Title                                          | Status |
|-----|----------|---------------------|------------------------------------------------|--------|
| N-1 | Low      | `CourseMarketplace` | `adjustPrice` extreme `bps` → arithmetic panic | Fixed  |
| N-2 | Info     | `CourseMarketplace` | `CoursePurchased` ABI change (added `saleNonce`)| Addressed |
| N-3 | Low      | `CourseMarketplace` | In-flight `purchase` reverts on a reprice race | Acknowledged |

**Positive findings (Pass 2):**
- **Commission-percentage invariant holds.** `adjustPrice` mutates only
  `courses[id].price`; the platform cut bps (`treasuryBps`/`w3extBps`) are
  owner-only via `setParams` and untouched by an author reprice — verified by
  `test_adjustPrice_doesNotChangeCommissionPercentages` and
  `test_adjustPrice_authorCannotAlterCommissionConfig`.
- **Sale nonce is sound.** `++salesCount[courseId]` is bumped in the Effects
  phase (before the single trusted external call) per Checks-Effects-Interactions,
  is gap-free (the tx reverts wholesale on any failure), per-course isolated, and
  `uint256` so unbounded in practice. No reentrancy or overflow concern.

---

## Findings

### H-1 — Stale-token nonce drain after renewal [`AccessPass.sol`]

**Severity:** High  
**Status:** Fixed

#### Description

When a buyer renews (second `mint` after expiry), `_tokenIdOf[buyer][courseId]`
is updated to the new `tokenId`, but `ownerOf[oldTokenId]` still points to the
buyer. `setEncryptedKey` and `resetForRewrap` both index the `wrapNonce` by
`(buyer, courseId)` — not by `tokenId`. Calling either function with the **old**
tokenId would:

1. Pass the `ownerOf` / governance check (the caller is still the owner of the
   old token).
2. Consume `wrapNonce[buyer][courseId]` — the nonce that was freshly issued
   **for the new token**.
3. Store the ciphertext on the expired, useless old token (or delete it in the
   `resetForRewrap` path).

The new token's key-set flow is now bricked; the buyer needs a governance
`resetForRewrap` call to recover.

#### Attack / trigger

```
alice buys course 1 → id1 minted, nonce N1 issued
subscription expires
alice renews → id2 minted, nonce N2 issued; _tokenIdOf[alice][1] = id2
alice (or a griefing script) calls setEncryptedKey(id1, junk)
→ nonce N2 consumed, junk stored on id1 (expired)
→ setEncryptedKey(id2, …) now reverts NonceConsumed
```

#### Fix

Added a `StaleToken` guard in both `setEncryptedKey` and `resetForRewrap`:

```solidity
error StaleToken();

// setEncryptedKey
if (_tokenIdOf[msg.sender][courseId] != tokenId) revert StaleToken();

// resetForRewrap
if (_tokenIdOf[buyer][courseId] != tokenId) revert StaleToken();
```

Two new tests:
- `test_setEncryptedKey_revertsOnStaleToken`
- `test_resetForRewrap_revertsOnStaleToken`

---

### M-2 — `setClaimSigner(address(0))` disables claim mechanism [`SoulboundAccessNft.sol`]

**Severity:** Medium  
**Status:** Fixed

#### Description

`setClaimSigner` accepted `address(0)` without a guard. After this call,
`claimWithSig` would always revert `InvalidClaimSignature` because the check
`signer == address(0) || signer != claimSigner` can never be satisfied (recovered
signer can never be `address(0)` per OZ ECDSA, so it never equals `claimSigner`
which is now `address(0)`). Effective result: all EIP-712 signed mints
permanently blocked for `AuthorNft` and `ClientNft`.

#### Fix

```solidity
error ZeroAddress(); // added to SoulboundAccessNft

function setClaimSigner(address signer) external onlyOwner {
    if (signer == address(0)) revert ZeroAddress();
    claimSigner = signer;
}
```

Two new tests (one per subclass):
- `AuthorNftTest::test_setClaimSigner_rejectsZeroAddress`
- `ClientNftTest::test_setClaimSigner_rejectsZeroAddress`

---

### M-3 — `setGroup(course, 0)` bricks all access operations [`GreenfieldGroupGate.sol`]

**Severity:** Medium  
**Status:** Fixed

#### Description

`groupOf[courseId] == 0` is the sentinel meaning "no group configured" — used
by `_updateGroup` to gate both `grantAccess` and `revokeAccess` with
`GroupNotSet`. There was no guard preventing `setGroup(course, 0)`, so an
operator error could map a live course to group 0, causing every subsequent
`grantAccess`/`revokeAccess` call for that course to revert silently with
`GroupNotSet` rather than routing cross-chain.

Greenfield group IDs start at 1 in the real protocol, so group 0 is never a
valid target anyway.

#### Fix

```solidity
error ZeroGroupId();

function setGroup(uint256 courseId, uint256 groupId) external onlyOwner {
    if (groupId == 0) revert ZeroGroupId();
    groupOf[courseId] = groupId;
    emit GroupSet(courseId, groupId);
}
```

New test: `test_setGroup_rejectsZeroGroupId`

---

### M-5 — No ownership transfer in `AccessPass` [`AccessPass.sol`]

**Severity:** Medium  
**Status:** Fixed

#### Description

`owner` is set in the constructor and there was no `transferOwnership` function.
If the deployer key is compromised or the team wants to transfer governance to a
multisig, the `resetForRewrap` function (key recovery) becomes permanently
inaccessible to the new operator. Every other `onlyOwner` contract already had
Ownable2Step.

#### Fix

Added Ownable2Step pattern to `AccessPass`, matching the style of
`CourseMarketplace` and `Treasury`:

```solidity
address public pendingOwner;
event OwnershipTransferStarted(address indexed previous, address indexed pending);
event OwnershipTransferred(address indexed previous, address indexed current);
error NotPendingOwner();

function transferOwnership(address to) external onlyOwner { … }
function acceptOwnership() external { … }
```

Two new tests:
- `test_ownable2step_handover`
- `test_ownable2step_negatives`

---

## Pass 2 Findings (2026-06-09) — sale nonce + percentage reprice

### N-1 — `adjustPrice` extreme `bps` reverts via arithmetic panic [`CourseMarketplace.sol`]

**Severity:** Low · **Status:** Fixed

#### Description

`adjustPrice(courseId, int256 bps)` computes
`newPrice = price·(BPS_DENOMINATOR + bps) / BPS_DENOMINATOR`. `bps` is an
unbounded `int256`; the lower side is guarded (`bps <= -BPS_DENOMINATOR →
BadPrice`), but the upper side was not. A caller (the course author) passing an
astronomically large `bps` (e.g. near `type(int256).max`) overflowed the
`denom + bps` / multiplication and reverted with a Solidity arithmetic **panic
(0x11)** instead of the contract's custom `BadPrice` error. No fund risk
(author-only, state-changing call simply reverts), but the inconsistent error
semantics are a minor robustness/UX defect — every other bounded input in the
contract (`MAX_BPS_EACH`, `MAX_DURATION`) reverts a custom error.

#### Fix

Added an explicit upper bound, mirroring the existing `MAX_*` pattern:

```solidity
int256 public constant MAX_ADJUST_BPS = 990_000; // +9900% (100×)

if (bps <= -denom || bps > MAX_ADJUST_BPS) revert BadPrice();
```

`MAX_ADJUST_BPS` is far above any realistic reprice yet small enough that
`price·(denom+bps)` (with `price ≤ uint96.max`) stays well within `int256`, so
the path can no longer panic; the existing `uint96`-overflow check still rejects
results that don't fit the price field. New test:
`test_adjustPrice_rejectsBpsAboveMax` (cap allowed, `cap+1` and
`type(int256).max` both → `BadPrice`).

---

### N-2 — `CoursePurchased` ABI change (added indexed `saleNonce`) [`CourseMarketplace.sol`]

**Severity:** Informational · **Status:** Addressed

#### Description

UC-15 adds an indexed `saleNonce` to `CoursePurchased`, changing the event
signature (topic0 hash) and decode layout. Any off-chain consumer decoding by
the old signature (indexers, dashboards, the e2e harness) breaks until its ABI
is regenerated. This is expected for a pre-deploy change but must be surfaced.

#### Action

In-repo consumers synced to the new signature:
`smartcontracts/e2e/run-e2e.mjs` and `run-devnet-pa.mjs`. Front-end
(`course-*.js`) does not subscribe to `CoursePurchased`. **Before any redeploy:**
regenerate external ABIs / subgraph mappings.

---

### N-3 — In-flight `purchase` reverts on a reprice race [`CourseMarketplace.sol`]

**Severity:** Low · **Status:** Acknowledged (no fix — pre-existing behavior)

#### Description

`purchase` requires `msg.value == c.price` exactly. If the author runs
`adjustPrice` (or `updateCourse`) between a buyer reading the price and their tx
being mined, the buyer's tx reverts `BadPrice`. This is a griefing/MEV
inconvenience, **not** a fund-loss bug (the buyer's ETH is returned by the
revert), and it already existed for `updateCourse`. A `purchase(courseId,
uint256 maxPrice)` slippage parameter would let buyers opt into a price ceiling.
Deferred — out of scope for the current change and would alter the public API.

---

## Non-Fixed Observations (Low / Design)

### L-1 — `_freshNonce` entropy uses block-level values

`_freshNonce` hashes `(buyer, courseId, tokenId, block.number, block.timestamp)`.
These are validator-influenceable within bounds. The nonce's only purpose is
anti-drain (Lit Action reads it as a pre-flight check before spending Chipotle
credits); it is **not a secret** and is consumed on first use. A predictable
nonce value gives an attacker no advantage — they would still need to call
`setEncryptedKey` themselves as the token owner. **No fix required.**

### L-2 — `CourseMarketplace.updateCourse` cannot update `contentHash` / `bucket`

Authors cannot migrate their Greenfield bucket or fix a content hash after
course registration. They must re-register a new courseId. This is a deliberate
simplicity trade-off (immutable course identity), but worth surfacing if bucket
migrations become common.

### L-3 — `Treasury.totalReceived` is inflows-only

The field tracks cumulative ETH received but not withdrawn. An operator auditing
net protocol revenue must calculate `totalReceived - address(treasury).balance`.
Adding a `totalWithdrawn` counter would complete the picture. Low priority.

### L-4 — `ManifestRegistry` has no deletion / deregistration

Once anchored, a key can only be updated (new hash) or ignored — it cannot be
removed. An author who retires a course cannot deregister its manifest anchor.
The `verify(key, hash) = false` result for any non-current hash is sufficient
for the tamper-detection purpose, so this is a UX gap, not a security gap.

### L-5 — `GreenfieldGroupGate` is single-step ownership (spike contract)

Unlike `CourseMarketplace` and `Treasury`, `GreenfieldGroupGate` has no
`pendingOwner`. The contract is explicitly marked as a **spike** (not wired into
`CourseMarketplace`, not production-ready). Acceptable for its current scope;
add Ownable2Step before any mainnet wiring.

---

## Test Coverage Added

| File                          | New Tests                                         | Covers     |
|-------------------------------|---------------------------------------------------|------------|
| `AccessPass.t.sol`            | `test_setEncryptedKey_revertsOnStaleToken`        | H-1        |
|                               | `test_resetForRewrap_revertsOnStaleToken`         | H-1        |
|                               | `test_ownable2step_handover`                      | M-5        |
|                               | `test_ownable2step_negatives`                     | M-5        |
| `AuthorNft.t.sol`             | `test_setClaimSigner_rejectsZeroAddress`          | M-2        |
| `ClientNft.t.sol`             | `test_setClaimSigner_rejectsZeroAddress`          | M-2        |
| `GreenfieldGroupGate.t.sol`   | `test_setGroup_rejectsZeroGroupId`                | M-3        |
|                               | `test_granterDisable_blocksSubsequentCalls`       | coverage   |
|                               | `test_multiCourse_independentGroups`              | coverage   |
| `CourseMarketplace.t.sol`     | `test_preset_week_expiresAfterSevenDays`          | coverage   |
|                               | `test_preset_month_expiresAfterThirtyDays`        | coverage   |
|                               | `test_multipleBuyers_singleCourse_…`              | coverage   |
| `ManifestRegistry.t.sol`      | `testFuzz_anchorAndVerify`                        | fuzz       |
|                               | `test_multipleKeys_independent`                   | coverage   |

**Pass 1 total: 144 → 158 tests, 0 failures.**

### Pass 2 (2026-06-09)

| File                          | New Tests                                              | Covers   |
|-------------------------------|-------------------------------------------------------|----------|
| `CourseMarketplace.t.sol`     | `test_adjustPrice_discount_reducesPrice_emits`        | UC-14    |
|                               | `test_adjustPrice_markup_increasesPrice`              | UC-14    |
|                               | `test_adjustPrice_compounds_offCurrentPrice`         | UC-14    |
|                               | `test_adjustPrice_onlyAuthor`                         | UC-14    |
|                               | `test_adjustPrice_rejectsFullDiscount`               | UC-14    |
|                               | `test_adjustPrice_rejectsRoundsToZero`               | UC-14    |
|                               | `test_adjustPrice_rejectsUint96Overflow`             | UC-14    |
|                               | `test_adjustPrice_rejectsBpsAboveMax`                | N-1      |
|                               | `test_adjustPrice_doesNotChangeCommissionPercentages`| invariant|
|                               | `test_adjustPrice_authorCannotAlterCommissionConfig` | invariant|
|                               | `test_adjustPrice_buyerMustPayNewPrice`              | UC-14    |
|                               | `test_saleNonce_incrementsPerCourse_andEmitted`      | UC-15    |
|                               | `test_saleNonce_isolatedPerCourse`                   | UC-15    |
|                               | `test_e2e_purchase_mintsPass_andBuyerStoresLitKey`   | E2E      |
|                               | `test_e2e_author_hasFreeAccess_withoutPassOrPayment` | E2E      |
| `AccessPass.t.sol`            | `test_resetForRewrap_revertsOnNonexistentToken`      | NotGranted branch |
| `AuthorNft.t.sol`             | `test_claimWithSig_secondClaimWithFreshNonce`, `test_revoke_thenRemint_restoresBalanceGate` | NFT |
| `ClientNft.t.sol`             | `test_claimWithSig_replayReverts` / `_perpetual` / `_secondClaimWithFreshNonce` | NFT |

**Pass 2 total: 158 → 179 tests, 0 failures.** Traceability: [RTM.md](../../spec/RTM.md).

---

## Architecture Review

### `AccessPass` + `CourseMarketplace` — Core payment / access path

The pull-payment model (all splits credited to `pendingWithdrawals`, no push in
`purchase`) is correct and protects against both hostile treasury DoS and
cross-function reentrancy. The inline `_lock` guard correctly blocks
`withdraw()` from being re-entered via a malicious `AccessPass.mint` callback
(covered by `test_purchase_crossFunction_reentrancy_blocked`).

The P-A (PKP Vault + wrap-on-purchase) scheme is implemented cleanly: a fresh
`wrapNonce` is issued on mint, consumed atomically by `setEncryptedKey`, and
can only be reset by governance. The `EmptyCiphertext` guard prevents the
griefing scenario where a zero-length ciphertext consumes the nonce while
leaving the write-once slot effectively empty.

**After the H-1 fix**, the full P-A lifecycle (mint → wrap → set key → expire →
renew → wrap again) is fully protected from cross-token nonce pollution.

**Pricing & sale nonce (Pass 2).** `adjustPrice` is a pure storage mutation
(no external calls, no reentrancy surface) gated by `NotAuthor`; with the N-1
bound it cannot panic and cannot produce a zero/overflowing price. Crucially it
is isolated from the fee configuration: an author controls only their own
`price`, never the protocol's `treasuryBps`/`w3extBps` (owner-only via
`setParams`), so the commission **percentage** is invariant under any discount or
markup — the protocol cut simply scales with the new price. The per-course
`saleNonce` is incremented in the Effects phase ahead of the single trusted
`accessPass.mint` interaction, so it is gap-free and reentrancy-safe.

### `SoulboundAccessNft` / `AuthorNft` / `ClientNft` — Role NFTs

The soulbound invariant is enforced at the correct level: `_update` intercepts
all ERC721 state transitions before they reach OZ's internal machinery, blocking
holder-to-holder transfers while permitting mint (from==0) and burn (to==0). OZ
v5's `_update` hook is the right override point (vs the deprecated
`_beforeTokenTransfer` in v4).

The EIP-712 claim signature scheme (`claimWithSig`) correctly uses a per-account
nonce to prevent replay, checks `block.timestamp > deadline` for expiry, and
passes through OZ's `_hashTypedDataV4` for domain separation. The domain name
and version are baked in at construction, which is correct for a non-upgradeable
contract.

`ClientNft`'s "access window never shrinks" invariant (`accessExpiryOf` logic
in `_mintWithExpiry`) correctly handles all cases: first grant, extending a
finite window, upgrading to perpetual, and skipping a shorter pass that would
downgrade a longer one.

### `Treasury` — Protocol revenue escrow

Clean. `collectFrom` is intentionally permissionless (any caller can trigger the
pull; funds can only arrive at the Treasury, never be redirected). `totalReceived`
tracks cumulative inflows correctly via both `receive()` and `fund()`. Ownable2Step
is in place. No frozen-funds risk.

### `ManifestRegistry` — On-chain ACC tamper-detection anchor

Minimal and correct. The first-writer ACL prevents squatting (second caller must
be the same author). `verify` returns false for both unanchored keys and swapped
hashes — adequate for the tamper-detection use case.

### `GreenfieldGroupGate` — G-10 spike

Correctly labeled as a spike. The mock-hub forge tests cover the routing, relayer
fee forwarding, and opType dispatching. Not wired into `CourseMarketplace`. Before
production use: add Ownable2Step, sequence/`srcChainId` validation, relayer-fee
minimum, and `FailureAck` refund handling.
