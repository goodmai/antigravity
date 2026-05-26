# OSINT — связка «децентрализованное хранилище + Lit-ACC» и наш стек

Аналитическая записка: разбор проектов, продвигающих архитектуру **decentralized
storage + threshold-encryption/ACC**, на уровне функций (whitepapers / docs / SDK /
GitHub), и сверка с нашим стеком (BNB Greenfield + Chipotle/Lit DRM + soulbound NFT +
`CourseMarketplace`).

> Метод: открытые источники (сайты, docs, GitHub, BNB DappBay/RootData), верификация
> через WebFetch/WebSearch + наш [lit skill](../skills/lit/SKILL.md) (Chipotle/Lit v3,
> сети, биллинг). Дата: 2026-05-26. Где источник не подтвердил утверждение — помечено
> **⚠️ не подтверждено**.

> [!IMPORTANT]
> **Расхождения с исходными премиссами (важно для точности).**
> - **Keypo хранит на Filecoin (Synapse), НЕ на Greenfield**; контракты на Base
>   Sepolia, ключи — Lit **Naga Test** (а эта сеть уже мертва, см. [lit skill §1](../skills/lit/SKILL.md)).
> - **4EVERLAND** — это Greenfield SP/validator + hosting + мультипротокол-storage
>   (S3/SDK). Прямая интеграция с Lit в их доках **⚠️ не подтверждена**.
> - **Glacier** использует Greenfield как один из storage-бэкендов; интеграция с Lit
>   для client-side encryption **⚠️ не подтверждена** в документации (заявлено в премиссе).
> - **CyberConnect** монетизирует через `EssenceNFT`/`SubscribeNFT` и хранит контент в
>   Greenfield/Arweave, но гейтит NFT-механиками, **не Lit**.
> Вывод: «Greenfield + Lit» как готовая интегрированная связка в проде встречается
> реже, чем кажется; чаще это либо storage без Lit, либо Lit + другой storage (Filecoin).

---

## 1. Профили проектов

