---
name: bughunter
description: Справочник решенных интеграционных, криптографических и смарт-контрактных ошибок в стеке BNB Greenfield, Lit Protocol и Base/BNB Chain. Содержит Root Cause Analysis (RCA) и пути их решения.
---

# Bug Hunter — Greenfield & Lit Integration RCA Register

Этот справочник содержит перечень решенных критических ошибок (багов), встреченных при интеграционном тестировании смарт-контрактов, Lit Protocol (Chipotle) и локальной/публичной сети BNB Greenfield. Каждая ошибка снабжена детальным Root Cause Analysis (RCA) и проверенным решением.

---

## 1. Реестр Ошибок (Encountered Bugs Registry)

| ID | Компонент | Симптом / Текст Ошибки | Root Cause Analysis (RCA) | Путь Решения (Solution Path) |
| :--- | :--- | :--- | :--- | :--- |
| **BUG-001** | `CourseMarketplace` Contract | Revert при вызове `hasCourseAccess` | Lit-ноды вызывают проверку прав доступа перед тем, как адрес `accessPass` NFT-контракта был привязан к маркетплейсу. Исходный код вызывал `revert()`, блокируя инициализацию Lit ACC. | Модифицировать [CourseMarketplace.sol](file:///home/g/projects/antigravity/smartcontracts/contracts/src/CourseMarketplace.sol#L40-L46): возвращать `false` (без вызова `revert`) если `address(accessPass) == address(0)`. |
| **BUG-002** | Greenfield JS SDK | `signature verification failed; please verify account...` | Адреса `creator` и `payer` передавались клиентом в checksummed-регистре (например, `0x7099...C518...`). Нода Go вычисляет EIP-712 хэш, используя lowercase адреса. Разница в регистре символов дает разные хэши и сбой ecrecover. | Внедрить в [index.js](file:///home/g/projects/antigravity/smartcontracts/greenfield-testnet/node_modules/@bnb-chain/greenfield-js-sdk/dist/cjs/index.js) рекурсивный хелпер `lowercaseAddresses` для принудительного приведения всех hex-адресов (длиной 42 символа) в message к нижнему регистру. |
| **BUG-003** | Greenfield JS SDK | `signature verification failed` (неверный тип chain_id) | JS SDK типизирует поле `chain_id` в структуре `Tx` как `uint256`, но передает строковое значение `"greenfield_9000-1"`. Библиотека `eth-sig-util` при подписи сериализует нечисловую строку в `0` или `NaN`, вызывая несоответствие хэша на ноде. | 1. Изменить тип `chain_id` в `generateTypes.Tx` с `'uint256'` на `'string'`. <br>2. Передавать полную строковую константу `chainId` (`"greenfield_9000-1"`) в message body. |
| **BUG-004** | Greenfield JS SDK | `signature verification failed` (несоответствие Msg1 type) | JS SDK помещает в служебное поле `type` сообщения `Msg1` Protobuf Type URL `"/greenfield.storage.MsgCreateBucket"`. Однако Greenfield Go-нода использует Amino-регистрацию и ожидает имя `"storage/CreateBucket"`. | Внедрить хелпер `normalizeTypes` в [index.js](file:///home/g/projects/antigravity/smartcontracts/greenfield-testnet/node_modules/@bnb-chain/greenfield-js-sdk/dist/cjs/index.js), который заменяет значение `type` с Protobuf Type URL на Amino-имя `"storage/CreateBucket"` перед отправкой в подпись. |
| **BUG-005** | Greenfield JS SDK | `signature verification failed` (несоответствие числовых типов в EIP-712) | Числовые значения (размеры бакетов, лимиты, типы) объявлены в EIP-712 схеме как `uint256`/`uint64`, но JS SDK сериализовал их как строки (например, `"2400"`, `"0"`). Подписчик подписывал строки, а Go-нода парсила их как числа, вызывая несовпадение хэшей. | Внедрить в [index.js](file:///home/g/projects/antigravity/smartcontracts/greenfield-testnet/node_modules/@bnb-chain/greenfield-js-sdk/dist/cjs/index.js) рекурсивный хелпер `normalizeMsgValues` для принудительного приведения строковых представлений чисел к типу `Number` перед хэшированием/подписанием. |
| **BUG-006** | Greenfield JS SDK ↔ local node EIP-712 | `feePayer's pubkey ... is different from signature's pubkey` (на локальной `greenfield_9000-1`) | **Это корневая причина, проверенная по исходникам ноды.** Локальная нода v1.10.7 НЕ активирует апгрейд `Altai`, поэтому `getSignBytes` использует OLD-схему с `domain.verifyingContract = "greenfield"` (строковый литерал), а НЕ `0x71e835...`. SDK подписывал domain с `0x71e835...` → другой DomainSeparator → ecrecover даёт чужой pubkey. См. Deep Dive ниже. | В `createEIP712` для локальной сети (`chainId == 9000`) задать `domain.verifyingContract = 'greenfield'`. Для testnet/mainnet (Altai активен) — `0x71e835aff094655dEF897fbc85534186DbeaB75d`. Реализовано в [patch_sdk.cjs](file:///home/g/projects/antigravity/patch_sdk.cjs). |
| **BUG-007** | `gnfd-sp` daemon (старт) | `error while loading shared libraries: libstdc++.so.6: cannot open shared object file` | Бинарь `gnfd-sp` использует cgo для BLS-подписей (`prysmaticlabs/bls`), которому нужен C++ runtime. Базовый образ `alpine` его не содержит. SP падает сразу при старте, GVG не может запечатать объекты. | Установить в [Dockerfile](file:///home/g/projects/antigravity/smartcontracts/greenfield-local/Dockerfile) рантайм: `apk add --no-cache libstdc++ libgcc`. |
| **BUG-008** | Greenfield seal / GVG | Объект загружается, но навсегда остаётся `OBJECT_STATUS_CREATED` и никогда не переходит в `SEALED`; чтение даёт `not sealed` / 404 | Greenfield запечатывает объекты с erasure coding по Global Virtual Group: **1 primary + 6 secondary SP (4 data + 2 parity)**. С одним запущенным SP кворума для EC-репликации нет — secondary'ы не отвечают, seal-tx не формируется. | Поднимать **все 7** `gnfd-sp` демонов на одном хосте, у каждого свои порты/БД/ключи, общий GVG family (`GVGPreferSPList = [1..7]`). Реализовано в [setup_sp.sh](file:///home/g/projects/antigravity/smartcontracts/greenfield-local/setup_sp.sh). |
| **BUG-009** | MariaDB (SP metadata/blocksyncer store) | `Can't connect to MySQL server ... (111 Connection refused)`, затем `Access denied for user 'root'@'localhost'` по TCP | (1) Alpine MariaDB по умолчанию `skip-networking` — порт 3306 не слушается. (2) Подключение к `127.0.0.1` обратно резолвится в `localhost`, который привязан к socket-auth аккаунту, а не к паролю. | В [Dockerfile](file:///home/g/projects/antigravity/smartcontracts/greenfield-local/Dockerfile) задать `skip-networking=0`, `port=3306`, `bind-address=127.0.0.1`, `skip-name-resolve`; в [setup_sp.sh](file:///home/g/projects/antigravity/smartcontracts/greenfield-local/setup_sp.sh) создать `root@127.0.0.1` и `root@%` с паролем `sppass`. |
| **BUG-010** | entrypoint.sh (bash) | Контейнер `greenfield-local` так и не становится `healthy`; sentinel `/tmp/sp_ready` не создаётся, хотя все SP-шлюзы уже слушают | Цикл ожидания шлюзов `up=$(netstat ... | grep -oE ':903[3-9]' | ...)` под `set -euo pipefail` + `pipefail`: пока ни один шлюз не поднялся, `grep` возвращает код 1, что роняет всю подоболочку до строки `touch /tmp/sp_ready`. | Добавить `|| true` в конец пайплайна и `${up:-0}` для дефолта. Реализовано в [entrypoint.sh](file:///home/g/projects/antigravity/smartcontracts/greenfield-local/entrypoint.sh). |
| **BUG-011** | SDK upload ↔ on-chain SP endpoint | Загрузка объекта из e2e-контейнера падает с `connection refused` / таймаутом, хотя SP жив | On-chain у SP зарегистрирован endpoint `http://127.0.0.1:903x` (все SP делят хост-контейнер). Из контейнера `e2e-lit` этот `127.0.0.1` указывает на сам e2e, а не на SP. SDK берёт endpoint из цепочки → шлёт в пустоту. | (1) Передавать `spEndpoint` (= `GF_SP=http://greenfield-local:9033`) напрямую в `delegateUploadObject`, минуя on-chain lookup — [sdk-backend.mjs](file:///home/g/projects/antigravity/smartcontracts/greenfield-testnet/sdk-backend.mjs). (2) В [greenfield-sp.js](file:///home/g/projects/antigravity/smartcontracts/buckets/greenfield-sp.js) `pickPrimarySp` при несовпадении host'а сопоставляет SP по **порту** (`:9033`). |
| **BUG-012** | e2e readObject (timing) | `Resource not found` / `ACCESS_DENIED` при чтении только что опубликованного манифеста/`.enc` | Delegated upload асинхронен: SP создаёт объект on-chain, реплицирует EC и запечатывает — на одно-хостовом стеке это ~100–110 с. Чтение сразу после `putObject` приходит до seal'а. | Обернуть чтение в `readObjectWithRetry` (tries=150, delay=2 с, ретрай на `not found|not sealed|no such|ACCESS_DENIED|404`). Реализовано в [run-e2e-lit-nft.mjs](file:///home/g/projects/antigravity/smartcontracts/e2e/run-e2e-lit-nft.mjs). |
| **BUG-013** | Greenfield JS SDK (SP URL addressing) | Запросы к локальному SP уходят на vhost `<bucket>.gnfd.test-sp.com` (не резолвится) либо подпись GNFD1-ECDSA не сходится | SDK по умолчанию строит **vhost-style** URL (`<bucket>.<domain>`) и подписывает канонический запрос по `hostname` без порта. Локальный `gnfd-sp` доступен только по **path-style** (`<endpoint>/<bucket>`), а подпись должна включать host **с портом**. | В [patch_sdk.cjs](file:///home/g/projects/antigravity/patch_sdk.cjs): `verifyUrl` (принимать любой парсящийся http(s)-URL c hostname), `generateUrlByBucketName` (path-style `<endpoint>/<bucket>`), `getPutObjectMetaInfo` (подписывать полный `url.pathname` и `hostname: url.host` — host с портом). |
| **BUG-014** | Chipotle TEE (Rocket) ↔ lit e2e | CI лит-тест падает на шаге `[5/10] Encrypting`: `Lit operation failed: chipotle http 429: <!doctype html> ... <title>429 too many requests</title> ... <small>rocket</small>`. **Флейк**: на одном и том же коде PR-ран `9cef91c` зелёный, `bb8f389` красный. Локально проходит. | **Это корневая причина, проверенная по исходникам chipotle `next`.** 429 отдаёт НЕ рейт-лимитер и НЕ прогрев, а **CpuOverloadMonitor / `CpuAvailable` request-guard** в [`lit-api-server/src/core/v1/guards/cpu_overload.rs`](https://github.com/LIT-Protocol/chipotle/blob/next/lit-api-server/src/core/v1/guards/cpu_overload.rs): фоновая задача каждую секунду читает `/proc/loadavg` и `/proc/pressure/cpu` и поднимает флаг load-shedding, когда `loadavg(1m) > num_cpus * CPU_OVERLOAD_MULTIPLIER` (default **2.0**) **или** `CPU PSI(1s some) > CPU_PSI_THRESHOLD` (default **50%**). На 2-ядерном CI-раннере CPU-тяжёлый `create_wallet` (генерация PKP) + параллельные cargo/docker задирают PSI выше 50%, и следующий запрос (`encrypt`) сбрасывается 429-м, причём перегрузка держится дольше нашего ретрай-окна (~23 с). | **Отключить load-shedding на этой одно-арендной *тестовой* ноде** через env (оба порога перекрываются, нода их читает на старте `CpuOverloadMonitor::start()`): `CPU_PSI_THRESHOLD=1000.0` (PSI — это 0–100%, превысить нельзя) + `CPU_OVERLOAD_MULTIPLIER=1000.0` (порог loadavg = num_cpus·1000 ≈ ∞). Прописано в `chipotle-real` обоих локальных композов: [docker-compose.lit.yml](file:///home/g/projects/antigravity/smartcontracts/docker-compose.lit.yml), [docker-compose.yml](file:///home/g/projects/antigravity/smartcontracts/docker-compose.yml). Как defense-in-depth остаётся `fetchWithRetry` (экспон. backoff + jitter, учёт `Retry-After`, ретрай на 429/5xx) в [lit-sdk-chipotle.js](file:///home/g/projects/antigravity/smartcontracts/buckets/lit-sdk-chipotle.js) + обёртка `create_wallet` в e2e-раннерах. |
| **BUG-015** | vitest ↔ Foundry `lib/` | `npm run test:unit` валит ~145 файлов: `Error: Cannot find module 'hardhat'` из `smartcontracts/contracts/lib/openzeppelin-contracts/test/**`. Тесты (346) проходят, но `vitest run` выходит с ненулевым кодом → красный CI. | После `forge install OpenZeppelin/openzeppelin-contracts` в `lib/` появился **собственный Hardhat-тестовый набор OZ** (`*.test.js`). vitest по умолчанию исключает только `node_modules`, не `lib/`, поэтому пытается их собрать и падает на отсутствующем `hardhat`. | В [vitest.config.js](file:///home/g/projects/antigravity/vitest.config.js) задать `test.exclude = [...configDefaults.exclude, '**/lib/**']`. |
| **BUG-016** | Synpress 0.0.14 ↔ MetaMask 13.24.0 (UI) | UI-сетап зависает/падает на «добавлении сети». `metamask.addNetwork()` кликает `[data-testid="network-display"]` и ничего не происходит; а ручной путь — кнопка **«Add custom network»** в меню сетей — роняет MetaMask в React-error-boundary («MetaMask encountered an error», пустой текст ошибки). | Тройное рассогласование версий: (1) кнопка-открыватель меню сетей переименована `network-display` → **`sort-by-networks`** (на home `network-display` отсутствует); (2) модалка «Add custom network», запускаемая из меню, в этой сборке **крэшится при маунте** (та же форма по прямому роуту рендерится нормально); (3) поля формы переехали: реальные `<input>` несут testid `network-form-network-name` / `network-form-chain-id` / `network-form-ticker-input`, а `…-input`-testid'ы — это div-обёртки. RPC теперь в под-модалке (`test-add-rpc-drop-down` → «Add RPC URL» → `rpc-url-input-test`). | Не пользоваться Synpress `addNetwork`. Навигировать **прямо на роут** `#/settings/networks/add-network`, заполнить по новым testid'ам, RPC — через под-модалку, idempotency — по `network-list-item-eip155:<chainId>` в поповере. Реализовано как `addNetwork()` в [metamask-control.js](file:///home/g/projects/antigravity/.claude/skills/metamask-devtools/scripts/metamask-control.js); подключено в [build-cache.mjs](file:///home/g/projects/antigravity/smartcontracts/e2e-synpress/build-cache.mjs) и [daskibo.setup.ts](file:///home/g/projects/antigravity/smartcontracts/e2e-synpress/wallet-setup/daskibo.setup.ts). |
| **BUG-017** | LavaMoat (scuttling) ↔ MetaMask 13.24.0 UI-автоматизация | При вводе в поля формы из CDP: `LavaMoat - property "HTMLInputElement" of globalThis is inaccessible under scuttling mode` (и аналогично `KeyboardEvent`). Playwright `page.evaluate` тоже не исполняется. **Опровергает прежнее допущение, что в этой сборке LavaMoat выключен — он АКТИВЕН.** | LavaMoat в режиме *scuttling* «вырезает» доступ к глобальным конструкторам DOM (`HTMLInputElement`, `KeyboardEvent`, …) у `globalThis` и изолирует мир Playwright. Нативный сеттер `value`, взятый как `HTMLInputElement.prototype`, недоступен; синтетический `new KeyboardEvent` бросает. | (1) Брать сеттер через **`Object.getPrototypeOf(inp)`** с проходом по цепочке прототипов (сам прототип не вырезан). (2) Гнать всё через **сырой CDP `Runtime.evaluate`** (real world страницы, не блокируется), а не через `page.evaluate`. (3) Не синтезировать `KeyboardEvent` (Escape) — закрывать модалки кликом по `modal-header-close-button`. Реализовано в `setReactInput`/`addNetwork` в [metamask-control.js](file:///home/g/projects/antigravity/.claude/skills/metamask-devtools/scripts/metamask-control.js). |

> [!CAUTION]
> **Записи BUG-002, BUG-003, BUG-004 оказались НЕВЕРНЫ для ноды v1.10.7** и привели к регрессии (см. ground truth ниже). Решения этих багов противоречат тому, что реально реконструирует Go-нода в `greenfield-cosmos-sdk/x/auth/tx/eip712.go`:
> - **BUG-002 (lowercase адреса) — НЕВЕРНО.** Нода кодирует адреса в **checksum**-регистре (`0x70997970C518...`). Приводить к нижнему регистру НЕЛЬЗЯ.
> - **BUG-003 (chain_id как string `"greenfield_9000-1"`) — НЕВЕРНО.** Нода кладёт `SignDocEip712.ChainId = typedChainID.Uint64()` → `chain_id` это numeric `"9000"`, тип `uint256`.
> - **BUG-004 (type → Amino-имя `storage/CreateBucket`) — НЕВЕРНО.** Нода оставляет proto Type URL `"/greenfield.storage.MsgCreateBucket"`.
> - Поле `primary_sp_approval.sig` нода **опускает** при пустом значении (omitempty для пустых byte-slice) — добавлять `sig` в типы НЕЛЬЗЯ.
> Единственная реальная причина mismatch на локальной сети — `verifyingContract` (BUG-006).

### Ground Truth: как получить точный typed-data ноды

Не угадывать перебором, а спросить ноду напрямую. Исходники greenfield v1.10.7 склонированы в контейнере `greenfield-local-lit` в `/opt/greenfield`, модульный кэш — в `/root/go/pkg/mod` (включая `greenfield-cosmos-sdk`). Программа на Go вызывает `tx.GetMsgTypes` + `tx.WrapTxToTypedData` + `tx.ComputeTypedDataHash` (ровно то, что делает ante-обработчик), и печатает каноничный typed-data + хэш. Логика верификации: `greenfield-cosmos-sdk/x/auth/signing/verify.go` → `verifyEip712SignatureWithFallback` (пробует OLD-схему `verifyingContract="greenfield"`, затем NEW `0x71e835...`); байт `v` (27/28) нода нормализует сама.

---

## 2. Глубокий Анализ Криптографических Ошибок (Deep Dive RCA)

### Ошибка BUG-002: Регистр Символов в Адресах (EVM Address Checksum Mismatch)
*   **Симптом**: `err: feePayer's pubkey EthPubKeySecp256k1{...} is different from signature's pubkey EthPubKeySecp256k1{...}`
*   **Механизм сбоя**: 
    1. Wallet или Viem возвращает checksum-адрес типа `0x70997970C51812dc3A010C7d01b50e0d17dc79C8`.
    2. Хэширование EIP-712 выполняется над строкой. Подпись генерируется для строки с большими буквами.
    3. Greenfield нода на Go парсит адрес из Cosmos-формата обратно в hex в нижнем регистре: `0x70997970c51812dc3a010c7d01b50e0d17dc79c8`.
    4. ecrecover на ноде дает совершенно иной публичный ключ.
*   **Решение**:
    ```javascript
    const lowercaseAddresses = (obj) => {
        if (!obj || typeof obj !== 'object') return obj;
        if (Array.isArray(obj)) return obj.map(lowercaseAddresses);
        const newObj = {};
        for (const key of Object.keys(obj)) {
            const val = obj[key];
            if (typeof val === 'string' && val.startsWith('0x') && val.length === 42) {
                newObj[key] = val.toLowerCase();
            } else if (typeof val === 'object') {
                newObj[key] = lowercaseAddresses(val);
            } else {
                newObj[key] = val;
            }
        }
        return newObj;
    };
    ```

### Ошибка BUG-004: Несоответствие Type URL и Amino Name
*   **Симптом**: Восстановленный публичный ключ на ноде отличается от оригинального, несмотря на верный chainId и адреса.
*   **Механизм сбоя**:
    1. В Protobuf-окружениях JS SDK использует `/greenfield.storage.MsgCreateBucket`.
    2. В Greenfield Go-ноде (модуль `x/storage`) сообщение зарегистрировано в Amino-кодеке:
       `cdc.RegisterConcrete(&MsgCreateBucket{}, "storage/CreateBucket", nil)`
    3. Нода ожидает в EIP-712 JSON поле `"type": "storage/CreateBucket"`.
*   **Решение**:
    ```javascript
    const normalizeTypes = (obj) => {
        if (!obj || typeof obj !== 'object') return obj;
        if (Array.isArray(obj)) return obj.map(normalizeTypes);
        const newObj = {};
        for (const key of Object.keys(obj)) {
            const val = obj[key];
            if (key === 'type' && val === '/greenfield.storage.MsgCreateBucket') {
                newObj[key] = 'storage/CreateBucket';
            } else if (typeof val === 'object') {
                newObj[key] = normalizeTypes(val);
            } else {
                newObj[key] = val;
            }
        }
        return newObj;
    };
    ```

### Ошибка BUG-005: Числовые Типы данных в EIP-712 (JSON string to uint256 conversion)
*   **Симптом**: `signature verification failed` при создании бакетов или отправке транзакций через JS SDK.
*   **Механизм сбоя**:
    1. По спецификации EIP-712 поля, такие как `size` или `charged_read_quota`, типизированы как `uint64`/`uint256`.
    2. В JS SDK эти значения хранились как строки (например, `"2400"`, `"0"`).
    3. Клиентская библиотека (`eth-sig-util` / `viem`) сериализует их как строки, генерируя хэш подписи для строкового типа.
    4. Greenfield Go-нода во время десериализации EIP-712 JSON парсит эти значения в соответствующие числовые типы Cosmos SDK/Go, из-за чего хэш на стороне блокчейна отличается от подписанного.
*   **Решение**:
    Рекурсивно обойти поля сообщения и привести строковые числа к числовому типу JavaScript (за исключением очень больших чисел, выходящих за рамки MAX_SAFE_INTEGER, которые впрочем для полей типа квот или размеров бакетов в пределах разумного безопасны):
    ```javascript
    const normalizeMsgValues = (obj) => {
        if (!obj || typeof obj !== 'object') return obj;
        if (Array.isArray(obj)) return obj.map(normalizeMsgValues);
        const newObj = {};
        for (const key of Object.keys(obj)) {
            const val = obj[key];
            if (typeof val === 'string' && /^\d+$/.test(val) && val.length < 16) {
                newObj[key] = Number(val);
            } else if (typeof val === 'object') {
                newObj[key] = normalizeMsgValues(val);
            } else {
                newObj[key] = val;
            }
        }
        return newObj;
    };
    ```

---

## 2b. Deep Dive: Путь хранения объектов (Upload → Seal → Download)

Подписать `MsgCreateBucket` (BUG-006) — лишь половина дела: чтобы объект реально
**загрузился, запечатался и читался**, нужен полноценный стек storage-provider'ов.
Эти баги (BUG-007…BUG-013) образуют одну цепочку и проявляются именно при попытке
прочитать только что опубликованный курс.

### Почему нужны все 7 SP (BUG-008)

Greenfield не хранит объект целиком на одном SP. При seal'е primary SP режет данные
на **6 EC-чанков (4 data + 2 parity)** и раскладывает их по Global Virtual Group:
сам primary + 6 secondary. Если secondary'ев нет, primary не может собрать GVG и
seal-tx не формируется — объект вечно висит в `OBJECT_STATUS_CREATED`. Поэтому
[setup_sp.sh](file:///home/g/projects/antigravity/smartcontracts/greenfield-local/setup_sp.sh)
поднимает 7 демонов в одном контейнере: порты `gRPC = 10000 + 1000*i`,
`gateway = 9033 + i`, у каждого своя БД `sp_${i}`, общий GVG family
(`GVGPreferSPList = [1,2,3,4,5,6,7]`), sp0 — P2P-bootstrap-пир.

### Endpoint mismatch: 127.0.0.1 vs docker-hostname (BUG-011)

Все 7 SP делят контейнер `greenfield-local`, поэтому on-chain они регистрируют
endpoint `http://127.0.0.1:903x` (так они находят друг друга). Но из контейнера
`e2e-lit` адрес `127.0.0.1` — это сам e2e. Решение двустороннее:
- **запись**: `delegateUploadObject` получает `endpoint: spEndpoint` напрямую
  (`GF_SP=http://greenfield-local:9033`), минуя on-chain lookup;
- **выбор primary**: `pickPrimarySp` сопоставляет SP по **порту** (`:9033`),
  когда host не совпадает.

### Sealing — асинхронный (BUG-012)

`delegateUploadObject` возвращается, как только SP принял байты; реальная
EC-репликация + seal на одно-хостовом стеке занимают **~100–110 с**. Любое чтение
сразу после загрузки придёт до seal'а → `not sealed`/404. Отсюда обязательный
`readObjectWithRetry` и широкое окно ожидания. На testnet с географически
распределёнными SP латентность другая, но принцип «читать с ретраем» тот же.

### Path-style vs vhost (BUG-013)

Публичный SP в проде адресуется vhost-style (`<bucket>.<sp-domain>`). Локальный
`gnfd-sp` за одним IP так не резолвится — нужен path-style (`<endpoint>/<bucket>`),
а каноническая подпись GNFD1-ECDSA должна включать **host с портом**. Универсальный
publicly-readable endpoint SP — `GET /download/{bucket}/{object}` (без auth для
SEALED public-read объектов) — удобен для health-проверок загрузки.

> [!TIP]
> Диагностика «объект не читается»: (1) `gnfd q storage head-object <bucket> <obj>` —
> смотреть `object_status`; если `CREATED`, проблема в seal (BUG-008/007); (2) проверить,
> что все 7 шлюзов слушают (`netstat -tln | grep 903`); (3) `docker logs` SP на предмет
> `libstdc++`/MariaDB; (4) только потом подозревать подпись/URL (BUG-013).

---

## 3. Рекомендации по Интеграции в Greenfield и Lit Skills
Для предотвращения повторного возникновения этих ошибок при модификации Greenfield или Lit-модулей, всегда:
1.  **Проверяйте EIP-712 Payload**: Убедитесь, что логируемый в консоли `EIP712_PAYLOAD` соответствует типам `Tx` в Go, и помните ground truth по BUG-002…006 (checksum-адреса, numeric `chain_id=9000`, proto Type URL, `verifyingContract="greenfield"` локально).
2.  **Поднимайте полный SP-стек для путей upload/download**: одиночный SP не запечатает объект — нужны все 7 (BUG-008). Не путайте «подпись прошла» с «объект доступен».
3.  **Читайте с ретраем**: seal асинхронен (~100 с локально) — оборачивайте `readObject` в retry (BUG-012).
4.  **Сопоставляйте Amino Codec**: Если добавляете новые сообщения (Msg), проверяйте файл `x/[module]/types/codec.go` в Go-ноде для получения точного Amino-имени.
5.  **Валидируйте на чистом состоянии**: проверка стека — только из свежего genesis (`run_e2e_lit.sh` c `down -v`), а не синхронизацией устаревшей ноды (см. [Greenfield Skill](../greenfield/SKILL.md)).
