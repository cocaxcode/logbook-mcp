# logbook-mcp

Cuaderno de bitácora del developer via MCP. Notas, TODOs y code TODOs sin salir de tu AI.

## Stack

- TypeScript 5 (ESM)
- MCP SDK (@modelcontextprotocol/sdk)
- SQLite (better-sqlite3) con FTS5
- Vitest para tests
- tsup para build

## Arquitectura

```
src/
├── index.ts          # Entry: --mcp → server, else CLI
├── server.ts         # createServer() factory — registra 9 tools
├── cli.ts            # CLI básico (help, version)
├── types.ts          # Interfaces compartidas
├── db/
│   ├── connection.ts # getDb() singleton → ~/.logbook/logbook.db
│   ├── schema.ts     # CREATE TABLE + FTS5 + triggers + seed topics
│   └── queries.ts    # Funciones tipadas de lectura/escritura
├── git/
│   ├── detect-repo.ts # Auto-detección de repo via git rev-parse
│   └── code-todos.ts  # Scan TODO/FIXME/HACK/BUG via git grep
└── tools/            # 9 MCP tools (1 archivo por tool)
```

## Key Patterns

- **Factory**: `createServer()` registra tools con `registerXyzTool(server)`
- **Tool handler**: try-catch, return `{ content: [...] }` o `{ isError: true, content: [...] }`
- **DB singleton**: `getDb()` lazy init, WAL mode, foreign_keys ON
- **Auto-register repo**: detecta el repo actual via `git rev-parse --show-toplevel` y lo registra si no existe
- **FTS5**: triggers automáticos mantienen índices sincronizados (INSERT/DELETE/UPDATE)
- **Code TODOs**: `git grep` en demanda, no se almacenan en DB
- **Sin AI provider**: devuelve datos crudos, el AI client resume

## Commands

```bash
npm test        # Vitest (56 tests)
npm run build   # tsup → dist/
npm run typecheck # tsc --noEmit
npm run inspector # MCP Inspector para probar tools
```

## Conventions

- Descripciones de tools en español
- Código en inglés
- Single quotes, no semicolons, trailing commas (.prettierrc)
- `console.error()` para logging (stdout reservado para MCP)

## 9 MCP Tools

| Tool | Función |
|------|---------|
| `logbook_log` | Actividad: notas + TODOs completados por periodo |
| `logbook_note` | Añadir nota con topic |
| `logbook_todo_add` | Crear uno o varios TODOs |
| `logbook_todo_list` | Listar TODOs agrupados por topic (manual + code) |
| `logbook_todo_done` | Marcar como hecho/undo |
| `logbook_todo_edit` | Editar TODO |
| `logbook_todo_rm` | Eliminar TODO |
| `logbook_search` | Búsqueda full-text (FTS5) |
| `logbook_topics` | Listar/crear topics |

## 6 Topics predefinidos

feature, fix, chore, idea, decision, blocker
