# pinata.md — роль Pinata в архитектуре Daskibo/Antigravity

Короткий ответ: **Pinata — это managed-IPFS, который выдаёт неизменяемый CID для
кода Lit Actions.** Этот CID — корень доверия trustless-флоу: к нему привязывается
PKP, и только этот байт-в-байт код получает право подписывать минт и выдавать
ключ. Pinata **не** хранит контент и **не** держит ключи.

## Где Pinata в общей картине

```
                    ┌────────────────────────── PINATA (managed IPFS) ──────────────────────────┐
                    │  pin claim-signer.action.js / wrap-for-buyer.action.js  →  immutable CID    │
                    │  dedicated gateway: bronze-junior-ant-598.mypinata.cloud/ipfs/<cid>         │
                    └───────────────┬───────────────────────────────────────────────────────────┘
                                    │ CID
                                    ▼
   Chipotle (Lit v3 TEE) ── PKP, привязанный к CID ──► подпись EIP-712 Claim / re-wrap master key
        │  (ключи живут только в TEE; код подписи фиксирован CID-ом)
        ▼
   on-chain (BSC/opBNB testnet)            BNB Greenfield testnet
   NFT minted via claimWithSig             зашифрованный контент курса (.enc + manifest.lit)
```

**Разделение ответственности (что где лежит):**

| Слой | Носитель | Что хранит |
| :--- | :--- | :--- |
| **Код Lit Actions** | **Pinata / IPFS** | исполняемый JS экшена → CID (публичный, неизменяемый) |
| Контент курса | **BNB Greenfield** | зашифрованные объекты + `manifest.lit` |
| Ключи / подпись | **Chipotle TEE + контракт** | PKP-приватник (в TEE), `AccessPass.encryptedKey` (на цепи) |
| Расчёты / гейт доступа | **BSC/opBNB testnet** | `CourseMarketplace`, soulbound `ClientNft`/`AuthorNft` |

## Зачем именно Pinata (а не «просто IPFS»)

1. **Неизменяемый CID = tamper-evidence.** CID — хэш точных байт экшена. PKP
   привязан к CID → подменить код незаметно нельзя: правка → новый CID → старый
   PKP больше не подписывает. Это и есть основа trustless-минта (см.
   [REVIEW.md R-1/R-1b](../../spec/REVIEW.md)).
2. **Гарантированный пиннинг + доступность.** Self-hosted IPFS-нода может уснуть и
   потерять контент; Pinata держит его запиненным и реплицированным (в JWT видно
   `pin_policy`: регионы FRA1+NYC1).
3. **Dedicated gateway** с access-токеном — стабильное HTTP-чтение `<cid>` для
   ридеров/привязки, без публичных шлюзов с rate-limit.

## Что Pinata в проекте **НЕ** делает
- **не хранит контент курса** — это Greenfield (ciphertext + manifest);
- **не хранит/не выдаёт ключи** — это Chipotle TEE (PKP) + `AccessPass` (на цепи);
- **не заменяет контракты** — гейт и расчёты on-chain;
- «**Skills**» в [Pinata Agents API](https://docs.pinata.cloud/agents/api#skills) —
  это отдельный продукт Pinata для их AI-агентов, **не** наш Lit-флоу и не Claude
  Code skills (мы используем только **Files/Pinning API**, см. [SKILL.md](./SKILL.md)).

## Что туда кладётся (конкретно)
- ✅ `claim-signer.action.js` — **уже запинен** (CID
  `bafkreicg2b2ttr6p2tqp2rbf6p5dtoq3j4srieatm55ntt2cqh6adlb6ta`,
  см. [`lit-actions/cids.json`](../../smartcontracts/lit-actions/cids.json));
- ⏳ `wrap-for-buyer.action.js` — после портирования из мока.

Полный перечень и правила — [litaction.md](./litaction.md); как пользоваться
инструментом/CLI — [SKILL.md](./SKILL.md).

## Жизненный цикл (роль Pinata в провижининге)
1. `node tools/pinata/pin.mjs --lit-actions` → Pinata возвращает CID, пишется `cids.json`.
2. CID → привязка PKP (Chipotle) → `setClaimSigner(pkpAddr)` → caller `ipfsId=<cid>`.
3. Поменяли экшен → **перепинить → перепривязать PKP** (CID сменился).

Сквозной runbook — [lit-actions/README](../../smartcontracts/lit-actions/README.md).

## Креды (роль в доступе)
- `PINATA_JWT` (или `PINATA_API_KEY`+`PINATA_API_SECRET`) — **запись** (пиннинг).
- `PINATA_GATEWAY` + `PINATA_GATEWAY_KEY` — **чтение** через dedicated gateway.
- Всё — только в gitignored `.env`; в `cids.json`/коммиты попадают лишь публичные CID.
