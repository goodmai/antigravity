# ТЗ — Смарт-контракты Daskibo (BSC / Greenfield / Lit)

Версия 1.0 · статус: проектирование → реализация (Foundry).
Контракты — слой Execution & Settlement из архитектурного аудита BFOPS.
Хранение — BNB Greenfield (зашифрованные объекты). Доступ к расшифровке —
Lit Protocol, читающий состояние этих контрактов.

> **Verification gap (честно).** На хосте нет solidity-тулчейна
> (`forge`/`solc` отсутствуют). Тулчейн вынесен в **оркестровый
> docker-compose**: `smartcontracts/contracts/docker-compose.yml` несёт
> контейнер Foundry (`forge` + `anvil` + `cast`) для билда, прогона
> тестов и деплоя:
>
> ```bash
> docker compose -f smartcontracts/contracts/docker-compose.yml run --rm forge   # build + test
> docker compose -f smartcontracts/contracts/docker-compose.yml up -d anvil       # локальная EVM :8545
> docker compose -f smartcontracts/contracts/docker-compose.yml run --rm deploy   # forge script broadcast
> ```
>
> Гейтится `tests/contracts.docker.test.js` (opt-in `RUN_CONTRACTS=1`,
> авто-skip без Docker) — та же дисциплина guarded-docker, что у Flow
> A/B/C. В песочнице без Docker-демона прогон скипается; контракты+тесты
> здесь не верифицируются, но контейнер делает это воспроизводимо в CI.

---

## 1. Цели и нефункциональные требования

1. Покупка доступа к курсу за нативный BNB (и опц. ERC-20) с
   детерминированным сплитом средств.
2. **Сплит совпадает с off-chain моделью** (`smartcontracts/buckets/lit-pricing.js`):
   протокол-кат `treasuryBps = 2000` (20 %) → Treasury, остаток → автор.
   Платформенная комиссия w3ext (`w3extBps = 2000`, 20 %) — отдельный,
   конфигурируемый кат (по умолчанию на publish/сейл, см. §4).
3. Доступ выдаётся **непередаваемым** Access Pass (защита от flash-loan,
   аудит 3.2/4.1): Lit ACC проверяет владение, а не spot-баланс
   переводимого токена.
4. Безопасность: Checks-Effects-Interactions, `ReentrancyGuard`,
   **pull-payments** для авторских выплат (аудит 3.3), bounded-параметры,
   отсутствие `delegatecall` к недоверенному коду, отсутствие кастомной
   криптографии.
5. Прозрачность: все денежные и доступ-меняющие операции эмитят события
   (индексатор/Lit/UI).
6. Минимальная поверхность атаки: без апгрейдов в v1 (immutable);
   управление параметрами — `Ownable2Step` (позже — таймлок/мультисиг).
7. Газ-эффективность: один SSTORE-доступ на покупку; без циклов по
   пользователям; pull вместо push.

---

## 2. Акторы

| Актор | Роль |
|------|------|
| **Author** | Регистрирует курс, получает выручку (pull). |
| **Buyer/Reader** | Платит за курс, получает Access Pass, расшифровывает контент через Lit. |
| **Treasury** | Контракт-получатель протокол-ката (20 %). |
| **w3ext** | Брокер-получатель платформенной комиссии (20 %). |
| **Owner/Governance** | Настройка bps/адресов (Ownable2Step → таймлок). |
| **Lit Protocol** | Вне сети: читает `hasAccess(addr,id)` для выдачи ключа. |
| **Greenfield relayer** | Только для опционального cross-chain модуля (§6). |

---

## 3. Контракты

```
src/
  interfaces/
    ICourseMarketplace.sol
    IAccessPass.sol
    ITreasury.sol
    IGreenfieldCourseBucket.sol   (опц., cross-chain)
  AccessPass.sol          — soulbound ERC-721, минтит только Marketplace
  Treasury.sol            — приём/вывод протокол-ката (governance)
  CourseMarketplace.sol    — реестр курсов + покупка + сплит (CEI+guard)
  GreenfieldCourseBucket.sol — опц. обёртка над офиц. BucketHub/CrossChain
```

### 3.1 AccessPass (soulbound ERC-721)
- `mint(to, courseId)` — только `marketplace` (модификатор `onlyMarketplace`).
- Переводы запрещены: `transferFrom`/`safeTransferFrom`/`approve` ревертят
  (`SoulboundError`). Это и есть митигация flash-loan: нет переводимого
  баланса, который можно занять и вернуть в одной транзакции.
- `hasAccess(address user, uint256 courseId) → bool` — то, что читает
  Lit ACC (через `evmContractConditions`).
