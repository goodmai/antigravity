# Lab 24 — Terraform / OpenTofu + Atlantis + tfsec в PR

> Модуль 8 · 3 ч · Sandbox: LocalStack · DSOMM: *Implementation — Infrastructure as code*

## Задача

Развернуть Atlantis локально, подключить к репо с terraform-конфигом для S3,
получить plan в PR, увидеть tfsec + checkov + infracost-комментарии, применить
через `atlantis apply` после approve.

## Шаги

1. Atlantis в docker-compose, ngrok для webhook на GH.
2. Создать GH webhook на push/PR, secret в Atlantis.
3. `atlantis.yaml` (см. lesson 8.4).
4. PR с change в `*.tf` → автоплан, tfsec + checkov висят как комментарии.
5. `atlantis apply` → создаёт ресурсы в LocalStack.
6. Сломать namespace `aws_s3_bucket` без encryption → tfsec падает.

## Acceptance

- [ ] PR показывает plan + tfsec + checkov + infracost.
- [ ] Apply возможен только после approve.
- [ ] Drift detection — Atlantis замечает out-of-band изменения.
- [ ] OPA-policy через Conftest проверяет custom rules (нет S3 public-read).

## Rubric: 1 — plan в PR; 2 — tfsec + checkov; 3 — apply через atlantis; 4 — infracost gate; 5 — OPA-policy + sentinel-style guardrails.
