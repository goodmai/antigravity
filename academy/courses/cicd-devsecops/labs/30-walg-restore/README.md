# Lab 30 — WAL-G backup → MinIO + restore rehearsal в CI

> Модуль 11 · 3 ч · Sandbox: docker (Postgres + MinIO) · DSOMM: *Operations — Tested backups*

## Задача

Настроить WAL-G для Postgres, бэкапы летят в MinIO, в CI бежит **еженедельный**
restore-rehearsal: поднять чистый Postgres из бэкапа, прогнать smoke-тесты.

## Шаги

1. docker-compose: Postgres + MinIO.
2. Установить WAL-G в Postgres-контейнер, настроить `archive_command`.
3. `wal-g backup-push` → полный бэкап в MinIO.
4. Симулировать инсерты, ещё бэкап.
5. CI cron-job `restore-rehearsal.yml`:
   - поднимает чистый Postgres,
   - `wal-g backup-fetch LATEST`,
   - `pg_isready` + `SELECT count(*) FROM …` → smoke.
6. Если restore не прошёл — алёрт в TG/Slack/Discord.

## Acceptance

- [ ] Бэкапы в MinIO (видны в UI).
- [ ] WAL-archiving работает (`pg_stat_archiver`).
- [ ] Restore из бэкапа поднимается за < 5 минут.
- [ ] Restore-rehearsal раз в неделю зелёный.

## Rubric: 1 — backup; 2 — restore вручную; 3 — restore в CI; 4 — алёрт на падение; 5 — PITR (point-in-time recovery) — восстановить до конкретной секунды.
