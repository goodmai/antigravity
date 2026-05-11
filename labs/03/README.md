# Лабораторная работа №3: Antigravity в облачных IDE

GitHub Codespaces — не единственный способ работать с Antigravity в браузере. В этой лабораторной разворачиваем среду в четырёх облачных платформах и сравниваем их для задач агентной разработки.

## Сравнение платформ

| Платформа | Бесплатно | Персистентность | Скорость старта | Лучше всего для |
|-----------|-----------|----------------|----------------|----------------|
| GitHub Codespaces | 60 ч/мес | ✓ постоянная | ~60 сек | Командная работа, PRs |
| Gitpod | 50 ч/мес | ✗ эфемерная | ~30 сек | Быстрые эксперименты |
| Google Cloud Shell | Неограниченно | ~5 ГБ `$HOME` | ~5 сек | GCP-проекты, скрипты |
| Replit | Ограничено | ✓ постоянная | ~10 сек | Прототипы, обучение |

---

## Платформа 1: GitHub Codespaces

> Подробная настройка — в Лабораторной №2.

**Быстрая установка через терминал:**

```bash
# После открытия Codespace
sudo apt-get install -y pandoc
npm install -g @google/gemini-cli
git clone https://github.com/goodmai/antigravity ~/antigravity
cd ~/antigravity && python3 scripts/convert_lessons.py
python3 -m http.server 8080
```

---

## Платформа 2: Gitpod

Gitpod запускает эфемерное рабочее пространство из любого GitHub/GitLab репозитория. Каждая сессия начинается чисто.

### Запуск

Добавь `gitpod.io/#` перед URL репозитория:

```
https://gitpod.io/#https://github.com/goodmai/antigravity
```

### Автоматизация через .gitpod.yml

Создай файл `.gitpod.yml` в корне репозитория:

```yaml
# .gitpod.yml
image:
  file: .gitpod.Dockerfile

tasks:
  - name: Setup Antigravity
    init: |
      npm install -g @google/gemini-cli
      python3 scripts/convert_lessons.py
    command: |
      echo "Antigravity ready! Run: python3 -m http.server 8080"

ports:
  - port: 8080
    onOpen: open-browser
    visibility: public

vscode:
  extensions:
    - ms-python.python
    - yzhang.markdown-all-in-one
```

```dockerfile
# .gitpod.Dockerfile
FROM gitpod/workspace-python-3.12

RUN sudo apt-get update && sudo apt-get install -y pandoc \
    && sudo rm -rf /var/lib/apt/lists/*
```

### Установка в терминале Gitpod

```bash
# Gemini CLI
npm install -g @google/gemini-cli

# Настройка ключа (через Gitpod Variables — рекомендуется)
# gitpod.io → User Settings → Variables → Add Variable
# Name: GEMINI_API_KEY  |  Value: AI...xxx  |  Scope: goodmai/*

# Проверка
echo $GEMINI_API_KEY
gemini --version

# Сборка академии
python3 scripts/convert_lessons.py
python3 -m http.server 8080
```

> **Важно**: Gitpod-сессия не сохраняется. При следующем открытии всё установится заново через `.gitpod.yml`.

---

## Платформа 3: Google Cloud Shell

Cloud Shell — бесплатная Linux-среда, встроенная прямо в Google Cloud Console. Имеет постоянное хранилище `$HOME` (~5 ГБ) и предустановленный Node.js, Python, Git.

### Открытие

```
https://shell.cloud.google.com
```

Или кнопка `>_` в правом верхнем углу любой страницы Google Cloud Console.

### Установка Antigravity

Cloud Shell уже содержит Node.js, Python 3, Git. Достаточно нескольких команд:

```bash
# Клонируй репозиторий
git clone https://github.com/goodmai/antigravity.git
cd antigravity

# Установи Pandoc
sudo apt-get install -y pandoc

# Установи Gemini CLI
npm install -g @google/gemini-cli

# Настрой ключ (только один раз — сохранится в $HOME)
echo 'export GEMINI_API_KEY="your-key-here"' >> ~/.bashrc
source ~/.bashrc

# Собери уроки
python3 scripts/convert_lessons.py

# Открой Web Preview на порту 8080
python3 -m http.server 8080
# Нажми кнопку "Web Preview" → Preview on port 8080
```

### Автозапуск при старте Shell

