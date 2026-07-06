---
name: greenfield
description: Работа с BNB Greenfield в проекте Daskibo/Antigravity — развёртывание локального private-chain, интеграция с Testnet/Mainnet, управление жизненным циклом bucket/object, расчёт стоимости хранения (pricing) и связка с Lit Protocol/Chipotle DRM.
---

# Greenfield Integration Architecture

Используй этот skill для проектирования, развёртывания, аудита и отладки подсистемы
хранения данных **BNB Greenfield** внутри монорепозитория Daskibo/Antigravity.

> **Актуальность (свер. июнь 2026).** Каноничные эндпоинты ниже сверены с
> официальной докой BNB Greenfield (`docs.bnbchain.org/bnb-greenfield`). Публичный
> **devnet `*.greenfield.wtf` в официальной доке больше не значится** — считать его
> deprecated/неподдерживаемым; для интеграции использовать **Testnet** или
> **локальный private-chain**, для прода — **Mainnet `greenfield_1017-1`**.

## Быстрый выбор справочника

* **Инфраструктура и оркестрация:** `smartcontracts/greenfield-local/` и
  `smartcontracts/greenfield-testnet/` (Docker Compose профили, конфигурация
  валидаторов и Storage Providers). Подробнее — [deploy-modes.md](references/deploy-modes.md).
* **Бизнес-логика публикации:** `smartcontracts/buckets/course-publish.js` и
  `course-read.js` (манифесты Lit/Chipotle DRM, структура курсов).
* **Интеграционный слой SDK:** `smartcontracts/greenfield-testnet/sdk-backend.mjs`
  (клиенты Greenfield SDK, крипто-подписи, генерация Off-Chain Auth Tokens) —
  см. [api-handles.md](references/api-handles.md).
* **Pricing / стоимость хранения:** [buckets-pricing.md](references/buckets-pricing.md).
* **Связка с Lit/Chipotle:** [lit-greenfield-access-schema.md](references/lit-greenfield-access-schema.md),
  [lit-crosschain.md](references/lit-crosschain.md), а также [Lit Skill](../lit/SKILL.md).
* **Диагностика сбоев:** справочник известных багов (EIP-712, регистр адресов,
  несоответствие типов Msg) — [Bug Hunter Skill](../bughunter/SKILL.md).

## Рабочий подход

1. **Идентификация окружения:** определи strict-контекст — `local-mock`,
   `standalone-local`, `testnet` или `mainnet` (devnet исключён, см. выше).
2. **Изоляция слоёв:** чётко разделяй консенсус (Greenfield Blockchain Node) и
   хранение (Storage Provider API).
3. **Криптоверификация:** всегда сверяй `chain_id` при генерации EIP-712 подписей
   для `delegateUploadObject` / off-chain-auth.
4. **Безопасность метаданных:** `manifest.lit.json` курса содержит только
   зашифрованный master-key + ACC (Lit/Chipotle); plaintext-ключи в Greenfield не
   попадают.

## Развёртывание локальной ноды Greenfield

Локальный стек = нода блокчейна Greenfield (CometBFT/Tendermint + Cosmos SDK) +
один или несколько локальных Storage Provider (SP), эмулирующих хранилище. В
e2e-стеке проекта это **реальный 7-SP `gnfd-sp`** (EC 4+2 поверх GVG: 1 primary +
6 secondary), а не mock — см. «Локальный SP-стек» ниже и [Lit Skill §5](../lit/SKILL.md).

### Шаг 1 — Подготовка

Перейди в `smartcontracts/greenfield-local/`. Скопируй `.env.example` → `.env`.
Освободи порты `26656` (P2P), `26657` (RPC), `9090` (gRPC), `8080` (SP Gateway).

### Шаг 2 — Запуск блокчейна (genesis node)

```bash
docker compose up -d greenfield-node
```

Формирует локальный genesis с `chain_id` (напр. `greenfield_9000-1`) и раздаёт
тестовые токены дефолтным адресам. Ожидай лог `Executing block`.

### Шаг 3 — Storage Provider

```bash
docker compose up -d greenfield-sp
```

После старта SP сам шлёт `MsgRegisterSP` в локальную сеть и поднимает HTTP-шлюз на
`:8080`.

### Шаг 4 — Верификация и фондирование

```bash
curl -s http://localhost:26657/status | jq '.result.sync_info'
```

Если `latest_block_height` растёт — сеть стабильна. Импортируй локальный приватный
ключ в `gnfd-cmd` для проверки баланса.

> **Локальный SP-стек (e2e).** Контейнер `greenfield-local` становится `healthy`
> только по sentinel `/tmp/sp_ready` (`start_period 240s`): цепочка + GVG + MariaDB
> + 7 SP. После `putObject` объект запечатывается асинхронно (~100–110 с), поэтому
> читать надо с ретраем (`readObjectWithRetry`); `404/not sealed` ≠ ошибка доступа.
> Валидируй всегда из чистого genesis (`run_e2e_lit.sh` делает `down -v`), не
> переиспользуя устаревший SP-контейнер.

## Матрица конфигураций: Local · Testnet · Mainnet

