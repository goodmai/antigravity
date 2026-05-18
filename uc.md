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
chain, clean state), Flow C (real testnet, funded key).

### UC-11 — Cross-chain bucket lifecycle (optional)
Only if on-chain Greenfield bucket management is required: official
`CrossChain`/`BucketHub` wrapper with hub-auth, idempotent sequence,
refund-on-FailureAck. Default OFF (access is Lit-gated, no per-user
cross-chain).
