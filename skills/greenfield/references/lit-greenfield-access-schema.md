# Lit + Greenfield Access Schema

## Содержание

- Цель схемы
- Границы ответственности Lit и Greenfield
- Greenfield bucket fields
- Greenfield object fields
- Lit ACC fields
- Custom contract condition для `hasCourseAccess`
- Manifest schema для Daskibo
- Object layout в bucket
- Процесс publish
- Процесс read/decrypt
- Security notes

## Цель Схемы

Нужно хранить course content в BNB Greenfield и ограничивать доступ к plaintext через Lit Protocol.

Базовое правило:

- Greenfield хранит encrypted objects и public/readable metadata.
- Lit хранит/выдает ключ расшифровки только при прохождении Access Control Conditions.
- Smart contract решает, есть ли у пользователя право доступа.

Не полагайся на public/private visibility Greenfield как единственный DRM слой. Для курсового контента основной контроль доступа должен быть cryptographic access control через Lit.

## Границы Ответственности

### Greenfield

Greenfield отвечает за:

- bucket namespace
- object storage
- object metadata
- SP selection
- payment/quota на storage/read
- public/private visibility на уровне storage

Greenfield object может быть public-read, если внутри лежит ciphertext. Это удобно для CDN-like read path: любой может скачать ciphertext, но только authorized user может получить key через Lit.

### Lit Protocol

Lit отвечает за:

- encryption/decryption key release
- ACC evaluation
- wallet/session proof
- contract call checks
- optional Lit Action execution в TEE

Lit ACC должна быть связана с on-chain правом доступа: например, `CourseMarketplace.hasCourseAccess(:userAddress, courseId) == true`.

## Greenfield Bucket Fields

При создании bucket через JS SDK ключевые поля:

```ts
type GreenfieldCreateBucket = {
  bucketName: string;
  creator: `0x${string}`;
  visibility: "VISIBILITY_TYPE_PUBLIC_READ" | "VISIBILITY_TYPE_PRIVATE";
  chargedReadQuota: string | Long;
  primarySpAddress: `0x${string}`;
  paymentAddress: `0x${string}`;
};
```

Поля:

- `bucketName`: globally unique DNS-like имя bucket.
- `creator`: адрес владельца/создателя.
- `visibility`: read visibility bucket.
- `chargedReadQuota`: read quota, измеряется в bytes.
- `primarySpAddress`: operator address выбранного Storage Provider.
- `paymentAddress`: адрес оплаты storage/read.

Для Daskibo encrypted course обычно допустимо:

```ts
visibility = "VISIBILITY_TYPE_PUBLIC_READ"
```

потому что plaintext не хранится в Greenfield.

## Greenfield Object Fields

При создании object через JS SDK ключевые поля:

```ts
type GreenfieldCreateObject = {
  bucketName: string;
  objectName: string;
  creator: `0x${string}`;
  visibility: "VISIBILITY_TYPE_PUBLIC_READ" | "VISIBILITY_TYPE_PRIVATE";
  contentType: string;
  redundancyType: "REDUNDANCY_EC_TYPE" | string;
  payloadSize: Long;
  expectChecksums: Uint8Array[];
};
```

Поля:

- `bucketName`: bucket, где лежит object.
- `objectName`: key/path внутри bucket, например `lessons/01/body.md.enc`.
- `creator`: address автора upload.
- `visibility`: object-level visibility.
- `contentType`: MIME type.
- `redundancyType`: тип redundancy/erasure coding.
- `payloadSize`: размер payload.
- `expectChecksums`: checksums частей payload.

Metadata object на Greenfield включает:

- name / object id
- owner
- bucket
- size and timestamps
- content type
- checksums
- storage status
- SP information

## Lit ACC Fields

Базовая Lit `accessControlConditions` структура:

```ts
type LitBasicCondition = {
  contractAddress: string;
  standardContractType: string;
  chain: string;
  method: string;
  parameters: string[];
  returnValueTest: {
    comparator: "=" | "==" | "!=" | ">" | ">=" | "<" | "<=" | "contains";
    value: string;
  };
};
```

Boolean condition:

```ts
type LitBooleanOperator = {
  operator: "and" | "or";
};
```

ACC array:

```ts
type LitAccessControlConditions = Array<
  LitBasicCondition | LitBooleanOperator | LitAccessControlConditions
>;
```

Важные placeholders:

- `:userAddress`: адрес, доказанный wallet/session signature.
- `:litParam:<name>`: параметр из SIWE/session resources, если используется.
- `:currentActionIpfsId`: id текущего Lit Action для action-bound decrypt сценариев.

## Custom Contract Condition

Для Daskibo основной вариант:

```json
[
  {
    "contractAddress": "",
    "standardContractType": "",
    "chain": "ethereum",
    "method": "",
    "parameters": [":userAddress"],
    "returnValueTest": {
      "comparator": "=",
      "value": "0xAUTHOR"
    }
  },
  { "operator": "or" },
  {
    "contractAddress": "0xCOURSE_MARKETPLACE",
    "standardContractType": "customContract",
    "chain": "ethereum",
    "method": "hasCourseAccess",
    "parameters": [":userAddress", "1"],
    "returnValueTest": {
      "comparator": "==",
      "value": "true"
    }
  }
]
```

