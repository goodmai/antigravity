# litaction.md — какие Lit Actions пинить в IPFS и зачем

Скоуп: какие именно экшены проекта должны лежать в IPFS (через [Pinata skill](./SKILL.md)),
зачем это нужно и как полученный CID попадает в провижининг PKP. Сквозной контекст —
[lit-actions/README provisioning runbook](../../smartcontracts/lit-actions/README.md),
[Lit skill §7.5](../lit/SKILL.md), [spec/REVIEW.md R-1/R-1b](../../spec/REVIEW.md).

## Зачем пинить

В Chipotle/Lit подпись/выдачу ключа делает **PKP, привязанный к IPFS CID**
экшена. CID — это хэш **точных байт** файла, поэтому:

- к CID привязывается PKP → **только этот байт-в-байт код** может вызвать
  `signEcdsa` / выдать ключ (tamper-evidence);
- любая правка экшена → **новый CID** → PKP надо перепривязать (старый код
  теряет право подписи);
- CID кладётся в (а) привязку PKP↔CID, (б) `jsParams.ipfsId` у вызывающего,
  (в) `manifest.lit` для readers.

Поэтому в IPFS должны лежать **исполняемые Lit-экшены**, а НЕ контракты, не
ключи и не контент (контент — в Greenfield, ключи — в TEE/контракте).

## Что пинить

| Экшен | Файл | Статус | Роль | Куда идёт CID |
| :--- | :--- | :--- | :--- | :--- |
| **claim-signer** | [`smartcontracts/lit-actions/claim-signer.action.js`](../../smartcontracts/lit-actions/claim-signer.action.js) | ✅ есть | подписывает EIP-712 `Claim` через PKP **только если** `hasCourseAccess(to,courseId)` → trustless-минт `ClientNft`/`AuthorNft` | привязка PKP↔CID; `setClaimSigner(pkpAddr)`; caller `jsParams.ipfsId` |
| **wrap-for-buyer** | `smartcontracts/lit-actions/wrap-for-buyer.action.js` | ⏳ ещё нет (логика только в моке `greenfield-testnet/chipotle-mock.mjs`) | адресно-привязанная пере-обёртка master-key (схема P-A) → фактическая выдача ключа на decrypt | привязка PKP/vault↔CID; reader использует CID |

`litActionTargets()` ([pinata-config.mjs](../../tools/pinata/pinata-config.mjs))
пинит **только существующие** файлы — `wrap-for-buyer` подхватится автоматически,
как только он будет создан (портирован из мока, см. runbook шаг 6).

## Как запинить (CLI)

```bash
# заполни в .env: PINATA_JWT (или PINATA_API_KEY+PINATA_API_SECRET) + PINATA_GATEWAY
node tools/pinata/pin.mjs --lit-actions
```

Результат: для каждого экшена печатается `cid` + gateway-URL и пишется карта
[`smartcontracts/lit-actions/cids.json`](../../smartcontracts/lit-actions/):

```json
{
  "claim-signer": {
    "file": "claim-signer.action.js",
    "cid": "Qm…",
    "url": "https://bronze-junior-ant-598.mypinata.cloud/ipfs/Qm…"
  }
}
```

## Куда дальше идёт CID (провижининг)

1. **Привязать PKP к CID** — `claim-signer.cid` → permit-action / bind-wallet
   (runbook шаг 3, route сверить в Chipotle OpenAPI).
2. **Контракт** — `nft.setClaimSigner(pkpEvmAddr)` (runbook шаг 4).
3. **Caller** — `POST /core/v1/lit_action { ipfsId: <cid>, js_params: {…} }`,
   затем `claimWithSig(...)` (runbook шаг 5).
4. **wrap-for-buyer** — после создания файла: `pin.mjs --lit-actions` ещё раз,
   привязать PKP/vault к его CID, reader берёт CID из `cids.json`/манифеста.

> ⚠️ **Сменил код экшена → сменился CID.** После любой правки `*.action.js`
> перезапусти `pin.mjs --lit-actions`, **перепривяжи PKP** к новому CID и обнови
> `ipfsId` у caller/манифеста. Иначе старый PKP подписывает старый код, а новый
> код не имеет права подписи.

## Что НЕ пинить
- приватные ключи / `.env` / API-ключи — никогда;
- зашифрованный контент курса — он в **Greenfield**, не в Pinata;
- сами контракты/ABI — это on-chain артефакты.
