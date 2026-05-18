# 🪣 Greenfield Smart Contracts — Bucket Console

Frontend + pure-logic integration for storing course data on the
**BNB Greenfield testnet** through a Storage Provider (SP) HTTP gateway.

One common page lets you **create**, **search**, **save** and **read**
buckets/objects. Built test-first (TDD) with a local docker-compose
frontend integration test.

---

## 1. What was built

| Path | Purpose |
|------|---------|
| `smartcontracts/index.html` | Main page — the common console for create / search / save / read. Modeled on the site's landing page (`academy/index.html`), self-contained so it serves standalone under nginx. |
| `smartcontracts/buckets/greenfield-core.js` | Pure, DOM-free Greenfield client. Real SP HTTP reads via injectable transport; writes **delegated to an injected signer `GreenfieldBackend`** (no fake writes). S3-style validation, URL builders, coded errors. |
| `smartcontracts/greenfield-testnet/sdk-backend.mjs` | **Real** SDK-backed signer backend (on-chain create + signed upload). |
| `smartcontracts/integration/sp-emulation-backend.js` | Local SP-emulation backend for Flow-A offline integration (honestly named, not real chain). |
| `smartcontracts/buckets/greenfield-ui.js` | DOM glue: wires the page's forms to the core client. `fetchTransport` for the browser; `initBucketConsole()` is jsdom-testable with a mock client. |
| `smartcontracts/courses/course-0{1,2,3}/index.html` | 3 course **stubs** (placeholders) linked from the main page. |
| `smartcontracts/docker-compose.yml` | Flow A — local integration stack: nginx (frontend) + **mock** SP. |
| `smartcontracts/integration/mock-sp.mjs` | Deterministic mock Greenfield SP gateway. |
| `smartcontracts/greenfield-local/` | Flow B — **real** local PRIVATE Greenfield network (Dockerfile + compose), clean state. |
| `smartcontracts/greenfield-testnet/` | Flow C — **real** PUBLIC Greenfield testnet writer (SDK + compose). |
| `tests/greenfield-buckets.test.js` | 26 unit tests for the core module. |
| `tests/greenfield-ui.test.js` | 5 jsdom tests for the UI glue. |
| `tests/greenfield-integration.docker.test.js` | Flow A integration test (auto-skips without Docker). |
| `tests/greenfield-local.docker.test.js` | Flow B test — boots the real private chain, asserts consensus (opt-in). |
| `tests/greenfield-testnet.live.test.js` | Flow C test — real testnet bucket+object round-trip (opt-in). |

---

## 2. Greenfield testnet configuration

Defined once in `GREENFIELD_TESTNET` (`smartcontracts/buckets/greenfield-core.js`):

| Field | Value |
|-------|-------|
| EVM chain id | `5600` (`0x15E0`) |
| Cosmos chain id | `greenfield_5600-1` |
| Tendermint RPC | `https://gnfd-testnet-fullnode-tendermint-us.bnbchain.org` |
| SP gateway | `https://gnfd-testnet-sp1.bnbchain.org` |
| Explorer | `https://testnet.greenfieldscan.com` |
| Faucet | `https://gnfd-testnet-faucet.bnbchain.org` |

SP HTTP surface the client speaks:

```
PUT  {sp}/{bucket}                  → create bucket
GET  {sp}/        (owner header)    → list buckets
PUT  {sp}/{bucket}/{key}            → save object
GET  {sp}/download/{bucket}/{key}   → read object
GET  {sp}/view/{bucket}/{key}       → public inline view
```

Bucket names follow S3-style DNS rules: 3–63 chars, lowercase
`[a-z0-9.-]`, start/end alphanumeric, no `..`, not an IPv4 literal.
Object keys: 1–1024 chars. Errors are typed via an `err.code`
(`INVALID_BUCKET_NAME`, `INVALID_OBJECT_KEY`, `BUCKET_EXISTS`,
`NOT_FOUND`, `UNAUTHORIZED`, `SP_UNAVAILABLE`, `SP_ERROR`,
`NETWORK_ERROR`, `NO_OWNER`, `NO_TRANSPORT`).

