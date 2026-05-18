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
courses + Solidity settlement layer**. Full design lives in
[`GREENFIELD.md`](./GREENFIELD.md) / [`lit.md`](./lit.md) /
[`smartcontracts/contracts/SPEC.md`](./smartcontracts/contracts/SPEC.md);
all user/test cases in [`uc.md`](./uc.md) / [`tc.md`](./tc.md).

### 1. Default suite (fast, hermetic — no Docker, no network)

```bash
npm install
npm run typecheck     # tsc --strict --checkJs over the pure modules → 0 errors
npm run lint:noany    # bans explicit `any` in the strict modules
npm test              # vitest: ~320 pass, ~9 skipped (gated suites skip)
```

`npm test` is **offline & deterministic**: WebCrypto is injected
(`node:crypto`), all SDK/chain adapters are faked. Every gated
integration suite *auto-skips* unless its preconditions are met, so a
green default run never touches a wallet, a chain, the CDN, or Docker.

### 2. Opt-in integration flows (need Docker; some need funds)

| Flow | Command | Gate |
|------|---------|------|
| A — mock SP frontend | `docker compose -f smartcontracts/docker-compose.yml up -d --wait` | Docker daemon |
| B — real private Greenfield | `RUN_GREENFIELD_LOCAL=1 npx vitest run tests/greenfield-local.docker.test.js` | Docker + env |
| C — real testnet write | set `GREENFIELD_TESTNET_PRIVATE_KEY`/`_ADDRESS`, run `tests/greenfield-testnet.live.test.js` | Docker + funded key |
| Contracts (Foundry) | `RUN_CONTRACTS=1 npx vitest run tests/contracts.docker.test.js` | Docker |

The contracts toolchain has **no host install** — it lives in
`smartcontracts/contracts/docker-compose.yml` (forge/anvil/cast):

```bash
docker compose -f smartcontracts/contracts/docker-compose.yml run --rm forge   # build + test
docker compose -f smartcontracts/contracts/docker-compose.yml up -d anvil       # local EVM :8545
docker compose -f smartcontracts/contracts/docker-compose.yml run --rm deploy   # forge script broadcast
```

### 3. What is verified vs integration-only (honest)

- **Verified by `npm test`:** all pure logic — Greenfield client (reads,
  pagination, coded errors), `lit-pricing` money math, `crypto-envelope`
  AES round-trip + AEAD tamper-detection, `course-template`/`-publish`
  /`-read` (incl. **publisher free access** and **time-limited client
  access** wiring), wallet/SP backends, ACC builders, CSP guard.
- **Integration-only (run in their Docker flow, not unit-verified):**
  the CDN-loaded `@bnb-chain`/`@lit-protocol` SDK call shapes and the
  Solidity contracts (`forge test` in the container). Documented
  per-module; never presented as "passing" without the flow run.

### 4. CI mapping

`.github/workflows/test.yml` runs §1 on every push/PR. Docker flows
(§2) are opt-in jobs / manual — they pull images and hit the network,
so they are not part of the hermetic gate.

---

## 🤝 Contributing

Contributions are welcome! If you have a new **Skill** or **Workflow**, please submit a Pull Request.
