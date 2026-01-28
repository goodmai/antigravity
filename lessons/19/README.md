# Урок 19: Комплексный SDLC Микросервисов с AI Агентами

В этом уроке мы построим **полный производственный цикл** разработки микросервиса. Мы уйдем от простых примеров к реальному Enterprise-воркфлоу, где агент выступает не просто кодером, а оркестратором процессов: от согласования контрактов до деплоя и мониторинга.

Этот урок объединяет мощь **MCP (Model Context Protocol)** и специализированных **Skills** (`qaqase`, `xlsx`, `swagger`).

---

## 🏗️ Архитектура Процесса (The Agentic Way)

Традиционный SDLC линеен. Наш процесс — это **Итеративная Спираль**, где на каждом витке агент валидирует качество.

**Инструментарий урока:**

1. **MCP Context7**: Долгосрочная память проекта.
2. **Skill `/qaqase`**: Интеграция с TMS Qase.io для управления тест-кейсами.
3. **Skill `/xlsx`**: Генерация чек-листов и отчетов.
4. **Swagger MCP**: Работа с OpenAPI контрактами.
5. **Observability Stack**: Prometheus + Grafana для метрик.

---

## 🛠️ Этап 0: Подготовка (Environment & Skills)

Прежде чем написать первую строчку кода, настроим "экзоскелет" проекта.

### 1. Активация Навыков

Агент должен знать, какими инструментами он владеет. Убедитесь, что в `.antigravity/config.json` (или ментальной модели агента) активны:

```json
{
  "skills": ["qaqase", "xlsx", "qa-skill-tester", "security-checker"],
  "mcp": ["context7", "swagger", "github", "postgres"]
}
```

### 2. Оркестрация через Docker Compose

Мы будем управлять инфраструктурой через промпты.

**Prompt для создания инфраструктуры:**

> "Действуй как DevOps Engineer. Нам нужен `docker-compose.yml` для локальной разработки микросервиса `payment-gateway`.
> **Сервисы**:
>
> 1. `app`: Go 1.22, порт 8080.
> 2. `db`: PostgreSQL 15.
> 3. `prometheus`: Сбор метрик с `app:8080/metrics`.
> 4. `grafana`: Визуализация (порт 3000).
> 5. `swagger-ui`: Для просмотра контрактов.
>
> Сгенерируй файл и Makefile для команд `up`, `down`, `logs`."

---

## 📜 Этап 1: Inception & Contract-First

Мы не пишем код бизнес-логики без утвержденного контракта.

### Шаг 1.1: Генерация OpenAPI

Используем агента как Архитектора.

**Prompt:**

> "Сгенерируй OpenAPI 3.0 спецификацию для сервиса платежей.
> **Эндпоинты**:
>
> - `POST /v1/payments`: Создание транзакции.
> - `GET /v1/payments/{id}`: Статус.
> - `POST /v1/payments/{id}/refund`: Возврат.
>
> **Требования**:
>
> - Строгая типизация сумм (Money pattern).
> - Idempotency-Key в заголовках.
> - RFC 7807 для ошибок.
>   Сохрани в `api/openapi.yaml`."

### Шаг 1.2: Валидация через Swagger MCP

Теперь проверим контракт инструментом, а не глазами.

**Prompt:**

> "Используя Swagger MCP, провалидируй `api/openapi.yaml`. Проверь на наличие `operationId` для всех методов и наличие примеров (examples) для всех полей."

Если агент находит ошибки, он сам их исправит: _"Я нашел пропущенные примеры в поле `currency`. Исправляю..."_

---

## 🧪 Этап 2: QA Design & TDD (С использованием Qaqase & XLSX)

До написания кода мы создаем **Артефакты Качества**.

### Шаг 2.1: Генерация Чек-листа (XLSX Skill)

Мы используем скилл `xlsx` для создания плана тестирования.

**Prompt:**

> "Используя навык `/xlsx`, создай файл `artifacts/test_plan.xlsx`.
> **Лист 1 (Checklist)**:
>
> - Колонки: ID, Scenario, Type (Positive/Negative), Priority.
> - Сгенерируй 10 сценариев для нашего Payment API (успех, недостаток средств, дубль ключа идемпотентности, таймаут БД)."

Агент создаст реальный Excel файл, который можно отправить менеджеру.

### Шаг 2.2: Интеграция с Qase.io (Qaqase Skill)

Теперь превратим чек-лист в управляемые тест-кейсы в TMS.

**Prompt:**

> "Используй скилл `/qaqase`.
>
> 1. Распарси созданный `test_plan.xlsx`.
> 2. Сконвертируй сценарии в формат совместимый с Qase (JSON).
> 3. Импортируй их в локальную базу данных скилла (через `POST /import`).
> 4. (Опционально) Если настроен токен, отправь их в Cloud Qase API."

