# Labs — CI/CD DevSecOps Mastery

> 24 лабы + capstone. Каждая включает: задание, sandbox-инструкции,
> критерии приёмки, DevSecOps-rubric.

## Структура каждой лабы

```
labs/NN-name/
├── README.md       # задание + acceptance + DevSecOps rubric
├── starter/        # стартовые файлы (если нужно)
├── solution/       # эталон, скрыт до PR
├── sandbox.md      # как поднять локально
└── rubric.md       # шкала оценки 0–5 + DSOMM mapping
```

## Список лаб

| #  | Лаба | Модуль | Sandbox | Главный навык |
|----|------|--------|---------|---|
| 00 | STRIDE-карта своего репо | 0 | none | threat modeling |
| 01 | Hello-Pipeline в GH Actions | 1 | act | базовый workflow |
| 02 | husky + commitlint + gitleaks | 1 | local | client+CI hooks |
| 03 | ARC на k3d | 1 | k8s | self-hosted runners |
| 04 | `.deb` + aptly локально | 2 | docker-compose | Debian-пакет |
| 05 | Homebrew tap | 2 | macOS / Linuxbrew | brew formula |
| 06 | iOS TestFlight через fastlane | 2 | macOS runner | iOS-доставка |
| 07 | Android AAB → Play internal | 2 | docker | Android-доставка |
| 08 | Distroless образ < 30 МБ | 3 | docker | secure image |
| 09 | k3d deploy + HPA + Ingress | 3 | k8s | базовый k8s |
| 10 | Kyverno-политики | 3 | k8s | Pod-security |
| 11 | SonarQube + Quality Gate | 4 | docker-compose | SAST |
| 12 | Renovate config | 4 | local | SCA |
| 13 | Trivy gate на CVE | 4 | docker | container scan |
| 14 | cosign + Rekor + Kyverno | 4 | k8s + sigstore | supply chain |
| 15 | Vault + ESO ротация | 5 | k8s | secrets |
| 16 | Keycloak + OAuth2 PKCE | 5 | docker-compose | OAuth |
| 17 | WebAuthn login | 5 | local | passkeys |
| 18 | Prometheus exporter + alert | 6 | docker-compose | metrics |
| 19 | InfluxDB + Telegraf + Flux | 6 | docker-compose | time-series |
| 20 | TG notify из GH Actions | 7 | local | Telegram bot |
| 21 | Slack `/deploy` ChatOps | 7 | local | Slack app |
| 22 | Alertmanager → TG+Slack+Discord | 7 | docker-compose | routing |
| 23 | GH→AWS через OIDC | 8 | LocalStack | OIDC federation |
| 24 | Terraform + Atlantis + tfsec | 8 | LocalStack | IaC PR-flow |
| 25 | Akash deploy + IPFS artifacts | 9 | Akash testnet | DePIN |
| 26 | Ansible secure-VPS | 10 | Vagrant | hardening |
| 27 | Headscale + Tailscale ACL | 10 | docker | VPN |
| 28 | Mailcow + DMARC | 10 | docker-compose | mail |
| 29 | Online migration + Atlas | 11 | docker | DB CI/CD |
| 30 | WAL-G + restore rehearsal | 11 | MinIO | backup |
| 31 | **Capstone** end-to-end | 12 | all-of-the-above | всё вместе |

## Rubric — оценка 0–5

| Балл | Критерий |
|---|---|
| 0 | не сдано / не работает |
| 1 | работает в идеальных условиях, без edge-cases |
| 2 | edge-cases обработаны, но не security |
| 3 | security-gates green (SAST/SCA/scan/signed) |
| 4 | + observability (метрики, алёрты, dashboard) |
| 5 | + production-grade (HA, backup, runbook) |

Для прохождения курса нужно ≥ 3 баллов на ≥ 22 лабах из 24.

## DSOMM-маппинг

В каждом `rubric.md` лабы указано, какие практики OWASP DSOMM
закрывает успешная сдача:

- *Build*: «Defined build process», «Reproducible defect tracking», «Signed artifacts»...
- *Implementation*: «Static analysis», «Dependency-Check», «Secret scanning»...
- *Information Gathering*: «Logging», «Metrics», «Centralized log storage»...
- *Culture*: «Conduction of war games», «Threat-modeling per design», «Security training»...

Это позволяет в конце курса сделать self-assessment **с доказательствами**.
