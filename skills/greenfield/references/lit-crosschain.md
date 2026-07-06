# Lit Protocol Cross-Chain Access

## Содержание

- Цель
- Модель cross-chain gating
- Multi-chain ACC
- EVM custom contract condition
- Unified access control conditions
- PKP и Lit Actions
- Daskibo/Greenfield рекомендуемая архитектура
- Manifest поля
- Риски и проверки

## Цель

Использовать Lit Protocol как cross-chain access layer: контент лежит в Greenfield, а право получить ключ проверяется по состоянию одной или нескольких сетей.

Примеры:

- Bucket/object в BNB Greenfield.
- Marketplace/access contract на BSC или локальном Anvil.
- NFT/role/token на Ethereum, Base, Polygon или другой поддерживаемой EVM chain.
- Lit ACC объединяет условия через `and`/`or`.

## Модель Cross-Chain Gating

Lit nodes могут проверять состояние разных chains при decrypt/sign request. Это позволяет не переносить контент и не делать bridge только ради access check.

Типовая модель:

```text
Greenfield ciphertext
        |
        v
Lit decrypt request
        |
        +-- verify wallet/session signature
        +-- check condition on BSC: hasCourseAccess(user, courseId)
        +-- optional check on Base/Ethereum: NFT balance or DAO role
        +-- optional Lit Action policy
        |
        v
release master key only if policy passes
```

## Multi-Chain ACC

Lit `accessControlConditions` могут объединять условия через boolean operators:

```json
[
  {
    "contractAddress": "0xCOURSE_MARKETPLACE_ON_BSC",
    "standardContractType": "customContract",
    "chain": "bsc",
    "method": "hasCourseAccess",
    "parameters": [":userAddress", "1"],
    "returnValueTest": {
      "comparator": "==",
      "value": "true"
    }
  },
  { "operator": "or" },
  {
    "contractAddress": "0xNFT_ON_BASE",
    "standardContractType": "ERC721",
    "chain": "base",
    "method": "balanceOf",
    "parameters": [":userAddress"],
    "returnValueTest": {
      "comparator": ">",
      "value": "0"
    }
  }
]
```

Смысл: пользователь получает доступ, если купил курс на BSC или держит NFT на Base.

Для strict policy используй `and`:

```json
[
  { "...": "paid course condition on bsc" },
  { "operator": "and" },
  { "...": "kyc/role/NFT condition on another chain" }
]
```

## EVM Custom Contract Condition

Для arbitrary contract calls предпочтительнее `evmContractConditions`.

Структура:

```ts
type EvmContractCondition = {
  contractAddress: `0x${string}`;
  functionName: string;
  functionParams: string[];
  functionAbi: {
    type: "function";
    stateMutability: "view" | "pure";
    name: string;
    inputs: Array<{ name: string; type: string; internalType?: string }>;
    outputs: Array<{ name: string; type: string; internalType?: string }>;
  };
  chain: string;
  returnValueTest: {
    key: string;
    comparator: "=" | "==" | "!=" | ">" | ">=" | "<" | "<=";
    value: string;
  };
};
```

Для Daskibo:

```json
{
  "contractAddress": "0xCOURSE_MARKETPLACE",
  "functionName": "hasCourseAccess",
  "functionParams": [":userAddress", ":litParam:courseId"],
  "functionAbi": {
    "type": "function",
    "stateMutability": "view",
    "name": "hasCourseAccess",
    "inputs": [
      { "name": "user", "type": "address" },
      { "name": "courseId", "type": "uint256" }
    ],
    "outputs": [
      { "name": "", "type": "bool" }
    ]
  },
  "chain": "bsc",
  "returnValueTest": {
    "key": "",
    "comparator": "=",
    "value": "true"
  }
}
```

`chain` должен быть Lit chain identifier той сети, где реально развернут contract.

## Unified Access Control Conditions

Для смешанных условий используй unified access control conditions, особенно если policy включает разные condition types:

- `evmBasic`
- `evmContract`
- `solRpc`
- `cosmos`
- `litAction`

Условная структура:

```ts
type UnifiedCondition =
  | { conditionType: "evmBasic"; contractAddress: string; standardContractType: string; chain: string; method: string; parameters: string[]; returnValueTest: { comparator: string; value: string } }
  | { conditionType: "evmContract"; contractAddress: string; functionName: string; functionParams: string[]; functionAbi: object; chain: string; returnValueTest: { key: string; comparator: string; value: string } }
  | { operator: "and" | "or" };
```

Для Greenfield content access prefer:

- simple EVM-only policy: `evmContractConditions`
- mixed EVM + Lit Action or multiple condition types: unified ACC

## PKP И Lit Actions

PKP/Lit Actions нужны, когда decrypt policy должна быть programmable:

- нормализовать multi-chain state;
- проверить off-chain allowlist/proof;
- вызвать contract(s) из action;
- выполнить cross-chain intent/signing после проверки доступа;
- подписать результат PKP keypair.

Для static course content чаще достаточно ACC без PKP signing. Для advanced flow:

```text
Reader -> Lit Action
  -> verifies auth sig
  -> checks hasCourseAccess on access chain
  -> optionally checks NFT/role on another chain
  -> decrypts master key or signs a scoped capability
```

Lit Action должен быть привязан к ожидаемому code hash/IPFS id, если он участвует в decrypt decision.

## Daskibo/Greenfield Рекомендуемая Архитектура

Базовый paid-course режим:

```text
CourseMarketplace + AccessPass on BSC/local Anvil
Greenfield bucket with ciphertext
Lit ACC calls CourseMarketplace.hasCourseAccess
```

Cross-chain extension:

