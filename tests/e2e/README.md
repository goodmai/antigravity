# e2e/ — script-уровень E2E (Greenfield + Lit/Chipotle DRM, без браузера)

Сквозные сценарии DRM-платформы на уровне скриптов: шифрование/гейтинг через Lit
Protocol (Chipotle TEE) и хранение в BNB Greenfield. Браузера нет — чистый Node + docker.

Скрипты живут в **`smartcontracts/e2e/`** и **`run_e2e_lit.sh`** в корне:

| Скрипт | Что гоняет |
|--------|-----------|
| `smartcontracts/e2e/run-e2e.mjs` | Flow C на реальном Greenfield testnet (нужен ключ) |
| `run_e2e_lit.sh` | Полный локальный Lit-стек (chipotle + dstack-sim + anvil + greenfield-local) |
| `smartcontracts/e2e/run-e2e-lit.mjs`, `run-e2e-lit-nft.mjs` | Lit-гейтинг по NFT/ACC |

## Локальный запуск
```sh
# Локальный Lit-стек (собирает chipotle/dstack из исходников — долго, Rust):
./run_e2e_lit.sh

# Greenfield testnet Flow C (нужны секреты):
GREENFIELD_TESTNET_PRIVATE_KEY=0x... node smartcontracts/e2e/run-e2e.mjs
```

## CI
- **`E2E Lit Protocol Gating Integration`** — собирает внешние репо
  (`LIT-Protocol/chipotle@next`, `Dstack-TEE/dstack`), гоняет `run_e2e_lit.sh`.
- **`Real Chipotle TEE Integration (docker)`** — поднимает реальный chipotle-стек, healthcheck.
- **`Devnet E2E (Flow C, Real networks)`** — `run-e2e.mjs` (скипается без `GREENFIELD_TESTNET_PRIVATE_KEY`).

Гейт: `workflow_dispatch` + `schedule` (+ `pull_request` для Lit).

> [!WARNING]
> Тяжёлые джобы со сборкой внешних Rust-репо. Историческая флака — контейнер
> `chipotle-bootstrap` падал `exit 1` из-за нестабильной загрузки foundryup внутри
> него (тот же баг, что в шагах Install Foundry); закрыто ретраем `foundryup -i v1.7.1`
> в `command` сервиса (docker-compose.yml / docker-compose.lit.yml). `run_e2e_lit.sh`
> при падении `docker compose up` дампит `compose ps -a` + логи, чтобы причина была видна.
> Зависимость от Greenfield testnet SP sealing (~280с) тоже добавляет нестабильности.
> Подробности — `skills/bughunter/SKILL.md` BUG-021, память `ci-foundry-flake`.
