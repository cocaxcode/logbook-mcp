# Changelog

## 2.1.1 — 2026-04-26

### Fixed

- **Orama: tokenizer en español**: el adapter usa `language: 'spanish'` al crear el índice. Sin esto, el tokenizer por defecto (inglés) no manejaba correctamente palabras españolas (`lanzamiento`, `decisión`, etc.) y la búsqueda de Orama caía siempre al fallback substring. Ahora BM25 + fuzzy funciona para contenido en español.

## 2.1.0 — 2026-04-26

### Added

- **Orama wired into `search()`**: `logbook_query action:search` ahora usa BM25 + fuzzy + filtros por facetas en lugar del scan substring. El método de `StorageBackend.search()` pasa a `async`.
  - Fallback automático a substring si Orama falla o devuelve 0 resultados.
  - Cache persistente en `<vault>/.logbook/index-cache.json` (lazy build al primer search).
  - Watcher chokidar del adapter listo para incorporar (no auto-arrancado todavía).
- **Auto-update del índice Orama** tras escrituras: `insertNote`, `insertStandup`, `insertDecision`, `insertDebug`, `deleteEntry` actualizan/quitan el doc del índice fire-and-forget para mantenerlo coherente entre sesiones.

### Internal

- `searchIndex` del adapter devuelve `IndexedDoc & { score, snippet }` (incluye `body`, `tags`, `workspace`, `path`) en lugar de un subset trimmed — necesario para hidratar `SearchResult` correctamente.
- Helpers `private` de `ObsidianStorage` convertidos a públicos (con intent `@internal`) en preparación al split de módulos por dominio (deferido a `v2.2-split-monolith`, ver `openspec/changes/v2.2-split-monolith/proposal.md`).

### Notes

- **Split del monolito Obsidian deferido**: `src/storage/obsidian/index.ts` sigue siendo un único archivo de ~2200 líneas con la clase `ObsidianStorage` completa. La descomposición en 12 módulos por dominio se hará en v2.2 como refactor puro sin cambios de API. Ver el proposal en `openspec/changes/v2.2-split-monolith/`.

## 2.0.1 — 2026-04-26

### Fixed

- **Nested wikilinks** in `applyWikilinks`: when a note content mentioned an entry id whose slug contained a known project name (e.g. `2026-04-26-prueba-v2-logbook-mcp-lanzamiento`), the v1 project-wrapping pass produced output like `[[2026-04-26-prueba-v2-[[logbook-mcp]]-lanzamiento]]`. The function now segments content into outside/inside `[[...]]` and only applies project replacements on outside segments.
- Regression tests added (`wikilinks.test.ts`).

## 2.0.0 — 2026-04-26

**Hard breaking change.** SQLite eliminado del paquete. v2 es Obsidian-only.

### Migration from v1

Si tenías datos en `~/.logbook/logbook.db`, **no se migran automáticamente**. El archivo queda intacto en disco — v2 no lo lee ni lo borra. Si necesitas acceso a esos datos, reinstala v1 (`npm i -g @cocaxcode/logbook-mcp@0.4`).

### Removed

- Backend SQLite (`src/db/`, `src/storage/sqlite/`, `src/auto-migrate.ts`).
- Dependencia nativa `better-sqlite3`.
- `generateDashboard()` con Dataview hardcoded.
- `migrateTodosFolder()` (residuo de migraciones previas).
- 5 tools individuales (ver shims más abajo).

### Added

- **Sistema de config en capas** (`src/config/`): `CLI > env > repo .logbook.json > vault.json > global > defaults` con `ConfigTrace` por campo.
- **Modo CLI nativo**: `logbook-mcp setup init|status`, `note`, `todo add`, `search` sin `--mcp`.
- **Wizard `setup init`** con detección de vaults Obsidian (cascada `obsidian.json` → scan), detección de plugins relevantes, generación de snippet MCP por cliente (claude-code, claude-desktop, cursor, windsurf, vscode, codex, gemini).
- **Auto-wikilinks**: contenido que menciona un id `YYYY-MM-DD-slug` existente se envuelve automáticamente como `[[id]]`. Soporta `ref:<id>`. Idempotente. Flag `autoWikilink` (default `true`).
- **Orama search adapter** (`src/storage/obsidian/orama-adapter.ts`): índice full-text BM25+fuzzy puro JS, lazy-build, cache `.logbook/index-cache.json`. Disponible para uso (no auto-cableado al `search()` síncrono actual).
- **`ackRecurringReminder` real**: persiste acks en `.logbook/reminders-state.json` (write atómico). Soporta snooze por fecha.
- **`syncCodeTodos` real**: snapshot diff en `.logbook/code-todos-snapshot.json`; calcula `added/resolved` reales.
- **`getEntryById(id)`**: busca un entry por id en cualquier carpeta del workspace.
- Action **`logbook_query.get`** para lazy-loading del body completo tras un `search`.

### Changed

- **Tools MCP: 10 → 5**.
  - `logbook_query` absorbe acciones: `search`, `log`, `timeline`, **`tags`**, **`reminders`**, **`review`**, **`get`**.
  - `logbook_setup` absorbe acciones: `init`, `status`, **`inbox`**, **`topics`**.
  - Los 5 tools eliminados (`logbook_tags`, `logbook_reminders`, `logbook_review`, `logbook_inbox`, `logbook_topics`) **siguen registrados como shims deprecated** que delegan a las acciones consolidadas. Devuelven `{ _deprecated: true, _replacement: "<tool>.<action>" }`. Se eliminan en v2.2.

### Tool mapping (v1 → v2)

| v1 tool | v2 |
|---------|----|
| `logbook_tags` | `logbook_query` action: `tags` |
| `logbook_reminders` | `logbook_query` action: `reminders` |
| `logbook_review` | `logbook_query` action: `review` |
| `logbook_inbox` | `logbook_setup` action: `inbox` (sub-action via `inbox_action`) |
| `logbook_topics` | `logbook_setup` action: `topics` (sub-action via `topic_action`) |

### Internal

- Eliminados `src/__tests__/db.test.ts`, `migrate.test.ts`, `tools.test.ts`, `helpers.ts`, `storage-factory.test.ts` (todos basados en SQLite).
- Nuevos tests: config-resolve, config-detect-vaults, config-reminders-state, auto-wikilinks, orama-adapter, cli-dispatcher, cli-snippet.
- 133 tests verde.
