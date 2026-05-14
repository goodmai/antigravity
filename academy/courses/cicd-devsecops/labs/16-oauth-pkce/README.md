# Lab 16 — Keycloak + OAuth 2.0 Authorization Code + PKCE

> Модуль 5 · 3 ч · Sandbox: docker-compose · DSOMM: *Implementation — Strong authentication*

## Задача

Поднять Keycloak, создать realm + client + user. Реализовать на FastAPI/Node
бэкенд + SPA-фронт полный flow Auth Code + PKCE с refresh-token rotation.

## Шаги

1. Keycloak в docker-compose (см. lesson 5.2).
2. В Keycloak admin: создать realm `daskibo`, client `spa` (public,
   `Standard Flow`, `Direct Access Grants OFF`, redirect URI `http://localhost:3000/cb`).
3. Включить refresh-token rotation: `Realm settings → Tokens → Revoke Refresh Token = ON`.
4. SPA-фронт (vanilla JS или React):
   - генерим `code_verifier` + `code_challenge = base64url(SHA-256(verifier))`,
   - редиректим на `/authorize?response_type=code&code_challenge=...&code_challenge_method=S256`,
   - после callback меняем code на token,
   - refresh каждый ttl/2.
5. Бэкенд (FastAPI):
   - middleware verify JWT (Keycloak JWKS).
6. Тест: поймать refresh-replay — если попробовать использовать старый
   refresh-token, Keycloak отзывает всю цепочку.

## Acceptance

- [ ] Login → `access_token` + `id_token` + `refresh_token` получены.
- [ ] Refresh обмен возвращает **новый** refresh-token.
- [ ] Replay старого refresh — отзыв всей сессии.
- [ ] Никакого `client_secret` в SPA.

## Rubric: 1 — Keycloak поднят; 2 — login работает; 3 — PKCE верифицируется; 4 — refresh rotation + replay detection; 5 — Device Authorization Grant для CLI добавлен.
