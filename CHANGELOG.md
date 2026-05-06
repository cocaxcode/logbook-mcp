# Changelog

## 2.4.4 — 2026-05-07

### Fixed

- **Drive letter como workspace en Windows**: cuando el repo estaba en la raíz de una unidad (ej. `C:\ingles`), `detectWorkspace()` devolvía `C:` como nombre de workspace, generando rutas inválidas en NTFS (`vault/logbook/C:/ingles`) y fallando con `ENOENT … mkdir`. Ahora se ignoran los drive letters en el fallback y se sanitizan los segmentos eliminando caracteres prohibidos por NTFS (`:`, `*`, `?`, `"`, `<`, `>`, `|`).

## 2.4.3 — 2026-04-26

### Fixed

- **`cleanup-broken-wikilinks` ya no preserva carpetas**: Obsidian no renderiza `[[name]]` como link a carpetas — busca un `.md` con ese nombre y ofrece crearlo si no existe. La heurística previa de mantener `[[name]]` cuando coincidía con un nombre de carpeta dejaba enlaces rotos como `[[logbook-mcp]]` (la carpeta del proyecto). Ahora sólo se preservan wikilinks que apuntan a un `.md` real. Los `index.md` siguen siendo skipped (dashboards).

## 2.4.2 — 2026-04-26

### Fixed

- **`cleanup-broken-wikilinks`** ahora **respeta los dashboards y folder navigation**:
  - Los archivos `index.md` (dashboards) se saltan por completo.
  - Si `[[name]]` apunta a una **carpeta existente** del vault (ej. `[[notes]]`, `[[debug]]`), se conserva — sirve como link de navegación dentro de Obsidian.
  - Sólo se eliminan `[[name]]` que no resuelven ni a archivo ni a carpeta.

## 2.4.1 — 2026-04-26

### Fixed

- **Eliminado el auto-wrap de nombres de proyecto en `[[name]]`**: la lógica v1 (`applyWikilinks`) envolvía mentions de carpetas de proyecto (ej. `logbook-mcp`) en `[[logbook-mcp]]`, generando enlaces rotos en Obsidian (busca `logbook-mcp.md` que no existe — sólo existe la carpeta). Ahora `insertNote/insertStandup/insertDecision/insertDebug` sólo aplican `applyAutoWikilinks` (que envuelve IDs `YYYY-MM-DD-slug` que **sí** resuelven a notas reales).

### Added

- **`logbook_setup action:cleanup-broken-wikilinks`**: nueva acción que escanea el vault y elimina los `[[name]]` que no resuelven a un `.md` existente, dejando el texto plano. Acepta `scope: project|global` (default project) y `dry_run: true` (preview sin modificar). Devuelve `filesScanned`, `filesModified`, `linksRemoved` y `sample[]` con archivos afectados.

### Tests

- 159 tests verde (era 156). Nuevos: cleanup elimina links rotos, dryRun no modifica archivos, insertNote ya no añade `[[project]]`.

## 2.4.0 — 2026-04-26

### Added

- **Cross-reference automático TODO done → nota linkeada**:
  - Cuando un TODO contiene `[[YYYY-MM-DD-slug]]` y se marca como `done`, el sistema añade automáticamente una sección `## ✅ Resueltos` al final de la nota referenciada con la línea:
    ```
    - ✅ 2026-04-26: TODO #59 — contenido del TODO
    ```
  - Idempotente: si la línea ya existe, se actualiza (no duplica).
  - Reversible: al hacer `done undo`, la línea se elimina; si la sección queda vacía, también se quita.
  - Fire-and-forget update del índice Orama tras la modificación.
  - Soporta múltiples `[[id]]` en un mismo TODO (afecta a todas las notas linkeadas).
  - Sólo escribe en archivos cuyo id existe (`getEntryById` resuelve a un `.md` real); si el id no resuelve, se ignora silenciosamente.

### Tests

- 156 tests verde (era 144). Nuevos en `resolved-ref.test.ts` (10) y `obsidian-storage.test.ts` (2 integración: append on done, remove on undo).

## 2.3.0 — 2026-04-26

### Added

- **`topics remove`**: nueva sub-acción de `logbook_setup` (y shim `logbook_topics`) para eliminar topics custom del registro.
  - Refusa eliminar topics predefinidos (`feature`, `fix`, `chore`, `idea`, `decision`, `blocker`, `reminder`).
  - **Borrado explícito**: requiere `confirm: true`. Sin él, devuelve un preview con `entriesAffected` (cuántas entradas referencian el topic) y `folderKept` (si la carpeta tiene contenido) sin modificar nada.
  - No borra entradas existentes — sólo de-registra el topic.
  - Actualiza dashboard si el topic estaba marcado `showInIndex`.

### Changed

- **Búsqueda híbrida Orama + substring**: `search()` ahora ejecuta Orama y substring en paralelo y mergea resultados, deduplicando por id. Garantiza cobertura máxima:
  - Orama va primero (BM25 + fuzzy + multi-word AND con score real).
  - Substring complementa con cualquier coincidencia que el tokenizer no haya manejado bien (caracteres raros, frontmatter-only, etc.).
  - Sin regresiones: cualquier query que funcionaba antes sigue funcionando.

### Tests

- 144 tests verde (era 137). Nuevos: removeTopic predefined refusal, custom remove, idempotency, dryRun preview, hybrid search dedup.

## 2.2.0 — 2026-04-26

### Added

- **Idioma del tokenizer Orama configurable**: el adapter acepta `language` por contexto. Valores soportados: `arabic`, `armenian`, `bulgarian`, `catalan`, `chinese`, `danish`, `dutch`, `english`, `finnish`, `french`, `german`, `greek`, `hindi`, `hungarian`, `indonesian`, `irish`, `italian`, `japanese`, `korean`, `lithuanian`, `mongolian`, `nepali`, `norwegian`, `persian`, `portuguese`, `romanian`, `russian`, `serbian`, `slovenian`, `spanish` (default), `swedish`, `tamil`, `turkish`, `ukrainian`, `sanskrit`.
- **Tres formas de configurar**:
  - Variable de entorno: `LOGBOOK_LANG=english`
  - Config file: añadir `"language": "english"` en `~/.logbook/config.json`
  - Constructor: `new ObsidianStorage(dir, { language: 'english' })`
- Test de regresión: stemmer inglés reduce "running" → "run" y resuelve query "run" → encuentra el doc.

### Changed

- `LogbookConfig` ahora incluye campo opcional `language`. `resolveConfig()` resuelve con prioridad `LOGBOOK_LANG > config.json > default 'spanish'`.
- `getStorage()` pasa el idioma resuelto al constructor de `ObsidianStorage`.

## 2.1.2 — 2026-04-26

### Fixed

- **Orama: id duplicado en `index.md`/`todos.md`**: vaults con varios proyectos tienen múltiples archivos llamados `index.md` (uno por proyecto). El adapter usaba el slug del filename como id de Orama, lo que provocaba `Error: A document with id "index" already exists` al construir el índice. Resultado: Orama lanzaba en `buildIndex` y todas las búsquedas caían silenciosamente al fallback substring (rank: 0).
- **Fix**: el id de Orama ahora es la ruta relativa (única), y el slug original se preserva en un campo separado `slug` del IndexedDoc. Las búsquedas devuelven el slug como id público para los consumers.
- **`removeDoc`**: actualizado para resolver el slug al id de Orama (path) cuando se le pasa un slug.

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
