# CI/CD DevSecOps Mastery

> 12 модулей · 60 уроков · 24 лабы · 10 sandbox-сред · capstone-проект.

Курс закрывает «вертикаль» доставки кода в прод: от git-хука до подписанного
артефакта в Kubernetes, с алёртами в Telegram/Slack/Discord и проверенным
бэкапом БД. **Каждое утверждение можно потрогать в песочнице** — без облака
и без оплаты.

- 📋 **План и структура:** [`plan.md`](./plan.md)
- 📚 **Уроки:** [`lessons/`](./lessons/)
- 🧪 **Лабы:** [`labs/`](./labs/)
- 🧱 **Sandboxes:** [`sandboxes/`](./sandboxes/)
- 🌐 **HTML-лендинг:** [`index.html`](./index.html)

## Что вы научитесь делать

| Тема | После курса умеете |
|---|---|
| **Пайплайны** | GH Actions с reusable workflows, OIDC, self-hosted ARC на k8s, hooks (husky/lefthook + server-side) |
| **Пакеты** | собирать `.deb`, Homebrew tap, iOS TestFlight через fastlane, Android AAB в Play Console, кросс-платформенные релизы через GoReleaser/JReleaser |
| **Контейнеры/K8s** | distroless multi-stage образы, BuildKit с SBOM/provenance, k3d/EKS-деплой, Helm/Kustomize, Kyverno-политики, Pod Security Standards |
| **DevSecOps-сканеры** | SonarQube Quality Gate в PR, Semgrep/CodeQL, Trivy/Grype/Dockle, Renovate/Dependabot, gitleaks, OWASP DC, OpenSSF Scorecard |
| **Supply chain** | cosign + Rekor + Fulcio, SLSA-провенанс, CycloneDX SBOM, in-toto attestations, admission-check на verify |
| **Секреты** | Vault + ESO, AWS SM / Azure KV / GCP SM через OIDC (без long-lived ключей), SOPS+age для GitOps |
| **Auth** | OAuth 2.0 + PKCE, Device Flow, OIDC, TOTP/HOTP, WebAuthn/FIDO2, ключи ed25519, hardware-tokens, AAL2/AAL3 по NIST 800-63B |
| **Observability** | Prometheus + PromQL, Grafana-as-code, InfluxDB v2 + Telegraf + Flux, Loki/Tempo/OTel, multi-burn-rate SLO-алёрты |
| **Notifications** | Telegram Bot API, Slack Bolt + Block Kit + ChatOps slash-commands, Discord webhooks/embeds, Alertmanager-маршрутизация |
| **Облака** | OIDC-федерация в AWS/Azure/GCP (без AccessKey/JSON), IaC через Terraform/OpenTofu + Atlantis + tfsec/checkov, FinOps через infracost |
| **DePIN** | Akash SDL, Filecoin/IPFS-артефакты, гибридный деплой |
| **Edge** | VPS hardening, Tailscale/WireGuard, mailcow с SPF/DKIM/DMARC/MTA-STS, лендинг через atomic deploy |
| **Данные** | online-миграции (gh-ost/pt-osc/Atlas), Postgres streaming/logical, WAL-G/pgBackRest, Velero, S3 Object Lock, restore-rehearsal в CI |
| **Best practices** | 30 типовых ошибок, pinned actions, least-privilege токены, supply-chain hardening |

## Кому подходит

- **Backend/DevOps engineer** с опытом 1-2 года, хочет вырасти в DevSecOps.
- **Mobile lead**, которому нужно поставить релизный конвейер для iOS/Android.
- **SRE/Platform engineer**, кому нужно унифицировать observability и алёрты.
- **Security engineer**, кому надо встроиться в существующий dev-процесс
  без «полицейской» роли.

## Что вам понадобится

Минимум — ноутбук с 16 ГБ RAM, Docker и `kubectl`. Облако **не обязательно**:
все лабы можно пройти в LocalStack/Azurite/k3d/Akash-CLI/Headscale.

Подробные пререквизиты, ссылки и канон-источники → внутри уроков. Начать
с [`lessons/0-foundations/`](./lessons/0-foundations/).

## Структура

```
academy/courses/cicd-devsecops/
├── plan.md                 # детальный план и канон-источники
├── README.md               # этот файл
├── index.html              # HTML-лендинг курса (Academy style)
├── lessons/
│   ├── 0-foundations/
│   ├── 1-cicd-foundations/
│   ├── 2-packaging/
│   ├── 3-containers-k8s/
│   ├── 4-devsecops-core/
│   ├── 5-secrets-auth/
│   ├── 6-observability/
│   ├── 7-notifications/
│   ├── 8-cloud-practices/
│   ├── 9-depin/
│   ├── 10-edge-vps-vpn-mail/
│   ├── 11-data-backup/
│   └── 12-mistakes-and-capstone/
├── labs/
│   ├── 00-stride/ … 31-capstone/
│   └── README.md
└── sandboxes/
    ├── pipeline/           # act + k3d + Gitea
    ├── secrets/            # Vault dev + ESO + SOPS
    ├── observability/      # Prometheus/Grafana/InfluxDB/Loki/Tempo
    ├── k8s/                # k3d + ArgoCD + Kyverno
    ├── cloud-lite/         # LocalStack + Azurite + fake-gcs
    ├── supply-chain/       # Sigstore (Rekor + Fulcio)
    ├── mail/               # mailcow + MailHog
    ├── vpn/                # Headscale + Tailscale clients
    ├── depin/              # Akash CLI + IPFS Kubo
    └── chaos/              # LitmusChaos + sample-app
```

## Сертификат

См. секцию 6 в [`plan.md`](./plan.md) — критерии: 22/24 лаб + capstone +
OWASP DSOMM ≥ L2.