Смысл:

- author всегда может читать свой курс;
- buyer может читать только если marketplace возвращает access;
- истекший `AccessPass` должен приводить к `false`.

Для более нового `evmContractConditions` формата custom contract condition задается через:

```ts
type LitEvmContractCondition = {
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

Для `hasCourseAccess(address,uint256) returns (bool)`:

```json
{
  "contractAddress": "0xCOURSE_MARKETPLACE",
  "functionName": "hasCourseAccess",
  "functionParams": [":userAddress", "1"],
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
  "chain": "ethereum",
  "returnValueTest": {
    "key": "",
    "comparator": "=",
    "value": "true"
  }
}
```

## Manifest Schema Для Daskibo

Рекомендуемая структура `_lit/manifest.json`:

```ts
type DaskiboLitManifest = {
  schema: "daskibo.course.manifest/1";
  bucket: {
    name: string;
    owner: `0x${string}`;
    chainId: number | string;
    spEndpoint: string;
    visibility: "public-read" | "private";
  };
  course: {
    id: string;
    slug: string;
    title: string;
    author: `0x${string}`;
    marketplace?: `0x${string}`;
    accessDuration?: number;
    priceWei?: string;
  };
  lit: {
    schema: "daskibo.lit.acc/1";
    litNetwork: "datil" | "datil-test" | "datil-dev" | "chipotle" | "custom";
    chain: string;
    accessControlConditions?: LitAccessControlConditions;
    evmContractConditions?: LitEvmContractCondition[];
    ciphertext: string;
    dataToEncryptHash: string;
    encryptedMasterKey?: string;
    pkpId?: string;
    chipotleUrl?: string;
    capacityDelegationAuthSig?: unknown;
  };
  objects: Array<{
    key: string;
    encryptedKey: string;
    dekCiphertext?: string;
    contentType: string;
    size: number;
    sha256?: string;
    aad: {
      bucket: string;
      key: string;
      courseId: string;
      manifestVersion: string;
    };
  }>;
};
```

Обязательные поля для decrypt:

- `lit.accessControlConditions` или `lit.evmContractConditions`
- `lit.ciphertext`
- `lit.dataToEncryptHash`
- `objects[].key`
- encrypted object body
- encrypted DEK / wrapped object key
- AAD или equivalent binding metadata

## Object Layout В Bucket

Рекомендуемый layout:

```text
_lit/manifest.json
_lit/course.json
lessons/01/content.md.enc
lessons/01/content.md.dek.enc
lessons/02/content.md.enc
lessons/02/content.md.dek.enc
assets/video-01.mp4.enc
assets/video-01.mp4.dek.enc
```

Правила:

- Manifest public-readable.
- Ciphertext public-readable.
- Plaintext never stored.
- Raw master key never stored.
- DEK never stored in plaintext.
- Object key must be part of AAD to prevent relocating sidecars between objects.

## Publish Process

1. Author creates course spec.
2. App chooses bucket name and SP.
3. App creates bucket with `VISIBILITY_TYPE_PUBLIC_READ` or private, depending on product policy.
4. For each lesson:
   - generate object DEK;
   - encrypt plaintext with AES-GCM;
   - bind AAD to bucket/key/course;
   - wrap DEK with master key.
5. Encrypt/wrap master key with Lit ACC.
6. Write `_lit/manifest.json`.
7. Upload encrypted lesson objects and sidecars.
8. Read back manifest/object from SP and verify shape/hash.

## Read/Decrypt Process

1. Reader downloads manifest from Greenfield SP.
2. Reader downloads encrypted object.
3. Reader signs auth/session proof.
4. App asks Lit/Chipotle to decrypt master key under manifest ACC.
5. Lit evaluates:
   - wallet ownership via session/auth sig;
   - boolean ACC;
   - `hasCourseAccess(:userAddress, courseId)` on configured chain.
6. App unwraps DEK.
7. App decrypts object with AES-GCM and validates AAD/hash.

## Security Notes

- Store only ciphertext in public Greenfield objects.
- Keep `courseId`, `marketplace`, `chain`, and `bucket/key` immutable once published.
- Prefer `hasCourseAccess` contract checks over static allowlists for paid courses.
- Include author allow condition only if UC requires free author access.
- Treat `chain` value carefully: Lit must query the chain where `CourseMarketplace` is deployed.
- Do not put private keys, raw master keys, or unwrapped DEKs in manifest.
- For testnet/mainnet, ensure Lit network and contract chain are compatible with the intended ACC.
- For Lit Actions, use unified access control conditions if the action decrypts inside TEE.

## Official References

- Lit Protocol: encryption/decryption request and `accessControlConditions`.
- Lit Protocol: boolean operators and nested conditions.
- Lit Protocol: EVM custom contract conditions with `functionAbi`, `functionParams`, and `returnValueTest`.
- BNB Greenfield JS SDK: bucket create fields, visibility, `chargedReadQuota`, `primarySpAddress`, `paymentAddress`.
- BNB Greenfield JS SDK: object create/upload fields, `contentType`, `payloadSize`, checksums, visibility.
- BNB Greenfield docs: SP selection, bucket update visibility/quota/payment, object put/get/list/delete.
