# Chipotle DRM — Обзор реализации

> Дата: 2026-05-20  
> Ветка: `claude/greenfield-smartcontracts-setup-2HS95`  
> Коммит: `0319e18`

---

## Зачем Chipotle

Исходный план — использовать **Lit Protocol datil-dev** (бесплатная удалённая сеть) для шифрования мастер-ключа бакета. Столкнулись с двумя блокерами:

| Проблема | Деталь |
|---|---|
| `datil-test` → localhost | Оказалось, эта сеть поднимает Lit-ноды на `127.0.0.1:7470` — только для локальных нод |
| `datil-dev` → заблокирован | Реальные ноды на `15.235.83.220:7470` (OVH France) — порт `7470` закрыт на нашем сервере |
| `datil` (mainnet) | Требует Capacity Credits NFT на Chronicle Yellowstone |
| Chipotle live API | `https://api.chipotle.litprotocol.com` — требует оплату ($5+, `402 Payment Required`) |

Решение — **локальный мок-сервер** с тем же REST API, что у Chipotle. Он работает без P2P, без блокчейн-транзакций, без оплаты. Когда понадобится перейти на реальный Chipotle (или когда порт откроют), меняется только URL.

---

## Архитектура

```
┌─────────────────────────────────────────────────────────────────┐
│                      Шифрование (сервер)                        │
│                                                                 │
│  plaintext ──AES-256-GCM(DEK)──▶ .enc файл                    │
│  DEK       ──AES-256-GCM(master)──▶ .lit.json сайдкар         │
│  master    ──PKP AES-256-GCM──▶ manifest.lit.ciphertext        │
│             ↑                                                   │
│         Chipotle PKP                                            │
│       (фиксированный ключ                                       │
│        в TEE или в моке)                                        │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    Расшифровка (браузер)                         │
│                                                                 │
│  1. Connect MetaMask → получить wallet.address                  │
│  2. Sign Proof → MetaMask подписывает nonce (personal_sign)     │
│  3. POST /lit_action {action:"decrypt", ciphertext, userAddress,│
│       signedProof, accessControlConditions}                     │
│     → Chipotle проверяет: signature OK + address ∈ ACC          │
│     → возвращает masterKey                                      │
│  4. Fetch .enc → AES-GCM decrypt → plaintext                   │
│  5. Контент живёт в памяти 1 час, потом auto-wipe              │
└─────────────────────────────────────────────────────────────────┘
```

### Ключевые схемы

**`manifest.lit` (Chipotle вариант)**
```json
{
  "schema": "daskibo.lit.acc/1",
  "chain": "ethereum",
  "litNetwork": "chipotle",
  "chipotleUrl": "http://localhost:8000",
  "pkpId": "0x1Be31A94...",
  "accessControlConditions": [
    {
      "contractAddress": "",
      "standardContractType": "",
      "chain": "ethereum",
      "method": "",
      "parameters": [":userAddress"],
      "returnValueTest": { "comparator": "=", "value": "0x58F2D197..." }
    }
  ],
  "ciphertext": "base64iv:base64ciphertext_of_masterkey",
  "dataToEncryptHash": "sha256hex_of_masterkey"
}
```

**Chipotle ciphertext** = `base64(IV_12bytes) + ":" + base64(AES-GCM-encrypted_masterkey)` — без отдельного поля для IV, всё в одной строке через двоеточие.

---

## Новые файлы

### 1. `smartcontracts/greenfield-testnet/chipotle-mock.mjs` (238 строк)

Локальный HTTP-сервер, имитирующий `api.chipotle.litprotocol.com`.

**Зависимости:** `node:http`, `node:crypto` (глобальный `crypto.subtle` в Node 22+), `ethers@5` (уже в node_modules от Lit SDK).

**PKP key:** генерируется при старте или берётся из `CHIPOTLE_PKP_KEY`. PKP — это 32-байтный EC-ключ; первые 32 байта используются как AES-256-GCM ключ для шифрования мастер-ключа.

**Реализованные эндпоинты:**

| Method | Path | Описание |
|---|---|---|
| `GET` | `/core/v1/version` | Версия сервера + PKP-адрес |
| `POST` | `/core/v1/new_account` | Мок-регистрация → `{api_key, wallet_address}` |
| `GET` | `/core/v1/create_wallet` | PKP wallet address |
| `POST` | `/core/v1/lit_action` | Encrypt / Decrypt диспатч |

**`/lit_action` диспатч по `js_params.action`:**