- Опц. `expiry[courseId]` для аренды/подписки (time-bound доступ).
- События: `AccessGranted(user, courseId, tokenId)`.

### 3.2 Treasury
- Принимает BNB (receive) и/или ERC-20.
- `withdraw(token, to, amount)` — только governance.
- `totalReceived` учёт; событие `Funded` / `Withdrawn`.
- Никакой логики реинвеста в v1 (минимизация поверхности).

### 3.3 CourseMarketplace (ядро)
Состояние:
```solidity
struct Course {
  address author;
  uint96  price;          // в wei BNB (или ERC-20 units)
  bytes32 contentHash;    // keccak256 манифеста/контента (целостность)
  string  bucket;         // имя Greenfield-бакета (public-read, ciphertext)
  bool    active;
}
mapping(uint256 => Course) public courses;
mapping(address => uint256) public pendingWithdrawals; // pull-payments
uint16 public treasuryBps; // дефолт 2000
uint16 public w3extBps;    // дефолт 2000
address public treasury;
address public w3ext;
IAccessPass public accessPass;
```
Функции (все внешние write — события + CEI):
- `registerCourse(price, contentHash, bucket) → courseId` — автор;
  `CourseRegistered`.
- `updateCourse(courseId, price, active)` — только автор; `CourseUpdated`.
- `purchase(courseId)` `payable nonReentrant`:
  1. **Checks**: `course.active`, `msg.value == price`,
     `!accessPass.hasAccess(msg.sender, courseId)`.
  2. **Effects**: расчёт сплита (см. §4), `pendingWithdrawals[author] +=
     authorAmount`, `pendingWithdrawals[w3ext] += w3extFee`.
  3. **Interactions**: `accessPass.mint(msg.sender, courseId)`;
     `treasury.call{value: protocolCut}("")` (проверка success);
     событие `CoursePurchased`.
  > Внешний вызов (mint) идёт **после** обновления состояния;
  > `nonReentrant` + отсутствие выплат push автору в этой же tx.
- `withdraw()` `nonReentrant` — pull: списать `pendingWithdrawals`,
  обнулить **до** перевода, затем `call`. `Withdrawn`.
- Admin (Ownable2Step, bounded): `setBps(treasuryBps,w3extBps)`
  (сумма ≤ 10000, каждая ≤ напр. 3000), `setTreasury`, `setW3ext`,
  `setAccessPass` (одноразово / до первого курса).

Кастомные ошибки (газ): `NotAuthor`, `Inactive`, `BadPrice`,
`AlreadyOwned`, `ZeroAddress`, `BpsTooHigh`, `NothingToWithdraw`,
`TransferFailed`, `Soulbound`.

---

## 4. Денежная модель (совпадает с lit-pricing.js)

Цена курса `P`. При `purchase`:

```
protocolCut = P * treasuryBps / 10000      // 20 % → Treasury (push, fixed addr)
w3extFee    = P * w3extBps    / 10000      // 20 % → w3ext   (pull)
authorAmt   = P - protocolCut - w3extFee   // остаток → author (pull)
```

- Деление — integer floor; остаток округления **в пользу автора**
  (как `computeSaleSplit`/`computeSaveCharge`: суммы re-sum к `P`,
  ни один wei не теряется/создаётся). Инвариант проверяется тестом:
  `protocolCut + w3extFee + authorAmt == P`.
- `bps` совпадают с `DEFAULT_TREASURY_BPS` / `DEFAULT_W3EXT_FEE_BPS`
  (= 2000) из `lit-pricing.js` — единая политика on-/off-chain.
- Treasury — фиксированный известный адрес → push безопасен; автор и
  w3ext — pull (push автору = вектор reentrancy/DoS, аудит 3.3).

---

## 5. Интеграция с Lit Protocol (без cross-chain)

**Рекомендуемая модель (primary).** Cross-chain messaging **не нужен**
для доступа:

1. Контент шифруется (`crypto-envelope` AES + Lit-обёртка мастера,
   `lit-access.js`), ciphertext кладётся в **public-read** Greenfield
   бакет (Lit, а не ACL Greenfield, охраняет данные).
2. Lit ACC = `evmContractConditions` на **BSC**, вызывающий
   `AccessPass.hasAccess(:userAddress, courseId)` → `true`.
3. Покупка на BSC мгновенно меняет это on-chain состояние; Lit-узлы
   читают BSC напрямую. Greenfield ничего не знает о праве доступа —
   значит, **никаких BSC→Greenfield сообщений на пользователя**.

Это устраняет 60 %+ класс взломов мостов (аудит 3.1) для пути доступа и
flash-loan (3.2 — pass soulbound, проверяется владение, не spot-баланс).

