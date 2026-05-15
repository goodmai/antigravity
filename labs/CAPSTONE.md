# Урок 20: Capstone Project — Спецификация "TeleDrive Ecosystem"

Финальный проект курса Antigravity — это сложная распределенная система, объединяющая мессенджер, персональную базу знаний и облачное хранилище.

**Цель проекта**: Создать бесшовный мост между Telegram, Obsidian и Google Services, управляемый через Android-клиент.

## 👤 User Cases (Сценарии Использования)

1.  **Fast Capture ("Быстрая заметка")**
    - **User**: Отправляет голосовое сообщение или текст в бот.
    - **System**: Транскрибирует (Whisper), сохраняет в `Obsidian/Inbox/Telegram.md`.
2.  **Meeting Prep ("Подготовка ко встрече")**
    - **User**: Создает встречу в Google Calendar "Sync with CTO".
    - **System**: Создает заметку в Obsidian с шаблоном встречи, ссылкой на Meet и списком участников.
3.  **Knowledge Base ("База знаний")**
    - **User**: Пересылает PDF-статью в бот с хештегом `#read`.
    - **System**: Грузит файл в Drive, создает запись в Obsidian с прямой ссылкой на Drive.
4.  **Secure Login ("Безопасный вход")**
    - **User**: Нажимает "Log in with Telegram" в Android приложении.
    - **System**: Связывает Google-аккаунт с Telegram ID без передачи паролей (OAuth).

---

## 🏗️ 1. Архитектура и Паттерны Микросервисов

Мы строим систему, устойчивую к сбоям. Каждый сервис реализует специфические паттерны.

### 1.1 `td-bot-gateway` (Telegram Bot)

- **Pattern**: _BFF (Backend for Frontend)_ для Телеграма.
- **Logic**: Принимает команды `/save_note`, `/sync_chat`. Обрабатывает Webhook.
- **Resilience**: _Circuit Breaker_ при обращении к другим сервисам.

### 1.2 `td-auth-service` (Identity Provider)

- **Pattern**: _Token Service_. Хранит Refresh Tokens.
- **Security**: Шифрование токенов (AES-GCM). Реализует ротацию ключей.

### 1.3 `td-ingest-worker` (Async ETL)

- **Pattern**: _Pipeline_. Получает сырые данные (сообщения) -> Трансформирует (Markdown) -> Загружает (Drive).
- **Queue**: Redis Stream (`ingest_events`). Гарантия доставки _At-least-once_.

### 1.4 `td-obsidian-sync` (Knowledge Bridge)

- **Pattern**: _Adapter/Bridge_. Преобразует Calendar Events в Obsidian Markdown.

---

## 🐍 2. Technology Stack (Detailed)

Версии зафиксированы для воспроизводимости (Pin versions).

### Core Libraries (Python 3.12)

- `fastapi==0.110.0`: API Gateway.
- `uvicorn[standard]==0.27.0`: ASGI Server.
- `aiogram==3.4.0`: Лучший фреймворк для Telegram ботов.
- `pydantic==2.6.0`: Валидация данных.
- `sqlalchemy==2.0.27` + `asyncpg`: Работа с PostgreSQL.
- `redis==5.0.1`: Очереди и кэш.

### Integrations

- `aiogoogle==5.4.0`: Асинхронный клиент для Google API.
- `tenacity==8.2.3`: Retry policy (повторные попытки при 429 ошибках).

### Recommmended MCP & Skills

- **MCP**:
  - `postgres`: Для миграций и дебага данных.
  - `google-drive`: Для проверки загруженных файлов прямо из чата.
- **Skills**:
  - `/qaqase`: Импорт тест-кейсов для сценариев интеграции.
  - `/security-checker`: Аудит OAuth скоупов.

---

## 📱 3. Сценарии Интеграции (Бизнес-Логика)

### Сценарий A: "Чат в Заметку" (Chat-to-Note)

**User Story**: "Я хочу сохранить важную переписку с клиентом в Obsidian, прилинковав файлы."

1.  Юзер пишет команду `/save_chat` (или выбирает в меню Android).
2.  **Bot** запрашивает диапазон сообщений или выгружает последние N.
3.  **Worker** формирует Markdown-файл:

    ```markdown
    # Чат с @username от 2024-05-20

    **Tags**: #telegram #import

    - [14:00] **User**: Привет, вот ТЗ.
    - [14:01] **Client**: [Файл ТЗ.pdf](gdrive_link)
    ```

4.  Файлы загружаются в Google Drive `/Obsidian/Attachments/`.
5.  Markdown сохраняется в Google Drive `/Obsidian/Inbox/`.
6.  (Опционально) Obsidian Sync подтягивает файл на десктоп.

### Сценарий B: "Календарь в Daily Note"

1.  Сервис видит встречу в Google Calendar: "Call with Team at 10:00".
2.  Ищет файл `Daily/2024-05-20.md`.
3.  Добавляет (Append) секцию:

    ```markdown
    ## 10:00 Call with Team

    - [ ] Подготовить отчет
    - Link: [Google Meet](...)
    ```

4.  Если заметки нет — создает её по шаблону.

---

## 🛠️ 4. Infrastructure & CI

### 4.1 Тестовый Профиль (`docker-compose.test.yml`)

Для CI тестов мы поднимаем "чистое" окружение без внешних зависимостей (Google API мокается).

```yaml
version: "3.8"
services:
  db_test:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: test_db
    tmpfs: ["/var/lib/postgresql/data"] # Быстрый RAM-диск

  redis_test:
    image: redis:7-alpine

  integration_tests:
    build:
      context: .
      dockerfile: Dockerfile.test
    environment:
      DATABASE_URL: postgresql://postgres@db_test/test_db
      GOOGLE_API_MOCK_URL: http://mock-server:8000
    depends_on:
      - db_test
      - redis_test
```

### 4.2 Требования к Резервированию (Disaster Recovery)

1.  **State Sync**: ID обработанных сообщений хранить в Postgres, а не Redis (чтобы не потерять при рестарте).
2.  **Backpressure**: Если Google API отдает 429, воркер должен засыпать (Exponential Backoff) и не брать новые задачи из Redis.
3.  **Dead Letter Queue (DLQ)**: Если сообщение не удалось обработать 5 раз — скидываем в DLQ для ручного разбора.

---

## 📅 5. SDLC и Порядок Разработки

Мы следуем процессу из Урока 19.

### Step 1: Прототип (Identity)

- Поднять `auth-service`.
- Реализовать Android App с кнопкой "Sign in with Google".
- Проверить получение токенов.

### Step 2: Бот-Коннектор

- Реализовать `td-bot-gateway`.
- Сделать диплинк авторизации (связать `tg_id` с базой).

### Step 3: Google Drive Integration

- Написать `td-replicator`.
- Реализовать загрузку одного файла.
- Написать тесты с моком Google API.

### Step 4: Бизнес-Логика (Obsidian)

- Реализовать парсинг Markdown.
- Настроить синхронизацию с календарем.

### Step 5: Production & CI

- Настроить GitHub Actions.
- Внедрить Sentry и Prometheus.

---

## 📝 Агентное Задание (Homework)

1.  Создайте `docker-compose.test.yml` по образцу.
2.  Напишите **Pydantic модель** для структуры заметки Obsidian (Frontmatter + Content).
3.  Используя скилл `/qaqase`, опишите тест-кейс для сценария "Google Token Expired -> Refresh -> Upload Success".

Это ваш финальный экзамен. Постройте систему, которой будете пользоваться сами!
