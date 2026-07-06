# integration/ — Docker-уровень (vitest против реальных сервисов)

Тесты, которым нужны живые Docker-сервисы (Anvil, фронтенд, mock-SP, Greenfield-local),
но без браузера. Поднимают стек через `docker compose up` в `beforeAll` и бьют по
нему JSON-RPC / HTTP.

Файлы живут в корневом **`tests/`** по паттерну **`*.docker.test.js`** (в этой папке —
только документация слоя):

| Файл | Что проверяет |
|------|---------------|
| `tests/contracts.docker.test.js` | Деплой контрактов на Anvil, базовые вызовы |
| `tests/greenfield-local.docker.test.js` | Локальный Greenfield-стек |
| `tests/greenfield-integration.docker.test.js` | Сеть Greenfield: бакеты/объекты против compose |

## Локальный запуск
```sh
npm run test:integration      # = vitest run docker.test.js
```
Нужен запущенный Docker. Тесты сами поднимают/гасят нужные сервисы из
`smartcontracts/docker-compose.yml`.

## CI
Джоб **`Integration (Docker) Tests`** в [`.github/workflows/test.yml`](../../.github/workflows/test.yml):
`npm install` → `npm run test:integration`.

> [!NOTE]
> Эти тесты **исключены** из юнит-джоба `test` (`test:coverage` гонит
> `--exclude '**/*.docker.test.js'`): они тянут образы и иногда флакают на таймауте
> Docker Hub (`registry-1.docker.io: context deadline exceeded`) — юнит-слою docker
> не нужен. Запускаются только здесь.
