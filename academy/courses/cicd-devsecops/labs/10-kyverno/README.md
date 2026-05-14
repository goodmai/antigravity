# Lab 10 — Kyverno-политики блокируют небезопасный Pod

> Модуль 3 · 2 ч · Sandbox: k3d · DSOMM: *Build — Policy as code*

## Задача

Установить Kyverno и три политики:

1. Запретить `latest`-тег.
2. Требовать `runAsNonRoot: true` и `readOnlyRootFilesystem: true`.
3. Проверять cosign-подпись (keyless, GH Actions OIDC).

## Шаги

1. `helm install kyverno kyverno/kyverno -n kyverno-system --create-namespace`
2. Применить `ClusterPolicy` (см. lesson 3.5).
3. Попробовать `kubectl run bad --image=nginx:latest` → отказ.
4. Попробовать `kubectl run also-bad --image=nginx:1.27 --as-root` → отказ.
5. Запушить **не**подписанный образ в registry, попробовать запустить — отказ.
6. Подписать cosign'ом (см. Lab 14) — успешный запуск.

## Acceptance

- [ ] 3 политики в `Enforce` mode.
- [ ] Аудит-лог нарушений сохраняется (через `audit: true`).
- [ ] Запуск любого untagged/unsigned образа невозможен.

## Rubric: 1 — Kyverno поднят; 2 — 1 политика; 3 — все 3; 4 — Audit-mode сначала, потом Enforce; 5 — PolicyReport собирается + дашборд в Grafana.
