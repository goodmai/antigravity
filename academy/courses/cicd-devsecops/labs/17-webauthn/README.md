# Lab 17 — WebAuthn / Passkey login

> Модуль 5 · 3 ч · Sandbox: local Node app · DSOMM: *Implementation — Phishing-resistant authentication*

## Задача

Реализовать registration + authentication через WebAuthn (passkey) на Node.js
+ `@simplewebauthn/server` + `@simplewebauthn/browser`. Fallback на TOTP.

## Шаги

1. `npm i @simplewebauthn/server @simplewebauthn/browser`
2. Registration endpoints:
   - `POST /auth/register/options` → `generateRegistrationOptions(...)`,
   - `POST /auth/register/verify` → `verifyRegistrationResponse(...)`.
3. Authentication endpoints:
   - `POST /auth/login/options` → `generateAuthenticationOptions(...)`,
   - `POST /auth/login/verify` → `verifyAuthenticationResponse(...)`.
4. Сохраняем credId + publicKey в БД.
5. UI на vanilla JS — `startRegistration()`, `startAuthentication()`.
6. Опц: TOTP-fallback через `otplib` (`otpauth://` URL → QR).

## Acceptance

- [ ] Регистрация passkey на Yubico/Touch ID/Windows Hello.
- [ ] Login без пароля.
- [ ] RP ID = origin, не подменяемый.
- [ ] Recovery codes (10 одноразовых) сохраняются при регистрации.

## Rubric: 1 — backend endpoints; 2 — login passkey; 3 — recovery codes; 4 — TOTP fallback; 5 — multi-device passkey (синхронизация через iCloud/Google).
