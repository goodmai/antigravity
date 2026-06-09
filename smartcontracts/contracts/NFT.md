# Access NFTs — авторский и клиентский доступ, хранение Lit-ключей, Lit Action

Разбор по вопросу: **покрыты ли NFT тестами**, **получает ли их автор и покупатель
контента**, **как в них хранятся Lit-ключи** и **как работает Lit Action при
доступе к контенту**. С ссылками на код и документацию.

---

## 1. Какие NFT есть и кто их получает

В платформе три soulbound (непередаваемых) access-NFT. Все они — реальные
контракты, против которых Lit проверяет `evmContractConditions` на BSC.

| NFT | Кому | Что даёт | Срок | Где минтится |
|-----|------|----------|------|--------------|
| [`AuthorNft`](src/AuthorNft.sol) | **Автору курса** | право **UPDATE + READ** бакета Greenfield | вечно (perpetual) | `mint` (owner/granter) или `claimWithSig` (PKP) |
| [`ClientNft`](src/ClientNft.sol) | **Покупателю** | **READ-only** бакета, пока валиден | срочный (expiry) | `mint` или `claimWithSig` (PKP) |
| [`AccessPass`](src/AccessPass.sol) | **Покупателю** | доступ к курсу + **хранилище Lit-ключа** (схема P-A) | срочный (expiry per-course) | только `CourseMarketplace.purchase` |

Общая база `AuthorNft`/`ClientNft` — [`SoulboundAccessNft`](src/SoulboundAccessNft.sol):
ERC-721, но любой `transfer`/`approve` ревертит (`Soulbound()`), чтобы доступ
нельзя было перепродать или взять во flash-loan.

