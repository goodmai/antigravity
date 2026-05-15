# Sandboxes — изолированные среды для практики

> 4 готовых стенда «docker compose up && всё работает». Без облака,
> без оплаты, без блокчейн-комиссий. Каждая песочница — это одна и та
> же сетка из 9 «кирпичей», но в своей парадигме.

## Список

| Sandbox | Стек | Проекция | Уроки |
|---|---|---|---|
| [`classic/`](./classic/) | API + PostgreSQL + Redis + Kafka + MinIO | Модуль 1 — классика | 1.5–1.7, 1.10 |
| [`gcp-lite/`](./gcp-lite/) | Firestore + Pub/Sub + fake-gcs эмуляторы | Модуль 2 — Google Cloud | 2.3–2.6 |
| [`chain/`](./chain/) | Anvil + IPFS Kubo + Graph Node | Модуль 3 — децентрализация | 3.3–3.6, 3.11 |
| [`depin/`](./depin/) | Akash CLI + libp2p demo | Модуль 3 — DePIN | 3.2, 3.8 |

## Запуск

```bash
cd sandboxes/<name>
docker compose up -d
# smoke-checks и пояснения — в README.md внутри каждой папки
```

## Общие требования

- Docker 24+ и docker-compose v2.
- 12 GB RAM (общий лимит для всех контейнеров одной песочницы).
- Linux/macOS host. На Windows — через WSL2.

## Зачем sandbox-first

1. **Сравнение, а не вера.** Один и тот же сценарий («оплата → выплата
   автору») прогоняется в трёх парадигмах — видна разница в latency и
   операционной сложности руками, а не по слайдам.
2. **Air-gapped.** Никаких облачных аккаунтов и тестовых токенов:
   эмуляторы GCP и локальная EVM-цепочка работают офлайн.
3. **Воспроизводимо.** Все версии запинены в `docker-compose.yml`.
4. **Reset за минуту.** `docker compose down -v && docker compose up -d`.

## Reset

```bash
cd sandboxes/<name>
docker compose down -v
```
