# Web3 Genesis · Аудит реальности песочниц и полноты ERC-20

> Это рабочий артефакт, фиксирующий, **что в каждой песочнице курса
> происходит на самом деле**, какие функции стандарта ERC-20 доступны
> студенту, и где границы достоверности симулятора. Документ обновляется
> при каждом изменении `assets/sandbox.js` или `assets/sandbox-embed.js`.

Дата: 2026-05-14. Версия viem в CDN: `viem@2` (https://esm.sh/viem@2).
Версия Solidity в Remix iframe: компилятор студент выбирает сам, дефолт
0.8.24+.

---

## 1. Карта песочниц

| Песочница | Тип | Где реально исполняется код | Урок |
|---|---|---|---|
| `assets/sandbox.js` + `erc20-playground.js` | In-memory JS симулятор семантики ERC-20 | браузер (один таб) / vitest | 02 |
| `assets/wallet-demo.js` | viem `mnemonicToAccount`, secp256k1 в браузере | браузер (локально) | 01 |
| `assets/rpc-playground.js` | детерминированный мок JSON-RPC envelope | браузер (без сети) | 03 |
| Embed `metamask` | вызов EIP-3085 `wallet_addEthereumChain` | extension MetaMask | 01 |
| Embed `rpc-live` (mainnet / Sepolia) | реальный POST JSON-RPC | публичная нода (eth.llamarpc.com / rpc.sepolia.org) | 03 |
| Embed `remix` / `remix-inline` | iframe Remix IDE | remix.ethereum.org (solc-js + JS-EVM) | 02, 04, 06, 07, 16 |
| Embed `tenderly` | deep-link на dashboard.tenderly.co | облако Tenderly | 05, 08, 16 |
| Embed `anvil` | копи-пасте команды Foundry | локальная машина студента | 04 |

**Никакого backend-проксирования через Daskibo нет.** Все запросы из
браузера летят на прямые домены (eth.llamarpc.com, rpc.sepolia.org,
remix.ethereum.org, dashboard.tenderly.co, esm.sh).

---

## 2. Что РЕАЛЬНО происходит в каждом embed'е

### 2.1 `data-embed="rpc-live"` (Lesson 03)

- `fetch(rpc, { method: 'POST', body: <JSON-RPC 2.0> })` отправляется
  на публичную ноду. Никакого моков.
- Поддерживаемые методы из выпадашки: `eth_blockNumber`, `eth_chainId`,
  `eth_gasPrice`, `eth_getBalance`, `eth_getCode`, `eth_getBlockByNumber`,
  `eth_getTransactionByHash`, `eth_getTransactionReceipt`.
- Параметр для `eth_getBlockByNumber` поддерживает: named tags
  (`latest` / `safe` / `finalized` / `earliest` / `pending`), 0x-hex
  (`0x1452f00`) и decimal (`21347584`). Decimal автоматически
  конвертится в hex через `encodeBlockTag()`.
- Все ответы — ровно то, что вернёт нода, без фильтрации.
- **Ограничения**:
  - CORS: публичные RPC обычно разрешают cross-origin для read-only,
    но Sepolia-публичка иногда rate-limit'ит — в этом случае ошибка
    видна прямо в текстовом выводе.
  - Состояние блокчейна меняется в реальном времени — `latest`
    результат на момент чтения.

### 2.2 `data-embed="remix"` / `"remix-inline"`

- Iframe указывает на `https://remix.ethereum.org/?autoCompile=true&optimize=true#code=<base64-url-safe>&filename=...`
- Remix действительно компилирует Solidity (`solc-js` в WebAssembly) и
  деплоит в JavaScript-EVM, встроенный в IDE. Это **настоящий EVM**,
  с настоящим storage layout, gas accounting, REVERT/RETURN opcodes.
- **Состояние** не персистится между перезагрузками вкладки —
  IndexedDB Remix живёт только в текущей сессии.
- **Sandbox-флаги iframe** (`allow-scripts`, `allow-same-origin`,
  `allow-forms`, `allow-popups`, `allow-downloads`, `allow-modals`)
  достаточны для полной работы IDE.
- **Ограничения**:
  - В Remix VM нет реальных контрактов mainnet (USDC, Uniswap, Chainlink
    Data Feeds) — для них нужен `data-embed="tenderly"` (mainnet fork) или
    Anvil `--fork-url`.
  - iframe весит ~3 МБ (WebAssembly solc-js), грузится 3–5 сек —
    поэтому мы делаем lazy: iframe вставляется только после клика
    «Открыть».

### 2.3 `data-embed="metamask"`

- Кнопка вызывает `window.ethereum.request({ method: 'wallet_addEthereumChain', params: [...] })`
  — стандарт **EIP-3085**.
- Preset'ы (Sepolia, Mainnet, Arbitrum One, OP, Base) содержат
  настоящие официальные RPC URL и block explorer URL.
- Без установленного MetaMask кнопка возвращает ссылку на загрузку и
  не пытается обмануть студента «всё ок».

### 2.4 `data-embed="tenderly"`

- 4 deep-link карты на:
  - https://dashboard.tenderly.co/register
  - https://dashboard.tenderly.co/virtual-testnets/new?network=…&slug=…
  - https://docs.tenderly.co/virtual-testnets
  - https://docs.tenderly.co/simulations-and-forks/simulation-api
- Никакого «нашего» аккаунта Tenderly или прокси. Студент сам
  создаёт VNet, копирует RPC URL и подключает к своему Foundry / viem.

### 2.5 `data-embed="anvil"`

- Это **информационная карта**, не код. Anvil — нативный бинарь, в
  браузере он не запускается ни при каких условиях. Карта даёт
  готовые копи-пасте команды для установки + fork-mode.

---

## 3. Полнота ERC-20 в каждом сценарии

EIP-20 определяет **6 функций + 2 события**:

| Член стандарта | sandbox.js (in-memory) | erc20-playground UI | Remix iframe (Lesson 02) |
|---|---|---|---|
| `name()` | ✅ через `tokenInfo` | ✅ карточка Token | ✅ |
| `symbol()` | ✅ | ✅ | ✅ |
| `decimals()` | ✅ | ✅ | ✅ |
| `totalSupply()` | ✅ | ✅ | ✅ |
| `balanceOf(address)` | ✅ | ✅ таблица балансов | ✅ |
| `transfer(to, value)` | ✅ | ✅ форма | ✅ |
| `approve(spender, value)` | ✅ | ✅ форма (поддерживает `max` / `unlimited`) | ✅ |
| `transferFrom(from, to, value)` | ✅ | ✅ форма | ✅ |
| `allowance(owner, spender)` | ✅ | ✅ таблица «allowances» | ✅ |
| event `Transfer(from, to, value)` | ✅ event log | ✅ event log + лента | ✅ |
| event `Approval(owner, spender, value)` | ✅ | ✅ лента | ✅ |

### 3.1 Семантические инварианты, которые проверяются

Sandbox реализует **полный набор инвариантов EIP-20**:

- ✅ revert при `transfer` на `address(0)` → `ERC20_ZERO_TO`
- ✅ revert при `approve` на `address(0)` → `ERC20_ZERO_SPENDER`
- ✅ revert при `transfer/transferFrom` если balance < amount → `ERC20_INSUFFICIENT`
- ✅ revert при `transferFrom` если allowance < amount → `ERC20_INSUFFICIENT_ALLOWANCE`
- ✅ `transferFrom` декрементирует allowance, **кроме** случая
  `allowance == MAX_UINT256` (как OpenZeppelin / USDC)
- ✅ Сумма всех `balanceOf` ненулевых аккаунтов = `totalSupply` после
  любой комбинации transfer + transferFrom (mint/burn выпуска не
  моделируется после деплоя)
- ✅ Mint-on-deploy эмитируется как `Transfer(address(0), deployer, totalSupply)`
- ✅ `Approval`-event эмитируется при `approve`, но НЕ при автоматическом
  декременте в `transferFrom` (это поведение OZ 4.x+)
- ✅ Race-condition approve(N) → approve(M): новая allowance просто
  перезаписывает старую, без force-zero (это и есть та самая уязвимость,
  про которую мы говорим в Lesson 02 → вопрос Q4 в quiz'е)

### 3.2 Что НЕ моделируется (намеренно)

- ❌ Solidity-байткод и storage layout: Remix iframe — для этого.
- ❌ Настоящий keccak256: `deriveAddress` использует FNV-1a, чисто для
  стабильности скриншотов и docs. Адреса детерминированы и совпадают
  между прогонами.
- ❌ EIP-2612 `permit`: подпись EIP-712 не моделируется.
- ❌ `IERC20Metadata` (динамические `name`/`symbol`/`decimals` через
  fallback) — мы храним метаданные в JS-полях.
- ❌ Hooks / `_update`: песочница не позволяет наследоваться и
  переопределять переходы (для этого нужен Remix или Foundry).
- ❌ Reverts в виде Solidity custom errors с decoded reasons — у нас
  свои `SandboxError` с человекочитаемыми сообщениями.

Эти ограничения — следствие выбора «классная модель vs.
verisimilitude». Подробности и обоснование — в `sandbox-comparison.md`.

---

## 4. Покрытие тестами

`tests/web3-sandbox.test.js` (vitest):
- 4 группы (address helpers, deploy, transfer, invariants)
- покрывают все методы expose'нутого API
- проверяют детерминизм адресов, неизменность `totalSupply`, gas accounting

`tests/web3-sandbox-erc20.test.js` (новые, см. ниже):
- approve(N) → allowance читает N → approve(0) → allowance читает 0
- transferFrom без approve → revert
- transferFrom после approve(MAX) → allowance не меняется
- Approval-event эмитируется
- Approval-event НЕ эмитируется при transferFrom

`tests/web3-sandbox-embed.test.js`:
- buildRemixUrl base64-safe
- mountAll → DOM правильный для всех 5 типов
- rpc-live действительно вызывает fetch (mocked)
- encodeBlockTag decimal → hex (новый тест)

---

## 5. Чек-лист совместимости с реальными контрактами

Цель: студент пишет ERC-20 в нашей песочнице, потом тот же контракт
ведёт себя на mainnet/Sepolia так же. **Ничего не должно
«сломаться» при переходе.**

| Поведение | Sandbox | Mainnet OZ ERC-20 |
|---|---|---|
| `transfer(0, …)` | revert | revert |
| `approve(spender, MAX)` + transferFrom | allowance не уменьшается | то же |
| `approve(spender, N)` где N < MAX, потом transferFrom(K) | allowance: N − K | то же |
| `transferFrom` без approve | revert | revert |
| Mint при деплое | Transfer(0, deployer, supply) | то же |
| Сумма balanceOf = totalSupply | ✓ | ✓ |
| Approval emitted на approve | ✓ | ✓ |
| Approval emitted на transferFrom (auto-decrement) | ✗ | ✗ (OZ 4+, MakerDAO Dai тоже) |

Что **отличается** от mainnet:
- адреса контрактов: у нас FNV-1a, на mainnet — keccak256 от RLP
  encoding (deployer, nonce)
- gas: у нас фиксированные константы (51000 transfer, 46000 approve,
  56000 transferFrom, 850000 deploy) — реальные значения зависят от
  storage state (cold / warm slots, EIP-2929)
- tx hashes: у нас детерминированные, на mainnet — keccak256(rlp(tx))

---

## 6. Известные ограничения и TODO

- [ ] Sepolia public RPC иногда падает по rate-limit. Можно добавить
      fallback на Tenderly Public RPC, но это требует API-ключа.
- [ ] Remix iframe не позволяет программно нажать «Deploy» — студенту
      придётся кликнуть вручную внутри iframe.
- [ ] Tenderly создаёт VNet на свободном плане, но Simulation API
      имеет квоту 50k симуляций в месяц. На больших классах придётся
      делиться аккаунтом или брать payed-план.
- [ ] EIP-2612 permit-демо не реализовано в in-memory sandbox.
      Решение: показать через Remix iframe в продвинутом уроке.

---

## 7. Как воспроизвести этот аудит

```bash
# 1. Запустить unit-тесты sandbox + embed:
npm test

# 2. Открыть Lesson 02 в браузере, проверить, что в карточке
#    "ERC-20 sandbox" есть все формы:
python3 -m http.server 8000
open http://localhost:8000/academy/courses/web3-genesis/lessons/02/

# 3. Поочерёдно нажать:
#    - Deploy ERC-20 → видим Token card + balances + native gas debit
#    - Transfer alice → bob 100 → видим Transfer event
#    - Approve alice → bob 50 → видим Approval event и allowances table
#    - TransferFrom bob spender → alice from → carol to → 25
#      видим, что у alice баланс уменьшился, у carol увеличился,
#      allowance alice→bob уменьшилась с 50 до 25

# 4. Открыть Remix-iframe в той же странице, скомпилировать
#    MinimalERC20.sol, повторить deploy/approve/transferFrom уже в
#    настоящем JS-EVM. Поведение должно совпадать с нашим симулятором.

# 5. На live RPC карточке (Lesson 03) проверить:
#    - eth_blockNumber на mainnet → возвращает текущий блок
#    - eth_getBlockByNumber с decimal-вводом (например, 21000000) →
#      нормальный ответ (раньше был bug — decimal не конвертился в hex)
```

Если шаги выше отрабатывают — аудит зелёный.
