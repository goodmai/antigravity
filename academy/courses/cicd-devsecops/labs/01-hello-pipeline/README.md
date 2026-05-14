# Lab 01 — Hello-Pipeline в GH Actions

> Модуль 1 · 1 ч · Sandbox: `act` (локальный runner) · DSOMM: *Build — Defined build process*

## Задача

Создать минимальный, но **правильный** GH Actions workflow с:

- pinned actions (SHA, не tag),
- least-privilege `permissions`,
- `concurrency`-group,
- matrix-сборкой под 3 OS.

И прогнать его **локально** через [act](https://github.com/nektos/act) перед
тем как пушить в GitHub.

## Шаги

### 1. Стартовый workflow

```yaml
# .github/workflows/ci.yml
name: ci

on:
  push:    { branches: [main] }
  pull_request:

permissions:
  contents: read

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  test:
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-24.04, macos-14, windows-2022]
        node: ['20', '22']
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@692973e3d937129bcbf40652eb9f2f61becf3332 # v4.1.7
      - uses: actions/setup-node@1e60f620b9541d16bece96c5465dc8ee9832be0b # v4.0.3
        with:
          node-version: ${{ matrix.node }}
          cache: npm
      - run: npm ci
      - run: npm test
```

### 2. Локальный прогон с act

```bash
# Установка
brew install act                                # macOS
# или
curl -s https://raw.githubusercontent.com/nektos/act/master/install.sh | bash

# Прогон
act -j test --matrix os:ubuntu-24.04 --matrix node:20
```

### 3. Запинить остальные actions через `pin-github-action`

```bash
npx pin-github-action .github/workflows/ci.yml
```

Утилита найдёт все `@v1`/`@v2` и заменит на полный SHA + комментарий с
оригинальной версией.

### 4. Добавить Renovate-конфиг для авто-обновления pin'ов

```json5
// renovate.json (минимум)
{
  "extends": ["config:recommended", "helpers:pinGitHubActionDigests"]
}
```

## Acceptance

- [ ] Все `uses:` запинены полным commit SHA.
- [ ] `permissions:` минимальный, default — `contents: read`.
- [ ] `concurrency:` группа per-ref + `cancel-in-progress: true`.
- [ ] Matrix-сборка прошла локально через `act` хотя бы на одной комбинации.
- [ ] Renovate добавлен.
- [ ] Workflow на GH зелёный.

## Sandbox

`sandbox.md`:

```bash
docker run --rm -v $PWD:/work -w /work catthehacker/ubuntu:act-latest \
  bash -c "npm ci && npm test"
```

(имитация runner'а без act, если act не ставится).

## Rubric

| Балл | Условие |
|---|---|
| 1 | workflow пайплайн зелёный |
| 2 | pinned by SHA |
| 3 | + least-privilege permissions |
| 4 | + concurrency + matrix локально через act |
| 5 | + Renovate автоматизирует bump'ы pin'ов |
