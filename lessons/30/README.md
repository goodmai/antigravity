# Урок 30: Web3 — Основы Solidity

## Введение

Solidity — это статически типизированный язык программирования для написания смарт-контрактов на Ethereum и EVM-совместимых блокчейнах. Контракт — это автономная программа, хранящаяся прямо в блокчейне: она выполняется детерминированно, неизменяема после деплоя и управляет токенами, NFT, DAO и любой другой децентрализованной логикой.

---

## 1. Версии Solidity

Первая строка любого `.sol`-файла — директива `pragma`, фиксирующая совместимую версию компилятора.

```solidity
// Точная версия
pragma solidity 0.8.24;

// Диапазон: от 0.8.0 включительно до (не включая) 0.9.0
pragma solidity ^0.8.0;

// Явный диапазон
pragma solidity >=0.8.0 <0.9.0;
```

### Ключевые вехи версий

| Версия | Главное нововведение |
|--------|----------------------|
| 0.4.x  | Первые стабильные релизы, функции `fallback` |
| 0.5.x  | Явное указание `payable`, `address payable` |
| 0.6.x  | `try/catch`, виртуальные функции, `override` |
| 0.7.x  | Убраны `now` и `suicide`, улучшен синтаксис |
| 0.8.x  | Переполнение проверяется по умолчанию, пользовательские ошибки (`error`), `unchecked` |

> **Рекомендация:** Используйте `^0.8.20` или выше для новых проектов — встроенная защита от overflow/underflow без SafeMath.

---

## 2. Типы данных

### 2.1 Целые числа

```solidity
uint8   public smallNum = 255;       // беззнаковое, 8 бит (0..255)
uint256 public bigNum   = 1e18;      // беззнаковое, 256 бит (по умолчанию uint)
int256  public signed   = -100;      // знаковое, 256 бит
int8    public tiny     = -128;      // знаковое, 8 бит (-128..127)
```

Шаг: кратные 8 битам (`uint8`, `uint16`, … `uint256`).

### 2.2 Булев тип

```solidity
bool public isActive = true;
bool public flag     = false;
```

### 2.3 Адрес

```solidity
address public owner;                       // 20-байтовый адрес (160 бит)
address payable public treasury;            // адрес, принимающий ETH

owner = msg.sender;                         // адрес отправителя транзакции
uint256 bal = owner.balance;                // баланс в wei
treasury.transfer(1 ether);                 // отправка ETH
```

### 2.4 Строки и байты

```solidity
string public name   = "AntiGravity";       // динамическая строка UTF-8
bytes  public data   = hex"deadbeef";       // динамический массив байт
bytes32 public hash  = keccak256("hello");  // фиксированные байты (газ дешевле)
```

### 2.5 Массивы

```solidity
// Статический
uint256[3] public trio = [1, 2, 3];

// Динамический (хранилище)
uint256[] public scores;
scores.push(42);
scores.push(99);
uint256 len = scores.length;   // 2
delete scores[0];              // обнуляет элемент, не сдвигает
```

### 2.6 Маппинги (словари)

```solidity
mapping(address => uint256) public balances;
mapping(address => mapping(address => bool)) public approved;

balances[msg.sender] = 100;
approved[msg.sender][spender] = true;
```

Маппинги не итерируемы и не имеют размера — значения по умолчанию равны нулю.

### 2.7 Структуры

```solidity
struct Player {
    string name;
    uint256 score;
    bool active;
}

Player public alice = Player({ name: "Alice", score: 9001, active: true });

// Маппинг структур
mapping(address => Player) public players;
players[msg.sender] = Player("Bob", 0, true);
```

### 2.8 Перечисления

```solidity
enum Status { Pending, Active, Closed }

Status public state = Status.Pending;

function activate() external {
    state = Status.Active;
}
```

### 2.9 Специальные глобальные переменные

| Переменная | Значение |
|------------|----------|
| `msg.sender` | Адрес вызывающего |
| `msg.value` | Количество wei в вызове |
| `block.timestamp` | Unix-время текущего блока |
| `block.number` | Номер текущего блока |
| `tx.origin` | Адрес инициатора транзакции |

---

## 3. Функции

### 3.1 Объявление функции

```solidity
function имя(типы параметров) видимость модификаторы returns (типы возврата) {
    // тело
}
```

