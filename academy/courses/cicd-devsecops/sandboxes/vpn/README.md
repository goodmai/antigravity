# Sandbox: vpn (Headscale + Tailscale)

Self-hosted Tailscale coordinator + два клиента для тренировки ACL.

## Запуск

```bash
docker compose up -d headscale
# Получить authkey:
docker compose exec headscale headscale users create devsecops
docker compose exec headscale headscale preauthkeys create -u devsecops -e 1h
# Подставить TS_AUTHKEY в .env и
docker compose up -d tailscale-1 tailscale-2
```

## ACL пример

См. [lesson 10.2](../../lessons/10-edge-vps-vpn-mail/README.md) и
[Lab 27](../../labs/27-tailscale-acl/).

## Smoke

```bash
docker compose exec tailscale-1 tailscale status
docker compose exec tailscale-2 tailscale ping ts-1
```
