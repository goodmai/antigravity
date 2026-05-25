# 🌌 Antigravity Laboratory

[![Project Status: Active](https://img.shields.io/badge/Project-Active-success?style=for-the-badge)](https://github.com/goodmai/antigravity)
[![Antigravity](https://img.shields.io/badge/Agent-Antigravity-blueviolet?style=for-the-badge&logo=antigravity)](https://goodmai.github.io/antigravity/)
[![QA Certified](https://img.shields.io/badge/QA-Certified-brightgreen?style=for-the-badge&logo=checkmarx)](https://goodmai.github.io/antigravity/)
[![Powered by Gemini](https://img.shields.io/badge/AI-Gemini-blue?style=for-the-badge&logo=google-gemini)](https://ai.google.dev/)
[![Qwen Enhanced](https://img.shields.io/badge/AI-Qwen-orange?style=for-the-badge)](https://github.com/QwenLM/Qwen)
[![Skill System](https://img.shields.io/badge/System-SKILL-red?style=for-the-badge)](./skills/)

[![Deploy status](https://github.com/goodmai/antigravity/actions/workflows/static.yml/badge.svg)](https://github.com/goodmai/antigravity/actions/workflows/static.yml)

**English** | **[Русский](#русский)**

> Explore the future of agentic coding and autonomous development. This laboratory contains structured lessons and practical labs to master the Antigravity agent ecosystem.

---

## 📑 Table of Contents

1.  [Prerequisites](#-prerequisites)
2.  [Installation](#-installation)
3.  [Curriculum (Lessons)](#-curriculum-lessons)
4.  [Laboratory & Capstone](#-laboratory--capstone)
5.  [Local Agent Control](#-local-agent-control)
6.  [Contributing](#-contributing)

---

## 🛠 Prerequisites

Before starting, ensure you have the following installed:

- **Python 3.10+**: Core engine for scripts and conversion tools.
- **Node.js & npm**: Required for advanced web-integrated skills.
- **Git**: For version control and deployment.
- **Pandoc**: Essential for the Markdown-to-HTML lesson pipeline.

---

## ⚙️ Installation

To set up your local laboratory:

1.  **Clone the repository**:

    ```bash
    git clone https://github.com/goodmai/antigravity.git
    cd antigravity
    ```

2.  **Install dependencies** (Optional: use a virtual environment):

    ```bash
    python3 -m venv .venv
    source .venv/bin/activate
    # Install specific skill requirements if needed
    ```

3.  **Explore the Academy**:
    - Visit the **[Online Academy](https://goodmai.github.io/antigravity/)** for an interactive experience.
    - Or navigate to the `lessons/` directory locally.

---

## 🎓 Curriculum (Lessons)

Each lesson is available as a high-quality interactive HTML page and a local Markdown file.

| ID  | Title                  | Links                                                                                 |
| :-- | :--------------------- | :------------------------------------------------------------------------------------ |
| 01  | Agent Modes            | [Web](https://goodmai.github.io/antigravity/lessons/1/) / [MD](./lessons/1/README.md) |
| 02  | Feedback & Artifacts   | [Web](https://goodmai.github.io/antigravity/lessons/2/)                               |
| 03  | Mentions & Workflows   | [Web](https://goodmai.github.io/antigravity/lessons/3/)                               |
| 04  | Agent Skills           | [Web](https://goodmai.github.io/antigravity/lessons/4/)                               |
| 05  | Standard Skills        | [Web](https://goodmai.github.io/antigravity/lessons/5/)                               |
| 06  | Advanced AI Workflows  | [Web](https://goodmai.github.io/antigravity/lessons/6/) / [MD](./lessons/6/README.md) |
| 07  | QA Architect           | [Web](https://goodmai.github.io/antigravity/lessons/7/) / [MD](./lessons/7/README.md) |
| 08  | Task Groups            | [Web](https://goodmai.github.io/antigravity/lessons/8/)                               |
| 09  | Browser Subagent       | [Web](https://goodmai.github.io/antigravity/lessons/9/)                               |
| 10  | MCP & Integration      | [Web](https://goodmai.github.io/antigravity/lessons/10/)                              |
| 11  | Terminal & Security    | [Web](https://goodmai.github.io/antigravity/lessons/11/)                              |
| 12  | Playwright Autotests   | [Web](https://goodmai.github.io/antigravity/lessons/12/)                              |
| 13  | Cloud & Firebase       | [Web](https://goodmai.github.io/antigravity/lessons/13/)                              |
| 14  | Docker & Microservices | [Web](https://goodmai.github.io/antigravity/lessons/14/)                              |
| 15  | CI/CD Pipelines        | [Web](https://goodmai.github.io/antigravity/lessons/15/)                              |
| 16  | Mobile Dev             | [Web](https://goodmai.github.io/antigravity/lessons/16/)                              |
| 17  | Modern Web (Next.js)   | [Web](https://goodmai.github.io/antigravity/lessons/17/)                              |
| 18  | Refactoring & AI       | [Web](https://goodmai.github.io/antigravity/lessons/18/)                              |
| 19  | Microservices SDLC     | [Web](https://goodmai.github.io/antigravity/lessons/19/)                              |
| 20  | Prompt Engineering     | [Web](https://goodmai.github.io/antigravity/lessons/20/) / [MD](./lessons/20/README.md) |
| 21  | Agent Debugging        | [Web](https://goodmai.github.io/antigravity/lessons/21/) / [MD](./lessons/21/README.md) |
| 22  | Custom MCP Servers     | [Web](https://goodmai.github.io/antigravity/lessons/22/) / [MD](./lessons/22/README.md) |
| 23  | Multi-Agent Orchestration | [Web](https://goodmai.github.io/antigravity/lessons/23/) / [MD](./lessons/23/README.md) |
| 24  | Large Codebases        | [Web](https://goodmai.github.io/antigravity/lessons/24/) / [MD](./lessons/24/README.md) |

---

## 🧪 Laboratory & Capstone

**One lab per lesson** — `labs/NN` ↔ `lessons/N`. Each lab has **≥ 7
hands-on tasks** with explicit acceptance criteria, executed entirely in
**cloud GitHub sandboxes** (multi-platform: Codespaces, Gitpod, Cloud
Shell, StackBlitz, CodeSandbox, Replit, github.dev).

- **Sandbox cheat-sheet:** [`labs/SANDBOX_SETUP.md`](./labs/SANDBOX_SETUP.md) — bootstrap script, devcontainer, secrets, platform choice.
- **Capstone:** [`labs/CAPSTONE.md`](./labs/CAPSTONE.md) — TeleDrive Ecosystem (Telegram + Obsidian + Google Drive).
- **Generator:** `python3 scripts/generate_labs.py` regenerates all 30 labs (edit the generator, not the output).

| Lab | Topic | Lab | Topic |
| :-- | :---- | :-- | :---- |
| [01](./labs/01/) | Полигон режимов агента | [16](./labs/16/) | Мобильная разработка |
| [02](./labs/02/) | Артефакты и обратная связь | [17](./labs/17/) | Next.js Full-Stack |
| [03](./labs/03/) | @Mentions и Workflows | [18](./labs/18/) | Рефакторинг legacy |
| [04](./labs/04/) | Создание Agent Skill | [19](./labs/19/) | SDLC микросервисов |
| [05](./labs/05/) | Каталог стандартных скиллов | [20](./labs/20/) | Промпт-инжиниринг |
| [06](./labs/06/) | Самоисцеляющийся воркфлоу | [21](./labs/21/) | Отладка агентных задач |
| [07](./labs/07/) | QA Architect | [22](./labs/22/) | Свой MCP-сервер |
| [08](./labs/08/) | Группы задач | [23](./labs/23/) | Многоагентная оркестрация |
| [09](./labs/09/) | Browser Subagent (визуальный QA) | [24](./labs/24/) | Большие кодовые базы |
| [10](./labs/10/) | MCP: подключение | [25](./labs/25/) | Логика и математика ИИ |
| [11](./labs/11/) | Терминал, безопасность, Turbo | [26](./labs/26/) | Развёртывание среды |
| [12](./labs/12/) | Playwright + self-healing | [27](./labs/27/) | Управление диалогом |
| [13](./labs/13/) | Облако: Firebase и GCP | [28](./labs/28/) | Память и контекстное окно |
| [14](./labs/14/) | Микросервисы и Docker | [29](./labs/29/) | Данные и границы песочницы |
| [15](./labs/15/) | CI/CD пайплайны | [30](./labs/30/) | Web3 / Solidity |

---

## 🎮 Local Agent Control

Local management is handled through **Workflows** located in `.agent/workflows/`. These provide out-of-the-box automation for complex tasks.

### Key Workflows:

- **`qa-suite`**: Full automated QA cycle using the `qa-skill-tester`.
- **`securcheck`**: Senior-level security audit and code quality review.
- **`artifact-archival`**: Standardized archival with timestamps.

**Run a workflow**:

```bash
# Example
run_workflow securcheck
```

---

## <a name="русский"></a> ℹ️ Информация на русском

Этот репозиторий является учебной базой для освоения автономных агентов. Здесь собраны лучшие практики промпт-инжиниринга, архитектурные паттерны и готовые инструменты (Skills) для ускорения разработки.

---

## 🧪 Testing — Greenfield Smart Contracts (branch `claude/greenfield-smartcontracts-setup-2HS95`)

This branch adds the **Greenfield bucket console + Lit-gated encrypted
courses + Solidity settlement layer**.

**📚 Documentation map** (single source of truth per topic):

| Doc | Topic |
|-----|-------|
| [`GREENFIELD.md`](./GREENFIELD.md) | Bucket console, the 3 Greenfield flows (mock / private / testnet), backends, CI layout |
| [`lit.md`](./lit.md) | Lit Protocol access-control design (encrypt → store → gated decrypt) |
| [`crypto.md`](./crypto.md) | Full crypto map — protocols, encrypt/decrypt, Alice/Bob/Charlie, diagrams |
| [`smartcontracts/contracts/SPEC.md`](./smartcontracts/contracts/SPEC.md) | On-chain settlement ТЗ (marketplace / access pass / treasury) |
| [`smartcontracts/contracts/AUDIT.md`](./smartcontracts/contracts/AUDIT.md) | Contracts audit — logic / deploy / mint, findings & status |
| [`uc.md`](./uc.md) / [`tc.md`](./tc.md) | Use cases / test cases mapped to suites |
| [`smartcontracts/e2e/`](./smartcontracts/e2e/) | **THE main check** — real-network E2E (anvil-BNB + Greenfield testnet + Lit datil-dev); see §1 below |

> **Counts are not embedded in docs** — they rot. The authoritative test
> count is whatever `npm run test:unit` (hermetic) reports; integration
> and Solidity counts come from the CI `integration` / `contracts` jobs.
> Docs describe *what* is covered, not *how many*.

### 🔒 Роль Phala TEE (Trusted Execution Environment)

Для работы децентрализованной криптографии в **Chipotle (Lit Protocol)** используется Phala TEE. Это изолированный анклав (аппаратная защищенная область памяти), который гарантирует конфиденциальность:
- **Защита ключей:** Мастер-ключи (`DEK` / `PKP`) расшифровываются и хранятся исключительно внутри TEE. Ни оператор сервера, ни хостер не могут получить доступ к памяти анклава.
- **Безопасное исполнение (Lit Actions):** Пользовательский JavaScript-код (Lit Actions) выполняется внутри V8-песочницы, изолированной в TEE.
- **Локальная эмуляция:** В локальной среде (`e2e-full` профиль Docker Compose) мы используем `dstack-simulator` от Phala. Он эмулирует TEE-процессор, создавая Unix-сокет (`dstack.sock`), через который `lit-api-server` "доказывает" свою защищенность (Attestation).

### 1. THE main check — real-network E2E happy-path (no mocks)

`tests/e2e-course-flow.live.test.js` + `smartcontracts/e2e/` is the
canonical pre-release verification. It exercises the **entire** stack
against real networks with three named actors:

| Actor | Anvil account | Address | Role |
|-------|---------------|---------|------|
| Deployer | #0 | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` | Deploys + wires contracts |
| **Alice** (author) | #1 | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` | Publishes, free decrypt |
| **Bob** (buyer) | #2 | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` | Pays → AccessPass → decrypts |
| **Eve** (freeloader) | #3 | `0x90F79bf6EB2c4f870365E785982E1f101E93b906` | Never pays → denied at both layers |
| w3ext (broker payee) | #4 | `0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65` | Receives 20% pull-payment |

Three containers, zero mocks:

| Service | Image | Role |
|---------|-------|------|
| `anvil` | `ghcr.io/foundry-rs/foundry:latest` | **BNB testnet clone** — chain-id 97, hardfork shanghai; optionally forks public BSC testnet when `BSC_TESTNET_RPC` is set. Deterministic dev accounts (10 000 native tBNB-equivalent each). |
| `deploy` | `ghcr.io/foundry-rs/foundry:latest` | Runs `forge script Deploy.s.sol` against anvil. Wires `Treasury → AccessPass → CourseMarketplace`; pins `W3EXT` to account #4. |
| `e2e` | custom Node 22 | Drives `run-e2e.mjs`: encrypt → publish to **real** Greenfield testnet (chain 5600) → Lit-wrap on **real** `datil-dev` (free; `datil-test` is opt-in if you have capacity credits) → register course → Bob purchases → operator re-wraps Lit envelope on the `CoursePurchased` event → Bob decrypts and asserts plaintext equality → Eve rejected at both layers → pull-payments withdrawn. |

**Native currency** is **native** on every chain in this flow — no
contract address, no ERC-20 (EVM uses `msg.value` for native; convention
represents it as the zero address `0x0000000000000000000000000000000000000000`).

#### Funds required — **exactly one address needs real money**

| Chain | What pays | Real funds? |
|-------|-----------|-------------|
| anvil BNB-clone (chain 97) | gas for `registerCourse` / `purchase` / `withdraw` / `mint` | **No** — anvil auto-funds each dev account with 10 000 native at start |
| **BNB Greenfield testnet (chain 5600)** | `MsgCreateBucket` + signed `PutObject` per object | **Yes — fund `GREENFIELD_TESTNET_ADDRESS` with tBNB via the [faucet](https://docs.bnbchain.org/bnb-greenfield/getting-started/get-test-bnb/)** |
| Lit `datil-dev` | encrypt is free; decrypt only needs a SIWE personal_sign | **No** — `datil-dev` is permissionless / free. Switch to `datil-test` only if you own capacity credits on Chronicle Yellowstone |

So the entire E2E requires funding **one** address — `GREENFIELD_TESTNET_ADDRESS` (tBNB on chain 5600). Alice/Bob/Eve use anvil dev keys (no real cost), and their Lit session sigs use the same dev keys to sign SIWE messages (no Lit-side balance needed).

#### Course price unit

`COURSE_PRICE_WEI` (default `10000000000000000` = `0.01` native, i.e.
`10^16` wei) is the `uint96 price` passed to `CourseMarketplace.
registerCourse` and required as `msg.value` in `purchase`. Denominated
in **native wei on the anvil chain (chain 97)**. Since anvil pre-funds
each dev account with 10 000 native, this has zero real-world cost.

`quote(PRICE)` then splits per the on-chain bps
(`treasuryBps = w3extBps = 2000`):
- `protocolCut  = 0.002` (20% → Treasury via pull-payment)
- `w3extFee     = 0.002` (20% → w3ext payee via pull-payment)
- `authorAmount = 0.006` (60% → Alice via pull-payment)
- `Σ == PRICE` exact (no wei created/lost).

**Deterministic contract addresses** (deployer = anvil #0, CREATE nonces 0/1/2):

| Contract | Address |
|----------|---------|
| `Treasury` | `0x5FbDB2315678afecb367f032d93F642f64180aa3` |
| `AccessPass` | `0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512` |
| `CourseMarketplace` | `0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0` |

These are stable across runs as long as the deployer account and the
deploy script's CREATE order don't change.

#### What the E2E asserts (every step)

1. **Encrypt** — `course-template` + `crypto-envelope` produce real
   AES-256-GCM `.enc` payloads + `.lit.json` sidecars; the bucket master
   key is generated by WebCrypto. The runner verifies no stored object
   body contains the raw master.
2. **Lit-wrap (real `datil-dev`)** — master is encrypted under
   `addressAllowlist(Alice)` initial ACC. The opaque ciphertext + ACC
   land in `manifest.lit`. settlement re-sums exactly:
   `base = lit 800 + storage 200 = 1000`, `w3extFee = 200`, `total = 1200`.
3. **Greenfield upload (real testnet, chain 5600)** — `MsgCreateBucket`
   + signed object uploads via `@bnb-chain/greenfield-js-sdk` under the
   funded `GREENFIELD_TESTNET_ADDRESS`.
4. **Register course** — Alice calls `registerCourse(price, hash,
   bucket, duration)` on the anvil Marketplace; `courseId` parsed from
   `CourseRegistered` event; `hasCourseAccess(Alice, courseId) == true`.
5. **Pre-purchase invariants** — Bob `hasCourseAccess == false`, and a
   real Lit decrypt with Bob's session sigs rejects with
   `ACCESS_DENIED` (his address isn't in the ACC).
6. **Bob purchases** — `purchase{value: PRICE}(courseId)`. Asserted:
   `quote(PRICE) → (protocolCut, w3extFee, authorAmount)`, `Σ == PRICE`;
   `pendingWithdrawals[Alice/w3ext/Treasury]` match those exact amounts;
   `AccessPass.hasAccess(Bob, courseId) == true`.
7. **Operator re-wraps Lit envelope** — mirrors the real publisher
   service that listens to `CoursePurchased`: master is re-encrypted
   under `Alice OR Bob`; new manifest re-uploaded to Greenfield. (Lit
   nodes can't reach a private anvil RPC, so the canonical access source
   is the contract's `hasCourseAccess`; Lit's ACC is the operator's
   in-sync mirror.)
8. **Bob decrypts** — fetches manifest + `.enc` from Greenfield, Lit
   recovers master with Bob's session sigs, AES-GCM yields plaintext,
   `bobRead.text === SECRET`.
9. **Eve denied at every layer** — `Marketplace.hasCourseAccess(Eve)
   == false`, `AccessPass.hasAccess(Eve) == false`, real Lit decrypt
   with Eve's session sigs throws `ACCESS_DENIED`.
10. **Pull-payments** — Alice withdraws; ledger zeroed; double-withdraw
    reverts `NothingToWithdraw`.

A single line `E2E OK` is printed on success; vitest matches that line
and the job is green. Any assertion failure exits non-zero.

#### How to run (strictly opt-in)

```bash
# Fund a Greenfield testnet account first:
#   https://docs.bnbchain.org/bnb-greenfield/getting-started/get-test-bnb/
export GREENFIELD_TESTNET_PRIVATE_KEY=0x...
export GREENFIELD_TESTNET_ADDRESS=0x...

# Optional — fork public BSC testnet so anvil is a true clone:
# export BSC_TESTNET_RPC=https://data-seed-prebsc-1-s1.binance.org:8545/

RUN_E2E=1 npx vitest run tests/e2e-course-flow.live.test.js

# Or the compose stack directly:
docker compose -f smartcontracts/e2e/docker-compose.yml up --build \
    --abort-on-container-exit --exit-code-from e2e
```

Skipped automatically unless Docker is reachable AND `RUN_E2E=1` AND
the funded Greenfield testnet env vars are set. The default `npm test`
and CI `test:unit` job never trigger this — it spends real testnet gas
and minutes.

### 2. Fast hermetic suite (no Docker, no network)

```bash
npm install
npm run typecheck      # tsc --strict --checkJs over the pure modules → 0 errors
npm run lint:noany     # bans explicit `any` in the strict modules
npm run test:unit      # hermetic vitest (docker/live specs EXCLUDED)
npm test               # everything; docker/live specs self-skip without Docker
```

`npm run test:unit` is **offline & deterministic** and is the CI
hermetic gate: WebCrypto is injected (`node:crypto`), all SDK/chain
adapters are faked, and the `*.docker.test.js` / `*.live.test.js` specs
are excluded outright (not just skipped) so it never touches Docker, a
wallet, a chain or the CDN. It is a subset / sanity gate — **the
authoritative pre-release check is the E2E in §1**.

### 3. Other opt-in integration flows (need Docker; some need funds)

| Flow | Command | Gate |
|------|---------|------|
| A — mock SP frontend | `docker compose -f smartcontracts/docker-compose.yml up -d --wait` | Docker daemon |
| B — real private Greenfield | `RUN_GREENFIELD_LOCAL=1 npx vitest run tests/greenfield-local.docker.test.js` | Docker + env |
| C — real testnet write only | set `GREENFIELD_TESTNET_PRIVATE_KEY`/`_ADDRESS`, run `tests/greenfield-testnet.live.test.js` | Docker + funded key |
| Contracts (Foundry) | `RUN_CONTRACTS=1 npx vitest run tests/contracts.docker.test.js` | Docker |

The contracts toolchain has **no host install** — it lives in
`smartcontracts/contracts/docker-compose.yml` (forge/anvil/cast):

```bash
docker compose -f smartcontracts/contracts/docker-compose.yml run --rm forge   # build + test
docker compose -f smartcontracts/contracts/docker-compose.yml up -d anvil       # local EVM :8545
docker compose -f smartcontracts/contracts/docker-compose.yml run --rm deploy   # forge script broadcast
```

### 4. What is verified vs integration-only (honest)

- **Verified by `npm test`:** all pure logic — Greenfield client (reads,
  pagination, coded errors), `lit-pricing` money math, `crypto-envelope`
  AES round-trip + AEAD tamper-detection, `course-template`/`-publish`
  /`-read` (incl. **publisher free access** and **time-limited client
  access** wiring), wallet/SP backends, ACC builders, CSP guard.
- **Integration-only (run in their Docker flow, not unit-verified):**
  the CDN-loaded `@bnb-chain`/`@lit-protocol` SDK call shapes and the
  Solidity contracts (`forge test` in the container). Documented
  per-module; never presented as "passing" without the flow run.

### 5. CI mapping

`.github/workflows/test.yml` has three jobs on every push/PR:
- **test** — `typecheck` + `lint:noany` + `test:unit` (hermetic).
- **integration** — `test:integration`: brings up the Greenfield
  mock-SP docker stack and runs the full network suite (serving,
  saving, access/retrieval, encrypted-course indexing + decrypt
  round-trip, negative cases, a perf benchmark).
- **contracts** — Foundry `forge build` + `forge test` (max verbosity
  + `--gas-report` + 100% src/ line-coverage gate via
  `smartcontracts/contracts/scripts/check-coverage.sh`).

The **real-network E2E** (§1) and flows B/C stay opt-in/manual
(env-gated, funded keys required) — not per-push CI. The E2E is the
canonical pre-release check; run it before every tag / release.

---

## 🤝 Contributing

Contributions are welcome! If you have a new **Skill** or **Workflow**, please submit a Pull Request.
