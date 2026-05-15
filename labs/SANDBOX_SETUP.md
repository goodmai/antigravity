# 🧪 Песочницы GitHub: единая шпаргалка для всех лаб

Все лабораторные работы Академии выполняются в **облачных песочницах** —
средах разработки, которые запускаются из браузера прямо поверх GitHub-репозитория.
Не нужно ничего ставить локально: открыл ссылку — и через минуту у тебя
полноценный Linux-терминал, редактор и предпросмотр приложения.

Этот документ — общий «движок» для всех лаб. Каждая лаба ссылается сюда
в разделе **«Песочница»** и добавляет только специфику своей темы.

---

## Матрица платформ

| Платформа | Бесплатно | Персистентность | Старт | Лучше всего для |
|-----------|-----------|-----------------|-------|-----------------|
| **GitHub Codespaces** | 60 ч/мес | ✓ постоянная | ~60 с | Командная работа, PR, бэкенд, Docker |
| **Gitpod** | ~50 ч/мес | ✗ эфемерная | ~30 с | Быстрые эксперименты, воспроизводимость |
| **Google Cloud Shell** | без лимита | `$HOME` ~5 ГБ | ~5 с | GCP, Firebase, Terraform, скрипты |
| **StackBlitz** | без лимита | ✓ (аккаунт) | ~3 с | Фронтенд, Node, мгновенный preview |
| **CodeSandbox** | щедрый free | ✓ (аккаунт) | ~5 с | React/Next, шаринг, devbox |
| **Replit** | ограничено | ✓ постоянная | ~10 с | Прототипы, обучение, шаринг |
| **github.dev** | без лимита | ✗ (только редактор) | ~2 с | Быстрая правка кода, ревью, без терминала |

> Нажми `.` (точку) в любом GitHub-репозитории — откроется **github.dev**,
> лёгкий VS Code в браузере без терминала. Идеально для лаб, где нужно
> только читать/править файлы.

---

## Быстрый запуск (one-click)

Подставь свой репозиторий вместо `goodmai/antigravity`.

```text
GitHub Codespaces  →  https://github.com/goodmai/antigravity  →  Code ▾ → Codespaces → Create
Gitpod             →  https://gitpod.io/#https://github.com/goodmai/antigravity
Cloud Shell        →  https://shell.cloud.google.com  (затем git clone)
StackBlitz         →  https://stackblitz.com/github/goodmai/antigravity
CodeSandbox        →  https://codesandbox.io/p/github/goodmai/antigravity
Replit             →  replit.com → Create Repl → Import from GitHub
github.dev         →  открой репозиторий и нажми клавишу «.»
```

---

## Универсальный bootstrap-скрипт

Работает в Codespaces, Gitpod и Cloud Shell. Определяет платформу и
доустанавливает то, чего не хватает.

```bash
#!/bin/bash
# scripts/sandbox-bootstrap.sh — единый вход для всех лаб
set -e

if   [ -n "$CODESPACE_NAME" ];        then PLATFORM=codespaces
elif [ -n "$GITPOD_WORKSPACE_ID" ];   then PLATFORM=gitpod
elif [ -n "$CLOUD_SHELL" ];           then PLATFORM=cloudshell
else                                       PLATFORM=local
fi
echo "Platform: $PLATFORM"

command -v pandoc >/dev/null || sudo apt-get install -y -qq pandoc 2>/dev/null || true
command -v node   >/dev/null || { curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs; }
command -v gemini >/dev/null || npm install -g @google/gemini-cli

# Сборка академии (если есть)
[ -f scripts/convert_lessons.py ] && python3 scripts/convert_lessons.py || true

echo "Bootstrap done. Запусти превью:  python3 -m http.server 8080"
```

---

## devcontainer для Codespaces

```json
// .devcontainer/devcontainer.json
{
  "name": "Antigravity Lab",
  "image": "mcr.microsoft.com/devcontainers/python:3.12",
  "features": { "ghcr.io/devcontainers/features/github-cli:1": {} },
  "postCreateCommand": "bash scripts/sandbox-bootstrap.sh",
  "customizations": {
    "vscode": {
      "extensions": ["ms-python.python", "yzhang.markdown-all-in-one", "esbenp.prettier-vscode"]
    }
  },
  "forwardPorts": [8080],
  "portsAttributes": { "8080": { "label": "Lab Preview", "onAutoForward": "openBrowser" } },
  "remoteEnv": { "GEMINI_API_KEY": "${localEnv:GEMINI_API_KEY}" }
}
```

## .gitpod.yml для Gitpod

```yaml
image: gitpod/workspace-full
tasks:
  - name: Lab
    init: bash scripts/sandbox-bootstrap.sh
    command: python3 -m http.server 8080
ports:
  - port: 8080
    onOpen: open-browser
    visibility: public
```

## replit.nix / .replit для Replit

```nix
{ pkgs }: { deps = [ pkgs.python312 pkgs.nodejs_20 pkgs.pandoc pkgs.git ]; }
```

```toml
run = "bash scripts/sandbox-bootstrap.sh && python3 -m http.server 8080"
```

---

## Управление секретами (никогда не коммить ключи!)

| Платформа | Где хранить | Как получить в коде |
|-----------|-------------|---------------------|
| Codespaces | Settings → Codespaces → Secrets | `$GEMINI_API_KEY` |
| Gitpod | User Settings → Variables (scope `*/*`) | `$GEMINI_API_KEY` |
| Cloud Shell | `~/.secrets/` + `chmod 600` | `$(cat ~/.secrets/key)` |
| StackBlitz/CodeSandbox | Project → Settings → Env Variables | `process.env.*` |
| Replit | 🔒 Secrets (боковая панель) | `process.env.*` |

---

## Выбор платформы под тип лабы

| Тип задачи лабы | Рекомендованная песочница |
|-----------------|---------------------------|
| Концепции / промптинг / без кода | github.dev, Codespaces |
| Фронтенд (React/Next/Solidity UI) | StackBlitz, CodeSandbox |
| Бэкенд / Docker / микросервисы | Codespaces, Gitpod |
| Облако (GCP/Firebase/Terraform) | Google Cloud Shell |
| Командная работа / PR-флоу | GitHub Codespaces |
| Быстрый одноразовый эксперимент | Gitpod |

> В каждой лабе раздел **«Песочница»** указывает рекомендованную платформу
> для её темы — но любую задачу можно выполнить в Codespaces как универсальной.