Параметры среды для `sdk-backend.mjs` и `docker-compose.*`. Эндпоинты сверены с
[официальной докой](https://docs.bnbchain.org/bnb-greenfield/for-developers/network-endpoint/endpoints/)
(июнь 2026).

| Параметр | Local private-chain | Greenfield Testnet | Greenfield Mainnet |
| :--- | :--- | :--- | :--- |
| **Chain ID** | `greenfield_9000-1` (custom) | `greenfield_5600-1` | `greenfield_1017-1` |
| **Tendermint RPC** | `http://localhost:26657` | `https://gnfd-testnet-fullnode-tendermint-us.bnbchain.org:443` | `https://greenfield-chain.bnbchain.org:443` |
| **gRPC** | `localhost:9090` | `gnfd-testnet-fullnode-tendermint-us.bnbchain.org:9090` | `greenfield-chain.bnbchain.org:443` |
| **Primary SP** | `http://localhost:8080` | `https://gnfd-testnet-sp1.bnbchain.org` | `https://greenfield-sp.bnbchain.org` |
| **Нативный токен** | BNB (локальный минт) | **tBNB** (Testnet Faucet) | **BNB** |
| **Cross-Chain Bridge → BSC** | отсутствует | BSC Testnet (97) | BSC Mainnet (56) |

> ⚠️ **Devnet `greenfield_5600-1` / `*.devnet.greenfield.wtf` — deprecated.** В
> официальной доке остались только Testnet и Mainnet. Исторически в репозитории
> мог встречаться `rpc.devnet.greenfield.wtf` — заменять на Testnet-эндпоинты выше.
> (Testnet тоже использует chain id `greenfield_5600-1`.)

## Критические ручки (API / SDK)

Взаимодействие разделено на два уровня: **Chain Client** (транзакции Cosmos SDK) и
**SP Client** (работа с файлами по S3-подобному протоколу). Полная карта —
[api-handles.md](references/api-handles.md).

```js
import { Client } from '@bnb-chain/greenfield-js-sdk';

// Единый клиент: (Tendermint RPC, chainId)
const client = Client.create(RPC_URL, String(GREENFIELD_CHAIN_ID));
```

> **SDK-источник:** `@bnb-chain/greenfield-js-sdk`
> (репо [bnb-chain/greenfield-js-sdk](https://github.com/bnb-chain/greenfield-js-sdk)).
> Пинни версию в `package.json` и сверяй сигнатуры при обновлении — API SP-слоя
> (delegated upload, off-chain auth) эволюционирует.

#### 1. `client.bucket.createBucket`
Первичная публикация курса (изоляция контента).
* **Параметры:** `bucketName`, `creator`, `visibility` (Public/Private), `paymentAddress`.
* **Под капотом:** подписывает `MsgCreateBucket`; требует газ в BNB + approval-подпись SP.

#### 2. `client.object.delegateUploadObject`
Основной серверный путь: пользователь грузит файлы прямо в SP под подписью бэкенда
(без раскрытия его приватного ключа).
* **Параметры:** `bucketName`, `objectName`, `body` (File/Buffer), `delegatedOpts` (EIP-712).

#### 3. `client.object.headObject`
Проверка существования объекта и чтение пользовательских метаданных
(`X-Gnfd-User-Metadata`).

#### 4. `client.offchainauth.genOffChainAuthKeyPair`
Off-Chain Auth Token для бесшовного скачивания приватных объектов/манифестов без
постоянного MetaMask-попапа. Пара ключей кладётся в `localStorage` и верифицируется
на SP. ⚠️ `chain_id` в подписи должен совпадать с целевой сетью (BUG-регистр в
[Bug Hunter](../bughunter/SKILL.md)).

## Модель стоимости хранения (Pricing)

Полный разбор — [buckets-pricing.md](references/buckets-pricing.md).

```
TotalCost = Σ_primary(Size_i · PrimarySpPrice) + Σ_secondary(Size_j · SecondarySpPrice)
```

* `Size_i` — размер объекта в байтах (биллится **charged size**, не меньше минимума SP).
* `PrimarySpPrice` — ставка первичного SP (байт·сек).
* `SecondarySpPrice` — ставка вторичных реплик (избыточность EC; обычно 6 secondary).

**Нюанс:** при `MsgDeleteObject`/обновлении зарезервированный, но неизрасходованный
Locked Balance на PaymentAccount возвращается на баланс — за вычетом штрафа за
досрочное удаление (если объект хранился меньше минимального срока SP).

## Каноничные источники

| Что | URL |
| :--- | :--- |
| Network endpoints (RPC/SP) | https://docs.bnbchain.org/bnb-greenfield/for-developers/network-endpoint/endpoints/ |
| Network info (chain ids) | https://docs.bnbchain.org/bnb-greenfield/for-developers/network-endpoint/network-info/ |
| Greenfield docs (root) | https://docs.bnbchain.org/bnb-greenfield/ |
| JS SDK | https://github.com/bnb-chain/greenfield-js-sdk |
| CLI (`gnfd`/`gnfd-cmd`) | https://github.com/bnb-chain/greenfield-cmd |
| Core repo (Cosmos SDK) | https://github.com/bnb-chain/greenfield |
| Storage Provider | https://github.com/bnb-chain/greenfield-storage-provider |
