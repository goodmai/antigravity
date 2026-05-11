# Кастомные MCP-серверы с нуля

Model Context Protocol (MCP) — открытый стандарт для подключения внешних инструментов к агентам. В Уроке 10 мы разобрали, как использовать готовые серверы. Теперь создадим собственный: от пустого файла до работающего инструмента в Antigravity.

## Что такое MCP-сервер

MCP-сервер — это процесс, который реализует JSON-RPC протокол и предоставляет агенту:

```
┌──────────────────────────────────────────┐
│  MCP Server                              │
│                                          │
│  Tools     — функции агент может вызвать │
│  Resources — данные агент может читать   │
│  Prompts   — шаблоны взаимодействия      │
└──────────────────────────────────────────┘
```

Antigravity играет роль **Host** и общается с сервером через **stdio** (по умолчанию) или HTTP.

## Вариант 1: Python-сервер с FastMCP

`fastmcp` — минималистичная обёртка над официальным Python SDK:

```bash
pip install fastmcp
```

### Простой сервер для работы с задачами

```python
# mcp_tasks.py
from fastmcp import FastMCP

mcp = FastMCP("task-manager")

# In-memory хранилище (замени на БД в production)
tasks: list[dict] = []

@mcp.tool()
def add_task(title: str, priority: str = "medium") -> dict:
    """Добавить задачу в список."""
    task = {"id": len(tasks) + 1, "title": title, "priority": priority, "done": False}
    tasks.append(task)
    return task

@mcp.tool()
def list_tasks(only_pending: bool = False) -> list[dict]:
    """Получить список задач."""
    return [t for t in tasks if not t["done"]] if only_pending else tasks

@mcp.tool()
def complete_task(task_id: int) -> dict:
    """Отметить задачу выполненной."""
    for t in tasks:
        if t["id"] == task_id:
            t["done"] = True
            return t
    return {"error": f"Task {task_id} not found"}

@mcp.resource("tasks://all")
def get_all_tasks() -> str:
    """Текущий список задач в читаемом формате."""
    if not tasks:
        return "Список задач пуст."
    lines = [f"{'✓' if t['done'] else '○'} [{t['priority']}] {t['title']}" for t in tasks]
    return "\n".join(lines)

if __name__ == "__main__":
    mcp.run()
```

## Вариант 2: Node.js-сервер

```bash
npm install @modelcontextprotocol/sdk
```

```typescript
// mcp-server.ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const server = new Server(
  { name: "my-tools", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "get_timestamp",
      description: "Возвращает текущее время в ISO формате",
      inputSchema: { type: "object", properties: {}, required: [] },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "get_timestamp") {
    return {
      content: [{ type: "text", text: new Date().toISOString() }],
    };
  }
  throw new Error(`Unknown tool: ${request.params.name}`);
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

## Регистрация в Antigravity

Добавь сервер в `mcp_config.json` в корне проекта:

```json
{
  "mcpServers": {
    "task-manager": {
      "command": "python",
      "args": ["/absolute/path/to/mcp_tasks.py"],
      "env": {
        "DATABASE_URL": "${DATABASE_URL}"
      }
    },
    "my-ts-tools": {
      "command": "node",
      "args": ["dist/mcp-server.js"]
    }
  }
}
```

После сохранения перейди в **Settings → MCP Servers** — сервер должен появиться со статусом `online`.

## Docker-деплой

Для изолированных серверов с зависимостями:

```json
{
  "mcpServers": {
    "my-db-server": {
      "command": "docker",
      "args": [
        "run", "--rm", "-i",
        "--network", "host",
        "-e", "DATABASE_URL",
        "my-mcp-server:latest"
      ]
    }
  }
}
```

```dockerfile
# Dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY mcp_tasks.py .
CMD ["python", "mcp_tasks.py"]
```

## Типичные кейсы для собственного MCP-сервера

| Кейс | Что реализует |
|------|--------------|
| Внутренний API компании | Tools для CRUD операций |
| Корпоративная документация | Resources с поиском по базе знаний |
| Специфический CLI | Tools оборачивают shell-команды |
| Мониторинг | Resources читают метрики в реальном времени |
| Секреты и конфиги | Tools для безопасного чтения из Vault/AWS SM |

## Отладка

```bash
# Запусти сервер вручную и пошли тестовый JSON-RPC запрос
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | python mcp_tasks.py

# Проверь, что сервер отвечает корректным JSON
python mcp_tasks.py <<< '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"list_tasks","arguments":{}}}'
```

## Практика

1. Создай MCP-сервер, оборачивающий `git log --oneline -20` как инструмент `get_recent_commits`
2. Добавь Resource, который читает содержимое `CHANGELOG.md`
3. Зарегистрируй в `mcp_config.json` и вызови из чата Antigravity командой: «Покажи последние 10 коммитов»
