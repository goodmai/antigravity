# Lab 26 — Ansible role «secure-vps»

> Модуль 10 · 3 ч · Sandbox: Vagrant (Ubuntu 24.04) · DSOMM: *Operations — Hardened systems*

## Задача

Написать идемпотентную Ansible-роль, которая делает чистый VPS защищённым:
non-root user, SSH ed25519, nftables, unattended-upgrades, fail2ban, auditd,
Lynis. Проверить через CIS-benchmark.

## Шаги

1. Vagrantfile с Ubuntu 24.04.
2. `roles/secure-vps/tasks/main.yml` — все шаги из lesson 10.1.
3. Прогнать `ansible-playbook -i hosts site.yml`.
4. Прогнать Lynis-аудит: `lynis audit system --quick`.
5. Прогнать `cis-cat-pro` или [openscap](https://www.open-scap.org) против
   CIS Ubuntu 24.04 benchmark — Score > 80.
6. Тест: повторный run должен быть `ok, changed=0`.

## Acceptance

- [ ] Lynis Hardening Index ≥ 80.
- [ ] CIS benchmark > 80%.
- [ ] Role idempotent.
- [ ] SSH-доступ только по publickey + только для `deploy` user.

## Rubric: 1 — role bootstrap; 2 — hardening; 3 — idempotent; 4 — Lynis 80+; 5 — full CIS Level 2 + automated audit reports в Grafana.
