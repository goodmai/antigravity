# Smart Contracts (`sc.md`)

Settlement + access layer for the Daskibo Academy DRM platform. Solidity
`^0.8.28`, Foundry, `evm_version = cancun`, optimizer 200 runs.

Source: `smartcontracts/contracts/src/`. Tests: `…/test/` (86 forge tests,
**100% line/statement/branch/function coverage** on all six contracts).

Contracts: `AccessPass`, `CourseMarketplace`, `Treasury` (settlement layer) +
`SoulboundAccessNft` (abstract base) → `AuthorNft`, `ClientNft` (the soulbound
role NFTs Lit gates on, replacing the old `MockNFT` stub).

## Roles in the larger system

The contracts do **not** gate decryption directly. Lit Protocol gates
decryption by evaluating an Access Control Condition (ACC) against on-chain
state:

- **BSC / settlement chain** — Lit's `evmContractConditions` calls
  `CourseMarketplace.hasCourseAccess(:userAddress, courseId)` (which reads the
  soulbound `AccessPass`). This is the production access predicate.
- **Role NFTs (Base / cross-chain gating)** — the author/client access split:
  - `AuthorNft.balanceOf(:userAddress) >= 1` — perpetual author credential
    (update + read the course bucket).
  - `ClientNft.hasAccess(:userAddress)` — time-limited client read access.

So the chain is the source of truth for *who may decrypt*; Lit enforces it.
Money never touches Lit — it settles entirely in `CourseMarketplace` /
`Treasury`.

```
 buyer ──purchase()──▶ CourseMarketplace ──mint()──▶ AccessPass (soulbound)
                            │  credits pendingWithdrawals[author|w3ext|treasury]
                            ▼
                       Treasury ◀──collectFrom()/withdraw()
                            ▲
 Lit ACC ── hasCourseAccess(user,courseId) ──┘     (read-only gate)
 Lit ACC ── AuthorNft.balanceOf(user)              (author: update + read)
 Lit ACC ── ClientNft.hasAccess(user)              (client: time-limited read)
```

---

## 1. `AccessPass` — soulbound course ticket

`src/AccessPass.sol` (implements `IAccessPass`). A **non-transferable** record
of course access. Soulbound by design: this is the structural flash-loan
mitigation (audit 3.2 / 4.1) — Lit checks `hasAccess`, and there is no
transferable balance to flash-loan.

**State**
| Var | Type | Meaning |
|---|---|---|
| `owner` | `address` | deployer; may wire the marketplace once |
| `marketplace` | `address` | the only authorised minter (set-once) |
| `_nextId` | `uint256` | monotonic token id counter (starts at 1) |
| `ownerOf[tokenId]` | `address` | holder of a pass |
| `courseOf[tokenId]` | `uint256` | course a pass grants |
| `_granted[user][course]` | `bool` | private grant flag |
| `expiryOf[user][course]` | `uint64` | unix expiry; `0` = perpetual |

**Functions**
- `constructor()` — sets `owner = msg.sender`.
- `setMarketplace(address mp)` — `onlyOwner`, one-shot. Reverts `ZeroAddress`
  / `MarketplaceAlreadySet`. Wires the authorised minter.
- `mint(address to, uint256 courseId, uint64 expiry) → uint256 tokenId` —
  **only `marketplace`** (`NotMarketplace` otherwise — even the owner cannot
  mint). Reverts `ZeroAddress` (recipient) and `AlreadyOwned` (active,
  non-expired grant). Records ownership/course/expiry, emits `AccessGranted`.
  Re-mint after expiry is allowed (renewal).
- `hasAccess(address user, uint256 courseId) → bool` — `true` iff granted and
  not expired. **The predicate Lit's ACC ultimately depends on.**
- `_expired(user,course)` *(internal)* — `exp != 0 && now > exp`.
- **Soulbound reverts** — `transferFrom`, both `safeTransferFrom` overloads
  (3- and 4-arg), `approve`, `setApprovalForAll` all `revert Soulbound()`.

**Errors:** `NotOwner, NotMarketplace, MarketplaceAlreadySet, ZeroAddress,
AlreadyOwned, Soulbound`.
**Events:** `AccessGranted(user, courseId, tokenId)`.

---

## 2. `CourseMarketplace` — registry + paid access + split

