# Лабораторная Работа №2: QA Architect (Урок 7)

## Цель работы

Создать и внедрить мета-скилл `qa-skill-tester` для автоматизированного тестирования других скиллов системы Antigravity.

Вы будете выступать в роли **Lead QA Automation Engineer**.

## Спецификация `qa-skill-tester`

Мета-скилл должен выполнять полный цикл тестирования:

1.  **Preparation**:
    - Генерация системных промптов для персон "QA Lead" (Qwen) и "Test Architect" (Gemini).
    - Команда: `python skills/qa-skill-tester/scripts/optimize_qa_prompts.py`

2.  **Validation Loop (Orchestrator)**:
    - Скрипт: `run_qa.py` (в виртуальном окружении).
    - **Вход**: Путь к целевому скиллу (например, `skills/qwen-code-review`).
    - **Действия**:
      - **Test Plan**: Gemini анализирует `SKILL.md` и создает план тестирования.
      - **Checklist**: Генерация `.xlsx` файла с проверками (Frontend, API, Readability, Overlaps, Broken Links).
      - **Execution**: Запуск кейсов (симуляция или реальный запуск).
      - **Validate**: Qwen валидирует результаты тестов как QA Lead.
      - **Reporting**: Генерация отчета о багах в `.docx`.
      - **Archival**: Сохранение всех артефактов в `artifacts/<skill>/test/<timestamp>` (используя воркфлоу `artifact-archival`).

3.  **Visual Proof**:
    - Использование скриншотов через `@/SCR` (`flameshot`) для фиксации UI багов.

## Задание

1.  **Создайте Pitch Deck**:
    - Используя команду: `skills/qa-skill-tester/.venv/bin/python3 skills/qa-skill-tester/scripts/create_lab2_materials.py`
    - Результат: `lab2_pitch_deck.pptx`.

2.  **Запустите QA Cycle**:
    - Протестируйте сам скилл `qa-skill-tester` на себе (Self-Test).
    - Команда: `workflow qa-suite`.

3.  **Презентация**:
    - Создайте веб-страницу отчета через `skills/web-artifacts-builder`.
    - Проверьте её через `skills/webapp-testing`.

## Требования к UI тестам

В чек-листах (`xlsx`) обязательно должны быть пункты:

- [ ] Читаемость всех элементов.
- [ ] Кликабельность нужных элементов.
- [ ] Отсутствие битых ссылок (404).
- [ ] Отсутствие оверлапов (наложений).

Этот урок переводит вас из роли Разработчика в роль Test Architect'а.
