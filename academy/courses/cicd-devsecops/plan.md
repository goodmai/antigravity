# CI/CD DevSecOps Mastery — План и структура курса

> **Версия:** 1.3 · **Длительность:** 12 модулей · 63 урока · 24 лабы · 10 sandbox-сред
> **Уровень:** Intermediate → Senior · **Язык:** RU (с EN-терминологией)
> **Подход:** «секьюрити с первой строки» (shift-left), всё проверяется в песочнице
> прежде, чем уйдёт в продакшн.

---

## 0. Философия курса

1. **Sandbox-first.** Любая команда сначала запускается в изолированной среде
   (Docker, k3d, LocalStack, MailHog, Vault Dev) — никто не учится на проде.
2. **Поликлауд по умолчанию.** AWS / Azure / GCP / DePIN параллельно, чтобы
   студент видел различия и не «прирастал» к одному вендору.
3. **Secure-by-default.** Хранение секретов, MFA и подписи артефактов — не
   опция в конце курса, а обязательный шаг каждой лабы.
4. **Observability с первого дня.** Сразу после first build идёт Prometheus
   + Grafana — метрики не пристёгиваются «потом», а растут вместе с пайплайном.
5. **Доказательство в репозитории.** Каждая лаба заканчивается коммитом в
   личный fork и зелёным CI-бейджем, подписанной артефактом (cosign) и
   уведомлением в Telegram/Slack/Discord.

---

## 1. Источники (по которым выстроен курс)

| Категория | Что используем |
|---|---|
| **Pipelines** | GitHub Actions docs, GitLab CI/CD, Tekton, Jenkins LTS, Drone, Buildkite, Earthly, Dagger |
| **Стандарты безопасности** | OWASP Top 10, OWASP DevSecOps Maturity Model (DSOMM), OWASP SAMM, NIST SSDF (SP 800-218), CIS Benchmarks, SLSA v1.0, S2C2F (Microsoft) |
| **Supply chain** | Sigstore (cosign, gitsign, rekor), in-toto, SPDX/CycloneDX SBOM, GUAC, OpenSSF Scorecard, OpenSSF Best Practices Badge |
| **Сканеры** | SonarQube/SonarCloud, Semgrep, CodeQL, Trivy, Grype, Snyk, Dependency-Check, Renovate, Dependabot, gitleaks, trufflehog |
| **Секреты** | HashiCorp Vault, AWS Secrets Manager / KMS, Azure Key Vault, GCP Secret Manager, SOPS + age, Sealed Secrets, External Secrets Operator |
| **Observability** | Prometheus, Grafana, Loki, Tempo, Mimir, InfluxDB OSS v2, Telegraf, OpenTelemetry, Alertmanager, Pyroscope |
| **K8s/Контейнеры** | Docker, BuildKit, buildx, Podman, kaniko, k3d/kind/minikube, Helm, Kustomize, ArgoCD, FluxCD, Kyverno, OPA Gatekeeper |
| **Пакеты** | dpkg/apt/PPA, Homebrew formulas, Snapcraft, Flatpak, Xcode/fastlane, Gradle/AGP, Google Play Console API, App Store Connect API |
| **Облака** | AWS Well-Architected, Azure CAF, Google SRE book, FinOps Foundation |
| **DePIN** | Akash, Filecoin, Render, Helium, IO.net, IPFS/Filecoin docs, Arweave |
| **Auth** | RFC 6749 (OAuth 2.0), RFC 8628 (Device Flow), OIDC Core, FIDO2/WebAuthn, RFC 6238 (TOTP), RFC 4226 (HOTP), NIST SP 800-63B |
| **Бэкапы** | 3-2-1-1-0 (Veeam), Velero, Restic, Borg, pgBackRest, WAL-G, Litestream |
| **Notifications** | Telegram Bot API, Slack Bolt, Discord Webhooks/Bot API, Mattermost, Apprise |

Все ссылки на конкретные документы — внутри уроков, в блоке **«Канон»**.

---

## 2. Архитектура курса

