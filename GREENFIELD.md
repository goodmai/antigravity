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
| `smartcontracts/docker-compose.yml` | Local integration stack: nginx (frontend) + mock SP. |
| `smartcontracts/integration/mock-sp.mjs` | Deterministic mock Greenfield SP gateway. |
| `tests/greenfield-buckets.test.js` | 26 unit tests for the core module. |
| `tests/greenfield-ui.test.js` | 5 jsdom tests for the UI glue. |
| `tests/greenfield-integration.docker.test.js` | docker-compose frontend integration test (auto-skips without Docker). |

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

## 4. Local frontend integration test (docker-compose)

```bash
docker compose -f smartcontracts/docker-compose.yml up -d --wait
curl localhost:8080/            # the bucket console (nginx)
curl localhost:9000/healthz     # the mock SP
docker compose -f smartcontracts/docker-compose.yml down -v
```

`tests/greenfield-integration.docker.test.js` automates this: it brings
the stack up, asserts nginx serves the page / ES modules / 3 course
stubs, then runs the actual `greenfield-core` client over real HTTP
against the mock SP. It **auto-skips** when the Docker daemon is
unreachable (verified via `docker info`), so `npm test` stays hermetic;
a Docker-enabled CI runs it for real.

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
