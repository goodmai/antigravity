# Sandbox: gcp-lite

Паттерны Модуля 2 на официальных эмуляторах Google Cloud — без счёта,
без сервис-аккаунтов, офлайн. Firestore (State), Pub/Sub (Messaging),
fake-gcs (Storage вместо Cloud Storage). Используется в уроках 2.3–2.6.

## Запуск

```bash
docker compose up -d
```

## Smoke

```bash
# Точки входа эмуляторов
export FIRESTORE_EMULATOR_HOST=localhost:8080
export PUBSUB_EMULATOR_HOST=localhost:8085

# Firestore — эмулятор отвечает
curl -s "http://localhost:8080/" && echo " firestore OK"

# Pub/Sub — создать топик и подписку через REST
curl -s -X PUT "http://localhost:8085/v1/projects/demo/topics/payments"
curl -s -X PUT "http://localhost:8085/v1/projects/demo/subscriptions/payouts" \
  -H "Content-Type: application/json" \
  -d '{"topic":"projects/demo/topics/payments"}'

# Storage — fake-gcs
curl -s -X POST "http://localhost:4443/storage/v1/b?project=demo" \
  -H "Content-Type: application/json" -d '{"name":"works"}'
curl -s "http://localhost:4443/storage/v1/b" && echo " gcs OK"
```

## Что попробовать

- **Урок 2.3** — тот же домен на документной модели Firestore: где
  это выигрывает у реляционки из `classic/`, где проигрывает.
- **Урок 2.4** — event-flow «оплата → выплата» на Pub/Sub; убедиться,
  что доставка at-least-once → обработчик идемпотентен.
- **Урок 2.5** — signed URL-аналог через fake-gcs.
- **Урок 2.6** — смоделировать Workload Identity: приложение ходит в
  эмуляторы без ключевого JSON-файла.

> Эмуляторы НЕ воспроизводят квоты, IAM и латентность реального GCP —
> они учат API и паттернам, а не SLA.

## Reset

```bash
docker compose down -v
```