### Шаг 2.3: Итеративный TDD (Red-Green-Refactor)

Теперь, когда у нас есть требования, пишем автотесты.

1. **Red**: _"Напиши Go-тест для `POST /payments`, который проверяет идемпотентность. Используй `testcontainers` для Redis (хранилище ключей). Тест должен упасть."_
2. **Green**: _"Реализуй Middleware для идемпотентности. Добейся прохождения теста."_

### Шаг 2.4: Детальное Тестирование Фронтенда (Mobile vs Desktop)

Агент должен проверить верстку на разных устройствах.

**Prompt:**

> "Используй Playwright для проверки UI компонента `MomentumChallenge`.
>
> 1. **Desktop**: Проверь, что график отображается справа от формы ввода.
> 2. **Mobile**: Проверь, что график уходит под форму (stack layout).
>
> Запусти тесты с флагами:
>
> - Desktop: `npx playwright test --project=desktop`
> - Mobile: `npx playwright test --project=mobile`
>
> После прогона собери отчеты и вызови воркфлоу архивации: `.agent/workflows/artifact-archival.md`."\_

3. **Refactor**: _"Оптимизируй блокировки в Redis. Используй Lua-скрипты для атомарности."_

---

## 📊 Этап 3: Observability Stack (Skill vs MCP)

Мы используем гибридный подход. Почему?

1. **Sentry (MCP)**: Идеален для _Runtime_ отладки. Агент может спросить: _"Покажи последние ошибки"_ и получить JSON.
2. **Prometheus/Grafana (Skill)**: Инфраструктура сложная, поэтому мы заворачиваем её в скилл `/monitoring-stack`. MCP здесь избыточен, так как мы не "общаемся" с Прометеем языком, мы просто хотим развернуть дашборды.

### Шаг 3.1: Активация `/monitoring-stack`

Этот скилл содержит готовые конфиги `prometheus.yml` и дашборды Grafana для Go/Python.

**Prompt:**

> "Используй скилл `/monitoring-stack`.
>
> 1. Сгенерируй `docker-compose.monitoring.yml`.
> 2. Добавь job `payment-service` в конфиг Prometheus (scrape_interval: 5s).
> 3. Импортируй дашборд 'Microservices Go' в Grafana."

### Шаг 3.2: Инструментирование кода

**Prompt:**

> "Добавь middleware для сбора RED-метрик (Rate, Errors, Duration) в FastAPI. Экспонируй `/metrics`."

---

## 🔄 Этап 4: CI/CD с Агентным Деплоем

Мы используем GitHub Actions, где агенты играют активную роль.

### Шаг 4.1: Workflow файл

**Prompt:**

> "Сгенерируй `.github/workflows/deploy.yml`.
> **Jobs**:
>
> 1. **Test**: `go test -v ./...` с генерацией coverage profile.
> 2. **Agent-Review**: Имитация ревью (используя скрипт `review.py` из скилла `qwen-code-review`).
> 3. **Build & Push**: Сборка Docker образа.
> 4. **GitOps**: Обновление манифестов в репозитории `k8s-config` (CD)."

### Шаг 4.2: Отслеживание Тестов через Агентов

Как понять, почему тесты упали в CI?

**Сценарий**:

1. CI падает.
2. GitHub Action триггерит вебхук к вашему локальному агенту (или вы сами копируете лог).
3. **Prompt**: _"Проанализируй этот лог падения CI. Найди тест `TestPayment_Timeout`. Сопоставь с кодом в `payment_service.go` и предложи фикс."_

---

### 3. Ролевая модель: Правила и Требования

Агент должен знать "правила игры". В корне проекта создаем `.antigravity/rules.md`.

**Функциональные требования (Developer Stack):**

1. **Frontend**: React 18 (Vite), Tailwind CSS, Framer Motion (для анимаций физики).
2. **Backend**: Python 3.12 (FastAPI), Pydantic V2.
3. **Auth**: GitHub OAuth 2.0 (Stateless JWT).
4. **Database**: PostgreSQL 16 (PgVector для рекомендаций задач).

**Нефункциональные требования (NFR):**

1. **Performance**: Расчет физики < 50ms.
2. **Quality**: Test Coverage > 90% (Backend), > 70% (Frontend).
3. **Security**: 0 Critical CVEs, Strict CSP headers.
4. **Maintainability**: OpenAPI контракт обязателен _до_ кода.

---

## 🎭 Кастинг Агентов: Кто за что отвечает?