### 3.2 Примеры

```solidity
// Простая функция без возврата
function setName(string calldata _name) external {
    name = _name;
}

// Функция с возвратом
function getScore(address player) external view returns (uint256) {
    return scores[player];
}

// Несколько возвращаемых значений
function getInfo() public pure returns (string memory, uint256) {
    return ("AntiGravity", 30);
}

// Именованные возвращаемые значения
function divmod(uint256 a, uint256 b) public pure returns (uint256 quot, uint256 rem) {
    quot = a / b;
    rem  = a % b;
}
```

### 3.3 Модификаторы состояния

| Модификатор | Чтение storage | Запись storage | Стоимость газа |
|-------------|---------------|----------------|----------------|
| *(нет)*     | ✅ | ✅ | Полная |
| `view`      | ✅ | ❌ | Бесплатно при внешнем вызове |
| `pure`      | ❌ | ❌ | Бесплатно при внешнем вызове |

### 3.4 `payable` — приём ETH

```solidity
function deposit() external payable {
    balances[msg.sender] += msg.value;
}

// Специальные функции для приёма ETH
receive() external payable {}          // вызывается при пустых данных
fallback() external payable {}         // вызывается при неизвестной сигнатуре
```

### 3.5 Пользовательские модификаторы

```solidity
modifier onlyOwner() {
    require(msg.sender == owner, "Not owner");
    _;   // точка вставки — здесь выполнится тело функции
}

modifier nonZero(uint256 amount) {
    require(amount > 0, "Zero amount");
    _;
}

function withdraw(uint256 amount) external onlyOwner nonZero(amount) {
    payable(msg.sender).transfer(amount);
}
```

---

## 4. Видимость функций и переменных

```solidity
contract Visibility {
    uint256 private   secret   = 1;   // только этот контракт
    uint256 internal  shared   = 2;   // этот + наследники
    uint256 public    exposed  = 3;   // все + авто-getter
    // external — только для функций, не переменных
}
```

### Сводная таблица

| Модификатор | Внешние аккаунты/контракты | Наследники | Сам контракт |
|-------------|:--------------------------:|:----------:|:------------:|
| `public`    | ✅ | ✅ | ✅ |
| `external`  | ✅ | ❌* | ❌ |
| `internal`  | ❌ | ✅ | ✅ |
| `private`   | ❌ | ❌ | ✅ |

\* Наследник может вызвать через `this.функция()`, но это тратит газ.

```solidity
contract Base {
    function _internalHelper() internal pure returns (uint256) { return 42; }
}

contract Child is Base {
    function useHelper() external pure returns (uint256) {
        return _internalHelper();   // OK — inherited internal
    }
}
```

---

## 5. Обработка ошибок — `require`, `revert`, `assert`, `try/catch`

### 5.1 `require` — проверка входных данных

```solidity
function transfer(address to, uint256 amount) external {
    require(to != address(0), "Zero address");
    require(balances[msg.sender] >= amount, "Insufficient balance");

    balances[msg.sender] -= amount;
    balances[to]         += amount;
}
```

`require` откатывает транзакцию и **возвращает неиспользованный газ**.

### 5.2 `revert` — явный откат с сообщением

```solidity
function buy(uint256 qty) external payable {
    if (qty == 0) revert("Zero qty");
    if (msg.value < qty * PRICE) revert("Insufficient ETH");
    // ...
}
```

### 5.3 Пользовательские ошибки (Solidity ≥ 0.8.4)

Экономят газ и позволяют передавать структурированные данные:

```solidity
error InsufficientBalance(address user, uint256 has, uint256 needs);
error Unauthorized(address caller);

function withdraw(uint256 amount) external {
    if (msg.sender != owner) revert Unauthorized(msg.sender);
    if (address(this).balance < amount)
        revert InsufficientBalance(msg.sender, address(this).balance, amount);
    payable(msg.sender).transfer(amount);
}
```

### 5.4 `assert` — инварианты

```solidity
function invariant() internal view {
    assert(totalSupply == sumOfBalances());  // должен быть всегда истинен
}
```

`assert` потребляет **весь газ** при срабатывании — используется только для инвариантов, не для проверки входных данных.

