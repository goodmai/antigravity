# workflow_cicd.md — Схема тестирования и CI/CD (Daskibo / Antigravity)

Документ фиксирует **текущую** и **идеальную** схему тестирования платформы
(unit · contracts · integration/docker · live devnet/testnet · e2e-стек), разрывы
между ними и **план имплементации**. Это опорный документ для SDET-скилла
([skills/sdet/SKILL.md](skills/sdet/SKILL.md)) и точка правды о том, какой слой
тестов чем запускается и где гейтится.

Связанные документы:
- [uc.md](uc.md) — use-cases + Funding Matrix (где нужна нативка для devnet/testnet).
- [smartcontracts/COMPOSE.md](smartcontracts/COMPOSE.md) — топология Compose-стеков (Flow A/B/C/D).
- [skills/greenfield/SKILL.md](skills/greenfield/SKILL.md) · [references/deploy-modes.md](skills/greenfield/references/deploy-modes.md) — режимы деплоя.
- [skills/lit/SKILL.md](skills/lit/SKILL.md) — Lit/Chipotle интеграция.
- [skills/bughunter/SKILL.md](skills/bughunter/SKILL.md) — реестр решённых багов (RCA).

---

## 1. Текущая схема (as-is)

### 1.1 Слои тестов

| Слой | Что покрывает | Команда | Файлы | Нужна инфра |
| :-- | :-- | :-- | :-- | :-- |
| **Unit** | JS-логика: crypto-envelope, lit-acc, sdk-adapters, buckets, ui, web3 | `npm run test:unit` | `tests/*.test.js` (кроме `*.docker.*`/`*.live.*`) | нет (jsdom) |
| **Typecheck** | строгий `tsc` | `npm run typecheck` | `tsconfig.json` | нет |
| **No-any lint** | запрет `any` | `npm run lint:noany` | `scripts/check-no-any.sh` | нет |
| **Contracts** | Solidity: AccessPass, CourseMarketplace, Treasury | `forge test -vvv` (в `smartcontracts/contracts`) | `*.t.sol` | Foundry |
| **Integration (docker)** | bucket round-trip, contracts, local Greenfield против реального Compose | `npm run test:integration` | `tests/*.docker.test.js` | Docker |
| **Live (devnet/testnet)** | публичный Greenfield testnet + datil-dev Lit | *(нет npm-скрипта)* | `tests/*.live.test.js` | testnet + ключи |
| **E2E Flow B (local)** | paid soulbound NFT + Lit gating на чистом genesis | `./run_e2e_lit.sh` | `e2e/run-e2e-lit-nft.mjs` | Docker + dstack/chipotle |
| **E2E Flow C (real)** | anvil-97 + Greenfield testnet 5600 + datil-dev | `node e2e/run-e2e.mjs` | `e2e/run-e2e.mjs` | testnet + ключи |

`*.docker.test.js` сами себя `describe.skip`, если `docker compose version`/`docker info`
недоступны (см. `dockerAvailable()`), поэтому безопасны в окружении без Docker.

### 1.2 CI-джобы (`.github/workflows/test.yml`)

| Job | Триггер | Содержание |
| :-- | :-- | :-- |
| `test` | каждый push, PR (по `paths`) | `test:unit` + `typecheck` + `lint:noany` |
| `forge-test` | каждый push | `forge build` + `forge test` + `forge snapshot` (snapshot — `continue-on-error`) |
| `chipotle-real-integration` | `workflow_dispatch` \| `schedule` (ночью 03:17) | сборка dstack + real Chipotle, healthcheck `:8000/version` |
| `e2e-lit-integration` | `dispatch` \| `schedule` \| `pull_request` | `run_e2e_lit.sh`, timeout 45 мин |

---

## 2. Идеальная схема (to-be)

Пирамида тестирования: много дешёвых быстрых тестов внизу, мало дорогих наверху.
Каждый слой имеет **единую команду**, **детерминированный gate** и **чёткое место
в CI**.