В нашем оркестре каждый агент играет свою партию, используя специфические навыки:

| Роль (Persona)   | Активные Скиллы                | MCP Инструменты  | Зона ответственности                                          |
| :------------------- | :------------------------------------------- | :-------------------------- | :------------------------------------------------------------------------------- |
| **@architect** | `swagger`, `context7`                    | `read_resource`           | Проектирование API, схемы БД, выбор стека.        |
| **@developer** | `standard_coding`                          | `filesystem`              | Написание кода (React/Python), реализация фич.         |
| **@qa-suite**  | `/qaqase`, `/xlsx`, `/qa-skill-tester` | `playwright`              | Генерация тест-планов, E2E тесты, баг-репорты. |
| **@security**  | `/security-checker`                        | `sentry`, `govulncheck` | Аудит зависимостей, проверка секретов, SAST.    |
| **@devops**    | `/git-flow`                                | `github`, `docker`      | CI/CD пайплайны, Dockerfile, деплой.                              |
| **@reviewer**  | `qwen-code-review`                         | `read_file`               | Критика кода, проверка нейминга и NFR.               |

---

## 🎹 Этап 6: Оркестрация и "Дирижирование"

В конце мы используем **Workflow** для запуска всего проекта одной командой.

Создадим файл `.agent/workflows/deploy-local.md`:

```markdown
---
description: Full start of the microservice environment
---

1. Check open ports 8080, 3000, 9090.
   // turbo
2. Run `docker compose up -d postgres prometheus grafana`
3. Wait for DB readiness (pg_isready).
4. Apply migrations: `go run cmd/migrate/main.go`
   // turbo
5. Run app: `docker compose up -d app`
6. Verify health: `curl localhost:8080/health`
```

Теперь вы просто пишете в чат: `/deploy-local`, и агент поднимает всё окружение.

---

## 🎼 Этап 7: Grand Unified Workflow (Единый Пайплайн)

Вместо лоскутной автоматизации мы создадим **Meta-Workflow** для конкретного продукта: **"Gamified Physics"** (Приложение для задач по физике на массу и скорость).

Стек:

- **Web**: React + Tailwind (Gamification UI).
- **API**: Python FastAPI (Physics Engine).
- **DB**: PostgreSQL (User Progress).
- **Auth**: GitHub OAuth.

Создайте файл `.agent/workflows/physics-release.md`. В этом сценарии мы добавляем роли **Developer** (реализация) и **Reviewer** (валидация).

```markdown
---
description: Full feature lifecycle for Physics App (Mass/Velocity module)
---

# 1. Feature Implementation (Developer Phase)

@developer Implement "Calculate Momentum" feature

1. Create `MomentumService` in `backend/physics/momentum.py`.
2. Implement formula $p = m * v$ with unit tests.
3. Expose endpoint `POST /api/v1/physics/momentum`.
4. Update Frontend: Create `MomentumChallenge` component.

# 2. QA & Simulation Phase (Mobile/Desktop)

@qa-suite Verify UI Responsiveness
// turbo

1. Desktop: `npx playwright test --project=chromium --viewport=1920,1080`
2. Mobile: `npx playwright test --project=mobile-chrome --viewport=375,667`
3. Archive results: `/artifact-archival --path=playwright-report`

# 3. Security Audit (Auth Focus)

@security-checker Audit GitHub OAuth implementation

1. Ensure `CLIENT_SECRET` is not logged.
2. Verify state parameter in OAuth flow (CSRF protection).

# 4. Code Review (The "Mean Lead" Phase)

@reviewer Critically review the changes

1. Check variable naming (e.g., use `mass_kg` not just `m`).
2. Verify input validation (negative mass shouldn't be allowed).
   // turbo
3. If score < 8/10, request changes (simulate iteration).

# 5. Release & Deploy

@github Ship it

1. Create PR "feat: Add Momentum Calculation".
   // turbo
2. Merge if CI passes.
3. Deploy to Staging.
```

Теперь, чтобы реализовать фичу "под ключ", вы запускаете:

> **/physics-release**

Агент переключает шляпы: сначала он **Разработчик** (пишет формулы), потом **QA** (проверяет их), потом **Секьюрити** (смотрит OAuth), и наконец **Ревьюер** (ругает сам себя за плохие имена переменных).

Это и есть вершина агентной автономии.

---

## Заключение

Вы построили не просто "код", а **Завод по производству кода**.

- **Context7** держит фокус.
- **Qaqase & XLSX** гарантируют покрытие тестами.
- **MCP** связывают IDE с внешним миром (GitHub, DB).
- **Agents** пишут, тестят и деплоят.

Это и есть будущее разработки SDLC
