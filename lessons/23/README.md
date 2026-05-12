# Многоагентная оркестрация

Один агент решает задачи последовательно. Команда специализированных агентов работает параллельно, каждый в своей зоне ответственности. В этом уроке строим многоагентные системы: от ролевого кастинга до Grand Unified Workflow.

## Почему несколько агентов

```
┌─────────────────────────────────────────────────────┐
│  Один агент                                         │
│  Architect → Dev → QA → Security → DevOps           │
│  Время: 45 мин    Качество: среднее (переключения)  │
├─────────────────────────────────────────────────────┤
│  Команда агентов                                    │
│  Architect ──────────────────────────────┐          │
│  Developer (×2) ──────────────────┐      │          │
│  QA ──────────────────────┐       │      │          │
│  Security ──────────┐     │       │      │          │
│  DevOps ─────┐      │     │       │      │          │
│              └──────┴─────┴───────┴──────┘          │
│  Время: 12 мин    Качество: высокое (специализация) │
└─────────────────────────────────────────────────────┘
```

## Ролевой кастинг

Каждый агент определяется своим `SKILL.md` или правилом в `.agent/rules/`:

### Архитектор

```markdown
<!-- .agent/rules/role-architect.md -->
---
trigger: model_decision
---
Ты — Software Architect. Твои обязанности:
- Проектировать структуру системы (C4, ADR)
- Принимать решения о паттернах (не реализовывать)
- Выдавать артефакты: architecture_decision.md, component_diagram.md
- НЕ писать production-код, только спецификации
```

### Разработчик

```markdown
<!-- .agent/rules/role-developer.md -->
---
trigger: model_decision
---
Ты — Backend Developer (Python/FastAPI/Pydantic V2).
Реализуй строго по спецификации от Архитектора.
Стиль: async/await, type hints везде, dependency injection.
Выходные артефакты: изменения в src/, тесты в tests/.
```

### QA-инженер

```markdown
<!-- .agent/rules/role-qa.md -->
---
trigger: model_decision
---
Ты — QA Engineer. Работаешь только после Developer.
Задачи: генерация тест-плана (XLSX), E2E тесты (Playwright),
проверка покрытия (coverage > 80%).
Не исправляй код — только фиксируй дефекты в артефакте.
```

### Security-ревьюер

```markdown
<!-- .agent/rules/role-security.md -->
---
trigger: model_decision
---
Ты — Security Engineer. Проводишь review после Developer.
Проверяй: OWASP Top 10, IDOR, небезопасные зависимости.
Выход: security_report.md с [CRITICAL/HIGH/MEDIUM/LOW].
```

## Паттерны оркестрации

### 1. Последовательный конвейер

Каждый агент получает результат предыдущего:

```markdown
// workflow: sequential-pipeline

## Шаг 1: Architect
Роль: @/.agent/rules/role-architect.md
Задача: спроектируй API для {FEATURE}
Выход: артефакт architecture_decision.md → ревью

## Шаг 2: Developer (после апрува Архитектора)
Роль: @/.agent/rules/role-developer.md
Входные данные: @/artifacts/architecture_decision.md
Задача: реализуй согласно спецификации

## Шаг 3: QA + Security (параллельно после Developer)
QA: генерируй тест-план и E2E тесты
Security: проверь реализацию на уязвимости

## Шаг 4: DevOps (после QA green + Security clear)
Задача: обнови CI/CD, docker-compose, мониторинг
```

### 2. Параллельный ревью

Несколько агентов проверяют один и тот же результат независимо:

```markdown
// workflow: parallel-review

После реализации фичи запусти одновременно:
- [ ] QA: тест-план и покрытие
- [ ] Security: OWASP-ревью
- [ ] Performance: анализ узких мест (N+1, индексы)

Объедини все отчёты в release_readiness.md
```

### 3. Специализированный Self-Healing

```markdown
// workflow: self-healing-security

loop:
  Developer → реализует изменения
  Security → анализирует, выдаёт security_report.md
  if CRITICAL issues в report:
    Developer → фиксит по отчёту
    goto loop
  else:
    exit loop → PR ready
```

## Context Sharing: Передача данных между агентами

Агенты общаются через **артефакты** в `.agent/context/`:

```
.agent/
└── context/
    ├── architecture_decision.md   # от Architect
    ├── api_contract.yaml          # от Architect → читает Developer
    ├── security_report.md         # от Security → читает Developer
    └── test_results.md            # от QA → читает DevOps
```

В Workflow используй `@/` для явных ссылок:

```markdown
Developer читает: @/.agent/context/architecture_decision.md
Developer пишет: src/, tests/
Security читает: @/src/
Security пишет: @/.agent/context/security_report.md
```

## Grand Unified Workflow

Пример полного цикла разработки фичи с ролевыми агентами:

```markdown
// workflow: grand-unified-feature

// turbo

## Фаза 0: Инициация
Создай `.agent/context/feature_spec.md` с описанием задачи

## Фаза 1: Архитектура
@role: Architect
Спроектируй компоненты и API-контракт (OpenAPI 3.0)
→ артефакт: api_contract.yaml

## Фаза 2: Реализация
@role: Developer
Реализуй строго по @/.agent/context/api_contract.yaml
→ изменения в src/

## Фаза 3: Верификация (параллельно)
@role: QA      → тесты, coverage report
@role: Security → OWASP review

## Фаза 4: Интеграция
@role: DevOps
Обнови: .github/workflows/ci.yml, docker-compose.yml
Условие: только если QA green && Security clear

## Фаза 5: Финальный ревью
Создай RELEASE_NOTES.md со списком изменений
```

## Инструментарий для координации

| Инструмент | Назначение |
|------------|------------|
| `.agent/context/` | Обмен артефактами между агентами |
| `trigger: model_decision` | Агент сам выбирает когда активировать роль |
| `// turbo` в Workflow | Автоматическое выполнение без паузы на ревью |
| Pending States | Явная точка синхронизации между агентами |

## Практика

1. Создай три правила в `.agent/rules/`: `role-architect.md`, `role-developer.md`, `role-qa.md`
2. Напиши Workflow `sequential-pipeline` для добавления нового API endpoint
3. Запусти и сравни качество результата с одноагентным выполнением той же задачи


## Практические решения

### Масштабирование приложений

- Горизонтальное масштабирование
- Кэширование
- Оптимизация БД
- Load balancing

## Рекомендуемые источники

1. Scalability Best Practices