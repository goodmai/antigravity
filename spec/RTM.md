# RTM.md — Requirements Traceability Matrix (DRM smart contracts)

Traces every functional requirement of the Daskibo DRM settlement/access layer
through: **Use Case → Contract (code) → Foundry test(s) → design doc**. Forge
suite: **178 tests passing**, 100% line/function coverage on all contracts
(branch 100% except `AccessPass` 87.5% — 2 unreachable defensive guards).

Cross-linked docs: [uc.md](./uc.md) · [tc.md](./tc.md) · [sc.md](./sc.md) ·
[crypto.md](./crypto.md) · [lit.md](./lit.md) ·
[NFT.md](../smartcontracts/contracts/NFT.md) · [AUDIT.md](./AUDIT.md)

Code roots: `smartcontracts/contracts/src/` (contracts),
`smartcontracts/contracts/test/` (tests),
`smartcontracts/lit-actions/` (Lit Action).

---

## 1. Access NFTs — who is minted what

| Req | Use case | Contract / function | Test(s) | Doc |
|-----|----------|---------------------|---------|-----|
| Author gets a perpetual, soulbound credential | [UC-03](./uc.md) | `AuthorNft.mint` / `claimWithSig` ([src](../smartcontracts/contracts/src/AuthorNft.sol)) | `AuthorNft.t.sol` — `test_mint_*`, `test_claimWithSig_*` | [NFT.md §1](../smartcontracts/contracts/NFT.md#1-какие-nft-есть-и-кто-их-получает) |
| Author has free content access without an NFT/payment | [UC-03](./uc.md) | `CourseMarketplace.hasCourseAccess` (author branch) | `CourseMarketplace.t.sol` — `test_e2e_author_hasFreeAccess_withoutPassOrPayment`, `test_author_hasFreeAccess_withoutPurchase` | [NFT.md §1](../smartcontracts/contracts/NFT.md#автор--получает-ли) |
| Buyer is minted a soulbound pass on purchase | [UC-04](./uc.md) | `CourseMarketplace.purchase` → `AccessPass.mint` | `CourseMarketplace.t.sol` — `test_purchase_happyPath_creditsAllPull`, `test_e2e_purchase_mintsPass_andBuyerStoresLitKey` | [NFT.md §1](../smartcontracts/contracts/NFT.md#покупатель--получает-ли) |
| Buyer/client time-limited read pass (separate flow) | [UC-04](./uc.md) | `ClientNft.mint` / `claimWithSig` / `hasAccess` | `ClientNft.t.sol` — `test_mint_*`, `test_claimWithSig_*`, `test_hasAccess_*` | [sc.md §4c](./sc.md) |
| Passes are non-transferable (anti-resale / anti-flash-loan) | [UC-09](./uc.md) | `*.transferFrom/approve` → `Soulbound()` | `AccessPass.t.sol`/`AuthorNft.t.sol`/`ClientNft.t.sol` — `test_*soulbound*` | [sc.md §4](./sc.md) |
| Revocation flips the Lit gate immediately | R-09/R-10 | `SoulboundAccessNft.revoke` + `_onRevoke` | `*.t.sol` — `test_revoke_*` | [sc.md §4a](./sc.md) |

## 2. Lit-key storage in the NFT (scheme P-A)

| Req | Use case | Contract / function | Test(s) | Doc |
|-----|----------|---------------------|---------|-----|
| Per-NFT, address-bound wrapped Lit key, write-once | [UC-05](./uc.md) | `AccessPass.encryptedKey` + `setEncryptedKey` | `AccessPass.t.sol` — `test_setEncryptedKey_*` | [NFT.md §2](../smartcontracts/contracts/NFT.md#2-как-в-nft-хранятся-lit-ключи-схема-p-a) · [crypto.md](./crypto.md) |
| One-time wrap nonce (anti-drain of Chipotle credits) | [UC-05](./uc.md) | `AccessPass.wrapNonce` (issued at mint, consumed on set) | `AccessPass.t.sol` — `test_wrapNonce_*`, `test_setEncryptedKey_storesAndConsumesNonce` | [NFT.md §2](../smartcontracts/contracts/NFT.md#2-как-в-nft-хранятся-lit-ключи-схема-p-a) |
| Stale-token nonce-drain guard (post-renewal) | H-1 | `setEncryptedKey`/`resetForRewrap` `StaleToken` | `AccessPass.t.sol` — `test_*revertsOnStaleToken`, `test_resetForRewrap_revertsOnNonexistentToken` | [NFT.md §2](../smartcontracts/contracts/NFT.md#2-как-в-nft-хранятся-lit-ключи-схема-p-a) |
| Key rotation / recovery | [UC-08](./uc.md) | `AccessPass.resetForRewrap` | `AccessPass.t.sol` — `test_resetForRewrap_*` | [sc.md §1](./sc.md) |
| Expiry enforced off-chain by the ACC, not on-chain | [UC-05](./uc.md) | `setEncryptedKey` permits expired token by design | `AccessPass.t.sol` — `test_pa_expiry_denies_access_after_timestamp`, `test_setEncryptedKey_onExpiredToken_permittedByDesign` | [NFT.md §2](../smartcontracts/contracts/NFT.md#2-как-в-nft-хранятся-lit-ключи-схема-p-a) |

## 3. Lit gating & claim-signer Lit Action

| Req | Use case | Code | Test(s) | Doc |
|-----|----------|------|---------|-----|
| Content gated on on-chain predicate (client read) | [UC-05](./uc.md) | `AccessPass.hasAccess` / `ClientNft.hasAccess` (Lit `evmContractConditions`) | `AccessPass.t.sol`/`ClientNft.t.sol` — `test_hasAccess_*`, `test_timeLimited*` | [NFT.md §3](../smartcontracts/contracts/NFT.md#3-как-lit-гейтит-доступ-к-контенту) · [lit.md](./lit.md) |
| Author write/read gated on `balanceOf >= 1` | [UC-05](./uc.md) | `AuthorNft` (ERC721 `balanceOf`) | `AuthorNft.t.sol` — `test_mint_*`, `test_revoke_thenRemint_restoresBalanceGate` | [NFT.md §3](../smartcontracts/contracts/NFT.md#3-как-lit-гейтит-доступ-к-контенту) |
| Decentralized minting authorization (no central signer) | P3 / audit §4.2 | `lit-actions/claim-signer.action.js` → `nft.claimWithSig` | `tests/claim-eip712.test.js` (digest round-trip) + `*.t.sol` `test_claimWithSig_*`; e2e `run_e2e_lit.sh` | [NFT.md §4](../smartcontracts/contracts/NFT.md#4-lit-action--децентрализованный-claim-signer) · [lit-actions/README.md](../smartcontracts/lit-actions/README.md) |
| Signed-mint replay / expiry / wrong-signer protection | [UC-09](./uc.md) | `SoulboundAccessNft._verifyClaimSig` + `_claimNonces` | `*.t.sol` — `test_claimWithSig_replayReverts`, `_expired*Reverts`, `_wrongSignerReverts` | [sc.md §4a](./sc.md) |

## 4. Settlement: pricing, sale nonce, commission

| Req | Use case | Contract / function | Test(s) | Doc |
|-----|----------|---------------------|---------|-----|
| Deterministic split, re-sums to price | [UC-04](./uc.md) | `CourseMarketplace.quote` | `CourseMarketplace.t.sol` — `testFuzz_splitInvariant`, `test_quote_*` | [sc.md §2](./sc.md) |
| Pull-payments; hostile treasury can't DoS sales | [UC-07](./uc.md) | `purchase` (credit-only) + `withdraw` | `CourseMarketplace.t.sol` — `test_pullWithdraw`, `test_revertingTreasuryDoesNotBlockPurchase`, `test_reentrantWithdrawIsBlocked` | [sc.md §2](./sc.md) |
| **Author sets price, then %-discount/markup** | [UC-14](./uc.md) | `CourseMarketplace.adjustPrice(courseId, bps)` | `CourseMarketplace.t.sol` — `test_adjustPrice_discount_*`, `_markup_*`, `_compounds_*`, `_onlyAuthor`, `_rejectsFullDiscount`, `_rejectsRoundsToZero`, `_rejectsUint96Overflow`, `_buyerMustPayNewPrice` | [sc.md §2](./sc.md) |
| **Reprice must NOT change commission %** | [UC-14](./uc.md)/[UC-08](./uc.md) | bps owner-only (`setParams`); `adjustPrice` touches only price | `CourseMarketplace.t.sol` — `test_adjustPrice_doesNotChangeCommissionPercentages`, `_authorCannotAlterCommissionConfig` | [sc.md §2](./sc.md) |
| **Per-course sale nonce on every purchase** | [UC-15](./uc.md) | `salesCount[courseId]`, `CoursePurchased.saleNonce` | `CourseMarketplace.t.sol` — `test_saleNonce_incrementsPerCourse_andEmitted`, `_isolatedPerCourse` | [sc.md §2](./sc.md) |
| Bounded, owner-only fee params; Ownable2Step | [UC-08](./uc.md) | `setParams`, `transfer/acceptOwnership` | `CourseMarketplace.t.sol` — `test_setParams_*`, `test_ownable2step_*` | [sc.md §2](./sc.md) |
| Protocol cut vault, governance-only outflow | [UC-08](./uc.md) | `Treasury` | `Treasury.t.sol` | [sc.md §3](./sc.md) |

## 5. Integrity anchor & cross-chain (status)

| Req | Use case | Code | Test(s) | Status |
|-----|----------|------|---------|--------|
| On-chain ACC anchor (tamper detection) | G-09 | `ManifestRegistry` | `ManifestRegistry.t.sol` | ✅ implemented |
| Native Greenfield Group gating (spike) | G-10 | `GreenfieldGroupGate` | `GreenfieldGroupGate.t.sol` | ⚠️ PoC, not wired |
| On-chain cross-chain bucket module | [UC-11](./uc.md) | `IGreenfieldCourseBucket` | *(spec only)* | ❌ not in v1 |

---

## Coverage snapshot

Run `forge test` and `forge coverage --no-match-coverage "(script|test)"` from
`smartcontracts/contracts/`. Current: 178 tests, all passing.

| Contract | Lines | Branches | Funcs |
|----------|-------|----------|-------|
| `SoulboundAccessNft` | 100% | 100% | 100% |
| `AuthorNft` | 100% | 100% | 100% |
| `ClientNft` | 100% | 100% | 100% |
| `AccessPass` | 100% | 87.5% (2 unreachable guards) | 100% |
| `CourseMarketplace` | 100% | 100% | 100% |
| `Treasury` | 100% | 100% | 100% |
| `ManifestRegistry` | 100% | 100% | 100% |
| `GreenfieldGroupGate` | 100% | 100% | 100% |
