# Sandbox: supply-chain (self-hosted Sigstore)

Локальные Fulcio + Rekor + Trillian + CTLog для self-hosted keyless подписей.

## Запуск

```bash
git clone https://github.com/sigstore/scaffolding
cd scaffolding && hack/setup-kind.sh
```

(Запускает kind-кластер со всем Sigstore-стеком: Fulcio CA, Rekor transparency
log, CTLog, Trillian.)

## Smoke

```bash
COSIGN_EXPERIMENTAL=1 cosign sign --yes \
  --fulcio-url http://fulcio.localhost \
  --rekor-url  http://rekor.localhost \
  --certificate-identity=user@example.com \
  --certificate-oidc-issuer=https://dex.localhost \
  ghcr.io/me/demo:test
```

## Использование

- [Lab 14 — cosign keyless + Kyverno](../../labs/14-cosign-kyverno/)
- Опционально — capstone сборка с подписью.

## Reset

```bash
kind delete cluster
```
