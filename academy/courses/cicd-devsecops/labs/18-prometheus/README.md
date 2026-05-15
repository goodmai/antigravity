# Lab 18 — Prometheus exporter + alerting rule

> Модуль 6 · 2 ч · Sandbox: docker-compose · DSOMM: *Information Gathering — Metrics*

## Задача

Написать Go-экспортер с 1 counter и 1 histogram, поднять Prometheus + Grafana
в docker-compose, добавить alerting rule + Alertmanager → webhook.

## Шаги

1. Минимальный экспортёр на Go (см. lesson 6.1).
2. `docker-compose.yml` с Prometheus + Grafana + Alertmanager.
3. `prometheus.yml` со scrape job.
4. `rules.yml`:
   ```yaml
   groups:
     - name: app
       rules:
         - alert: HighErrorRate
           expr: rate(myapp_requests_total{status=~"5.."}[5m]) > 0.05
           for: 2m
           labels: { severity: warning }
           annotations:
             summary: "{{ $labels.instance }} error rate {{ $value }}"
   ```
5. Сломать сервис → ждать алёрт → увидеть его в Alertmanager UI и (по желанию) webhook.

## Acceptance

- [ ] `/metrics` отдаёт корректный OpenMetrics.
- [ ] Prometheus скрейпит и хранит.
- [ ] Алёрт зажигается ровно через `for: 2m`.
- [ ] Grafana-дашборд провижонится из git.

## Rubric: 1 — метрики идут; 2 — Grafana показывает; 3 — alert работает; 4 — multi-burn-rate alert на SLO; 5 — exemplars в trace (см. Tempo).
