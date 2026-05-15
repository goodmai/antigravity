# Lab 28 — Mailcow + SPF/DKIM/DMARC/MTA-STS

> Модуль 10 · 3 ч · Sandbox: docker-compose · DSOMM: *Information Gathering — Outbound mail reputation*

## Задача

Развернуть mailcow на VPS (или локально через docker-compose в нативной сети),
прописать в DNS SPF/DKIM/DMARC/MTA-STS/TLS-RPT, получить 10/10 на
mail-tester.com.

## Шаги

1. Купить домен (или использовать `*.duckdns.org` для теста).
2. DNS-записи MX + A + AAAA + SPF (`v=spf1 mx -all`).
3. `mailcow` (см. lesson 10.4).
4. В UI создать домен + почтовый ящик.
5. Сгенерить DKIM → положить в DNS.
6. DMARC `p=reject`, MTA-STS `mode=enforce`, TLS-RPT URLs.
7. Отправить test e-mail на mail-tester.com → проверить score.

## Acceptance

- [ ] Mail-tester ≥ 9.5/10 (10/10 если IP не в blacklist).
- [ ] DKIM aligned, SPF pass, DMARC pass.
- [ ] HTTPS `https://mta-sts.<domain>/.well-known/mta-sts.txt` отвечает.
- [ ] Inbound от Gmail доходит, не попадает в Spam.

## Rubric: 1 — mailcow поднят; 2 — SPF + DKIM; 3 — DMARC `p=reject`; 4 — MTA-STS + TLS-RPT; 5 — DMARC aggregate reports + dashboard в Grafana (parsedmarc).