---

## 3. TDD workflow

The work followed strict red → green:

1. **Red** — `tests/greenfield-buckets.test.js` written first; suite fails
   (module absent).
2. **Green** — `greenfield-core.js` implemented until 26/26 pass.
3. **Red** — `tests/greenfield-ui.test.js` written for the DOM glue.
4. **Green** — `greenfield-ui.js` implemented until 5/5 pass.
5. **Integration** — `tests/greenfield-integration.docker.test.js` +
   docker-compose stack; verified by running the mock SP under Node and
   driving the *real shipped* client through the full
   create → search → save → read flow incl. `NOT_FOUND` / `BUCKET_EXISTS`
   mapping.

Run it all:

```bash
npm install
npm test                 # 196 unit/UI tests pass, docker suite skips
```

---

## 4. The three flows

There are three docker-compose flows, from fast/hermetic to real/costly.
All matching tests **auto-skip** unless their preconditions are met, so
`npm test` stays fast and offline by default.

| Flow | Greenfield | State | Test gate |
|------|-----------|-------|-----------|
| **A — mock SP** | fake gateway | in-memory | Docker daemon reachable |
| **B — local private** | real node from source | fresh genesis (clean) | Docker + `RUN_GREENFIELD_LOCAL=1` |
| **C — public testnet** | real chain 5600 | shared testnet | Docker + funded key envs |

### Flow A — mock SP frontend integration

Fast, deterministic, no chain. nginx serves the real static frontend; a
tiny mock implements just the SP HTTP surface.

```bash
docker compose -f smartcontracts/docker-compose.yml up -d --wait
curl localhost:8080/            # the bucket console (nginx)
curl localhost:9000/healthz     # the mock SP
docker compose -f smartcontracts/docker-compose.yml down -v
```

`tests/greenfield-integration.docker.test.js` brings the stack up,
asserts nginx serves the page / ES modules / 3 course stubs, then runs
the actual `greenfield-core` client over real HTTP against the mock SP.
Auto-skips when the Docker daemon is unreachable (verified via
`docker info`).

### Flow B — REAL local PRIVATE Greenfield (clean state)

