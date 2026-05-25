---
name: lit
description: Интеграция Lit Protocol и Chipotle DRM в проекте Antigravity. Используйте этот skill для настройки шифрования на стороне клиента, конфигурации Access Control Conditions (ACC), развертывания и тестирования Chipotle Mock/Live TEE серверов, а также отладки криптографических сессий.
---

# Lit Protocol & Chipotle DRM Integration Handbook

Этот справочник содержит стандарты, архитектурные шаблоны и руководства по интеграции **Lit Protocol** и его TEE-альтернативы **Chipotle DRM** в экосистему Antigravity. Инструмент используется для шифрования курсов и медиа-контента, сохраняемых в BNB Greenfield, с ограничением доступа на базе владения NFT или результатов вызова смарт-контрактов.

---

## 1. Архитектура DRM-шифрования (Split-Key Encryption)

В целях масштабируемости и производительности в проекте не шифруется весь файл через Lit. Вместо этого применяется гибридная схема **Envelope Encryption**:

1. **Симметричное шифрование (AES-GCM)**: Большой файл (видео, текст урока) шифруется случайным 256-битным ключом (Master Key) локально на клиенте с помощью [crypto-envelope.js](file:///home/g/projects/antigravity/smartcontracts/buckets/crypto-envelope.js).
2. **Асимметричное шифрование ключа (Lit/Chipotle)**: Случайный Master Key шифруется в сети Lit/Chipotle под условия доступа (**Access Control Conditions - ACC**). Полученный шифр (ciphertext) и метаданные сохраняются в публичном файле `manifest.lit.json` в Greenfield.
3. **Дешифрование на лету**: Когда авторизованный пользователь (удовлетворяющий ACC) запрашивает доступ, сеть Lit/Chipotle восстанавливает Master Key. Клиент расшифровывает контент прямо в браузере.

### Сравнение Lit Protocol и Chipotle

| Параметр | Lit Protocol (`datil`) | Chipotle (TEE REST API) | Chipotle Mock (Локально) |
| :--- | :--- | :--- | :--- |
| **Среда выполнения** | Децентрализованная сеть P2P | REST API поверх TEE (Intel SGX) | Node.js `crypto.subtle` |
| **Порты** | Требует открытый порт **7470** | Стандартный HTTP/HTTPS (443) | Локальный порт `8000` |
| **Режим** | Production | Staging / Testnet | Local Development / E2E |
| **Конфигурация** | `lit-sdk.js` | `lit-sdk-chipotle.js` | `lit-sdk-chipotle.js` |

> [!WARNING]
> Порт **7470**, используемый для P2P-рукопожатий в `datil-dev` сети Lit, часто блокируется файрволами на серверах сборки. Для локальной разработки и CI/CD интеграционного тестирования всегда используйте **Chipotle Mock** на порту `8000`.

---

## 2. Спецификация файлов и компонентов

Интеграция Lit сосредоточена в каталоге [smartcontracts/buckets/](file:///home/g/projects/antigravity/smartcontracts/buckets/):

- **[lit-access.js](file:///home/g/projects/antigravity/smartcontracts/buckets/lit-access.js)** — Ядро абстракции доступа. Не зависит от окружения (DOM-free), оркеструет вызовы шифрования/дешифрования симметричного ключа.
- **[lit-sdk-chipotle.js](file:///home/g/projects/antigravity/smartcontracts/buckets/lit-sdk-chipotle.js)** — Адаптер для взаимодействия с Chipotle (Mock или Live) через REST API. Имитирует проверку условий ACC локально или в TEE.
- **[lit-sdk.js](file:///home/g/projects/antigravity/smartcontracts/buckets/lit-sdk.js)** — Оригинальный SDK Lit Protocol для работы с реальными TEE-нодами в сети `datil`.
- **[lit-acc.js](file:///home/g/projects/antigravity/smartcontracts/buckets/lit-acc.js)** — Конструктор Access Control Conditions для проверок баланса NFT (`ERC721`) и вызовов маркетплейса (`hasCourseAccess`).

---

## 3. Схема данных манифеста (`manifest.lit.json`)

Каждая зашифрованная лекция или курс сопровождается публичным JSON-манифестом:

```json
{
  "schema": "daskibo.lit.acc/1",
  "chain": "ethereum",
  "litNetwork": "chipotle",
  "chipotleUrl": "http://localhost:8000",
  "pkpId": "0x71e835aff094655dEF897fbc85534186DbeaB75d",
  "accessControlConditions": [
    {
      "contractAddress": "0xD10606538519464999C57C415E956491e2345678",
      "functionName": "hasCourseAccess",
      "functionParams": [":userAddress", "42"],
      "standardContractType": "",
      "chain": "ethereum",
      "returnValueTest": {
        "key": "",
        "comparator": "==",
        "value": "true"
      }
    }
  ],
  "ciphertext": "base64iv:ciphertext_payload",
  "dataToEncryptHash": "sha256_hash_of_plaintext_key"
}
```

---

## 4. Диагностика и отладка (RCA)

Интеграция с криптографическими протоколами часто подвержена тонким ошибкам подписи, несоответствию форматов JSON, регистрам адресов или блокировкам портов. 

> [!IMPORTANT]
> Для быстрого устранения возникших проблем при интеграции Lit, проверке EIP-712 подписей и отладке смарт-контрактов всегда обращайтесь к специализированному реестру:
> 👉 **[Справочник Bug Hunter (RCA Register)](file:///home/g/projects/antigravity/skills/bughunter/SKILL.md)**

### Ключевые рекомендации при работе с Lit/Chipotle:
1. **Case-Sensitivity в EVM адресах**: Всегда проверяйте регистр адресов в условиях ACC и в метаданных вызовов. Выполняйте `.toLowerCase()`, чтобы избежать сбоев сверки подписей в TEE и Go-нодах.
2. **Readiness смарт-контрактов**: Перед передачей адреса контракта в Lit ACC, убедитесь, что он полностью развернут и инициализирован. Вызов неинициализированного контракта с `revert` сломает флоу проверки прав в Lit ноде (см. `BUG-001`).
3. **Проверка RPC**: Chipotle-клиент выполняет реальные JSON-RPC вызовы на указанный в `ANVIL_RPC` адрес для сверки `balanceOf` и `hasCourseAccess`. Убедитесь, что Anvil/Geth запущен и доступен из контейнера Chipotle.
4. **Seal-латентность Greenfield ≠ ошибка ACC**: дешифрование сначала **читает** `manifest.lit.json` и `.enc` из Greenfield. На локальном стеке объект запечатывается асинхронно (~100–110 с после `putObject`), поэтому чтение сразу после публикации даёт `not sealed`/404 — это не отказ доступа. Читайте с ретраем (`readObjectWithRetry`), и только после успешного чтения шифртекста зовите Lit. Различайте `404/not sealed` (объект ещё не готов, BUG-012) и `ACCESS_DENIED` (ACC реально не выполнен).

---

## 5. Пошаговый сценарий запуска интеграционных тестов

Скрипт `./run_e2e_lit.sh` выполняет полный цикл интеграции на **чистом genesis**:
он сам делает `docker compose down -v`, патчит SDK (`patch_sdk.cjs`) и поднимает
стек с **реальным 7-SP gnfd-sp** (а не mock) — см. раздел «Локальный SP-стек» в
[Greenfield Skill](../greenfield/SKILL.md).

```bash
# 1. Запуск тестового стенда (SKIP_CLEANUP=1 — не сносить стек после прогона)
SKIP_CLEANUP=1 ./run_e2e_lit.sh

# 2. Логирование выполнения тестов e2e-lit
tail -f logs/e2e-lit-run.log

# 3. Очистка окружения (при необходимости)
docker compose -f smartcontracts/docker-compose.lit.yml down -v --remove-orphans
```

> [!NOTE]
> Готовность стека упирается в SP, а не в Lit: контейнер `greenfield-local`
> становится `healthy` только по sentinel `/tmp/sp_ready` (`start_period 240s`) —
> цепочка + GVG + MariaDB + 7 SP. Затем e2e ещё ждёт seal'а объектов (~100 с), так
> что первый зелёный прогон с холодной сборкой образа занимает ~8–12 мин. Валидируйте
> всегда из чистого состояния, не переиспользуя устаревший контейнер.

Эталонный прогон — 10 шагов из `run-e2e-lit-nft.mjs`: register → encrypt → publish →
Bob (до покупки) DENIED → purchase → Bob (активная подписка) ALLOWED → soulbound
transfer revert → после истечения DENIED → Eve DENIED. Ожидаемый результат — Exit Code 0.
