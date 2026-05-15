# Sandbox: mail (mailcow + MailHog)

Локальный mail-сервер для практики SPF/DKIM/DMARC/MTA-STS и MailHog для
безопасного тестирования отправок.

## Mailcow

Полноценный мейл-стек (Postfix + Dovecot + rspamd + SOGo + ClamAV + UI).
Установка:

```bash
git clone https://github.com/mailcow/mailcow-dockerized.git
cd mailcow-dockerized
./generate_config.sh
docker compose up -d
```

После — настроить DNS как описано в [lesson 10.4](../../lessons/10-edge-vps-vpn-mail/README.md).

## MailHog (для дев/тестов в CI)

```yaml
services:
  mailhog:
    image: mailhog/mailhog:v1.0.1
    ports: ["1025:1025", "8025:8025"]  # smtp, web
```

Web: http://localhost:8025. SMTP: `localhost:1025` (без auth).

## Лабы

- [Lab 28 — Mailcow + DMARC](../../labs/28-mailcow/)
