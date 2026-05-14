# Sandbox: secrets

Vault dev-mode + Keycloak + примеры age/SOPS.

## Запуск

```bash
docker compose up -d
```

## Доступы

| Сервис | URL | Логин |
|---|---|---|
| Vault UI | http://localhost:8200 | token: `dev-root-token` |
| Keycloak | http://localhost:8080 | admin / admin |

## Smoke

```bash
export VAULT_ADDR=http://localhost:8200 VAULT_TOKEN=dev-root-token
vault kv get kv/prod/app
```

## age + SOPS пример

```bash
age-keygen -o age.key
SOPS_AGE_KEY_FILE=age.key sops --encrypt --age $(grep public age.key | cut -d: -f2 | xargs) secret.yaml > secret.enc.yaml
```

## Лабы

- [Lab 15 — Vault + ESO](../../labs/15-vault-eso/)
- [Lab 16 — Keycloak + OAuth/PKCE](../../labs/16-oauth-pkce/)

## Reset

```bash
docker compose down -v
```
