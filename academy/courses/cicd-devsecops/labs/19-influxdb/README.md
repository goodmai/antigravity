# Lab 19 — InfluxDB v2 + Telegraf + Flux downsampling

> Модуль 6 · 2 ч · Sandbox: docker-compose · DSOMM: *Information Gathering — Long-term retention*

## Задача

Поднять InfluxDB v2 в docker-compose, Telegraf собирает CPU/mem/диск,
Flux-task делает 1-минутный downsampling в долгосрочный bucket.

## Шаги

1. `docker-compose.yml` с InfluxDB v2 + Telegraf + Grafana.
2. `telegraf.conf` (см. lesson 6.3).
3. В InfluxDB UI создать org `daskibo`, bucket `metrics` (RP 7d) и
   `metrics_1h` (RP 90d), сгенерить token.
4. Создать Flux task downsampling (lesson 6.3).
5. Grafana datasource Flux → дашборд CPU за 30 дней (видны downsampled данные).

## Acceptance

- [ ] Telegraf пишет в `metrics`.
- [ ] Flux-task бежит каждый час.
- [ ] `metrics` имеет TTL 7d, `metrics_1h` — 90d.
- [ ] Grafana дашборд показывает данные за 30 дней без замедления.

## Rubric: 1 — Telegraf пишет; 2 — Flux task; 3 — Grafana через Flux; 4 — Alerts через Flux + Slack; 5 — Edge collection (несколько Telegraf инстансов на разных хостах).
