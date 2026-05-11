# Лабораторная работа №2: Antigravity в GitHub Codespaces

GitHub Codespaces предоставляет полноценную облачную среду разработки прямо в браузере. В этой лабораторной настраиваем готовое рабочее пространство с предустановленным Antigravity: открыл — и уже работаешь.

## Что такое GitHub Codespaces

Codespaces — это контейнер на базе VS Code, запущенный на серверах GitHub. Ты получаешь:
- Полноценный Linux-терминал
- VS Code с расширениями
- Персистентное хранилище (пока не удалишь)
- До 60 часов бесплатно в месяц (Free план)

## Быстрый старт: запустить Antigravity в Codespaces

### 1. Форкни репозиторий

```
https://github.com/goodmai/antigravity → Fork
```

### 2. Открой в Codespaces

```
Репозиторий → зелёная кнопка «Code» → Codespaces → Create codespace on main
```

Через 1-2 минуты откроется VS Code в браузере с уже клонированным репозиторием.

### 3. Установи зависимости через терминал

В открытом терминале Codespace:

```bash
# Проверь Python
python3 --version   # нужен 3.10+

# Проверь Node.js
node --version      # нужен 18+

# Установи Pandoc (для сборки уроков)
sudo apt-get install -y pandoc

# Установи Gemini CLI (основа Antigravity)
npm install -g @google/gemini-cli

# Проверь установку
gemini --version
```

### 4. Настрой API-ключ

```bash
# Создай файл окружения
echo 'export GEMINI_API_KEY="your-api-key-here"' >> ~/.bashrc
source ~/.bashrc

# Или используй Codespaces Secrets (рекомендуется)
# GitHub → Settings → Codespaces → New secret → GEMINI_API_KEY
```

### 5. Настрой глобальные правила Antigravity

```bash
mkdir -p ~/.gemini
cat > ~/.gemini/GEMINI.md << 'EOF'
# Global Antigravity Rules

## Рабочий язык
Общайся на русском языке.

## Стиль кода
- Python: async/await, Pydantic V2, type hints
- JS/TS: functional style, no var
EOF
```

### 6. Собери уроки и открой академию локально

```bash
cd ~/workspace/antigravity
python3 scripts/convert_lessons.py

# Запусти простой HTTP-сервер
python3 -m http.server 8080
```

Codespaces автоматически предложит открыть порт 8080 в браузере.

## Автоматизация через devcontainer.json

Чтобы всё устанавливалось автоматически при создании Codespace:

```bash
mkdir -p .devcontainer
```

```json
// .devcontainer/devcontainer.json
{
  "name": "Antigravity Academy",
  "image": "mcr.microsoft.com/devcontainers/python:3.12",
  "features": {
    "ghcr.io/devcontainers/features/node:1": {
      "version": "20"
    }
  },
  "postCreateCommand": "bash .devcontainer/setup.sh",
  "customizations": {
    "vscode": {
      "extensions": [
        "ms-python.python",
        "ms-python.vscode-pylance",
        "esbenp.prettier-vscode",
        "yzhang.markdown-all-in-one"
      ],
      "settings": {
        "terminal.integrated.defaultProfile.linux": "bash",
        "python.defaultInterpreterPath": "/usr/bin/python3"
      }
    }
  },
  "forwardPorts": [8080],
  "portsAttributes": {
    "8080": {
      "label": "Antigravity Academy",
      "onAutoForward": "openBrowser"
    }
  }
}
```

```bash
#!/bin/bash
# .devcontainer/setup.sh

set -e

echo "=== Antigravity Codespace Setup ==="

# Pandoc
sudo apt-get update -qq
sudo apt-get install -y -qq pandoc

# Gemini CLI
npm install -g @google/gemini-cli 2>/dev/null || echo "Gemini CLI install skipped"

# Python-зависимости
pip install --quiet fastmcp requests

# Настройка Antigravity
mkdir -p ~/.gemini
if [ ! -f ~/.gemini/GEMINI.md ]; then
  cp .agent/rules/template-global.md ~/.gemini/GEMINI.md 2>/dev/null || \
  echo "# Antigravity Global Rules" > ~/.gemini/GEMINI.md
fi

# Сборка уроков
python3 scripts/convert_lessons.py

echo "=== Setup complete! ==="
echo "Run: python3 -m http.server 8080"
```

```bash
chmod +x .devcontainer/setup.sh
```

## Управление секретами

Никогда не храни API-ключи в коде. Используй Codespaces Secrets:

```
GitHub.com → Settings → Codespaces → Secrets → New secret

Имя:  GEMINI_API_KEY
Значение: AI...xxxxxxxx
Репозиторий: goodmai/antigravity
```

В терминале Codespace секрет автоматически доступен как переменная окружения:

```bash
echo $GEMINI_API_KEY    # проверка
gemini                  # запуск — ключ подхватится автоматически
```

## Полезные команды в Codespace

```bash
# Статус Codespace
gh codespace list

# Остановить (сэкономить часы)
# Просто закрой вкладку браузера — Codespace засыпает через 30 мин

# Пересоздать с нуля (если сломалось)
# GitHub → Repository → Code → Codespaces → ⋯ → Delete → Create new

# Скачать файлы
# VS Code → Explorer → ПКМ на файл → Download
```

## Лимиты бесплатного плана

| Параметр | Free | Pro |
|----------|------|-----|
| Часов в месяц | 60 | 180 |
| Хранилище | 15 GB | 20 GB |
| Машина | 2 CPU / 4 GB RAM | до 32 CPU |
| Одновременных Codespaces | 2 | 5 |

## Результат лабораторной

После выполнения у тебя будет:
- `devcontainer.json` + `setup.sh` в `.devcontainer/`
- Codespace с автоустановкой Gemini CLI, Pandoc, зависимостей
- Antigravity готов к работе сразу после открытия репозитория
- API-ключ безопасно хранится в Codespaces Secrets
