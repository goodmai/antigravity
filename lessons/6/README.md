# Урок 6: Продвинутые AI-воркфлоу — автономная самоисцеляющаяся система

> В этом уроке мы соединяем скиллы из урока 5 в **автономный конвейер**, который сам аудитит код, ревьюит его, чинит баги и останавливается только когда отчёт чист. Это уровень Senior AI Engineering.

---

## Цель урока

Построить **Self-Healing Security & Quality System** на четырёх специализированных AI-агентах:

```
┌──────────────────────┐
│  Prompt Optimizer    │  ← анализирует проект, генерирует промпты для исполнителей
└──────────┬───────────┘
           ▼
┌──────────────────────┐     ┌──────────────────────┐
│  Auditor (security)  │  +  │  Reviewer (quality)  │
└──────────┬───────────┘     └──────────┬───────────┘
           └──────────┬─────────────────┘
                      ▼
           ┌──────────────────────┐
           │   Fixer (rewriter)   │
           └──────────┬───────────┘
                      ▼
              [loop until clean]
```

Архитектура кроссплатформенная (Python), а не bash-скрипты — потому что **наблюдаемость, повторяемость и трассируемость** важнее лаконичности.

---

## Phase 0. Инфраструктура

### 0.1. Установка ядра

```bash
npm install -g @google/gemini-cli
gemini install code-review
gemini install gemini-cli-security
```

### 0.2. Секреты

Ключи **никогда** не хранятся в коде или коммитах.

```bash
export GEMINI_API_KEY="…"
export QWEN_API_KEY="…"     # опционально, для ревью
```

Проверка: `python -c "import os; assert os.getenv('GEMINI_API_KEY'), 'missing key'"`.

### 0.3. Структура артефактов

```
artifacts/
├── config/                 # сгенерированные системные промпты
│   ├── sec_prompt.txt
│   └── qwen_prompt.txt
└── 2026-05-14T12-03-22_audit.txt
    2026-05-14T12-03-22_review.txt
    2026-05-14T12-04-10_fix.diff
```

Имя файла = ISO-timestamp + тип — это даёт идемпотентность и историю.

---

## Phase 1. «Мозг» — Prompt Optimizer

Первый агент **не пишет код**. Он программирует других агентов.

### 1.1. Что он делает

1. Сканирует проект: `pyproject.toml`, `package.json`, языки файлов.
2. Классифицирует тип: `python-lib`, `web-frontend`, `fullstack`, `infra`.
3. Применяет **CO-STAR-фреймворк** для генерации системных промптов:
   - **C** ontext — что за проект.
   - **O** bjective — конкретная роль (Paranoid Security Expert / Senior Python Dev).
   - **S** tyle — формат отчёта.
   - **T** one — корпоративный / нейтральный.
   - **A** udience — другие AI-агенты.
   - **R** esponse — JSON / Markdown / unified diff.

### 1.2. Запуск

```bash
python3 skills/prompt-optimizer/scripts/optimize_prompts.py --project-dir .
```

Результат — два файла в `artifacts/config/`. Их читают агенты Phase 2.

> [!IMPORTANT]
> Без Phase 1 промпты исполнителей оказываются «универсально средними». Адаптация под проект — то, что отличает игрушечный пайплайн от боевого.

---

## Phase 2. «Исполнители» — три специализированных агента

| Агент | Инструмент | Роль | Вход | Выход |
| :--- | :--- | :--- | :--- | :--- |
| **Auditor** | `gemini-cli-security` | Paranoid Security Expert | код + `sec_prompt.txt` | `audit.txt` |
| **Reviewer** | `code-review` (Qwen) | Lead Python Developer | код + `qwen_prompt.txt` | `review.txt` |
| **Fixer** | `gemini` 1.5 Pro | Senior Software Engineer | код + два отчёта | unified-diff `fix.diff` |

### Контракт между агентами

Все отчёты обязаны содержать JSON-секцию:

```json
{
  "critical": [...],
  "major":    [...],
  "minor":    [...],
  "verdict":  "FAIL" | "PASS"
}
```

Только наличие этой секции даёт оркестратору однозначный сигнал «чисто / не чисто».

---

## Phase 3. Оркестратор — автономный цикл

`lab_orchestrator.py` управляет жизненным циклом:

```python
def run():
    optimize_prompts()
    for iteration in range(MAX_ITER):
        audit  = run_auditor()
        review = run_reviewer()
        if is_clean(audit) and is_clean(review):
            log("✅ No critical issues — exiting clean.")
            return
        diff = run_fixer(audit, review)
        apply_diff(diff)
        snapshot_artifacts(iteration)
    raise RuntimeError("Reached MAX_ITER — manual review required.")
```

### Защитные механизмы

| Риск | Защита |
| :--- | :--- |
| Бесконечный цикл | `MAX_ITER = 5`, выход с ненулевым кодом |
| Fixer ломает тесты | После каждого `apply_diff` — `pytest --maxfail=1` |
| Регресс по метрикам | Перед stop — сравнение `radon cc` до/после |
| Утечка ключей в логи | Логгер маскирует переменные с `KEY`, `TOKEN`, `SECRET` |
| Откат при провале | `git stash` перед apply; `git stash pop` при ошибке |

---

## Phase 4. Запуск и наблюдение

### 4.1. Готовим уязвимый файл

