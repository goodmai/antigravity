# Lab 02 — husky + commitlint + lint-staged + gitleaks

> Модуль 1 · 1 ч · Sandbox: local · DSOMM: *Implementation — Pre-commit checks*

## Задача

Настроить клиентские git-hooks (быстрый фидбэк) + продублировать **gitleaks**
в CI как required check (потому что `--no-verify` отключает локальный).

## Шаги

1. `npm i -D husky lint-staged @commitlint/cli @commitlint/config-conventional`
2. `npx husky init` → создаст `.husky/pre-commit`.
3. Настроить `package.json`:
   ```jsonc
   {
     "scripts": { "prepare": "husky" },
     "lint-staged": {
       "*.{js,ts}": ["eslint --fix", "prettier --write"],
       "*.{md,yaml,yml,json}": ["prettier --write"]
     },
     "commitlint": { "extends": ["@commitlint/config-conventional"] }
   }
   ```
4. `.husky/pre-commit`:
   ```bash
   npx lint-staged
   gitleaks protect --staged --verbose --redact
   ```
5. `.husky/commit-msg`:
   ```bash
   npx --no -- commitlint --edit "$1"
   ```
6. Добавить `gitleaks` в CI как required check:
   ```yaml
   - uses: gitleaks/gitleaks-action@SHA
     env: { GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }} }
   ```

## Acceptance

- [ ] Локально `git commit -m "wip"` падает (не conventional).
- [ ] Локально подложенный фейковый AWS-ключ в файле падает на pre-commit.
- [ ] `git commit --no-verify` обходит локально, **но падает в CI**.
- [ ] Conventional Commit формат → `semantic-release` подцепится (бонус).

## Rubric: 1 — hook есть; 2 — все три; 3 — CI duplicate gitleaks; 4 — Conv. Commit + release; 5 — secret rotated через Vault при ложной утечке (training).