| Проект | Категория | Storage | Key-mgmt / DRM | Access-модель | SDK / API | Источники |
| --- | --- | --- | --- | --- | --- | --- |
| **Glacier Network** | Data-centric L1 для AI/DePIN | Greenfield + Arweave + Filecoin | ⚠️ Lit не подтверждён | on-chain запросы; DA-гарантии | GlacierDB (Mongo-like), DeVector (VectorDB) | [glacier.io](https://glacier.io/) · [docs](https://docs.glacier.io/) · [DappBay](https://dappbay.bnbchain.org/detail/glacier-network) |
| **Keypo** | Private-data sharing SDK | **Filecoin** (Synapse) | **Lit** (Naga Test ⚠️ dead) | **access-NFT** ownership; ACL on-chain (Base Sepolia) | `upload/download/share/list/delete` + ZeroDev AA (gasless) | [keypo.io/docs](https://www.keypo.io/docs) · [github/keypo-us](https://github.com/keypo-us) · [keypo-sdk-v2](https://github.com/decentralized-storage/keypo-sdk-v2) |
| **4EVERLAND** | Web3 cloud / storage-агрегатор | Greenfield (SP+validator+hosting) + IPFS + Arweave | ⚠️ Lit не подтверждён | STS-токены, S3 ACL | Storage SDK (S3 API), 4EVER Pin SDK, STS API | [4everland.org](https://www.4everland.org/) · [docs](https://docs.4everland.org/storage/storage-sdk) |
| **CyberConnect** | DeSoc social graph | Greenfield/Arweave (контент/ассеты) | NFT-гейтинг (не Lit) | `EssenceNFT`/`SubscribeNFT`, W3ST (SBT) | Social-graph protocol (BNB/opBNB) | [Binance Research](https://research.binance.com/en/projects/cyberconnect) · [BNB DeSoc primer](https://www.bnbchain.org/en/blog/understanding-decentralized-socials-desoc-a-primer) |
| **BNB Greenfield Data-Marketplace** (паттерн) | Биржи данных/моделей | Greenfield | Lit как комплемент (опционально) | EVM-контракт маркетплейса + DKG/threshold | — (архитектурный паттерн в офиц. доке) | BNB Greenfield docs |
| **Наш стек (Daskibo)** | DRM-платформа курсов | **BNB Greenfield** (testnet) | **Chipotle (Lit v3)** + AES-envelope | **soulbound** `AuthorNft`/`ClientNft` + `CourseMarketplace.hasCourseAccess` | `buckets/*` (low-level), Foundry-контракты, multi-flow compose | этот репо |

---

## 2. Общий архитектурный паттерн (что у всех одинаково)

```text
plaintext ──AES/symmetric──► ciphertext ──► decentralized storage (Greenfield/Filecoin/Arweave)
   symmetric key ──► threshold network (Lit) под Access Control Conditions (EVM)
   reader: satisfies ACC (NFT / balance / contract) ──► Lit отдаёт ключ ──► decrypt
```

Все строят **split-key / envelope encryption**: тяжёлый файл шифруется симметрично и
лежит в дешёвом decentralized storage; симметричный ключ охраняется
threshold/ACC-слоем. Наш [crypto-envelope.js](../smartcontracts/buckets/crypto-envelope.js) +
[lit-access.js](../smartcontracts/buckets/lit-access.js) реализуют ровно это.

---

## 3. Сверка функций с нашим стеком

| Возможность | Keypo | Glacier | 4EVERLAND | CyberConnect | **Наш стек** |
| --- | :--: | :--: | :--: | :--: | :--: |
| Decentralized storage | Filecoin | GF+AR+FIL | GF+IPFS+AR | GF/AR | **Greenfield** ✅ |
| Threshold/Lit key-release | ✅ (Naga, dead) | ⚠️ | ⚠️ | ✖ | ✅ **Chipotle (Lit v3)** |
| Envelope (AES) encryption | ✅ | — | — | — | ✅ `crypto-envelope.js` |
| ACC-конструкторы (EVM) | NFT-only | — | — | NFT | ✅ `lit-acc.js` + `createAccBuilder` (EVM/Sol/Cosmos) |
| **Soulbound** access-NFT (anti-flashloan) | ✖ (transferable NFT) | ✖ | ✖ | ✖ | ✅ `AuthorNft`/`ClientNft` |
| On-chain marketplace / paywall | ✖ (NFT share) | ✖ | ✖ | ✅ Essence/Subscribe | ✅ `CourseMarketplace` (split-pay, Ownable2Step) |
| One-call SDK wrapper (`upload(file,acc)`) | ✅ `upload/share` | ✅ Mongo-like | ✅ S3/SDK | — | ✖ (только low-level `buckets/*`) |
| Gasless / Account Abstraction | ✅ **ZeroDev** | — | — | — | ✖ (roadmap G2/G3) |
| AI / VectorDB / DA | — | ✅ **DeVector/DA** | — | — | ✖ |
| Subscription/time-limited access | ✖ | — | — | ✅ Subscribe | ✅ `ClientNft` expiry |
| Multi-storage abstraction | ✖ | ✅ | ✅ | ✖ | ✖ (Greenfield-only) |
| Тесты/CI (forge+e2e) | ? | ? | ? | ? | ✅ 86 forge @100% + Lit/GF e2e |

---

## 3.1 Управление ACC через Lit — процедуры и механизмы (deep-dive)

Главный вопрос управления доступом в threshold-модели Lit: **условия (ACC)
привязываются к шифртексту в момент шифрования** (через `dataToEncryptHash`) и
**в одном месте не редактируются**. Значит «выдать/отозвать доступ» делают одним из
двух способов:

- **(A) Гейт на МУТАБЕЛЬНОЕ on-chain состояние** — ACC ссылается на контракт-метод
  (`balanceOf`, `hasCourseAccess`), а доступ меняют транзакциями (mint/purchase/expiry)
  **без ре-энкрипта**. Самый эргономичный путь.
- **(B) Ре-энкрипт с новыми условиями** — дорого, нужен исходный ключ.

### Как это решено у каждого

| Аспект управления ACC | **Keypo** | **Glacier** | **4EVERLAND** | **CyberConnect** | **Наш стек (Daskibo)** |
| --- | --- | --- | --- | --- | --- |
| Тип условия | access-**NFT** ownership (transferable) | ⚠️ заявлен EVM-gate (не подтв.) | не Lit — **STS-токены / S3 ACL** | NFT (Essence/Subscribe) | `hasCourseAccess` (customContract) **и** soulbound `balanceOf` |
| Источник истины доступа | **on-chain registry+validation** контракты (Base Sepolia) | — | STS-сервис | NFT-контракты | `CourseMarketplace`/`AccessPass`/`ClientNft` (BSC) |
| Конструирование ACC | NFT-условие (фикс.) | — | — | — | `lit-acc.js` + `createAccBuilder` (EVM/Sol/Cosmos) |
| Где хранится ACC | в шифр-метаданных + on-chain реестр | — | — | — | `manifest.lit` (`daskibo.lit.acc/1`) + `conditionsHash` (tamper) |
| **Grant** (выдача) | `share()` → **mint access-NFT** получателю | ⚠️ | выдать STS-токен | mint NFT | **mint `ClientNft`** / **purchase** (`CourseMarketplace`) — модель (A), без ре-энкрипта |
| **Revoke** (отзыв) | `delete()` → удалить запись реестра | ⚠️ | отозвать STS | — | **только expiry** (`ClientNft.expiry`/`AccessPass`) — burn/revoke нет ❗ |
| Time-limited доступ | ✖ | — | TTL токена | ✅ Subscribe | ✅ `expiry` (perpetual/HOUR/WEEK/MONTH/YEAR) |
| Точка проверки (enforcement) | **Lit threshold-ноды** (Naga, dead) | ⚠️ | сервис | app/контракт | ⚠️ **app-side** (Chipotle убрал `checkConditions`) → `lit-sdk-chipotle.js` ethers→RPC |
| Мутация без ре-энкрипта | частично (NFT mint/burn) | — | да | да | ✅ да (модель A) |
| Per-recipient sharing | ✅ (NFT на адрес) | — | ✅ | ✅ | ⚠️ через mint каждому (нет `share()`-обёртки) |
| Flash-loan resistance | ✖ (transferable NFT) | — | n/a | ✖ | ✅ **soulbound** |
| Cross-chain ACC | — | — | — | — | ✅ (BSC/Base/… + `requireLitAction`), [lit-crosschain.md](../skills/greenfield/references/lit-crosschain.md) |

### Выводы по управлению ACC

1. **Мы используем «правильную» модель (A)** — гейт на мутабельное on-chain состояние
   (`hasCourseAccess`/soulbound `balanceOf`), поэтому выдача доступа = обычная
   транзакция (покупка/минт) **без ре-энкрипта**. Это же делает Keypo, но через
   transferable NFT + отдельный on-chain **registry/validation** контракт.
2. **Наше преимущество:** soulbound-условие (anti-flashloan), встроенный **expiry**
   (time-limited), и связь с **marketplace-семантикой** (split-платежи, не просто mint).
3. **Пробелы и их закрытие на уровне контрактов** (реализовано + 100% forge-покрытие, 104 теста):
   - **R-09 — ✅ решено.** Добавлен `SoulboundAccessNft.revoke(tokenId)` (burn +
     `_onRevoke`-hook + событие `AccessRevoked`): отзыв работает и для **perpetual**
     пропуска (`ClientNft._onRevoke` чистит `_granted`/`accessExpiryOf`; у `AuthorNft`
     burn роняет `balanceOf`). Тесты `test_revoke_*`.
   - **R-10 — ◐ частично (SC-часть готова).** Предикаты `hasAccess`/`balanceOf` теперь
     **revoke-aware** — то, что Lit Action читает через `requireLitAction`, мгновенно
     флипается в false. Полный вынос enforcement на ноды — off-chain wiring `requireLitAction`.
   - **G-08 — ✅ решено (SC-часть).** Роль `granter` (`setGranter`/`onlyOwnerOrGranter`):
     делегированная per-recipient выдача и отзыв (напр. `CourseMarketplace`/оператор
     минтит/ревокает без передачи ownership). Тесты `test_granter_*`, `test_setGranter_*`.
   - **G-09 — ✅ решено.** Новый контракт [`ManifestRegistry`](../smartcontracts/contracts/src/ManifestRegistry.sol):
     ончейн-якорь `conditionsHash` (`anchor`/`verify`/`anchorOf`, self-contained ACL —
     первый писатель ключа = автор). Ридер сверяет ACC манифеста с `verify(key,hash)`.
     Тесты `ManifestRegistry.t.sol`.

---

## 4. Точки роста (что перенять)

| # | Точка роста | Откуда | Что даёт нам |
| --- | --- | --- | --- |
| G-01 | **High-level SDK-обёртка** `publishEncryptedCourse(file, acc)` / `grantAccess()` | Keypo `upload/share`, 4EVERLAND S3-SDK | сейчас у нас только low-level `buckets/*`; обёртка ускорит интеграторов и demо |
| G-02 | **Gasless onboarding (AA)** через ZeroDev/4337 | Keypo (ZeroDev) | убирает «сначала пополни кошелёк»; совпадает с roadmap G2/G3 |
| G-03 | **AI / VectorDB слой** поверх Greenfield | Glacier DeVector/GlacierAI | даёт направление в AI/agent-economy (наш Proof-of-Skill) — хранение/поиск эмбеддингов курсов |
| G-04 | **Data-marketplace модель** (продажа датасетов/моделей с авто-раскрытием ключа) | BNB GF data-marketplace, Glacier | расширение `CourseMarketplace` на продажу любых зашифрованных ассетов |
| G-05 | **Подписки/коллекционные NFT** (Subscribe/Essence) | CyberConnect | у нас есть `ClientNft` expiry — добавить renewable-подписки и tipping |
| G-06 | **Multi-storage абстракция** (Greenfield/IPFS/Arweave за одним интерфейсом) | 4EVERLAND, Glacier | портируемость, fallback при недоступности SP |
| G-07 | **`humanize()` ACC в UI** | Lit `createAccBuilder` | прозрачность правил доступа для конечного пользователя |

---

## 5. Недостатки и риски (наши и паттерна)

| # | Недостаток / риск | Где | Митигация |
| --- | --- | --- | --- |
| R-01 | **ACC проверяется app-side** (Chipotle убрал `checkConditions`) — гейтинг вне TEE | наш `lit-sdk-chipotle.js` | вынести проверку в Lit Action (`requireLitAction`), либо строго доверять серверу-издателю; задокументировано в [lit §7.4](../skills/lit/SKILL.md) |
| R-02 | **Нет one-call SDK** → высокий порог входа | наш `buckets/*` | G-01 |
| R-03 | **Нет gasless** → UX-барьер | наш стек | G-02 |
| R-04 | **Greenfield-only** (нет fallback storage) | наш стек | G-06 |
| R-05 | **Cross-chain рассинхрон**: Chipotle на Base 8453, контракты на BSC testnet 97 | наш devnet/mainnet-lit | ACC-RPC явно на BSC; либо деплой на Base; cross-ref [lit-crosschain.md](../skills/greenfield/references/lit-crosschain.md) |
| R-06 | **Lit-тестнетов больше нет** → dev только локально (Chipotle mock), прод — mainnet (Stripe) | вся отрасль | local Chipotle для dev; mainnet для прода — [lit §1](../skills/lit/SKILL.md) |
| R-07 | **Flash-loan на transferable NFT** (у Keypo/CyberConnect gating по обычному NFT) | конкуренты | у нас **soulbound** — преимущество; сохранять `requireWalletOwnership`/soulbound |
| R-08 | Конкуренты на **мёртвых сетях** (Keypo → Lit Naga Test) | Keypo | наше преимущество — мы уже на Chipotle (Lit v3) |

---

## 5а. Консолидация чейнов: можно ли деплоить контракты / минтить NFT «в Greenfield»?

**Вопрос:** убрать сепарацию чейнов (BSC-контракты + Greenfield-storage + Base-Chipotle),
задеплоив контракты и NFT прямо в Greenfield.

**Короткий ответ:** деплой произвольных Solidity-контрактов **на самом Greenfield —
невозможен** (Greenfield — Cosmos-storage-чейн без общего EVM-исполнения). НО
доступ/«NFT» можно сделать **Greenfield-нативными** через cross-chain примитивы — и
это реально схлопывает сепарацию «контракты vs storage».

### Что есть в Greenfield (факты)

| Механизм | Суть | Источник |
| --- | --- | --- |
| Программируемость | только **cross-chain**: контракты живут на **BSC/opBNB**, управляют Greenfield через precompiles | [Programmability](https://docs.bnbchain.org/bnb-greenfield/core-concept/programmability/) |
| Hub-контракты | `CrossChain`, `BucketHub`, `ObjectHub`, **`GroupHub`**, **`PermissionHub`**, `GreenfieldExecutor`, `MultiMessage` | [greenfield-contracts](https://github.com/bnb-chain/greenfield-contracts) · [contract-list](https://docs.bnbchain.org/bnb-greenfield/for-developers/cross-chain-integration/contract-list/) |
| **Mirroring** | bucket/object/**group** → **ERC-721**; **членство в группе → ERC-1155**; **NFT non-transferable** (transferability «скоро»); пропагация ~3с | [mirror-concept](https://docs.bnbchain.org/bnb-greenfield/for-developers/cross-chain-integration/mirror-concept/) |
| Group = permission | группа = набор аккаунтов с одинаковыми правами; членство = доступ к ресурсу | mirror-concept |
| Contract-as-owner | BSC-контракт может **владеть бакетом** и менять права/метаданные объектов | [demo](https://docs.bnbchain.org/bnb-greenfield/for-developers/cross-chain-integration/demo-contract-as-bucket-owner/) |

### Как это консолидирует наш стек

Вместо «bespoke `AuthorNft`/`ClientNft` на BSC + Lit ACC + Greenfield-storage» →
**Greenfield Group как нативный access-примитив**:

1. `CourseMarketplace` (на BSC/opBNB) при покупке вызывает **`GroupHub`/`PermissionHub`/
   `GreenfieldExecutor`** → добавляет покупателя в Group курса и выставляет read-право на
   объект — **атомарно с платежом**, одним флоу (cross-chain ~3с).
2. «NFT доступа» = **членство в Group (ERC-1155-зеркало)** — оно **уже
   non-transferable**, т.е. soulbound-эквивалент из коробки (flash-loan-safe).
3. **SP гейтит download** объекта по членству нативно (PermissionHub), а Lit/Chipotle
   гейтит **ключ** на то же членство (ACC на ERC-1155-зеркало на BSC, либо cosmos-условие
   на Greenfield) → defense-in-depth.
4. **Revoke появляется бесплатно** — `GroupHub.removeMember` = нативный отзыв доступа
   (закрывает наш пробел **R-09**!). Expiry — через remove по таймеру/крону.

**Эффект на сепарацию:** BSC-чейн не исчезает (контракты остаются там), но **схлопывается
разделение «контракты ↔ storage»**: один контракт управляет и расчётами, и правами
Greenfield атомарно; access-токены становятся Greenfield-нативными (зеркало), а не
отдельным кастомным слоем. Chipotle остаётся на **Base** (его перенести нельзя) → лучший
достижимый результат: **2 экосистемы** (BNB: BSC+Greenfield в тесной связке + Base/Chipotle)
вместо трёх раздельных силосов.

### Trade-offs / риски миграции

- **Cross-chain latency ~3с** + зависимость от релейера BNB cross-chain (не мгновенно, есть точка отказа).
- Зеркалирование **одностороннее** по сути: «вернуть» объект под нативное GF-управление после mirror нельзя.
- Рост attack surface и зависимость от BNB-инфраструктуры vs наши **самодостаточные, аудированные** `CourseMarketplace`/`AccessPass` (Ownable2Step, split-pay, reentrancy-guard).
- **opBNB** как опция для EVM-части (дешевле BSC), но добавляет ещё один EVM-чейн.
- Non-transferable mirror — наше преимущество **сейчас**; BNB обещает transferability «скоро» → следить, иначе flash-loan-стойкость зеркала ослабнет (тогда оставлять soulbound-логику на уровне нашей группы-политики).
- Greenfield testnet (5600) должен поддерживать нужные precompiles — проверить перед миграцией.

### Рекомендация

**Не** пытаться «деплоить в Greenfield» (невозможно). Вместо этого — **PoC «Greenfield
Group-gated курс»**: расширить `CourseMarketplace` вызовами `GroupHub`/`PermissionHub`
(contract-as-bucket-owner), заменить `ClientNft` на членство в Group (ERC-1155), и гейтить
Lit/Chipotle на это членство. Это даёт нативный **revoke (R-09)**, soulbound-из-коробки и
атомарную связку «оплата → доступ», сокращая кастомный NFT-слой. Внести как growth-задачу
**G-10** и таск в [EPIC-01](./epics/EPIC-01-devnet-testnet-deployment.md).

---

## 6. Резюме

Наш стек **архитектурно конкурентоспособен** и в ряде мест **впереди** (soulbound
anti-flashloan гейтинг, on-chain marketplace со split-платежами, реальные forge+e2e
тесты, уже на актуальном Chipotle/Lit v3 — тогда как ближайший аналог **Keypo** сидит
на умершем Naga). Главные пробелы — **DX-слой** (one-call SDK, gasless/AA) и
**продуктовое расширение** (AI/VectorDB, data-marketplace, подписки). Приоритет: G-01
(SDK-обёртка) и G-02 (gasless) — дешёвые, снимают барьеры; G-03/G-04 — стратегические,
выводят в AI/agent-economy.

---

## Источники

- Glacier: https://glacier.io/ · https://docs.glacier.io/ · [DeVector (Medium)](https://medium.com/@glacierlabs/introducing-glacier-devector-the-first-decentralized-vector-database-built-for-ai-25fa7341a3b9) · [RootData](https://www.rootdata.com/Projects/detail/Glacier%20Network?k=Njg0NQ%3D%3D)
- Keypo: https://www.keypo.io/docs · https://github.com/keypo-us · https://github.com/decentralized-storage/keypo-sdk-v2
- 4EVERLAND: https://www.4everland.org/ · https://docs.4everland.org/storage/storage-sdk · [Greenfield hosting](https://docs.4everland.org/hositng/what-is-hosting/greenfield-hosting)
- CyberConnect: https://research.binance.com/en/projects/cyberconnect · https://www.bnbchain.org/en/blog/understanding-decentralized-socials-desoc-a-primer
- Lit Protocol (наш разбор): [lit skill](../skills/lit/SKILL.md) · https://docs.dev.litprotocol.com/
- Наш стек: [sc.md](./sc.md) · [lit.md](./lit.md) · [GREENFIELD.md](./GREENFIELD.md) · [crypto.md](./crypto.md)
