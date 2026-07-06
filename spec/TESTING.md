# Daskibo Academy — Test Reference

A single, formalized **test pyramid**: many fast hermetic tests at the base, a few
slow real-world tests at the top. Every layer has a fixed **naming convention**, a
**runner**, a **gate**, and a **CI job**, so any test's layer is obvious from its
file name alone.

Cross-refs: use cases [uc.md](./uc.md) · test cases [tc.md](./tc.md) ·
traceability [RTM.md](./RTM.md) · contract audit
[audit.md](../smartcontracts/contracts/audit.md).

---

## 1. The pyramid

```
                         ▲ fewer, slower, real infra, opt-in
        ┌───────────────────────────────────────────────┐
   L5   │ Acceptance — live/real networks                │  *.live.test.js · e2e/run-e2e.mjs
        │ BSC+Greenfield testnet + Chipotle mainnet      │  CI: devnet-e2e (nightly, secrets)
        ├───────────────────────────────────────────────┤
   L4   │ System E2E — local full stack                  │  e2e-synpress/**/*.spec.ts · e2e/run-*.mjs
        │ UI (MetaMask) · DRM gating (mock Chipotle)     │  CI: ui-e2e-synpress (PR) · e2e-lit mock (PR)
        ├───────────────────────────────────────────────┤
   L3   │ Integration — Docker, mock infra               │  *.docker.test.js
        │ mock SP + nginx, real HTTP                      │  CI: integration-test (PR)
        ├───────────────────────────────────────────────┤
   L2   │ Component — in-process integration             │  *.test.js (spins in-proc HTTP/mocks)
        │ chipotle mock, SP emulation, backend contract  │  CI: test (PR)
        ├───────────────────────────────────────────────┤
   L1   │ Unit — hermetic (the base, run everywhere)     │  *.t.sol (forge) · *.test.js (vitest)
        │ pure functions, contracts, ACC eval, crypto    │  CI: forge-test + test (PR)
        └───────────────────────────────────────────────┘
                         ▼ many, fast, no Docker/keys/network
```

**PR gate (every pull request & push):** L1 + L2 + L3 + the L4 **UI** suite +
the L4 **mock-TEE DRM gating** E2E — jobs `test`, `forge-test`,
`integration-test`, `ui-e2e-synpress`, `e2e-lit-integration`.
**Nightly / `workflow_dispatch` (heavy, best-effort):** the **real-TEE** build and
L5 **live** — jobs `chipotle-real-integration`, `devnet-e2e`.

> Why the DRM gating E2E runs against the **Chipotle mock** on PRs (not the real
> image): building upstream `LIT-Protocol/chipotle` compiles `lit-api-core`, which
> depends on the **private** repo `LIT-Protocol/zerossl` (404 to external CI;
> pinned rev unreachable on every public ref incl. tag `v1.1.7`) — it cannot be
> built without LIT-Protocol credentials. Per the Chipotle README the real service
> is meant to be used as a **hosted REST API** (`api.chipotle.litprotocol.com`),
> not self-built. So PRs run the mock (`docker-compose.yml --profile devnet-pa`),
> which is REST-compatible and exercises the full gating flow; the real hosted-API
> path runs nightly in `devnet-e2e`. See
> [.github/workflows/test.yml](../.github/workflows/test.yml).

---

## 2. Formalized naming

Layer is encoded in the **file name / path** — no other signal needed.

| Layer | File convention | Runner | Gate | CI job |
|-------|-----------------|--------|------|--------|
| **L1** Unit (Solidity) | `smartcontracts/contracts/test/*.t.sol` | Foundry `forge` | none | `forge-test` |
| **L1** Unit (JS) | `tests/<unit>.test.js` (pure) | vitest | none | `test` |
| **L2** Component | `tests/<feature>.test.js` (in-proc HTTP/mock) | vitest | none | `test` |
| **L3** Integration | `tests/<feature>.docker.test.js` | vitest + Docker | Docker daemon | `integration-test` |
| **L4** System E2E (UI) | `smartcontracts/e2e-synpress/specs/NN-<flow>.spec.ts` | Playwright + Synpress | Docker + MetaMask | `ui-e2e-synpress` |
| **L4** System E2E (DRM gating, mock) | `smartcontracts/e2e/run-devnet-pa.mjs` via `docker-compose.yml --profile devnet-pa` | docker compose + node | Docker | `e2e-lit-integration` |
| **L4** System E2E (real TEE, nightly) | `run_e2e_lit.sh` → `e2e/run-e2e-lit*.mjs` (needs the private upstream build) | bash + node + Docker | Docker + LIT creds (unavailable) | `chipotle-real-integration` |
| **L5** Acceptance (live) | `tests/<feature>.live.test.js` · `smartcontracts/e2e/run-e2e.mjs` | vitest / node | funded testnet keys + `CHIPOTLE_API_KEY` | `devnet-e2e` |