```
action: "encrypt"
  in:  { masterKey, accessControlConditions }
  out: { ciphertext, dataToEncryptHash, pkpId }

action: "decrypt"
  in:  { ciphertext, accessControlConditions, userAddress, signedProof? }
  out: { decrypted }  ← plaintext masterKey
```

Encrypt: `crypto.subtle.importKey(PKP_KEY_BYTES)` → `AES-GCM.encrypt(iv=random12)` → `SHA-256(masterKey)` = hash.

Decrypt: проверяет `ethers.utils.verifyMessage(message, signature)` → проверяет `userAddress ∈ ACC.returnValueTest.value` → `AES-GCM.decrypt`.

CORS включён (`Access-Control-Allow-Origin: *`) — браузер из `localhost:8099` может звонить на `localhost:8000`.

```bash
# Запуск
export CHIPOTLE_PKP_KEY=0x...   # задать для персистентности между рестартами
node chipotle-mock.mjs
# → 🌶  Chipotle mock server → http://localhost:8000
```

---

### 2. `smartcontracts/buckets/lit-sdk-chipotle.js` (123 строки)

Адаптер `LitClient` для Chipotle REST API. Реализует тот же интерфейс, что ожидает `lit-access.js` и `createLitAccess`.

```js
// Интерфейс LitClient (из lit-access.js):
litClient.encrypt({ accessControlConditions, dataToEncrypt })
  → { ciphertext, dataToEncryptHash }

litClient.decrypt({ accessControlConditions, ciphertext, dataToEncryptHash, chain }, authContext)
  → string  // plaintext masterKey
```

`authContext` для Chipotle:
```js
{ userAddress: "0x...", signedProof: { message: "nonce string", signature: "0x..." } }
```

**`createChipotleClient({ chipotleUrl, pkpId })`** — создаёт клиент. `pkpId` передаётся в `js_params` чтобы мок (и реальный Chipotle) знали, какой ключ использовать.

**`createSignedProof(userAddress, provider)`** — вспомогательная функция: создаёт nonce, просит MetaMask (`personal_sign`) подписать, возвращает `{ message, signature }`. Используется в браузере.

Работает в обоих контекстах (Node.js сервер + браузер) — использует только `fetch` и стандартные API.

---

### 3. `smartcontracts/greenfield-testnet/write-testnet-chipotle.mjs` (224 строки)

Node.js скрипт публикации курса на Greenfield с Chipotle-защитой.

**Отличия от `write-testnet-lit.mjs`:**
- Подключается к Chipotle (не к `LitNodeClient`)
- Получает PKP через `GET /core/v1/create_wallet`
- После `planCoursePublish` **расширяет** `manifest.lit` полями `litNetwork`, `chipotleUrl`, `pkpId` — чтобы браузер знал, куда звонить при расшифровке
- Env vars: `CHIPOTLE_URL` (default `http://localhost:8000`), `CHIPOTLE_PKP_KEY` (optional)

**Поток:**
```
1. Fetch /core/v1/version    → проверка доступности Chipotle
2. Fetch /core/v1/create_wallet → PKP address
3. Собрать ACC (deployer + LIT_ALLOWED_ADDRESS)
4. createChipotleClient + createLitAccess
5. planCoursePublish({ spec, pricing, lit: { access, acc } })
   → внутри: POST /lit_action action=encrypt → ciphertext
6. Расширить manifest.lit: { ...litEnv, litNetwork:'chipotle', chipotleUrl, pkpId }
7. createSdkBackend → createGreenfieldClient
8. client.createBucket → client.saveObject для каждого объекта
9. Round-trip: readObject('_lit/manifest.json') → проверить manifest.lit.litNetwork
```

```bash
# Запуск (Chipotle mock уже работает на :8000)
export GREENFIELD_TESTNET_PRIVATE_KEY=0x7a67d0bb...
export GREENFIELD_TESTNET_ADDRESS=0x58F2D197...
export CHIPOTLE_URL=http://localhost:8000
node write-testnet-chipotle.mjs
```

---

### 4. `smartcontracts/bucket-reader.html` (871 строк) — обновлён

DRM-ридер. Автоматически определяет режим из `manifest.lit.litNetwork`.

**Добавленное состояние:**
```js
let chipotleSession = null;
// { userAddress, signedProof: { message, signature }, expiresAt }
```

**Новые UI-элементы:**
- `#btn-chipotle-auth` — «Sign Proof» кнопка (скрыта в Lit-режиме, показана в Chipotle-режиме)
- `#lit-network-label` — динамически меняется: `(datil-dev)` или `(chipotle)`

