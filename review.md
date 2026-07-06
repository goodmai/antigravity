# Аудит инфраструктуры и готовности платформы (2026-07-06)

Задача платформы: децентрализованное обучение + сертификаты через NFT-доступ и
MetaMask — после доказательства владения NFT контент курса расшифровывается на
стороне клиента (Greenfield storage + Chipotle/Lit DRM + BSC/opBNB контракты).

## 1. Оценка текущей готовности

| Компонент | Состояние | Готовность |
|---|---|---|
| Контракты (`AccessPass`, `CourseMarketplace`, `Treasury`, `ClientNft`/`AuthorNft`, P-A wrap-on-purchase) | forge-тесты зелёные, внутренний аудит `spec/AUDIT.md` | ✅ ~95% |
| DRM-ядро (Chipotle-адаптер, канонический ACC-eval `lit-acc-eval.js`, expiry app-side) | mainnet-blocker обхода ACC закрыт 2026-06-05 | ✅ |
| Локальные стеки + CI (7 jobs, e2e-lit, devnet-pa 16/16, ui-e2e-synpress 12/12) | зелёные | ✅ |
| Devnet на реальных тестнетах (BSC 97 + GF 5600) | работает, но DRM через **mock** | 🟡 70% |
| Публикация в Greenfield **mainnet** (`write-mainnet.mjs`) | **сломано** — Lit datil мёртв с 2026-02-25 | 🔴 0% → ✅ исправлено |
| `testnet`-профиль главного композа (`write-testnet-lit.mjs`) | **сломано** — datil-dev мёртв | 🔴 → ✅ исправлено (deprecated, заменён) |
| opBNB (mainnet 204 / testnet 5611) | отсутствовал полностью | 🔴 → ✅ добавлено |
| Pinata/IPFS | только CLI для Lit Actions, не в пайплайне публикации | 🟡 → ✅ интегрировано |
| Docker-профили `prod` / `testnets` | отсутствовали | 🔴 → ✅ добавлены |
| Synpress UI-тесты | 12/12 в CI на local-full стеке | ✅ |

## 2. Находки аудита

| # | Серьёзность | Находка | Статус |
|---|---|---|---|
| A1 | blocker | `write-mainnet.mjs` подключается к Lit `datil` (сеть закрыта 2026-02-25) — публикация в GF mainnet невозможна | ✅ переписан на Chipotle (REST), общий пайплайн с devnet |
| A2 | blocker | `testnet`-профиль главного композа запускает `write-testnet-lit.mjs` (datil-dev/datil-test) — мёртв; при этом сервис зависел от chipotle-mock, который не использовал | ✅ профиль переведён на общий Chipotle-пайплайн; скрипт помечен deprecated |
| A3 | major | Нет единых профилей прод/тестнет с реальным Chipotle + Pinata (были только разрозненные композы devnet/mainnet-lit) | ✅ добавлены профили `prod` и `testnets` в `smartcontracts/docker-compose.yml` |
| A4 | major | opBNB нигде не поддержан: нет в `CHAIN_RPCS` (ACC-eval), нет деплоя контрактов | ✅ добавлены `opbnb`/`opbnbTestnet`/`base` в карту цепочек; деплой мультичейн (BSC + opBNB) в новых профилях |
| A5 | major | Pinata только как standalone CLI (`tools/pinata/pin.mjs` для Lit Actions); опубликованный курс (манифест + шифрованные уроки) не сохранялся в IPFS | ✅ `ipfs-mirror.mjs` в пайплайне: пин объектов + манифеста, `ipfsMirror` (CID map) в манифесте |
| A6 | minor | Устаревшие datil-комментарии в шапке `docker-compose.yml` | ✅ обновлены |
| A7 | info | ChainSecured: управляющие вызовы Chipotle всё ещё через usage `X-Api-Key`, а не `*_with_signature` кошельком-identity (TODO из skills/lit §7.4) | ⏳ осталось (не блокирует action runs) |
| A8 | info | Обход ACC в `bucket-reader.html` на mainnet — был закрыт ранее (2026-06-05, канонический eval) | ✅ закрыт ранее |

## 3. Фондирование — что пополнить (проверено live 2026-07-06)

