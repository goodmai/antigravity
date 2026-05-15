# Лаба 13: Облако: Firebase и GCP

> 🔗 Практика к [Уроку 13](../../lessons/13/README.md) — *Облачная разработка (Google Cloud & Firebase)*

Управляем Firebase/GCP через агента безопасно — без JSON-ключей.

## 🎯 Цель

Закрепить материал Урока 13 через 7 практических задач в облачной
песочнице GitHub. Каждая задача имеет явный **критерий приёмки** — лаба
считается сданной, когда выполнен финальный чек-лист.

## 🧪 Песочница (мультиплатформа)

**Рекомендуется для этой лабы:** Google Cloud Shell — встроенная авторизация в GCP, предустановлены gcloud/terraform/node.

Любую задачу можно выполнить в одной из песочниц (быстрый запуск):

- Google Cloud Shell — `https://shell.cloud.google.com` → `git clone`
- GitHub Codespaces — `https://github.com/goodmai/antigravity` → **Code ▾ → Codespaces → Create**
- Gitpod — `https://gitpod.io/#https://github.com/goodmai/antigravity`
- Replit — *Create Repl → Import from GitHub*

Полная шпаргалка (bootstrap-скрипт, devcontainer, секреты, выбор платформы): **[../SANDBOX_SETUP.md](../SANDBOX_SETUP.md)**.

```bash
# единый вход в любой песочнице
bash scripts/sandbox-bootstrap.sh
```

## 📋 Задачи

### Задача 1 — Cloud Shell старт

**Цель:** Подготовить облачную среду.

**Шаги:**
1. Открой Cloud Shell, `gcloud auth list`.

**Критерий приёмки:** Авторизация GCP активна.

### Задача 2 — Firebase init

**Цель:** Инициализировать проект.

**Шаги:**
1. `firebase init` (hosting+firestore) через агента.

**Критерий приёмки:** Создан валидный `firebase.json`.

### Задача 3 — Firestore Rules

**Цель:** Написать безопасные правила.

**Шаги:**
1. Агент генерирует правила least-privilege.

**Критерий приёмки:** Правила запрещают доступ по умолчанию.

### Задача 4 — Эмулятор

**Цель:** Локально проверить правила.

**Шаги:**
1. Запусти Firestore Emulator, тест-кейсы доступа.

**Критерий приёмки:** Разрешённый доступ ок, запрещённый отклонён.

### Задача 5 — Keyless auth

**Цель:** Настроить без JSON-ключей.

**Шаги:**
1. Опиши Workload Identity Federation в `notes/keyless.md`.

**Критерий приёмки:** Описан флоу без долгоживущих ключей.

### Задача 6 — IaC для Cloud Run

**Цель:** Сгенерировать конфиг.

**Шаги:**
1. Агент создаёт деплой-конфиг Cloud Run.

**Критерий приёмки:** Конфиг проходит `gcloud ... --dry-run`/валидацию.

### Задача 7 — Анализ логов

**Цель:** Диагностировать по логам.

**Шаги:**
1. Сэмулируй ошибку, разбери Cloud Logging.

**Критерий приёмки:** Причина найдена по записям лога.

## ✅ Чек-лист сдачи

- [ ] Задача 1: Cloud Shell старт
- [ ] Задача 2: Firebase init
- [ ] Задача 3: Firestore Rules
- [ ] Задача 4: Эмулятор
- [ ] Задача 5: Keyless auth
- [ ] Задача 6: IaC для Cloud Run
- [ ] Задача 7: Анализ логов

## 🧭 Связь с курсом

- **Теория:** [Урок 13](../../lessons/13/README.md) — *Облачная разработка (Google Cloud & Firebase)*
- **Песочницы:** общая шпаргалка [labs/SANDBOX_SETUP.md](../SANDBOX_SETUP.md)
- **Капстоун курса:** [labs/CAPSTONE.md](../CAPSTONE.md) — TeleDrive Ecosystem
- **Навигация:** ← [Лаба 12](../12/README.md) · [Лаба 14](../14/README.md) →

---

*Сгенерировано `scripts/generate_labs.py`. Правьте генератор, а не выходные файлы.*
