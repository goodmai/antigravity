---
name: sdet
description: "SDET для платформы Daskibo/Antigravity (BNB Greenfield + Lit/Chipotle DRM + Solidity-контракты). Используйте, когда нужно прогнать или починить тесты — unit (vitest), контрактные (forge), интеграционные/docker, локальный e2e-стек (run_e2e_lit.sh), либо live/devnet-testnet прогоны — а также когда нужно ДОПИСАТЬ или АКТУАЛИЗИРОВАТЬ тесты под изменения кода, добавить регрессионный тест на баг, или выстроить/починить CI-гейты. Триггеры: «прогони тесты», «почини тест», «допиши тесты», «покрой тестом», «integration/docker тесты», «e2e», «testnet/devnet прогон», «CI/gate»."
---

# SDET — Test Engineering для Daskibo / Antigravity

Этот скилл превращает Claude в SDET для мультислойной DRM-платформы: запуск, починка,
дописывание и актуализация тестов на всех уровнях — локально и в devnet/testnet.

**Перед работой прочитать [workflow_cicd.md](../../spec/workflow_cicd.md)** (корень репо) —
это точка правды о слоях тестов, CI-гейтах, разрывах (as-is → to-be) и плане
имплементации. Этот SKILL.md — рабочий процесс; детали по файлам и naming —
в [references/test-map.md](references/test-map.md).

## Слои (снизу вверх)

| Слой | Команда | Стоимость |
| :-- | :-- | :-- |
| Unit / typecheck / no-any | `scripts/run-tests.sh unit` (или `npm run test:unit`) | дёшево, без сети |
| Contracts (forge) | `scripts/run-tests.sh contracts` | дёшево, Foundry |
| Integration / docker | `scripts/run-tests.sh integration` | средне, Docker |
| E2E local (Flow B) | `scripts/run-tests.sh e2e-local` | дорого, чистый genesis |
| Live / devnet (Flow C) | `scripts/run-tests.sh live` / `devnet` | **тратит нативку** |

Оркестратор [scripts/run-tests.sh](scripts/run-tests.sh) — единая точка входа на слой;
сам проверяет предпосылки (docker? foundry? ключи?) и **осмысленно скипает** вместо
падения. `all-local` гоняет всё без реальных средств; `all` добавляет live+devnet
(спрашивать подтверждение — тратятся реальные tBNB).

## Основной E2E сейчас — Lit Compose (Flow B)

Канонический сквозной тест платформы — стек **[smartcontracts/docker-compose.lit.yml](../../smartcontracts/docker-compose.lit.yml)**,
запускаемый `./run_e2e_lit.sh` (= слой `e2e-local`). Это «same-network paid Lit NFT
gating» поток на чистом genesis; именно он валидирует продукт целиком, поэтому при
любой правке контрактов / SDK / buckets / Lit / Greenfield — прогонять его.

Сервисы стека: `greenfield-local` (цепочка `greenfield_9000-1` + 7 SP, gateway `:9033`,
RPC `:26750`), `chipotle-anvil` (Base/BNB на Anvil), `chipotle-dstack-sim`,
`chipotle-deployer`/`-bootstrap`/`-real` (TEE Chipotle), `deploy-nft` (Foundry-деплой
контрактов), `e2e-lit` (раннер `run-e2e-lit-nft.mjs`, env `GF_SP=http://greenfield-local:9033`,
`GF_RPC=http://greenfield-local:26750`). Готовность гейтится sentinel'ом `/tmp/sp_ready`
(`start_period 240s`); seal объектов асинхронен (~100 с) → `readObjectWithRetry`.

Эталон — 10 шагов: register → encrypt → publish → Bob (до покупки) DENIED → purchase →
Bob (активная подписка) ALLOWED → soulbound transfer revert → после expiry DENIED →
Eve DENIED. Ожидаемый Exit Code 0. Менять сценарий можно прямо в `run-e2e-lit-nft.mjs`
(bind-mounted, без пересборки образа); валидировать **только из свежего genesis**
(`run_e2e_lit.sh` делает `down -v`). Топология и Flow A/C/D — [COMPOSE.md](../../spec/COMPOSE.md),
режимы — [deploy-modes.md](../greenfield/references/deploy-modes.md).