**Chipotle-кредиты — главный блокер real-DRM.** Аккаунт «Prometheus solutions»
(identity-кошелёк `0x58F2D197045087910b737B1C5eDc61B896069039`, INIT_TX на Base)
имеет баланс **$0.00 («No credits»)** — `GET /core/v1/billing/balance`.
Пополнение у Chipotle **не адресом, а через Stripe** (мин **$5**): дашборд Lit
или `POST /core/v1/billing/create_payment_intent`. Без кредитов encrypt/decrypt
через `api.chipotle.litprotocol.com` вернёт 402/403.

Адреса для пополнения (все — один ops-кошелёк `0x58F2D197…9039`):

| Сеть | Текущий баланс | Нужно | Назначение |
|---|---|---|---|
| Chipotle billing (Stripe) | $0.00 | ≥ $5 | encrypt/decrypt (real DRM), прод и тестнет-профили |
| Base mainnet (8453) | 0.00097 ETH | ~0.002 ETH | газ ChainSecured-writes (A7) |
| BSC mainnet (56) | 0 | ~0.03 BNB | деплой контрактов + минт (prod) |
| opBNB mainnet (204) | 0 | ~0.005 BNB | деплой контрактов (prod) |
| Greenfield mainnet (1017) | 0 | ~0.05 BNB | bucket + storage (prod writer); перевод cross-chain с BSC |
| BSC testnet (97) | 0.0355 tBNB | ok (докинуть при деплоях) | testnets-профиль |
| opBNB testnet (5611) | 0 | кран (бесплатно) | testnets-профиль |
| Greenfield testnet (5600) | 0.1999 tBNB | ok | testnets-профиль |

## 4. Docker-профили (как запускать)

```bash
# Тестнеты: контракты → BSC 97 (+ opBNB 5611), курс → GF testnet 5600,
# DRM → РЕАЛЬНЫЙ Chipotle (продовый, тестнета у него нет), пин → Pinata IPFS
docker compose -f smartcontracts/docker-compose.yml --profile testnets up

# Прод: контракты → BSC 56 + opBNB 204, курс → GF mainnet 1017,
# DRM → реальный Chipotle, пин → Pinata IPFS
docker compose -f smartcontracts/docker-compose.yml --profile prod up
```

Требуемый `.env`: `GREENFIELD_TESTNET_PRIVATE_KEY/_ADDRESS` (testnets),
`GREENFIELD_MAINNET_PRIVATE_KEY/_ADDRESS` (prod), `CHIPOTLE_API_KEY`
(Stripe-funded), `PINATA_JWT` (или `PINATA_API_KEY`+`PINATA_API_SECRET`),
`PINATA_GATEWAY`. Прод-деплой жёстко отказывается от well-known anvil-ключа.

## 5. Тестовое покрытие изменений

- unit: `tests/ipfs-mirror.test.js`, `tests/publish-env.test.js`, расширен `tests/lit-acc-eval.test.js` (opBNB/base)
- интеграция (бэкенд): `tests/publish-pipeline.integration.test.js` — mock Pinata HTTP + chipotle-mock + mock-SP, полный publish с PIN_TO_IPFS=1, проверка CID-зеркала и round-trip манифеста
- Synpress: существующая UI-сьюта (12/12, CI `ui-e2e-synpress`) покрывает клиентский unlock-флоу; профили prod/testnets используют тот же фронтенд

Итог прогона (2026-07-06): vitest 443 passed / 17 skipped, forge 179/179,
typecheck + no-any — зелёные.

## 6. Документация и скрипты

- `smartcontracts/README.md` → раздел «Платформа целиком»: акторы, полный флоу
  (публикация → покупка → NFT-доступ → client-side расшифровка), паттерны и
  абстракции, ограничения, роль Pinata, гайд добавления EVM-сетей и протокол
  интеграции не-EVM сетей (Waves, Canton)
- `smartcontracts/scripts/add-evm-chain.sh` — onboarding новой EVM-сети
  (деплой NFT-фабрик + settlement, минт, registerCourse, чек-лист доводки)
- `smartcontracts/scripts/deploy-multichain.sh` — мультичейн-деплой профилей
  `prod`/`testnets` (BSC + opBNB)

---

# Ревью Уроков