```
        ┌───────────────────────────────┐
  slow  │ E2E real (Flow C, devnet/testnet) │  ← nightly + ручной gate, реальная нативка
        ├───────────────────────────────┤
        │ E2E local (Flow B, run_e2e_lit)  │  ← PR-gate (или nightly при дорогой сборке)
        ├───────────────────────────────┤
        │ Integration / Docker (Flow A)    │  ← PR-gate, все *.docker.test.js
        ├───────────────────────────────┤
        │ Contracts (forge + gas-gate)     │  ← каждый push
  fast  │ Unit + typecheck + no-any + cov  │  ← каждый push
        └───────────────────────────────┘
```

Принципы:
1. **Одна команда на слой** — `test:unit` / `test:contracts` / `test:integration` /
   `test:live` / `test:e2e:local` / `test:e2e:devnet`. SDET не должен помнить пути.
2. **Гейты детерминированы** — gas-snapshot падает при дрейфе; coverage имеет порог;
   live-тесты явно `skip` без ключей, а не падают.
3. **Стоимость осознанна** — реальная нативка (BSC/Greenfield testnet) тратится только
   в nightly/manual, и только при наличии `*_PRIVATE_KEY`.
4. **Чистое состояние** — стековые e2e всегда из свежего genesis (`down -v`), не из
   переиспользованной ноды (см. правило clean-state в greenfield-скилле).
5. **Тесты живут вместе с кодом** — новый контракт/SDK-путь приходит со своим тестом;
   баг из bughunter-реестра получает регрессионный тест.

---

## 3. Разрывы (gaps as-is → to-be)

| # | Разрыв | Влияние | Целевое состояние |
| :-- | :-- | :-- | :-- |
| G1 | `test:integration` запускает **только** `greenfield-integration.docker.test.js` (из 3) | `contracts.docker` и `greenfield-local.docker` не гоняются командой | `test:integration` = все `tests/*.docker.test.js` |
| G2 | Нет `test:live` скрипта; `*.live.test.js` нигде не запускаются | devnet/testnet регрессии не ловятся | добавить `test:live` (skip без ключей) + nightly job |
| G3 | Нет CI-джобы для devnet/testnet (Flow C, `run-e2e.mjs`) | реальная интеграция Greenfield testnet + Lit проверяется только вручную | nightly `devnet-e2e` job, gated на secrets |
| G4 | `forge snapshot` — `continue-on-error`, не сверяется с коммитом | газовые регрессии незаметны | `forge snapshot --check` как gate |
| G5 | `@vitest/coverage-v8` установлен, но покрытие не считается/не гейтится | нет видимости покрытия | `test:coverage` + порог в `vitest.config.js` |
| G6 | `e2e-lit` на каждом PR = 45 мин (холодная сборка образов) | медленный PR-фидбек | кэш образов greenfield/chipotle; либо перенос в nightly + label-триггер |
| G7 | Нет единой точки входа «прогнать всё подходящее по контексту» | SDET вручную выбирает слои | оркестратор `scripts/run-tests.sh <layer>` (см. план) |

---

## 4. Детали по слоям

