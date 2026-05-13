# Web3 Genesis — Выбор песочницы для образовательного фронтенда

> Этот документ — методологическая основа курса. Он отвечает на вопрос:
> **«В какой среде студент должен запускать первый смарт-контракт?»** —
> и обосновывает выбор стека для Lesson 01 и последующих модулей.

---

## 1. Критерии выбора

Для образовательного фронтенда «песочница» оценивается по трём измеримым
параметрам:

| Параметр | Обозначение | Что измеряем |
|---|---|---|
| Интерактивность | `I` | Скорость цикла «правка → запуск → результат» (сек) |
| Прозрачность состояния | `S` | Глубина инспекции: balances, storage, events, traces |
| Сложность развёртывания | `D` | Что нужно поставить локально, чтобы запустить пример |

Оптимизируем `F(I, S) / D`. На практике это означает: цена входа должна быть
нулевой, а потолок — высоким.

---

## 2. Кандидаты

### 2.1 Daskibo in-memory sandbox (этот курс, Lesson 01)

- **Тип:** чистый ES-module, исполняется и в браузере, и в vitest.
- **Преимущества:** ноль зависимостей, моментальный feedback (<1 ms на транзакцию),
  детерминированные адреса и tx-хэши (стабильные скриншоты и README), полностью
  тестируется как обычный JS-модуль (`tests/web3-sandbox.test.js`).
- **Ограничения:** не настоящий EVM — нет Solidity-байткода, нет storage-layout,
  нет настоящего keccak256. Симулятор моделирует только семантику ERC-20.
- **Когда использовать:** Lesson 01 (deploy, transfer, events) — фокус на
  ментальной модели, а не на toolchain.

### 2.2 Remix IDE (in-browser solc-js)

- **Тип:** полноценная IDE с Solidity-компилятором `solc-js` и встроенным
  JavaScript-EVM.
