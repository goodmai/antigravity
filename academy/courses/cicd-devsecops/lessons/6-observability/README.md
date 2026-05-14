# Module 6 — Observability

> Prometheus + PromQL, Grafana-as-code, InfluxDB v2 + Telegraf + Flux,
> Loki/Tempo/OpenTelemetry, SLO/SLI и multi-burn-rate alerts.

---

## 6.1 · Prometheus: модель данных, PromQL

**Канон:** [Prometheus docs](https://prometheus.io/docs/),
[PromQL primer](https://promlabs.com/promql-cheat-sheet/),
[Prometheus operator](https://github.com/prometheus-operator/prometheus-operator),
[OpenMetrics spec](https://openmetrics.io).

### Модель

```
metric_name{label_a="v1", label_b="v2"} value @ timestamp
```

Все метрики — **числовые** time-series. Лейблы делают серии уникальными
(не суйте `user_id` в лейбл — взорвётся кардинальность).

**4 типа** (OpenMetrics):
- `counter` — только растёт (или ресетится на 0): `http_requests_total`.
- `gauge` — может идти вверх и вниз: `temperature_celsius`.
- `histogram` — с buckets, считает распределение: `http_request_duration_seconds_bucket{le="0.5"}`.
- `summary` — с quantiles (менее предпочтителен; histogram + `histogram_quantile()` лучше).

### PromQL — 10 паттернов

```promql
# RPS за 5 минут
rate(http_requests_total[5m])

# 99-перцентиль latency
histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))

# Error rate (RED)
sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m]))

# CPU usage по поду (USE)
rate(container_cpu_usage_seconds_total{pod="app-xyz"}[5m])

# Top-5 endpoint'ов по латенси
topk(5, histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket[5m])) by (le, endpoint)))

# Заметить «упало» (deadman)
absent(up{job="app"} == 1)

# Прогноз заполнения диска через 4 часа
predict_linear(node_filesystem_avail_bytes[1h], 4*3600) < 0
```

### Простой Go-экспортер

```go
import "github.com/prometheus/client_golang/prometheus/promauto"

var requestsTotal = promauto.NewCounterVec(
    prometheus.CounterOpts{ Name: "myapp_requests_total" },
    []string{"endpoint", "status"})
```

### Service discovery + relabeling

```yaml
# prometheus.yml
scrape_configs:
  - job_name: kubernetes-pods
    kubernetes_sd_configs: [ { role: pod } ]
    relabel_configs:
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
        action: keep
        regex: "true"
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_path]
        target_label: __metrics_path__
        regex: (.+)
```

**Лаба 18** — экспортер на Go + Prometheus + alerting rule.

---

## 6.2 · Grafana: дашборды как код

**Канон:** [Grafana docs](https://grafana.com/docs/grafana/latest/),
[Grafana provisioning](https://grafana.com/docs/grafana/latest/administration/provisioning/),
[grafonnet (Jsonnet)](https://github.com/grafana/grafonnet),
[Grafana OnCall](https://grafana.com/docs/oncall/latest/).

### Datasource + Dashboard provisioning

```yaml
# /etc/grafana/provisioning/datasources/prometheus.yml
apiVersion: 1
datasources:
  - name: Prometheus
    type: prometheus
    url: http://prometheus:9090
    isDefault: true
```

```yaml
# /etc/grafana/provisioning/dashboards/dashboards.yml
apiVersion: 1
providers:
  - name: 'default'
    folder: 'App'
    options:
      path: /var/lib/grafana/dashboards
```

Дашборды-JSON лежат в git. Изменения — через PR. **Никаких ручных правок в UI**
(они потеряются при перезапуске или перезатрутся git-state).

### Golden Dashboard (RED/USE) — шаблон

- **Rate**: `sum by (endpoint) (rate(http_requests_total[1m]))`
- **Errors**: `sum(rate(http_requests_total{status=~"5.."}[1m]))`
- **Duration**: `histogram_quantile(0.99, ...)`
- **CPU/Memory**: `rate(container_cpu_usage_seconds_total[1m])`,
  `container_memory_working_set_bytes`
- **Saturation**: queue length, GC pause time.

### Grafana OnCall — alerting routing

`oncall.yml`:

```yaml
integrations:
  - name: prometheus-prod
    type: alertmanager
routes:
  - match: { severity: "critical" }
    notify: [ phone, telegram, slack ]
  - match: { severity: "warning" }
    notify: [ slack ]
```

Связка с Module 7 — push в TG/Slack/Discord.

---

## 6.3 · InfluxDB v2 + Telegraf

**Канон:** [InfluxDB v2 docs](https://docs.influxdata.com/influxdb/v2/),
[Telegraf plugins](https://docs.influxdata.com/telegraf/v1/plugins/),
[Flux language](https://docs.influxdata.com/flux/v0/).

**Когда InfluxDB вместо Prometheus:**

- **IoT** и **event-driven** метрики (с тегами высокой кардинальности).
- Долгие ретеншены с downsampling (Prometheus тут слабее без Thanos/Mimir/Cortex).
- Метрики **бизнес-уровня** (продажи, клики), не только инфра.

### Telegraf → InfluxDB

```toml
# telegraf.conf
[agent]
  interval = "10s"
  flush_interval = "10s"

[[inputs.cpu]]
[[inputs.mem]]
[[inputs.docker]]
[[inputs.http]]
  urls = ["https://myapp.example.com/health"]
  data_format = "json"

[[outputs.influxdb_v2]]
  urls = ["http://influxdb:8086"]
  token = "$INFLUX_TOKEN"
  organization = "myorg"
  bucket = "metrics"
```

### Flux: downsampling + retention

```flux
// каждый час пишем агрегаты в bucket "metrics_1h" (RP = 90d)
option task = {name: "downsample-1h", every: 1h}

from(bucket: "metrics")
  |> range(start: -1h)
  |> filter(fn: (r) => r._measurement == "http")
  |> aggregateWindow(every: 1m, fn: mean)
  |> to(bucket: "metrics_1h", org: "myorg")
```

В bucket'е `metrics` — retention 7d (raw, дорого), в `metrics_1h` — 90d
(дёшево). Это **downsampling pyramid**.

**Лаба 19** — Telegraf → InfluxDB → Grafana, IoT-метрики устройств с downsampling.

---

## 6.4 · Логи и трейсы: Loki, Tempo, OpenTelemetry

**Канон:** [Loki docs](https://grafana.com/docs/loki/),
[Tempo docs](https://grafana.com/docs/tempo/),
[OpenTelemetry spec](https://opentelemetry.io/docs/specs/),
[Google SRE book — Monitoring distributed systems](https://sre.google/sre-book/monitoring-distributed-systems/).

**3 пилона observability:**

1. **Metrics** — Prometheus/InfluxDB. Числа во времени, сжимаемые.
2. **Logs** — Loki (label-indexed, как Prometheus для логов). Не индексирует
   полный текст → дёшево.
3. **Traces** — Tempo (или Jaeger). Span'ы с trace_id, корреляция cross-service.

**Корреляция:** одна и та же `trace_id` лежит в логе, в метрике (как exemplar)
и в трейсе. Кликнули по метрике в Grafana → попали в trace → попали в логи
этого trace_id. Это **exemplars** в Prometheus 2.

### OpenTelemetry Collector

```yaml
receivers:
  otlp:
    protocols: { grpc: { endpoint: 0.0.0.0:4317 } }
processors:
  batch: {}
  resourcedetection: { detectors: [env, system, gcp, ec2] }
exporters:
  prometheus: { endpoint: 0.0.0.0:9464 }
  loki:       { endpoint: http://loki:3100/loki/api/v1/push }
  otlp/tempo: { endpoint: tempo:4317, tls: { insecure: true } }
service:
  pipelines:
    metrics: { receivers: [otlp], processors: [batch, resourcedetection], exporters: [prometheus] }
    logs:    { receivers: [otlp], processors: [batch], exporters: [loki] }
    traces:  { receivers: [otlp], processors: [batch], exporters: [otlp/tempo] }
```

Один Collector принимает OTLP — раскладывает в Prom/Loki/Tempo. Это
**vendor-neutral**.

---

## 6.5 · SLO/SLI и multi-burn-rate alerts

**Канон:** [Google SRE Workbook — Implementing SLOs](https://sre.google/workbook/implementing-slos/),
[Sloth](https://github.com/slok/sloth), [Pyrra](https://github.com/pyrra-dev/pyrra),
[Alerting on SLOs](https://sre.google/workbook/alerting-on-slos/).

**SLI** — измерение. **SLO** — цель. **Error Budget** — 1 - SLO за окно.

Пример:
- SLI: `success_rate = good_requests / total_requests` за rolling 30d.
- SLO: 99.9% за 30d.
- Error budget: 0.1% за 30d ≈ **43.2 минуты** допустимых ошибок.

### Multi-window multi-burn-rate (MWMBR)

Не алёртим на «5xx > 1%» — это шум. Алёртим на **прогнозную скорость
сжигания бюджета**.

```yaml
groups:
- name: slo-app
  rules:
  - alert: ErrorBudgetBurnFast
    # за 1ч сжигаем 14.4× обычной скорости — выгорим за 2 дня
    expr: |
      ( job:error_rate:ratio5m{job="app"} > 14.4 * 0.001 )
      and
      ( job:error_rate:ratio1h{job="app"} > 14.4 * 0.001 )
    for: 2m
    labels: { severity: critical }
  - alert: ErrorBudgetBurnSlow
    # за 6ч сжигаем 6× — выгорим через 5 дней
    expr: |
      ( job:error_rate:ratio30m{job="app"} > 6 * 0.001 )
      and
      ( job:error_rate:ratio6h{job="app"}  > 6 * 0.001 )
    for: 15m
    labels: { severity: warning }
```

Два окна (короткое + длинное) защищают от:

- Ложных тревог (короткие пики не запускают warning).
- Пропуска медленной деградации (длинное окно ловит её).

**Sloth/Pyrra** сами генерируют эти правила из YAML-spec:

```yaml
# sloth-spec.yaml
version: "prometheus/v1"
service: "app"
slos:
  - name: "availability"
    objective: 99.9
    sli:
      events:
        error_query: sum(rate(http_requests_total{status=~"5.."}[{{.window}}]))
        total_query: sum(rate(http_requests_total[{{.window}}]))
    alerting:
      page_alert: { labels: { severity: critical } }
      ticket_alert: { labels: { severity: warning } }
```

```bash
sloth generate -i sloth-spec.yaml -o slo-rules.yaml
```

---

## Чек-лист модуля

- [ ] Prometheus собирает метрики через k8s SD + relabel.
- [ ] Grafana-дашборды лежат в git и провижонятся, не правятся вручную.
- [ ] InfluxDB используется там, где нужна высокая кардинальность / downsampling.
- [ ] OpenTelemetry Collector — единая точка входа метрик/логов/трейсов.
- [ ] Logs (Loki) и traces (Tempo) коррелируются по trace_id.
- [ ] Алёрты сформированы как MWMBR от SLO, не «5xx > N».
- [ ] Sloth/Pyrra генерируют правила из spec.

## Лабы модуля

- [Lab 18 — Prometheus exporter + alert](../../labs/18-prometheus/)
- [Lab 19 — InfluxDB + Telegraf + Flux](../../labs/19-influxdb/)
