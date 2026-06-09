---
name: lit
description: Интеграция Lit Protocol и Chipotle DRM в проекте Antigravity. Используйте этот skill для настройки шифрования на стороне клиента, конфигурации Access Control Conditions (ACC), развертывания и тестирования Chipotle Mock/Live TEE серверов, а также отладки криптографических сессий.
---

# Lit Protocol & Chipotle DRM Integration Handbook

Этот справочник содержит стандарты, архитектурные шаблоны и руководства по интеграции **Lit Protocol** и его TEE-альтернативы **Chipotle DRM** в экосистему Antigravity. Инструмент используется для шифрования курсов и медиа-контента, сохраняемых в BNB Greenfield, с ограничением доступа на базе владения NFT или результатов вызова смарт-контрактов.

---

## 1. Архитектура DRM-шифрования (Split-Key Encryption)

В целях масштабируемости и производительности в проекте не шифруется весь файл через Lit. Вместо этого применяется гибридная схема **Envelope Encryption**:

1. **Симметричное шифрование (AES-GCM)**: Большой файл (видео, текст урока) шифруется случайным 256-битным ключом (Master Key) локально на клиенте с помощью [crypto-envelope.js](file:///home/g/projects/antigravity/smartcontracts/buckets/crypto-envelope.js).
2. **Асимметричное шифрование ключа (Lit/Chipotle)**: Случайный Master Key шифруется в сети Lit/Chipotle под условия доступа (**Access Control Conditions - ACC**). Полученный шифр (ciphertext) и метаданные сохраняются в публичном файле `manifest.lit.json` в Greenfield.
3. **Дешифрование на лету**: Когда авторизованный пользователь (удовлетворяющий ACC) запрашивает доступ, сеть Lit/Chipotle восстанавливает Master Key. Клиент расшифровывает контент прямо в браузере.

### Выбранный DRM-слой проекта: Chipotle (Lit v3)

> [!IMPORTANT]
> **Проект использует Chipotle (Lit v3, generally available).** Хронология сетей
> Lit (сверено июнь 2026 по [docs.dev.litprotocol.com](https://docs.dev.litprotocol.com/)
> и блогу [Naga Network Sunset & Lit v3 Transition](https://spark.litprotocol.com/naga-network-sunset/)):
> - **Datil (Lit v0)** — `datil`/`datil-test`/`datil-dev` **отключены 2026-02-25**;
> - **Naga (Lit v1)** — кратко существовала (mainnet + Naga-testnet, SDK **v8**),
>   но **полностью свёрнута 2026-04-01** (chain halted 03-25, full sunset 04-01);
> - **Chipotle (Lit v3)** — **generally available**, ground-up rebuild, REST/HTTP
>   поверх TEE на Phala, **SDK не требуется** → это таргет проекта.
>
> Итого на июнь 2026 **живых децентрализованных P2P-сетей Lit нет**; и Datil, и
> Naga мертвы. Везде, где в доках/коде упоминается `datil*` или Naga/`v8 SDK`, это
> **исторический/устаревший** контекст.
>
> ⚠️ **У Lit БОЛЬШЕ НЕТ ТЕСТНЕТОВ.** Публичных тестовых сетей не осталось (Datil
> закрыт 2026-02-25, Naga свёрнута 2026-04-01, Chipotle живёт только на
> **Base mainnet**). Доступны ровно **два режима**:
> 1. **Локальная сборка** (дефолт для dev/devnet/CI, без реальных средств) — два варианта:
>    - **полный локальный TEE** — реальный Chipotle (dstack-sim + `chipotle-real`) +
>      локальный Greenfield + деплой NFT: наш композ
>      [`smartcontracts/docker-compose.lit.yml`](file:///home/g/projects/antigravity/smartcontracts/docker-compose.lit.yml),
>      запуск [`./run_e2e_lit.sh`](file:///home/g/projects/antigravity/run_e2e_lit.sh) (Flow C, чистый genesis);
>    - **лёгкий mock** — `chipotle-mock` (`:8000`) из
>      [`smartcontracts/docker-compose.yml`](file:///home/g/projects/antigravity/smartcontracts/docker-compose.yml)
>      (профили `local`/`testnet`) / [`greenfield-testnet/chipotle-mock.mjs`](file:///home/g/projects/antigravity/smartcontracts/greenfield-testnet/chipotle-mock.mjs).
> 2. **Mainnet** — реальный Chipotle REST (`api.chipotle.litprotocol.com`, Base 8453) +
>    нативная Lit Chain **175200**. Для прода. **Фондирование аккаунта — только Stripe**
>    (`/billing/create_payment_intent` → `confirm_payment`, мин **$5.00**; баланс
>    `/billing/balance`). Токен **$LITKEY API НЕ оплачивает** (это токен протокола;
>    «litkeys»-баланс был у мёртвого Naga). Ключ из `POST /new_account` → `CHIPOTLE_API_KEY`.
>
> Промежуточного «тестнета Lit» больше не существует — см. §7.

| Параметр | Chipotle **mainnet** (Lit v3) | Chipotle **локально** (mock / dstack-sim) | ~~Lit Datil / тестнеты~~ |
| :--- | :--- | :--- | :--- |
| **Среда выполнения** | REST/HTTP поверх **TEE на Phala** | mock: Node.js `crypto.subtle` · dstack-sim: локальный TEE | ~~децентрализованная P2P~~ |
| **Порты / endpoint** | HTTPS, `api.chipotle.litprotocol.com/core/v1/` | локальный `:8000` | ~~порт 7470 P2P~~ |
| **Режим** | **Production** (Base 8453) | **Dev / CI / e2e** | ~~больше не существует~~ |
| **Compose / запуск** | [`docker-compose.mainnet-lit.yml`](file:///home/g/projects/antigravity/smartcontracts/docker-compose.mainnet-lit.yml) (real Chipotle@Base + BSC/GF testnets) · `write-*.mjs` | [`docker-compose.lit.yml`](file:///home/g/projects/antigravity/smartcontracts/docker-compose.lit.yml)→`./run_e2e_lit.sh` · [`docker-compose.devnet.yml`](file:///home/g/projects/antigravity/smartcontracts/docker-compose.devnet.yml) (BSC+GF testnets + Chipotle mock) | — |
| **Конфигурация** | `lit-sdk-chipotle.js` | `lit-sdk-chipotle.js` | ~~`lit-sdk.js`~~ |

---

## 2. Спецификация файлов и компонентов

Интеграция Lit сосредоточена в каталоге [smartcontracts/buckets/](file:///home/g/projects/antigravity/smartcontracts/buckets/):

- **[lit-access.js](file:///home/g/projects/antigravity/smartcontracts/buckets/lit-access.js)** — Ядро абстракции доступа. Не зависит от окружения (DOM-free), оркеструет вызовы шифрования/дешифрования симметричного ключа.
- **[lit-sdk-chipotle.js](file:///home/g/projects/antigravity/smartcontracts/buckets/lit-sdk-chipotle.js)** — Адаптер для взаимодействия с Chipotle (Mock или Live) через REST API. Имитирует проверку условий ACC локально или в TEE.
- **[lit-sdk.js](file:///home/g/projects/antigravity/smartcontracts/buckets/lit-sdk.js)** — ⚠️ устаревший адаптер P2P-сети Lit `datil` (отключена 2026-02-25). Оставлен как референс; для нового кода использовать `lit-sdk-chipotle.js`.
- **[lit-acc.js](file:///home/g/projects/antigravity/smartcontracts/buckets/lit-acc.js)** — Конструктор Access Control Conditions для проверок баланса NFT (`ERC721`) и вызовов маркетплейса (`hasCourseAccess`).

---

## 3. Схема данных манифеста (`manifest.lit.json`)

Каждая зашифрованная лекция или курс сопровождается публичным JSON-манифестом:

```json
{
  "schema": "daskibo.lit.acc/1",
  "chain": "ethereum",
  "litNetwork": "chipotle",
  "chipotleUrl": "http://localhost:8000",
  "pkpId": "0x71e835aff094655dEF897fbc85534186DbeaB75d",
  "accessControlConditions": [
    {
      "contractAddress": "0xD10606538519464999C57C415E956491e2345678",
      "functionName": "hasCourseAccess",
      "functionParams": [":userAddress", "42"],
      "standardContractType": "",
      "chain": "ethereum",
      "returnValueTest": {
        "key": "",
        "comparator": "==",
        "value": "true"
      }
    }
  ],
  "ciphertext": "base64iv:ciphertext_payload",
  "dataToEncryptHash": "sha256_hash_of_plaintext_key"
}
```

---

## 4. Диагностика и отладка (RCA)

Интеграция с криптографическими протоколами часто подвержена тонким ошибкам подписи, несоответствию форматов JSON, регистрам адресов или блокировкам портов. 

> [!IMPORTANT]
> Для быстрого устранения возникших проблем при интеграции Lit, проверке EIP-712 подписей и отладке смарт-контрактов всегда обращайтесь к специализированному реестру:
> 👉 **[Справочник Bug Hunter (RCA Register)](file:///home/g/projects/antigravity/skills/bughunter/SKILL.md)**

### Ключевые рекомендации при работе с Lit/Chipotle:
1. **Case-Sensitivity в EVM адресах**: Всегда проверяйте регистр адресов в условиях ACC и в метаданных вызовов. Выполняйте `.toLowerCase()`, чтобы избежать сбоев сверки подписей в TEE и Go-нодах.
2. **Readiness смарт-контрактов**: Перед передачей адреса контракта в Lit ACC, убедитесь, что он полностью развернут и инициализирован. Вызов неинициализированного контракта с `revert` сломает флоу проверки прав в Lit ноде (см. `BUG-001`).
3. **Проверка RPC**: Chipotle-клиент выполняет реальные JSON-RPC вызовы на указанный в `ANVIL_RPC` адрес для сверки `balanceOf` и `hasCourseAccess`. Убедитесь, что Anvil/Geth запущен и доступен из контейнера Chipotle.
4. **Seal-латентность Greenfield ≠ ошибка ACC**: дешифрование сначала **читает** `manifest.lit.json` и `.enc` из Greenfield. На локальном стеке объект запечатывается асинхронно (~100–110 с после `putObject`), поэтому чтение сразу после публикации даёт `not sealed`/404 — это не отказ доступа. Читайте с ретраем (`readObjectWithRetry`), и только после успешного чтения шифртекста зовите Lit. Различайте `404/not sealed` (объект ещё не готов, BUG-012) и `ACCESS_DENIED` (ACC реально не выполнен).

---

## 5. Пошаговый сценарий запуска интеграционных тестов

Скрипт `./run_e2e_lit.sh` выполняет полный цикл интеграции на **чистом genesis**:
он сам делает `docker compose down -v`, патчит SDK (`patch_sdk.cjs`) и поднимает
стек с **реальным 7-SP gnfd-sp** (а не mock) — см. раздел «Локальный SP-стек» в
[Greenfield Skill](../greenfield/SKILL.md).

```bash
# 1. Запуск тестового стенда (SKIP_CLEANUP=1 — не сносить стек после прогона)
SKIP_CLEANUP=1 ./run_e2e_lit.sh

# 2. Логирование выполнения тестов e2e-lit
tail -f logs/e2e-lit-run.log

# 3. Очистка окружения (при необходимости)
docker compose -f smartcontracts/docker-compose.lit.yml down -v --remove-orphans
```

> [!NOTE]
> Готовность стека упирается в SP, а не в Lit: контейнер `greenfield-local`
> становится `healthy` только по sentinel `/tmp/sp_ready` (`start_period 240s`) —
> цепочка + GVG + MariaDB + 7 SP. Затем e2e ещё ждёт seal'а объектов (~100 с), так
> что первый зелёный прогон с холодной сборкой образа занимает ~8–12 мин. Валидируйте
> всегда из чистого состояния, не переиспользуя устаревший контейнер.

Эталонный прогон — 10 шагов из `run-e2e-lit-nft.mjs`: register → encrypt → publish →
Bob (до покупки) DENIED → purchase → Bob (активная подписка) ALLOWED → soulbound
transfer revert → после истечения DENIED → Eve DENIED. Ожидаемый результат — Exit Code 0.

---

## 6. Каталог юзеркейсов Lit (из официальных доков и SDK)

Выжимка из официальных источников Lit Protocol (см. ссылки внизу), переложенная на
Daskibo. Колонка «В проекте» помечает: ✅ уже реализовано · 🔜 прямое расширение
текущего кода · 💡 идея для роадмапа. Не путать с `UC-03..UC-13` из
[uc.md](../../spec/uc.md) — там продуктовые сценарии, здесь — capability-каталог Lit.

### 6.1 Возможности SDK (`@lit-protocol/*`)

`@lit-protocol/js-sdk` — это набор пакетов, а не один модуль. Какие из них уже
задействованы и какие открывают новые сценарии:

| Пакет | Что даёт | В проекте |
| :--- | :--- | :--- |
| `lit-node-client` (isomorphic) | `connect()`, `encryptString`, `decryptToString`, `getSessionSigs` | ✅ [lit-sdk.js](file:///home/g/projects/antigravity/smartcontracts/buckets/lit-sdk.js) |
| `encryption` | threshold encrypt/decrypt под ACC | ✅ обёртка master-key в [lit-access.js](file:///home/g/projects/antigravity/smartcontracts/buckets/lit-access.js) |
| `auth-helpers` | SIWE + `generateAuthSig`, `LitActionResource` | ✅ session sigs (browser + serverside) |
| `constants` | `LIT_ABILITY`, `LIT_CHAINS`, сети | ✅ |
| `pkp-ethers` / wrapped-keys | PKP-кошелёк подписывает EVM-tx по политике | 💡 gasless/PKP-минт пропусков |
| `lit-actions` | произвольная JS-политика на нодах (code hash/IPFS) | 💡 кроссчейн/off-chain политика |

> ⚠️ Эти пакеты — про **P2P-сети Datil** (`datil`/`datil-test`/`datil-dev`),
> **отключённые 2026-02-25**. Проект перешёл на **Chipotle (Lit v3)** — REST/HTTP,
> SDK не требуется (`lit-sdk-chipotle.js`). Таблица оставлена как историческая
> карта возможностей; новый код на Chipotle, см. §7.3.

### 6.2 Юзеркейсы (Lit JS SDK examples + CeramicIntegration)

**LIT-UC-01 — Шифрованный курс, гейт по on-chain состоянию** (база Daskibo). ✅
Master-key шифруется под ACC, контент лежит в Greenfield, ключ выдаётся только
прошедшим проверку. Daskibo гейтит на `CourseMarketplace.hasCourseAccess` или
soulbound `ClientNft.balanceOf` (см. [lit-acc.js](file:///home/g/projects/antigravity/smartcontracts/buckets/lit-acc.js), `write-devnet.mjs`).
Зеркало примера *«Minting HTML NFTs — locked content only the NFT owner can decrypt»*.

**LIT-UC-02 — Гейт всего фронтенда/раздела по Lit JWT** (*Gating Dynamic React
Content*). 🔜 Сейчас гейтится отдельный объект; тот же ACC можно применить к целой
секции academy — закрыть курс/трек, проверяя `AccessPass`/`ClientNft` один раз на
входе вместо per-object decrypt.

**LIT-UC-03 — Serverside-only выдача доступа** (*Serverside-Only SDK Usage* +
*Serverside AuthSig Creation*). ✅/🔜 Publisher уже работает без браузера
(`write-testnet-lit.mjs`, `write-devnet.mjs`, `sdk-backend.mjs`) — encrypt идёт
serverside. Расширение: серверный re-wrap/выдача ключа по событию `Purchase` без
MetaMask (AuthSig из приватного ключа оператора).

**LIT-UC-04 — Защита произвольного URL / видео-стрима** (*Cloudflare Worker URL
Protection*, *Video/Livestream Gating*). 💡 Для платных вебинаров: гейтить HLS/URL
лекции тем же `hasCourseAccess`-ACC через edge-воркер, не перешифровывая весь поток.

**LIT-UC-05 — Зашифрованная «БД» поверх Ceramic, гейт по ACC** (*CeramicIntegration*).
💡 Ceramic публичен (нет read-permission) — Lit добавляет слой доступа. API репо:
`new Integration(ceramicRpcUrl, chain)` → `encryptAndWrite(data, acc)` → `streamID`;
`readAndDecrypt(streamID)`. Для Daskibo: прогресс/оценки/приватный профиль студента
как serverless-DB, где decrypt доступен только держателю `AccessPass` или DAO-роли —
ровно паттерн из доки *«only DAO members can decrypt the data stored in Ceramic»*.
Тот же `accessControlConditions`-формат, что и у нашего Greenfield-флоу, → ACC
переиспользуемы между Greenfield и Ceramic.

**LIT-UC-06 — PKP-кошелёк как программируемый подписант** (`pkp-ethers` + Lit Actions).
💡 Gasless-онбординг из роадмапа (G2/G3): PKP минтит `ClientNft`/платит газ по
политике Lit Action (проверка оплаты/allowlist), студенту не нужен seed-phrase.

**LIT-UC-07 — Кроссчейн-политика через Lit Action** (boolean ACC + Lit Actions).
🔜 Уже описано в [lit-crosschain.md](../greenfield/references/lit-crosschain.md):
`hasCourseAccess` на BSC **OR** `balanceOf` NFT на Base/Ethereum; Lit Action
нормализует состояние нескольких сетей и подписывает scoped-capability.

### 6.3 Что переиспользовать при реализации

- ACC-конструкторы — только через [lit-acc.js](file:///home/g/projects/antigravity/smartcontracts/buckets/lit-acc.js) (`addressAllowlistAcc`, `tokenBalanceAcc`, `anyOf`/`allOf`); флэш-лоан-каузат уже учтён.
- Любой новый носитель (Ceramic, URL-воркер) должен принимать тот же объект `accessControlConditions`, что и Greenfield-манифест — это сохраняет единый формат ACC и tamper-check (`conditionsHash`).
- Для serverless-сценариев — паттерн `sdk-backend.mjs` (CJS-require тяжёлых SDK) и `createLitAccess` с `chain`, совпадающим с сетью гейт-контракта.

### Официальные источники

- Lit JS SDK (монорепо пакетов): https://github.com/LIT-Protocol/js-sdk
- Примеры/туториалы: https://developer-dev.litprotocol.com/docs/examples/
- Ceramic + Lit (зашифрованная децентрализованная БД): https://github.com/LIT-Protocol/CeramicIntegration

---

## 7. Краны, доки и Discord-канал

### 7.1 Канонические web-источники (предпочитать всегда)

| Что | URL | Примечание |
| :--- | :--- | :--- |
| **Chipotle REST API** ✅ верифиц. | `https://api.chipotle.litprotocol.com/core/v1/` | каноничный base-URL; 42 пути; публичные ручки отдают 200 |
| Chipotle Swagger / OpenAPI | `…/core/v1/swagger-ui` · `…/core/v1/openapi.json` | `lit-api-server` 0.1.0 |
| Chipotle chain config | `GET …/core/v1/get_node_chain_config` | `{chain:"Base", chain_id:8453, testnet:false, contract:0xaAaAA9120fE271F653cfDb6bf400dB93D2DEa7Aa}` — ChainSecured Diamond (EIP-2535) на **Base mainnet** |
| **Lit mainnet chain** (Chronicle) | RPC `https://lit-chain-rpc.litprotocol.com` · explorer `https://lit-chain-explorer.litprotocol.com` | **chain id 175200**; нативная L2-цепь Lit (PKP/контракты Lit) |
| **Документация (каноничная)** ✅ | https://docs.dev.litprotocol.com/ | актуальные доки Chipotle / Chain-Secured TEE |
| Блог: переход на v3 | https://spark.litprotocol.com/naga-network-sunset/ | даты sunset Naga (full 2026-04-01) и переход на Chipotle |
| Phala TEE chain-of-trust | https://docs.phala.com/phala-cloud/attestation/chain-of-trust | модель доверия Chipotle prod |
| ❌ `api.dev.litprotocol.com` | — | **мёртв** (TLS altname mismatch) — НЕ использовать |
| ⚠️ Naga docs (legacy) | naga.developer.litprotocol.com | доки **свёрнутой** сети Naga (v1, sunset 2026-04-01) — не для нового кода; канон — docs.dev |
| ❌ Yellowstone faucet / Datil | chronicle-yellowstone-faucet… | P2P-сети Lit (Datil) закрыты 2026-02-25 |

> Auth Chipotle: `X-Api-Key`/`Bearer` (managed-аккаунт) **или** wallet-подпись
> (ChainSecured, `*_with_signature`). Оплата — Stripe-кредиты (`/billing/*`) / x402;
> **бесплатного тестнета у Chipotle нет** (он на Base mainnet). Две разные цепи:
> **Base 8453** (реестр аккаунтов/PKP Chipotle) и **Lit Chain 175200** (нативная L2 Lit).
> Для devnet (`run_devnet.sh`) нужен tBNB на BSC testnet + Greenfield testnet; DRM —
> Chipotle REST (не P2P).

### 7.2 Discord-сервер Lit через MCP (`lit-discord`)

`896185694857343026` — это **guild (сервер) "Lit Protocol"**, не канал. Для поиска
свежих кранов/анонсов/доков подключён локальный MCP-сервер
[`tools/discord-lit-mcp`](file:///home/g/projects/antigravity/tools/discord-lit-mcp/README.md),
зарегистрированный в [`.mcp.json`](file:///home/g/projects/antigravity/.mcp.json).
Дефолтный канал — `#💻-dev-support` (`1100139039241277470`, forum).

Полезные каналы guild'а: `#🖇-dev-links` (`1100315123429675019`),
`#📣-announcements` (`986025330437410887`), `#💻-dev-support` (форум),
`#lit-actions-and-pkp-devs` (`1036376595738394725`), `#👷-lit-builder`
(`1374140878813397112`). `#📇-tech-support` — закрыт (403 для текущего аккаунта).

Инструменты (только чтение):
- `list_channels()` — текстовые/анонс/форум каналы сервера;
- `read_messages(channel?, limit?, before?, after?)` — сообщения; для форума отдаёт треды;
- `read_thread(thread, limit?)` — сообщения одного треда/поста;
- `search_messages(query, channel?, max?)` — поиск по ключу (форум сканится по заголовкам+стартовым сообщениям тредов).

Запуск: `DISCORD_USER_TOKEN` в окружении Claude Code; один раз
`cd tools/discord-lit-mcp && npm install`. Guild/канал переопределяются через
`LIT_DISCORD_GUILD_ID` / `LIT_DISCORD_CHANNEL_ID`.

> [!WARNING]
> Сервер использует **личный user-токен (self-bot)** — иначе чужой Lit-сервер не
> прочитать. Это **нарушает Discord ToS** и грозит баном аккаунта; выбор сделан
> владельцем осознанно. Токен берётся только из env, в репозиторий не пишется.
> ToS-чистая альтернатива — bot-токен + приглашение бота на свой сервер.

Рабочий паттерн: `search_messages("faucet")` → взять свежую ссылку → **сверить с
канонической** из §7.1 (не доверять случайной ссылке из чата вслепую — фишинг
кранов распространён).

### 7.3 ⚠️ Актуальность сетей (вычитано из #announcements / #dev-support, 2026)

> [!CAUTION]
> **Datil (Lit v0) ОТКЛЮЧЕНА 2026-02-25; Naga (Lit v1) ПОЛНОСТЬЮ СВЁРНУТА
> 2026-04-01.** Анонсы: Datil — `#announcements` (2026-02-03) *«Lit v0 (Datil
> network) is going to be shut down on 2/25»*; Naga — блог
> [Naga Network Sunset & Lit v3 Transition](https://spark.litprotocol.com/naga-network-sunset/)
> (chain halted 03-25, full sunset **04-01**). Значит ни `datil*`, ни Naga больше
> не живут. Это ломает любой код, дефолтящий на Datil/Naga:
> - [lit-sdk.js](file:///home/g/projects/antigravity/smartcontracts/buckets/lit-sdk.js) (`network='datil-test'`)
> - `write-testnet-lit.mjs`, `write-devnet.mjs` (`datil-dev`)
>
> **Выбор проекта — Chipotle (Lit v3), generally available.** Таргетим Chipotle:
> - **Chipotle (Lit v3)** — GA (анонс 2026-04-07, *«now generally available»*):
>   ground-up rebuild, REST/HTTP поверх TEE на Phala, **SDK не требуется** (у Naga
>   был SDK v8 — теперь неактуален). В проекте уже есть адаптер
>   [lit-sdk-chipotle.js](file:///home/g/projects/antigravity/smartcontracts/buckets/lit-sdk-chipotle.js) (`/core/v1/lit_action`).
> - Base-URL (✅ верифицирован 2026-05-26) — `https://api.chipotle.litprotocol.com/core/v1/`
>   (42 пути, Swagger/OpenAPI там же). ⚠️ `api.dev.litprotocol.com` мёртв (TLS). Chipotle
>   на **Base mainnet 8453** (отдельного тестнета нет); нативная Lit Chain — **175200**
>   (RPC `lit-chain-rpc`, explorer `lit-chain-explorer`). См. таблицу §7.1.
> - В Chipotle **`checkConditions` удалён** из Lit Actions → ACC проверяется на
>   стороне приложения (адаптер уже делает: ethers → RPC сети контракта).
> - `signAsAction` **deprecated** (`#dev-support` 2026-03-10) → создать wallet в
>   Chipotle и привязать к одному action.
>
> **Вывод для devnet:** в `write-devnet.mjs` Lit-слой надо перевести с `datil-dev`
> на Chipotle (`createChipotleClient`, `CHIPOTLE_URL=https://api.chipotle.litprotocol.com`),
> а ACC-проверку при decrypt направить на **RPC BSC testnet** (не anvil). Сверять
> актуальное состояние через `search_messages` по `#announcements`/`#dev-support`.

### 7.4 Авторизация Chipotle: **ChainSecured** (on-chain) + usage API key + Stripe

Модель доступа Chipotle гибридная (по офиц. описанию ChainSecured):

| Слой | Чем авторизуется |
| :--- | :--- |
| **Идентичность аккаунта** | **кошелёк = identity** (ChainSecured). Аккаунт — **ончейн-сущность** на Base (наш INIT_TX `0x0ffe…` создал её на Diamond `0xaAaAA9…`). |
| **Управляющие writes** (создание аккаунта/PKP/usage-ключей) | **on-chain транзакции, подписанные кошельком** — `*_with_signature` (`create_wallet_with_signature`, `add_usage_api_key_with_signature`, `convert_to_chain_secured_account`). |
| **Action runs** (`/lit_action`, encrypt/decrypt) | **usage API key** из аккаунта → заголовок `X-Api-Key`. ⚠️ Это ключ **для теста/исполнения**, не для управления. (Тест-ключ владельца лежит в gitignored `.env` → `CHIPOTLE_API_KEY`.) |
| **Фондирование** | по-прежнему **billing аккаунта = Stripe** (мин $5), независимо от ChainSecured. |

> [!IMPORTANT]
> **TODO — ChainSecured on-chain identity.** Сейчас `write-devnet.mjs` /
> `docker-compose.mainnet-lit.yml` используют только **usage API key**
> (`X-Api-Key`) для всех вызовов — этого хватает для **action runs** (тест), но
> **управляющие writes должны идти ончейн-подписью кошелька** (`*_with_signature`),
> где кошелёк = identity аккаунта. Нужно:
> 1. развести в writer два пути: PKP/wallet provisioning → `create_wallet_with_signature`
>    (подпись кошельком), `/lit_action` → usage `X-Api-Key`;
> 2. использовать существующую ончейн-сущность владельца (Base `0xaAaAA9…`), а не
>    создавать managed-аккаунт;
> 3. usage API key трактовать как тест-credential (ротация), не как identity.

### 7.5 Децентрализованный claimSigner через Lit Action + PKP (P3)

Вместо доверенного сервера, держащего `claimSigner`-ключ, подпись EIP-712 `Claim`
для минта `ClientNft`/`AuthorNft` делает **Lit Action** с **PKP**:

- Action ([`lit-actions/claim-signer.action.js`](file:///home/g/projects/antigravity/smartcontracts/lit-actions/claim-signer.action.js))
  исполняется в Lit/Chipotle, читает `CourseMarketplace.hasCourseAccess(to, courseId)`
  на BSC и подписывает клейм **только если покупатель реально оплатил**.
- PKP-ключ не существует off-chain; action запинен по **IPFS CID**, PKP привязан к
  этому CID → подписать может только этот код. `nft.setClaimSigner(pkpAddress)`
  делает action единственным минтером.
- EIP-712 digest строится одинаково в action и в [`buckets/claim-eip712.js`](file:///home/g/projects/antigravity/smartcontracts/buckets/claim-eip712.js)
  (байт-в-байт с `_CLAIM_TYPEHASH` контрактов). Юнит-тест sign→recover —
  [`tests/claim-eip712.test.js`](file:///home/g/projects/antigravity/tests/claim-eip712.test.js).
  Сам action проверяется только в Chipotle-рантайме (`run_e2e_lit.sh`).
- Детали и сетап — [`lit-actions/README.md`](file:///home/g/projects/antigravity/smartcontracts/lit-actions/README.md).

---

## 8. Построение ACC: `createAccBuilder` (EVM / не-EVM / Lit Actions)

Официальный типобезопасный fluent-builder из **`@lit-protocol/access-control-conditions`**
собирает **унифицированные ACC** для гетерогенных сетей (EVM, Solana, Cosmos) и
Lit Actions. Это рекомендуемая альтернатива ручной сборке JSON и более мощная, чем
in-repo [lit-acc.js](file:///home/g/projects/antigravity/smartcontracts/buckets/lit-acc.js)
(тот покрывает только простые EVM-кейсы: `addressAllowlistAcc`/`tokenBalanceAcc`/`anyOf`/`allOf`).

```bash
npm install @lit-protocol/access-control-conditions
```

**Правила сборки:**
- После каждого EVM-хелпера **обязателен `.on(chain)`** (`'ethereum'`, `'polygon'`,
  `'bsc'`, `'bscTestnet'`, `'base'`…). Исключение — `requireLitAction()` (исполняется
  на нодах Lit, цепь не нужна).
- Логику комбинируют `.and()` / `.or()`; терминальный `.build()` → сырой массив ACC.
- `validate()` — статическая проверка цепочки (двойные операторы, забытый `.on()`,
  пустой билдер) на этапе разработки; `humanize()` → человекочитаемое описание для UI.

### 8.1 Методы по экосистемам

| Группа | Методы |
| :--- | :--- |
| **EVM** (далее `.on(chain)`) | `requireEthBalance(amount,cmp?)`, `requireTokenBalance(addr,amount,cmp?)` (ERC-20), `requireNftOwnership(addr,tokenId?)` (ERC-721/1155), `requireWalletOwnership(addr)`, `requireTimestamp(ts,cmp?)`, `requireDAOMembership(dao)` (MolochDAOv2.1), `requirePOAPOwnership(eventId)` |
| **Solana** | `requireSolBalance(amount,cmp?)`, `requireSolNftOwnership(collection)`, `requireSolWalletOwnership(addr)` |
| **Cosmos** | `requireCosmosBalance(amount,cmp?)`, `requireCosmosWalletOwnership(addr)`, `requireCosmosCustom(path,key,value,cmp?)` |
| **Lit Action** | `requireLitAction(ipfsCid, method, params[], expectedValue, cmp?)` — кастомная/внечейн-валидация на нодах Lit |
| **Raw / unified** | `unifiedAccs(obj)`, `evmBasic(p)`, `evmContract(p)`, `solRpc(p)`, `cosmos(p)` |
| **Логика / терминал** | `and()`, `or()`, `build()`, `validate()`, `humanize()` |

### 8.2 Применение в Daskibo

```ts
import { createAccBuilder } from '@lit-protocol/access-control-conditions';

// (A) Доступ по soulbound ClientNft на BSC testnet — owner-bound, не флэш-лоанится
const acc = createAccBuilder()
  .requireNftOwnership(CLIENT_NFT_ADDR).on('bscTestnet')
  .build();

// (B) Кросс-чейн OR: курс куплен на BSC (NFT) ИЛИ комьюнити-коллекция на Base
const acc = createAccBuilder()
  .requireNftOwnership(CLIENT_NFT_ADDR).on('bscTestnet')
  .or()
  .requireNftOwnership(COMMUNITY_NFT_ADDR).on('base')
  .build();

// (C) Кросс-чейн не-EVM: NFT на BSC testnet ИЛИ коллекция на Solana
const acc = createAccBuilder()
  .requireNftOwnership(CLIENT_NFT_ADDR).on('bscTestnet')
  .or()
  .requireSolNftOwnership(SOL_COLLECTION_ADDR)
  .build();
```

### 8.3 Оговорки для нашего стека

- **Flash-loan (Audit 3.2 / [lit-acc.js](file:///home/g/projects/antigravity/smartcontracts/buckets/lit-acc.js) header).** Для платного контента предпочитать `requireWalletOwnership` (равенство адреса — не флэш-лоанится) или **soulbound** NFT (`AuthorNft`/`ClientNft`), а не спот-`requireTokenBalance`/`requireNftOwnership` на **трансферимых** токенах.
- **Chipotle (Lit v3): `checkConditions` удалён** — ACC внутри TEE не проверяется. Поэтому в нашем флоу builder используется для **конструирования/`validate`/`humanize`** ACC, попадающих в `manifest.lit`, а фактический гейтинг делает наш адаптер app-side (ethers → RPC сети контракта; см. [lit-sdk-chipotle.js](file:///home/g/projects/antigravity/smartcontracts/buckets/lit-sdk-chipotle.js)). Программируемый кросс-чейн-путь, исполняемый именно на нодах Lit, — через `requireLitAction` (CID + метод).
- **Совпадение chain id.** `.on('bscTestnet')` должен соответствовать сети, где реально задеплоен контракт (наши `ClientNft`/`CourseMarketplace` — BSC testnet 97); cross-ref [lit-crosschain.md](../greenfield/references/lit-crosschain.md).
- **Связь с in-repo.** `lit-acc.js` остаётся лёгким путём для простых EVM-ACC; `createAccBuilder` берём, когда нужны **Solana/Cosmos/Lit Actions/мульти-чейн** или `humanize()` для UI.

---

## 9. Ceramic + Lit — приватная децентрализованная БД

Источник: **[LIT-Protocol/CeramicIntegration](https://github.com/LIT-Protocol/CeramicIntegration)**.
Паттерн (тот же envelope, что у нас в Greenfield, но носитель — Ceramic).

**Зачем.** Ceramic — публичная децентрализованная БД потоков (streams), но **без
read-permissions: всё содержимое публично**. Lit добавляет слой шифрования/доступа:
данные шифруются под ACC, расшифровать может только тот, кто условиям удовлетворяет.
Каноничный кейс из репо — *«БД для DAO, где расшифровать данные могут только члены
DAO»*.

**Архитектура (три слоя):**

```text
encryptAndWrite(data, ACC) ──► Lit threshold-encrypt под ACC
                           ──► ciphertext кладётся в Ceramic stream → streamID
readAndDecrypt(streamID)   ──► читает stream → Lit отдаёт ключ, если ACC выполнен
                           ──► plaintext
```

**API (TypeScript, браузерный — нужен `window`):**

| Метод | Сигнатура | Возврат |
| :--- | :--- | :--- |
| конструктор | `new Integration(ceramicRpcUrl, chain)` | экземпляр |
| init | `startLitClient(window)` | — |
| запись | `encryptAndWrite(stringToEncrypt, accessControlConditions, conditionType?)` | Ceramic `streamID` |
| чтение | `readAndDecrypt(streamID)` | расшифрованная строка |

`conditionType` поддерживает `'evmContractConditions'` — т.е. гейтинг по нашему
`CourseMarketplace.hasCourseAccess` / soulbound NFT кладётся напрямую.

**Применение в Daskibo.** Ceramic как **serverless-БД приватных данных студента**
(прогресс, оценки, приватный профиль), где `readAndDecrypt` доступен только держателю
`AccessPass`/`ClientNft` или роли — тем же `accessControlConditions`, что и в
Greenfield-манифесте (ACC переиспользуются между Greenfield и Ceramic). См.
[LIT-UC-05](#62-юзеркейсы-lit-js-sdk-examples--ceramicintegration).

> [!WARNING]
> Репозиторий **легаси**: использует старый **браузерный Lit JS SDK** (init через
> `window`) и Ceramic **Clay testnet** (`ceramic-clay.3boxlabs.com`). Оба устарели:
> у Lit тестнетов больше нет (см. §1), Clay-testnet тоже свёрнут. Брать оттуда —
> **паттерн** (encrypt→Ceramic→gated-decrypt + форму ACC), а не код как есть. Для
> нашего стека:
> - шифрование/выдача ключа — через **Chipotle** ([lit-sdk-chipotle.js](file:///home/g/projects/antigravity/smartcontracts/buckets/lit-sdk-chipotle.js)) / `createLitAccess`, не через легаси-SDK;
> - ACC — через `createAccBuilder` (§8) или [lit-acc.js](file:///home/g/projects/antigravity/smartcontracts/buckets/lit-acc.js); `conditionType: 'evmContractConditions'` для `hasCourseAccess`;
> - Ceramic-узел — актуальный mainnet/ composeDB endpoint, не Clay.
