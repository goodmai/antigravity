# Module 12 — Mistakes, Best Practices & Capstone

> Топ-30 типичных ошибок DevSecOps, hardening pipeline'ов и финальный
> end-to-end проект.

---

## 12.1 · Топ-30 типичных ошибок (с фиксами)

### Pipeline / Git

1. **`uses: actions/checkout@v4`** (tag, а не SHA) — supply chain attack.
   **Фикс:** pin by full commit SHA, использовать `pin-github-action`.
2. **Default `GITHUB_TOKEN` имеет `write`** — overprivilege.
   **Фикс:** `permissions: { contents: read }` в job (минимум) или в workflow.
3. **`pull_request_target` + checkout PR-кода** — RCE из untrusted forks.
   **Фикс:** не делать checkout untrusted кода в `_target`, или
   `permissions: {}` пусто.
4. **PAT в repo secrets** — токен живёт год, после увольнения admin'а — катастрофа.
   **Фикс:** GitHub App + fine-grained PAT с short TTL.
5. **Self-merge PR'а** — обход review.
   **Фикс:** `Require pull request reviews — Dismiss stale + Restrict who can dismiss`.
6. **Force-push в `main`**. **Фикс:** protected branch + linear history.
7. **`branch_name` подставляется в shell без escape**: `eval "echo ${BRANCH}"`.
   **Фикс:** через `env:` + `"$BRANCH"` в кавычках, не string-templating.

### Containers / k8s

8. **`FROM image:latest`** — невоспроизводимая сборка.
   **Фикс:** pin tag + better digest `@sha256:...`.
9. **`USER root` в образе** + `runAsNonRoot: true` в k8s → CrashLoopBackOff
   или невозможность сделать чисто.
10. **`readOnlyRootFilesystem: false`** — exploit пишет webshell.
    **Фикс:** `true` + `emptyDir` для `/tmp`.
11. **Без `resources.limits`** — один pod ест всю ноду.
    **Фикс:** обязательны requests+limits + LimitRange на namespace.
12. **`hostNetwork: true` "потому что проще"** — обход network policies, root
    namespace. **Фикс:** **никогда** в prod.
13. **`automountServiceAccountToken: true` дефолтом** — все поды могут читать
    kube-API. **Фикс:** `false` + явный SA где нужно.
14. **Один namespace для всего** — нет isolation.
    **Фикс:** ns per environment/service + NetworkPolicy `default-deny`.

### Secrets

15. **AWS Access Keys в GitHub Secrets** — long-lived.
    **Фикс:** OIDC-федерация.
16. **Секрет вылетел в логе** (`set -x` + `curl -H "Authorization: $TOKEN"`).
    **Фикс:** GH masks secrets, но если запиcали в файл и `cat` — не маскируется.
    Используйте `add-mask::`.
17. **`echo $SECRET > file` без `umask 077`** — другие процессы прочтут.
18. **`.env` файлы в Docker layer** — слой в registry, секрет утёк навсегда.
    **Фикс:** BuildKit `--secret`, не `COPY .env`.

### Releases

19. **Один и тот же образ — разные теги** (`prod-latest` перезатирается).
    **Фикс:** immutable tags + digest.
20. **`semver` нарушен** — patch ломает API.
    **Фикс:** Conventional Commits → semantic-release.
21. **Hot-fix напрямую в `main`, минуя CI** (даже «маленький»).
    **Фикс:** запрет на force-push, обязательные status checks.

### Observability

22. **«У нас же есть логи»** — но без structured logging и trace_id.
    **Фикс:** JSON-логи, OpenTelemetry, exemplars в Prometheus.
23. **Алёрт «CPU > 90%»** — алёрт на симптом, а не SLO.
    **Фикс:** multi-burn-rate alerts на error budget.
24. **Нет deadman-switch alert'а** — если Prom молчит, никто не знает.
    **Фикс:** `absent(up{job="..."} == 1)` алёрт всегда.

### Data / DR

25. **«Бэкапы есть, мы их не тестируем»** — Schrödinger's backup.
    **Фикс:** restore-rehearsal в CI, **обязательно**.
