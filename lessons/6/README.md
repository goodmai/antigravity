# Лабораторная Работа №1: Senior AI Engineering & Autonomous Workflows

Добро пожаловать в высшую лигу. В этой работе мы построим **Fully Autonomous Self-Healing Security System**, используя 4 специализированных AI-скилла.

Мы откажемся от простых bash-скриптов в пользу кроссплатформенной архитектуры на Python.

---

## 🏗️ Phase 0: Infrastructure Setup

Как Senior Engineer, вы начинаете с фундамента.

### 1. Gemini CLI & Core

Установите ядро нашей системы:

```bash
npm install -g @google/gemini-cli
```

### 2. Extensions (The Tools)

Установите необходимые расширения:

```bash
gemini install code-review
gemini install gemini-cli-security
```

### 3. Environment (Secrets Management)

**Никогда** не храните ключи в коде.

```bash
export GEMINI_API_KEY="ваш_ключ"
# export QWEN_API_KEY="ваш_ключ" (если применимо)
```

---

## 🧠 Phase 1: The "Brain" (Prompt Optimizer)

Первый скилл — **Prompt Optimizer**. Он не пишет код, он анализирует проект и "программирует" других агентов.

- **Logic**: Сканирует структуру проекта (Python/Web/FullStack).
- **Output**: Генерирует файлы `qwen_prompt.txt` и `sec_prompt.txt` в папке `artifacts/config`.
- **Методология**: CO-STAR Framework.

**Запуск:**

```bash
python3 skills/prompt-optimizer/scripts/optimize_prompts.py --project-dir .
```

---

## 🛡️ Phase 2: The "Execution Team"

Мы используем 3 исполнительных скилла, которые **потребляют** конфигурацию от Оптимизатора.

1.  **Auditor (Security Checker)**:
    - Инструмент: `gemini-cli-security`.
    - Роль: Paranoid Security Expert.
    - Config: `--system-prompt artifacts/config/sec_prompt.txt`.
2.  **Reviewer (Qwen Code Review)**:
    - Инструмент: `code-review`.
    - Роль: Lead Python Developer.
    - Config: `--system-prompt artifacts/config/qwen_prompt.txt`.

3.  **Fixer (Gemini Fixer)**:
    - Инструмент: Gemini 1.5 Pro.
    - Роль: Senior Software Engineer.
    - Задача: Исправлять код на основе отчетов от Auditor и Reviewer.

---

## 🔄 Phase 3: The Orchestrator (Autonomous Loop)

Вместо простых скриптов мы используем `lab_orchestrator.py` на Python.

**Алгоритм Оркестратора:**

1.  **Optimization**: Запускает Prompt Optimizer.
2.  **Loop**:
    - Запускает **Auditor** и **Reviewer** с тюнингованными промптами.
    - Сохраняет отчеты в `artifacts/<timestamp>_<type>.txt`.
    - **Check**: Если `No critical issues` -> EXIT.
    - **Fix**: Если issues есть -> вызывает **Fixer** с контекстом отчетов.
    - Повторяет цикл.

### Запуск полной лаборатории:

```bash
# Создайте уязвимый файл для теста
echo "import os; os.system('rm -rf /')" > vulnerable_app.py

# Запустите автономную систему
python3 lessons/6/scripts/lab_orchestrator.py
```

---

## Итог

Вы создали систему уровня Enterprise:

1.  **Optimization**: Агенты адаптируются под проект.
2.  **Traceability**: Все решения задокументированы.
3.  **Self-Healing**: Система сама чинит баги, пока не станет "чистой".