**Test-case identifiers.** Every documented case has a stable ID `TC-<UC>.<n>`
bound to a use case `UC-<nn>` and traced in [RTM.md](./RTM.md). Example:
`TC-04.2` = the purchase-credits-pull case under `UC-04`. Audit-driven cases reuse
the finding ID (`H-1`, `N-1`, …).

**Test-function naming.**
- Foundry: `test_<unit>_<behavior>()`; fuzz `testFuzz_<behavior>()`; negative paths
  end in `_reverts` / `_rejects…` (e.g. `test_adjustPrice_rejectsFullDiscount`).
- vitest: `describe('<module-or-unit>')` + `it('<behavior in present tense>')`
  (e.g. `describe('pinFile') · it('throws PINATA_UPLOAD_FAILED …')`).

**Vitest scope.** `vitest.config.js` excludes `lib/`, `e2e-synpress/`, `tests/e2e/`,
`tests/ui/`, `*.spec.ts`, `scratch/` — i.e. L4 UI/Playwright and vendored trees are
**not** collected by vitest; they run via their own runners.

---

## 3. How to run

```bash
# L1 + L2 (hermetic JS) — fast, the default
npm run test:unit          # excludes *.docker.test.js and *.live.test.js
npm test                   # all vitest (auto-runs L3 docker tests if Docker is up)
npm run test:coverage      # L1/L2 with coverage (buckets/** threshold)
npx vitest run tests/pinata-client.test.js   # one file
npm run test:watch         # watch mode

# L1 contracts (Foundry)
npm run test:contracts     # forge test -vvv  (179 tests)
cd smartcontracts/contracts && forge snapshot --check --tolerance 1

# L3 — Docker integration (mock SP + nginx)
npm run test:integration   # *.docker.test.js (needs Docker)

# L4 — System E2E
#  UI (MetaMask, docker local-full):
cd smartcontracts/e2e-synpress && npm test          # Playwright + Synpress
#  DRM stack (Lit/Chipotle/Greenfield local, fresh genesis):
CHIPOTLE_DIR=~/GitHub/chipotle ./run_e2e_lit.sh

# L5 — Acceptance (live, spends testnet gas)
export GREENFIELD_TESTNET_PRIVATE_KEY=0x... GREENFIELD_TESTNET_ADDRESS=0x...
npm run test:live          # *.live.test.js
node smartcontracts/e2e/run-e2e.mjs   # full real-network flow
```

---

## 4. Test inventory (by layer)

### L1 — Unit
- **Contracts (`*.t.sol`, forge, 179 tests, 100% line/func):**
  `AccessPass`, `AuthorNft`, `ClientNft`, `SoulboundAccessNft`, `CourseMarketplace`,
  `Treasury`, `ManifestRegistry`, `GreenfieldGroupGate`. See
  [audit.md](../smartcontracts/contracts/audit.md) / [NFT.md](../smartcontracts/contracts/NFT.md).
- **JS pure units (`tests/*.test.js`):** `lit-acc.test.js`, `lit-acc-eval.test.js`,
  `lit-access.test.js`, `lit-pricing.test.js`, `crypto-envelope.test.js`,
  `course-publish.test.js`, `course-read.test.js`, `course-template.test.js`,
  `claim-eip712.test.js`, `greenfield-buckets/-sp/-sdk-tx/-wallet-*`,
  `wallet-provider.test.js`, `web3*.test.js`,
  `pinata-client.test.js` · `pinata-config.test.js` · `pinata-upload.test.js` (35).

