# Antigravity Laboratory / Лаборатория Антигравити

[![Deploy static content to Pages](https://github.com/goodmai/antigravity/actions/workflows/static.yml/badge.svg)](https://github.com/goodmai/antigravity/actions/workflows/static.yml)
[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-Live-blue?logo=github)](https://goodmai.github.io/antigravity/)

ℹ️ **Русский**: Этот репозиторий содержит лабораторные работы по освоению "Антигравити" (Antigravity). Здесь вы найдете примеры, упражнения и инструкции по работе с агентом.

## Обучение (Lessons)

🚀 **[Экспресс курс по Антигравити (Online)](https://goodmai.github.io/antigravity/)** — интерактивная версия уроков.

### Содержание

- [Урок 1: Режимы агента](./lessons/1/README.md)

## Управление агентом (Local Control)

Для управления агентом в этой директории используется скрипт `agent_control.sh`.

### Использование

1. Сделайте скрипт исполняемым:

   ```bash
   chmod +x agent_control.sh
   ```

2. Запустите агента:

   ```bash
   ./agent_control.sh start
   ```

3. Запустите анализ логов:

   ```bash
   ./agent_control.sh analyze
   ```