### 5.5 `try/catch` — вызов внешних контрактов с перехватом ошибок

```solidity
interface IToken {
    function transfer(address to, uint256 amount) external returns (bool);
}

contract Caller {
    function safeTransfer(address token, address to, uint256 amount) external {
        try IToken(token).transfer(to, amount) returns (bool ok) {
            require(ok, "Transfer returned false");
        } catch Error(string memory reason) {
            // revert/require с сообщением
            emit TransferFailed(reason);
        } catch (bytes memory lowLevelData) {
            // любой другой откат (custom error, panic)
            emit TransferFailedRaw(lowLevelData);
        }
    }

    event TransferFailed(string reason);
    event TransferFailedRaw(bytes data);
}
```

---

## 6. Вызов других контрактов

### 6.1 Через интерфейс (рекомендуется)

```solidity
interface IERC20 {
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
}

contract DeFiApp {
    IERC20 public token;

    constructor(address _token) {
        token = IERC20(_token);
    }

    function getMyBalance() external view returns (uint256) {
        return token.balanceOf(msg.sender);
    }

    function deposit(uint256 amount) external {
        bool ok = token.transfer(address(this), amount);
        require(ok, "Transfer failed");
    }
}
```

### 6.2 Низкоуровневый `call`

```solidity
(bool success, bytes memory data) = target.call{value: 1 ether, gas: 50000}(
    abi.encodeWithSignature("transfer(address,uint256)", recipient, amount)
);
require(success, "Call failed");
```

Используйте `call` только когда ABI неизвестен заранее.

### 6.3 `delegatecall` — выполнение кода в контексте вызывающего

```solidity
// Паттерн прокси-контракта
(bool ok, ) = implementation.delegatecall(msg.data);
require(ok, "Delegatecall failed");
```

`delegatecall` использует **хранилище и баланс** вызывающего контракта, но **код** из `implementation`. Основа upgrade-паттернов.

### 6.4 Отправка ETH

```solidity
// transfer: 2300 gas, revert при ошибке (устарело)
payable(recipient).transfer(amount);

// send: 2300 gas, возвращает bool (устарело)
bool ok = payable(recipient).send(amount);

// call: гибкий газ, рекомендован (CEI-паттерн + проверка)
(bool success, ) = payable(recipient).call{value: amount}("");
require(success, "ETH transfer failed");
```

---

## 7. Паттерны Solidity

### 7.1 Ownable — контроль доступа

```solidity
contract Ownable {
    address public owner;

    event OwnershipTransferred(address indexed prev, address indexed next);

    constructor() {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Ownable: not owner");
        _;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }
}
```

### 7.2 CEI — Checks-Effects-Interactions (защита от re-entrancy)

```solidity
function withdraw(uint256 amount) external {
    // 1. Checks
    require(balances[msg.sender] >= amount, "Insufficient");

    // 2. Effects — обновляем состояние ДО внешнего вызова
    balances[msg.sender] -= amount;

    // 3. Interactions — внешний вызов идёт последним
    (bool ok, ) = payable(msg.sender).call{value: amount}("");
    require(ok, "Transfer failed");
}
```

### 7.3 ReentrancyGuard

```solidity
contract ReentrancyGuard {
    uint256 private _status = 1;   // 1 = not entered

    modifier nonReentrant() {
        require(_status == 1, "Reentrant call");
        _status = 2;
        _;
        _status = 1;
    }
}

contract Vault is ReentrancyGuard {
    mapping(address => uint256) public balances;

    function withdraw() external nonReentrant {
        uint256 amount = balances[msg.sender];
        balances[msg.sender] = 0;
        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        require(ok, "Transfer failed");
    }
}
```

### 7.4 Pull Payment (вместо прямых переводов)

```solidity
contract PullPayment {
    mapping(address => uint256) public pendingWithdrawals;

    function _asyncTransfer(address dest, uint256 amount) internal {
        pendingWithdrawals[dest] += amount;
    }

    function withdrawPayments() external {
        uint256 amount = pendingWithdrawals[msg.sender];
        pendingWithdrawals[msg.sender] = 0;
        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        require(ok, "Withdraw failed");
    }
}
```

### 7.5 Events — логирование