`smartcontracts/greenfield-local/` builds the official
[`bnb-chain/greenfield`](https://github.com/bnb-chain/greenfield) node
from source and runs the canonical local-up script — **real validators +
storage providers producing real blocks**, not a mock. No host volumes
are mounted for chain data, so **every `up` starts from a fresh genesis**
(a private chain with clean state). This is the requested
"настоящая Greenfield, приватная с чистым стейтом".

Baked-in commands (mirroring the upstream readme):

```bash
bash ./deployment/localup/localup.sh all <validators> <sps>   # default 1 1
# chain-id : greenfield_9000-1
# validator0 Tendermint RPC : tcp://0.0.0.0:26750
# fund accounts from the pre-funded validator0 key (keyring-backend test):
./build/bin/gnfd tx bank send validator0 0x<addr> 100000000000000000000BNB \
  --from validator0 --node tcp://127.0.0.1:26750 \
  --home deployment/localup/.local/validator0 --keyring-backend test -y
```

Run it:

```bash
docker compose -f smartcontracts/greenfield-local/docker-compose.yml up -d --build
curl -s localhost:26750/status | jq .result.node_info.network   # greenfield_9000-1
docker compose -f smartcontracts/greenfield-local/docker-compose.yml down -v
```

Pin the node via the `GREENFIELD_REF` build arg (release tag for
reproducibility; `master` for latest). `tests/greenfield-local.docker.test.js`
boots it and asserts (a) the RPC reports chain id `greenfield_9000-1`
and (b) the block height advances — i.e. real consensus, not a stub. It
is heavy (Go build + multi-process chain, minutes), so it is **opt-in**:
skipped unless Docker is reachable **and** `RUN_GREENFIELD_LOCAL=1`.

### Flow C — REAL PUBLIC Greenfield testnet write

`smartcontracts/greenfield-testnet/` uses the official
[`@bnb-chain/greenfield-js-sdk`](https://www.npmjs.com/package/@bnb-chain/greenfield-js-sdk)
to perform a **real on-chain round-trip on testnet chain 5600**: select a
live storage provider, `createBucket`, `delegateUploadObject`, then read
the object back from the SP. This spends real testnet gas, so it needs a
**funded** account and is never run by default.

Fund a testnet account first (claim tBNB / bridge / faucet):
<https://docs.bnbchain.org/bnb-greenfield/getting-started/get-test-bnb/>

```bash
export GREENFIELD_TESTNET_PRIVATE_KEY=0x...   # funded testnet key
export GREENFIELD_TESTNET_ADDRESS=0x...        # matching address
docker compose -f smartcontracts/greenfield-testnet/docker-compose.yml \
  run --rm testnet-writer
```

SDK shape used (`Client.create(rpcUrl, chainId)` →
`client.sp.getStorageProviders()` → `client.bucket.createBucket(...)` →
`client.object.delegateUploadObject(...)`). `tests/greenfield-testnet.live.test.js`
drives the compose service and asserts the round-trip prints `ALL GOOD`.
Skipped unless Docker is reachable **and** both
`GREENFIELD_TESTNET_PRIVATE_KEY` / `GREENFIELD_TESTNET_ADDRESS` are set.
Pin `@bnb-chain/greenfield-js-sdk` to a fixed version in
`smartcontracts/greenfield-testnet/package.json` for reproducible runs.

> Sources: bnb-chain/greenfield readme & `deployment/localup`; BNB
> Greenfield docs — RPC endpoints, JS SDK, testnet faucet.

---

## 5. Branches

All work for this feature lives on a dedicated branch — never committed
straight to `main`.

| Branch | Role |
|--------|------|
| `main` | Protected baseline. No direct pushes. |
| `claude/greenfield-smartcontracts-setup-2HS95` | **Active feature branch** for the Greenfield smart-contracts / bucket-console work. All commits and the final push for this task go here. |

**Conventions**

- **Develop** every change on
  `claude/greenfield-smartcontracts-setup-2HS95`. Create it locally if
  absent: `git checkout -b claude/greenfield-smartcontracts-setup-2HS95`.
- **Commit** in small, descriptive units (TDD steps map naturally to
  commits: test → implementation).
- **Push** with upstream tracking and retry-with-backoff on transient
  network errors:
  `git push -u origin claude/greenfield-smartcontracts-setup-2HS95`.
- **Never** push to a different branch without explicit permission, and
  do **not** open a pull request unless explicitly requested — the branch
  is pushed and left ready for review.
- Future Greenfield iterations should branch off the same feature branch
  (or a fresh `claude/greenfield-*` branch), keep the TDD discipline, and
  update this document's branch table.

---

## 6. Course stubs

Three placeholder courses are linked from the main page; replace the
`STUB · Coming soon` content as curriculum lands:

1. **Course 01 — Greenfield Basics**: buckets, objects, the SP gateway.
2. **Course 02 — Permissions & Visibility**: public/private, policies.
3. **Course 03 — On-chain Storage Flows**: tx lifecycle, fees, quotas.

---

## 7. Strict typing & the course bucket fixture

- **Strict typing, zero `any`** — `tsconfig.json` runs
  `tsc --strict --checkJs` (incl. `noImplicitAny`, `strictNullChecks`)
  over the pure domain modules (`greenfield-core`, `lit-pricing`,
  `crypto-envelope`, `course-template`); they are fully JSDoc-typed with
  **no `any`** (untrusted SP JSON is `unknown` + validated; WebCrypto has
  a precise structural interface; `catch` is narrowed). `npm run
  lint:noany` enforces it stays that way; CI runs typecheck + no-any +
  the full vitest suite on every push/PR. The thin DOM adapter
  `greenfield-ui.js` needs `lib.dom` and is verified by the jsdom suite.

  > **TS migration investigated, deliberately not done.** Renaming
  > sources to `.ts` would break the zero-build static site
  > (`index.html` imports raw `.js`; `static.yml` publishes the repo
  > as-is with no bundler) and force a compile/deploy pipeline — strictly
  > riskier for **zero** added type safety over `checkJs --strict` with
  > no `any`. The safe outcome (full TS-grade strictness, no `.ts`) is
  > what's implemented.
- **Course bucket fixture** — `smartcontracts/buckets/course-template.js`
  builds a deterministic course bucket (manifest + per-lesson payloads,
  lit.md schema-aligned) reused by the app and as a stable test fixture:
  `COURSE_TEMPLATE`, `buildCourseBucket(spec)`,
  `sampleCourseBucket(slug?)`, and `encryptCourseBucket()` (envelope
  `.enc` + indexer-safe `.lit.json` sidecars via `crypto-envelope`).
  `encryptCourseBucket` **rewrites the manifest** so each entry points at
  the stored `.enc` key + its `.lit.json` sidecar + `dataToEncryptHash`
  (lit.md schema) — indexers resolve real objects, never plaintext keys.
  TDD'd by `tests/course-template.test.js` (12 tests).

### Growth points addressed (TDD)

- **De-orphaned modules** — `smartcontracts/buckets/course-publish.js`
  is the single tested seam wiring `course-template` + `crypto-envelope`
  + `lit-pricing` + the `greenfield-core` client: `planCoursePublish`
  (pure: build → encrypt → w3ext save settlement), `publishCourse`
  (createBucket + saveObject every object, fail-fast), `quoteCourseSale`
  (20% → treasury). `tests/course-publish.test.js` (4 tests).
- **Manifest correctness** — see above; consistency asserted in tests.
- **Pagination** — `listBuckets` now follows `next_continuation_token`
  across pages (bounded to 1000 pages, no infinite loop);
  `buildListBucketsRequest` takes an optional continuation token.
- **Coded errors** — `lit-pricing` `toBps` now throws `INVALID_BPS`
  (was a raw `BigInt` throw).
- **Supply chain** — `greenfield-testnet` pins
  `@bnb-chain/greenfield-js-sdk` to `2.2.2` (was floating `latest`).
- **Greenfield is no longer a mock.** `greenfield-core` writes
  (`createBucket`/`saveObject`) no longer fabricate a fake `PUT`-to-SP —
  real Greenfield writes are on-chain signed txs (MsgCreateBucket /
  MsgCreateObject + SP approval). The core now **delegates writes to an
  injected `GreenfieldBackend` signer** and throws `NO_BACKEND` rather
  than faking an unsigned write. Reads (list/search/read/URLs) remain the
  genuine SP HTTP protocol.
  - **Real backend**: `smartcontracts/greenfield-testnet/sdk-backend.mjs`
    implements the interface via the official SDK (on-chain
    `createBucket` + signed `delegateUploadObject`). `write-testnet.mjs`
    now publishes a full encrypted course through
    `course-publish.publishCourse` against **real testnet** (Flow C).
  - **Local emulator**: `smartcontracts/integration/sp-emulation-backend.js`
    (honestly named) speaks the simplified PUT protocol the mock SP
    understands, injected explicitly by the Flow-A integration test —
    the core itself never pretends to be real.
  - **Browser wallet backend**:
    `smartcontracts/buckets/greenfield-wallet-backend.js` —
    `createWalletBackend({ provider, makeClient })` resolves the account
    via the user's EIP-1193 wallet and delegates the protocol to an
    injected client (pure, strict-typed, zero-`any`, TDD'd by
    `tests/greenfield-wallet-backend.test.js`, 7 tests: connect-once
    caching, `NO_WALLET` / `USER_REJECTED` / `NO_ACCOUNTS` /
    `NO_WALLET_CLIENT`). The real client
    (`greenfield-wallet-sdk.js`, integration glue, CDN-loaded SDK +
    off-chain auth, outside the strict core like `sdk-backend.mjs`) is
    lazy-imported only when a write happens. `greenfield-ui` now wires
    this backend so the console signs real writes via the wallet instead
    of failing `NO_BACKEND`.
  - TDD: `tests/greenfield-wallet-backend.test.js`,
    `tests/sp-emulation-backend.test.js` + rewritten write-path suites in
    `tests/greenfield-buckets.test.js`.

### Audit follow-ups addressed (TDD)

- **Browser broadcast fixed** — `greenfield-wallet-sdk.js` previously
  passed a non-existent `provider` field to `tx.broadcast`; it now uses
  the documented `signTypedDataCallback` (wallet `eth_signTypedData_v4`).
  The callback is a pure, unit-tested helper
  `makeSignTypedDataCallback(provider)` (`USER_REJECTED` on 4001,
  `NO_WALLET` without a provider) so the signing wiring is covered even
  though the surrounding SDK call graph stays integration-only.
- **Owner derived from the signer** — `greenfield-core` no longer forces
  a separate owner field for signer backends: `resolveOwner` uses the
  optional `backend.resolveOwner()` (the wallet's connected account); an
  explicit owner that disagrees with the signer now throws
  `OWNER_MISMATCH` instead of being silently ignored. `NO_OWNER` still
  applies when nothing can resolve one (e.g. SP-emulation).
- **Coupling removed** — `smartcontracts/buckets/wallet-provider.js`
  (`resolveInjectedProvider`, EIP-6963 → `window.ethereum`, pure,
  strict-typed, TDD'd) replaces the cross-package import of
  `academy/js/web3-core.js`; provider is now resolved once in the UI.

> **Verification status (honest).** Tested: the pure wallet
> orchestration, owner resolution, sign-typed-data wiring, provider
> resolution. **Integration-only / not unit-verified**: the exact
> `genOffChainAuthKeyPairAndUpload` / `delegateUploadObject` SDK call
> shapes in `greenfield-wallet-sdk.js`, and the runtime CDN import of
> `@bnb-chain/greenfield-js-sdk@2.2.2` from esm.sh (pinned by version
> only — a wallet-context supply-chain dependency). Self-hosting that
> bundle is the recommended hardening before production.

### Audit round 2 — addressed (TDD)

- **C1 — SDK casing bug fixed.** `greenfield-wallet-sdk.js` called
  `client.offchainAuth` (camelCase); the SDK property is
  `client.offchainauth`. Wrong casing → guaranteed TypeError on the first
  browser upload. Corrected.
- **C2 / A3 — guarded, shared SP selection.** New pure
  `smartcontracts/buckets/greenfield-sp.js` `pickPrimarySp()` (https→http,
  coded `SP_UNAVAILABLE` on empty/invalid — no more
  `undefined.operatorAddress` TypeError). Now used by **both** the
  browser wallet adapter and the Node `sdk-backend.mjs`, removing the
  duplicated/divergent SP-find logic. TDD: `tests/greenfield-sp.test.js`.
- **D2 — backend conformance suite.**
  `tests/greenfield-backend-contract.test.js` runs one contract against
  every unit-testable backend (sp-emulation + wallet) so a
  missing/renamed method or wrong return shape is caught structurally
  (`sdk-backend.mjs` stays opt-in/live by design).
- **D1 — composition test.** `tests/greenfield-wallet-core.test.js`
  exercises the real `createWalletBackend` → `greenfield-core` seam:
  owner derived from the wallet, `OWNER_MISMATCH` end-to-end.
- **A3 — real create-bucket flow deduplicated.** New pure, injected
  `smartcontracts/buckets/greenfield-sdk-tx.js` `sdkCreateBucket()`
  (pick SP → msg → simulate → broadcast; caller passes only the
  signer-specific broadcast fields). Both `sdk-backend.mjs` (Node,
  `privateKey`) and `greenfield-wallet-sdk.js` (browser,
  `signTypedDataCallback`) now call it — one orchestration, unit-tested
  with fakes (`tests/greenfield-sdk-tx.test.js`), so the divergence class
  that hid C1 can't recur.
- **C3 — no silent truncation.** `listBuckets` now throws
  `LIST_TRUNCATED` when the 1000-page cap is hit with more data behind
  it, instead of returning a silently-incomplete list.

### Lit Protocol integrated (audit A1, TDD)

The lit.md §12 compose is now real code, not design-only:

- `smartcontracts/buckets/lit-access.js` — pure, strict-typed,
  zero-`any` Lit access core. `createLitAccess({ litClient })` →
  `encryptMasterKey(masterB64, acc)` / `decryptMasterKey(env, auth)`:
  Lit threshold-encrypts the **AES bucket master key** under on-chain
  Access Control Conditions (AES does the bulk, Lit guards the 32-byte
  master). Coded errors `INVALID_ACC` / `INVALID_MASTER` /
  `INVALID_LIT_ENVELOPE` / `ACCESS_DENIED` / `LIT_UNAVAILABLE`. TDD'd by
  `tests/lit-access.test.js` (7) with an injected fake Lit client.
- `course-publish.planCoursePublish({ …, lit })` Lit-wraps the master
  and records it in `manifest.lit` — the raw master is **never written
  into any stored object**. TDD'd in `tests/course-publish.test.js`.
- `smartcontracts/buckets/lit-sdk.js` — real `LitClient` adapter:
  CDN-loaded `@lit-protocol/lit-node-client` + `@lit-protocol/encryption`
  on the Datil network (`datil-test` paired with Greenfield testnet).
  Integration glue, outside the strict core like the other SDK adapters.

### Round-trip closed — protected course reader (TDD)

`smartcontracts/buckets/course-read.js` completes the encrypt↔decrypt
loop the pipeline sets up:

- `recoverCourseMasterKey(manifest, { access, authContext })` — recovers
  the AES master from `manifest.lit` via Lit **only if the reader
  satisfies the ACC** (`NO_LIT` / `NO_LIT_CLIENT`, `ACCESS_DENIED`
  propagated).
- `decryptCourseObject(manifest, encBodyJson, { access, authContext,
  crypto })` — recover master → AES-decrypt the `.enc` envelope
  (`INVALID_ENVELOPE` / `DECRYPT_FAILED`).
- `openCourseObject({ client, bucketName, objectKey, lit, crypto })` —
  IO wrapper: reads `_lit/manifest.json` + `<key>.enc` via a
  greenfield-core read client (no signer needed) then decrypts.

Pure, strict-typed, zero-`any`, TDD'd by `tests/course-read.test.js`
(7 tests incl. a real AES round-trip with `node:crypto`).

> **Honest status (audit A1/A4).** Lit *orchestration* — publish
> (`course-publish` + `lit-access`) and read (`course-read`) — is real,
> composed and unit-tested end-to-end with fakes + real AES.
> **Integration-only / not unit-verified**: the exact `@lit-protocol`
> SDK call shapes in `lit-sdk.js`, Lit `sessionSigs` generation, and the
> runtime CDN import (pinned `@7`) — self-host before production, same as
> the Greenfield SDK adapter.
>
> **UI wired (A4 done).** `index.html` now has a *Lit-protected course*
> section (publish + open) and `greenfield-ui.js` wires it: a
> **Publish encrypted course** form (slug + reader-address ACC →
> `publishCourse` with `lit`) and an **Open protected object** form
> (bucket + key → `openCourseObject`, renders the decrypted text). The
> publish/open functions are injectable seams (`publishCourseFn` /
> `openCourseObjectFn`) so the DOM glue is unit-tested under jsdom
> (`tests/greenfield-ui.test.js`, +3); production lazily builds the real
> ones from `course-publish`/`course-read` + `lit-sdk.js`
> (`makeLitClient` / `makeLitAuth` — CDN, wallet SIWE session sigs,
> integration-only like the other SDK adapters). Pure orchestration
> below the glue is fully tested.
