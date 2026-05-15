# Lab 12 — Renovate config с группировкой и автомерджем

> Модуль 4 · 1 ч · Sandbox: local · DSOMM: *Implementation — Dependency check*

## Задача

Подключить Renovate Bot, настроить группировку, автомердж патчей, pin
digests для Docker.

## Шаги

1. Install [Renovate GitHub App](https://github.com/apps/renovate).
2. `renovate.json` (см. lesson 4.3).
3. После первой run-job Renovate откроет «Configure Renovate» PR — мерджим.
4. Дальше Renovate сам шлёт PR.
5. Проверяем:
   - patch-bump npm-deps мерджится автоматически (после CI green),
   - security-PR имеет label `security` + автомердж,
   - `docker:` зависимости получают digest pin.

## Acceptance

- [ ] Dependency Dashboard issue открыт.
- [ ] Шаги 5.1–5.3 проверены.
- [ ] `lockFileMaintenance` бежит еженедельно по понедельникам.

## Rubric: 1 — Renovate активен; 2 — кастомная конфигурация; 3 — automerge патчей; 4 — pinDigests; 5 — self-hosted Renovate (для air-gapped команды).