```bash
# ~/.cloudshell/startup.sh — выполняется при каждом открытии
cat >> ~/.cloudshell/startup.sh << 'EOF'
export GEMINI_API_KEY="$(cat ~/.secrets/gemini_key 2>/dev/null)"
cd ~/antigravity 2>/dev/null && echo "Antigravity ready"
EOF

# Сохрани ключ в защищённом месте
mkdir -p ~/.secrets
echo "your-api-key" > ~/.secrets/gemini_key
chmod 600 ~/.secrets/gemini_key
```

### Преимущества Cloud Shell для Antigravity

- Прямой доступ к GCP ресурсам (Firebase, Cloud Run, GKE) — идеально с Уроком 13
- Terraform и gcloud предустановлены
- Авторизация в GCP автоматическая

---

## Платформа 4: Replit

Replit — облачная IDE с постоянным хранилищем и простым деплоем. Подходит для прототипов и обучения.

### Создание Repl

```
replit.com → Create Repl → Import from GitHub
URL: https://github.com/goodmai/antigravity
```

### Конфигурация через replit.nix

```nix
# replit.nix
{ pkgs }: {
  deps = [
    pkgs.python312
    pkgs.nodejs_20
    pkgs.pandoc
    pkgs.git
  ];
  env = {
    PYTHONPATH = "$REPL_HOME";
  };
}
```

### .replit файл

```toml
# .replit
run = "python3 scripts/convert_lessons.py && python3 -m http.server 8080"
entrypoint = "index.html"

[nix]
channel = "stable-23_11"

[deployment]
run = ["python3", "-m", "http.server", "8080"]
```

### Установка в Shell Replit

```bash
# В Shell-вкладке Replit
npm install -g @google/gemini-cli

# Секреты → Replit Secrets (замок в боковой панели)
# Ключ: GEMINI_API_KEY
# Значение: AI...xxx

# Проверка
gemini --version
python3 scripts/convert_lessons.py
```

---

## Универсальный скрипт установки

Этот скрипт работает в любой из перечисленных платформ:

```bash
#!/bin/bash
# install-antigravity.sh
set -e

echo "Detecting environment..."

# Определяем платформу
if [ -n "$CODESPACE_NAME" ]; then
    PLATFORM="codespaces"
elif [ -n "$GITPOD_WORKSPACE_ID" ]; then
    PLATFORM="gitpod"
elif [ -n "$CLOUD_SHELL" ]; then
    PLATFORM="cloudshell"
else
    PLATFORM="unknown"
fi

echo "Platform: $PLATFORM"

# Pandoc
if ! command -v pandoc &>/dev/null; then
    echo "Installing pandoc..."
    sudo apt-get install -y pandoc -qq 2>/dev/null || \
    brew install pandoc 2>/dev/null || \
    echo "Install pandoc manually: https://pandoc.org/installing.html"
fi

# Node.js
if ! command -v node &>/dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

# Gemini CLI
if ! command -v gemini &>/dev/null; then
    echo "Installing Gemini CLI..."
    npm install -g @google/gemini-cli
fi

# Репозиторий
if [ ! -d "antigravity" ]; then
    git clone https://github.com/goodmai/antigravity.git
fi

# Сборка
cd antigravity
python3 scripts/convert_lessons.py

echo ""
echo "=== Antigravity installed successfully! ==="
echo "Run: cd antigravity && python3 -m http.server 8080"
echo "Then open: http://localhost:8080/lessons/"
```

```bash
# Запуск одной командой (в любом облачном терминале)
curl -fsSL https://raw.githubusercontent.com/goodmai/antigravity/main/install-antigravity.sh | bash
```

---

## Сравнение для задач Antigravity

| Задача | Лучшая платформа | Причина |
|--------|-----------------|--------|
| Командная разработка | Codespaces | Интеграция с GitHub PRs |
| Быстро попробовать | Gitpod | Мгновенный старт из URL |
| GCP/Firebase задачи | Cloud Shell | Авторизация встроена |
| Обучение / демо | Replit | Простой деплой, шаринг |
| Production-разработка | Codespaces | Персистентность, мощь |

## Результат лабораторной

После выполнения у тебя будет:
- `.gitpod.yml` + `.gitpod.Dockerfile` для автонастройки Gitpod
- `.devcontainer/` для Codespaces (из Лабораторной №2)
- Понимание, какую платформу выбрать для конкретной задачи
- Универсальный `install-antigravity.sh` скрипт
