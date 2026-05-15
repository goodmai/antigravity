# Sandbox: pipeline (act + k3d + Gitea)

Локальный GitHub-совместимый CI без интернета: Gitea (как GH), act (как
runner), k3d (как target).

## Запуск

```bash
docker compose up -d gitea
k3d cluster create pipeline-target
# Установить `act` через brew/curl, см. Lab 01
```

## docker-compose.yml

```yaml
version: "3.8"
services:
  gitea:
    image: gitea/gitea:1.22
    environment:
      USER_UID: 1000
      USER_GID: 1000
    ports:
      - "3030:3000"     # web
      - "2222:22"       # ssh
    volumes:
      - gitea-data:/data
volumes: { gitea-data: {} }
```

## Use cases

- Прогон workflow локально через `act -j <job>`.
- Зеркалить репо в Gitea — full air-gapped CI.
- Связать через webhook с self-hosted Tekton/Drone (опц.).

## Лабы

- [Lab 01 — Hello-Pipeline](../../labs/01-hello-pipeline/)
- [Lab 02 — Hooks](../../labs/02-hooks/)
