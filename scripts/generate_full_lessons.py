#!/usr/bin/env python3
"""
Генерирует полный учебный контент для всех уроков Antigravity
с объяснениями для новичков, примерами и источниками.
"""

from pathlib import Path

LESSONS = {
    1: {
        "title": "Режимы агента Antigravity",
        "content": """# Урок 1: Режимы агента Antigravity

## Введение

Antigravity предоставляет несколько режимов работы для разных типов задач. Понимание этих режимов - первый шаг к эффективной работе с агентом.

## Режимы диалога

### Planning Mode (Режим планирования)

**Когда использовать**: Сложные задачи, требующие тщательного анализа.

- Агент создает подробный план перед выполнением
- Требует вашего одобрения на каждом этапе
- Идеален для архитектурных решений и критичного кода

**Процесс**:
```
1. Вы формулируете задачу
   ↓
2. Агент анализирует требования
   ↓
3. Создается implementation_plan.md
   ↓
4. Вы комментируете и одобряете план
   ↓
5. Агент переходит к выполнению
```

**Пример**: "Добавь аутентификацию через OAuth2 в мое приложение"

### Fast Mode (Быстрый режим)

**Когда использовать**: Простые и понятные задачи.

- Пропускает этап детального планирования
- Выполняет сразу
- Экономит время и токены

**Процесс**:
```
1. Задача → 2. Анализ → 3. Выполнение → 4. Результат
```

**Пример**: "Переименуй переменную `temp` на `temperature`"

## Правила и конфигурация

### Глобальные правила

Находятся в `~/.claude/CLAUDE.md`

**Примеры правил**:
```markdown
# Глобальные правила для всех проектов

- Всегда отвечай на русском языке
- Используй TypeScript вместо JavaScript
- Пиши тесты перед кодом (TDD)
- Соблюдай стиль Google
```

### Локальные правила

Находятся в `.agent/rules/` вашего проекта

**Пример структуры**:
```
.agent/rules/
├── typescript-style.md
├── testing-rules.md
└── api-design.md
```

## Фазы агентного цикла

### 1. PLANNING (Планирование)
- Анализ требований
- Создание плана
- Обсуждение с пользователем

### 2. EXECUTION (Выполнение)
- Написание кода
- Создание файлов
- Выполнение команд

### 3. VERIFICATION (Проверка)
- Запуск тестов
- Проверка функциональности
- Создание отчета

## Практические задания

1. Создайте новый диалог в режиме Planning и попросите план для простого проекта
2. Создайте то же в режиме Fast и сравните результаты
3. Добавьте правило в `.agent/rules/` и проверьте, применяется ли оно
4. Используйте комментарии в плане для уточнений

## Ключевые концепции

- **Planning Mode** - для сложных задач с высокими требованиями
- **Fast Mode** - для простых, понятных задач
- **Глобальные правила** - стандарты для всех проектов
- **Локальные правила** - специфика текущего проекта
- **Фазы цикла** - Planning → Execution → Verification

## Рекомендуемые источники

1. [Claude Code Documentation](https://code.claude.com/docs)
2. [Anthropic's Best Practices](https://docs.anthropic.com)
3. AI-Assisted Development Best Practices
4. Software Architecture Patterns"""
    },

    2: {
        "title": "Система артефактов и обратная связь",
        "content": """# Урок 2: Система артефактов и обратная связь

## Что такое артефакты?

Артефакты - это отдельные файлы, которые создает агент для:
- **Планирования** - документирование подхода
- **Отслеживания** - ведение чеклистов
- **Результатов** - сохранение итогов работы

## Типы артефактов

### implementation_plan.md

Технический план перед разработкой.

**Содержит**:
- Описание подхода
- Список файлов для создания/изменения
- Технические решения
- Потенциальные риски

**Ваша роль**:
1. Прочитать план
2. Оставить комментарии
3. Одобрить или запросить изменения

### walkthrough.md

Отчет о проделанной работе.

**Содержит**:
- Что было сделано
- Результаты тестов
- Ссылки на измененные файлы
- Рекомендации для будущего

### Другие артефакты

- `todo.md` - чеклист задач
- `research.md` - результаты исследований
- `design.md` - дизайн-документы

## Цикл обратной связи

### Процесс взаимодействия

```
1. Агент создает план
   ↓
2. Вы оставляете комментарии
   ↓
3. Агент обновляет план
   ↓
4. Вы одобряете (LGTM)
   ↓
5. Агент выполняет
   ↓
6. Агент создает отчет
```

### Как комментировать

**На строке**: Кликните на номер строки и напишите комментарий

**Пример**:
```markdown
Используй FastAPI вместо Django,
это более легковесно для этого проекта
```

**Общий комментарий**: Просто напишите в чате

## Горячие клавиши

| Клавиша | Действие | Где использовать |
|---------|----------|-----------------|
| Ctrl+L | Общее обсуждение | Архитектура и контекст |
| Ctrl+I | Встроенные правки | Прямо в коде или тексте |
| Ctrl+Shift+L | Асинхронные задачи | Параллельное выполнение |

## Практические примеры

### Пример 1: Добавление функции

```
Вы: "Добавь функцию для расчета факториала"
   ↓
Агент создает implementation_plan.md
   ↓
Вы: "Добавь оптимизацию с кэшированием"
   ↓
Агент обновляет план
   ↓
Вы: "Одобряю"
   ↓
Агент пишет код и тесты
```

### Пример 2: Code Review через артефакты

```
Вы: "Проверь мой код на проблемы"
   ↓
Агент создает review.md
   ↓
Вы видите issues с номерами строк
   ↓
Вы кликаете на строку и добавляете вопрос
   ↓
Агент отвечает
```

## Практические задания

1. Создайте задачу и дождитесь plan - не одобряйте сразу
2. Оставьте комментарий на одной из строк плана
3. Посмотрите, как агент обновит план
4. Создайте локальный файл `.agent/rules/` и проверьте его применение
5. Используйте Ctrl+I для встроенной правки

## Ключевые концепции

- **Артефакты** - отдельные файлы для организации работы
- **Обратная связь** - комментарии улучшают результат
- **Итеративный процесс** - несколько итераций перед финалом
- **Контроль качества** - вы остаетесь в процессе разработки

## Рекомендуемые источники

1. Claude Code Artifacts Documentation
2. Feedback Loops in AI Systems - Research Papers
3. Iterative Design Principles"""
    },

    6: {
        "title": "Git и система контроля версий в Antigravity",
        "content": """# Урок 6: Git и система контроля версий

## Почему Git важен?

Git позволяет:
- Отслеживать изменения
- Откатываться на предыдущие версии
- Работать в командах
- Разделять функциональность (ветки)

## Основные команды

### git status

```bash
$ git status
```

Показывает текущее состояние репозитория:
- Какие файлы изменены
- Какие файлы не отслеживаются
- На какой ветке вы находитесь

### git add

```bash
$ git add file.txt      # Добавить один файл
$ git add .            # Добавить все файлы
$ git add src/*.js     # Добавить файлы по шаблону
```

Подготавливает файлы к коммиту.

### git commit

```bash
$ git commit -m "Описание изменений"
```

Сохраняет изменения с описанием.

**Хорошее описание** коммита:
```
Добавлена функция сортировки массивов

- Использует алгоритм QuickSort
- Добавлены тесты для проверки
- Оптимизирована для больших массивов
```

### git push

```bash
$ git push origin main
```

Отправляет коммиты на сервер.

### git pull

```bash
$ git pull origin main
```

Получает последние изменения с сервера.

## Ветки (Branches)

Ветки позволяют работать над разными функциями одновременно.

```
main (основная версия)
├── feature/auth (нова функция)
└── bugfix/login (исправление ошибки)
```

### Создание ветки

```bash
$ git checkout -b feature/new-feature
```

или

```bash
$ git branch feature/new-feature
$ git checkout feature/new-feature
```

### Слияние (Merge)

```bash
$ git checkout main
$ git merge feature/new-feature
```

Объединяет ветки.

## Практический рабочий процесс

```
1. git checkout -b feature/feature-name    # Создать ветку
   ↓
2. [Делать изменения]
   ↓
3. git add .                                # Подготовить
   ↓
4. git commit -m "Описание"                 # Сохранить
   ↓
5. git push origin feature/feature-name     # Отправить
   ↓
6. [Создать Pull Request на GitHub]
   ↓
7. git checkout main                        # Вернуться на main
   ↓
8. git pull origin main                     # Получить обновления
   ↓
9. git merge feature/feature-name           # Слить изменения
```

## Работа с Antigravity и Git

Агент может:
- Создавать ветки автоматически
- Писать понятные комментарии коммитов
- Откатываться на предыдущие версии
- Создавать Pull Requests

**Пример**:
```
Вы: "Добавь функцию логирования"
   ↓
Агент создает: git checkout -b feature/logging
   ↓
Агент пишет код и коммитит
   ↓
Агент создает Pull Request
```

## Частые ошибки и как их избежать

| Ошибка | Как избежать |
|--------|-------------|
| Забыли закоммитить | git add + commit перед push |
| Конфликт при merge | git pull перед началом работы |
| Случайное удаление | Используйте git reset перед rm |
| Забыли создать ветку | Всегда используйте git checkout -b |

## Практические задания

1. Создайте новую ветку и напишите простой скрипт
2. Сделайте commit с понятным описанием
3. Переключитесь на main и вернитесь обратно
4. Попросите агента создать feature branch

## Ключевые концепции

- **Коммиты** - снимки состояния проекта
- **Ветки** - параллельная разработка
- **Push/Pull** - синхронизация с сервером
- **Merge** - объединение веток

## Рекомендуемые источники

1. [Git Documentation](https://git-scm.com/doc)
2. [GitHub Learning Lab](https://lab.github.com)
3. Pro Git (Chacon & Straub) - бесплатная книга"""
    },

    3: {
        "title": "Инструменты и среда разработки",
        "content": """# Урок 3: Инструменты и среда разработки

## IDE и текстовые редакторы

### VS Code

Легкий и мощный редактор с множеством расширений.

### PyCharm

Специализированный IDE для Python разработки.

### IntelliJ IDEA

Мощный IDE с поддержкой многих языков.

## Необходимые инструменты

- Git - контроль версий
- Node.js / npm - для JavaScript
- Python - для Python проектов
- Docker - контейнеризация

## Практические задания

1. Установите VS Code
2. Установите необходимые расширения
3. Настройте синхронизацию кода

## Рекомендуемые источники

1. [VS Code Documentation](https://code.visualstudio.com/docs)
2. IDE Documentation"""
    },

    4: {
        "title": "Основы веб-разработки",
        "content": """# Урок 4: Основы веб-разработки

## HTML основы

HTML - структура веб-страницы.

```html
<!DOCTYPE html>
<html>
<body>
<h1>Заголовок</h1>
<p>Абзац текста</p>
</body>
</html>
```

## CSS основы

CSS - стилизация веб-страницы.

```css
body {
    background-color: #f0f0f0;
    font-family: Arial;
}

h1 {
    color: blue;
}
```

## JavaScript основы

JavaScript - интерактивность веб-страницы.

```javascript
// Простая функция
function hello() {
    alert("Привет!");
}
```

## Практические задания

1. Создайте простую HTML страницу
2. Добавьте CSS стили
3. Добавьте JavaScript интерактивность

## Рекомендуемые источники

1. [MDN Web Docs](https://developer.mozilla.org/)
2. "Eloquent JavaScript" (Marijn Haverbeke)"""
    },

    5: {
        "title": "Фреймворки и библиотеки",
        "content": """# Урок 5: Фреймворки и библиотеки

## Зачем нужны фреймворки?

Фреймворки предоставляют:
- Готовые компоненты
- Структуру проекта
- Best practices
- Экосистему инструментов

## Популярные фреймворки

### React (JavaScript)

Библиотека для создания UI.

### Vue.js

Прогрессивный фреймворк для веб-приложений.

### Django (Python)

Фреймворк для веб-приложений на Python.

### Flask (Python)

Микрофреймворк для Python.

## Практические задания

1. Выберите один фреймворк
2. Создайте простое приложение
3. Изучите документацию

## Рекомендуемые источники

1. [React Documentation](https://react.dev/)
2. [Vue.js Documentation](https://vuejs.org/)
3. [Django Documentation](https://www.djangoproject.com/)"""
    },

    6: {
        "title": "Git и система контроля версий",
        "content": """# Урок 6: Git и система контроля версий

## Основные команды

### git init

Инициализация репозитория.

### git add

Подготовка файлов для коммита.

### git commit

Сохранение изменений.

### git push

Отправка коммитов на сервер.

## Практические задания

1. Инициализируйте репозиторий
2. Добавьте файлы
3. Сделайте коммит

## Рекомендуемые источники

1. [Git Documentation](https://git-scm.com/doc)
2. [GitHub Learning Lab](https://lab.github.com)"""
    },

    7: {
        "title": "Тестирование и обеспечение качества",
        "content": """# Урок 7: Тестирование и обеспечение качества

## Зачем нужны тесты?

Тесты помогают:
- Убедиться, что код работает правильно
- Предотвратить регрессии (появление старых багов)
- Документировать ожидаемое поведение
- Облегчить рефакторинг

## Типы тестов

### Unit Tests (Модульные тесты)

Тестируют отдельные функции.

**Пример**:
```python
def test_add():
    assert add(2, 3) == 5
    assert add(-1, 1) == 0
    assert add(0, 0) == 0
```

### Integration Tests (Тесты интеграции)

Тестируют взаимодействие компонентов.

**Пример**:
```python
def test_user_registration():
    # Создание пользователя
    user = create_user("john", "password")

    # Проверка БД
    assert find_user("john") is not None

    # Проверка логирования
    assert is_logged_in("john")
```

### E2E Tests (End-to-End тесты)

Тестируют весь процесс от начала до конца.

**Пример**:
```javascript
// Тест веб-приложения
1. Открыть браузер
2. Перейти на сайт
3. Заполнить форму
4. Нажать кнопку
5. Проверить результат
```

## Инструменты тестирования

| Язык | Инструмент | Пример |
|------|-----------|--------|
| Python | pytest, unittest | python -m pytest |
| JavaScript | Jest, Mocha | npm test |
| Java | JUnit, TestNG | mvn test |
| Go | testing | go test |

## TDD (Test-Driven Development)

Подход: сначала напишите тест, потом код.

```
1. Напишите тест (Red)
   ↓
2. Запустите - не пройдет
   ↓
3. Напишите минимальный код (Green)
   ↓
4. Запустите - пройдет
   ↓
5. Улучшите код (Refactor)
```

**Пример**:

```python
# 1. Тест (Red)
def test_calculate_discount():
    price = 100
    discount = 0.1
    result = calculate_discount(price, discount)
    assert result == 90  # Тест не пройдет

# 2. Минимальный код (Green)
def calculate_discount(price, discount):
    return price - (price * discount)

# 3. Рефакторинг (Refactor)
def calculate_discount(price, discount):
    """Рассчитать цену после скидки"""
    return price * (1 - discount)
```

## Coverage (Покрытие кода)

Какой процент кода покрыт тестами?

```bash
pytest --cov=src
coverage report
```

**Цели**:
- Новый код: >80% покрытие
- Критичный код: >95% покрытие
- Общее: минимум >70%

## Практические задания

1. Напишите 3 unit теста для простой функции
2. Используйте TDD для реализации новой функции
3. Запустите тесты через агента
4. Проверьте coverage

## Ключевые концепции

- **Unit тесты** - быстро и фокусированные
- **Integration тесты** - проверяют взаимодействие
- **E2E тесты** - полный процесс
- **TDD** - тест перед кодом
- **Coverage** - метрика качества

## Рекомендуемые источники

1. [Testing Best Practices](https://docs.pytest.org/)
2. "The Art of Software Testing" (Glenford Myers)
3. Test-Driven Development (Kent Beck)"""
    },

    11: {
        "title": "Терминал, безопасность и режим Turbo",
        "content": """# Урок 11: Терминал, безопасность и режим Turbo

## Три режима работы с терминалом

### 1. Off (Ручной)

Агент только предлагает команды, вы копируете и выполняете сами.

**Когда использовать**:
- Параноидальная безопасность
- Новички, изучающие команды
- Критичные операции с данными

**Процесс**:
```
Вы: "Покажи, как удалить файл"
   ↓
Агент: "Используй: rm file.txt"
   ↓
Вы копируете и вводите команду
```

### 2. Auto (Интеллектуальный) - Рекомендуется

Безопасные команды выполняются молча, опасные требуют подтверждения.

**Безопасные команды** (выполняются без спроса):
```bash
ls              # Список файлов
cat file.txt    # Показать содержимое
echo "hello"    # Вывести текст
pwd             # Текущая директория
find . -name    # Поиск файлов
```

**Опасные команды** (требуют подтверждения):
```bash
rm -rf /        # Удаление
docker system prune  # Удаление контейнеров
sudo            # Повышение прав
chmod 777       # Изменение прав
```

### 3. Turbo (Автономный)

Агент выполняет всё, кроме явно запрещенных команд.

**Когда использовать**:
- Массовый рефакторинг
- Большие проекты с чистым git-деревом
- Автоматизированные процессы

**Предосторожность**:
```bash
# Перед режимом Turbo всегда:
git status          # Убедиться в чистоте
git add .          # Подготовить файлы
git commit -m "Бэкап перед Turbo"
```

## Списки безопасности (Allow/Deny Lists)

### Deny List (Черный список)

Команды, которые **никогда** не выполняются:

```
rm -rf /
dd if=/dev/urandom of=/dev/sda
curl http://suspicious-site.com/malware
```

### Allow List (Белый список)

Команды, которые выполняются без подтверждения:

```
npm test
npm install
git status
git commit
pytest
```

## Inline Commands (Cmd+I / Ctrl+I)

Генерируйте сложные команды на естественном языке.

**Пример**:
```
Вы: "Найди все файлы логов, измененные за час, и покажи ошибки 500"

Агент генерирует:
find . -name "*.log" -mmin -60 | xargs grep "500"
```

**Используйте для**:
- Сложных find команд
- Пайпов и регулярных выражений
- Одноразовых скриптов

## Безопасность и best practices

| Сценарий | Режим | Allow List | Примечание |
|----------|-------|-----------|-----------|
| Новичок | Off | - | Учитесь на примерах |
| Разработка | Auto | npm test, git | Стандартный режим |
| CI/CD | Auto | npm install, npm build | Автоматизация |
| Рефакторинг | Turbo | Расширенный | С git backup |
| Production | Off | Только read | Максимальная безопасность |

## Практические задания

1. Переключитесь в режим Auto
2. Попросите агента создать файл и удалить его - заметьте разницу в подтверждениях
3. Добавьте команды в Allow List
4. Используйте Cmd+I для генерации сложной команды
5. Практикуйте режим Off для учебных целей

## Ключевые концепции

- **Off Mode** - полный контроль, медленнее
- **Auto Mode** - баланс безопасности и удобства
- **Turbo Mode** - скорость с риском
- **Allow/Deny Lists** - гранулярный контроль
- **Inline Commands** - генерация на естественном языке

## Рекомендуемые источники

1. [Linux Command Line Bible](https://www.gnu.org/software/bash/manual/)
2. Security Best Practices for AI Systems
3. OWASP Top 10 (для безопасности)"""
    },

    13: {
        "title": "Автоматизация и скрипты",
        "content": """# Урок 13: Автоматизация и скрипты

## Зачем нужна автоматизация?

Автоматизация позволяет:
- Экономить время на рутинные задачи
- Избежать ошибок
- Запускать процессы по расписанию
- Интегрировать системы

## Типы скриптов

### Shell Scripts (Bash/Sh)

Автоматизируют операции в терминале.

**Пример**: Резервная копия файлов

```bash
#!/bin/bash

SOURCE="/home/user/documents"
BACKUP="/backup/documents"
DATE=$(date +%Y%m%d)

cp -r $SOURCE $BACKUP/backup_$DATE
echo "Бэкап создан: $BACKUP/backup_$DATE"
```

### Python Scripts

Автоматизируют сложные процессы.

**Пример**: Обработка данных

```python
#!/usr/bin/env python3

import csv
import os

def process_data(filename):
    with open(filename, 'r') as f:
        reader = csv.DictReader(f)
        for row in reader:
            print(f"Обработка: {row['name']}")

if __name__ == "__main__":
    process_data("data.csv")
```

### JavaScript/Node.js

Автоматизируют веб-процессы.

**Пример**: Скачивание данных

```javascript
const axios = require('axios');
const fs = require('fs');

async function downloadData(url, filename) {
  try {
    const response = await axios.get(url);
    fs.writeFileSync(filename, JSON.stringify(response.data, null, 2));
    console.log(`Скачано в: ${filename}`);
  } catch (error) {
    console.error(`Ошибка: ${error.message}`);
  }
}

downloadData('https://api.example.com/data', 'data.json');
```

## Расписания (Cron)

Запуск скриптов по расписанию.

```bash
# Формат: минуты часы дни месяцы дни_недели команда
0 0 * * * /home/user/backup.sh        # Каждый день в 00:00
*/5 * * * * /home/user/check.py       # Каждые 5 минут
0 2 * * 0 /home/user/clean.sh         # Каждое воскресенье в 02:00
```

## Практические примеры

### Пример 1: Очистка логов

```bash
#!/bin/bash

LOG_DIR="/var/log/myapp"
DAYS=30

find $LOG_DIR -name "*.log" -mtime +$DAYS -delete
echo "Логи старше $DAYS дней удалены"
```

### Пример 2: Синхронизация кода

```bash
#!/bin/bash

REPO="/home/user/myproject"
cd $REPO

git pull origin main
npm test
npm run build

if [ $? -eq 0 ]; then
  npm run deploy
  echo "Развертывание успешно"
else
  echo "Ошибка при тестировании"
fi
```

### Пример 3: Мониторинг сервера

```python
#!/usr/bin/env python3

import psutil
import smtplib

def check_resources():
    cpu = psutil.cpu_percent(interval=1)
    memory = psutil.virtual_memory().percent

    if cpu > 90:
        send_alert(f"CPU: {cpu}%")
    if memory > 90:
        send_alert(f"Memory: {memory}%")

def send_alert(message):
    # Отправка email
    print(f"Alert: {message}")

if __name__ == "__main__":
    check_resources()
```

## Работа с Antigravity

Агент может:
- Написать скрипт для вас
- Объяснить, как его запустить
- Добавить в cron расписание
- Протестировать скрипт

**Пример**:
```
Вы: "Напиши скрипт для резервной копии моих проектов"
   ↓
Агент создает backup.sh
   ↓
Агент: "Запусти: chmod +x backup.sh && crontab -e"
   ↓
Вы добавляете в cron
```

## Практические задания

1. Напишите простой bash скрипт (с агентом)
2. Запустите его и проверьте результат
3. Добавьте скрипт в cron для ежедневного запуска
4. Создайте Python скрипт обработки файлов
5. Установите мониторинг какого-то процесса

## Ключевые концепции

- **Shell Scripts** - быстрые и легкие
- **Python Scripts** - мощные и гибкие
- **Cron** - автоматизация по расписанию
- **Error Handling** - обработка ошибок
- **Logging** - запись результатов

## Рекомендуемые источники

1. [GNU Bash Manual](https://www.gnu.org/software/bash/manual/)
2. [Python Automation](https://docs.python.org/3/library/)
3. [Cron Tutorial](https://help.ubuntu.com/community/CronHowto)"""
    },

    14: {
        "title": "API и веб-интеграции",
        "content": """# Урок 14: API и веб-интеграции

## Что такое API?

API (Application Programming Interface) - способ программ общаться друг с другом.

**Аналогия**: Как меню в ресторане
- **Меню** = API документация
- **Блюдо** = Ответ сервера
- **Заказ** = Ваш запрос

## HTTP методы

### GET

Получить данные.

```bash
curl https://api.github.com/users/github
```

### POST

Создать новые данные.

```bash
curl -X POST https://api.example.com/users \\
  -H "Content-Type: application/json" \\
  -d '{"name": "John", "age": 30}'
```

### PUT

Обновить существующие данные.

```bash
curl -X PUT https://api.example.com/users/1 \\
  -d '{"name": "Jane"}'
```

### DELETE

Удалить данные.

```bash
curl -X DELETE https://api.example.com/users/1
```

## REST API

Принципы проектирования API.

### Пример REST структуры

```
GET    /api/users          → Получить список пользователей
GET    /api/users/1        → Получить пользователя 1
POST   /api/users          → Создать пользователя
PUT    /api/users/1        → Обновить пользователя 1
DELETE /api/users/1        → Удалить пользователя 1
```

## Коды ответов

| Код | Значение | Пример |
|-----|----------|--------|
| 200 | OK | Успешный запрос |
| 201 | Created | Ресурс создан |
| 400 | Bad Request | Неверные параметры |
| 401 | Unauthorized | Требуется аутентификация |
| 403 | Forbidden | Доступ запрещен |
| 404 | Not Found | Ресурс не найден |
| 500 | Server Error | Ошибка сервера |

## Практические примеры

### Пример 1: Получение данных

```python
import requests

response = requests.get('https://api.github.com/users/octocat')
user = response.json()

print(f"Имя: {user['name']}")
print(f"Компания: {user['company']}")
```

### Пример 2: Создание данных

```python
import requests

data = {
    'title': 'Новая задача',
    'description': 'Описание задачи',
    'priority': 'high'
}

response = requests.post(
    'https://api.example.com/tasks',
    json=data,
    headers={'Authorization': 'Bearer token123'}
)

task = response.json()
print(f"Создана задача: {task['id']}")
```

### Пример 3: Обработка ошибок

```python
import requests

try:
    response = requests.get(
        'https://api.example.com/users/999',
        timeout=5
    )
    response.raise_for_status()  # Выбросит исключение если 4xx/5xx
    user = response.json()
except requests.exceptions.NotFound:
    print("Пользователь не найден")
except requests.exceptions.Timeout:
    print("Истекло время ожидания")
except requests.exceptions.RequestException as e:
    print(f"Ошибка: {e}")
```

## Аутентификация

### API Key

```python
headers = {
    'Authorization': 'Bearer your_api_key'
}
response = requests.get(url, headers=headers)
```

### Basic Auth

```python
from requests.auth import HTTPBasicAuth

response = requests.get(
    url,
    auth=HTTPBasicAuth('username', 'password')
)
```

### OAuth2

Безопаснейший способ:
1. Пользователь логинится на сайте
2. Сайт дает токен
3. Вы используете токен для API

## Работа с Antigravity

Агент может:
- Написать код для API вызовов
- Обработать ошибки
- Документировать API
- Создать простой API сервер

**Пример**:
```
Вы: "Напиши скрипт, который получает данные из GitHub API"
   ↓
Агент: создает скрипт с обработкой ошибок
   ↓
Вы: "Добавь авторизацию через токен"
   ↓
Агент: обновляет скрипт
```

## Практические задания

1. Сделайте GET запрос к публичному API (например, GitHub)
2. Обработайте возможные ошибки
3. Спарсите JSON ответ
4. Сделайте POST запрос с данными
5. Используйте API ключ для защиты

## Ключевые концепции

- **REST** - архитектурный стиль
- **HTTP методы** - GET, POST, PUT, DELETE
- **Коды ответов** - индикатор успеха/ошибки
- **JSON** - формат данных
- **Аутентификация** - безопасный доступ

## Рекомендуемые источники

1. [REST API Best Practices](https://restfulapi.net/)
2. [Python Requests Library](https://requests.readthedocs.io/)
3. [GitHub API Documentation](https://docs.github.com/en/rest)"""
    },

    15: {
        "title": "Docker контейнеризация",
        "content": """# Урок 15: Docker контейнеризация

## Что такое Docker?

Docker позволяет упаковать приложение со всеми зависимостями в контейнер.

**Аналогия**: Контейнер - это коробка с приложением
- Приложение внутри
- Все зависимости внутри
- Работает везде, где есть Docker

## Основные концепции

### Image (Образ)

Шаблон для создания контейнеров.

```bash
docker build -t myapp:1.0 .
```

### Container (Контейнер)

Работающий экземпляр образа.

```bash
docker run -d --name mycontainer myapp:1.0
```

### Registry (Реестр)

Хранилище образов (Docker Hub, GitLab).

```bash
docker push myusername/myapp:1.0
```

## Dockerfile

Рецепт для создания образа.

```dockerfile
FROM python:3.9

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

CMD ["python", "app.py"]
```

**Разберемся**:
- `FROM` - базовый образ (ОС + Python)
- `WORKDIR` - рабочая директория в контейнере
- `COPY` - копировать файлы
- `RUN` - выполнить команду
- `CMD` - команда при запуске

## Основные команды

### Создание образа

```bash
docker build -t myapp:1.0 .
```

### Запуск контейнера

```bash
docker run -d \\
  --name mycontainer \\
  -p 8080:8080 \\
  myapp:1.0
```

Флаги:
- `-d` - фоновое выполнение
- `-p` - проброс портов
- `-e` - переменные окружения
- `-v` - подключение томов

### Просмотр контейнеров

```bash
docker ps          # Работающие
docker ps -a       # Все
```

### Логи контейнера

```bash
docker logs mycontainer
docker logs -f mycontainer    # Следить в реальном времени
```

### Остановка и удаление

```bash
docker stop mycontainer
docker rm mycontainer
```

## Docker Compose

Управление несколькими контейнерами.

```yaml
version: '3'

services:
  web:
    build: .
    ports:
      - "8080:8080"
    environment:
      - DEBUG=True

  db:
    image: postgres:13
    environment:
      - POSTGRES_PASSWORD=secret
    volumes:
      - db_data:/var/lib/postgresql/data

volumes:
  db_data:
```

**Запуск**:
```bash
docker-compose up -d
docker-compose down
```

## Практические примеры

### Пример 1: Python приложение

```dockerfile
FROM python:3.9-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 5000
CMD ["python", "app.py"]
```

### Пример 2: Node.js приложение

```dockerfile
FROM node:16-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3000
CMD ["node", "index.js"]
```

## Работа с Antigravity

Агент может:
- Написать Dockerfile
- Создать docker-compose.yml
- Запустить контейнеры
- Отладить проблемы контейнеризации

**Пример**:
```
Вы: "Контейнеризируй мое Python приложение"
   ↓
Агент: создает Dockerfile
   ↓
Агент: docker build -t myapp .
   ↓
Агент: docker run -p 5000:5000 myapp
```

## Best Practices

1. Используйте небольшие базовые образы (alpine)
2. Кэшируйте слои правильно
3. Не запускайте от root
4. Удаляйте временные файлы
5. Используйте .dockerignore

## Практические задания

1. Создайте Dockerfile для простого приложения
2. Постройте образ и запустите контейнер
3. Проверьте логи контейнера
4. Создайте docker-compose.yml с 2 сервисами
5. Остановите и удалите контейнеры

## Ключевые концепции

- **Image** - шаблон
- **Container** - работающий экземпляр
- **Dockerfile** - рецепт
- **Docker Compose** - управление несколькими сервисами
- **Registry** - хранилище образов

## Рекомендуемые источники

1. [Docker Documentation](https://docs.docker.com/)
2. [Docker Best Practices](https://docs.docker.com/develop/dev-best-practices/)
3. "Docker Deep Dive" (Nigel Poulton)"""
    },

    16: {
        "title": "CI/CD конвейеры",
        "content": """# Урок 16: CI/CD конвейеры

## Что такое CI/CD?

**CI** (Continuous Integration) - автоматическое тестирование кода
**CD** (Continuous Deployment) - автоматическое развертывание

## Процесс CI/CD

```
Вы делаете commit
    ↓
GitHub запускает workflow
    ↓
Код тестируется автоматически
    ↓
Если тесты прошли - код развертывается
    ↓
Приложение обновляется в продакшене
```

## GitHub Actions

Система автоматизации для GitHub.

### Пример workflow файла

```yaml
name: CI/CD

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
    - uses: actions/checkout@v2

    - name: Set up Python
      uses: actions/setup-python@v2
      with:
        python-version: 3.9

    - name: Install dependencies
      run: |
        pip install pytest
        pip install -r requirements.txt

    - name: Run tests
      run: pytest

    - name: Deploy
      if: success()
      run: ./deploy.sh
```

## Стадии конвейера

### 1. Build

Компилирование кода.

```yaml
- name: Build
  run: |
    npm install
    npm run build
```

### 2. Test

Запуск тестов.

```yaml
- name: Test
  run: npm test
```

### 3. Deploy

Развертывание в продакшене.

```yaml
- name: Deploy
  run: npm run deploy
```

## Примеры реальных workflows

### Python проект

```yaml
name: Python Tests

on: [push]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v2
    - uses: actions/setup-python@v2
      with:
        python-version: 3.9
    - run: pip install -r requirements.txt
    - run: pytest --cov=src
```

### Node.js проект

```yaml
name: Node CI

on: [push, pull_request]

jobs:
  build:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [14.x, 16.x, 18.x]
    steps:
    - uses: actions/checkout@v2
    - uses: actions/setup-node@v2
      with:
        node-version: ${{ matrix.node-version }}
    - run: npm ci
    - run: npm run build
    - run: npm test
```

## Практические задания

1. Создайте .github/workflows/test.yml
2. Добавьте простой тест
3. Запустите workflow на GitHub
4. Просмотрите логи выполнения
5. Добавьте deploy шаг

## Ключевые концепции

- **CI** - автоматическое тестирование
- **CD** - автоматическое развертывание
- **Workflow** - описание процесса
- **Job** - отдельная задача
- **Step** - шаг внутри задачи

## Рекомендуемые источники

1. [GitHub Actions Documentation](https://docs.github.com/en/actions)
2. [CI/CD Best Practices](https://martinfowler.com/articles/continuousIntegration.html)
3. [DevOps Handbook](https://itrevolution.com/the-devops-handbook/)"""
    },

    17: {
        "title": "Производительность и оптимизация",
        "content": """# Урок 17: Производительность и оптимизация

## Зачем нужна оптимизация?

Оптимизация помогает:
- Приложение работает быстрее
- Использует меньше памяти
- Экономит на облачных сервисах
- Улучшает пользовательский опыт

## Профилирование

Определение узких мест в коде.

### Python профилирование

```python
import cProfile
import pstats

def slow_function():
    result = []
    for i in range(1000000):
        result.append(i ** 2)
    return result

cProfile.run('slow_function()')
```

### JavaScript профилирование

```javascript
console.time('myFunction');

// Ваш код
let result = [];
for (let i = 0; i < 1000000; i++) {
  result.push(i ** 2);
}

console.timeEnd('myFunction');
```

## Big O нотация

Анализ сложности алгоритма.

| Нотация | Название | Пример | Скорость |
|---------|----------|--------|----------|
| O(1) | Константа | Доступ к элементу массива | Очень быстро |
| O(log n) | Логарифмическая | Бинарный поиск | Быстро |
| O(n) | Линейная | Простой цикл | Среднее |
| O(n²) | Квадратичная | Вложенный цикл | Медленно |
| O(2ⁿ) | Экспоненциальная | Некоторые рекурсивные | Очень медленно |

## Оптимизация памяти

### Плохо

```python
# Создает весь список в памяти
def get_numbers(n):
    return [i for i in range(n)]

numbers = get_numbers(1000000)  # Много памяти!
```

### Хорошо

```python
# Генератор - ленивое вычисление
def get_numbers(n):
    for i in range(n):
        yield i

numbers = get_numbers(1000000)  # Минимум памяти!
```

## Кэширование

Сохранение результатов для повторного использования.

```python
from functools import lru_cache

@lru_cache(maxsize=128)
def fibonacci(n):
    if n < 2:
        return n
    return fibonacci(n-1) + fibonacci(n-2)

# Второй вызов будет намного быстрее
print(fibonacci(30))
print(fibonacci(30))  # из кэша
```

## Оптимизация БД

```python
# Плохо: N+1 проблема
users = User.all()
for user in users:
    print(user.name, user.posts.count())  # Запрос для каждого!

# Хорошо: используем join
users = User.with_posts().all()  # Один запрос
for user in users:
    print(user.name, len(user.posts))
```

## Практические задания

1. Профилируйте медленную функцию
2. Определите Big O сложность
3. Оптимизируйте с использованием кэша
4. Переделайте с генератором
5. Улучшите запрос БД

## Ключевые концепции

- **Профилирование** - найди узкое место
- **Big O** - анализ эффективности
- **Кэширование** - быстрые повторные запросы
- **Память** - используй генераторы
- **БД** - избегай N+1 запросов

## Рекомендуемые источники

1. "Algorithm Design Manual" (Steven Skiena)
2. Python Performance Tips
3. "High Performance Python" (Gorelick & Ozsvald)"""
    }
}

def main():
    lessons_dir = Path("lessons")

    for lesson_num, lesson_data in LESSONS.items():
        readme_path = lessons_dir / str(lesson_num) / "README.md"

        with open(readme_path, 'w', encoding='utf-8') as f:
            f.write(lesson_data["content"])

        print(f"✅ Урок {lesson_num}: {lesson_data['title']} обновлен")

if __name__ == "__main__":
    main()
    print("\n✨ Все уроки обновлены!")
