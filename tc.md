# tc.md — Test Cases (mapped to suites)

Legend: **U** = hermetic unit (`npm test`), **D** = Docker-gated
(opt-in), **F** = Foundry container (`RUN_CONTRACTS=1`).

---

## UC-01 base unencrypted page + search/publish/buy
| TC | Type | Assertion | Where |
|----|------|-----------|-------|
| TC-01.1 | U | unencrypted `saveObject` PUTs body, returns tx/meta | `tests/sp-emulation-backend.test.js`, `tests/greenfield-buckets.test.js` |
| TC-01.2 | U | UI save form (unencrypted) calls client | `tests/greenfield-ui.test.js` |
| TC-01.3 | U | search filters case-insensitively; pagination follows token | `tests/greenfield-buckets.test.js` (6, 6b) |
| TC-01.4 | U | CSP shipped, no inline module / unsafe-inline | `tests/index-csp.test.js` |
| TC-01.5 | D | nginx serves page + ES modules + 3 stubs end-to-end | `tests/greenfield-integration.docker.test.js` |

## UC-02 publish encrypted course
| TC-02.1 | U | manifest rewritten to `.enc`/`.lit.json`+hash, consistent | `tests/course-template.test.js` |
| TC-02.2 | U | `planCoursePublish` Lit-wraps master, raw master not stored | `tests/course-publish.test.js` |
| TC-02.3 | U | publish UI form wires `publishCourse` | `tests/greenfield-ui.test.js` |

## UC-03 publisher free access
| TC-03.1 | U | author OR-ed into ACC; without author ACC unchanged | `tests/course-publish.test.js` |
| TC-03.2 | F | `hasCourseAccess(author)` true w/o purchase; author `purchase` → `AlreadyOwned` | `contracts/test/CourseMarketplace.t.sol` |

## UC-04 time-limited client access + split
| TC-04.1 | F | split re-sums to price (fuzz), default 20/20 | `CourseMarketplace.t.sol` |
| TC-04.2 | F | purchase credits pull (author/w3ext) + push Treasury | `CourseMarketplace.t.sol` |
| TC-04.3 | F | access expires after `accessDuration`; author still free | `CourseMarketplace.t.sol`, `AccessPass.t.sol` |
| TC-04.4 | U | off-chain pricing parity (treasury/w3ext 2000 bps) | `tests/lit-pricing.test.js` |

## UC-05 decrypt purchased content
| TC-05.1 | U | `course-read` round-trips via Lit-recovered master (real AES) | `tests/course-read.test.js` |
| TC-05.2 | U | unauthorized → `ACCESS_DENIED`; bad envelope → `INVALID_LIT_ENVELOPE` | `tests/lit-access.test.js`, `tests/course-read.test.js` |

## UC-06 search/discover
| TC-06.1 | U | `LIST_TRUNCATED` thrown at page cap (no silent partial) | `tests/greenfield-buckets.test.js` |
| TC-06.2 | U | real course search: aggregate `_lit/manifest.json` across buckets, query by bucket/title/lesson/tag, skip malformed | `tests/course-index.test.js` |
| TC-06.3 | D | crawl manifests across buckets over real HTTP, search by title, skip non-course buckets | `tests/greenfield-integration.docker.test.js` |

## UC-07 author withdraw (pull)
| TC-07.1 | F | pull `withdraw` pays exact amount, zeroes pending | `CourseMarketplace.t.sol` |
| TC-07.2 | F | reentrant `withdraw` blocked, no double-pay | `CourseMarketplace.t.sol` |

## UC-08 governance
| TC-08.1 | F | bps bounded (per-cut limit, zero-addr) | `CourseMarketplace.t.sol` |
| TC-08.2 | F | Treasury withdraw owner-only (full matrix below) | `Treasury.t.sol` |

## UC-09 tamper/abuse
| TC-09.1 | U | tampered ciphertext / meta / relocated DEK → `DECRYPT_FAILED` | `tests/crypto-envelope.test.js` (3,5) |
| TC-09.2 | U | wrong master → `DECRYPT_FAILED`; wrong passphrase too | `tests/crypto-envelope.test.js` |
| TC-09.3 | U | no signer → `NO_BACKEND`; owner≠signer → `OWNER_MISMATCH` | `tests/greenfield-buckets.test.js`, `tests/greenfield-wallet-core.test.js` |
| TC-09.4 | U | address-allowlist ACC is not flash-loanable (no balance) | `tests/lit-acc.test.js` (+ caveat doc) |
| TC-09.5 | F | soulbound: transfer/approve/setApprovalForAll revert | `AccessPass.t.sol` |

