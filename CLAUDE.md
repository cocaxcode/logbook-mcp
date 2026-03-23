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
├── server.ts         # createServer() factory — registra 15 tools
├── cli.ts            # CLI básico (help, version)
├── types.ts          # Interfaces compartidas + re-exports de storage
├── storage/
│   ├── types.ts      # Interfaz StorageBackend + tipos compartidos
│   ├── index.ts      # Factory getStorage() singleton (sqlite | obsidian)
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
├── tools/            # 15 MCP tools (1 archivo por tool)
└── resources/
    └── reminders.ts  # MCP resource: logbook://reminders
```

## Storage Modes

### SQLite (default)
```
LOGBOOK_STORAGE=sqlite  # o sin definir
```
Almacena en `~/.logbook/logbook.db`. FTS5 para búsqueda. Como siempre ha funcionado.

### Obsidian
```
LOGBOOK_STORAGE=obsidian
LOGBOOK_DIR=/ruta/al/vault/logbook
```
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
├── optimus/
│   └── optimus-hub/
```

Autodetección: workspace del path del repo (`/projects/` → segmento anterior). Proyecto = nombre del repo.

## Key Patterns

- **StorageBackend**: interfaz que abstraen SQLite y Obsidian. `getStorage()` singleton.
- **Factory**: `createServer()` registra tools con `registerXyzTool(server)`
- **Tool handler**: try-catch, return `{ content: [...] }` o `{ isError: true, content: [...] }`
- **Frontmatter parser**: zero deps, línea por línea, soporta string/number/boolean/array/date
- **Wikilinks**: envuelve nombres de proyecto en `[[]]` automáticamente
- **Code TODOs**: `git grep` en demanda, sync de snapshots (solo SQLite)
- **Sin AI provider**: devuelve datos crudos, el AI client resume

## Commands

```bash
npm test        # Vitest (141 tests)
npm run build   # tsup → dist/
npm run typecheck # tsc --noEmit
npm run inspector # MCP Inspector para probar tools
```

## Conventions

- Descripciones de tools en español
- Código en inglés
- Single quotes, no semicolons, trailing commas (.prettierrc)
- `console.error()` para logging (stdout reservado para MCP)

## 15 MCP Tools

| Tool | Función |
|------|---------|
| `logbook_note` | Añadir nota con topic |
| `logbook_todo_add` | Crear uno o varios TODOs |
| `logbook_todo_list` | Listar TODOs agrupados por topic (manual + code) |
| `logbook_todo_done` | Marcar como hecho/undo |
| `logbook_todo_edit` | Editar TODO |
| `logbook_todo_rm` | Eliminar TODO |
| `logbook_log` | Actividad: notas + TODOs completados por periodo |
| `logbook_search` | Búsqueda full-text |
| `logbook_topics` | Listar/crear topics |
| `logbook_standup` | Standup diario (yesterday/today/blockers) |
| `logbook_decision` | Decision arquitectónica ADR |
| `logbook_debug` | Sesión de debug con adjuntos |
| `logbook_tags` | Listar/filtrar tags del vault |
| `logbook_timeline` | Timeline cross-project/workspace |
| `logbook_migrate` | Migrar datos SQLite → markdown |

## 1 MCP Resource

| Resource | Función |
|----------|---------|
| `logbook://reminders` | Recordatorios pendientes/vencidos/recurrentes (auto-ack) |

## 7 Topics predefinidos

feature, fix, chore, idea, decision, blocker, reminder
