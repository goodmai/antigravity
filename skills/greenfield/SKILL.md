---
name: greenfield
description: "Работа с BNB Greenfield в проекте Daskibo/Antigravity. Use when Codex needs to explain, audit, implement, or troubleshoot Greenfield local deployment, testnet/mainnet modes, Docker Compose profiles, bucket creation/publishing, storage pricing, Lit/Chipotle course manifests, or HTTP/SDK/API interaction points."
---

# Greenfield

Этот skill предназначен для задач, связанных с BNB Greenfield в репозитории Daskibo/Antigravity: локальные и сетевые развёртывания, публикация бакетов и курсов, ценообразование, интеграция Greenfield SDK/SP API и связка с Lit/Chipotle для DRM-доступа.

## Быстрый справочник

- Локальный деплой, профили для Docker Compose и режимы: `references/deploy-modes.md`.
- Работа с бакетами, объектами, манифестами курса и моделью ценообразования: `references/buckets-pricing.md`.
- HTTP-ручки, SDK/backend-адаптеры, обработка ошибок: `references/api-handles.md`.
- Lit Protocol ACC, metadata объектов Greenfield и схема `manifest` для DRM: `references/lit-greenfield-access-schema.md`.
- Кроссчейн Lit access control, PKP/Lit Actions и мульти-сетевые условия доступа: `references/lit-crosschain.md`.
- Root Cause Analysis (RCA) по интеграционным и криптографическим проблемам (EIP-712, регистрация адресов, форматы `chain_id`, несоответствие типов сообщений): см. [Bug Hunter Skill](../bughunter/SKILL.md).

## Рабочий подход

1. Определить режим работы: `local-mock`, `local`, `testnet`, `mainnet`, `docker-compose.lit.yml` или standalone `greenfield-local` / `greenfield-testnet`.
2. Уточнить слой задачи:
   - Orchestration / Compose
   - Greenfield chain / SP
   - Публикация `bucket` / `object`
   - Lit / Chipotle DRM
   - Контракты / Payments / Access
   - Browser UI / API
3. Для реальных сетей всегда чётко отделять `testnet`/`mainnet` от локальных mock/private-chain; явно указывать используемые ключи, адреса и предполагаемые затраты.
4. При RCA: сначала проверять `logs/*.log`, затем среду Compose (env), затем путь в backend/SDK.
5. Не смешивать standalone Compose-файлы между собой, если это не предписано документацией.

## Репозиторные якоря

Основные файлы и пути, на которые стоит опираться при работе:

- `smartcontracts/docker-compose.yml`
- `smartcontracts/docker-compose.lit.yml`
- `smartcontracts/greenfield-local/docker-compose.yml`
- `smartcontracts/greenfield-testnet/docker-compose.yml`
- `smartcontracts/buckets/greenfield-core.js`
- `smartcontracts/greenfield-testnet/sdk-backend.mjs`
- `smartcontracts/buckets/course-publish.js`
- `smartcontracts/buckets/course-read.js`
- `smartcontracts/buckets/lit-access.js`
- `smartcontracts/buckets/lit-sdk-chipotle.js`
- `uc.md`

## Примечание

При ответах на русском сохранять технические имена (`bucket`, `object`, `SP`, `ACC`, `manifest`, `delegateUploadObject`) без искусственного перевода — это улучшает точность и понятность.

---

## Криптографический справочник

Криптографический справочник BNB Greenfield в проекте Daskibo/Antigravity

Данный документ описывает криптографические примитивы, стандарты подписей, генерацию эфемерных ключей и интеграцию с DRM-системами шифрования (Lit Protocol) в рамках экосистемы BNB Greenfield.

### 1. Обзор криптографического стека

BNB Greenfield объединяет две технологические парадигмы:

- Cosmos SDK (консенсус и транзакции): использование адресного пространства Bech32 (greenfield1...), подписи на базе кривой secp256k1 и механизмы сериализации Amino/Protobuf.
- EVM-совместимость (пользовательский слой): поддержка кошельков MetaMask/Trust Wallet, использование EIP-712 для подписи Cosmos-транзакций в формате JSON-RPC и кроссчейн-мосты с BSC.

### 2. Стандарт EIP-712 и транзакции Cosmos SDK

Чтобы пользователь мог подписывать транзакции Greenfield (например, создание bucket, делегирование прав) через EVM-кошельки, транзакции Cosmos инкапсулируются в структуру EIP-712 Typed Data.

#### Структура EIP-712 Domain Separator

