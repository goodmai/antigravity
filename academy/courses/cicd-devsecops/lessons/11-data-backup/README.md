# Module 11 — Data: DB в CI/CD, репликация, бэкап

> Online-миграции БД в пайплайне, Postgres streaming/logical replication,
> бэкапы 3-2-1-1-0 (WAL-G, pgBackRest, Velero, S3 Object Lock), DR-rehearsal.

---

## 11.1 · DB в CI/CD

**Канон:** [Refactoring Databases (S. Ambler)](https://databaserefactoring.com),
[gh-ost (GitHub)](https://github.com/github/gh-ost),
[pt-online-schema-change](https://docs.percona.com/percona-toolkit/pt-online-schema-change.html),
[Atlas](https://atlasgo.io), [Flyway](https://flywaydb.org), [Liquibase](https://www.liquibase.org),
[Sqitch](https://sqitch.org).

### Главное правило: миграции — это **код**, который катится **отдельным шагом**.

```
build → migrate (idempotent) → smoke → cutover → release
```

Никаких `ALTER TABLE` в `application.startup()`. Никаких ручных DBA-сессий
по пятницам.

### Expand-Contract (zero-downtime schema)

Нельзя за один шаг сделать `ALTER COLUMN type` без блокировки. Подход:

1. **Expand**: добавляем новую колонку/таблицу, без drop.
2. **Backfill**: фоном переписываем данные в новый формат.
3. **Dual-write/dual-read**: оба формата живут одновременно.
4. **Switch reader**: меняем код на чтение из нового.
5. **Switch writer**: пишем только в новое.
6. **Contract**: дропаем старое (через пару недель, не сразу).

### Online DDL для MySQL / MariaDB

```bash
gh-ost --user=admin --password=$PWD --host=mysql.prod \
       --database=app --table=orders \
       --alter="ADD COLUMN delivered_at DATETIME NULL" \
       --execute
```

`gh-ost` создаёт shadow-table, копирует с rate-limit, ловит binlog-изменения,
делает atomic swap. **0 секунд** блокировки.

### Atlas (declarative migrations)

```hcl
table "users" {
  schema = schema.public
  column "id"    { type = bigint, identity = true }
  column "email" { type = text }
  index "uq_email" { unique = true, columns = [column.email] }
}
```

```bash
atlas migrate diff --env prod        # сгенерит SQL-патч
atlas migrate lint --env prod        # проверит на опасные паттерны
atlas migrate apply --env prod       # применит
```

`atlas migrate lint` ругается на нарушения safety-rules:
- destructive (DROP COLUMN, DROP TABLE) — требует ack;
- backwards-incompatible — warning;
- non-concurrent index — warning (для Postgres `CREATE INDEX CONCURRENTLY`).

### Migration в CI

```yaml
- name: Lint migrations
  run: atlas migrate lint --env prod --base atlas://main

- name: Apply to staging
  run: atlas migrate apply --env staging --tx-mode all

- name: Smoke tests
  run: ./scripts/smoke.sh

- name: Apply to prod
  if: github.ref == 'refs/heads/main'
  environment: prod                  # required reviewers + 2FA
  run: atlas migrate apply --env prod --tx-mode all

- name: Rollback plan
  if: failure()
  run: atlas migrate rollback --env prod    # если поддерживает down-миграцию
```

**Лаба 29** — pre-deploy миграция + откат + Atlas lint gate.

---

## 11.2 · Репликация

**Канон:** [Postgres replication docs](https://www.postgresql.org/docs/current/high-availability.html),
[MySQL GTID replication](https://dev.mysql.com/doc/refman/8.0/en/replication-gtids.html),
[Patroni docs](https://patroni.readthedocs.io),
[Galera Cluster](https://galeracluster.com/library/documentation/).

### Postgres: streaming vs logical

| | Streaming (physical) | Logical |
|---|---|---|
| Что копирует | WAL побайтово | row-level events |
| Selective tables | нет | да |
| Cross-version | нет | **да** (для major upgrade без downtime) |
| Кейсы | HA-pair, read-replica | upgrade, MV, multi-tenant fan-out |

### Patroni (auto-failover для Postgres)

```yaml
# patroni.yml
scope: cluster1
namespace: /service/
restapi: { listen: 0.0.0.0:8008 }
etcd: { hosts: etcd1:2379,etcd2:2379,etcd3:2379 }
bootstrap:
  dcs:
    ttl: 30
    loop_wait: 10
    retry_timeout: 10
    maximum_lag_on_failover: 1048576
    postgresql:
      use_pg_rewind: true
      parameters:
        wal_level: logical
        max_wal_senders: 10
        max_replication_slots: 10
        hot_standby: "on"
```

Patroni следит за лидером через etcd. Падение лидера → автопромоушн самой
свежей реплики. RTO ≈ 30s.

### Кворум

- 3 узла — выдержит 1 падение.
- 5 узлов — выдержит 2.
- 2 узла + arbiter — дешёвый split-brain protection.

---

## 11.3 · Бэкапы: 3-2-1-1-0

**Канон:** [Veeam 3-2-1-1-0 rule](https://www.veeam.com/blog/321-backup-rule.html),
[WAL-G](https://wal-g.readthedocs.io),
[pgBackRest](https://pgbackrest.org),
[Velero docs](https://velero.io/docs/),
[Restic](https://restic.net), [Borg](https://www.borgbackup.org/),
[Litestream (SQLite → S3)](https://litestream.io).

**Правило:**

| | Значение |
|---|---|
| **3** | копии данных |
| **2** | разных носителя |
| **1** | offsite |
| **1** | offline / immutable |
| **0** | ошибок в тестовых восстановлениях |

«**0**» — единственная метрика, на которую все забивают. Проверяйте restore
**в каждом релизе**.

### WAL-G для Postgres

```bash
# Полный бэкап
wal-g backup-push /var/lib/postgresql/16/main

# Continuous archive (в postgresql.conf):
#   archive_mode = on
#   archive_command = 'wal-g wal-push %p'

# Restore до момента
wal-g backup-fetch /var/lib/postgresql/16/main LATEST
# дальше recovery.signal + recovery_target_time = '2026-05-14 12:00:00'
```

`wal-g` пишет в S3/GCS/Azure Blob. Поддерживает дельта-бэкапы (быстрее)
и шифрование PGP/libsodium.

### S3 Object Lock (immutable)

```bash
aws s3api put-object-lock-configuration --bucket my-backups \
  --object-lock-configuration '{
    "ObjectLockEnabled": "Enabled",
    "Rule": {
      "DefaultRetention": { "Mode": "COMPLIANCE", "Days": 30 }
    }
  }'
```

`Mode: COMPLIANCE` — никто (даже root account) не может удалить объект в
течение N дней. Защита от ransomware и от angry-admin.

### Velero для k8s

```bash
velero install --provider aws --bucket k8s-backups \
  --secret-file ./aws-creds --use-volume-snapshots=true \
  --use-restic
velero backup create daily-$(date +%F) --include-namespaces prod
velero schedule create daily --schedule "0 2 * * *" --include-namespaces prod
```

Backup'ит **manifests + PVC-snapshots** (через CSI). Restore — точка-в-точку.

### Restic / Borg для файловых систем

```bash
restic -r b2:my-bucket:repo init
restic -r b2:my-bucket:repo backup /home/user
restic -r b2:my-bucket:repo forget --keep-daily 7 --keep-weekly 4 --keep-monthly 12 --prune
```

Дедупликация на блоковом уровне → инкрементальный по факту, но restore любой
точки даёт «полную» копию.

**Лаба 30** — WAL-G в MinIO + restore-rehearsal в CI (восстановили БД,
прогнали smoke-тесты).

---

## 11.4 · DR-тренировки

**Канон:** [Google SRE — Postmortem culture](https://sre.google/sre-book/postmortem-culture/),
[ChaosMesh](https://chaos-mesh.org), [LitmusChaos](https://litmuschaos.io),
[AWS GameDay](https://aws.amazon.com/gameday/).

**Game Day** — раз в квартал имитируем падение:

1. Раз в месяц — restore из бэкапа в отдельный namespace, прогон smoke.
2. Раз в квартал — «Patroni убит» в staging.
3. Раз в полгода — «region недоступен» (через BGP-блок или Chaos).
4. Раз в год — полный fire-drill: «прода нет, поднимаем с нуля по runbook'у».

**Runbook = git-документ + автоматизация**:

```markdown
# Runbook: Postgres region failover
## Trigger: primary-region недоступен > 5 минут
## Steps:
1. `kubectl ctx dr-region`
2. `patronictl failover --candidate dr-replica-1`
3. Обновить DNS: `terraform -chdir=infra/dns apply -target=cnames.db`
4. Verify: `psql -h db.example.com -c 'SELECT now()'`
5. Notify: Telegram + Slack + status page
## Verification:
- [ ] read/write работает
- [ ] репликация в обратную сторону запустилась
- [ ] no data loss (last 60s — потеря приемлема, > 5 мин — escalate)
## Rollback:
...
```

LitmusChaos workflow:

```yaml
apiVersion: litmuschaos.io/v1alpha1
kind: ChaosEngine
metadata: { name: pod-kill }
spec:
  appinfo: { appns: prod, applabel: app=api, appkind: deployment }
  chaosServiceAccount: litmus-admin
  experiments:
    - name: pod-delete
      spec:
        components:
          env:
            - { name: TOTAL_CHAOS_DURATION, value: "60" }
            - { name: CHAOS_INTERVAL,       value: "10" }
            - { name: FORCE,                value: "false" }
```

---

## Чек-лист модуля

- [ ] Миграции в отдельном CI-step, не в startup.
- [ ] Expand-Contract по умолчанию, никаких блокирующих ALTER на больших таблицах.
- [ ] Online DDL (gh-ost/pt-osc) для MySQL, `CONCURRENTLY` для Postgres.
- [ ] Atlas/Flyway/Sqitch lint в PR.
- [ ] Patroni (или RDS Multi-AZ) для prod БД.
- [ ] 3-2-1-1-0 соблюдён, включая offline / immutable.
- [ ] S3 Object Lock в COMPLIANCE mode для критичных бэкапов.
- [ ] Restore rehearsal в pipeline (раз в неделю минимум).
- [ ] Game Day раз в квартал, runbook'и в git.

## Лабы модуля

- [Lab 29 — Online migration + Atlas lint](../../labs/29-migrations/)
- [Lab 30 — WAL-G + restore rehearsal](../../labs/30-walg-restore/)
