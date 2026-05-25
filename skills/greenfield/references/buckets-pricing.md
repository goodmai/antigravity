# Бакеты, Объекты, Манифесты и Ценообразование

## Содержание

- Модель данных
- Формирование bucket
- Публикация курса
- Lit/Chipotle sidecars
- Pricing модель
- Payment/access модель
- Практические проверки

## Модель Данных

Greenfield layer хранит:

- bucket: namespace курса или набора объектов
- object: конкретный файл внутри bucket
- manifest: JSON-описание курса, объектов, DRM metadata
- sidecars: служебные файлы для encryption/decryption

В проекте Daskibo курс обычно выглядит так:

```text
bucket
├── _lit/manifest.json
├── lessons/01/lesson.md.enc
├── lessons/01/lesson.md.dek.enc
└── ...
```

Если объект сохранен без Lit/encryption, он public-readable при public visibility. Это baseline UC-01.

## Формирование Bucket

Bucket name должен быть стабильным, уникальным и допустимым для Greenfield. Обычно он формируется из course slug или `GF_BUCKET`.

Типовой flow:

1. Нормализовать `slug`.
2. Сформировать `bucketName`.
3. Создать bucket через backend:
   - mock/SP-emulation backend для Flow A
   - real SDK backend для local/testnet/mainnet
   - browser wallet backend для UI writes
4. Сохранить manifest и objects.
5. Проверить read-back через SP gateway.

В коде смотреть:

- `smartcontracts/buckets/greenfield-core.js`
- `smartcontracts/buckets/course-publish.js`
- `smartcontracts/greenfield-testnet/sdk-backend.mjs`
- `smartcontracts/buckets/greenfield-wallet-backend.js`

## Публикация Курса

`planCoursePublish` строит publish plan без немедленной записи в Greenfield.

Обычно он делает:

1. Берет course spec: title, slug, lessons.
2. Генерирует master key.
3. Для каждого lesson генерирует DEK.
4. Шифрует lesson через AES-GCM.
5. Оборачивает DEK master key.
6. Шифрует/wrap master key через Lit или Chipotle.
7. Собирает `manifest`.
8. Возвращает список объектов для upload.

После планирования caller делает:

```js
await gf.createBucket(plan.bucketName, { visibility: 'public', owner });
for (const object of plan.objects) {
  await gf.saveObject(plan.bucketName, object.key, object.body, {
    contentType: object.contentType,
    owner,
  });
}
```

## Lit/Chipotle Sidecars

Manifest должен содержать `lit` metadata, если курс защищен DRM.

Типовые поля:

- `litNetwork`
- encrypted master key / ciphertext
- access control conditions
- sidecar references
- Chipotle URL / PKP id для Chipotle mode

ACC обычно включает:

- author allowlist condition
- contract call condition: `CourseMarketplace.hasCourseAccess(user, courseId) == true`

UC-03 требует, чтобы author имел бесплатный доступ к собственному контенту.

## Pricing Модель

В проекте есть два разных уровня pricing:

### Storage / Lit publish pricing

Используется на этапе планирования/публикации:

- `storageCost`: стоимость хранения/операции записи
- `litSaveCost`: стоимость Lit/DRM сохранения
- `w3extPayee`: получатель платформенной части

Эти значения участвуют в расчетах publish plan и UI estimates. Смотреть:

- `smartcontracts/buckets/lit-pricing.js`
- `tests/lit-pricing.test.js`
- `smartcontracts/buckets/course-publish.js`

### Course access pricing

Используется контрактом `CourseMarketplace`.

Модель:

- buyer платит `price`
- treasury получает protocol cut
- w3ext получает platform cut
- author получает остаток
- buyer получает soulbound `AccessPass`
- `expiry = now + accessDuration`
- `accessDuration = 0` означает perpetual access

UC-04 фиксирует ожидаемое поведение:

```text
Treasury 20% push
w3ext 20% pull
author remainder pull
```

Фактические bps и лимиты проверять в контрактах:

- `smartcontracts/contracts/src/CourseMarketplace.sol`
- `smartcontracts/contracts/src/Treasury.sol`
- `smartcontracts/contracts/src/AccessPass.sol`

## Payment/Access Модель

Access check:

```text
CourseMarketplace.hasCourseAccess(user, courseId)
```

Должен возвращать:

- `true` для author
- `true` для buyer до expiry
- `false` после expiry
- `false` для unauthorized users

Lit/Chipotle decrypt flow:

1. Reader получает manifest и encrypted object.
2. Reader доказывает владение address.
3. Lit/Chipotle проверяет ACC.
4. Если ACC проходит, возвращает master key.
5. Client расшифровывает DEK и lesson.

Unauthorized path должен давать `ACCESS_DENIED` или эквивалентную ошибку.

## Практические Проверки

Проверить bucket read-back:

```bash
curl -i "$GF_SP/$BUCKET/_lit/manifest.json"
```

Проверить, что encrypted lesson не plaintext:

```bash
curl -s "$GF_SP/$BUCKET/lessons/01/secret.md.enc"
```

Проверить pricing tests:

```bash
npx vitest run tests/lit-pricing.test.js tests/course-publish.test.js
```

Проверить contract access flow:

```bash
npx vitest run tests/contracts.docker.test.js
```

Если используется Docker E2E, сначала проверь Compose config, затем запускай соответствующий profile или `docker-compose.lit.yml`.
