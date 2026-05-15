# Lab 03 — Actions Runner Controller (ARC) на k3d

> Модуль 1 · 2 ч · Sandbox: k3d · DSOMM: *Build — Isolated build environment*

## Задача

Поднять [actions-runner-controller v2](https://github.com/actions/actions-runner-controller)
на k3d-кластере, чтобы ephemeral runner'ы автомасштабировались под очередь
job'ов.

## Шаги

1. **Создать k3d-кластер**:
   ```bash
   k3d cluster create arc --agents 2
   ```
2. **Создать GitHub App** (Settings → Developer settings → GitHub Apps):
   - Permissions: Administration: Read & write, Actions: Read.
   - Установить App на org/repo.
   - Создать private key (PEM) и app-id.
3. **Установить ARC**:
   ```bash
   helm install arc oci://ghcr.io/actions/actions-runner-controller-charts/gha-runner-scale-set-controller \
     -n arc-system --create-namespace
   ```
4. **Создать AutoscalingRunnerSet**:
   ```yaml
   apiVersion: actions.github.com/v1alpha1
   kind: AutoscalingRunnerSet
   metadata: { name: ubuntu-eph }
   spec:
     githubConfigUrl: https://github.com/<your-org>
     githubConfigSecret: gh-app
     maxRunners: 5
     minRunners: 0
     template:
       spec:
         containers:
           - { name: runner, image: ghcr.io/actions/actions-runner:latest }
   ```
5. Запустить workflow в репо с `runs-on: ubuntu-eph` — увидеть, как scale-up
   произошёл, job выполнился, pod ушёл в `Completed`.

## Acceptance

- [ ] При 0 job'ов в очереди — 0 pod'ов.
- [ ] При 3-х параллельных — 3 pod'а.
- [ ] Pod self-destruct после завершения job.
- [ ] `kubectl logs` показывает single-job lifecycle.

## Rubric: 1 — runner поднялся; 2 — autoscale работает; 3 — ephemeral confirmed; 4 — мониторим через Prometheus; 5 — multi-arch (amd64+arm64) через таргетированные пулы.
