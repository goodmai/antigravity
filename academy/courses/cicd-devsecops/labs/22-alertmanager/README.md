# Lab 22 — Alertmanager → Telegram + Slack + Discord одновременно

> Модуль 7 · 2 ч · Sandbox: docker-compose · DSOMM: *Implementation — Multi-channel alert routing*

## Задача

Один Alertmanager отправляет алёрты в **три** канала. Используем Apprise как
middleware для унификации форматов.

## Шаги

1. Поднять Prometheus + Alertmanager + Apprise (caronc/apprise) в docker-compose.
2. Apprise-конфиг (`config.yml`):
   ```yaml
   urls:
     - tgram://${TG_TOKEN}/${TG_CHAT}/
     - slack://${T1}/${T2}/${T3}/
     - discord://${WEBHOOK_ID}/${WEBHOOK_TOKEN}/
   ```
3. Alertmanager:
   ```yaml
   receivers:
     - name: triple
       webhook_configs:
         - url: http://apprise:8000/notify
           send_resolved: true
   route: { receiver: triple }
   inhibit_rules:
     - source_match: { severity: critical }
       target_match: { severity: warning }
       equal: [alertname]
   ```
4. Сгенерить алёрт (положить app, чтобы 5xx > 5%) → проверить, что приехал
   во все три канала с одинаковым контентом.
5. Сгенерить два алёрта подряд по тому же объекту (critical + warning) — должен
   приехать только critical.

## Acceptance

- [ ] Алёрт приходит во **все три** канала.
- [ ] `send_resolved: true` — resolved-event тоже доезжает.
- [ ] Inhibit rule срабатывает.
- [ ] Один источник правды (Alertmanager), не дублирующий webhook'и.

## Rubric: 1 — TG; 2 — TG+Slack; 3 — все три; 4 — inhibit; 5 — Grafana OnCall integration для on-call rotation.