| Папка | Название (из README) | Наличие README.md | Наличие index.html | Слов в README | Замечания |
|-------|----------------------|-------------------|--------------------|---------------|-----------|
| 1 | Урок 1: Режимы агента Antigravity | ✅ | ✅ | 818 | ОК |
| 2 | Урок 2: Обратная связь на уровне артефактов (Artifact-level feedback) | ✅ | ✅ | 779 | ОК |
| 3 | Урок 3: Продвинутые техники — @ Mentions и Workflows | ✅ | ✅ | 516 | ОК |
| 4 | Урок 4: Навыки Агента (Agent Skills) | ✅ | ✅ | 1233 | ОК |
| 5 | Урок 5: Каталог стандартных скиллов (17 / 17) | ✅ | ✅ | 1183 | ОК |
| 6 | Урок 6: Продвинутые AI-воркфлоу — автономная самоисцеляющаяся система | ✅ | ✅ | 1218 | ОК |
| 7 | Урок 7: QA Architect — мета-скилл `qa-skill-tester` | ✅ | ✅ | 1255 | ОК |
| 8 | Урок №8: Агентный Режим и Группы Задач (Task Groups) | ✅ | ✅ | 652 | ОК |
| 9 | Урок 9: Browser Subagent и "Computer Use" | ✅ | ✅ | 577 | ОК |
| 10 | Урок 10: Протокол контекста модели (MCP) | ✅ | ✅ | 469 | ОК |
| 11 | Урок 11: Терминал, Безопасность и Режим Turbo | ✅ | ✅ | 488 | ОК |
| 12 | Урок 12: Автоматизация тестирования с Playwright | ✅ | ✅ | 443 | ОК |
| 13 | Урок 13: Облачная разработка (Google Cloud & Firebase) | ✅ | ✅ | 1726 | ОК |
| 14 | Урок 14: Микросервисы и Docker | ✅ | ✅ | 398 | ОК |
| 15 | Урок 15: CI/CD Pipeline Generation | ✅ | ✅ | 372 | ОК |
| 16 | Урок 16: Мобильная разработка | ✅ | ✅ | 353 | ОК |
| 17 | Урок 17: Современный Веб (Next.js & Full-Stack) | ✅ | ✅ | 318 | ОК |
| 18 | Урок 18: Рефакторинг и Работа с Legacy Кодом | ✅ | ✅ | 747 | ОК |
| 19 | Урок 19: Комплексный SDLC Микросервисов с AI Агентами | ✅ | ✅ | 1559 | ОК |
| 20 | Промпт-инжиниринг для агентов Antigravity | ✅ | ✅ | 702 | ОК |
| 21 | Отладка и диагностика агентных задач | ✅ | ✅ | 745 | ОК |
| 22 | Кастомные MCP-серверы с нуля | ✅ | ✅ | 643 | ОК |
| 23 | Многоагентная оркестрация | ✅ | ✅ | 717 | ОК |
| 24 | Работа с большими кодовыми базами | ✅ | ✅ | 779 | ОК |
| 25 | Урок 25: Фундаментальная логика и математика ИИ-ассистентов | ✅ | ✅ | 300 | ОК |
| 26 | Урок 26: Развертывание среды на ПК и мобильных устройствах | ✅ | ✅ | 369 | ОК |
| 27 | Урок 27: Управление диалогом и логика промпт-инжиниринга | ✅ | ✅ | 372 | ОК |
| 28 | Урок 28: Архитектура памяти и лимиты контекстного окна | ✅ | ✅ | 440 | ОК |
| 29 | Урок 29: Анализ данных и границы безопасности песочницы | ✅ | ✅ | 511 | ОК |
| 30 | Урок 30: Web3 — Основы Solidity | ✅ | ✅ | 2079 | ОК |
| 31 | Урок 31: Docker Best Practices — Rootless, Docker Hub, GHCR | ✅ | ✅ | 1148 | ОК |
| 32 | Урок 32: Хостинг сайта на BNB Greenfield | ✅ | ✅ | 1524 | ОК |
| 33 | Урок 33: Миграция на Antigravity CLI (Agy) и настройка MCP/Skills | ✅ | ✅ | 412 | ОК |
| 34 | Урок 34: Разработка под Android через Android CLI 1.0 | ✅ | ✅ | 380 | ОК |
