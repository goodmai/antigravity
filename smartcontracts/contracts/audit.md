# Smart Contract Audit — Daskibo DRM Platform
**Date:** 2026-05-29  
**Branch:** claude/greenfield-smartcontracts-setup-2HS95  
**Scope:** `contracts/src/` (7 contracts, 3 interfaces)  
**Forge test baseline:** 144 passed → **158 passed** after fixes (0 failures)

---

## Executive Summary

The codebase is well-structured and shows prior hardening work (Ownable2Step on
`CourseMarketplace`/`Treasury`, inline reentrancy guard, full pull-payment model,
`EmptyCiphertext` guard, timestamp-ACC expiry enforcement). No critical
reentrancy or integer-overflow vulnerabilities were found.

**Four bugs fixed in this audit:**

| ID  | Severity | Contract                | Title                                        |
|-----|----------|-------------------------|----------------------------------------------|
| H-1 | High     | `AccessPass`            | Stale-token nonce drain after renewal        |
| M-2 | Medium   | `SoulboundAccessNft`    | `setClaimSigner(0)` disables claim mechanism |
| M-3 | Medium   | `GreenfieldGroupGate`   | `setGroup(course, 0)` bricks all access ops  |
| M-5 | Medium   | `AccessPass`            | No ownership transfer mechanism              |

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

**Total: 144 → 158 tests, 0 failures.**

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
