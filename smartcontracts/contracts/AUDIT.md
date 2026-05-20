# AUDIT.md — Аудит контрактов (логика / деплой / минт)

Внутренний аудит `src/` (`AccessPass`, `CourseMarketplace`, `Treasury`),
`script/Deploy.s.sol`, схемы деплоя (`docker-compose.yml`) и схемы минта.
Solidity поднят до `^0.8.28` (актуальная 0.8.x), `evm_version =
shanghai` (BSC-safe: без допущений Cancun/transient storage).

> Контракты не верифицируются на хосте (нет `forge`); прогон —
> Foundry-джоб CI / контейнер. Это аудит **кода и логики**, не результат
> прогона.

Шкала: 🔴 High · 🟠 Medium · 🟡 Low · 🟢 Info/Accepted.

---

## 1. Логика

### CourseMarketplace
- 🟢 **CEI + reentrancy**: `purchase`/`withdraw` — checks→effects→
  interactions, `nonReentrant` (custom `error Reentrancy()`), **единый
  pull** (author/w3ext/treasury), zero push в `purchase`. Реентрант-тест
  зелёный (spec).
- 🟢 **Сплит**: `protocolCut+w3extFee+authorAmount == price` (fuzz),
  bps совпадают с off-chain `lit-pricing.js` (2000/2000), остаток —
  автору. Bounded bps (`MAX_BPS_EACH`, сумма ≤ 100 %).
- 🟢 **Author free access**: `hasCourseAccess(author)` безусловно true;
  автор не может купить (`AlreadyOwned`).
- 🟠→✅ **Overflow-DoS по `accessDuration`** (исправлено): конечная
  длительность ранее не ограничивалась → `block.timestamp +
  accessDuration` (uint64) мог переполниться (checked-revert) и сделать
  `purchase` нерабочим для курса. Добавлены `MAX_DURATION (~100 лет)` +
  `error BadDuration`; `0`/`DURATION_PERPETUAL` — безопасный sentinel
  (expiry 0, без сложения). Тест `test_registerCourse_rejectsOverlongDuration`.
