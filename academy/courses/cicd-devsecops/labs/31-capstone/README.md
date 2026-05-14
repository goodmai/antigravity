# Lab 31 — Capstone: end-to-end проект

> Модуль 12 · 1–2 недели · Sandbox: всё, что было · DSOMM: ≥ Level 2 во всех 4 dimensions

## Задача

Собрать **Daskibo-Demo** — сервис, в котором замкнуты **все** темы курса.
Полный scope, acceptance, defense — см. [lesson 12.4](../../lessons/12-mistakes-and-capstone/README.md).

## Структура итогового репозитория

```
daskibo-demo/
├── README.md
├── THREAT_MODEL.md
├── SLO.md
├── DSOMM-self-assessment.md
├── runbooks/
│   ├── deploy-failover.md
│   ├── postgres-failover.md
│   └── secret-rotation.md
├── backend/                # Go service
├── frontend/               # Astro landing + SPA
├── ios/                    # SwiftUI app
├── android/                # Compose app
├── helm/                   # Helm chart with Kyverno-policies
├── infra/
│   ├── terraform/          # AWS + Cloudflare
│   ├── ansible/            # bastion + mailcow
│   └── argocd/             # Application manifests
└── .github/
    ├── workflows/
    │   ├── ci.yml              # lint+test+SAST+SCA
    │   ├── release.yml         # build+SBOM+cosign sign+push
    │   ├── deploy-eks.yml      # ArgoCD sync via OIDC
    │   ├── deploy-akash.yml    # SDL + fallback
    │   ├── ios-beta.yml
    │   ├── android-beta.yml
    │   └── restore-rehearsal.yml
    └── CODEOWNERS
```

## Acceptance (минимум)

(Полный список — в lesson 12.4)

- [ ] Подписанный мульти-арх образ.
- [ ] Деплой и в EKS, и в Akash с fallback.
- [ ] Kyverno admission-policy блокирует unsigned.
- [ ] Vault + ESO работают, ротация секрета без redeploy.
- [ ] Keycloak + WebAuthn для админ-доступа.
- [ ] SLO 99.9% + MWMBR-алёрт.
- [ ] Алёрты в **все три** канала (TG/Slack/Discord).
- [ ] WAL-G + restore rehearsal зелёный.
- [ ] mailcow с DMARC `p=reject` отправляет welcome-email.
- [ ] Bastion за Headscale, доступ только passkey.
- [ ] OpenSSF Scorecard ≥ 7.

## Защита

- Демо-видео ≤ 10 минут (или live walkthrough).
- Презентация архитектуры (С4 или arc42).
- Обсуждение **threat model** и **известных ограничений**.
- Self-assessment DSOMM с доказательствами в репо.

## Rubric

| Балл | Условие |
|---|---|
| 0 | проект не работает |
| 1 | работает один happy path |
| 2 | + базовый security (SAST/SCA) |
| 3 | + signed artifacts + secrets management |
| 4 | + observability + alerts во все 3 канала + backup tested |
| 5 | + multi-cloud (EKS + Akash) + DSOMM L3 в ≥ 2 dimensions |
