# Lab 21 — Slack `/deploy` ChatOps

> Модуль 7 · 2 ч · Sandbox: local · DSOMM: *Culture — ChatOps; Implementation — Audit trail*

## Задача

Создать Slack App с slash-command `/deploy <service> <version>`, которая
триггерит `workflow_dispatch` в GH Actions. Проверять подпись, иметь
allowlist пользователей, писать команду в audit-log (InfluxDB).

## Шаги

1. Создать Slack App, slash-command `/deploy`, BOT token + signing secret.
2. Сервис на Bolt-JS (см. lesson 7.2).
3. Проверка подписи: HMAC-SHA256 от `v0:<timestamp>:<body>` с
   `SLACK_SIGNING_SECRET`, timestamp в пределах 5 минут.
4. Allowlist `user_id → services` в YAML.
5. После execute — `INSERT INTO audit (...) VALUES (...)` в InfluxDB.
6. GH Actions `workflow_dispatch` принимает inputs `service`, `version`.

## Acceptance

- [ ] Команда работает, но падает при неверной подписи.
- [ ] Пользователь не из allowlist получает «🚫 not allowed».
- [ ] Каждое выполнение пишется в audit-лог.
- [ ] Workflow в GH триггерится.

## Rubric: 1 — команда отвечает; 2 — verify signature; 3 — allowlist; 4 — audit + workflow trigger; 5 — interactive buttons для confirm (защита от мисскликов).
