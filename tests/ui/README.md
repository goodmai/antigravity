# ui/ — браузерный E2E (Playwright + Synpress + реальный MetaMask)

Самый верх пирамиды: реальный браузер с **реальным расширением MetaMask 13.24.0**,
который драйвится по CDP против полного локального стека (Anvil + фронтенд +
chipotle-mock). Проверяет полный пользовательский путь курсовой платформы.

Тесты живут в **`smartcontracts/e2e-synpress/specs/`** (а не в этой папке — здесь
только документация слоя):

| Файл | Сценарий | Персона |
|------|----------|---------|
| `01-connect-network.spec.ts` | Загрузка demo-страницы, `wallet_addEthereumChain` (chain 31337 / symbol ETH) | — |
| `02-register-course.spec.ts` | Подключение кошелька, роль `Author`, регистрация курса | Alice (anvil #1) |
| `03-buy-course.spec.ts` | Покупка курса, минт AccessPass NFT | Bob (anvil #2) |
| `04-access-matrix.spec.ts` | Матрица доступа: Author ✓ / Client ✓ / Eve ✗ | все три |
| `05-withdraw.spec.ts` | Pull-withdraw выручки автором | Alice |

**Статус: 12/12 PASS** локально и в CI (2026-06-08, прогон полностью зелёный).

---

## Локальный запуск

> [!IMPORTANT]
> Это **headed**-прогон (нужен дисплей или `xvfb`). Synpress 0.0.14 написан под
> MetaMask 13.13.1; под 13.24.0 (LavaMoat scuttling) селекторы/флоу переопределены
> через сырой CDP — см. `specs/synpress.ts` и навык `metamask-devtools`.

### 0. Предпосылки (один раз)
- **Chrome-for-Testing 130** — Chrome 137+ блокирует `--load-extension`, поэтому
  системный Chrome не годится. Поставить: `npx @puppeteer/browsers install chrome@130`
  → путь в `CHROME_BIN`.
- **MetaMask 13.24.0** распакованный — каталог в `METAMASK_EXT_PATH`
  (релизный zip `metamask-chrome-13.24.0.zip` с GitHub MetaMask, либо локальная сборка).
- `pnpm` (v11), `xvfb` (для headless-машин).

### 1. Поднять локальный стек
```sh
cd smartcontracts
docker compose --profile local-full up -d anvil frontend chipotle-mock deploy
docker wait daskibo-deploy        # дождаться детерминированного деплоя
```
Сервисы: **Anvil → :9545 (chainId 31337)**, **фронтенд → :8085**, **chipotle-mock → :8000**.
Для чистого stateful-прогона (02 register → 03 buy → 05 withdraw) пересоздать Anvil
с нуля: `docker compose --profile local-full up -d --force-recreate anvil deploy`.

> Demo-страница читает `smartcontracts/demo/addresses.json` (gitignored; локально
> пишется demo-deploy). Если его нет — `#net-line` пустой и тесты падают на «Could
> not reach the demo chain». В CI он генерится из логов деплоя.

### 2. Поставить зависимости и пропатчить Synpress
```sh
cd smartcontracts/e2e-synpress
pnpm install --frozen-lockfile
node patch-synpress.mjs            # правит node_modules под локальный MM + CfT130
```

### 3. Собрать кэш кошелька и прогнать спеки
```sh
export CHROME_BIN=/path/to/chrome-for-testing-130/.../chrome
export METAMASK_EXT_PATH=/path/to/metamask-chrome-13.24.0
xvfb-run -a node build-cache.mjs --force     # importWallet → onboarding → addNetwork → 3 аккаунта
xvfb-run -a npx playwright test --reporter=line --timeout=70000 --global-timeout=900000
```
Кэш профиля привязан к extension id, поэтому **строится заново** (не коммитится).

> [!WARNING]
> Если Anvil/фронтенд падают посреди прогона — сюита **виснет** на global-timeout
> (каждый RPC стопорится, без ошибки). Перед запуском проверяй `docker compose ps`.
> Не гони вывод через `| grep` — пайп буферизует и прячет прогресс; пиши в файл.

---

## CI

Джоб **`ui-e2e-synpress`** в [`.github/workflows/test.yml`](../../.github/workflows/test.yml),
имя `Full UI E2E (Synpress + MetaMask, docker local-full)`. Гейт как у остальных
тяжёлых docker-джоб: `workflow_dispatch` + `schedule` + `pull_request`.

Раннер пересобирает всё, чего нет в репо, в таком порядке:
1. Foundry (ручная установка с ретраем, `FOUNDRY_DIR` под XDG) + `forge install` зависимостей.
2. `docker compose --profile local-full up` (Anvil + deploy + frontend + chipotle-mock), ожидание эндпойнтов.
3. **Генерация `demo/addresses.json`** из логов деплоя (rpcUrl `127.0.0.1:9545`).
4. MetaMask 13.24.0 (релизный zip) → `METAMASK_EXT_PATH`; Chrome-for-Testing 130 (`@puppeteer/browsers`) → `CHROME_BIN`.
5. `pnpm install` + `node patch-synpress.mjs`.
6. `xvfb-run node build-cache.mjs --force` → `xvfb-run npx playwright test`.

Артефакт **`synpress-ui-report`** (playwright-report + test-results, 7 дней) грузится
всегда; при падении ещё дампятся логи стека. Диагностика прошлых падений — скриншоты
страницы в артефакте (трейсов нет, только video/screenshot).

Глубже: навык `metamask-devtools`, RCA-реестр `skills/bughunter/SKILL.md`
(BUG-016…021), память `ui-e2e-ci-workflow` / `synpress-chrome148-block` / `ci-foundry-flake`.
