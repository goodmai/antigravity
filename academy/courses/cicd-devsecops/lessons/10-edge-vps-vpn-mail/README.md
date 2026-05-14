# Module 10 — Edge: VPS, VPN, Landing, Mail server

> Безопасная развёртка на VPS, VPN (Tailscale/WireGuard/Headscale), atomic
> деплой лендинга, mail-сервер с SPF/DKIM/DMARC/MTA-STS.

---

## 10.1 · VPS hardening

**Канон:** [CIS Ubuntu Linux benchmarks](https://www.cisecurity.org/benchmark/ubuntu_linux),
[Ubuntu Security guide](https://ubuntu.com/security),
[Lynis docs](https://cisofy.com/lynis/),
[Mozilla SSH guidelines](https://infosec.mozilla.org/guidelines/openssh).

### Bootstrap-чек-лист «свежий VPS → защищённый»

1. **Создание non-root пользователя + ssh-key**:
   ```bash
   adduser --disabled-password deploy
   usermod -aG sudo deploy
   mkdir -p /home/deploy/.ssh && chmod 700 /home/deploy/.ssh
   echo "ssh-ed25519 AAAA..." > /home/deploy/.ssh/authorized_keys
   chown -R deploy:deploy /home/deploy/.ssh && chmod 600 /home/deploy/.ssh/authorized_keys
   ```

2. **SSH hardening** (`/etc/ssh/sshd_config.d/99-hardening.conf`):
   ```
   PermitRootLogin no
   PasswordAuthentication no
   ChallengeResponseAuthentication no
   KbdInteractiveAuthentication no
   PubkeyAuthentication yes
   AuthenticationMethods publickey
   MaxAuthTries 3
   X11Forwarding no
   AllowUsers deploy
   Protocol 2
   KexAlgorithms curve25519-sha256,curve25519-sha256@libssh.org
   Ciphers chacha20-poly1305@openssh.com,aes256-gcm@openssh.com
   MACs hmac-sha2-512-etm@openssh.com,hmac-sha2-256-etm@openssh.com
   ClientAliveInterval 300
   ClientAliveCountMax 2
   TrustedUserCAKeys /etc/ssh/ca.pub          # для CA-flow из Module 5
   ```
   ```bash
   sshd -t && systemctl reload ssh
   ```

3. **Firewall (nftables предпочтительнее ufw для prod)**:
   ```bash
   # /etc/nftables.conf
   table inet filter {
     chain input {
       type filter hook input priority 0; policy drop;
       ct state established,related accept
       iifname "lo" accept
       tcp dport 22 accept   # за ним WireGuard, см. 10.2
       tcp dport {80,443} accept
       ip protocol icmp limit rate 5/second accept
     }
     chain forward { type filter hook forward priority 0; policy drop; }
     chain output  { type filter hook output  priority 0; policy accept; }
   }
   ```
   ```bash
   systemctl enable --now nftables
   ```

4. **Unattended-upgrades** (только security):
   ```bash
   apt install -y unattended-upgrades apt-listchanges
   dpkg-reconfigure -plow unattended-upgrades
   ```

5. **Fail2ban** (минимум — sshd):
   ```ini
   # /etc/fail2ban/jail.local
   [sshd]
   enabled = true
   maxretry = 3
   bantime = 1h
   findtime = 10m
   ```

6. **auditd** для compliance: трекаем `execve`, изменения `/etc`, sudo-команды.

7. **Lynis-аудит** — раз в неделю в cron:
   ```
   0 6 * * 1 lynis audit system --quick --no-colors > /var/log/lynis.log
   ```

8. **Bastion-only access**: SSH-port 22 закрыт извне, открывается **только** через
   WireGuard/Tailscale (см. 10.2).

**Лаба 26** — Ansible-role «secure-vps»: bootstrap.sh + idempotent роль.

---

## 10.2 · VPN: WireGuard, Tailscale, Headscale, OpenVPN

**Канон:** [WireGuard whitepaper](https://www.wireguard.com/papers/wireguard.pdf),
[Tailscale docs](https://tailscale.com/kb),
[Headscale (open-source coordinator)](https://github.com/juanfont/headscale),
[OpenVPN docs](https://openvpn.net/community-resources/).

| | WireGuard | Tailscale | Headscale (self-host) | OpenVPN |
|---|---|---|---|---|
| Криптография | modern (ChaCha20, Noise) | WireGuard под капотом | WireGuard | OpenSSL (TLS) |
| NAT-обход | manual | автомат (DERP) | автомат | манипуляции |
| ACL | manual `[Peer]` | rich JSON ACL | rich JSON ACL | manual |
| SSO/2FA | нет | да (Google/MS/Okta) | через OIDC | плагины |
| Стоимость | бесплатно | freemium | бесплатно | бесплатно |
| Best for | small team / point-to-point | enterprise zero-trust | sovereign self-host | legacy compatibility |

### Tailscale ACL для DevSecOps

```jsonc
// tailnet ACL
{
  "groups": {
    "group:devsecops": ["alice@example.com", "bob@example.com"]
  },
  "tagOwners": {
    "tag:prod-bastion": ["group:devsecops"],
    "tag:ci-runner":    ["group:devsecops"]
  },
  "acls": [
    { "action": "accept", "src": ["group:devsecops"], "dst": ["tag:prod-bastion:22"] },
    { "action": "accept", "src": ["tag:ci-runner"],  "dst": ["tag:prod-bastion:22"] }
  ],
  "ssh": [
    {
      "action": "check",          // повторно проверять каждые 12h
      "src":    ["group:devsecops"],
      "dst":    ["tag:prod-bastion"],
      "users":  ["deploy"]
    }
  ]
}
```

`action: check` + Tailscale SSO + hardware 2FA — login на bastion получает
**AAL3 + audit log** в Tailscale Admin.

### Headscale (self-hosted Tailscale coordinator)

Открытый сервер, который заменяет облако Tailscale. Клиенты — стандартный
`tailscaled`. Подходит, когда нельзя зависеть от внешнего SaaS (regulated /
sovereign / on-prem).

**Лаба 27** — Headscale + Tailscale-клиенты + ACL.

---

## 10.3 · Landing page CD

**Канон:** [Astro docs](https://docs.astro.build), [Hugo docs](https://gohugo.io/documentation/),
[Cloudflare Pages](https://developers.cloudflare.com/pages/),
[GitHub Pages](https://docs.github.com/en/pages),
[atomic deploys](https://www.netlify.com/blog/2016/05/24/some-good-news-about-html-5-mode-on-netlify/).

### Astro/Hugo → S3 + CloudFront (или Cloudflare Pages)

**Atomic deploy** = новая версия выкатывается **целиком** или **никак**.
Решение: положить каждый билд в отдельную «директорию» S3 (`/<git-sha>/`) и
обновить **только** CloudFront origin path или один index-файл.

```yaml
- name: Build
  run: npm run build

- name: Upload to S3 (immutable, cache 1y)
  run: |
    aws s3 sync ./dist s3://my-cdn/sites/${{ github.sha }}/ \
      --cache-control "public, max-age=31536000, immutable"

- name: Atomic switch
  run: |
    aws s3 cp s3://my-cdn/sites/${{ github.sha }}/index.html \
              s3://my-cdn/index.html \
              --cache-control "public, max-age=60, must-revalidate"
    aws cloudfront create-invalidation --distribution-id $DIST --paths "/index.html"
```

**Преимущества:**

- Откат — это одна копия `index.html` из предыдущего sha. Секунды.
- Все hash-assets закэшированы у клиентов навсегда — нет «грязных» mix-builds.
- A/B можно сделать через Lambda@Edge / Cloudflare Workers, выбирая разные
  префиксы по cookie.

### SEO / security headers

Через Lambda@Edge / Cloudflare Workers:

```js
response.headers['content-security-policy'] = ["default-src 'self'; ..."];
response.headers['strict-transport-security'] = ['max-age=63072000; includeSubDomains; preload'];
response.headers['x-content-type-options'] = ['nosniff'];
response.headers['referrer-policy'] = ['strict-origin-when-cross-origin'];
response.headers['permissions-policy'] = ['camera=(), microphone=(), geolocation=()'];
```

`Sitemap.xml`, `robots.txt`, `og:image` — генерируются билд-сценарием.

---

## 10.4 · Mail-server

**Канон:** [mailcow docs](https://docs.mailcow.email),
[Postfix docs](https://www.postfix.org/documentation.html),
[SPF (RFC 7208)](https://datatracker.ietf.org/doc/html/rfc7208),
[DKIM (RFC 6376)](https://datatracker.ietf.org/doc/html/rfc6376),
[DMARC (RFC 7489)](https://datatracker.ietf.org/doc/html/rfc7489),
[MTA-STS (RFC 8461)](https://datatracker.ietf.org/doc/html/rfc8461),
[TLS-RPT (RFC 8460)](https://datatracker.ietf.org/doc/html/rfc8460).

**Реальность 2026:** Gmail/Outlook требуют для bulk-sender'ов **все четыре**:
SPF + DKIM aligned + DMARC `p=reject` + одно-кликабельный unsubscribe (List-Unsubscribe).
Без этого вы попадаете в Spam.

### DNS-минимум для домена `example.com`

```
example.com.   TXT  "v=spf1 ip4:203.0.113.10 -all"
mail._domainkey.example.com. TXT  "v=DKIM1; k=rsa; p=MIGfMA0GCSq..."
_dmarc.example.com.  TXT  "v=DMARC1; p=reject; rua=mailto:dmarc@example.com; ruf=mailto:dmarc@example.com; fo=1; adkim=s; aspf=s"
_mta-sts.example.com.  TXT  "v=STSv1; id=20260514"
_smtp._tls.example.com. TXT  "v=TLSRPTv1; rua=mailto:tls-reports@example.com"
```

И HTTPS-файл `https://mta-sts.example.com/.well-known/mta-sts.txt`:

```
version: STSv1
mode: enforce
mx: mail.example.com
max_age: 86400
```

### Mailcow в docker-compose (на VPS)

```bash
git clone https://github.com/mailcow/mailcow-dockerized.git
cd mailcow-dockerized
./generate_config.sh                  # отвечаем на 2 вопроса
docker compose pull && docker compose up -d
# UI: https://mail.example.com (admin/moohoo)
```

Mailcow подтягивает Let's Encrypt, ставит rspamd, dovecot, postfix, sogo, ClamAV.
Через UI генерим DKIM-ключ, в DNS прописываем.

### Проверка

```bash
# 1. Mail-tester.com (создаёт случайный адрес → отправляем туда → видим оценку 10/10)
# 2. dmarcian.com — проверка DMARC
# 3. internet.nl — комплексный аудит
```

**Лаба 28** — поднять mailcow, получить 10/10 на mail-tester, DMARC aggregate
отчёты летят в `dmarc@example.com`.

---

## Чек-лист модуля

- [ ] VPS прошёл bootstrap-чек-лист (ssh hardened, nftables, fail2ban, auditd, unattended).
- [ ] Lynis-отчёт в cron, ≥ Hardening Index 80.
- [ ] SSH-доступ — только через VPN, port 22 закрыт publicly.
- [ ] Tailscale/Headscale ACL описывает кто куда ходит, audit log включён.
- [ ] Лендинг катится atomic-deploy с immutable cache 1y + index revalidate.
- [ ] CSP/HSTS/Permissions-Policy выставлены.
- [ ] Mail-server отправляет с SPF+DKIM+DMARC `p=reject` + MTA-STS + TLS-RPT.
- [ ] mail-tester.com 10/10.

## Лабы модуля

- [Lab 26 — Ansible secure-VPS](../../labs/26-secure-vps/)
- [Lab 27 — Headscale + Tailscale ACL](../../labs/27-tailscale-acl/)
- [Lab 28 — Mailcow + DMARC](../../labs/28-mailcow/)