- **Интеграция:** через `iframe` (https://remix.ethereum.org/?#code=...) с
  URL-параметром `code` (base64 + flateCompress) или через
  `@remixproject/plugin-iframe` для встраивания собственной панели.
- **Преимущества:** реальная компиляция Solidity, видны storage-слоты,
  встроенный отладчик (step in / step over / inspect stack).
- **Ограничения:** управление UX ограничено (Remix владеет хромом),
  состояние теряется при refresh, нет JSON-RPC между плеер-сессиями.
- **Когда использовать:** Lesson 02 — «настоящий» Solidity-компилятор,
  storage-layout, отладчик.

### 2.3 Anvil (Foundry)

- **Тип:** реальный EVM-node на Rust, JSON-RPC на `localhost:8545`,
  опциональный форк mainnet через `--fork-url`.
- **Доставка студенту:**
  - Локально: `curl -L https://foundry.paradigm.xyz | bash && foundryup`
  - Облачно: Docker-образ `ghcr.io/foundry-rs/foundry:latest`
    в Codespaces / DevContainer.
  - StackBlitz/CodeSandbox node-окружение поддерживает Anvil через
    `npx @foundry-rs/easy-foundryup`.
- **Преимущества:** полностью реальный EVM, трейсинг (`cast run`),
  `forge test` для контрактных юнит-тестов, поддержка cheatcodes
  (`vm.warp`, `vm.deal`, `vm.prank`).
- **Ограничения:** требует node.js окружения или native-бинарь —
  не запускается в чистом браузере, выше когнитивная нагрузка.
- **Когда использовать:** Lesson 03 — форк mainnet, cheatcodes,
  Foundry-тесты.

### 2.4 Tenderly Virtual Testnet

- **Тип:** облачный fork mainnet с публичным RPC. Программное API
  для управления состоянием (`tenderly_setBalance`, `evm_increaseTime`,
  `tenderly_setStorageAt`).
- **Доставка студенту:** Frontend получает `rpcUrl` от бэкенда и подключает
  viem/wagmi через `createPublicClient({ chain, transport: http(rpcUrl) })`.
- **Преимущества:** реальный mainnet-state с возможностью «подкрутить»
  балансы, визуальный отладчик уровня production (трейсы транзакций,
  decoded calls, gas profiler), уникальный RPC на каждого студента
  — изоляция сессий.
- **Ограничения:** требует Tenderly-аккаунт и квоту, есть rate-limits.
- **Когда использовать:** Lesson 04+ — интеграция с реальным DeFi
  (Uniswap v3, AAVE), симуляция взаимодействия с production-контрактами.

---

## 3. Сравнительная таблица

| Характеристика | Daskibo in-memory | Remix VM | Anvil | Tenderly Virtual Testnet |
|---|---|---|---|---|
| Тип исполнения | In-browser ESM | In-browser JS-EVM | Native EVM, JSON-RPC | Облачный fork RPC |
| Latency | <1 ms | 5–50 ms | 10–100 ms | 50–300 ms |
| Persistence | Per-tab session | Per-tab session | Per-process | Per-fork (часы–дни) |
| Solidity-компилятор | ✗ (классная модель) | ✓ solc-js | ✓ solc | ✓ remote |
| Storage inspection | balances, events | full storage, stack | full + trace | full + decoded |
| Debugger | event log | step-debugger | `cast run` traces | визуальный (web) |
| JSON-RPC API | ✗ | ✗ (через plugin) | ✓ | ✓ |
| Fork mainnet | ✗ | ✗ | ✓ `--fork-url` | ✓ (по умолчанию) |
| Cheatcodes | ✗ | ✗ | ✓ Forge std | ✓ Tenderly API |
| Виден из vitest | ✓ (наш модуль) | ✗ | ✓ (через RPC) | ✓ (через RPC) |
| Стоимость | бесплатно | бесплатно | бесплатно | freemium |
| Кн. нагрузка (C_setup) | **0** | **низкая** | средняя | низкая (UX) |
| Глубина данных (D_d) | низкая | средняя | высокая | **очень высокая** |

---

## 4. Решение

Курс использует **четырёхступенчатую песочницу**, нарастающую по сложности:

```
Lesson 01  →  Daskibo in-memory sandbox      [ментальная модель]
Lesson 02  →  Remix VM (solc-js)             [настоящий Solidity]
Lesson 03  →  Anvil (Foundry)                [JSON-RPC, forge test]
Lesson 04+ →  Tenderly Virtual Testnet       [реальный mainnet]
```

Такой порядок минимизирует `C_setup` на старте (когда студент ещё не уверен,
хочет ли он продолжать), а потом плавно поднимает потолок до production-grade
инструментов.

---

## 5. Архитектура фронтенда

```
┌──────────────────────────────────────────────────────────────┐
│  Lesson HTML  (academy/courses/web3-genesis/lessons/NN/)     │
│  ┌───────────────────────────────────────────────────────┐   │
│  │  <div data-sandbox="erc20"></div>                     │   │
│  └───────────────────────────────────────────────────────┘   │
│                       │                                       │
│                       ▼                                       │
│  erc20-playground.js  ───────  только DOM-event-listeners    │
│                       │                                       │
│                       ▼                                       │
│  sandbox.js  (pure ESM, тестируется vitest'ом)               │
│      createSandbox() → { deployERC20, transfer, balanceOf,   │
│                          totalSupply, getEvents, … }         │
└──────────────────────────────────────────────────────────────┘
                        │
            ┌───────────┼───────────┐
            ▼           ▼           ▼
        Lesson 02   Lesson 03   Lesson 04+
        (Remix)     (Anvil)     (Tenderly Virtual Testnet)
                    через JSON-RPC через viem/wagmi
```

`sandbox.js` остаётся в качестве «эталона ожидаемого поведения» — его
тесты проходят так же на Anvil и Tenderly (через адаптер), что даёт нам
непрерывную проверку, что мы учим студентов одной и той же ментальной модели,
независимо от уровня бэкенда.

---

## 6. Ссылки

- [Tenderly: Virtual Testnets](https://docs.tenderly.co/virtual-testnets) — облачный fork и Simulation API.
- [Foundry Book: Anvil](https://book.getfoundry.sh/anvil/) — локальный EVM-node.
- [Remix Plugin API](https://remix-plugin.readthedocs.io/) — встраивание Remix в собственный фронтенд.
- [viem](https://viem.sh/) — TypeScript-клиент для EVM, рекомендованный для всех уроков.
- [wagmi](https://wagmi.sh/) — React-хуки поверх viem.
- [ERC-20 Token Standard (EIP-20)](https://eips.ethereum.org/EIPS/eip-20) — оригинальная спецификация.
- [OpenZeppelin ERC20.sol](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/token/ERC20/ERC20.sol) — production-grade reference.