---

## 6. Cross-chain messaging — нужен ли?

**Вывод: для доступа — НЕ нужен (см. §5). Нужен только если требуется
on-chain управление жизненным циклом Greenfield-бакета** (создание
бакета/гранты/биллинг под управлением контракта, а не клиента).

Если требуется — использовать **официальную инфраструктуру**
(`bnb-chain/greenfield-contracts`), НЕ кастомный мост:

- `CrossChain` (системный контракт на BSC) — пакеты BSC↔Greenfield.
- `BucketHub` / `ObjectHub` / `GroupHub` — зеркала ресурсов Greenfield
  на BSC; `createBucket`, `createObject`, `Group` membership + `Policy`.
- Поток «on-chain publish»: `GreenfieldCourseBucket` (наша обёртка)
  вызывает `BucketHub.createBucket{value: relayerFee}(...)` с callback;
  по `Group` можно гейтить read-доступ on-chain как альтернативу Lit.

Жёсткие требования к этому модулю (аудит 3.1):
- Принимать колбэки **только** от доверенного `CrossChain`/Hub
  (`msg.sender == hub`), валидировать `srcChainId`, `ackPackage` статус.
- Идемпотентность по `nonce`/`sequence`; повторная доставка не должна
  дублировать гранты.
- **Failover/Refund (аудит 4.3):** async-вызов может зафейлиться (нет
  BNB у релейера и т.п.) → `FailureAck` обработчик возвращает
  `relayerFee`/средства инициатору; ретрай — явной функцией, не
  автоматически.
- Эти суммы **не** трогают сплит §4 (relayerFee платит publisher
  отдельно).

Trade-off (зафиксировано): cross-chain на пользователя дорог, медленен и
централизует на релейере. Поэтому v1 — Lit-gated (§5); cross-chain —
**опциональный модуль за флагом**, по умолчанию выключен.

---

## 7. Модель угроз → меры (из аудита BFOPS)

| Вектор (аудит) | Мера в контрактах |
|---|---|
| 3.3 Reentrancy | CEI, `ReentrancyGuard`, pull-payments, ext. call после effects |
| 3.2 Flash-loan обхода ACC | Soulbound AccessPass; Lit проверяет `hasAccess`, не spot `balanceOf`; опц. expiry/lock |
| 3.1 Cross-chain forgery | Только офиц. `CrossChain`/Hub; проверка `msg.sender`, `srcChainId`, sequence; идемпотентность |
| 4.3 Failover | `FailureAck`→refund, явный retry |
| §2 Custom crypto | Нет: Lit MPC + WebCrypto AES, контракт крипту не делает |
| DoS push-выплатой | Pull-pattern для author/w3ext; Treasury — фиксированный адрес |
| Param-захват | `Ownable2Step`, bounded bps (≤ лимит, сумма ≤ 100 %), события |

---

## 8. План тестов (Foundry, TDD)

`test/` — red→green как везде в проекте:
- `AccessPass.t.sol`: mint только marketplace; любой transfer/approve
  ревертит (`Soulbound`); `hasAccess` корректен; expiry.
- `Treasury.t.sol`: приём BNB; withdraw только governance; учёт.
- `CourseMarketplace.t.sol`: register/update права; `purchase` happy;
  **инвариант сплита `сумма == P`** (fuzz по P, bps); неверная цена;
  повторная покупка → `AlreadyOwned`; pull `withdraw`; reentrancy-атака
  (mock-reenter контракт) безуспешна; bounded bps.
- `CrossChain.t.sol` (опц.): колбэк от чужого адреса ревертит; повтор
  sequence идемпотентен; `FailureAck` рефандит.
- Fuzz/invariant: Σ выплат == Σ принятого; нет «застрявших» средств.

CI: job = `docker compose -f smartcontracts/contracts/docker-compose.yml
run --rm forge` (build + test в контейнере Foundry, §0). Деплой/смоук —
сервисы `anvil` + `deploy` (`script/Deploy.s.sol`). В песочнице без
Docker — skip (verification gap, §0).

---

## 9. Поставка по шагам

1. Foundry scaffold (`foundry.toml`, remappings, OZ через `forge install`).
2. Интерфейсы (`I*.sol`) — контракт API заморожен.
3. `AccessPass` → тесты → green.
4. `Treasury` → тесты → green.
5. `CourseMarketplace` (CEI/guard/pull/сплит) → тесты+fuzz → green.
6. (Опц.) `GreenfieldCourseBucket` + cross-chain тесты — за флагом.
7. Аудит-чеклист §7, газ-отчёт, деплой-скрипты (`script/`), верификация.
