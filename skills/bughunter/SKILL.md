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

## 3. Рекомендации по Интеграции в Greenfield и Lit Skills
Для предотвращения повторного возникновения этих ошибок при модификации Greenfield или Lit-модулей, всегда:
1.  **Проверяйте EIP-712 Payload**: Убедитесь, что логируемый в консоли `EIP712_PAYLOAD` соответствует типам `Tx` в Go.
2.  **Запускайте Greenfield-запросы в нижнем регистре**: Адреса должны проходить нормализацию `.toLowerCase()` перед входом в SDK.
3.  **Сопоставляйте Amino Codec**: Если добавляете новые сообщения (Msg), проверяйте файл `x/[module]/types/codec.go` в Go-ноде для получения точного Amino-имени.
