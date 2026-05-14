# Lab 15 — Vault + External Secrets Operator + ротация

> Модуль 5 · 2 ч · Sandbox: k3d + Vault dev · DSOMM: *Implementation — Centralized secret store*

## Задача

Поднять Vault в dev-mode, External Secrets Operator в k8s, продемонстрировать
ротацию: меняем секрет в Vault → через 1 час k8s Secret обновлён → приложение
читает новый.

## Шаги

1. **Vault dev**:
   ```bash
   helm install vault hashicorp/vault \
     --set "server.dev.enabled=true" -n vault --create-namespace
   ```
2. **Включаем kubernetes auth и kv-v2**:
   ```bash
   vault auth enable kubernetes
   vault secrets enable -version=2 kv
   vault kv put kv/prod/app database_url='postgres://...' jwt_key='abc123'
   ```
3. **External Secrets Operator**:
   ```bash
   helm install eso external-secrets/external-secrets -n eso --create-namespace
   ```
4. **SecretStore + ExternalSecret** (см. lesson 5.1).
5. **Демонстрация ротации**:
   ```bash
   vault kv put kv/prod/app jwt_key='new_key_xyz'
   # ждём ≤ 1h → проверяем k8s Secret обновился
   kubectl get secret app-secrets -o jsonpath='{.data.JWT_KEY}' | base64 -d
   ```

## Acceptance

- [ ] Vault dev поднят, kv-v2 + k8s-auth включены.
- [ ] ESO синкает с `refreshInterval: 1h`.
- [ ] Ротация в Vault → новый k8s Secret без redeploy.
- [ ] Audit log Vault показывает event.

## Rubric: 1 — Vault поднят; 2 — ESO синкает; 3 — ротация работает; 4 — приложение reload secret без рестарта; 5 — Vault production-ready (Raft + auto-unseal через KMS).