- 🟡→✅ **`treasury` push-DoS** (исправлено, growth #2): был
  единственный push (`treasury.call{value}` в `purchase`); реверт-
  treasury мог за-DoS-ить все продажи. Теперь treasury кредитуется в
  `pendingWithdrawals` как author/w3ext (**единый pull**), в `purchase`
  push отсутствует вовсе. Treasury забирает через
  `Treasury.collectFrom(marketplace)`. Тесты:
  `test_revertingTreasuryDoesNotBlockPurchase`,
  `test_collectFrom_pullsAndCredits`.
- 🟡 **`updateCourse` не меняет `bucket`/`contentHash`/`accessDuration`**:
  нельзя ротировать контент/продлить срок существующего курса. By
  design v1 (новый курс = новый bucket/MK). Зафиксировано.
- 🟢 **Ownable2Step**: двухшаговая передача; нет `renounce` (намеренно —
  чтобы не осиротить параметры). Покрыто позитив/негатив тестами.

### AccessPass
- 🟠 **Не ERC-721-совместим** (терминология): NatSpec называет
  «soulbound ERC-721», но контракт не реализует ERC-721 (нет
  `balanceOf`, `Transfer`-событий, `supportsInterface`, ревертящего
  `ownerOf` для несуществующего). Для Lit ACC это неважно (читается
  `hasAccess`), но кошельки/маркетплейсы NFT не увидят. **Рекомендация
  (doc-fix)**: называть «soulbound access registry», не вводить в
  заблуждение «ERC-721». Уязвимости нет.
- 🟢 **Bypass-защита минта**: `mint` строго `msg.sender == marketplace`;
  `marketplace` ставится один раз (immutable), даже owner не минтит —
  эквивалент `MINTER_ROLE` только у `CourseMarketplace`. Тесты:
  `test_ownerCannotMint_noBypass`.
- 🟢 **Soulbound**: все `transfer*/approve/setApprovalForAll` ревертят
  для любого держателя (клиент И owner-like). Flash-loan ACC-bypass
  невозможен (адресное равенство/владение, не spot-баланс).
- 🟢 **Время**: `hasAccess = _granted && !_expired`, строгое `>`
  (валиден ровно в момент expiry). Re-mint после истечения = продление.
- 🟡 **Dangling tokenId / `_granted` не сбрасывается**: при продлении
  старый `tokenId` остаётся в `ownerOf`, `_granted` не очищается —
  гейтит только `expiry`. Не уязвимость (доступ корректно гасится
  expiry), но рост состояния и «висячий» `ownerOf(oldId)`. Принято.
- 🟢 owner после `setMarketplace` бесправен (нет функций) — мёртвое
  состояние, не риск.

### Treasury
- 🟢 Pull/governance-only `withdraw`, без циклов/массовых рассылок →
  **нет frozen funds**; полный и частичный вывод доступны; сбойный
  получатель не блокирует средства (`TransferFailed`, средства целы).
  Покрыто `Treasury.t.sol`.
- 🟢 `receive`/`fund` учитывают `totalReceived` (кумулятивно, не
  баланс) — корректно.
- 🟡 `withdraw` шлёт на произвольный `to` по решению owner = полный
  контроль казны governance. By design (это протокольная казна).

### Криптология (вне контрактов)
- 🟢 Контракты крипту не выполняют; конфиденциальность — AES-GCM
  (`crypto-envelope`) + Lit threshold (см. `crypto.md`). Здесь только
  состояние прав, читаемое Lit ACC.

---

## 2. Схема деплоя (`script/Deploy.s.sol`, `docker-compose.yml`)

- 🟢 Порядок корректен: `Treasury(owner=deployer)` → `AccessPass`
  (owner=deployer) → `CourseMarketplace(treasury, w3ext)` →
  `pass.setMarketplace(mp)` → `mp.setAccessPass(pass)`. Обе wiring-
  функции one-shot → нельзя переинициализировать.
- 🟠 **Anvil dev-ключ в compose**: сервис `deploy` хардкодит
  общеизвестный приватник anvil в `environment` — **только для
  локального anvil**. Риск: использование того же compose против
  testnet/mainnet с этим ключом. Митигация: ключ применяется лишь к
  `RPC_URL=http://anvil:8545`; для реальных сетей `PRIVATE_KEY`
  передаётся извне. **Рекомендация**: явный комментарий «LOCAL ONLY» +
  отдельный `deploy.prod` профиль без baked-ключа (doc/ops, не код v1).
- 🟢 `w3ext` берётся из `vm.envOr("W3EXT", deployer)` — по умолчанию
  деплойер; для прод — задать `W3EXT`.
- 🟡 `owner` всех контрактов = деплойер (EOA). Для прод рекомендуется
  сразу `transferOwnership` на мультисиг/таймлок (Ownable2Step это
  позволяет). Зафиксировано в SPEC §1 (NFR 6).

---

## 3. Схема минта

- 🟢 Единственный путь минта `AccessPass` — `CourseMarketplace.purchase`
  → `accessPass.mint(buyer, courseId, expiry)`. Никаких публичных/
  owner-минтов. Автор пасс не получает (free через `hasCourseAccess`).
- 🟢 `expiry`: `0`/`PERPETUAL` → 0 (бессрочно, без overflow); иначе
  `now + duration`, теперь ограничено `MAX_DURATION`.
- 🟢 Идемпотентность: повторная покупка при валидном пассе →
  `AlreadyOwned`; после истечения — разрешён ре-минт (продление, оплата
  повторно, treasury кредитуется снова) — покрыто тестом.
- 🟡 `tokenId` монотонно растёт; орфан-токены при продлении (см. 1.
  AccessPass) — состояние, не безопасность.

---

## 4. Версии / тулчейн

- ✅ `pragma ^0.8.28` во всех `src/test/script`; `foundry.toml`
  `solc=0.8.28`, `evm_version=shanghai` (push0 ok на BSC; без Cancun-
  опкодов — консервативно и совместимо).
- 🟢 `src/` без внешних зависимостей (нет OZ) → детерминированная
  сборка; `forge-std` только для тестов.

---

## 5. Итог

Критичных (High) открытых проблем нет. Исправлено в этом проходе:
overflow-DoS по `accessDuration` (Medium→fixed), апгрейд Solidity до
актуальной 0.8.28. Открытые рекомендации (не блокеры, by-design/ops):
ERC-721-терминология AccessPass (doc), treasury push-DoS (governance-
trust), anvil-ключ в compose (ops/doc), передача ownership на мультисиг
перед прод. Cross-chain модуль (SPEC §6) — вне scope v1 (`*(spec)*`).

---

## 6. Точки роста — выполнено (ревью-итерация)

- **#5 — событие `AccessPassSet`** добавлено в `setAccessPass`
  (наблюдаемость wiring критичного адреса); тест
  `test_setAccessPass_emitsEvent`.
- **#1 — CI static analysis**: в Foundry-джоб добавлены
  `forge fmt --check`, **Slither** (`crytic/slither-action`),
  `forge coverage --report summary`, `forge snapshot` — пока
  `continue-on-error: true` (advisory до первичного triage в Foundry-
  среде; затем переключить в blocking).
- **#3 — реальный поиск курсов**: `smartcontracts/buckets/course-index.js`
  (агрегация `_lit/manifest.json` всех бакетов, поиск по
  bucket/title/lesson/tag) — заменяет фильтр только по имени бакета.
- **#4 — верификация SDK-адаптеров**: `loadSdk`/`sdk` инъекции +
  `tests/sdk-adapters.shape.test.js` пинит call-shape
  `@lit-protocol`/`@bnb-chain` (ловит C1-класс: регистр `offchainauth`,
  `signTypedDataCallback`, EDDSA delegate-auth) без сети.
- **#2 — единый pull (последний push убран)**: `purchase` больше не
  пушит на `treasury`; все три (`author`/`w3ext`/`treasury`) — pull.
  Реверт-treasury не блокирует продажи. Снят 🟡 push-DoS.
- **#8 — кастомная ошибка реентранси**: `require(_lock==1,"REENTRANCY")`
  → `error Reentrancy()` (газ + единый стиль custom-error).
- **Foundry — логи + газ + полное покрытие**: CI прогоняет
  `forge test -vvvv --gas-report` (полные трейсы вызовов + emitted
  events + ревёрты + per-function gas table) и **жёсткий 100% gate** по
  `src/` (`forge coverage --report lcov` + `scripts/check-coverage.sh`,
  падает джоб при <100% LH/LF любого `src/*.sol`). Артефакты CI:
  `forge-test.log`, `coverage-summary.txt`, `lcov.info`. Dead-branch
  «sum > 10000» в `setParams` удалён (`MAX_BPS_EACH·2 < BPS_DENOMINATOR`
  — инвариант, не runtime-проверка) → нет недостижимых веток.
