# Режимы Деплоя Greenfield

## Содержание

- Локальные режимы
- Testnet
- Mainnet
- Compose карта
- Проверки и типовые команды
- Диагностика

## Локальные Режимы

### `local-mock`

Назначение: быстрая разработка UI и bucket API без реальной Greenfield chain.

Состав:

- `frontend`: nginx, статический `smartcontracts/`
- `mock-sp`: Node.js in-memory Storage Provider emulator

Типовой запуск:

```bash
docker compose -f smartcontracts/docker-compose.yml --profile local-mock up -d
```

Использовать когда:

- нужно проверить UI bucket console
- нужен быстрый create/read/write round-trip
- не нужны реальные Greenfield транзакции
- не нужны testnet funds

Ограничение: данные живут в памяти mock SP и пропадают после рестарта.

### `local`

Назначение: локальная private Greenfield chain с clean state.

Состав:

- `greenfield-local`: validator + storage providers
- опционально `frontend`
- опционально `chipotle-mock`

Важные порты:

- `26750`: Tendermint RPC
- `9033`: SP gateway
- `1317`: Cosmos REST
- `7545`: EVM RPC, если включен в конкретном Compose

Типовой запуск:

```bash
docker compose -f smartcontracts/docker-compose.yml --profile local up -d --build
```

Standalone запуск:

```bash
docker compose -f smartcontracts/greenfield-local/docker-compose.yml up -d --build
```

Ожидаемый chain id:

```text
greenfield_9000-1
```

Особенность текущего проекта: local Greenfield использует bootstrap GVG. Healthcheck может быть привязан к `/tmp/gvg_bootstrapped`, то есть готовность означает не только RPC, но и попытку подготовить Global Virtual Group.

### `docker-compose.lit.yml`

Назначение: canonical same-network paid Lit NFT gating E2E.

Состав:

- Chipotle anvil chain
- dstack simulator
- Chipotle deploy/bootstrap/real API
- local Greenfield
- Foundry deploy contracts
- `e2e-lit` runner

Типовой запуск:

```bash
docker compose -f smartcontracts/docker-compose.lit.yml up --build --abort-on-container-exit --exit-code-from e2e-lit
```

Использовать для UC-04/UC-05:

- paid access
- soulbound AccessPass
- Lit/Chipotle ACC
- encrypted course publish/read

## Testnet

Назначение: публикация в реальную BNB Greenfield testnet.

Нужны переменные:

```bash
export GREENFIELD_TESTNET_PRIVATE_KEY=0x...
export GREENFIELD_TESTNET_ADDRESS=0x...
```

Опционально:

```bash
export GF_BUCKET=...
export LIT_ALLOWED_ADDRESS=0x...
export CHIPOTLE_PKP_KEY=...
export CHIPOTLE_URL=...
```

Standalone testnet compose:

```bash
docker compose -f smartcontracts/greenfield-testnet/docker-compose.yml run --rm testnet-writer
```

Chipotle mock flow:

```bash
docker compose -f smartcontracts/greenfield-testnet/docker-compose.yml up -d chipotle-mock
docker compose -f smartcontracts/greenfield-testnet/docker-compose.yml run --rm chipotle-writer
```

Unified profile:

```bash
docker compose -f smartcontracts/docker-compose.yml --profile testnet run --rm testnet-writer
```

Testnet spends real testnet gas. Не запускать как default path без явного согласия пользователя.

## Mainnet

Назначение: production Greenfield publish.

Нужны переменные:

```bash
export GREENFIELD_MAINNET_PRIVATE_KEY=0x...
export GREENFIELD_MAINNET_ADDRESS=0x...
```

Unified profile:

```bash
docker compose -f smartcontracts/docker-compose.yml --profile mainnet run --rm mainnet-writer
```

Mainnet использует реальные средства и production SP. Перед запуском проверять:

- chain id / RPC / SP endpoint
- адрес владельца
- bucket name
- стоимость хранения
- Lit/Chipotle credits/capacity
- что private key не попадет в логи или git

## Compose Карта

| File | Назначение |
|---|---|
| `smartcontracts/docker-compose.yml` | unified profile stack |
| `smartcontracts/docker-compose.lit.yml` | same-network paid Lit NFT E2E |
| `smartcontracts/greenfield-local/docker-compose.yml` | standalone local Greenfield private chain |
| `smartcontracts/greenfield-testnet/docker-compose.yml` | standalone public testnet writer + Chipotle mock |

Не комбинируй standalone Compose files без явной причины. Они рассчитаны как самостоятельные entrypoints.

## Проверки

Профили:

```bash
docker compose -f smartcontracts/docker-compose.yml config --profiles
```

Валидация unified:

```bash
docker compose -f smartcontracts/docker-compose.yml --profile e2e-full config --quiet
```

Валидация Lit E2E:

```bash
docker compose -f smartcontracts/docker-compose.lit.yml config --quiet
```

RPC health:

```bash
curl -s localhost:26750/status
```

Mock SP health:

```bash
curl -s localhost:9000/healthz
```

Chipotle mock health:

```bash
curl -s localhost:8000/core/v1/version
```

## Диагностика

Ошибка:

```text
global virtual group family statistics not exist
```

Обычно означает, что Greenfield SDK начал upload до полной готовности GVG/family statistics. Проверять:

- успел ли `bootstrap_gvg` выполниться
- создается ли `/tmp/gvg_bootstrapped`
- не слишком ли рано healthcheck считает `greenfield-local` healthy
- совпадают ли `SPS`, `GF_CHAIN_ID`, `GF_RPC`, `GF_SP`

Port conflicts:

- `8000`: Chipotle API или mock
- `8545`: Chipotle anvil
- `9545`: user-contract anvil
- `9033`: Greenfield SP
- `26750`: Tendermint RPC

Для внешних Chipotle/dstack зависимостей проверять:

- `CHIPOTLE_DIR`
- `SIMULATOR_DIR`
