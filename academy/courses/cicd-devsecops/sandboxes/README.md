# Sandboxes — изолированные среды для лаб курса

> 10 готовых стендов «docker compose up && всё работает». Без облака,
> без оплаты. Можно прогнать всю программу курса без единого облачного аккаунта.

## Список

| Sandbox | Стек | Лабы, которые его используют |
|---|---|---|
| [`pipeline/`](./pipeline/) | `act` + `k3d` + Gitea | 01, 02 |
| [`secrets/`](./secrets/) | Vault dev + ESO + SOPS + age | 15 |
| [`observability/`](./observability/) | Prometheus + Grafana + InfluxDB + Loki + Tempo + Alertmanager | 18, 19, 22 |
| [`k8s/`](./k8s/) | k3d + ArgoCD + Kyverno | 03, 09, 10, 14 |
| [`cloud-lite/`](./cloud-lite/) | LocalStack + Azurite + fake-gcs-server + atlantis | 23, 24 |
| [`supply-chain/`](./supply-chain/) | self-hosted Sigstore (Rekor + Fulcio + Trillian) | 14 |
| [`mail/`](./mail/) | mailcow + MailHog | 28 |
| [`vpn/`](./vpn/) | Headscale + Tailscale clients | 27 |
| [`depin/`](./depin/) | Akash CLI + IPFS Kubo | 25 |
| [`chaos/`](./chaos/) | LitmusChaos + sample-app | 30 (DR-rehearsal) |

## Запуск

```bash
cd sandboxes/<name>
docker compose up -d
# инструкции и smoke-checks — в README.md внутри
```

## Общие требования

- Docker 24+ и docker-compose v2.
- 16 GB RAM (общий лимит для всех контейнеров).
- Linux/macOS host. На Windows — через WSL2.

## Зачем sandbox-first

1. **Никакого vendor lock-in:** студент учится принципам, не «UI облака».
2. **Air-gapped:** работает на ноутбуке в самолёте.
3. **Воспроизводимо:** все версии запинены в `docker-compose.yml`.
4. **Reset за минуту:** `docker compose down -v && docker compose up -d`.