```
┌─────────────────────────────────────────────────────────────┐
│ Module 0  Foundations & Mindset                              │
├─────────────────────────────────────────────────────────────┤
│ Module 1  CI/CD Foundations  ──► GitHub Runners, hooks       │
│ Module 2  Multi-platform Packaging (Ubuntu, brew, iOS, And.) │
│ Module 3  Containers, K8s, Pods                              │
├─────────────────────────────────────────────────────────────┤
│ Module 4  DevSecOps Core (SAST/DAST/SCA, SonarQube)          │
│ Module 5  Secrets, OAuth, 2FA, key requirements              │
│ Module 6  Observability (Prometheus, Grafana, InfluxDB)      │
│ Module 7  Notifications (Telegram, Slack, Discord)           │
├─────────────────────────────────────────────────────────────┤
│ Module 8  Cloud Practices (AWS, Azure, GCP)                  │
│ Module 9  DePIN & Decentralized infra                        │
│ Module 10 Edge: VPS, VPN, Landing & Mail server              │
│ Module 11 Data: DB in CI/CD, replication, backup             │
├─────────────────────────────────────────────────────────────┤
│ Module 12 Top mistakes & Best Practices → Capstone           │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Детальная программа

### Module 0 · Foundations & Mindset (3 урока)

| # | Урок | Что внутри | Лаба |
|---|------|-----------|------|
| 0.1 | DevSecOps как поток ценности | DORA метрики, Lead Time, MTTR, Change Failure Rate, Deployment Freq | — |
| 0.2 | Threat modeling за 30 минут | STRIDE, abuse cases, attack surface | Lab 00 · STRIDE-карта своего проекта |
| 0.3 | Зрелость: OWASP SAMM/DSOMM | self-assessment, дорожная карта | — |

### Module 1 · CI/CD Foundations (6 уроков)

| # | Урок | Что внутри | Лаба |
|---|------|-----------|------|
| 1.1 | Анатомия пайплайна | stages, jobs, fan-in/out, idempotency | Lab 01 · «Hello-Pipeline» в GH Actions |
| 1.2 | Git workflows | trunk-based vs GitFlow, protected branches, CODEOWNERS | — |
| 1.3 | Git hooks: client + server | pre-commit, commit-msg (Conventional Commits), pre-receive, husky, lefthook | Lab 02 · husky + commitlint + lint-staged |
| 1.4 | GitHub Actions глубоко | reusable workflows, matrix, environments, OIDC, concurrency | — |
| 1.5 | Runners: hosted vs self-hosted, ARC | autoscale на K8s через Actions Runner Controller, ephemeral runners | Lab 03 · ARC на k3d |
| 1.6 | Правильный деплой: PR → test → dev → prod | environment promotion, build once/promote many, GitHub Environments, gates, переменные окружения и конфигурация по средам (variables vs secrets, precedence, 12-factor) | — |

### Module 2 · Multi-platform Packaging (6 уроков)

| # | Урок | Что внутри | Лаба |
|---|------|-----------|------|
| 2.1 | Ubuntu/Debian: `.deb`, PPA, репозитории | `dpkg-deb`, `dh_make`, debhelper, reprepro, aptly | Lab 04 · собрать `.deb` и положить в локальный aptly-репо |
| 2.2 | Snap & Flatpak | snapcraft.yaml, confinement, channels | — |
| 2.3 | Homebrew: formula, tap, bottle | `brew create`, `brew test-bot`, GitHub Pages tap | Lab 05 · публичный tap для своей CLI |
| 2.4 | iOS: Xcode + fastlane | match (зашифрованные certs), gym, pilot, App Store Connect API key | Lab 06 · TestFlight beta через GH Actions self-hosted mac |
| 2.5 | Android: AAB, signing, Play Store | Gradle Play Publisher, key rotation, Play App Signing | Lab 07 · подписанный AAB → internal track |
| 2.6 | Кросс-платформенные артефакты | GoReleaser, JReleaser, electron-builder, tauri | — |

### Module 3 · Containers, K8s, Pods (5 уроков)

| # | Урок | Что внутри | Лаба |
|---|------|-----------|------|
| 3.1 | Docker правильно | multi-stage, distroless, .dockerignore, OCI metadata, reproducible builds | Lab 08 · образ < 30 МБ + scratch |
| 3.2 | BuildKit/buildx/kaniko | cache mounts, SBOM/provenance attestations | — |
| 3.3 | Kubernetes: Pod, Deployment, Service, Ingress | requests/limits, probes, PDB, HPA | Lab 09 · деплой в k3d с HPA + Ingress |
| 3.4 | Helm vs Kustomize | values, overlays, secrets-strategy | — |
| 3.5 | Pod-security: Kyverno/Gatekeeper, NetworkPolicies, seccomp | Pod Security Standards, runAsNonRoot, readOnlyRootFs | Lab 10 · Kyverno-политики блокируют небезопасный Pod |

### Module 4 · DevSecOps Core (6 уроков)

| # | Урок | Что внутри | Лаба |
|---|------|-----------|------|
| 4.1 | SAST: SonarQube/SonarCloud | Quality Gates, профили, PR-декорация | Lab 11 · поднять SonarQube в docker-compose, gate в PR |
| 4.2 | SAST альтернативы: Semgrep, CodeQL | custom rules, taint analysis | — |
| 4.3 | SCA: Dependabot, Renovate, OWASP DC, Snyk | lockfiles, ranges, auto-merge безопасных патчей | Lab 12 · Renovate-конфиг с группировкой и schedule |
| 4.4 | Контейнерное сканирование: Trivy, Grype, Dockle | severity gate, ignore-policies, SBOM (CycloneDX) | Lab 13 · сборка падает на CVE HIGH в base image |
| 4.5 | Secret-scanning: gitleaks, trufflehog | pre-commit + CI + history-scan | — |
| 4.6 | Supply chain: SLSA, cosign, in-toto, Scorecard | sign+verify, provenance, rekor | Lab 14 · cosign sign → cosign verify в admission-controller |

### Module 5 · Secrets, OAuth, 2FA (5 уроков)

| # | Урок | Что внутри | Лаба |
|---|------|-----------|------|
| 5.1 | Надёжное хранение секретов | Vault, AWS SM, Azure KV, GCP SM, SOPS+age, External Secrets Operator | Lab 15 · ESO + Vault dev, ротация через Vault Agent |
| 5.2 | OAuth 2.0 / OIDC до конца | Authorization Code + PKCE, Client Credentials, Device Flow, refresh rotation | Lab 16 · мини-IdP на Keycloak + клиент на FastAPI |
| 5.3 | 2FA/MFA: TOTP, WebAuthn, push | RFC 6238, FIDO2 attestation, recovery codes | Lab 17 · WebAuthn-login на Node + passkeys |
| 5.4 | Ключи: SSH, GPG, age, signed commits | алгоритмы (ed25519 > rsa), ротация, отзыв, hardware (YubiKey, SoloKey) | — |
| 5.5 | Требования к ключам и 2FA: NIST 800-63B AAL2/AAL3 | политики паролей, lockout, replay protection, секреты в CI через OIDC, а не PAT | — |

### Module 6 · Observability (5 уроков)

| # | Урок | Что внутри | Лаба |
|---|------|-----------|------|
| 6.1 | Prometheus: модель данных, PromQL | scrape, relabeling, recording rules, federation | Lab 18 · экспортер на Go + Prometheus + alerting rule |
| 6.2 | Grafana: дашборды как код | provisioning, datasource, variables, library panels, Grafana OnCall | — |
| 6.3 | InfluxDB v2 + Telegraf | bucket, retention, Flux, downsampling | Lab 19 · IoT-метрики через Telegraf → InfluxDB → Grafana |
| 6.4 | Логи и трейсы: Loki, Tempo, OpenTelemetry | golden signals, RED/USE, exemplars | — |
| 6.5 | SLO/SLI и error-budget alerts | multi-window multi-burn-rate (Google SRE), Sloth | — |

### Module 7 · Notifications & ChatOps (4 урока)

| # | Урок | Что внутри | Лаба |
|---|------|-----------|------|
| 7.1 | Telegram Bot API: пайплайн → чат | webhooks vs long-polling, MarkdownV2, threads, форматирование | Lab 20 · GH Actions шлёт билд + покрытие + ссылку на артефакт |
| 7.2 | Slack: incoming webhook vs Slack App | Block Kit, signed requests, slash-commands для ChatOps | Lab 21 · /deploy команда триггерит workflow_dispatch |
| 7.3 | Discord webhooks/embeds + Bot | embed-полей лимиты, components/buttons, rate limits | — |
| 7.4 | Alertmanager как маршрутизатор | inhibit, route tree, throttling, дедупликация, доставка событий о метриках | Lab 22 · Alertmanager → Telegram + Slack + Discord одновременно |

### Module 8 · Cloud Practices (6 уроков)

| # | Урок | Что внутри | Лаба |
|---|------|-----------|------|
| 8.1 | AWS: IAM, OIDC → GH Actions, ECR/ECS/EKS, Secrets Manager, KMS | без long-lived AWS keys, IRSA для EKS | Lab 23 · GH Actions деплоит в EKS через OIDC, без AccessKey |
| 8.2 | Azure: Entra ID, AKS, ACR, Key Vault, DevOps Pipelines | federated credentials, Managed Identity | — |
| 8.3 | GCP: Workload Identity Federation, GKE, Artifact Registry, Secret Manager | без service-account JSON-файлов в CI | — |
| 8.4 | IaC: Terraform/OpenTofu + Pulumi + Crossplane | state-locking, drift, policy-as-code (OPA, Sentinel, Checkov) | Lab 24 · Terraform + Atlantis + tfsec в PR |
| 8.5 | FinOps в CI/CD | infracost в PR, бюджеты на dev-окружения, idle-detection | — |
| 8.6 | Multi-cloud DR | active-passive vs active-active, RTO/RPO, traffic-shifting | — |

### Module 9 · DePIN & Decentralized Infrastructure (5 уроков)

| # | Урок | Что внутри | Лаба |
|---|------|-----------|------|
| 9.1 | DePIN: модель и экономика | Akash, Render, IO.net, Helium, Filecoin, Arweave | — |
| 9.2 | Деплой в Akash + хранение артефактов на Filecoin/IPFS | SDL-манифесты, escrow, web3.storage | Lab 25 · публикация контейнера в Akash + артефакт в IPFS |
| 9.3 | Гибрид: GH Actions → Akash, fallback на AWS | стоимость и латентность, threat model доверия к ноде | — |
| 9.4 | DePIN-протоколы для backend & frontend | Akash / Fleek / Flux / Spheron / AIOZ — установка, запуск, оплата, особенности, матрица выбора | — |
| 9.5 | Конкурентная среда DePIN: Akash vs AIOZ | Render, Golem, Flux, iExec, Gensyn vs Akash; AIOZ W3S/W3AI/W3IPFS; математическая модель CDN; матрица выбора | — |

### Module 10 · Edge: VPS, VPN, Landing, Mail (4 урока)

| # | Урок | Что внутри | Лаба |
|---|------|-----------|------|
| 10.1 | VPS hardening | unattended-upgrades, SSH ed25519+CA, fail2ban, ufw/nftables, auditd, Lynis | Lab 26 · bootstrap.sh + Ansible role «secure-vps» |
| 10.2 | VPN: WireGuard, Tailscale, OpenVPN | split-tunneling, ACL, MFA-доступ к bastion | Lab 27 · Tailscale ACL + GitHub SSO + 2FA-only |
| 10.3 | Landing page CD | static site (Astro/Hugo) → S3/Pages/Cloudflare, atomic deploy, A/B, sitemap | — |
| 10.4 | Mail-сервер | mailcow / Postal / Postfix+Dovecot, SPF/DKIM/DMARC, MTA-STS, TLS-RPT | Lab 28 · поднять mail-server в docker-compose + проверка mail-tester.com |

### Module 11 · Data: DB, Replication, Backup (4 урока)

| # | Урок | Что внутри | Лаба |
|---|------|-----------|------|
| 11.1 | DB в CI/CD | миграции (sqitch/Flyway/Liquibase/Atlas/golang-migrate), expand-contract, online DDL (pt-osc, gh-ost) | Lab 29 · pre-deploy миграция + откат, гейтит CI |
| 11.2 | Репликация | Postgres streaming/logical, MySQL GTID, Patroni, MariaDB Galera, кворум | — |
| 11.3 | Бэкапы: 3-2-1-1-0 | pgBackRest/WAL-G, Restic, Borg, S3 Object Lock (immutable), Velero для k8s | Lab 30 · WAL-G в MinIO + restore-rehearsal в pipeline |
| 11.4 | DR-тренировки | game days, ChaosMesh/LitmusChaos, runbook | — |

### Module 12 · Mistakes, Best Practices & Capstone (4 урока)

| # | Урок | Что внутри | Лаба |
|---|------|-----------|------|
| 12.1 | Топ-30 типичных ошибок | secret в логе, latest-тег, root в контейнере, eval(branchname), self-merge, PAT в actions, и т.д. | — |
| 12.2 | Pipeline hardening | least-privilege GITHUB_TOKEN, pinned actions (commit SHA), allowlist runners, npm/pypi typosquat защита | — |
| 12.3 | Чек-листы перед prod | go-live checklist, SLSA L3, прод-гейт | — |
| 12.4 | **Capstone** | объединить всё: подписанный мульти-арх образ → cosign → ArgoCD → EKS + Akash + Prometheus + alerts → TG/Slack/Discord | Lab 31 (Capstone) |

---

## 4. Labs (24 + capstone)

Полный список в [`labs/README.md`](./labs/README.md). Каждая лаба содержит:

- `README.md` — задание, критерии приёмки, security-acceptance.
- `starter/` — стартовые файлы (если нужны).
- `solution/` — эталонное решение (раскрывается только после Pull Request от
  студента в курсовый репозиторий-форк).
- `sandbox.md` — как поднять локально (docker-compose/k3d/Vagrant), без облака.
- `rubric.md` — оценка по 5-балльной шкале + чек-лист DevSecOps.

---

## 5. Sandboxes (изолированные среды для практики)

| Sandbox | Стек | Зачем |
|---|---|---|
| `sandbox-pipeline` | act + k3d + Gitea | GH Actions локально, без интернета |
| `sandbox-secrets` | Vault dev + ESO + SOPS | пробовать ротацию, без AWS |
| `sandbox-observability` | Prometheus + Grafana + InfluxDB + Loki + Tempo, всё в docker-compose | играть с метриками/алёртами |
| `sandbox-k8s` | k3d-кластер + ArgoCD + Kyverno | GitOps + политики |
| `sandbox-cloud-lite` | LocalStack + Azurite + fake-gcs-server | трогать S3/Lambda/Blob/GCS без счёта |
| `sandbox-supply-chain` | Sigstore + Rekor + Fulcio в docker | подписи и проверка |
| `sandbox-mail` | mailcow + MailHog + mail-tester self-host | proba SPF/DKIM/DMARC |
| `sandbox-vpn` | Headscale + Tailscale clients | ACL без облака Tailscale |
| `sandbox-depin` | Akash CLI + локальная нода + IPFS Kubo | пройти DePIN без оплаты |
| `sandbox-chaos` | LitmusChaos + sample-app | DR без боли |

---

## 6. Критерии завершения курса

Студент получает сертификат, если:

1. Сдал ≥ 22 из 24 лаб (PR с зелёным CI).
2. Capstone собран:
   - мульти-арх образ (amd64+arm64) с провенансом (SLSA L3),
   - подписан cosign, верифицируется policy-controller'ом,
   - деплой ArgoCD в k8s (EKS **или** Akash),
   - Prometheus + Grafana дашборд с SLO,
   - алёрт о падении SLO доезжает в **все три** канала (TG/Slack/Discord),
   - секрет лежит в Vault, доступ через OIDC + 2FA,
   - бэкап БД и rehearsal-restore проходит в pipeline.
3. Заполнил self-assessment по OWASP DSOMM ≥ Level 2 во всех 4 dimensions.

---

## 7. Дорожная карта (12 недель)

| Нед. | Модули | Главный артефакт |
|---|---|---|
| 1 | 0, 1 | Hello-pipeline + hooks |
| 2 | 2 | `.deb`, brew tap |
| 3 | 2, 3 | iOS+Android beta, distroless image |
| 4 | 3, 4 | k8s deploy + SonarQube gate |
| 5 | 4 | Renovate + Trivy + cosign |
| 6 | 5 | Vault + Keycloak + WebAuthn |
| 7 | 6 | Prometheus + Grafana + InfluxDB |
| 8 | 7 | Алёрты в TG/Slack/Discord |
| 9 | 8 | OIDC в AWS+Azure+GCP |
| 10 | 9, 10 | Akash deploy + mail server + VPN |
| 11 | 11 | WAL-G backup + DR-rehearsal |
| 12 | 12 | **Capstone** |

---

## 8. Связь с другими курсами Academy

- **`claude-code`** → автоматизация ревью и фиксов в CI (этот курс закрывает «пайплайн как код»).
- **`web3-genesis`** → деплой смарт-контрактов; здесь учим **подписывать**
  артефакты деплоя и хранить ключи безопасно.
- **`rust-android`** → этот курс закрывает «как доставить APK/AAB в Play
  Console через защищённый pipeline».