`src/CourseMarketplace.sol` (implements `ICourseMarketplace`). Course registry
and paid access with a deterministic payment split that matches off-chain
`lit-pricing.js`. Hardened per audit: Checks-Effects-Interactions, inline
reentrancy guard, **pull-payments** for all three payees, `Ownable2Step`,
bounded bps.

**Constants**
| Const | Value | Meaning |
|---|---|---|
| `BPS_DENOMINATOR` | `10_000` | basis-point base |
| `MAX_BPS_EACH` | `3_000` | per-cut cap; `2·3000 < 10000` ⇒ sum always < 100% (no dead sum-check) |
| `DURATION_HOUR/WEEK/MONTH/YEAR` | 1h / 7d / 30d / 365d | presets |
| `DURATION_PERPETUAL` | `type(uint64).max` | sentinel → AccessPass expiry 0 |
| `MAX_DURATION` | `36_500 days` | finite-duration cap (overflow guard) |

**State**: `owner`, `pendingOwner` (Ownable2Step); `_lock` (reentrancy);
`accessPass`, `treasury`, `w3ext`; `treasuryBps = 2000`, `w3extBps = 2000`;
`nextCourseId`; `courses[id] → Course`; `pendingWithdrawals[addr]`.

`Course` struct: `{ author, uint96 price, bytes32 contentHash, string bucket,
uint64 accessDuration, bool active }`.

**Functions**
- `constructor(address _treasury, address _w3ext)` — reverts `ZeroAddress`;
  sets owner = deployer.
- `transferOwnership(to)` / `acceptOwnership()` — two-step ownership
  (`OwnershipTransferStarted` / `OwnershipTransferred`).
- `setAccessPass(address ap)` — `onlyOwner`, one-shot (`AccessPassAlreadySet`,
  `ZeroAddress`); emits `AccessPassSet`.
- `setParams(treasuryBps, w3extBps, treasury, w3ext)` — `onlyOwner`; bounds
  each cut by `MAX_BPS_EACH` (`BpsTooHigh`), rejects zero addresses; emits
  `ParamsUpdated`.
- `registerCourse(uint96 price, bytes32 contentHash, string bucket,
  uint64 accessDuration) → courseId` — `price>0` (`BadPrice`); finite
  durations must be `≤ MAX_DURATION` (`BadDuration`); emits `CourseRegistered`.
- `updateCourse(courseId, price, active)` — author-only (`NotAuthor`),
  `price>0`; reprice / toggle active; emits `CourseUpdated`.
- `quote(price) → (protocolCut, w3extFee, authorAmount)` — `cut = price·bps /
  10000`; **remainder rounds to the author** so payouts re-sum exactly to
  `price`.