**Переключение UI после загрузки манифеста:**
```js
const chipotleMode = manifest.lit?.litNetwork === 'chipotle';
// скрыть/показать кнопки Connect Lit / Get Session / Sign Proof
```

**`signChipotleProof(userAddress)`** — MetaMask `personal_sign` случайного nonce. Proof хранится в `chipotleSession` до истечения 1 ч.

**`decryptViaChipotle(entry, btnEl)`:**
1. Lazy auth: если нет сессии → `signChipotleProof` → сохранить в `chipotleSession`
2. `POST chipotleUrl/core/v1/lit_action` с `{action:"decrypt", ciphertext, accessControlConditions, userAddress, signedProof}`
3. Вернуть `data.response.decrypted` (masterKey)

**`decryptLesson(entry, btnEl, panelEl)` — теперь ветвится:**
```js
const isChipotle = manifest.lit.litNetwork === 'chipotle';

if (isChipotle) {
  masterKey = await decryptViaChipotle(entry, btnEl);
} else {
  // исходный Lit path: decryptToString + sessionSigs
  masterKey = await _decryptToString({ ... }, litNode);
}

// Общая часть для обоих путей:
const envelope = await fetchText(bucket, entry.key);
const { text } = await decryptObject(masterKey, envelope);
decrypted[key] = { text, meta, expiresAt: chipotleSession?.expiresAt };
```

**TTL и auto-wipe** работают для обоих режимов через `chipotleSession.expiresAt`.

---

### 5. `smartcontracts/bucket-builder.html` (522 строки) — новый

Конструктор курсов: «предпросмотр бакета до шифрования, подготовка бакета из макета».

**Три секции:**

**① Course Info** — поля Title и Bucket slug (автогенерируется если пусто).

**② Lessons** — динамический список. Кнопка «+ Add Lesson» добавляет карточку:
```
Lesson N
├── Object key (path)    e.g. lessons/01/intro.md
├── Title
├── Content type         markdown / html / plain / json
└── Content (textarea)   plaintext body
```

**③ Access Control** — адреса через запятую (MetaMask-адрес добавляется автоматически). Chipotle URL + Lit Network name.

**«Preview Bucket» (Ctrl+Enter)**  
Вызывает `buildCourseBucket(spec)` — чистая функция из `course-template.js`. Показывает:
- JSON превью `manifest.json` с пометкой `← plaintext preview`
- Список объектов **как они будут выглядеть после шифрования**: `.enc` (🔒 encrypted), `.lit.json` (🗝 sidecar), манифест (json) — с примерными размерами в KB

```
_lit/manifest.json          json      ~2.1 KB
lessons/01/intro.md.enc     🔒 encr.  ~0.8 KB
lessons/01/intro.md.lit.json 🗝 sidecar ~0.3 KB
```

**«Publish to Greenfield»** (MetaMask required):
1. Подключается к Chipotle → PKP
2. `createChipotleClient` + `createLitAccess`
3. `planCoursePublish` → зашифрованный план с `manifest.lit`
4. Загружает `greenfield-wallet-sdk.js` (MetaMask off-chain auth)
5. `createGreenfieldClient` с `makeWalletGreenfieldClient` как backend
6. `createBucket` + `saveObject` для всех объектов
7. Показывает ссылку на `bucket-reader.html?bucket=...&owner=...`

---

### 6. `docker-compose.yml` — обновлён

Добавлен сервис `chipotle-mock`:

```yaml
chipotle-mock:
  image: node:22-bookworm
  volumes:
    - ../../:/app
  ports:
    - "8000:8000"
  environment:
    - CHIPOTLE_PKP_KEY
    - CHIPOTLE_PORT=8000
  command: ["sh", "-c", "npm install --no-audit --no-fund && node chipotle-mock.mjs"]
  healthcheck:
    test: ["CMD", "curl", "-sf", "http://localhost:8000/core/v1/version"]
```

Запуск через Docker:
```bash
export CHIPOTLE_PKP_KEY=0x...  # задать один раз, хранить в .env
docker compose -f smartcontracts/greenfield-testnet/docker-compose.yml up chipotle-mock
```

---

## Полный рабочий флоу (Flow C)

