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
| `smartcontracts/buckets/greenfield-core.js` | Pure, DOM-free Greenfield client. Injectable HTTP transport, S3-style validation, URL builders, coded errors. Same philosophy as `academy/js/web3-core.js`. |
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
  TDD'd by `tests/course-template.test.js` (10 tests).
