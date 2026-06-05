# Урок 33: Миграция на Antigravity CLI (Agy) и настройка MCP/Skills

С выходом версии 1.0 экосистема Antigravity перешла на новый, более быстрый и производительный CLI, написанный на Go — **Antigravity CLI** (или просто `agy`). Этот урок посвящен миграции со старого `gemini-cli` и правильной настройке серверов контекста (MCP) и навыков (Skills).

---

## 🚀 Миграция: от Gemini к Agy

Старая утилита `@google/gemini-cli` (команда `gemini`) теперь считается легаси. Новый стандарт — `agy`.

### Команда миграции

Для автоматического переноса настроек, истории сессий и авторизации используйте специальный флаг в старом CLI:

```bash
# Выполните миграцию
gemini -agy
```

**Что делает эта команда:**
1.  Проверяет наличие установленного бинарного файла `agy`.
2.  Копирует глобальные правила из `~/.gemini/` в структуру, понятную новому CLI.
3.  Переносит конфигурацию MCP серверов в `~/.gemini/config/mcp_config.json`.
4.  Симлинкает (или копирует) установленные скиллы в `~/.gemini/skills/`.

---

## 🔌 Настройка MCP серверов

Antigravity использует единый файл конфигурации для CLI и IDE.

**Файл конфигурации:** `~/.gemini/config/mcp_config.json`

### Пример структуры

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "your_token_here"
      }
    },
    "google-drive": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-google-drive"],
      "authProviderType": "google_credentials"
    }
  }
}
```

### Ключевые изменения в Agy CLI:
-   **serverUrl**: Теперь используется вместо `httpUrl` для удаленных серверов.
-   **authProviderType**: Позволяет использовать системные учетные данные Google Cloud.
-   **No inline comments**: JSON не поддерживает комментарии, Agy CLI выдаст ошибку при их наличии.

---

## 🛠 Настройка Skills (Навыков)

В Antigravity CLI скиллы делятся на общие и специфичные для CLI.

### Места хранения:
1.  **Shared Skills**: `~/.gemini/skills/` — доступны везде (CLI + IDE).
2.  **CLI-only Skills**: `~/.gemini/antigravity-cli/skills/` — только для командной строки.

### Процесс добавления нового скилла:
```bash
# 1. Добавление через менеджер (установит в ~/.agents/skills/)
npx skills add <URL_К_РЕПО_СКИЛЛА> -y -g

# 2. Перенос в общую папку Antigravity
mv ~/.agents/skills/my-awesome-skill ~/.gemini/skills/

# 3. Проверка в CLI
agy
> /skills
```

---

## 🧪 Задания для закрепления

1.  **Инсталляция**: Убедитесь, что у вас установлены оба CLI (`gemini --version` и `agy --version`).
2.  **Миграция**: Запустите `gemini -agy` и проверьте, создался ли файл `~/.gemini/config/mcp_config.json`.
3.  **MCP Setup**: Добавьте сервер `fetch` в конфиг для получения данных из веба:
    ```json
    "fetch": {
      "command": "uvx",
      "args": ["mcp-server-fetch"]
    }
    ```
4.  **Skills Check**: Создайте пустой скилл в `~/.gemini/skills/test-skill/SKILL.md` и убедитесь, что `agy` видит его через команду `/skills`.
5.  **Workflow Test**: Запустите любой стандартный воркфлоу, например `agy --prompt "Check my code"`, и убедитесь, что он использует настройки из нового конфига.

---

## 🔗 Полезные ссылки
- [Medium: Configuring MCP Servers and Skills for Antigravity CLI and IDE](https://medium.com/google-cloud/configuring-mcp-servers-and-skills-for-antigravity-cli-and-ide-a938c7eebb78)
- [Antigravity Documentation (Official)](https://github.com/goodmai/antigravity)