```
┌─ Terminal 1: Chipotle mock ───────────────────────────────────┐
│ cd smartcontracts/greenfield-testnet                          │
│ export CHIPOTLE_PKP_KEY=0x<32 bytes hex>  # сохранить!       │
│ node chipotle-mock.mjs                                        │
│ # → 🌶  http://localhost:8000                                 │
└───────────────────────────────────────────────────────────────┘

┌─ Terminal 2: Publish course ──────────────────────────────────┐
│ export GREENFIELD_TESTNET_PRIVATE_KEY=0x7a67d0bb...          │
│ export GREENFIELD_TESTNET_ADDRESS=0x58F2D197...              │
│ export CHIPOTLE_URL=http://localhost:8000                     │
│ node write-testnet-chipotle.mjs                               │
│ # → Bucket: daskibo-abc123                                   │
└───────────────────────────────────────────────────────────────┘

┌─ Browser: DRM Reader ─────────────────────────────────────────┐
│ http://localhost:8099/bucket-reader.html                      │
│   ?bucket=daskibo-abc123&owner=0x58F2D197...                  │
│                                                               │
│ [Connect MetaMask] → автоматически определяет Chipotle-режим │
│ [Sign Proof]       → MetaMask personal_sign nonce            │
│ [Unlock 🔓]        → Chipotle проверяет ACC → master key    │
│                     → AES-GCM decrypt → контент              │
│                     → auto-wipe через 1 час                  │
└───────────────────────────────────────────────────────────────┘

┌─ Browser: Bucket Builder ─────────────────────────────────────┐
│ http://localhost:8099/bucket-builder.html                     │
│                                                               │
│ Заполнить форму → [Preview Bucket] → видит структуру до enc  │
│ [Connect MetaMask] → [Publish to Greenfield]                  │
│ → создаёт бакет и все объекты через MetaMask                 │
└───────────────────────────────────────────────────────────────┘
```

---

## Что установлено на сервере

| Инструмент | Путь | Версия | Зачем |
|---|---|---|---|
| Foundry (anvil) | `~/.foundry/bin/anvil` | 1.7.1 | Нужен для запуска локального Chipotle (real stack) |
| dstack simulator | `~/GitHub/dstack/sdk/simulator/dstack-simulator` | compiled | TEE эмулятор для реального Chipotle |
| static-web-server | `~/.local/bin/static-web-server` | 2.36.0 | lit-static для реального Chipotle |
| Chipotle repo | `~/GitHub/chipotle` | main | Исходники реального Chipotle |
| dstack repo | `~/GitHub/dstack` | main | Исходники dstack simulator |

Реальный Chipotle стек (`local_test.sh`) можно поднять, когда понадобится — все зависимости уже есть. Остаётся только собрать Rust-бинари `lit-api-server` и `lit-actions` (несколько минут `cargo build`).

---

## Переход на реальный Chipotle

### Вариант A: live API (когда пополнен баланс)

```bash
# Сменить только URL:
export CHIPOTLE_URL=https://api.chipotle.litprotocol.com
# В bucket-builder.html / bucket-reader.html тоже сменить chipotleUrl в манифесте

# Аккаунт уже создан:
# api_key: EXG/s/YAw6E8L7nXH0ntAIdkmR1mabAgdWRYM28bTFg= (master, не деплоить в браузер)
# Нужно: добавить средства на dashboard.chipotle.litprotocol.com → Add Funds
# Затем создать usage API key с ограниченным scope (execute only) для браузера
```

### Вариант B: локальный Chipotle (full stack)

```bash
# Всё готово, кроме сборки Rust бинарей самого Chipotle:
cd ~/GitHub/chipotle

# Нужен Docker для Jaeger (трейсинг, необязателен)
# Правим sed -i '' → sed -i (macOS→Linux):
sed -i "s/sed -i ''/sed -i/g" local_test.sh

# Запуск:
export SIMULATOR_DIR=~/GitHub/dstack/sdk/simulator
export PATH=$PATH:~/.foundry/bin:~/.local/bin
./local_test.sh
# → API на http://localhost:8000 (тот же порт, что мок)
```

---

## Модель безопасности

| Аспект | Mock | Real Chipotle |
|---|---|---|
| PKP ключ | в памяти Node процесса | в TEE (недоступен снаружи) |
| Проверка подписи MetaMask | `ethers.verifyMessage` | в TEE (tamper-proof) |
| ACC проверка | JS code в Node | JS code в TEE (sandbox) |
| Конфиденциальность master key | доверяем Node процессу | математически защищено TEE |
| API key в браузере | нет (URL открытый) | нужен usage key (scoped) |

Для продакшена: мастер-ключ никогда не покидает Chipotle TEE — браузер получает **plaintext курса** напрямую (либо сам расшифровывает после получения мастер-ключа). Если переходить на реальный Chipotle, `chipotleUrl` в манифесте меняется на live URL, остальной код не трогается.