```text
CourseMarketplace on BSC
NFT/community pass on Base/Ethereum
Greenfield stores encrypted course
Lit policy:
  hasCourseAccess(user, courseId) on BSC
  OR balanceOf(user) > 0 on Base/Ethereum
```

Не делай Greenfield bucket private как единственный access control. Private bucket может быть дополнительной защитой, но DRM должен держаться на encryption + Lit key release.

## Manifest Поля

Добавь в `_lit/manifest.json`:

```ts
type CrossChainLitPolicy = {
  policyVersion: "daskibo.lit.crosschain/1";
  accessChains: Array<{
    role: "course-marketplace" | "nft-pass" | "dao-role" | "payment";
    chain: string;
    chainId?: number | string;
    contractAddress: `0x${string}`;
  }>;
  conditionType: "accessControlConditions" | "evmContractConditions" | "unifiedAccessControlConditions";
  conditionsHash: string;
};
```

В `manifest.lit`:

```ts
type LitManifest = {
  litNetwork: "datil" | "datil-test" | "datil-dev" | "custom" | "chipotle";
  chain?: string;
  accessControlConditions?: unknown[];
  evmContractConditions?: unknown[];
  unifiedAccessControlConditions?: unknown[];
  crossChain?: CrossChainLitPolicy;
  ciphertext: string;
  dataToEncryptHash: string;
};
```

`conditionsHash` нужен для tamper detection: reader может проверить, что условия не были незаметно заменены.

## Детализированные Кроссчейн Сценарии (Base & BNB)

### Сценарий 1: Контракты на Base, Хранение в Greenfield (Scenario A)

В этом сценарии наши смарт-контракты (`CourseMarketplace` и `AccessPass`) развёрнуты в сети Base. Зашифрованный контент хранится в BNB Greenfield. Lit Protocol оценивает права доступа, опрашивая ноды Base.

**Схема работы:**
1. **Регистрация курса:** Автор регистрирует курс в `CourseMarketplace` на Base.
2. **Публикация контента:** В `_lit/manifest.json` в поле `chain` указывается `"base"` (или `"baseTestnet"` для тестнета).
3. **Условие доступа (ACC):**
   ```json
   [
     {
       "contractAddress": "0xBASE_COURSE_MARKETPLACE",
       "standardContractType": "customContract",
       "chain": "base",
       "method": "hasCourseAccess",
       "parameters": [":userAddress", "1"],
       "returnValueTest": { "comparator": "==", "value": "true" }
     }
   ]
   ```
4. **Покупка:** Покупатель оплачивает курс в сети Base, получая soulbound NFT `AccessPass` на Base.
5. **Дешифрование:** Читатель загружает шифртекст из Greenfield, отправляет запрос в Lit. Lit-ноды проверяют метод `hasCourseAccess` на Base и возвращают ключ дешифрования.

### Сценарий 2: Контракты на BNB, Lit-ноды на Base (Scenario B)

В этом сценарии наши смарт-контракты развёрнуты на BNB Chain (BSC), а Lit Protocol настроен для работы или осуществляет проверки через ноды Base, но опрашивает BSC контракт. Это классический вариант кроссчейн DRM-гейтинга.

**Схема работы:**
1. **Регистрация курса:** Автор регистрирует курс в `CourseMarketplace` на BNB Chain.
2. **Публикация контента:** В `_lit/manifest.json` в поле `chain` указывается `"bsc"` (или `"bscTestnet"` для тестнета).
3. **Условие доступа (ACC):**
   Ключевое отличие здесь в том, что `chain` в ACC указывает на `"bsc"`, даже если Lit-клиент или пользователь оперируют из сети Base:
   ```json
   [
     {
       "contractAddress": "0xBNB_COURSE_MARKETPLACE",
       "standardContractType": "customContract",
       "chain": "bsc",
       "method": "hasCourseAccess",
       "parameters": [":userAddress", "1"],
       "returnValueTest": { "comparator": "==", "value": "true" }
     }
   ]
   ```
4. **Покупка:** Покупатель производит покупку на BNB Chain.
5. **Дешифрование:** При попытке дешифрования Lit-ноды обращаются к BNB Chain для проверки `hasCourseAccess(user, courseId)`. При успешном ответе ключ выпускается.

## Риски И Проверки

- Chain mismatch: `chain` в ACC должен совпадать с сетью contract.
- Contract mismatch: `contractAddress` должен быть marketplace/pass contract, а не NFT placeholder.
- Time mismatch: expiry в `AccessPass` зависит от block timestamp access chain.
- Replay: auth/session signature должна быть scoped и иметь nonce/expiration.
- Bridged NFT risk: если NFT на другой chain считается доступом, убедись, что bridge/wrapped asset нельзя flash-loan или временно transfer.
- Boolean risk: `or` расширяет доступ, `and` сужает. Проверять политику тестами.
- Lit network mismatch: encrypted key должен расшифровываться той же Lit network/policy family.

Минимальные проверки:

1. Author decrypt проходит без purchase.
2. Buyer decrypt до purchase получает `ACCESS_DENIED`.
3. Buyer after purchase decrypt проходит.
4. Buyer after expiry получает `ACCESS_DENIED`.
5. NFT transfer/approval revert.
6. Cross-chain fallback condition отдельно проверяется положительным и отрицательным тестом.

## Official References

- Lit Protocol custom EVM contract calls: https://developer.litprotocol.com/sdk/access-control/evm/custom-contract-calls
- Lit Protocol boolean logic: https://developer.litprotocol.com/sdk/access-control/condition-types/boolean-logic
- Lit supported EVM chains: https://litprotocol.mintlify.app/sdk/resources/supported-evm-chains
- Lit Actions API: https://actions-docs.litprotocol.com/
