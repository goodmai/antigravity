# integration/

Docker-уровень. Тесты запускаются против реальных Docker-сервисов (без браузера).

Тесты живут в `smartcontracts/integration/` на ветке `claude/greenfield-smartcontracts-setup-2HS95`.

```sh
# Запуск
npm run test:integration
# CI джоб: "Integration (Docker) Tests" в .github/workflows/test.yml
```

Паттерн файлов: `**/*.docker.test.js`
