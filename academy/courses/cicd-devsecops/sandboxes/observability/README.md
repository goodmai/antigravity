# Sandbox: observability

Полный observability-стек локально: Prometheus + Grafana + InfluxDB v2 +
Telegraf + Loki + Tempo + Alertmanager + Apprise.

## Запуск

```bash
docker compose up -d
```

## Доступы

| Сервис | URL | Логин |
|---|---|---|
| Grafana | http://localhost:3000 | admin / admin |
| Prometheus | http://localhost:9090 | — |
| InfluxDB UI | http://localhost:8086 | admin / changeme123 |
| Alertmanager | http://localhost:9093 | — |
| Tempo | http://localhost:3200 | — |
| Loki | http://localhost:3100 | — |
| Apprise | http://localhost:8000 | — |

## Smoke-check

```bash
# Prometheus собирает targets
curl -s http://localhost:9090/api/v1/targets | jq '.data.activeTargets[] | {labels, health}'

# Grafana проксирует
curl -s http://localhost:3000/api/health

# InfluxDB
curl -s http://localhost:8086/health
```

## Связанные лабы

- [Lab 18 — Prometheus exporter + alert](../../labs/18-prometheus/)
- [Lab 19 — InfluxDB + Telegraf + Flux](../../labs/19-influxdb/)
- [Lab 22 — Alertmanager → TG+Slack+Discord](../../labs/22-alertmanager/)

## Reset

```bash
docker compose down -v
```
