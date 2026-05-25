# Ручки Взаимодействия и API Поверхности

## Содержание

- Слои взаимодействия
- Greenfield client API
- Backend adapters
- HTTP/SP endpoints
- Chipotle endpoints
- Contract calls
- Ошибки

## Слои Взаимодействия

В проекте есть несколько API поверхностей:

1. Browser/UI layer.
2. `greenfield-core` unified client.
3. Backend adapters для mock, SDK, wallet.
4. Greenfield SP HTTP gateway.
5. Greenfield Tendermint/Cosmos RPC.
6. Lit/Chipotle DRM API.
7. EVM contracts: `CourseMarketplace`, `AccessPass`, `Treasury`.

При изменениях не прыгай сразу в low-level HTTP: сначала найди, какой adapter используется текущим режимом.

## Greenfield Client API

Основная абстракция:

- `createGreenfieldClient`

Типовые методы:

- `createBucket(bucketName, options)`
- `saveObject(bucketName, objectKey, body, options)`
- `readObject(bucketName, objectKey)`
- `listBuckets(owner/options)`
- helpers для view/download URL

Ключевой файл:

```text
smartcontracts/buckets/greenfield-core.js
```

Цель этой абстракции: одинаковый caller code для mock, local, testnet, mainnet.

## Backend Adapters

### SP emulation backend

Файл:

```text
smartcontracts/integration/sp-emulation-backend.js
```

Используется для mock/local development без real Greenfield tx.

Обычно говорит с:

```text
http://localhost:9000
```

### SDK backend

Файл:

```text
smartcontracts/greenfield-testnet/sdk-backend.mjs
```

Используется для real Greenfield operations:

- create bucket через SDK tx
- upload object через `delegateUploadObject`

Требует:

- `rpcUrl`
- `chainId`
- `privateKey`
- `address`

### Wallet backend

Файл:

```text
smartcontracts/buckets/greenfield-wallet-backend.js
```

Используется browser UI с EIP-1193 provider.

Ручки wallet:

- `eth_requestAccounts`
- `eth_signTypedData_v4`

Типовые ошибки:

- `NO_WALLET`
- `USER_REJECTED`
- `NO_ACCOUNTS`
- `NO_WALLET_CLIENT`
- `WALLET_ERROR`

## HTTP/SP Endpoints

Mock SP:

```text
GET /healthz
PUT /:bucket
PUT /:bucket/:objectKey
GET /:bucket/:objectKey
GET /:bucket
```

Real SP gateway:

```text
GET /<bucket>/<objectKey>
```

Для local private chain SP обычно:

```text
http://localhost:9033
```

Для testnet SP обычно:

```text
https://gnfd-testnet-sp1.bnbchain.org
```

Для mainnet SP обычно:

```text
https://greenfield-sp.bnbchain.org
```

## Greenfield RPC

Local:

```text
http://localhost:26750
```

Testnet:

```text
https://gnfd-testnet-fullnode-tendermint-us.bnbchain.org
```

Используется SDK для:

- querying chain state
- bucket tx construction
- broadcast
- object upload delegation

## Chipotle Endpoints

Mock/real Chipotle API в проекте обычно доступен на:

```text
http://localhost:8000
```

или внутри Compose:

```text
http://chipotle-anvil:8000
http://chipotle-mock:8000
```

Важные ручки:

```text
GET  /core/v1/version
POST /core/v1/create_wallet
POST /core/v1/lit_action
```

`create_wallet` возвращает PKP/wallet address. `lit_action` выполняет encrypt/decrypt action с ACC.

Клиент:

```text
smartcontracts/buckets/lit-sdk-chipotle.js
```

## Contract Calls

`CourseMarketplace`:

- `registerCourse(price, contentHash, bucket, accessDuration)`
- `purchase(courseId)`
- `hasCourseAccess(user, courseId)`
- `courses(courseId)`
- `withdraw()`

`AccessPass`:

- `ownerOf(tokenId)`
- `balanceOf(owner)`
- transfer/approve должны быть заблокированы soulbound логикой

`Treasury`:

- protocol cut accounting
- governance-controlled outflow

Для E2E адреса часто берутся из Foundry broadcast output, а не hardcode.

## Ошибки

Common Greenfield/client errors:

- `NO_BACKEND`: write operation вызвана без backend
- `OWNER_MISMATCH`: owner не совпал с signer/resolved owner
- `SP_UNAVAILABLE`: SP не выбран или недоступен
- `BUCKET_EXISTS`: bucket уже существует
- `SP_ERROR`: SP вернул unexpected HTTP error
- `LIST_TRUNCATED`: list/search достиг hard limit

DRM/access errors:

- `ACCESS_DENIED`: ACC не прошла
- `DECRYPT_FAILED`: ciphertext/AAD/sidecar повреждены
- `AlreadyOwned`: author или already owner не должен покупать повторно
- `Soulbound`: попытка transfer/approve AccessPass

Greenfield local GVG error:

```text
global virtual group family statistics not exist
```

Проверять:

- health readiness
- GVG bootstrap logs
- `SPS`
- chain id
- что runner не стартовал до полной готовности Greenfield SDK query path

## Минимальный Алгоритм Диагностики

1. Определи режим: mock/local/testnet/mainnet.
2. Найди active endpoint values: `GF_RPC`, `GF_SP`, `GF_CHAIN_ID`, private key/address env.
3. Проверь Compose config.
4. Проверь health endpoint.
5. Проверь logs конкретного сервиса.
6. Проверь, какой backend adapter выбран в runner/UI.
7. Для real SDK ошибок проверь Greenfield RPC/SP и GVG readiness.