## UC-10 mock / real-private / real-testnet
| TC-10.1 | D | Flow A network suite vs mock SP: serving; save+retrieval (nested/special-char keys, overwrite); **indexing** — encrypted-course manifest crawl, sidecar is ciphertext-free, decrypt round-trip over real HTTP; negatives (NOT_FOUND, BUCKET_EXISTS/409, INVALID_BUCKET_NAME, NO_OWNER); **benchmark** 25 save+read under bound. Runs in the CI **integration** job (`npm run test:integration`). | `tests/greenfield-integration.docker.test.js` |
| TC-10.2 | D | Flow B private chain id `greenfield_9000-1`, blocks advance | `tests/greenfield-local.docker.test.js` |
| TC-10.3 | D | Flow C real testnet publish + round-trip | `tests/greenfield-testnet.live.test.js` |
| TC-10.4 | F | `forge build && forge test` + deploy smoke vs anvil | `tests/contracts.docker.test.js` |

## UC-11 cross-chain (optional, OFF by default)
| TC-11.1 | F | callback only from hub; bad srcChain/sequence reverts | *(spec — `IGreenfieldCourseBucket`, future impl)* |
| TC-11.2 | F | `FailureAck` refunds relayer fee; retry explicit | *(spec)* |

---

### Foundry coverage — positive + negative (added)

| TC | Type | Assertion | Where |
|----|------|-----------|-------|
| TC-08.2 | F | Treasury: owner-only withdraw; zero/overdraw revert; failing recipient → funds safe; full + partial balance withdrawable (no frozen funds) | `Treasury.t.sol` |
| TC-08.3 | F | `setParams` onlyOwner; `setAccessPass` one-shot / zero / onlyOwner | `CourseMarketplace.t.sol` |
| TC-08.4 | F | Ownable2Step: handover positive; non-owner transfer → `NotOwner`; non-pending accept → `NotPendingOwner` | `CourseMarketplace.t.sol` |
| TC-04.5 | F | `registerCourse` rejects zero price; id increments + stored; `updateCourse` author repcice/toggle, non-author → `NotAuthor`, zero → `BadPrice` | `CourseMarketplace.t.sol` |
| TC-04.6 | F | `purchase` reverts `Inactive` (toggled off) and `AccessPassUnset` (pass not wired) | `CourseMarketplace.t.sol` |
| TC-04.7 | F | `quote` odd price → remainder to author, Σ == price | `CourseMarketplace.t.sol` |
| TC-07.3 | F | `withdraw` with nothing pending → `NothingToWithdraw` | `CourseMarketplace.t.sol` |
| TC-03.3 | F | AccessPass `setMarketplace` zero/non-owner revert; `mint` zero recipient → `ZeroAddress`; owner/course/expiry mappings recorded | `AccessPass.t.sol` |
| TC-09.6 | F | **No NFT** → no access; course isolation (pass≠other course); expiry boundary (valid at `=exp`, invalid at `>exp`); past-expiry mint = no access then renewable; ANY holder's pass (incl. owner-like) is soulbound; `ownerOf` of nonexistent = 0 | `AccessPass.t.sol` |
| TC-09.7 | F | marketplace: `hasCourseAccess` false w/o purchase & for nonexistent course (no revert); expired client loses access then can re-purchase (treasury paid 2×); cannot re-purchase before expiry → `AlreadyOwned` | `CourseMarketplace.t.sol` |
| TC-04.8 | F | duration presets: HOUR/WEEK/MONTH/YEAR/PERPETUAL constant values; HOUR expires after 1h; YEAR valid <365d / expired after; PERPETUAL (`uint64.max`) → expiry 0, never expires, no overflow (century warp) | `CourseMarketplace.t.sol` |
| TC-04.9 | F | audit hardening: finite `accessDuration > MAX_DURATION` → `BadDuration`; `MAX_DURATION`/`PERPETUAL`/`0` allowed (no overflow-DoS) | `CourseMarketplace.t.sol` |
| TC-08.5 | F | `setAccessPass` emits `AccessPassSet` event | `CourseMarketplace.t.sol` |
| TC-G1   | U | SDK adapter call-shapes (growth #4): makeLitClient connect/encrypt/decrypt; makeLitAuth SIWE+sessionSigs; wallet createBucket signTypedDataCallback + lowercase `offchainauth` + EDDSA delegate auth | `tests/sdk-adapters.shape.test.js` |

**Backend conformance** (cross-cuts UC-02/04/05): one contract suite runs
every unit-testable backend → `tests/greenfield-backend-contract.test.js`.

**Status:** U = green in `npm test` (321 pass / 9 skip). D/F = run in
their Docker/Foundry flow; not part of the hermetic gate (honest
verification boundary, see README §3).
