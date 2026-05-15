# Lab 09 — k3d-кластер + Deployment + HPA + Ingress

> Модуль 3 · 2 ч · Sandbox: k3d · DSOMM: *Information Gathering — Centralized log storage*

## Задача

Развернуть приложение в k3d с zero-downtime rolling update, HPA по CPU,
Ingress через Traefik. Имитировать нагрузку, увидеть автоскейл.

## Шаги

1. `k3d cluster create dev --agents 2 --port "80:80@loadbalancer" --port "443:443@loadbalancer"`
2. Deployment + Service + Ingress + HPA + PDB (см. lesson 3.3).
3. `kubectl apply -f manifests/`.
4. `hey -z 30s -c 50 http://app.localhost/` → HPA должен дать +pods.
5. `kubectl rollout restart deployment app` — без 5xx у клиента.

## Acceptance

- [ ] HPA scale-up при CPU > 70%, scale-down с cooldown.
- [ ] Rolling update без 5xx (`maxUnavailable: 0`).
- [ ] PDB защищает при drain (`kubectl drain node`).
- [ ] Probes корректные: startup → liveness → readiness.

## Rubric: 1 — Pod бегает; 2 — Ingress отвечает; 3 — HPA scale-out по нагрузке; 4 — zero-downtime rollout; 5 — full Pod Security restricted + NetworkPolicy default-deny.
