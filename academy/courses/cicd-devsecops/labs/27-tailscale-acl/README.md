# Lab 27 — Headscale + Tailscale ACL + SSO

> Модуль 10 · 2 ч · Sandbox: docker · DSOMM: *Operations — Zero-trust network*

## Задача

Поднять Headscale (open-source coordinator) в docker, подключить 2 Tailscale-клиента,
настроить ACL «devsecops → prod-bastion:22». Тест: посторонний клиент не
проходит.

## Шаги

1. `docker compose up -d headscale`.
2. `headscale users create devsecops`, `headscale preauthkeys create -u devsecops -r 1h`.
3. `tailscale up --login-server http://localhost:8080 --authkey <KEY>` на двух «нодах».
4. ACL-JSON (см. lesson 10.2).
5. Заходим SSH с разрешённой ноды → ok; с неразрешённой → connection denied.
6. Бонус: Headscale + OIDC (Authelia/Keycloak) — SSO логин.

## Acceptance

- [ ] Tailscale node-list имеет 2 устройства.
- [ ] ACL применяется (denied → success).
- [ ] Audit log Headscale записывает события.
- [ ] Bastion port 22 закрыт через nftables, открыт **только** для tailscale0.

## Rubric: 1 — Headscale поднят; 2 — клиенты подключены; 3 — ACL применяется; 4 — SSO; 5 — Tailscale SSH с session-recording + reauth каждые 12h.