```solidity
event Transfer(address indexed from, address indexed to, uint256 value);
event Approval(address indexed owner, address indexed spender, uint256 value);

function transfer(address to, uint256 amount) external {
    balances[msg.sender] -= amount;
    balances[to]         += amount;
    emit Transfer(msg.sender, to, amount);
}
```

`indexed` поля индексируются блокчейном — по ним можно фильтровать события.

---

## 8. Полный пример контракта

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20Minimal {
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

error Unauthorized(address caller);
error InsufficientFunds(uint256 available, uint256 required);

contract SimpleVault {
    address public owner;
    IERC20Minimal public token;
    mapping(address => uint256) public deposits;
    uint256 private _locked = 1;

    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized(msg.sender);
        _;
    }

    modifier nonReentrant() {
        require(_locked == 1, "Reentrant");
        _locked = 2;
        _;
        _locked = 1;
    }

    constructor(address _token) {
        owner = msg.sender;
        token = IERC20Minimal(_token);
    }

    function deposit(uint256 amount) external nonReentrant {
        require(amount > 0, "Zero amount");
        bool ok = token.transfer(address(this), amount);
        require(ok, "Token transfer failed");
        deposits[msg.sender] += amount;
        emit Deposited(msg.sender, amount);
    }

    function withdraw(uint256 amount) external nonReentrant {
        uint256 available = deposits[msg.sender];
        if (available < amount) revert InsufficientFunds(available, amount);

        deposits[msg.sender] -= amount;    // Effects перед Interactions

        try token.transfer(msg.sender, amount) returns (bool ok) {
            require(ok, "Token transfer returned false");
        } catch Error(string memory reason) {
            deposits[msg.sender] += amount; // откат изменения состояния
            revert(reason);
        }

        emit Withdrawn(msg.sender, amount);
    }

    function recoverETH() external onlyOwner {
        (bool ok, ) = payable(owner).call{value: address(this).balance}("");
        require(ok, "ETH recovery failed");
    }

    receive() external payable {}
}
```

---

## Практические задания

1. **Типы данных**: Напишите контракт `Registry`, хранящий маппинг `address → struct { string name; uint8 level; bool verified; }`. Добавьте функции `register`, `getInfo` и `verify` (только owner).

2. **Видимость**: Создайте контракт с 4 функциями разной видимости и убедитесь в Remix, что `private`/`internal` не вызываются снаружи.

3. **Обработка ошибок**: Переделайте пример выше, заменив все `require` на пользовательские ошибки (`error`). Измерьте экономию газа в Remix.

4. **Вызов контракта**: Напишите контракт `Router`, который вызывает функцию другого контракта через интерфейс, перехватывая ошибки через `try/catch`.

5. **Паттерн CEI + ReentrancyGuard**: Реализуйте мини-банк с депозитом и выводом ETH, защищённый от атаки повторного входа. Напишите контракт-атакующий и убедитесь, что защита работает.

6. **Версии**: Откройте Remix, создайте один контракт с `pragma solidity 0.7.6` и один с `^0.8.0`. Попробуйте вызвать переполнение `uint256` в обоих — сравните поведение.

---

## Ключевые концепции

- **pragma solidity** — фиксирует версию компилятора; используйте `^0.8.x`
- **Типы данных** — uint/int, bool, address, bytes, string, array, mapping, struct, enum
- **Видимость** — `public > external / internal > private`; `external` дешевле `public` для функций
- **Модификаторы состояния** — `view` (читает), `pure` (нет доступа к storage)
- **CEI-паттерн** — Checks → Effects → Interactions защищает от re-entrancy
- **Пользовательские ошибки** — экономят газ, передают структурированные данные
- **try/catch** — единственный способ перехватить ошибку внешнего контракта
- **Интерфейс** — правильный способ вызвать другой контракт с типобезопасностью

---

## Рекомендуемые источники

1. [Solidity Documentation](https://docs.soliditylang.org) — официальная документация
2. [Remix IDE](https://remix.ethereum.org) — браузерная IDE для быстрого прототипирования
3. [OpenZeppelin Contracts](https://github.com/OpenZeppelin/openzeppelin-contracts) — боевые реализации паттернов
4. [CryptoZombies](https://cryptozombies.io) — интерактивный курс Solidity
5. [Solidity by Example](https://solidity-by-example.org) — сборник примеров
