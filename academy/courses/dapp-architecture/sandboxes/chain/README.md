# Sandbox: chain

Децентрализованные «кирпичи» Модуля 3 локально: Anvil (локальная EVM —
блокчейн как backend), IPFS Kubo (контент-адресуемое хранилище),
Graph Node (индексация событий = операционные данные). Без газа и
без тестнет-кранов. Используется в уроках 3.3–3.6 и 3.11.

## Запуск

```bash
docker compose up -d
# graph-node стартует ~30–60 c — дождитесь healthy postgres
```

## Smoke

```bash
# Compute/State — Anvil отвечает на JSON-RPC, выдаёт 10 финансированных аккаунтов
curl -s -X POST http://localhost:8545 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}'

# Storage — IPFS добавляет контент, возвращает CID
echo "marketplace work #1" | \
  docker compose exec -T ipfs ipfs add -q          # → Qm... (CID)

# Индекс — Graph Node healthcheck
curl -s http://localhost:8030/graphql -H 'Content-Type: application/json' \
  -d '{"query":"{ indexingStatuses { subgraph health } }"}'
```

## Что попробовать

- **Урок 3.3** — задеплоить контракт `Marketplace` в Anvil
  (`forge create` через образ foundry), купить «работу», увидеть событие.
- **Урок 3.4** — положить описание работы в IPFS, хранить только CID
  on-chain; сравнить стоимость с «всё в Postgres» из `classic/`.
- **Урок 3.5/3.6** — content addressing: изменил байт → изменился CID.
- **Урок 3.11** — задеплоить subgraph в Graph Node, читать ленту
  GraphQL-запросом вместо прямого чтения из контракта.

> Anvil мгновенно «финализирует» блоки — реоргов нет. Поведение
> финализации/реоргов из урока 3.11 моделируется отдельно (теория).

## Reset

```bash
docker compose down -v
```