### Автор — получает ли?
Да, двумя путями:
- **Прямой минт** `AuthorNft.mint(to)` — owner или делегированный granter
  ([`SoulboundAccessNft.onlyOwnerOrGranter`](src/SoulboundAccessNft.sol#L52)).
- **По подписи PKP** `AuthorNft.claimWithSig(to, deadline, sig)` — Lit Action
  подписывает EIP-712 `Claim`, контракт минтит (см. §4).

Кроме того, для **контента через `CourseMarketplace`** автор имеет доступ
**без NFT и без оплаты**: [`hasCourseAccess`](src/CourseMarketplace.sol#L155)
возвращает `true`, если `courses[courseId].author == user`.
→ Тест: `test_e2e_author_hasFreeAccess_withoutPassOrPayment`.

### Покупатель — получает ли?
Да. При оплате [`CourseMarketplace.purchase`](src/CourseMarketplace.sol#L189):
1. деньги делятся (author / treasury / w3ext, pull-payments);
2. вызывается `accessPass.mint(buyer, courseId, expiry)` — покупателю минтится
   soulbound `AccessPass`;
3. эмитятся `AccessGranted` + `WrapNonceIssued`.

Клиентский `ClientNft` минтится отдельным потоком (owner/granter или PKP
`claimWithSig` с `expiry`) — он отвечает за гейт чтения бакета по `hasAccess`.

→ Тест полного пути: `test_e2e_purchase_mintsPass_andBuyerStoresLitKey`
(CourseMarketplace.t.sol).

---

## 2. Как в NFT хранятся Lit-ключи (схема P-A)

Хранилище ключа — в **`AccessPass`**, по схеме **P-A** (per-NFT wrap-on-purchase,
см. [`spec/crypto.md`](../../spec/crypto.md) и
[`buckets/daskibo-drm.README.md`](../buckets/daskibo-drm.README.md)).

Ключевые поля ([`AccessPass.sol`](src/AccessPass.sol#L43-L53),
интерфейс [`IAccessPass`](src/interfaces/IAccessPass.sol)):

```solidity
// Адресно-привязанный Chipotle-шифртекст (обёрнутый master-key курса).
// Пусто (0x), пока владелец токена не вызовет setEncryptedKey. Write-once.
mapping(uint256 tokenId => bytes) public encryptedKey;

// Одноразовый wrap-nonce: != 0 — wrap разрешён; 0 — уже потрачен.
// Lit Action ОБЯЗАН проверить его перед тратой Chipotle-кредитов (anti-drain).
mapping(address buyer => mapping(uint256 courseId => uint256)) public wrapNonce;
```

Поток хранения ключа:

```
purchase() → mint() ─ выдаёт wrapNonce (одноразовый), encryptedKey пуст
        │
        ▼
покупатель вызывает wrap_for_buyer (Chipotle) → получает адресно-привязанный шифртекст
        │
        ▼
buyer → AccessPass.setEncryptedKey(tokenId, ct)
        ├─ только ownerOf(tokenId)            (NotTokenOwner)
        ├─ ct не пустой                        (EmptyCiphertext)
        ├─ слот ещё не записан                 (AlreadySet, write-once)
        ├─ tokenId — текущий активный          (StaleToken, защита от renewal-дрейна)
        ├─ wrapNonce != 0                      (NonceConsumed)
        └─ wrapNonce := 0; encryptedKey := ct  (атомарно, повторный wrap невозможен)
```

Важные свойства (всё покрыто тестами в [`AccessPass.t.sol`](test/AccessPass.t.sol)):
- **write-once** — ключ нельзя перезаписать (`AlreadySet`);
- **anti-drain** — `wrapNonce` тратится ровно один раз, нельзя слить
  Chipotle-кредиты повторными wrap’ами;
- **stale-token guard (H-1)** — старый (истёкший+перевыпущенный) токен не может
  потратить `wrapNonce`, выданный новому;
- **ротация** — `resetForRewrap(tokenId)` (owner/marketplace) чистит ключ и
  выдаёт свежий nonce для восстановления;
- **expiry — оффчейн** — `setEncryptedKey` НЕ проверяет срок: срок задаёт
  timestamp-условие в Chipotle ACC; контракт — источник состояния, не enforcement.

Ключ читается фронтендом, чтобы пропустить повторный wrap при последующих входах:
[`course-view.js`](../course-view.js) (`encryptedKey`, `tokenIdOf`).

---

## 3. Как Lit гейтит доступ к контенту

Доступ к содержимому курса (зашифрованный Greenfield-бакет) гейтится Lit’ом
по **on-chain предикату** на BSC:

- **чтение клиентом** → `ClientNft.hasAccess(user)` или
  `AccessPass.hasAccess(user, courseId)` — `true`, только пока держится
  невыпущенный (non-revoked), неистёкший пасс
  ([`ClientNft.sol#L58`](src/ClientNft.sol#L58),
  [`AccessPass.sol#L171`](src/AccessPass.sol#L171));
- **чтение/запись автором** → `AuthorNft.balanceOf(author) >= 1` (стандартный
  ERC-721 `balanceOf`, поэтому база — настоящий OpenZeppelin ERC721);
- **общий шлюз контента** → `CourseMarketplace.hasCourseAccess(user, courseId)`
  (автор бесплатно ИЛИ валидный AccessPass).

`revoke(tokenId)` сжигает пасс и через `_onRevoke` обнуляет состояние доступа —
предикат, который читает Lit, мгновенно становится `false` (R-09/R-10).
Фронтенд собирает `evmContractConditions` против этих view-функций; см.
[`course-view.js`](../course-view.js) и
[`spec/lit.md`](../../spec/lit.md) / [`spec/crypto.md`](../../spec/crypto.md).

---

## 4. Lit Action — децентрализованный claim-signer

Файл: [`lit-actions/claim-signer.action.js`](../lit-actions/claim-signer.action.js),
доки: [`lit-actions/README.md`](../lit-actions/README.md). Заменяет
централизованный `claimSigner`-сервер (audit §4.2).

```
покупатель платит на BSC (CourseMarketplace.purchase)
        │
        ▼
caller → POST /core/v1/lit_action (jsParams: kind, to, courseId, nonce, deadline, …)
        │  Lit Action внутри TEE/сети:
        │   1. hasCourseAccess(to, courseId) на BSC? нет → NOT_ENTITLED
        │   2. строит EIP-712 Claim digest (байт-в-байт как контракт)
        │   3. PKP signEcdsa(digest)  — приватный ключ не покидает сеть
        ▼
signature → nft.claimWithSig(to[,expiry],deadline,sig) → soulbound пасс заминчен
```

Модель доверия:
- приватный ключ **PKP** существует только внутри Lit/TEE, не экспортируется;
- Action закреплён своим **IPFS CID**; PKP привязан к CID → подписать может
  только этот код (меняешь код → новый CID → нет права подписи);
- в контракте `claimSigner` = EVM-адрес PKP, поэтому
  [`_verifyClaimSig`](src/SoulboundAccessNft.sol#L114) принимает только подписи
  этого Action;
- подпись выдаётся, **только если** `hasCourseAccess(to, courseId) == true` —
  без оплаты никто не заминтит.

EIP-712 digest идентичен [`buckets/claim-eip712.js`](../buckets/claim-eip712.js)
и `_CLAIM_TYPEHASH` контрактов. Round-trip (sign → recover) юнит-тестируется в
[`tests/claim-eip712.test.js`](../../tests/claim-eip712.test.js); сам Action
прогоняется e2e через локальный Chipotle-стек ([`run_e2e_lit.sh`](../../run_e2e_lit.sh)).

On-chain защита подписи (покрыта тестами):
- `claimNonces[to]` — replay protection (`InvalidClaimSignature` при повторе);
- `deadline` — истёкший клейм ревертит (`ClaimExpired`);
- чужой подписант → `InvalidClaimSignature`;
- `setClaimSigner(0)` запрещён (`ZeroAddress`, M-2).

---

## 5. Покрытие тестами (Foundry)

`forge test` — **166 тестов, 0 падений**. `forge coverage` по NFT-контрактам:

| Контракт | Lines | Statements | Branches | Funcs |
|----------|-------|------------|----------|-------|
| `AuthorNft.sol`         | 100% (7/7)   | 100% (9/9)   | — (0/0)     | 100% (2/2) |
| `ClientNft.sol`         | 100% (23/23) | 100% (26/26) | 100% (4/4)  | 100% (5/5) |
| `SoulboundAccessNft.sol`| 100% (38/38) | 100% (41/41) | 100% (5/5)  | 100% (14/14) |
| `AccessPass.sol`        | 100% (69/69) | 97.4% (76/78)| 87.5% (14/16)| 100% (17/17) |
| `CourseMarketplace.sol` | 100% (76/76) | 100% (94/94) | 100% (20/20)| 100% (13/13) |

Что проверяют тесты:
- **минт/выдача** автору и покупателю, soulbound-инварианты (все transfer/approve
  ревертят), изоляция по курсам, supportsInterface;
- **expiry-семантика** клиента (граница `<=`, renewal, окно не сжимается,
  perpetual не понижается);
- **claimWithSig** (PKP): happy-path, replay, expired deadline, чужой подписант,
  perpetual, прогрессия nonce, `setClaimSigner` zero-guard;
- **revoke** (R-09/R-10): сжигание флипает `balanceOf`/`hasAccess`, remint
  восстанавливает гейт;
- **P-A хранилище ключа**: выдача/трата `wrapNonce`, write-once `encryptedKey`,
  `EmptyCiphertext`, `StaleToken` (H-1), `resetForRewrap` (включая `NotGranted`
  на несуществующем токене), expiry оффчейн;
- **e2e**: `purchase → mint → setEncryptedKey` (покупатель) и бесплатный доступ
  автора без NFT.

Оставшиеся 2 непокрытые ветки `AccessPass` — защитные и недостижимы в штатном
потоке: `NonceConsumed` (раньше срабатывают `AlreadySet`/`StaleToken`) и
`if (n == 0) n = 1` в `_freshNonce` (астрономически маловероятная коллизия
keccak в ноль).

---

## 6. Ссылки

Код контрактов:
- [`src/SoulboundAccessNft.sol`](src/SoulboundAccessNft.sol) — soulbound база + EIP-712 claim
- [`src/AuthorNft.sol`](src/AuthorNft.sol) · [`src/ClientNft.sol`](src/ClientNft.sol) · [`src/AccessPass.sol`](src/AccessPass.sol)
- [`src/CourseMarketplace.sol`](src/CourseMarketplace.sol) · [`src/interfaces/IAccessPass.sol`](src/interfaces/IAccessPass.sol)

Тесты: [`test/AuthorNft.t.sol`](test/AuthorNft.t.sol) ·
[`test/ClientNft.t.sol`](test/ClientNft.t.sol) ·
[`test/AccessPass.t.sol`](test/AccessPass.t.sol) ·
[`test/CourseMarketplace.t.sol`](test/CourseMarketplace.t.sol)

Lit / DRM: [`lit-actions/claim-signer.action.js`](../lit-actions/claim-signer.action.js) ·
[`lit-actions/README.md`](../lit-actions/README.md) ·
[`buckets/daskibo-drm.README.md`](../buckets/daskibo-drm.README.md) ·
[`spec/crypto.md`](../../spec/crypto.md) · [`spec/lit.md`](../../spec/lit.md) ·
аудит [`contracts/audit.md`](audit.md)

Внешняя документация:
- Lit Protocol — Lit Actions & PKP: <https://developer.litprotocol.com/>
- Lit — access control / `evmContractConditions`: <https://developer.litprotocol.com/sdk/access-control/evm/custom-contract-calls>
- EIP-712 (typed structured data): <https://eips.ethereum.org/EIPS/eip-712>
- ERC-721: <https://eips.ethereum.org/EIPS/eip-721>
- OpenZeppelin ERC721: <https://docs.openzeppelin.com/contracts/5.x/api/token/erc721>
- BNB Greenfield: <https://docs.bnbchain.org/bnb-greenfield/>
- Foundry Book (forge test / coverage): <https://book.getfoundry.sh/>
