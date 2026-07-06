# Test Map — файлы, слои, как дописывать (Daskibo / Antigravity)

Содержание:
- 1. Карта слоёв и файлов
- 2. Как добавить/актуализировать тест по слою
- 3. Naming conventions (как слой определяется автоматически)
- 4. Devnet/testnet: окружение и нативка
- 5. Привязка к use-cases и багам

---

## 1. Карта слоёв и файлов

| Слой | Команда (целевая) | Где лежит | Инфра |
| :-- | :-- | :-- | :-- |
| Unit | `npm run test:unit` | `tests/*.test.js` (кроме `*.docker.*`/`*.live.*`) | — |
| Typecheck | `npm run typecheck` | `tsconfig.json` | — |
| No-any | `npm run lint:noany` | `scripts/check-no-any.sh` | — |
| Contracts | `forge test -vvv` (`smartcontracts/contracts`) | `*.t.sol` (AccessPass, CourseMarketplace, Treasury, AuthorNft, ClientNft) | Foundry |
| Integration/docker | `npm run test:integration` | `tests/*.docker.test.js` | Docker |
| Live | `npm run test:live` *(добавить, см. workflow_cicd.md Фаза 1)* | `tests/*.live.test.js` | testnet + ключи |
| E2E Flow B (local) | `./run_e2e_lit.sh` | `smartcontracts/e2e/run-e2e-lit-nft.mjs` | Docker + dstack/chipotle |
| E2E Flow C (real) | `node smartcontracts/e2e/run-e2e.mjs` | `smartcontracts/e2e/run-e2e.mjs` | testnet + ключи |

Текущие unit-файлы (срез): `crypto-envelope`, `lit-acc`, `lit-access`, `lit-pricing`,
`lit-base-nft`, `sdk-adapters.shape`, `greenfield-buckets`, `greenfield-sp`,
`greenfield-sdk-tx`, `greenfield-wallet-*`, `course-*`, `chipotle-drm`, `web3*`, `index-csp`.
Docker: `contracts.docker`, `greenfield-integration.docker`, `greenfield-local.docker`.
Live: `e2e-course-flow.live`, `greenfield-testnet.live`.

Источник правды по схеме/гейтам/планам — [workflow_cicd.md](../../../spec/workflow_cicd.md).

---

## 2. Как добавить/актуализировать тест по слою

### Unit (vitest + jsdom)
- Новый JS-модуль в `smartcontracts/buckets/` → тест `tests/<module>.test.js`.
- Сеть и SDK — мокать (`vi.mock`, `vi.fn`). Никаких реальных RPC/SP.
- Шаблон assertion'ов брать у соседних файлов (`greenfield-buckets.test.js`).

### Contracts (forge)
- `smartcontracts/contracts/test/<Name>.t.sol`, `forge-std/Test.sol`.
- Покрывать инварианты из `SPEC.md`/`AUDIT.md`: split-платежи (bps, сумма ≤ 100%),
  soulbound-реверты, `hasCourseAccess` (true для автора и активной подписки, false до
  покупки/после expiry), Ownable2Step, reentrancy на `withdraw`.
- После изменения газа — обновить `.gas-snapshot` (`forge snapshot`).

### Integration / docker
- `tests/<area>.docker.test.js`. Обязательно self-skip без Docker:
  ```js
  function dockerAvailable(){ try{ execSync('docker compose version',{stdio:'ignore'});
    execSync('docker info',{stdio:'ignore'}); return true;}catch{return false;} }
  const d = dockerAvailable() ? describe : describe.skip;
  ```
- `beforeAll` → `compose(['up','-d','--wait'])`; `afterAll` → `compose(['down','-v'])`.
- Использовать `docker-compose.yml` (Flow A, mock SP) — быстро и без средств.

### Live / devnet-testnet
- `tests/<area>.live.test.js` **или** расширять `run-e2e.mjs` (Flow C).
- Гейт по ключу — НЕ падать без него:
  ```js
  const RUN = !!process.env.GREENFIELD_TESTNET_PRIVATE_KEY;
  (RUN ? describe : describe.skip)('live: ...', () => { /* ... */ });
  ```
- Эталон проверок доступа (положит./отриц.) — см. чек-лист в
  [lit-crosschain.md](../../greenfield/references/lit-crosschain.md) («Минимальные проверки»).

### E2E Flow B (стек)
- Менять сам сценарий — в `run-e2e-lit-nft.mjs` (он bind-mounted, можно итерировать без
  пересборки образа). Валидировать ТОЛЬКО из чистого genesis (`run_e2e_lit.sh` делает
  `down -v`); seal асинхронен (~100 с) → читать через `readObjectWithRetry`.

---

## 3. Naming conventions (как слой определяется)

`test:unit` исключает по суффиксам, поэтому суффикс файла = его слой:
- `*.docker.test.js` → integration (Docker), исключён из unit.
- `*.live.test.js` → live/testnet, исключён из unit.
- `*.test.js` (без спец-суффикса) → unit.
- `*.t.sol` → forge.

Соблюдать суффиксы строго: неверный суффикс утащит дорогой тест в быстрый unit-прогон
(или наоборот спрячет его).

---

## 4. Devnet/testnet: окружение и нативка

Live/devnet слои тратят **реальную нативку** — запускать осознанно. Полная матрица
(какая сеть, какой токен, откуда брать) — [uc.md → Funding Matrix](../../../spec/uc.md).
Кратко: BSC testnet **tBNB** (деплой/покупка) + Greenfield testnet **tBNB** (storage);
DRM — **Chipotle (Lit v3)** REST (старые `datil*` отключены 2026-02-25). Env:

```bash
export GREENFIELD_TESTNET_PRIVATE_KEY=0x...
export GREENFIELD_TESTNET_ADDRESS=0x...
export GREENFIELD_RPC=https://gnfd-testnet-fullnode-tendermint-us.bnbchain.org
export GREENFIELD_SP=https://gnfd-testnet-sp1.bnbchain.org
export GREENFIELD_CHAIN_ID=5600
export CHIPOTLE_URL=http://localhost:8000   # mock; или Chipotle dev: https://api.dev.litprotocol.com
```

Режимы и Compose-карта — [deploy-modes.md](../../greenfield/references/deploy-modes.md).

---

## 5. Привязка к use-cases и багам

- Сценарии доступа (кто и когда decrypt'ит) — [uc.md](../../../spec/uc.md) UC-03..UC-13.
- Каждый `BUG-00x` из [bughunter](../../bughunter/SKILL.md) при фиксе должен получить
  регрессионный тест (unit или forge), помеченный ID бага в названии/комментарии —
  чтобы баг не вернулся. Перед отладкой нового сбоя сверяться с реестром RCA.