```bash
cat > vulnerable_app.py <<'EOF'
import os, pickle
def handle(user_input):
    os.system(f"echo {user_input}")            # command injection
    return pickle.loads(user_input.encode())   # insecure deserialization
EOF
```

### 4.2. Запуск

```bash
python3 lessons/6/scripts/lab_orchestrator.py --target vulnerable_app.py
```

### 4.3. Чего ждать в выводе

```
[iter 1] auditor:  3 critical, 1 major
[iter 1] reviewer: 2 major
[iter 1] fixer:    diff applied (12 lines changed)
[iter 2] auditor:  0 critical, 0 major
[iter 2] reviewer: 0 critical, 0 major
✅ No critical issues — exiting clean after 2 iterations.
```

Все промежуточные отчёты лежат в `artifacts/<timestamp>_*.txt`.

---

## Phase 5. Наблюдаемость

Без неё автономия — это чёрный ящик.

- **Trace ID** — каждой итерации присваивается UUID, он пробрасывается во все артефакты.
- **Metrics** — orchestrator пишет `metrics.json`: `iterations`, `critical_at_start`, `critical_at_end`, `duration_s`.
- **Cost guard** — порог по токенам; при превышении пайплайн останавливается с понятной ошибкой.
- **Audit log** — `events.jsonl` для постфактум-разбора.

> [!TIP]
> Воркфлоу `securcheck` (в `.agent/workflows/`) — это «обёртка» над оркестратором, которую вы вызываете командой `/securcheck` прямо из чата.

---

## Анти-паттерны при сборке воркфлоу

| Анти-паттерн | Симптом | Лечение |
| :--- | :--- | :--- |
| **Bash-портянка** | Один `.sh` на 400 строк | Разбить на Python-модули с unit-тестами |
| **Жёстко зашитые промпты** | Промпт в исходнике | Вынести в `artifacts/config/`, генерировать через Phase 1 |
| **Нет лимита итераций** | Пайплайн крутится час | `MAX_ITER` + cost-guard |
| **Молчаливый Fixer** | Diff применился, но мы не знаем что | Diff пишется как артефакт + summary в commit-message |
| **One-shot review** | Один прогон без итераций | Цикл с проверкой verdict |

---

## Практические задания

> Все артефакты — в `artifacts/lesson-6/task-N/`. По каждому заданию — отдельный коммит с тегом `lesson-6: task-N`.

### Задание 1 — Bootstrap
Установите `gemini-cli` и оба расширения. Экспортируйте ключи в `.env`. Проверьте, что `gemini --version` и `gemini-cli-security --help` работают. В `notes.md` запишите версии. Зафиксируйте `.env` в `.gitignore`.

### Задание 2 — Prompt Optimizer на трёх проектах
Запустите `optimize_prompts.py` на трёх разных репозиториях: чистый Python, фронтенд (React), смешанный. Сравните сгенерированные `sec_prompt.txt`. Опишите в `diff.md`, какие три параметра меняются сильнее всего и почему.

### Задание 3 — Контракт отчёта
Возьмите дефолтный промпт Auditor и допишите: «верни JSON-секцию `{critical, major, minor, verdict}` в конце». Прогоните на `vulnerable_app.py`. Распарсите вывод через `json.loads` и assert-ните `verdict == "FAIL"`.

### Задание 4 — Оркестратор «hello-loop»
Напишите упрощённый `mini_orchestrator.py` (≤ 80 строк): запускает Auditor → Fixer в цикле до `verdict == "PASS"` или `MAX_ITER=3`. Без Reviewer. Покройте unit-тестом случай «уже чистый файл — 0 итераций».

### Задание 5 — Защита от регресса
Добавьте в свой оркестратор шаг `pytest -q` после `apply_diff`. Если тесты упали — `git stash pop`, итерация считается failed, переход к следующей с дополнительным контекстом «прошлый фикс сломал тесты». Воспроизведите ситуацию искусственно: внесите тест, который Fixer сломает.

### Задание 6 — Наблюдаемость
Добавьте структурное логирование: `events.jsonl` (по событию на строку) + `metrics.json` после завершения. Минимум полей: `trace_id`, `iter`, `phase`, `duration_ms`, `tokens_in`, `tokens_out`. Постройте простую визуализацию через `web-artifacts-builder` (timeline-диаграмму).

### Задание 7 — Self-healing на реальном проекте
Возьмите любой open-source Python-репозиторий (≤ 2 000 строк). Прогоните полный пайплайн (`securcheck`). Зафиксируйте: сколько итераций, что было исправлено, что осталось ручному ревьюверу. Отчёт оформите через `doc-coauthoring` → `pdf`. Не коммитьте чужой код — только метрики и комментарии.

---

## Definition of Done урока

- [ ] Phase 1 (Optimizer) запускается на трёх разных проектах.
- [ ] Phase 2-агенты возвращают валидный JSON-вердикт.
- [ ] Phase 3-оркестратор корректно завершает цикл (либо PASS, либо MAX_ITER).
- [ ] Есть `metrics.json` и `events.jsonl` после прогона.
- [ ] Реальный проект из задания 7 прошёл хотя бы 2 итерации с реальными исправлениями.

---

## Что дальше

Когда у вас есть **исполнители** (урок 5) и **оркестратор** (урок 6), остаётся научиться **тестировать сами скиллы** — для этого в уроке 7 мы соберём мета-скилл `qa-skill-tester`.