Каждая подпись привязывается к домену во избежание replay-атак.

DomainSeparator вычисляется как Keccak256(TypeHash + Keccak256(Name) + Keccak256(Version) + ChainID + VerifyingContract), где обычно используются константы:

- TypeHash = Keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")
- Name = "Greenfield Web3"
- Version = "1.0.0"
- ChainID = десятичный идентификатор сети (например, 5600 для testnet, 9000 для локальной сети)
- VerifyingContract = 0x0000000000000000000000000000000000000000

#### Формат Types (Tx)

Пример структуры типов (JSON):

```json
{
  "types": {
    "EIP712Domain": [
      { "name": "name", "type": "string" },
      { "name": "version", "type": "string" },
      { "name": "chainId", "type": "uint256" },
      { "name": "verifyingContract", "type": "address" }
    ],
    "Tx": [
      { "name": "account_number", "type": "uint256" },
      { "name": "sequence", "type": "uint256" },
      { "name": "timeout_height", "type": "uint256" },
      { "name": "fee", "type": "Fee" },
      { "name": "msgs", "type": "Msg[]" },
      { "name": "memo", "type": "string" }
    ],
    "Fee": [
      { "name": "amount", "type": "Coin[]" },
      { "name": "gas_limit", "type": "uint256" },
      { "name": "payer", "type": "string" },
      { "name": "granter", "type": "string" }
    ],
    "Coin": [
      { "name": "denom", "type": "string" },
      { "name": "amount", "type": "uint256" }
    ],
    "Msg": [
      { "name": "type", "type": "string" },
      { "name": "value", "type": "string" }
    ]
  }
}
```

#### Чувствительность к регистру (Casing Bug)

При верификации подписи адрес, восстановленный из (v,r,s):

recoverAddress(v, r, s) ?= Lowercase(Address_msg)

Если генератор транзакций передаёт адрес в checksum-регистре (0xAbCd...), а SP ожидает lowercase (0xabcd...), верификация может провалиться.

Рекомендация по решению (в sdk-backend.mjs):

```js
// перед упаковкой в Msg
address = address.toLowerCase();
```

### 3. Off-Chain Auth Tokens (временные ключи)

Для избежания всплывающих окон MetaMask при каждом доступе к приватным объектам применяется Off-Chain Auth.

Алгоритм:

1. Клиент генерирует эфемерную пару ключей (Ed25519 или secp256k1) в памяти: sk_temp / pk_temp.
2. Пользователь подписывает своим основным кошельком сообщение (Signing Statement), делегирующее права эфемерному ключу на период T (например, 24 часа):

Statement = "Grant access to " + hex(pk_temp) + " until " + T
Sig_owner = Sign_SK_wallet(Statement)

3. При запросе к SP клиент подписывает запрос временным ключом:

Sig_request = Sign_sk_temp(HTTP_Method + URI + Timestamp)

4. SP получает: pk_temp, Sig_owner (сертификат делегирования), Sig_request. Проверяет срок действия, связь Sig_owner с владельцем ресурса и корректность Sig_request относительно pk_temp.

### 4. Схема шифрования DRM (Lit Protocol + Chipotle)

Контент курсов не должен храниться в открытом виде даже в private bucket: применяется гибридная схема шифрования.

Публокационная цепочка:

[Plaintext] --(AES-256-GCM, ключ K)--> [Ciphertext + Tag + IV] --> загружается на Greenfield

Ключ K шифруется через Lit Protocol с условиями доступа ACC (например, владение NFT):

K_enc = LitEncrypt(K, ACC)

В манифесте сохраняются: K_enc, ACC, IV, Tag и метаданные. Ноды Lit используют threshold-шифрование (Shamir/threshold) и не могут восстановить K без выполнения условий ACC.

Криптографические параметры рекомендуемые:

- Симметричный ключ K: 256 бит
- Алгоритм шифрования: AES-256-GCM
- IV: 96 бит (уникальный для каждого шифрования)
- Tag: 128 бит

### 5. Конвертация адресных пространств (EVM <-> Bech32)

Greenfield конвертирует 20-байтный EVM-адрес в Bech32 с HRP "greenfield" без изменения публичного ключа.

Пример:

```
Addr_hex = 0x9e80e...b371  // 20 байт
Addr_bech32 = Bech32Encode("greenfield", Addr_hex)
// Результат: greenfield1...
```

Процесс обратим: Bech32 кодирует байты в человекочитаемый формат, не применяя односторонних хэшей.

---

Конец раздела «Криптографический справочник».
