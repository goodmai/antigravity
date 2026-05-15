# Sandbox: classic

Классические «кирпичи» Модуля 1 локально, без облака: PostgreSQL (State),
Redis (кэш), Kafka в KRaft-режиме (Messaging), MinIO (Storage, S3 API).
Используется в уроках 1.5–1.7 и 1.10.

## Запуск

```bash
docker compose up -d
```

## Smoke

```bash
# State — PostgreSQL
docker compose exec postgres psql -U app -d marketplace -c "select version();"

# Кэш — Redis
docker compose exec redis redis-cli set ping pong
docker compose exec redis redis-cli get ping        # → "pong"

# Messaging — Kafka (создать топик и проверить)
docker compose exec kafka kafka-topics.sh \
  --bootstrap-server localhost:9092 --create --topic payments --if-not-exists
docker compose exec kafka kafka-topics.sh \
  --bootstrap-server localhost:9092 --list           # → payments

# Storage — MinIO (S3-совместимый), консоль на http://localhost:9001
docker compose exec minio mc alias set local http://localhost:9000 minio minio12345
docker compose exec minio mc mb local/works
docker compose exec minio mc ls local                # → works/
```

## Что попробовать

- **Урок 1.5** — применить expand-contract миграцию к таблице `orders`.
- **Урок 1.6** — паттерн outbox: писать событие в Postgres-таблицу
  `outbox` в той же транзакции, релеить в топик `payments`.
- **Урок 1.7** — presigned PUT в MinIO: загрузка медиа минуя бэкенд.
- **Урок 1.10** — убить `postgres`, посмотреть деградацию и backpressure.

## Reset

```bash
docker compose down -v
```
