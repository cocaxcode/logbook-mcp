# logbook-mcp (v2)

Cuaderno de bitácora del developer via MCP. Notas, TODOs y code TODOs sin salir de tu AI. **Obsidian-only** desde v2.0 (SQLite eliminado).

## Stack

- TypeScript 5 (ESM)
- MCP SDK (@modelcontextprotocol/sdk)
- Archivos Markdown con frontmatter YAML — backend Obsidian
- @orama/orama — search full-text BM25+fuzzy (puro JS)
- @clack/prompts — wizard interactivo `setup init`
- chokidar — watcher de cambios externos en el vault
- Vitest para tests
- tsup para build

## Arquitectura

```
src/
├── index.ts                 # Entry: --mcp → server, else CLI dispatcher
├── server.ts                # createServer() — registra 5 tools + 5 shims
├── cli.ts                   # Shim que llama a cli/dispatcher
├── config.ts                # Config legacy (~/.logbook/config.json)
├── types.ts                 # Re-exports de storage/types
├── config/                  # Sistema de config en capas (v2)
│   ├── types.ts             # ConfigLayer, ResolvedConfig, ConfigTrace
│   ├── defaults.ts          # Hardcoded defaults
│   ├── resolve.ts           # resolveConfig() merge + trace
│   ├── detect-vaults.ts     # Cascade obsidian.json → common-folder scan
│   ├── detect-plugins.ts    # community-plugins.json
│   └── reminders-state.ts   # .logbook/reminders-state.json (atomic R/W)
├── core/
│   └── auto-wikilinks.ts    # autoWrapIds + expandRefShortcut middleware
├── cli/
│   ├── dispatcher.ts        # --mcp vs CLI mode routing
│   ├── snippet.ts           # MCP snippets per client (7 clientes)
│   └── commands/
│       ├── setup.ts         # init wizard (@clack/prompts) + status + reorganize
│       ├── note.ts          # logbook-mcp note <content>
│       ├── todo.ts          # logbook-mcp todo add <content>
│       └── search.ts        # logbook-mcp search <query>
├── storage/
│   ├── types.ts             # StorageBackend + tipos compartidos
│   ├── index.ts             # Factory getStorage() — sólo Obsidian
│   └── obsidian/
│       ├── index.ts         # ObsidianStorage (monolito de v1, conserva)
│       ├── orama-adapter.ts # Búsqueda full-text (Orama, lazy + cache)
│       ├── frontmatter.ts   # Parser/serializer YAML
│       ├── slug.ts          # Slugify con acentos
│       ├── workspace.ts     # Autodetección workspace/project
│       ├── wikilinks.ts     # [[wikilinks]] (rendering existente)
│       ├── files.ts         # Helpers .md
│       └── formatting.ts    # Callouts, checkboxes
├── git/
│   ├── detect-repo.ts       # detectRepoPath via git rev-parse
│   └── code-todos.ts        # Scan TODO/FIXME/HACK/BUG via git grep
├── tools/                   # 5 main tools + 5 shims deprecated
│   ├── note.ts              # logbook_note
│   ├── todo.ts              # logbook_todo (add/list/done/edit/rm)
│   ├── entry.ts             # logbook_entry (list/edit/delete/standup/decision/debug)
│   ├── query.ts             # logbook_query (search/log/timeline/tags/reminders/review/get)
│   ├── setup.ts             # logbook_setup (init/status/inbox/topics)
│   └── shims/               # Deprecated, eliminados en v2.2
│       ├── tags.ts
│       ├── reminders.ts
│       ├── review.ts
│       ├── inbox.ts
│       └── topics.ts
└── resources/
    └── reminders.ts         # MCP resource: logbook://reminders
```

## Configuration

Prioridad de resolución: CLI args > env vars > config file > defaults.

### Legacy config: `~/.logbook/config.json` (compat lectura)
```json
{
  "dir": "C:/Users/me/ObsidianVault/logbook",
  "workspace": null
}
```
v2 ignora `storage` y `autoMigrate` si los encuentra (warning a stderr).

### Layered config (v2 — opt-in vía wizard `setup init`)
- `.logbook.json` en repo (versionable)
- `<vault>/<root>/.logbook/vault.json` (viaja con vault)
- `~/.logbook/config.json` (global)

### CLI args / Env
```
--dir "C:/vault/logbook" --workspace "myteam"
LOGBOOK_DIR=...   LOGBOOK_WORKSPACE=...
```

## Backend

### Obsidian (único)
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

- **StorageBackend**: única implementación es `ObsidianStorage`. `getStorage()` singleton.
- **Config legacy**: `resolveConfig()` lee `~/.logbook/config.json` (modo compat).
- **Config layered (v2)**: `src/config/resolve.ts` → `resolveConfig(layers)` con `ConfigTrace`.
- **CLI dispatcher**: `--mcp` → server; cualquier otra cosa → comando CLI.
- **Wizard**: `setup init` con `@clack/prompts`, snippet MCP por cliente.
- **Auto-wikilinks**: middleware `applyAutoWikilinks` antes de escribir notas/todos/entries.
- **Tool handler**: try-catch, return `{ content: [...] }` o `{ isError: true, content: [...] }`.
- **Consolidated tools**: 5 main + 5 shims deprecated (eliminados en v2.2).

## Commands

```bash
npm test         # Vitest (133 tests)
npm run build    # tsup → dist/
npm run typecheck  # tsc --noEmit
npm run inspector # MCP Inspector
```

## Conventions

- Descripciones de tools en español
- Código en inglés
- Single quotes, no semicolons, trailing commas (.prettierrc)
- `console.error()` para logging (stdout reservado para MCP)

## 5 MCP Tools (v2)

| Tool | Función | Actions |
|------|---------|---------|
| `logbook_note` | Añadir nota con topic | — |
| `logbook_todo` | CRUD completo de TODOs | add, list, done, edit, rm |
| `logbook_entry` | Entradas estructuradas | list, edit, delete, standup, decision, debug |
| `logbook_query` | Buscar y consultar | search, log, timeline, **tags**, **reminders**, **review**, **get** |
| `logbook_setup` | Administración | init, status, **inbox**, **topics** |

## 5 Shims Deprecated (eliminados en v2.2)

| Shim | Reemplazo |
|------|-----------|
| `logbook_tags` | `logbook_query` action: `tags` |
| `logbook_reminders` | `logbook_query` action: `reminders` |
| `logbook_review` | `logbook_query` action: `review` |
| `logbook_inbox` | `logbook_setup` action: `inbox` (sub-action via `inbox_action`) |
| `logbook_topics` | `logbook_setup` action: `topics` (sub-action via `topic_action`) |

## 1 MCP Resource

| Resource | Función |
|----------|---------|
| `logbook://reminders` | Recordatorios pendientes/vencidos/recurrentes (auto-ack) |

## 7 Topics predefinidos

feature, fix, chore, idea, decision, blocker, reminder
