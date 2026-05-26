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
> **Проект использует Chipotle (Lit v3).** Старые P2P-сети Lit (`datil`/`datil-test`/
> `datil-dev`) **отключены 2026-02-25**, сеть **Naga тоже сворачивается** — Chipotle
> заменяет обе. Везде, где в доках упоминается `datil*`, это **исторический/устаревший**
> контекст. Подробности и тестовая среда — §7.

| Параметр | Chipotle (Lit v3) — **выбран** | Chipotle Mock (локально) | ~~Lit Datil~~ (отключён 2026-02-25) |
| :--- | :--- | :--- | :--- |
| **Среда выполнения** | REST/HTTP поверх **TEE на Phala** | Node.js `crypto.subtle` | ~~децентрализованная P2P~~ |
| **Порты / endpoint** | HTTPS, `api.dev.litprotocol.com` (test) | локальный `8000` | ~~порт 7470 P2P~~ |
| **Режим** | Staging / Production | Local Development / E2E / CI | ~~deprecated~~ |
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
| **Chipotle dev/test API** | https://api.dev.litprotocol.com | REST `/core/v1/version`, `/create_wallet`, `/lit_action`; dev chain id **1315** |
| **Chipotle Swagger** | `…dstack-pha-prod5.phala.network/core/v1/swagger-ui/index.html` | живая схема HTTP API (на инстансе Phala) |
| **Chipotle / dev доки** | https://docs.dev.litprotocol.com/ · https://naga.developer.litprotocol.com/ | dev-доки + actions-референс |
| Phala TEE chain-of-trust | https://docs.phala.com/phala-cloud/attestation/chain-of-trust | модель доверия Chipotle prod |
| ~~Кран Yellowstone~~ | ~~chronicle-yellowstone-faucet.getlit.dev~~ (tstLPX) | для Datil/Naga — **deprecated** |

> URL/auth Chipotle (API key или x402) подтверждать по Swagger/доке выше со своей
> машины. Для devnet (`run_devnet.sh`) нужен **только** tBNB на BSC testnet +
> Greenfield testnet — Lit-краны не нужны (Chipotle — REST, не P2P-сеть).

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
> **Сеть Datil (Lit v0) ОТКЛЮЧЕНА с 2026-02-25.** Анонс из `#announcements`
> (2026-02-03): *«Lit v0 (Datil network) is going to be shut down on 2/25»*.
> Значит `datil` / `datil-test` / **`datil-dev`** больше не живут. Это напрямую
> ломает текущий код, который дефолтит на Datil:
> - [lit-sdk.js](file:///home/g/projects/antigravity/smartcontracts/buckets/lit-sdk.js) (`network='datil-test'`)
> - `write-testnet-lit.mjs`, `write-devnet.mjs` (`datil-dev`)
>
> **Выбор проекта — Chipotle (Lit v3).** И **Datil, и Naga сворачиваются**
> (в `#dev-support`: *«Naga-network is shutting down»*), поэтому таргетим Chipotle:
> - **Chipotle (Lit v3)** — *«live on production»* (анонс 2026-04-07): ground-up
>   rebuild, REST/HTTP поверх TEE на Phala, **SDK не требуется**. В проекте уже есть
>   адаптер [lit-sdk-chipotle.js](file:///home/g/projects/antigravity/smartcontracts/buckets/lit-sdk-chipotle.js) (`/core/v1/lit_action`).
> - Тестовая среда — `https://api.dev.litprotocol.com` (dev chain **1315**); Swagger
>   на Phala prod5; доки `docs.dev.litprotocol.com`. См. таблицу §7.1.
> - В Chipotle **`checkConditions` удалён** из Lit Actions → ACC проверяется на
>   стороне приложения (адаптер уже делает: ethers → RPC сети контракта).
> - `signAsAction` **deprecated** (`#dev-support` 2026-03-10) → создать wallet в
>   Chipotle и привязать к одному action.
>
> **Вывод для devnet:** в `write-devnet.mjs` Lit-слой надо перевести с `datil-dev`
> на Chipotle (`createChipotleClient`, `CHIPOTLE_URL=https://api.dev.litprotocol.com`),
> а ACC-проверку при decrypt направить на **RPC BSC testnet** (не anvil). Сверять
> актуальное состояние через `search_messages` по `#announcements`/`#dev-support`.