- `purchase(courseId) payable` — `nonReentrant`. Checks: AccessPass set
  (`AccessPassUnset`), course active (`Inactive`), `msg.value == price`
  (`BadPrice`), caller has no access yet (`AlreadyOwned`). Effects: credits
  `pendingWithdrawals` for author / w3ext / treasury (no value pushed →
  hostile treasury can't DoS sales). Interaction: only the trusted
  `accessPass.mint(...)`; perpetual sentinel avoids `uint64` overflow. Emits
  `CoursePurchased`.
- `hasCourseAccess(user, courseId) → bool` — author always `true` (free access
  to own content); else `false` if no AccessPass wired; else
  `accessPass.hasAccess`. **This is the function Lit's evmContractConditions
  calls on BSC.**
- `withdraw()` — `nonReentrant`; pull pattern (zero the balance before the
  `call`); reverts `NothingToWithdraw` / `TransferFailed`; emits `Withdrawn`.

**Errors:** `NotOwner, NotPendingOwner, NotAuthor, Inactive, BadPrice,
AlreadyOwned, ZeroAddress, BpsTooHigh, NothingToWithdraw, TransferFailed,
AccessPassUnset, AccessPassAlreadySet, BadDuration, Reentrancy`.

---

## 3. `Treasury` — protocol-cut vault

`src/Treasury.sol` (implements `ITreasury`). Holds the protocol cut (default
20%). Inflow is permissionless (funds can only *arrive*); outflow is
governance-only. No reinvest in v1.

**State:** `owner`, `totalReceived`.

**Functions**
- `constructor(address _owner)` — reverts `ZeroAddress`.
- `receive() payable` / `fund() payable` — accept native BNB, bump
  `totalReceived`, emit `Funded`.
- `collectFrom(address marketplace)` — **permissionless**. Calls
  `IWithdrawable(marketplace).withdraw()`; the marketplace pays
  `msg.sender == this Treasury`, so funds land in `receive()`. Funds can never
  be redirected. Reverts `ZeroAddress`.
- `withdraw(address payable to, uint256 amount)` — `onlyOwner`; bounded by
  balance (`InsufficientBalance`); reverts `ZeroAddress` / `TransferFailed`;
  emits `Withdrawn`.

**Errors:** `NotOwner, ZeroAddress, InsufficientBalance, TransferFailed`.
Local helper interface `IWithdrawable { withdraw() }`.

---

## 4. Soulbound role NFTs (Lit gating) — replaces `MockNFT`

> ✅ **Current / applied.** Implemented, deployed by `DeployAccessNfts.s.sol`, and
> covered by forge tests at 100% (104 tests total). Includes **revoke** (R-09),
> **delegated granter role** (G-08), and the [`ManifestRegistry`](#4d-manifestregistry--on-chain-acc-anchor-g-09) anchor (G-09) — see [osint.md §3.1](./osint.md).

The old `MockNFT` (a transferable ERC721 stub, then a transferable real ERC721)
is replaced by **two soulbound, role-specific access NFTs** sharing an abstract
base. They are real OpenZeppelin ERC721s (so Lit's `standardContractType:
"ERC721"` `balanceOf` gate works) but **non-transferable** — the same
flash-loan mitigation as `AccessPass`: Lit checks holding / `hasAccess`, never a
transferable spot balance.

### 4a. `SoulboundAccessNft` (abstract base)

`src/SoulboundAccessNft.sol`. Inherits `ERC721, EIP712(name,"1"), Ownable`.

**State:** `claimSigner` (off-chain signer, e.g. a Lit PKP); `isGranter[account]`
(delegated issuers — G-08); `_nextTokenId` (internal, starts at 1);
`_claimNonces[account]` (replay protection).

**Functions / behavior**
- `constructor(name, symbol, initialOwner, initialClaimSigner)`.
- `setClaimSigner(address)` — `onlyOwner`.
- `setGranter(address account, bool allowed)` — `onlyOwner`; enables a delegated
  issuer (e.g. `CourseMarketplace`/operator) to mint & revoke without owning the
  contract (**G-08**). Modifier `onlyOwnerOrGranter` gates `mint`/`revoke`.
- **`revoke(uint256 tokenId)`** — `onlyOwnerOrGranter`; burns the pass, calls
  `_onRevoke(holder, tokenId)` hook, emits `AccessRevoked`. Closes **R-09** —
  works even for a perpetual pass (previously access could only lapse via
  expiry). The on-chain predicate a Lit Action reads (`hasAccess`/`balanceOf`)
  flips to `false` immediately (**R-10** SC-part).
- `_onRevoke(holder, tokenId)` *(internal virtual)* — subclasses clear their
  per-account access-state on revoke.
- `claimNonces(address) → uint256`; `DOMAIN_SEPARATOR() → bytes32`.
- `_mintNext(to)` *(internal)* — `_safeMint` of the next id (checks
  `onERC721Received`).
- `_consumeNonce(account)` / `_verifyClaimSig(deadline, structHash, signature)`
  *(internal)* — subclasses build their typed `Claim` struct and call these;
  `_verifyClaimSig` reverts `ClaimExpired` / `InvalidClaimSignature`.
- **Soulbound:** `_update` allows mint (`from==0`) and burn (`to==0`) but
  reverts `Soulbound()` on holder-to-holder transfer; `approve` and
  `setApprovalForAll` revert `Soulbound()`. `balanceOf`, `ownerOf`,
  `tokenURI`, `supportsInterface` (ERC721/ERC165) remain functional for Lit.

**Errors:** `Soulbound, ClaimExpired, InvalidClaimSignature, NotAuthorized`.
**Events:** `GranterSet(account, allowed)`, `AccessRevoked(holder, tokenId)`.

### 4b. `AuthorNft` — perpetual author credential

`src/AuthorNft.sol` (`is SoulboundAccessNft`). Name `Daskibo Author Pass`,
symbol `DASK-AUTH`. Held by a course author; grants the right to **UPDATE and
READ** the course's Greenfield bucket (Lit gates on `balanceOf(author) >= 1`).
**Perpetual** — never expires.
- `mint(address to) → uint256` — `onlyOwnerOrGranter`, perpetual.
- `claimWithSig(address to, uint256 deadline, bytes signature) → uint256` —
  redeem an EIP-712 `Claim(to,nonce,deadline)` signed by `claimSigner`.
- Revocation: base `revoke(tokenId)` burns the token → `balanceOf` gate → 0.

### 4c. `ClientNft` — time-limited client subscription

`src/ClientNft.sol` (`is SoulboundAccessNft`). Name `Daskibo Client Pass`,
symbol `DASK-CLI`. Held by a buyer; grants **READ-only** bucket access while
valid. Lit gates on `hasAccess(user)`.
- State: `expiryOf[tokenId]` (per-token, exact), `accessExpiryOf[account]`
  (the holder's effective window), `_granted[account]` — unix ts; `0` =
  perpetual (longest).
- `mint(address to, uint64 expiry) → uint256` — `onlyOwnerOrGranter`; `expiry`
  is a unix ts (`0` = perpetual). Re-mint after expiry renews.
- **`accessExpiryOf` never shrinks** (audit §2.B): minting a shorter pass to a
  holder of a longer/perpetual one keeps the longer window (`expiry==0` upgrades
  a finite window to perpetual; a finite only extends if later). `expiryOf` per
  token stays exact. After `revoke` the window resets (next mint sets it fresh).
- `hasAccess(address user) → bool` — `true` iff granted and (`expiry==0 ||
  now <= expiry`). **The predicate Lit's `evmContractConditions` calls.**
- `_onRevoke(holder, tokenId)` *(override)* — clears `_granted`/`accessExpiryOf`
  so `revoke` makes `hasAccess` `false` immediately, even for a perpetual pass.
- `claimWithSig(address to, uint64 expiry, uint256 deadline, bytes signature)
  → uint256` — redeem an EIP-712 `Claim(to,expiry,nonce,deadline)` signed by
  `claimSigner`.

> `block.timestamp` deadline/expiry comparisons and OZ-internal
> `unsafe-typecast` are forge-lint *warnings* only — standard practice; not
> gated by CI (`forge build` / `test` / `snapshot --check`).

### 4d. `ManifestRegistry` — on-chain ACC anchor (G-09)

`src/ManifestRegistry.sol`. ✅ Current. On-chain integrity anchor for the Lit
`manifest.lit` `conditionsHash`, so a reader can detect a swapped ACC instead of
trusting the manifest blob alone (closes **G-09**). Self-contained ACL (minimal
registry/validation — partial G-08): the **first writer of a `key` becomes its
author**; only that author may update it.

- State: `mapping(bytes32 key → Anchor{author, conditionsHash, updatedAt})`.
  `key` is caller-defined (e.g. `keccak256(bucket, "/", objectPath)` or courseId).
- `anchor(bytes32 key, bytes32 conditionsHash)` — set/update (author-only after
  first write); reverts `ZeroHash` on empty hash, `NotKeyAuthor` for non-author.
- `anchorOf(key) → (author, conditionsHash, updatedAt)`.
- `verify(key, conditionsHash) → bool` — the reader's tamper gate: `true` iff
  `key` is anchored to exactly that hash (false for unanchored).
- **Errors:** `NotKeyAuthor, ZeroHash`. **Event:** `ManifestAnchored`.

---

## 5. Interfaces (`src/interfaces/`)

- **`IAccessPass`** — `mint`, `hasAccess`; event `AccessGranted`.
- **`ICourseMarketplace`** — `Course` struct; `registerCourse`, `updateCourse`,
  `purchase`, `hasCourseAccess`, `withdraw`, `quote`; events `CourseRegistered`,
  `CourseUpdated`, `CoursePurchased`, `Withdrawn`.
- **`ITreasury`** — `fund`, `withdraw`, `totalReceived`; events `Funded`,
  `Withdrawn`.
- **`IGreenfieldCourseBucket`** — *OPTIONAL, not implemented in v1.* Spec for an
  on-chain cross-chain Greenfield bucket module (must wrap the official
  `bnb-chain/greenfield-contracts` `CrossChain`+`BucketHub`, validate
  `srcChainId`+sequence, refund relayer fee on `FailureAck`, keep relayer fees
  out of the sale split). Access is Lit-gated, so this is **not** needed for
  decryption.

---

## 6. Deployment & wiring

- **`script/Deploy.s.sol`** — deploys + wires the settlement layer:
  `Treasury(deployer)` → `AccessPass()` → `CourseMarketplace(treasury, w3ext)`,
  then `pass.setMarketplace(mp)` and `mp.setAccessPass(pass)`. `w3ext` defaults
  to the deployer unless `W3EXT` is set.
- **`script/DeployAccessNfts.s.sol`** — deploys `new ClientNft(deployer,
  deployer)` **first** (so it keeps the well-known nonce-1 address used by
  `NFT_CONTRACT_ADDR`), then `new AuthorNft(deployer, deployer)`, then
  `new ManifestRegistry()` (appended last so it does not shift the NFT nonces).
  Deployer is both owner (can mint/revoke) and EIP-712 claim signer.

**Dependencies:** `lib/` is gitignored and fetched fresh (repo convention).
CI (`.github/workflows/test.yml`) and every compose service that compiles
contracts now run both `forge install --no-git foundry-rs/forge-std` and
`… OpenZeppelin/openzeppelin-contracts@v5.6.1`.

---

## 7. Verification — Lit compose stack (Flow B)

Two distinct Lit scenarios live under `smartcontracts/docker-compose.lit.yml` →
`run_e2e_lit.sh`:

| Scenario script | Gating function | Contracts exercised |
|---|---|---|
| `run-e2e-lit-nft.mjs` **(the compose default — `e2e-lit` `command`)** | `CourseMarketplace.hasCourseAccess` → soulbound `AccessPass` | `CourseMarketplace`, `AccessPass`, `Treasury` |
| `run-e2e-lit.mjs` (separate ERC-721 scenario) | `ClientNft.balanceOf >= 1` | `ClientNft` (soulbound) |

**Status after the MockNFT → AuthorNft/ClientNft refactor:**

1. **The role NFTs compile + deploy in the live stack.** `deploy-nft` mounts
   `./contracts`, runs `forge build` + `forge script DeployAccessNfts` against
   `chipotle-anvil` (`foundry:latest` anvil, Cancun-capable, so the OpenZeppelin
   `mcopy` bytecode from `evm_version=cancun` deploys cleanly). Verified on a
   throwaway anvil reproducing the prior nonce-0 tx: **ClientNft at nonce 1 =
   `0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512`** (= pinned `NFT_CONTRACT_ADDR`),
   AuthorNft at nonce 2 = `0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0`;
   `ClientNft.mint(bob, 0)` → `balanceOf = 1`, `hasAccess = true`; names
   `"Daskibo Client Pass"` / `"Daskibo Author Pass"`; soulbound `transferFrom`
   reverts.
2. **Deterministic address rationale.** `chipotle-real` first runs
   `contract_deployer` with account #0 (nonce 0). `DeployAccessNfts` deploys
   ClientNft first → nonce 1 = `0xe7f17…`. CREATE address = f(sender, nonce),
   independent of bytecode/constructor args.
3. **The settlement suite is intact under the new config.** `evm_version=cancun`
   now applies to *all* contracts. The last clean-state run (before the rename,
   same OZ/cancun config) passed **10/10 steps, exit 0** for the default
   soulbound subscription scenario: register → encrypt → publish to Greenfield →
   pre-purchase DENIED → `purchase()` → AccessPass minted → ALLOWED & decrypts →
   soulbound transfer reverts → post-expiry DENIED → Eve DENIED.

**Off-chain unit coverage:** 86 forge tests, 100% line/statement/branch/function
coverage on all six contracts (`SoulboundAccessNft` 26/26 lines, `AuthorNft`
7/7, `ClientNft` 17/17).

> Re-run `run_e2e_lit.sh` (full `down -v` + genesis rebuild) to re-confirm the
> default scenario in-stack after the rename. To exercise the `ClientNft`
> balanceOf gate end-to-end, point the `e2e-lit` `command` at `run-e2e-lit.mjs`.