## Рабочий процесс

1. **Определить слой** по изменению: JS-модуль → unit; `.sol` → forge; bucket/SP
   round-trip → docker; paid-NFT+Lit поток → e2e-local; реальная сеть → live/devnet.
2. **Сначала воспроизвести**: прогнать соответствующий слой через `run-tests.sh <layer>`
   и прочитать вывод, прежде чем менять тесты.
3. **Чинить/дописывать тест**: следовать конвенциям и шаблонам из
   [references/test-map.md](references/test-map.md) (§2 «как добавить по слою», §3 naming).
   - Суффикс файла = слой (`*.docker.test.js`, `*.live.test.js`, иначе unit, `*.t.sol`).
     Неверный суффикс уносит дорогой тест в быстрый прогон или прячет его — проверять.
   - Регрессия на баг: каждый `BUG-00x` из [bughunter](../bughunter/SKILL.md) при фиксе
     получает тест, помеченный ID бага.
4. **Перепрогнать** затронутый слой; затем `all-local` перед сдачей.
5. **Актуализировать gates**: при изменении газа — `.gas-snapshot`; при новом слое/скрипте
   — `package.json` scripts и `.github/workflows/test.yml` (см. план в workflow_cicd.md).

## Ключевые правила (специфика этой кодовой базы)

- **Clean-state для стековых e2e**: только из свежего genesis (`run_e2e_lit.sh` → `down -v`),
  никогда синхронизацией устаревшей ноды. Seal объектов асинхронен (~100 с) — читать через
  `readObjectWithRetry`, не сразу после upload. (детали — [greenfield](../greenfield/SKILL.md)).
- **Live-тесты не должны падать без ключей** — `describe.skip`, если нет
  `GREENFIELD_TESTNET_PRIVATE_KEY`. Реальная нативка тратится только осознанно
  (nightly/manual). Матрица сетей и токенов — [uc.md → Funding Matrix](../../spec/uc.md).
- **Docker-тесты self-skip** без `docker info` — сохранять этот паттерн в новых файлах.
- **EIP-712 / путь хранения** — типовые сбои интеграции уже разобраны как RCA; перед
  отладкой «подпись не сходится» / «объект не читается» сверяться с
  [bughunter](../bughunter/SKILL.md) (BUG-001…013), а не угадывать.
- **Lit/Chipotle** — режимы (mock/chipotle/datil), ACC и manifest: [lit](../lit/SKILL.md).

## Опорные документы

- [workflow_cicd.md](../../spec/workflow_cicd.md) — схема тестирования, CI-гейты, план (читать первым).
- [references/test-map.md](references/test-map.md) — файлы→слои, как дописывать, naming, devnet env.
- [skills/greenfield/SKILL.md](../greenfield/SKILL.md) — Greenfield, 7-SP стек, seal, clean-state;
  + [deploy-modes.md](../greenfield/references/deploy-modes.md), [lit-crosschain.md](../greenfield/references/lit-crosschain.md).
- [skills/lit/SKILL.md](../lit/SKILL.md) — Lit/Chipotle, ACC, manifest, seal-латентность ≠ ACCESS_DENIED.
- [skills/bughunter/SKILL.md](../bughunter/SKILL.md) — реестр RCA (источник регрессионных тестов).
- [smartcontracts/COMPOSE.md](../../spec/COMPOSE.md) — топология Compose (Flow A/B/C/D).
- [uc.md](../../spec/uc.md) — use-cases (UC-01..13) + Funding Matrix (нативка для devnet/testnet).
- `smartcontracts/contracts/{SPEC.md,AUDIT.md}` — инварианты контрактов для forge-тестов.
