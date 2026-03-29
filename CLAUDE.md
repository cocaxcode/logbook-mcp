# logbook-mcp

Cuaderno de bitácora del developer via MCP. Notas, TODOs y code TODOs sin salir de tu AI. Soporta modo SQLite (default) y modo Obsidian (archivos .md con frontmatter).

## Stack

- TypeScript 5 (ESM)
- MCP SDK (@modelcontextprotocol/sdk)
- SQLite (better-sqlite3) con FTS5 — modo sqlite
- Archivos Markdown con frontmatter YAML — modo obsidian
- Vitest para tests
- tsup para build

## Arquitectura

```
src/
├── index.ts          # Entry: --mcp → server, else CLI
├── server.ts         # createServer() factory — registra 10 tools
├── cli.ts            # CLI básico (help, version)
├── config.ts         # Config file + resolución (args > env > file > defaults)
├── auto-migrate.ts   # Auto-migración SQLite → Obsidian al arranque
├── types.ts          # Interfaces compartidas + re-exports de storage
├── storage/
│   ├── types.ts      # Interfaz StorageBackend + tipos compartidos
│   ├── index.ts      # Factory getStorage() singleton (usa resolveConfig)
│   ├── sqlite/
│   │   └── index.ts  # SqliteStorage implements StorageBackend
│   └── obsidian/
│       ├── index.ts      # ObsidianStorage implements StorageBackend
│       ├── frontmatter.ts # Parser/serializer YAML (zero deps)
│       ├── slug.ts        # Slugify con soporte acentos
│       ├── workspace.ts   # Autodetección workspace/project
│       ├── wikilinks.ts   # [[wikilinks]] automáticos
│       ├── files.ts       # Helpers de lectura/escritura .md
│       └── formatting.ts  # Callouts, checkboxes, formatos Obsidian
├── db/
│   ├── connection.ts # getDb() singleton → ~/.logbook/logbook.db
│   ├── schema.ts     # CREATE TABLE + FTS5 + triggers + seed topics
│   └── queries.ts    # Funciones tipadas de lectura/escritura
├── git/
│   ├── detect-repo.ts # Auto-detección de repo via git rev-parse
│   └── code-todos.ts  # Scan TODO/FIXME/HACK/BUG via git grep
├── tools/            # 10 MCP tools (1 archivo por tool)
│   ├── note.ts       # logbook_note — añadir nota
│   ├── todo.ts       # logbook_todo — CRUD completo (add/list/done/edit/rm)
│   ├── entry.ts      # logbook_entry — entradas estructuradas (list/edit/delete/standup/decision/debug)
│   ├── query.ts      # logbook_query — buscar y consultar (search/log/timeline)
│   ├── topics.ts     # logbook_topics — listar/crear topics
│   ├── tags.ts       # logbook_tags — listar tags
│   ├── reminders.ts  # logbook_reminders — recordatorios pendientes
│   ├── review.ts     # logbook_review — review semanal/mensual
│   ├── inbox.ts      # logbook_inbox — bandeja de entrada
│   └── setup.ts      # logbook_setup — admin (init/migrate/status)
└── resources/
    └── reminders.ts  # MCP resource: logbook://reminders
```

## Configuration

Prioridad de resolución: CLI args > env vars > config file > defaults.

### Config file: `~/.logbook/config.json`
```json
{
  "storage": "sqlite",
  "dir": null,
  "workspace": null,
  "autoMigrate": true
}
```

### CLI args
```
--storage obsidian --dir "C:/vault/logbook" --workspace "myteam"
```

### Env vars
```
LOGBOOK_STORAGE=obsidian
LOGBOOK_DIR=/ruta/al/vault/logbook
LOGBOOK_WORKSPACE=myteam
```

### Auto-migración
Al arrancar con storage=obsidian, si existe `~/.logbook/logbook.db` con datos y no hay marker `.migrated`, migra automáticamente notes + todos a Obsidian.

## Storage Modes

### SQLite (default)
Almacena en `~/.logbook/logbook.db`. FTS5 para búsqueda.

### Obsidian
Escribe archivos `.md` con frontmatter YAML. Estructura:
```
vault/logbook/
├── cocaxcode/                    ← workspace (autodetectado)
│   ├── cocaxcode-api/            ← proyecto (autodetectado del repo git)
│   │   ├── notes/
│   │   ├── todos/
│   │   ├── decisions/
│   │   ├── debug/
│   │   ├── standups/
│   │   └── attachments/
│   └── cocaxcode-web/
```

## Key Patterns

- **StorageBackend**: interfaz que abstraen SQLite y Obsidian. `getStorage()` singleton.
- **Config**: `resolveConfig()` centraliza args > env > file > defaults
- **Factory**: `createServer()` registra tools con `registerXyzTool(server)`
- **Tool handler**: try-catch, return `{ content: [...] }` o `{ isError: true, content: [...] }`
- **Consolidated tools**: tools con `action` param y switch interno. Runtime validation per action.
- **Auto-migrate**: en startup, antes de createServer()

## Commands

```bash
npm test        # Vitest (151 tests)
npm run build   # tsup → dist/
npm run typecheck # tsc --noEmit
npm run inspector # MCP Inspector para probar tools
```

## Conventions

- Descripciones de tools en español
- Código en inglés
- Single quotes, no semicolons, trailing commas (.prettierrc)
- `console.error()` para logging (stdout reservado para MCP)

## 10 MCP Tools

| Tool | Función | Actions |
|------|---------|---------|
| `logbook_note` | Añadir nota con topic | — |
| `logbook_todo` | CRUD completo de TODOs | add, list, done, edit, rm |
| `logbook_entry` | Entradas estructuradas | list, edit, delete, standup, decision, debug |
| `logbook_query` | Buscar y consultar | search, log, timeline |
| `logbook_topics` | Listar/crear topics | list, add |
| `logbook_tags` | Listar/filtrar tags | — |
| `logbook_reminders` | Recordatorios pendientes | — |
| `logbook_review` | Review semanal/mensual | — |
| `logbook_inbox` | Bandeja de entrada | list, process |
| `logbook_setup` | Administración | init, migrate, status |

## 1 MCP Resource

| Resource | Función |
|----------|---------|
| `logbook://reminders` | Recordatorios pendientes/vencidos/recurrentes (auto-ack) |

## 7 Topics predefinidos

feature, fix, chore, idea, decision, blocker, reminder
