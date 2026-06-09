---
name: pinata
description: Пиннинг файлов и Lit Actions в IPFS через Pinata (v3 upload API + legacy), резолв через dedicated gateway. Используй для получения неизменяемого CID Lit-экшена (claim-signer / wrap-for-buyer), к которому привязывается PKP — основа trustless-минта/выдачи ключа в Chipotle.
---

# Pinata — IPFS pinning for Lit Actions

Скилл для загрузки (pin) контента в **IPFS через Pinata** и резолва через
**dedicated gateway**. Главная цель в проекте — получить **неизменяемый CID**
Lit-экшена, чтобы привязать к нему PKP (только этот байт-в-байт код сможет
подписывать/выдавать ключ). Подробности «что именно пинить» —
[litaction.md](./litaction.md). База: [Pinata Quickstart](https://docs.pinata.cloud/quickstart).

## Когда использовать
- нужно запинить `smartcontracts/lit-actions/*.action.js` и получить CID для
  привязки PKP (шаги 1–3 в [lit-actions/README — provisioning runbook](../../smartcontracts/lit-actions/README.md));
- запинить произвольный файл/JSON (например, манифест) в IPFS;
- собрать gateway-URL для чтения запиненного CID.

## Аутентификация (env)

Креды читаются из окружения (CLI грузит repo-root `.env`, который **gitignored**):

| Переменная | Назначение |
| :--- | :--- |
| `PINATA_JWT` | **рекомендуется** — Bearer JWT из Pinata App, работает с v3 upload API |
| `PINATA_API_KEY` + `PINATA_API_SECRET` | legacy-пара (нужны **обе** для загрузки) |
| `PINATA_GATEWAY` | dedicated gateway host без протокола, напр. `bronze-junior-ant-598.mypinata.cloud` |

> ⚠️ **Только `PINATA_API_KEY` (id ключа) для загрузки НЕ хватает.** Проверено
> вживую (2026-06): значение-только-ключ возвращает **HTTP 401 "Not Authorized"**
> на `POST /v3/files`. Нужен либо **JWT**, либо **key + secret**. Текущий `.env`
> содержит `PINATA_API_KEY` + `PINATA_GATEWAY`; добавь `PINATA_JWT` (или
> `PINATA_API_SECRET`) перед реальной загрузкой.

`.env.example` (коммитится) содержит плейсхолдеры; реальные значения — только в
`.env`. **Секреты никогда не коммитить.**

## Инструмент

| Файл | Что |
| :--- | :--- |
| [`tools/pinata/pinata-client.mjs`](../../tools/pinata/pinata-client.mjs) | чистый API: `pinFile`, `pinJson`, `pinataAuthHeaders`, `gatewayUrl`, `parseCid`, `normalizeGateway` |
| [`tools/pinata/pinata-config.mjs`](../../tools/pinata/pinata-config.mjs) | `pinataConfigFromEnv`, `litActionTargets` (какие экшены пинить) |
| [`tools/pinata/pin.mjs`](../../tools/pinata/pin.mjs) | CLI |
| `tests/pinata-*.test.js` | 32 герметичных юнит-теста (mock fetch) |

### CLI

```bash
# запинить один файл
node tools/pinata/pin.mjs path/to/file.js
# приватно / со своим именем
node tools/pinata/pin.mjs file.js --private --name custom.js
# запинить все Lit Actions проекта → пишет smartcontracts/lit-actions/cids.json
node tools/pinata/pin.mjs --lit-actions
```

### API

```js
import { pinFile, pinJson, gatewayUrl } from './tools/pinata/pinata-client.mjs';

const { cid, url } = await pinFile(
  { content: '…', name: 'claim-signer.action.js', network: 'public',
    jwt: process.env.PINATA_JWT, gateway: process.env.PINATA_GATEWAY },
);
// url === https://<gateway>/ipfs/<cid>
```

## Технические детали (Pinata)

- **v3 upload:** `POST https://uploads.pinata.cloud/v3/files`, заголовок
  `Authorization: Bearer <JWT>`, multipart `file` + `network` (`public`/`private`,
  по умолчанию у Pinata `private` — наш клиент шлёт `public` по умолчанию для
  Lit-экшенов). Ответ: `{ data: { cid, id, size, … } }` → CID в `data.cid`.
- **legacy:** `POST https://api.pinata.cloud/pinning/pinFileToIPFS` с заголовками
  `pinata_api_key` / `pinata_secret_api_key`; ответ `{ IpfsHash }`. `parseCid`
  понимает обе формы.
- **чтение:** `https://<gateway>/ipfs/<cid>`.

## Безопасность
- `.env` в `.gitignore` (проверено: `git check-ignore .env`). CLI читает `.env`
  только локально.
- В коммиты/доки попадают только плейсхолдеры (`.env.example`) и публичные CID.
- CID = хэш точных байт файла → правка экшена меняет CID → PKP надо
  перепривязывать (это и есть tamper-evidence, см. litaction.md).

## См. также
- [litaction.md](./litaction.md) — какие именно Lit Actions пинить и куда идёт CID.
- [lit-actions/README — provisioning runbook](../../smartcontracts/lit-actions/README.md)
- [Lit skill §7.5](../lit/SKILL.md) · [spec/REVIEW.md R-1b](../../spec/REVIEW.md)
- Pinata docs: https://docs.pinata.cloud/quickstart · API: https://docs.pinata.cloud/api-reference/endpoint/upload-a-file