26. **`DROP TABLE` без EXPLAIN review** (а в `git diff` не видно).
    **Фикс:** Atlas/`atlas migrate lint` падает на destructive.
27. **`ALTER TABLE ... ADD COLUMN` с дефолтом на 100M-строк** — час downtime.
    **Фикс:** expand-contract + online DDL.

### Misc

28. **CI запускается на каждый коммит, даже на `chore: bump readme`**.
    **Фикс:** paths-filter + skip-ci метки.
29. **Никто не читает security-alerts из Dependabot** — backlog растёт.
    **Фикс:** SLA на critical CVE (24h), еженедельный review.
30. **«Сначала фичи, безопасность потом»**.
    **Фикс:** definition-of-done включает security gates; PR без них не мерджится.

---

## 12.2 · Pipeline hardening

**Канон:** [GitHub — Security hardening for GitHub Actions](https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions),
[SLSA SLSA-Build-L3](https://slsa.dev/spec/v1.0/requirements),
[OpenSSF — Secure Supply Chain Consumption Framework (S2C2F)](https://github.com/ossf/s2c2f),
[npm — pinned dependencies](https://docs.npmjs.com/cli/v10/commands/npm-ci).

### Жёсткие правила для prod-пайплайнов

1. **Pin by SHA** для всех `uses:` (renovate с `pinDigests: true` поддерживает).
2. **Allowlist actions** в org settings: `actions/*, sigstore/*, my-org/*`.
3. **Least-privilege `permissions:`** в workflow + per-job.
4. **`concurrency`** + cancel-in-progress для PR'ов.
5. **Environments** с `required reviewers` для prod (+ `wait timer`).
6. **OIDC**, никаких long-lived ключей.
7. **Reusable workflows из internal-only репо** (нельзя из публичных без аудита).
8. **Code review CODEOWNERS** для `.github/workflows/`.
9. **`harden-runner` (StepSecurity)** — мониторит egress runner'а, блокирует
   подозрительные домены.
10. **SLSA-провенанс** на каждом релизе.
11. **NPM/PyPi typosquat защита**: `npm ci` (не `install`), `--ignore-scripts`
    в CI для untrusted deps, allow-list registry.
12. **Подписанный workflow** (через gitsign + protected branch).

### Pinned actions с harden-runner

```yaml
- uses: step-security/harden-runner@SHA
  with:
    egress-policy: block
    allowed-endpoints: >
      api.github.com:443
      objects.githubusercontent.com:443
      registry.npmjs.org:443
      ghcr.io:443
      eu-west-1.amazonaws.com:443
```

Любой egress на не-allowlisted домен → ошибка job + alert.

---

## 12.3 · Go-live чек-лист (перед prod)

### Code & Build
- [ ] Все workflow используют pinned SHA для actions.
- [ ] `permissions:` минимальные, OIDC для cloud.
- [ ] SAST (SonarQube + Semgrep/CodeQL) green.
- [ ] SCA (Renovate активен, Dependabot alerts разобраны).
- [ ] Container scan (Trivy) — нет HIGH/CRITICAL без обоснования.
- [ ] cosign sign + Rekor + SBOM CycloneDX.
- [ ] OpenSSF Scorecard ≥ 7.

### Runtime
- [ ] Образ digest-pinned, non-root, readOnlyRootFs, dropAll caps, seccomp RuntimeDefault.
- [ ] HPA + PDB + probes (readiness/liveness/startup).
- [ ] Pod Security Standards `restricted` enforced.
- [ ] NetworkPolicy `default-deny` + явные allow.
- [ ] Kyverno проверяет подписи на admission.

### Secrets & Identity
- [ ] Vault / Cloud SM, никаких static keys в env.
- [ ] OIDC → AWS/Azure/GCP.
- [ ] Все admin-пользователи на WebAuthn/passkey.
- [ ] SSH-CA с TTL.

### Observability & SLO
- [ ] Prometheus собирает все targets.
- [ ] Grafana-дашборды в git, provisioning.
- [ ] SLO документировано, MWMBR-алёрты живые.
- [ ] Deadman-switch alert.
- [ ] OpenTelemetry трейсы коррелируются с логами и метриками.
- [ ] Алёрты доезжают в TG + Slack + Discord, inhibit-правила настроены.

### Data
- [ ] Replication + auto-failover (Patroni / RDS Multi-AZ).
- [ ] Бэкапы 3-2-1-1-0, restore-rehearsal в CI.
- [ ] S3 Object Lock COMPLIANCE для критичных.
- [ ] Миграции через expand-contract + Atlas lint.

### Operations
- [ ] Runbook'и в git.
- [ ] Game Day проведён, инциденты задокументированы.
- [ ] On-call rotation в Grafana OnCall / PagerDuty.
- [ ] Status page (statuspage.io / cachet) подключён к Alertmanager.

---

## 12.4 · Capstone

**Задача:** end-to-end проект, объединяющий все 11 модулей.

### Scope

«Daskibo-Demo» — простой сервис «лучшие книги по DevSecOps» с REST API,
SPA, mobile-клиентами. Что собираем:

- Monorepo: `backend/` (Go) + `frontend/` (Astro) + `ios/` + `android/` +
  `infra/` (Terraform) + `helm/` (Helm chart) + `.github/workflows/`.
- Сборка `.deb` пакета backend через CI.
- Homebrew tap для CLI-клиента.
- iOS TestFlight + Android Play internal через fastlane / Gradle Play Publisher.
- Контейнерный образ: multi-arch (amd64+arm64), distroless, signed cosign,
  с SBOM + SLSA L3 provenance.
- Деплой в **EKS** (через OIDC) и параллельно в **Akash** (DePIN), с
  health-check'ом и автоматическим fallback.
- ArgoCD синхронизирует Helm-чарт.
- Kyverno-policy verify cosign signature на admission.
- Vault dev → ESO → секреты в k8s, ротация раз в час.
- Keycloak в инфре для OAuth/OIDC, WebAuthn для админ-панели.
- Prometheus + Grafana дашборд с SLO (99.9% availability, p99 < 300ms).
- InfluxDB собирает бизнес-метрики (views, downloads).
- Loki + Tempo + OpenTelemetry, trace_id в логах.
- Alertmanager → Apprise → Telegram + Slack + Discord.
- Postgres через Patroni 3 узла + WAL-G в MinIO + restore rehearsal в CI.
- Терраформ-плана покрывает AWS (EKS, RDS read-replica, S3) + Cloudflare DNS.
- Atlantis в PR, tfsec + checkov + infracost.
- Лендинг проекта собирается Astro, катится atomic-deploy в Cloudflare Pages.
- Мейл-сервер mailcow с DMARC `p=reject`.
- VPS-bastion за Headscale, доступ только по passkey.

### Critical acceptance

- [ ] PR с малой багой ломает CI (SonarQube QG).
- [ ] PR с CVE HIGH в dep ломает CI (Trivy).
- [ ] Незаподписанный образ **не** деплоится (Kyverno admission).
- [ ] DB-миграция applied через CI + откат проверен.
- [ ] Алёрт «выкатился bad release» доходит во **все три** канала за < 60s.
- [ ] Restore rehearsal зелёный в pipeline.
- [ ] Полная сборка занимает < 15 минут (с кэшем).
- [ ] OWASP DSOMM ≥ Level 2 во всех 4 dimensions.

### Защита

- Демо-видео ≤ 10 минут.
- README с архитектурной диаграммой (С4 / arc42).
- THREAT_MODEL.md.
- SLO.md.
- Runbook'и в `runbooks/`.
- DSOMM-self-assessment.md.

---

## Чек-лист модуля

- [ ] Прочёл и понял все 30 ошибок (могу пересказать фикс для каждой).
- [ ] Pipeline-hardening применён ко всем prod-репо.
- [ ] Go-live чек-лист пройден полностью.
- [ ] Capstone сдан, acceptance-критерии green.

## Лабы модуля

- [Lab 31 (Capstone) — End-to-end проект](../../labs/31-capstone/)
