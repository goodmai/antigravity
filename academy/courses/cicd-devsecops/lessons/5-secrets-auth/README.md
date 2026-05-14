# Module 5 — Secrets, OAuth, 2FA

> Надёжное хранение секретов, OAuth 2.0 + OIDC до конца, TOTP/WebAuthn,
> требования к ключам и 2FA по NIST 800-63B.

---

## 5.1 · Надёжное хранение секретов

**Канон:** [HashiCorp Vault docs](https://developer.hashicorp.com/vault/docs),
[AWS Secrets Manager](https://docs.aws.amazon.com/secretsmanager/),
[Azure Key Vault](https://learn.microsoft.com/azure/key-vault/),
[GCP Secret Manager](https://cloud.google.com/secret-manager/docs),
[External Secrets Operator](https://external-secrets.io),
[SOPS + age](https://github.com/getsops/sops).

### Иерархия плохого → хорошего хранения

| Уровень | Где | Оценка |
|---|---|---|
| **F** | `.env` в git, в Slack-сообщении | 🚫 утечка вопрос времени |
| **D** | GitHub Secrets как long-lived AWS keys | ⚠ компрометация даёт постоянный доступ |
| **C** | GitHub Environment Secrets + required reviewers | ✅ ок для multi-stage, но still long-lived |
| **B** | Vault / AWS SM / Azure KV / GCP SM + short-lived API tokens | ✅ хорошо |
| **A** | OIDC-федерация: CI получает **временный** STS-token, никаких static keys | 🎯 цель |

### Vault + ESO + Kubernetes

```yaml
# SecretStore (один на namespace)
apiVersion: external-secrets.io/v1beta1
kind: SecretStore
metadata: { name: vault-store, namespace: prod }
spec:
  provider:
    vault:
      server: "https://vault.example.com"
      path: "secret"
      version: "v2"
      auth:
        kubernetes:                    # k8s ServiceAccount → Vault token
          mountPath: "kubernetes"
          role: "prod-app"
          serviceAccountRef: { name: app }
---
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata: { name: app-secrets, namespace: prod }
spec:
  refreshInterval: 1h                  # ротация без redeploy
  secretStoreRef: { name: vault-store, kind: SecretStore }
  target: { name: app-secrets }
  data:
    - secretKey: DATABASE_URL
      remoteRef: { key: prod/app, property: database_url }
    - secretKey: JWT_KEY
      remoteRef: { key: prod/app, property: jwt_key }
```

**Что выигрываем:**

- Секрет в k8s Secret — **производный** артефакт, не первоисточник.
- Ротация в Vault → ESO обновит k8s Secret через 1h без redeploy
  (если приложение умеет reload).
- Audit-trail Vault показывает, кто и когда получил секрет.

### SOPS + age (для GitOps без vendor lock-in)

```bash
# Шифруем `secrets.yaml`
sops --encrypt --age age1abc... secrets.yaml > secrets.enc.yaml
```

В git лежит только `secrets.enc.yaml`. CI/FluxCD расшифровывает age-ключом
(который в Vault или GitHub Secret). Хорошо подходит для **decentralized**
команд: нет центрального Vault, но шифрование сильное.

**Сравнение:**

| | Vault + ESO | SOPS + age |
|---|---|---|
| Centralized | да | нет (git — источник) |
| Rotate без redeploy | да | нет (commit + apply) |
| Audit | rich | git log |
| Сложность | выше | ниже |
| Best for | enterprise | OSS / небольшие команды |

**Лаба 15** — Vault dev + ESO в k3d, ротация через Vault Agent.

---

## 5.2 · OAuth 2.0 / OIDC до конца

**Канон:** [RFC 6749 (OAuth 2.0)](https://datatracker.ietf.org/doc/html/rfc6749),
[RFC 7636 (PKCE)](https://datatracker.ietf.org/doc/html/rfc7636),
[RFC 8628 (Device Authorization Grant)](https://datatracker.ietf.org/doc/html/rfc8628),
[OpenID Connect Core](https://openid.net/specs/openid-connect-core-1_0.html),
[OAuth 2.1 draft](https://datatracker.ietf.org/doc/draft-ietf-oauth-v2-1/),
[OAuth Security BCP RFC 9700](https://datatracker.ietf.org/doc/html/rfc9700).

### Какой flow когда

| Тип клиента | Flow | Notes |
|---|---|---|
| SPA (browser) | **Authorization Code + PKCE** | без `client_secret` |
| Mobile native | **Authorization Code + PKCE** | + system browser (ASWebAuthSession / Custom Tabs) |
| Server-to-server (backend) | **Client Credentials** | долгий доступ от своего имени |
| CLI / TV / IoT | **Device Authorization Grant** (`code` + URL) | RFC 8628 |
| Legacy SPA (deprecated) | ~~Implicit~~ | удалён в OAuth 2.1 |
| Username/password | ~~Resource Owner Password~~ | удалён в OAuth 2.1 |

**Authorization Code + PKCE — последовательность:**

```
1. client → /authorize?response_type=code&code_challenge=BASE64(SHA256(verifier))&...
2. user authenticates at IdP
3. IdP → redirect ?code=ABC
4. client → /token with code + code_verifier
5. IdP проверяет SHA256(verifier) == code_challenge → выдаёт access_token + refresh_token + id_token
```

**Refresh token rotation** (RFC 9700) — каждый refresh-обмен выдаёт **новый**
refresh-token, старый инвалидируется. Если злоумышленник украл refresh — при
следующем обмене жертвой система детектит «replay» и отзывает всю цепочку.

### Keycloak в docker-compose (мини-IdP)

```yaml
services:
  keycloak:
    image: quay.io/keycloak/keycloak:25.0
    command: ["start-dev"]
    environment:
      KEYCLOAK_ADMIN: admin
      KEYCLOAK_ADMIN_PASSWORD: ${KC_ADMIN_PASSWORD}
    ports: ["8080:8080"]
```

**Лаба 16** — Keycloak + FastAPI/Node клиент с Auth Code + PKCE + refresh rotation.

---

## 5.3 · 2FA/MFA: TOTP, WebAuthn, push

**Канон:** [RFC 6238 (TOTP)](https://datatracker.ietf.org/doc/html/rfc6238),
[RFC 4226 (HOTP)](https://datatracker.ietf.org/doc/html/rfc4226),
[WebAuthn Level 3](https://www.w3.org/TR/webauthn-3/),
[FIDO Alliance specs](https://fidoalliance.org/specifications/),
[NIST SP 800-63B](https://pages.nist.gov/800-63-3/sp800-63b.html).

### Сравнение факторов

| Фактор | Phishable? | Replay? | NIST AAL |
|---|---|---|---|
| SMS-код | ✅ да (SIM-swap) | ⚠ window | AAL2 (не рекомендуется) |
| TOTP (Google Auth, Authy) | ✅ можно фишить код | ⚠ window 30s | AAL2 |
| Push-уведомление (Duo, Okta) | ⚠ MFA-fatigue | нет | AAL2 |
| **WebAuthn / Passkey** | ❌ не фишабельно (domain-bound) | нет | **AAL3** |
| Hardware FIDO2 (YubiKey) | ❌ | нет | **AAL3** |

**WebAuthn / passkeys** — единственный фактор, на который не работает phishing.
Браузер сам проверяет origin (RP ID) перед подписью. Поэтому **прод-учётки
DevSecOps инженера обязаны быть на WebAuthn** (GitHub поддерживает с 2021).

### WebAuthn flow (упрощённо)

```
Registration:
1. server → клиент: PublicKeyCredentialCreationOptions { challenge, rp, user, ... }
2. authenticator (YubiKey/passkey) генерит keypair
3. клиент → server: attestation = { credId, publicKey, signature(challenge) }
4. server сохраняет publicKey + credId

Authentication:
1. server → клиент: PublicKeyCredentialRequestOptions { challenge, allowCredentials }
2. authenticator подписывает challenge приватным ключом
3. клиент → server: assertion = { credId, signature, authenticatorData, clientDataJSON }
4. server verify подписи через сохранённый publicKey
```

**Лаба 17** — Node + `@simplewebauthn/server` + браузерные passkeys, recovery
через TOTP fallback.

---

## 5.4 · Ключи: SSH, GPG, age, signed commits

**Канон:** [SSH Mastery (M. Lucas)](https://www.tiltedwindmillpress.com),
[GnuPG manual](https://www.gnupg.org/documentation/manuals/gnupg/),
[gitsign (Sigstore)](https://docs.sigstore.dev/cosign/signing/gitsign/),
[NIST SP 800-57](https://csrc.nist.gov/publications/detail/sp/800-57-part-1/rev-5/final).

### Алгоритмы (cheat sheet)

| Назначение | Рекомендация | Почему |
|---|---|---|
| SSH | **ed25519** | быстрый, маленький, без legacy |
| GPG (commit signing) | **ed25519** или **RSA 4096** (если нужна совместимость) | |
| TLS server cert | **ECDSA P-256** или **Ed25519** (если поддерживается) | |
| Симметричное шифрование | **AES-256-GCM** или **ChaCha20-Poly1305** | AEAD |
| Шифрование «как age» | **age** (X25519) | без OpenPGP-сложности |

**`rsa < 2048` — запрещено.** `rsa-2048` — переходный период до 2030
(NIST SP 800-131A).

### SSH с hardware key + certificate authority

```bash
# 1. Создаём ключ ed25519 (на YubiKey, если есть)
ssh-keygen -t ed25519-sk -O resident -O verify-required

# 2. Поднимаем internal SSH CA (мини-Vault или Smallstep)
step ca init                       # один раз

# 3. Подписываем пользовательский ключ на 8 часов
step ssh certificate alice@example.com alice@host -t 8h

# 4. На сервере доверяем только подписям CA:
echo "TrustedUserCAKeys /etc/ssh/ca.pub" >> /etc/ssh/sshd_config
```

**Зачем CA:** не нужно ходить и убирать ключ уволенного с каждого сервера.
TTL сертификата истёк — доступ автоматически закрыт.

### Signed commits через gitsign (keyless)

```bash
gitsign init
git config gitsign.fulcio "https://fulcio.sigstore.dev"
git config commit.gpgsign true
git config gpg.x509.program gitsign
git config gpg.format x509
# теперь `git commit` — keyless подпись через OIDC
```

В GH protected branch включаем «Require signed commits» — гарантия, что
коммит сделан подтверждённой identity, а не злоумышленником с украденным PAT.

---

## 5.5 · Требования к ключам и 2FA: NIST 800-63B

**Канон:** [NIST SP 800-63B (Digital Identity)](https://pages.nist.gov/800-63-3/sp800-63b.html),
[OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html),
[BSI TR-02102](https://www.bsi.bund.de/EN/Themen/Unternehmen-und-Organisationen/Standards-und-Zertifizierung/Technische-Richtlinien/TR-nach-Thema-sortiert/tr02102/tr02102_node.html).

### AAL уровни (Authenticator Assurance Level)

| | AAL1 | AAL2 | AAL3 |
|---|---|---|---|
| Single-factor | ✓ | ✗ | ✗ |
| Multi-factor | — | ✓ | ✓ |
| Phishing-resistant | — | — | **✓ (обязательно)** |
| Hardware authenticator | — | optional | **✓** |
| Verifier impersonation resistance | — | optional | **✓** |
| Replay-resistance | ✓ | ✓ | ✓ |

**Что выбираем где:**

- AAL2 — для большинства сотрудников (TOTP+пароль, или passkey без hw-token).
- **AAL3** — для **DevSecOps**, **прод-доступа**, **deployment keys**.
  Только passkey / hw FIDO2 + passphrase.

### Требования к паролям (NIST 2024 update)

- Минимум **8 символов**, рекомендуется ≥ 15.
- **Никаких** обязательных composition rules («должна быть заглавная и цифра»)
  — это **снижает** энтропию.
- **Никаких** обязательных периодических смен (только при компрометации).
- Проверять против списка **скомпрометированных** паролей (HaveIBeenPwned API).
- Поддержка space + paste + ≥ 64 символа.
- **MFA по умолчанию**.

### Требования к 2FA в CI/CD

| Что | Минимум |
|---|---|
| Доступ к prod GH repo (admin) | AAL3, hardware FIDO2 |
| Push в protected branch | signed commits (gitsign) |
| Доступ к Vault unseal-shares | AAL3, hardware FIDO2, split-key |
| Доступ к cloud root account | AAL3, hardware FIDO2, audit-logged |
| Production deploy approval | AAL2 минимум, environment required reviewers |
| Доступ к runner-машинам | SSH-CA + ed25519-sk |

### Lockout & rate-limiting

- Не более **100 failed attempts** на аккаунт в час (NIST).
- Не более **3 failed** push-уведомлений в минуту (anti-MFA-fatigue).
- Exponential backoff на пароль: 1s, 2s, 4s... до 30s.
- **CAPTCHA после 5** — добавляет cost для bot-атак.

---

## Чек-лист модуля

- [ ] Никаких long-lived `AWS_ACCESS_KEY_ID` в CI secrets — только OIDC-федерация.
- [ ] Production-секреты в Vault / Cloud SM, доставляются через ESO.
- [ ] OAuth 2.0 = Authorization Code + PKCE; нет Implicit/Password Grant.
- [ ] Refresh token rotation включена.
- [ ] Все DevSecOps аккаунты — на WebAuthn/passkey, не SMS/TOTP.
- [ ] Algorithm: ed25519 для SSH/GPG; RSA-2048+ только legacy.
- [ ] SSH через certificate authority с TTL.
- [ ] Signed commits required в protected branches.
- [ ] AAL3 для прод-доступа, AAL2 для остального.
- [ ] Пароли проверяются против HIBP, нет обязательных rotations.

## Лабы модуля

- [Lab 15 — Vault + ESO + ротация](../../labs/15-vault-eso/)
- [Lab 16 — Keycloak + OAuth2 + PKCE](../../labs/16-oauth-pkce/)
- [Lab 17 — WebAuthn login](../../labs/17-webauthn/)