### Unit (`test:unit`)
- vitest + jsdom; исключает `*.docker.*` и `*.live.*`.
- Добавляя JS-модуль (buckets/lit/*), писать тест рядом: `tests/<module>.test.js`.
- Мокать сеть/SDK; никаких реальных RPC.

### Contracts (`forge test`)
- `smartcontracts/contracts`, файлы `*.t.sol`. Покрывают split-платежи, soulbound-реверты,
  `hasCourseAccess`, expiry, Ownable2Step (см. `SPEC.md`/`AUDIT.md`).
- Gate: `forge test` + (целевое) `forge snapshot --check` против закоммиченного `.gas-snapshot`.

### Integration / Docker (`test:integration`)
- `*.docker.test.js` поднимают `docker-compose.yml` (Flow A, mock SP) и проверяют
  serve/save/retrieve. Self-skip без Docker.
- Целевое: команда гоняет все три файла; `beforeAll` делает `compose up -d --wait`,
  `afterAll` — `compose down -v`.

### Live / devnet-testnet (`test:live` + `run-e2e.mjs`)
- `*.live.test.js` и `run-e2e.mjs` бьют по **реальным** сетям: anvil-97, Greenfield
  testnet `5600` (`gnfd-testnet-*.bnbchain.org`), Lit `datil-dev`.
- Требуют `GREENFIELD_TESTNET_PRIVATE_KEY`/`_ADDRESS` (+ опц. `CHIPOTLE_URL`, `LIT_*`).
- **Нативка**: BSC testnet tBNB (деплой/покупка) + Greenfield testnet tBNB (storage),
  `datil-dev` бесплатна. Полная матрица — [uc.md → Funding Matrix](uc.md).
- Правило: без ключей — `describe.skip` (не падать). Тратят реальные средства → только
  осознанно (nightly/manual).

### E2E Flow B local (`run_e2e_lit.sh`)
- Полный chipotle+greenfield+anvil стек на чистом genesis (7-SP, seal ~100 с,
  `/tmp/sp_ready`). 10 шагов; ожидаемый Exit Code 0.
- Требует `CHIPOTLE_DIR`, `SIMULATOR_DIR` (dstack-симулятор).

---

## 5. План имплементации

Фазы — от дешёвых правок к дорогим; каждая самостоятельна.

### Фаза 1 — закрыть командные разрывы (G1, G2, G5)
- `package.json` scripts:
  ```jsonc
  "test:integration": "vitest run tests/**/*.docker.test.js",
  "test:live":        "vitest run tests/**/*.live.test.js",
  "test:coverage":    "vitest run --coverage",
  "test:contracts":   "forge test -vvv --root smartcontracts/contracts"
  ```
- В `vitest.config.js` — порог coverage (стартовый, не завышать), напр. lines 60%.
- Live-тесты: в начале файла `const RUN = !!process.env.GREENFIELD_TESTNET_PRIVATE_KEY;`
  → `(RUN ? describe : describe.skip)`.

### Фаза 2 — оркестратор (G7)
- `scripts/run-tests.sh <layer>` где `layer ∈ {unit, contracts, integration, e2e-local, live, devnet, all-local, all}`.
- `all-local` = unit+contracts+integration+e2e-local (без реальных средств).
- Скрипт сам проверяет предпосылки (docker? foundry? ключи?) и осмысленно скипает.

### Фаза 3 — CI gating (G4, G6, G3)
- `forge-test`: заменить snapshot на `forge snapshot --check`.
- `e2e-lit`: добавить кэш Docker-образов greenfield/chipotle; на PR — только если есть
  label `e2e` или менялись пути `smartcontracts/(e2e|contracts|buckets|greenfield-*)`.
- Новая ночная джоба `devnet-e2e`: `node smartcontracts/e2e/run-e2e.mjs`, gated на
  `secrets.GREENFIELD_TESTNET_PRIVATE_KEY` (skip, если секрет пуст).

### Фаза 4 — актуализация и анти-регресс
- Каждый `BUG-00x` из [bughunter](skills/bughunter/SKILL.md) → регрессионный тест
  (unit или forge), помеченный ID бага.
- При изменении контрактов/SDK — обновлять `.gas-snapshot` и `SPEC.md`.

---

## 6. Матрица «слой × среда»

| Слой | local-mock | local (genesis) | devnet/testnet |
| :-- | :-- | :-- | :-- |
| Unit / typecheck / no-any | ✅ | ✅ | ✅ |
| Contracts (forge) | ✅ (anvil) | ✅ | ⚠️ (деплой на BSC testnet, нативка) |
| Integration / docker | ✅ (Flow A) | ✅ | — |
| E2E Lit | — | ✅ (Flow B, `run_e2e_lit.sh`) | ⚠️ (Flow C/D, реальные SP + Lit) |
| Live writers | — | — | ✅ (`write-testnet*.mjs`, нативка) |

⚠️ = тратит реальную нативку/кредиты; запускать осознанно (см. Funding Matrix в uc.md).

---

## 7. Команды-шпаргалка (текущие)

```bash
# Быстрый локальный круг (без сети/средств)
npm run test:unit && npm run typecheck && npm run lint:noany
(cd smartcontracts/contracts && forge test -vvv)
npm run test:integration            # docker, Flow A

# Полный локальный e2e (чистый genesis)
SKIP_CLEANUP=1 ./run_e2e_lit.sh

# Devnet/testnet (нужны ключи + нативка — см. uc.md Funding Matrix)
export GREENFIELD_TESTNET_PRIVATE_KEY=0x... GREENFIELD_TESTNET_ADDRESS=0x...
node smartcontracts/e2e/run-e2e.mjs
```
