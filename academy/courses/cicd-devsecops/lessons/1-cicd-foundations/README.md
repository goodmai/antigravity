# Module 1 — CI/CD Foundations

> Анатомия пайплайна, git-флоу, hooks (клиент + сервер), GH Actions глубоко,
> self-hosted runners на k8s.

---

## 1.1 · Анатомия пайплайна

**Канон:** [GH Actions docs](https://docs.github.com/actions), [GitLab CI/CD reference](https://docs.gitlab.com/ee/ci/),
[Tekton concepts](https://tekton.dev/docs/concepts/), [Dagger](https://docs.dagger.io).

Любой пайплайн — это **DAG** из job-узлов с тремя свойствами:

1. **Idempotency** — повторный запуск даёт тот же результат.
2. **Hermeticity** — никаких неявных зависимостей от окружения (нет «работает на моей машине»).
3. **Cacheable** — кэширование между запусками детерминировано.

**Стадии «по умолчанию»** для backend-сервиса:

```
lint → unit-tests → SAST → build → SBOM → SCA → image-scan → sign → push → e2e → deploy(staging) → smoke → deploy(prod)
```

**Что важно — fan-in / fan-out:**

- *Fan-out*: matrix-сборка под `linux/amd64`, `linux/arm64`, `darwin/arm64`.
- *Fan-in*: финальная job ждёт все matrix-результаты, склеивает provenance.

### Минимальный «правильный» GH Actions workflow

```yaml
name: ci
on:
  pull_request:
  push: { branches: [main] }

permissions:
  contents: read           # least privilege по умолчанию

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true # отменяем устаревшие запуски

jobs:
  lint:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@692973e3d937129bcbf40652eb9f2f61becf3332 # v4.1.7  ← pinned by SHA, не tag!
      - uses: actions/setup-node@1e60f620b9541d16bece96c5465dc8ee9832be0b # v4.0.3
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npm run lint
```

**3 типичные ошибки в этом workflow, которые встречаются у 90% команд:**

1. `actions/checkout@v4` (по тегу) — атакующий перепишет тег ⇒ supply chain.
   **Фикс:** pin by full commit SHA + комментарий с версией.
2. Дефолтный `GITHUB_TOKEN` имеет `write` — даёт лишние права.
   **Фикс:** `permissions: contents: read` сверху.
3. Нет `concurrency` — параллельные запуски на одной ветке гоняют CI вхолостую.

---

## 1.2 · Git workflows

**Канон:** [trunk-based development](https://trunkbaseddevelopment.com),
[GitFlow original](https://nvie.com/posts/a-successful-git-branching-model/),
[GitHub flow](https://docs.github.com/en/get-started/quickstart/github-flow).

Сравнение:

| | Trunk-based | GitFlow | GitHub flow |
|---|---|---|---|
| Долгие ветки | ❌ < 1 дня | ✅ release/* | ❌ |
| Подходит для | continuous deploy | shrink-wrap (1 релиз в N недель) | continuous delivery |
| Сложность | низкая | высокая | средняя |

**Trunk-based + feature flags** — стандарт для DORA Elite. Поэтому в курсе по
умолчанию используем именно его.

**Protected branches** (минимум):

- require PR review (≥ 1 approver, CODEOWNERS-driven),
- require signed commits (gitsign/GPG),
- require status checks: `lint`, `test`, `sonar`, `trivy`,
- require linear history,
- block force-push на `main`,
- include administrators (без исключений).

**CODEOWNERS** (`.github/CODEOWNERS`):

```
*.tf            @platform/infra
charts/         @platform/k8s
.github/        @security/devsecops    # workflow меняет только sec-team
infra/secrets/  @security/devsecops
```

---

## 1.3 · Git hooks: client + server

**Канон:** [Pro Git book — Git Hooks](https://git-scm.com/book/en/v2/Customizing-Git-Git-Hooks),
[husky](https://typicode.github.io/husky/), [lefthook](https://lefthook.dev),
[pre-commit framework](https://pre-commit.com),
[Conventional Commits](https://www.conventionalcommits.org).

**Клиентские hooks** — для DX и быстрого фидбэка (но **никогда** не для security,
их можно отключить `--no-verify`).

**Серверные hooks** (на GH/GitLab — через protected branches + status checks; на
своём Gitea/GitLab — через `pre-receive`) — **обязательные**, их обойти нельзя.

### Клиент: husky + lint-staged + commitlint

```jsonc
// package.json
{
  "scripts": { "prepare": "husky" },
  "lint-staged": {
    "*.{js,ts}": ["eslint --fix", "prettier --write"],
    "*.{md,yaml,yml}": ["prettier --write"]
  },
  "commitlint": { "extends": ["@commitlint/config-conventional"] }
}
```

```bash
# .husky/pre-commit
npx lint-staged

# .husky/commit-msg
npx --no -- commitlint --edit "$1"
```

**Conventional Commits** (`feat:`, `fix:`, `chore:`, `refactor:`, `BREAKING CHANGE:`)
позже автоматически даст вам **semver** через `semantic-release`.

### Альтернатива: lefthook (один YAML, без npm-зоопарка)

```yaml
# lefthook.yml
pre-commit:
  parallel: true
  commands:
    eslint:
      glob: "*.{js,ts}"
      run: npx eslint {staged_files}
    prettier:
      glob: "*.{md,yaml,yml}"
      run: npx prettier --check {staged_files}
    gitleaks:
      run: gitleaks protect --staged --verbose --redact
```

**Важно:** `gitleaks` в `pre-commit` — это **удобство**, а не защита. Реальная
защита — `gitleaks` в **CI** (потому что `--no-verify` отключает локальный hook).

### Сервер: GH protected branches + required checks

На GitHub серверные «hooks» — это **required status checks** в protected branches.
Их обойти нельзя даже админу (если включено «include administrators»).

На self-hosted (Gitea/Forgejo/GitLab CE) — стандартные `pre-receive` / `update`
hooks:

```bash
#!/bin/bash
# .git/hooks/pre-receive — блокируем коммиты без подписи
while read oldrev newrev refname; do
  for commit in $(git rev-list "$oldrev..$newrev"); do
    if ! git verify-commit "$commit" 2>/dev/null; then
      echo "✗ commit $commit not signed; push rejected"
      exit 1
    fi
  done
done
```

**Лаба 02** — husky + commitlint + lint-staged + gitleaks локально, и тот же
gitleaks как required check в PR.

---

## 1.4 · GitHub Actions глубоко

**Канон:** [actions/toolkit](https://github.com/actions/toolkit),
[Workflow syntax](https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions),
[OIDC in Actions](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/about-security-hardening-with-openid-connect),
[Reusable workflows](https://docs.github.com/en/actions/using-workflows/reusing-workflows).

**Что должно быть в каждом «взрослом» репо:**

1. **Reusable workflows** (`.github/workflows/_*.yml` + `workflow_call`) — DRY.
2. **OIDC → cloud**, никаких `AWS_ACCESS_KEY_ID` в secrets.
3. **Environments** с `required reviewers` и `wait timer` для prod.
4. **Composite actions** или **JavaScript actions** под общие шаги.
5. **Matrix + `include`/`exclude`** для платформ.
6. **`actions/cache@SHA`** с правильным ключом (хеш lock-файла).

### Reusable workflow

```yaml
# .github/workflows/_build.yml
on:
  workflow_call:
    inputs:
      arch: { required: true, type: string }
    secrets:
      registry-token: { required: true }

jobs:
  build:
    runs-on: ubuntu-24.04
    steps: [ ... ]
```

```yaml
# .github/workflows/ci.yml
jobs:
  build-amd64:
    uses: ./.github/workflows/_build.yml
    with: { arch: amd64 }
    secrets:
      registry-token: ${{ secrets.GHCR_TOKEN }}
```

### OIDC → AWS (никаких static keys)

```yaml
permissions:
  id-token: write
  contents: read

steps:
  - uses: aws-actions/configure-aws-credentials@SHA
    with:
      role-to-assume: arn:aws:iam::123:role/gh-actions-ci
      aws-region: eu-west-1
```

Зеркальная настройка в IAM: trust policy на `repo:owner/repo:ref:refs/heads/main`.
Подробно — в Module 8.

---

## 1.5 · Runners: hosted vs self-hosted, ARC

**Канон:** [actions/runner-controller (ARC)](https://github.com/actions/actions-runner-controller),
[Choosing the runner for a job](https://docs.github.com/en/actions/using-jobs/choosing-the-runner-for-a-job),
[GitHub-hosted larger runners](https://docs.github.com/en/actions/using-github-hosted-runners/about-larger-runners).

**Когда self-hosted:**

- macOS-сборка (iOS) — GitHub macOS-раннеры дороги и медленные.
- Доступ к private network (БД, VPN).
- ARM/GPU-сборка.
- Жёсткие SLA на queue time.

**Когда **не** self-hosted:**

- Public repo (security: атакующий из PR может выполнить код на вашем железе).
  Только **ephemeral** runners с per-job изоляцией, или **`pull_request_target`**
  без чек-аутов untrusted-кода.

### ARC: ephemeral runners в k8s

```yaml
# AutoScalingRunnerSet (ARC v2)
apiVersion: actions.github.com/v1alpha1
kind: AutoscalingRunnerSet
metadata:
  name: ubuntu-ephemeral
spec:
  githubConfigUrl: https://github.com/your-org
  githubConfigSecret: gh-app-secret
  maxRunners: 50
  minRunners: 1
  template:
    spec:
      containers:
        - name: runner
          image: ghcr.io/actions/actions-runner:latest
          # каждый pod — один job, потом self-destruct
```

**Преимущества:** изоляция, autoscale, мониторинг через Prometheus,
никаких «грязных» состояний от прошлых job'ов.

**Лаба 03** — ARC на k3d, очередь job'ов масштабируется автоматически.

---

## Чек-лист модуля

- [ ] В моём workflow все `uses:` запинены по SHA.
- [ ] `permissions:` явный и минимальный.
- [ ] Есть `concurrency` group, чтобы не гонять CI вхолостую.
- [ ] Husky/lefthook + commitlint + gitleaks локально.
- [ ] `gitleaks` дублируется в CI как required check (потому что `--no-verify`).
- [ ] Protected branches с CODEOWNERS и required checks.
- [ ] OIDC → AWS/Azure/GCP, без long-lived ключей в secrets.
- [ ] Понимаю, когда нужен self-hosted, и держу его **ephemeral**.

## Лабы модуля

- [Lab 01 — Hello-Pipeline](../../labs/01-hello-pipeline/)
- [Lab 02 — husky + commitlint + gitleaks](../../labs/02-hooks/)
- [Lab 03 — ARC на k3d](../../labs/03-arc/)
