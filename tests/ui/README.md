# ui/

Браузерный E2E. Playwright + Synpress + MetaMask 13.24.0 (реальный extension).

Тесты живут в `smartcontracts/e2e-synpress/specs/`:

| Файл | Сценарий |
|------|----------|
| `01-connect-network.spec.ts` | Подключение MetaMask, проверка chain ID |
| `02-register-course.spec.ts` | Регистрация курса автором |
| `03-buy-course.spec.ts` | Покупка курса, AccessPass NFT |
| `04-access-matrix.spec.ts` | Матрица доступа: Author / Client / Eve |
| `05-withdraw.spec.ts` | Pull-withdraw автором |

```sh
# Быстрый запуск (требует local-full stack + MetaMask + Chrome 130)
cd smartcontracts/e2e-synpress
xvfb-run -a npx playwright test --reporter=line

# CI джоб: "Full UI E2E (Synpress + MetaMask, docker local-full)"
# Результат последнего прогона: 12/12 PASS (2026-06-07)
```

Артефакты загружаются как `synpress-ui-report` (playwright-report + traces, 7 дней).
