# Lab 11 — SonarQube + Quality Gate в PR

> Модуль 4 · 2 ч · Sandbox: docker-compose · DSOMM: *Implementation — Static analysis*

## Задача

Поднять SonarQube в docker-compose, подключить к репо, настроить PR-декорацию,
сломать Quality Gate в фейковом PR.

## Шаги

1. `docker-compose.yml` с SonarQube + Postgres (см. lesson 4.1).
2. Открыть http://localhost:9000, admin/admin → сгенерить token.
3. Подключить через GH Actions:
   ```yaml
   - uses: SonarSource/sonarqube-scan-action@SHA
     env: { SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}, SONAR_HOST_URL: ... }
   ```
4. `sonar-project.properties` (см. lesson 4.1).
5. Создать PR, который внесёт `Bug` (например, `if (x == NaN)` в JS) и
   увидеть QG fail в PR.

## Acceptance

- [ ] Sonar Way QG активен.
- [ ] PR-декорация (комментарий с ссылкой на issues) появляется.
- [ ] QG fail блокирует merge (required check).

## Rubric: 1 — Sonar поднят; 2 — анализ репо прошёл; 3 — PR-декорация; 4 — required check; 5 — кастомный QG `Daskibo Way` (80% coverage on new code + 0 critical bugs).
