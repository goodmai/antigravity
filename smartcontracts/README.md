# Daskibo Academy — Smart Contracts & Storage Layer

[BNB Greenfield](../spec/wiki.md#greenfield) decentralized course storage with AES-256-GCM encryption
and Chipotle/[Lit Protocol](../spec/wiki.md#litkey) [DRM](../spec/wiki.md#drm) access control.

---

## Architecture overview

Course content never travels in plaintext. Every lesson is encrypted with a
random per-object data key (DEK); DEKs are wrapped under a bucket-level
master key; the master key is encrypted by a DRM server (Lit or Chipotle)
whose release policy is the on-chain [Access Control Condition (ACC)](../spec/wiki.md#acc).

```
Lesson bytes  ──AES-GCM(DEK)──►  lesson.enc
DEK (32 B)    ──AES-GCM(Master)─► lesson.dek.enc
Master key    ──Lit/Chipotle──────► manifest.lit.json  (schema: daskibo.lit.acc/1)
```

The reader fetches the manifest, proves address ownership to the DRM server,
receives the master key, derives DEKs, and decrypts lessons in-browser.

---

## Five development flows

| Flow | Chain | Storage Provider | DRM server | Files used | Purpose |
|------|-------|-----------------|------------|-----------|---------|
| **A** — Mock SP | none | In-memory Node.js mock (`mock-sp.mjs`) | none | `smartcontracts/docker-compose.yml` | Fast UI + API iteration |
| **B** — Local chain | `greenfield_9000-1` (local) | Real SP in local network | none | `smartcontracts/greenfield-local/docker-compose.yml` | Real chain, clean state |
| **C** — Local DRM | testnet 5600 _or_ local | Testnet SP or mock | **Chipotle mock** on `localhost:8000` | `greenfield-testnet/docker-compose.yml` | Full DRM without paying credits |
| **D** — Testnet DRM | testnet 5600 | `gnfd-testnet-sp1.bnbchain.org` | Chipotle live API | same compose, `CHIPOTLE_URL=https://api.chipotle.litprotocol.com` | Pre-prod integration |
| **E** — Mainnet | `greenfield_1017-1` | Production SP | Lit mainnet / Chipotle funded | — | Production |
| **Demo** — Local Anvil | `31337` (local) | none | Chipotle mock | `smartcontracts/docker-compose.demo.yml` · `run_demo.sh` | MetaMask course-sale demo (author/client/Eve) → [Local course demo](#local-course-demo-anvil--metamask) |
| **Devnet** — BSC + GF testnets | BSC 97 + GF 5600 | `gnfd-testnet-sp1.bnbchain.org` | Chipotle mock (BSC-aware) | `smartcontracts/docker-compose.devnet.yml` · `run_devnet.sh` · `fund_devnet.sh` | Real testnets, same demo UX → [DEVNET](#devnet-real-testnets-metamask-driven-like-the-demo) |

---

## Quick-start per flow

### Flow A — Mock SP (no chain, no keys needed)

```bash
docker compose -f smartcontracts/docker-compose.yml up -d
# frontend → http://localhost:8080
# mock SP  → http://localhost:9000
docker compose -f smartcontracts/docker-compose.yml down
```

Tests: `npm test` (vitest, all non-docker suites run automatically)

### Flow B — Local Greenfield chain

```bash
# Heavy: builds the Go node from source (~5 min first run)
docker compose -f smartcontracts/greenfield-local/docker-compose.yml up -d --build

# Wait for chain to produce blocks (~4 min start_period)
curl -s localhost:26750/status | jq .result.node_info.network  # → greenfield_9000-1

docker compose -f smartcontracts/greenfield-local/docker-compose.yml down -v
```

Tests: `RUN_GREENFIELD_LOCAL=1 npm test`

Ports: `26750` Tendermint RPC, `9033` SP gateway, `1317` Cosmos REST

### Flow C — Local DRM with Chipotle mock

```bash
export GREENFIELD_TESTNET_PRIVATE_KEY=0x...
export GREENFIELD_TESTNET_ADDRESS=0x...
export CHIPOTLE_PKP_KEY=0x...    # optional; printed on first run if omitted

# Terminal 1 — start mock key server
docker compose -f smartcontracts/greenfield-testnet/docker-compose.yml \
  up chipotle-mock

# Terminal 2 — publish a DRM-protected course
docker compose -f smartcontracts/greenfield-testnet/docker-compose.yml \
  run --rm chipotle-writer

# Browser — open reader with the bucket name printed by the writer
static-web-server --port 8099 --root smartcontracts/
# http://localhost:8099/bucket-reader.html?bucket=BUCKET&owner=0x...
```

Tests: `GREENFIELD_TESTNET_PRIVATE_KEY=... GREENFIELD_TESTNET_ADDRESS=... npm test`

### Flow D — Live Chipotle (funded credits)

Same as Flow C but set:
```bash
export CHIPOTLE_URL=https://api.chipotle.litprotocol.com
# Fund your Chipotle account (min $5) at https://chipotle.litprotocol.com
```

Then run the same `chipotle-writer` command. No mock needed.

---

## Local course demo (Anvil + MetaMask)

A fully local, browser-driven demo of the **course-sale + DRM flow** — register a
course as the **author**, buy it as a **client**, watch **Eve** get locked out,
and open the **encrypted** lesson only when the wallet actually owns the course —
all on a throwaway local Anvil chain. No real funds, no keys to fund.

```bash
./run_demo.sh                 # local Anvil + deploy + seed + encrypt + frontend
# → open  http://localhost:8099/course-demo.html
./run_demo.sh down            # stop and wipe the local chain
```

`run_demo.sh` (compose: [`docker-compose.demo.yml`](docker-compose.demo.yml)) brings up:

- **anvil** — local EVM chain `31337` on `http://127.0.0.1:8545` (pre-funds 10
  dev accounts with 10000 ETH each),
- **demo-deploy** — deploys & wires `Treasury` + `AccessPass` +
  `CourseMarketplace`, seeds one sample course as the author, and writes
  `demo/addresses.json` for the page,
- **chipotle-mock** — local DRM key server (`:8000`) that releases a lesson's
  decryption key **only** when the caller satisfies the on-chain ACC
  (`CourseMarketplace.hasCourseAccess`),
- **demo-encrypt** — one-shot: AES-encrypts the seeded lesson and wraps its key
  behind that ACC → `demo/manifest-1.json`,
- **frontend** — nginx serving [`course-demo.html`](course-demo.html) +
  [`course-content.html`](course-content.html) (the gated reader) on `:8099`.

### Three personas (standard public Anvil keys — in `.env` as `DEMO_*`)

| Role | Anvil account | Address |
|------|---------------|---------|
| **Author** | #1 | `0x7099…79C8` |
| **Client** | #2 | `0x3C44…93BC` |
| **Eve** (intruder) | #3 | `0x90F7…b906` |

The page detects which role the connected MetaMask account is, and the access
matrix reads `hasCourseAccess()` for **all three** at once.

### Add the Anvil network to MetaMask

Easiest: open the page and click **"Add / switch Anvil network"** (uses
`wallet_addEthereumChain`). Or add it manually — MetaMask → *Networks → Add a
network → Add manually*:

| Field | Value |
|-------|-------|
| Network name | `Daskibo Anvil (local)` |
| New RPC URL | `http://127.0.0.1:8545` |
| Chain ID | `31337` |
| Currency symbol | `ETH` |

### Import the persona keys into MetaMask

MetaMask → account menu → **Import account** → paste the private key. From
`.env` (these are well-known public Anvil test keys — no real value):

```bash
DEMO_AUTHOR_PK=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
DEMO_CLIENT_PK=0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a
DEMO_EVE_PK=0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6
```

> ⚠️ These keys are public and only ever hold play-money on a local chain.
> **Never** send real funds to them or reuse them on a public network.

### Walk-through

1. **Author** account → *Register a course* (title, price, duration). You become
   its author and have free access to your own content.
2. Switch MetaMask to the **Client** account → *Catalog* → **Buy**. A soulbound
   `AccessPass` is minted; access flips to ✓.
3. Switch to **Eve** → try to read the matrix: Eve stays ✗ (never purchased).
4. **Access matrix** shows ✓/✗ for Author / Client / Eve across every course —
   verifying gating works for all three regardless of who is connected.
5. Once a course shows access ✓, its card swaps the **Buy** button for an
   **"Open course →"** link to the gated reader ([`course-content.html`](course-content.html)).
6. **Author** can *Withdraw* the proceeds credited by the sale (pull-payments).

### The gated reader (real DRM, not a public link)

The lesson body is **AES-256-GCM encrypted**; its master key is wrapped by the
Chipotle mock behind the course's ACC. Opening `course-content.html`:

1. requires **MetaMask** (no wallet → nothing decrypts);
2. verifies `hasCourseAccess(you, courseId)` on the demo chain;
3. signs an ownership proof and asks **Chipotle** for the key — Chipotle
   **re-checks the ACC on-chain**, so no NFT/AccessPass ⇒ no key;
4. decrypts and renders the lesson client-side.

So opening the link **incognito / without the NFT shows only the blurred
placeholder** — the ciphertext alone is useless. Only the seeded course #1 ships
encrypted content (the browser can't write new manifests to the read-only
frontend); courses you register yourself demonstrate the sale/gating, and the
reader reports "manifest not found" for them.

> On a fresh chain MetaMask may cache a stale nonce after `run_demo.sh down` +
> up. If a tx won't send, *Settings → Advanced → Clear activity tab data* for
> the local network.

---

## DEVNET (real testnets, MetaMask-driven, like the demo)

Same UX as the local Anvil demo above — but the **contracts live on BSC
testnet** (chain 97), the **course is encrypted into BNB Greenfield testnet**
(chain 5600), and the master key is gated by the same `hasCourseAccess` ACC
the marketplace exposes. Lit Protocol has no testnets (Datil shut down
2026-02-25), so the DRM step still uses the **local Chipotle mock** — the
only difference from production-Chipotle is who issues the key.

```bash
./run_devnet.sh                 # deploy → encrypt → publish → frontend
# → open  http://localhost:8099/course-demo.html   (catalog + buy)
# → open  http://localhost:8099/course-view.html    (the DRM-gated lessons grid)
./run_devnet.sh down            # stop (testnet state persists)
```

`run_devnet.sh` (compose: [`docker-compose.devnet.yml`](docker-compose.devnet.yml)) brings up:

- **devnet-deploy** — one-shot Foundry: deploys `ClientNft` / `AuthorNft` +
  the settlement (`Treasury` / `AccessPass` / `CourseMarketplace`) to **BSC
  testnet 97**, mints a perpetual `ClientNft` to the deployer, registers
  course #1 (`daskibo-devnet-course`, 0.001 tBNB) and writes
  `demo/addresses.json` (with chain 97 + the marketplace address) so the
  frontend drives the real testnet.
- **chipotle-mock** — local Chipotle key server on `:8000` with
  `EVM_RPC=https://data-seed-prebsc-1-s1.binance.org:8545` so the ACC is
  re-evaluated against the same BSC testnet contracts.
- **devnet-encrypt** — one-shot: AES-encrypts a single lesson and wraps its
  key behind `hasCourseAccess(:userAddress, 1) == true` → `demo/manifest-1.json`
  (used by the stub gated reader `course-content.html`).
- **devnet-writer** — one-shot: AES-encrypts the REAL `lessons/` course (76
  files / ~2.85 MB), uploads every object to **Greenfield testnet** SP1, and
  patches `demo/addresses.json` with the resulting bucket name + owner so
  `course-view.html` knows what to read.
- **frontend** — nginx serving every static page on `:8099`.

### Two test wallets — DO NOT reuse the local demo's DEMO_*_PK

The local Anvil demo personas (`DEMO_AUTHOR_PK`, `DEMO_CLIENT_PK`,
`DEMO_EVE_PK` in `.env`) are the **public Anvil dev keys** from the standard
mnemonic. Every sweep-bot on every public testnet knows them — we've seen
those addresses with **1800+ outgoing txs** on BSC testnet, draining anything
that lands within seconds. **They only work on the throwaway local chain.**

For devnet you need separate, NON-public keys. Add to your gitignored `.env`:

```bash
# Author / Deployer (already there — same key has tBNB on BSC + Greenfield)
GREENFIELD_TESTNET_PRIVATE_KEY=0x...
GREENFIELD_TESTNET_ADDRESS=0x...

# Client persona (buys the course)
CLIENT_PK=0x...
CLIENT_ADDRESS=0x...

# Eva persona (gets denied access)
EVA_PK=0x...
EVA_ADDRESS=0x...
```

Generate fresh ones if you don't have any:

```bash
docker run --rm --entrypoint sh ghcr.io/foundry-rs/foundry:latest -c \
  'cast wallet new && cast wallet new'
```

### Fund the devnet wallets

The deployer (`GREENFIELD_TESTNET_ADDRESS`) needs tBNB on **BSC testnet** for
contract deploys + a few cast sends, and on **Greenfield testnet** for the
storage payment. One funded wallet usually covers both:

- BSC testnet faucet: <https://www.bnbchain.org/en/testnet-faucet>
- Greenfield testnet faucet: <https://gnfd-testnet-faucet.bnbchain.org>

Client + Eva need tBNB on BSC testnet only (gas + the 0.001 purchase price).
Fund them from the deployer with the included helper:

```bash
./fund_devnet.sh                          # tops them up to ≥ 0.01 / 0.005 tBNB
CLIENT_AMOUNT=0.05 ./fund_devnet.sh       # override targets
DRY_RUN=1 ./fund_devnet.sh                # show what would be sent
```

The script refuses to fund the public Anvil addresses — that protection is
there to stop you accidentally sending real testnet funds to sweep-bot bait.

### Walk-through

1. `./run_devnet.sh` — wait for deploy + writer to finish (a few minutes;
   `daskibo-devnet-writer` uploads 70+ encrypted objects to Greenfield).
2. Open <http://localhost:8099/course-demo.html>. MetaMask auto-switches to
   **BNB Smart Chain Testnet** (`wallet_addEthereumChain` if needed).
3. Connect as the **Author** (the deployer key) — you'll see course #1 with
   *access ✓* (authors always have access) and a working **"Open course →"**
   link that drops you on `course-view.html`.
4. Switch MetaMask to the **Client** account → catalog row shows ✗ access +
   "Buy for 0.001 ETH". Click → MetaMask opens (because the wallet actually
   has tBNB on BSC testnet) → confirm → soulbound `AccessPass` is minted.
5. Switch to **Eva** → still ✗; the "Open course" attempt is rejected by the
   on-chain check **and** by the Chipotle mock (which re-evaluates the ACC).
6. `course-view.html` — gated mirror of <https://goodmai.github.io/antigravity/lessons/index.html>.
   The 26-card lessons grid is public; clicking a card requires a connected
   wallet that satisfies `hasCourseAccess(you, 1)`. The master key is
   released by the Chipotle mock **once per session** after a `personal_sign`
   proof; subsequent lesson clicks only cost the AES-GCM decrypt.

### Common pitfalls

- **MetaMask "Catalog read failed: could not decode result data"** — the
  page is auto-switching MetaMask to BSC testnet but the network call landed
  before the switch. Reload the tab.
- **"Buy" doesn't open MetaMask** — the wallet has 0 tBNB on BSC testnet, so
  `eth_estimateGas` reverts client-side. Run `./fund_devnet.sh`.
- **`course-view.html` says "addresses.json has no bucket"** — the writer
  hasn't finished yet (it patches the bucket name in after upload). Tail
  `docker logs -f daskibo-devnet-writer` and wait for `DONE — gated course`.
- **`hasCourseAccess` returns false right after a buy** — BSC testnet's
  public RPC sometimes lags one block. Click the catalog **Refresh** button
  or wait ~3 s.

---

## Key files

| File | Purpose |
|------|---------|
| `buckets/crypto-envelope.js` | AES-256-GCM hybrid encrypt/decrypt (DEK + master) |
| `buckets/lit-access.js` | LitClient interface + `createLitAccess()` orchestrator |
| `buckets/lit-sdk-chipotle.js` | Chipotle REST adapter implementing `LitClient` |
| `buckets/lit-sdk.js` | Real Lit Protocol CDN adapter |
| `greenfield-testnet/chipotle-mock.mjs` | Local Chipotle mock server (port 8000) |
| `greenfield-testnet/write-testnet.mjs` | Publish course (no DRM) |
| `greenfield-testnet/write-testnet-chipotle.mjs` | Publish course with Chipotle DRM |
| `bucket-builder.html` | Browser course builder (preview + publish via MetaMask) |
| `bucket-reader.html` | Browser DRM reader (Lit + Chipotle, MetaMask session) |
| [`contracts/src/`](contracts/src/) | Solidity sources: `CourseMarketplace`, `AccessPass`, `Treasury`, `SoulboundAccessNft`→`AuthorNft`/`ClientNft`, `ManifestRegistry` |
| [`contracts/NFT.md`](contracts/NFT.md) | Access-NFT explainer — author/buyer minting, P-A Lit-key storage, claim-signer Lit Action, coverage |
| [`lit-actions/claim-signer.action.js`](lit-actions/claim-signer.action.js) | Decentralized claim-signer Lit Action (PKP, EIP-712) |
| [`../spec/sc.md`](../spec/sc.md) | Smart-contract reference |
| [`../spec/RTM.md`](../spec/RTM.md) | Requirements traceability matrix (req → code → test → doc) |
| [`../spec/CHIPOTLE.md`](../spec/CHIPOTLE.md) | Full Chipotle DRM technical reference |
| [`../spec/TESTING.md`](../spec/TESTING.md) | Test matrix and how to run |
| [`../spec/COMPOSE.md`](../spec/COMPOSE.md) | Docker Compose file reference |
| [`../spec/`](../spec/) | All other specs & design docs (SPEC, AUDIT, sc, RTM, NFT, GREENFIELD, lit, uc, tc, …) |

---

## Environment variables

| Variable | Required for | Description |
|----------|-------------|-------------|
| `GREENFIELD_TESTNET_PRIVATE_KEY` | Flows C, D | Hex private key, funded with testnet BNB |
| `GREENFIELD_TESTNET_ADDRESS` | Flows C, D | Matching 0x address |
| `GF_BUCKET` | optional | Bucket name override (default: auto-generated) |
| `LIT_ALLOWED_ADDRESS` | optional | Extra address to add to ACC |
| `CHIPOTLE_URL` | Flow C/D | Key server URL (default: `http://localhost:8000`) |
| `CHIPOTLE_PKP_KEY` | optional | Hex private key for mock PKP (persists across restarts) |
| `RUN_GREENFIELD_LOCAL` | Flow B test | Set to `1` to run local-chain docker test |
| `DEMO_AUTHOR_PK` / `DEMO_CLIENT_PK` / `DEMO_EVE_PK` | Local demo | Public Anvil keys for the demo personas (import into MetaMask). **No real value — public; will be swept on any public network. Local Anvil only.** |
| `CLIENT_PK` / `CLIENT_ADDRESS` | Devnet (BSC testnet) | Non-public test wallet for the Client persona on BSC testnet. Funded by `fund_devnet.sh`. |
| `EVA_PK` / `EVA_ADDRESS` | Devnet (BSC testnet) | Same idea for the Eve persona. |
| `BSC_TESTNET_RPC` | Devnet | Override BSC testnet RPC (default: `data-seed-prebsc-1-s1.binance.org:8545`). |
| `COURSE_PRICE` | Devnet | Price (wei) of the seeded course on BSC testnet. Default `1000000000000000` (0.001 tBNB). |

Never commit private keys. Use a `.env` file (gitignored).

---

## Infrastructure dependencies

| Tool | Path | Purpose |
|------|------|---------|
| Foundry/anvil | `~/.foundry/bin/anvil` | Local EVM node for Flow B experiments |
| dstack simulator | `~/GitHub/dstack/sdk/simulator/dstack-simulator` | Local TEE emulation for real Chipotle |
| static-web-server | `~/.local/bin/static-web-server` | Serve HTML files locally |
| Chipotle repo | `~/GitHub/chipotle` | Reference implementation + local Lit node |
| dstack repo | `~/GitHub/dstack` | TEE simulator source |

---

# Платформа целиком: акторы, флоу, абстракции, мультичейн

> Этот раздел — каноническое описание продукта: децентрализованная платформа
> обучения с продажей курсов, NFT-доступом и client-side расшифровкой DRM.
> (RU — рабочий язык владельца; технические термины оставлены как есть.)

## Акторы

| Актор | Кошелёк/роль | Что делает |
|---|---|---|
| **Владелец платформы** | деплоер контрактов; identity-кошелёк Chipotle-аккаунта | Деплоит `Treasury`/`AccessPass`/`CourseMarketplace` + NFT-фабрики, владеет Chipotle-аккаунтом (Stripe-кредиты) и Pinata-аккаунтом |
| **Автор курса** | `AuthorNft` (soulbound) | Готовит контент (`lessons/`, `academy/courses/*`), публикует через writer-пайплайн, регистрирует курс в `CourseMarketplace` (цена, hash) |
| **Клиент (студент)** | MetaMask; после покупки — `AccessPass` (soulbound) | `purchase(courseId)` → платёж делится Treasury/автор → минт soulbound `AccessPass` → `hasCourseAccess == true` → расшифровка курса в браузере |
| **Ева (без доступа)** | MetaMask без NFT | Негативный сценарий: подпись не помогает — ACC не выполнен, DRM не отдаёт ключ |
| **Chipotle (Lit v3)** | TEE-нода (Base mainnet) | Хранит PKP, шифрует/выдаёт master key по подписанному proof; замена ему в dev — `chipotle-mock` |
| **Greenfield SP** | BNB Greenfield (1017/5600) | Хранит зашифрованные объекты курса + манифест |
| **Pinata / IPFS** | pinning-сервис | Контент-адресуемое зеркало зашифрованных артефактов (см. ниже) |
| **Сертификат** | soulbound NFT (`ClientNft`/`AccessPass` с expiry=0) | Доказательство прохождения/доступа; выдаётся минтом (P3 — через Lit Action `claim-signer` по EIP-712 Claim) |

## Полный флоу (от создания платформы до чтения курса)

```
0. ПЛАТФОРМА   deploy-multichain.sh (profiles prod/testnets):
               Treasury → AccessPass → CourseMarketplace + ClientNft/AuthorNft
               на каждую цепь (BSC + opBNB); адреса → shared volume + demo/addresses.json
1. ПУБЛИКАЦИЯ  writer (write-mainnet.mjs / write-devnet.mjs → publish-course-run.mjs):
               a. create_wallet у Chipotle → PKP
               b. ACC = hasCourseAccess(:userAddress, courseId) @ gate-chain
               c. planCoursePublish: AES-256-GCM per-lesson DEK → master key
                  → master key шифруется Chipotle под ACC (manifest.lit)
               d. PIN_TO_IPFS=1: все шифрованные объекты → Pinata (CID map
                  внедряется в manifest.ipfsMirror), затем пин самого манифеста
               e. createBucket + saveObject → Greenfield; round-trip проверка
2. ПРОДАЖА     клиент в course-demo.html: MetaMask → purchase(courseId) c msg.value
               → сплит Treasury/автор → минт soulbound AccessPass (expiry)
3. ДОСТУП      bucket-reader/course-view: подпись nonce (personal_sign)
               → Chipotle decrypt: ACC-eval (двухпроходный: timestamp AND,
               address/contract OR; RPC gate-chain) → master key
4. ЧТЕНИЕ      в браузере: master → DEK → AES-GCM расшифровка уроков client-side;
               плейнтекст никогда не покидает вкладку
```

## Паттерны и абстракции (что где менять)

| Абстракция | Файл | Контракт интерфейса |
|---|---|---|
| **LitClient** (DRM) | `buckets/lit-sdk-chipotle.js` (реализация), `buckets/lit-access.js` (обёртка) | `encrypt({acc, dataToEncrypt})` / `decrypt({...}, authContext)` — сменный DRM-бэкенд |
| **ACC-evaluator** (единственный источник истины) | `buckets/lit-acc-eval.js` | `evaluateAcc(acc, user, {ethCall})` — используется mock'ом, адаптером, reader'ом и view; on-chain чтение через инъецируемый `ethCall` |
| **GreenfieldBackend** (storage tx) | `greenfield-testnet/sdk-backend.mjs` (real) / `integration/sp-emulation-backend.js` (тесты) | `createBucket`/`saveObject` — сменный storage-бэкенд |
| **Publish pipeline** | `greenfield-testnet/publish-course-run.mjs` | `resolvePublishEnv(env, target)` + `runPublish(cfg, deps)`; таргеты `testnet`/`mainnet` |
| **IPFS mirror** | `greenfield-testnet/ipfs-mirror.mjs` + `tools/pinata/pinata-client.mjs` | `mirrorPlanObjects` / `pinManifest` с инъецируемым `pin` |
| **Транспорт** | везде | инъецируемый `fetch`-transport → всё тестируется без сети |

## Роль Pinata / IPFS

Pinata пинит **только шифротекст** (мастер-ключ существует лишь в
Chipotle-обёртке внутри манифеста), поэтому публичный IPFS не расширяет
границу доверия DRM. Зачем зеркало:

1. **Отказоустойчивость**: курс читается даже при недоступности Greenfield SP
   (`manifest.ipfsMirror.items[key] → https://<gateway>/ipfs/<cid>`).
2. **Контент-адресация**: CID = криптографический хеш → неизменяемость
   опубликованной версии курса, дешёвая проверка целостности.
3. **Lit Actions**: `tools/pinata/pin.mjs --lit-actions` пинит
   `claim-signer.action.js`; PKP привязывается к IPFS CID кода — подписать
   клейм сертификата может только этот код (P3).
4. **Секреты**: gateway-токен не попадает в артефакты — в манифест пишутся
   token-less URL, читатель добавляет `?pinataGatewayToken` из env.

Env: `PINATA_JWT` (или `PINATA_API_KEY`+`PINATA_API_SECRET`), `PINATA_GATEWAY`,
опц. `PINATA_GATEWAY_KEY`; включение — `PIN_TO_IPFS=1` (в профилях
`prod`/`testnets` включено по умолчанию).

## Ограничения (честный список)

- **Chipotle без тестнета**: единственная живая Lit-сеть — прод на Base
  mainnet; тестнет-профиль всё равно ходит в прод-Chipotle (Stripe-кредиты).
- **ACC enforced app-side**: у Chipotle нет `checkConditions` — timestamp/NFT
  проверяет канонический evaluator на стороне приложения (и mock-сервера).
  Компрометация клиента = компрометация только его собственного доступа.
- **Один gate-chain на курс**: ACC гейтится на одной цепи
  (`NFT_GATING_CHAIN`); мультичейн-покупки требуют per-condition RPC в
  evaluator (задел: `CHAIN_ID_ALIASES`).
- **Клиентская расшифровка**: купивший может сохранить плейнтекст себе — DRM
  защищает дистрибуцию, не скриншоты (фундаментально для client-side E2E).
- **ChainSecured TODO**: управляющие вызовы Chipotle пока через usage
  `X-Api-Key`, а не `*_with_signature` (см. skills/lit §7.4).

## Добавление новой EVM-сети (NFT + маркетплейс)

Автоматизировано скриптом:

```bash
export PRIVATE_KEY=0x…   DEPLOYER_ADDR=0x…       # funded на новой цепи
smartcontracts/scripts/add-evm-chain.sh polygon 137 https://polygon-rpc.com https://polygonscan.com
```

Скрипт: проверит chain-id/баланс → `forge script DeployAccessNfts` (фабрика
soulbound NFT) → `forge script Deploy` (Treasury/AccessPass/Marketplace) →
минт ClientNft деплоеру → `registerCourse` → напечатает чек-лист доводки:

1. `buckets/lit-acc-eval.js`: добавить сеть в `CHAIN_RPCS` + `CHAIN_ID_ALIASES`
   (это единственное место, где reader узнаёт RPC для ACC-проверки);
2. публикация с гейтом на новой цепи: `NFT_GATING_CHAIN=<chainKey>`;
3. `demo/addresses.json` → `chains[]` для фронтенда (MetaMask `ensureChain()`
   переключит сеть сам);
4. (опц.) внести цепь в `scripts/deploy-multichain.sh` (case-блок), чтобы она
   деплоилась профилями `prod`/`testnets`.

Требование к сети: EVM с `eth_call`+EIP-155, поддержка `personal_sign` в
кошельке. Ничего в контрактах менять не нужно — они chain-agnostic.

## Протокол добавления не-EVM сетей (Waves, Canton, …)

Не-EVM цепь не может использовать `eth_call`/EIP-712, поэтому интеграция —
это реализация трёх абстракций (контракты и evaluator расширяются, ядро
пайплайна не меняется):

1. **Идентичность/подпись (authContext).** Сейчас proof = `personal_sign`
   нонса + `ethers.verifyMessage`. Для новой VM нужен адаптер
   `verifyProof(chainNamespace, message, signature) → address/publicKey`:
   - *Waves*: подпись Keeper/WavesKit (curve25519), верификация
     `crypto.verifySignature(pubKey, msg, sig)`, адрес = base58.
   - *Canton*: party-based identity; proof = подписанный command/JWT от
     participant node, «адрес» = party id.
   Точка расширения: `authContext` в `lit-sdk-chipotle.js.decrypt()` и
   `signedProof` в reader'ах — добавить поле `chainNamespace`.
2. **Гейт-предикат (ACC-условие).** Добавить в `lit-acc-eval.js` новый
   `conditionType` (сейчас: `evmBasic` timestamp/address/contract):
   - *Waves*: `assetBalance(address, assetId) >= 1` через Node REST
     (`/assets/balance/{addr}/{assetId}`) — NFT Waves = asset с quantity 1;
   - *Canton*: наличие активного контракта-сертификата у party через
     JSON Ledger API (`/v1/query` по template id).
   Инъекция I/O — как `ethCall`: чистый evaluator + `makeFetchAssetCall`.
   Двухпроходная семантика (timestamp AND / owner OR) сохраняется.
3. **Продажа/минт на стороне цепи.** Порт контрактов:
   - *Waves*: Ride dApp (`purchase` → transfer + issue NFT; soulbound =
     запрет transfer в dApp-скрипте);
   - *Canton*: Daml-шаблоны `Course`, `AccessPass` (signatory = платформа,
     observer = клиент; soulbound естественно — контракты непередаваемы).

Чек-лист интеграции: адаптер подписи → conditionType в evaluator + юнит-тесты
(`tests/lit-acc-eval.test.js`) → Ride/Daml-контракты + их тесты → писатель
передаёт `chain: '<namespace>:<net>'` в ACC → reader выбирает
верификатор по namespace → интеграционный тест по образцу
`tests/publish-pipeline.integration.test.js` с mock-нодой цепи.

Ограничение: Chipotle шифрует/хранит PKP независимо от цепи (он не читает
чужие сети — ACC проверяется app-side), поэтому не-EVM поддержка не требует
изменений на стороне Lit.

## Профили prod / testnets (итоговая шпаргалка)

```bash
# ТЕСТНЕТЫ: BSC 97 + opBNB 5611 (контракты) · GF 5600 (сторадж)
#           REAL Chipotle (DRM) · Pinata (IPFS-зеркало)
docker compose -f smartcontracts/docker-compose.yml --profile testnets up

# ПРОД:     BSC 56 + opBNB 204 · GF mainnet 1017 · REAL Chipotle · Pinata
docker compose -f smartcontracts/docker-compose.yml --profile prod up

# только BSC (без opBNB): DEPLOY_CHAINS=bsc docker compose --profile prod up
```

`.env`: `GREENFIELD_TESTNET_*` / `GREENFIELD_MAINNET_*` + `PROD_DEPLOYER_KEY/_ADDR`,
`CHIPOTLE_API_KEY` (Stripe-funded!), `PINATA_JWT`, `PINATA_GATEWAY`.
Балансы и что пополнять — см. `review.md` §3 (аудит 2026-07-06).
