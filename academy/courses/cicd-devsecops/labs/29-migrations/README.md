# Lab 29 — Online migration с Atlas + rollback

> Модуль 11 · 2 ч · Sandbox: docker (Postgres) · DSOMM: *Operations — Schema migrations as code*

## Задача

Сделать migration через [Atlas](https://atlasgo.io) с expand-contract паттерном
(rename column без downtime), gate `atlas migrate lint` в CI, проверить
rollback.

## Шаги

1. Старт: таблица `users(id, email, name)`.
2. **Expand**: add column `display_name` (+ trigger или backfill job).
3. **Backfill**: `UPDATE users SET display_name = name WHERE display_name IS NULL`.
4. **Dual-read**: код читает `COALESCE(display_name, name)`.
5. **Switch reader**: код читает только `display_name`.
6. **Contract**: `DROP COLUMN name` (через 1 неделю).
7. На каждом шаге `atlas migrate lint --env prod` должен пройти.

## Acceptance

- [ ] Все шаги — атомарные миграции, без блокировки таблицы.
- [ ] `atlas migrate lint` отлавливает destructive в неподходящий момент.
- [ ] CI применяет миграции к staging перед prod.
- [ ] Rollback миграции работает (down-скрипт).

## Rubric: 1 — миграция применяется; 2 — expand-contract; 3 — atlas lint в CI; 4 — rollback; 5 — schema-aware integration tests (pg-tap или verify).