### L2 — Component (in-process integration)
`chipotle-drm.test.js` (in-proc Chipotle mock + `ACCESS_DENIED`),
`sp-emulation-backend.test.js`, `greenfield-backend-contract.test.js`,
`daskibo-drm.test.js`, `greenfield-ui.test.js`.

### L3 — Integration (Docker)
`greenfield-integration.docker.test.js` (nginx + mock-sp round-trip),
`greenfield-local.docker.test.js` (real local chain, `RUN_GREENFIELD_LOCAL=1`),
`contracts.docker.test.js` (forge build/test + deploy smoke vs anvil).

### L4 — System E2E
- **UI (PR):** `e2e-synpress/specs/01-connect-network` … `06-content-access` (DRM
  unlock journey), driven by Synpress on `docker local-full`.
- **DRM gating, mock Chipotle (PR):** `run-devnet-pa.mjs` via
  `docker-compose.yml --profile devnet-pa` — purchase → `wrap_for_buyer` →
  `setEncryptedKey` → decrypt (allowed) → Eve denied → double-wrap blocked →
  expiry enforced. Verified green; no Rust/private-dep build.
- **Real TEE (nightly, best-effort):** `run_e2e_lit.sh` →
  `run-e2e-lit-nft.mjs` (`hasCourseAccess`→`AccessPass`) / `run-e2e-lit.mjs`
  (`ClientNft.balanceOf`) — builds the upstream image; unbuildable in external CI
  (private `zerossl`), so `chipotle-real-integration` is `continue-on-error`.

### L5 — Acceptance (live)
`greenfield-testnet.live.test.js` (real testnet write + Chipotle DRM, chain 5600),
`smartcontracts/e2e/run-e2e.mjs` (full real-network flow). See feasibility scope in
[REVIEW.md](./REVIEW.md).

---

## 5. Environment variables

| Variable | Layer | Description |
|----------|-------|-------------|
| `RUN_GREENFIELD_LOCAL` | L3 | `1` → enable the local-chain docker test |
| `CHIPOTLE_DIR` / `SIMULATOR_DIR` | L4 | upstream Chipotle repo / dstack simulator paths for `run_e2e_lit.sh` |
| `GREENFIELD_TESTNET_PRIVATE_KEY` | L5 | hex private key funded with testnet BNB |
| `GREENFIELD_TESTNET_ADDRESS` | L5 | matching 0x address |
| `GF_BUCKET` | L5 | override bucket name (default: auto) |
| `CHIPOTLE_URL` | L4/L5 | Chipotle endpoint (mock `http://localhost:8000` or `https://api.chipotle.litprotocol.com`) |
| `CHIPOTLE_API_KEY` | L5 | Chipotle usage key (Stripe-funded account) |
| `LIT_ALLOWED_ADDRESS` | L5 | extra address to OR into the ACC |

---

## 6. How to add a test (pick the lowest layer that proves the behavior)

**L1 (JS unit).** `tests/<unit>.test.js`; `import { describe, it, expect } from 'vitest'`;
for crypto `import { webcrypto } from 'node:crypto'`. Runs automatically.

**L1 (contract).** Add `test_<unit>_<behavior>()` in
`smartcontracts/contracts/test/<Contract>.t.sol`; run `forge test`; refresh
`forge snapshot` if gas changed.

**L2 (component).** Same `*.test.js` suffix; spin an in-proc server with
`http.createServer` + `listen(0, …)` for a random free port; close it in `afterAll`.

**L3 (docker).** Name it `*.docker.test.js` and gate on Docker:
```js
import { execSync } from 'node:child_process';
const docker = (() => { try { execSync('docker info',{stdio:'ignore'}); return describe; } catch { return describe.skip; } })();
```

**L4 (UI).** Add `smartcontracts/e2e-synpress/specs/NN-<flow>.spec.ts` (Playwright +
Synpress). Not collected by vitest — run via the synpress runner.

**L5 (live).** Add to `tests/<feature>.live.test.js`; gate on the funded-key env so
it stays opt-in.

Whatever you add, give it a `TC-<UC>.<n>` ID and wire it into
[tc.md](./tc.md) + [RTM.md](./RTM.md) so coverage stays traceable.
