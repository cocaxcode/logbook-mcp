# Tasks: Eliminar SQLite y modularizar el backend Obsidian

**Change id**: `drop-sqlite-split-monolith`

Cada tarea debe caber en una sesión. El orden entre fases es dependencia estricta; dentro de una fase las tareas pueden paralelizarse salvo que una referencie explícitamente a otra previa.

## Phase 1 — Infraestructura y config (sin cambio de comportamiento)

- [ ] 1.1 Crear `src/config/types.ts` con interfaces `Config`, `VaultConfig`, `ProjectConfig`, `ResolvedConfig`, `ConfigTrace`, `ConfigLayers`.
- [ ] 1.2 Crear `src/config/defaults.ts` con los defaults hardcoded (equivalentes 1:1 a la estructura actual de v1).
- [ ] 1.3 Crear `src/config/resolve.ts` con `resolveConfig(layers)`: merge por clave, deep-merge en `folders`/`dailyNote`/`templates`, arrays reemplazan, devuelve `{ config, trace }`.
- [ ] 1.4 Crear `src/config/detect-vaults.ts`: cascada `obsidian.json` → scan de carpetas comunes → fallback manual.
- [ ] 1.5 Crear `src/config/detect-plugins.ts`: lee `<vault>/.obsidian/community-plugins.json` si existe.
- [ ] 1.6 Escribir tests para `resolveConfig()`: matriz de capas (defaults solo, +global, +vault, +repo, +env, +CLI), deep-merge, arrays reemplazan, trace correcto por campo.
- [ ] 1.7 Escribir tests para `detect-vaults.ts` con fixtures `obsidian.json` temporales.
- [ ] 1.8 Adaptar `src/config.ts` actual para delegar en `src/config/` manteniendo su API externa (compat durante transición).
- [ ] 1.9 Añadir `@clack/prompts` a `dependencies` en `package.json`; correr `npm install`; verificar que `npm test` sigue verde.
- [ ] 1.10 Mantener `tsup.config.ts` con un único entry (`src/index.ts`); no se publica binario de migración.
- [ ] 1.11 Verificar `npm run build` produce `dist/index.js`.
- [ ] 1.12 Añadir deps `@orama/orama` y `chokidar` a `dependencies` en `package.json`; correr `npm install`; `npm test` verde.
- [ ] 1.13 Crear `src/config/reminders-state.ts` con `readState(vaultRoot)` y `writeStateAtomic(vaultRoot, state)` (write-to-temp + rename); manejo tolerante de JSON corrupto (recrea vacío + warn).
- [ ] 1.14 Añadir campo `autoWikilink: boolean = true` al schema de config en `src/config/types.ts` + defaults en `src/config/defaults.ts` + trace en `resolveConfig()`.

## Phase 2 — Split del monolito Obsidian (refactor, tests verdes)

- [ ] 2.1 Crear `src/storage/obsidian/internals/ctx.ts` con `ObsidianCtx` (`{ baseDir, ws, config }`) y utilidades para construirlo.
- [ ] 2.2 Crear `src/storage/obsidian/notes.ts`: extraer `addNote`, `listNotes`, `editNote`, `deleteNote` del monolito como funciones puras que reciben `ctx`. Mantener `ObsidianStorage.addNote` como delegador.
- [ ] 2.3 Crear `src/storage/obsidian/todos.ts`: extraer CRUD TODOs como funciones puras; `ObsidianStorage` delega.
- [ ] 2.4 Crear `src/storage/obsidian/entries.ts`: extraer entries (standup/decision/debug/list/edit/delete).
- [ ] 2.5 Ejecutar `npm test` tras 2.2/2.3/2.4 y confirmar 151/151 verdes.
- [ ] 2.6 Crear `src/storage/obsidian/search.ts` con implementación in-memory temporal; añadir comentario `// TEMPORARY: replaced by orama-search change`.
- [ ] 2.7 Crear `src/storage/obsidian/reminders.ts`: extraer lógica de recordatorios (list/ack/recurrencia).
- [ ] 2.8 Crear `src/storage/obsidian/topics.ts`: extraer list/add topics y resolución de carpetas custom.
- [ ] 2.9 Crear `src/storage/obsidian/inbox.ts`: extraer list/process inbox.
- [ ] 2.10 Crear `src/storage/obsidian/templates.ts`: resolver templates, merge `userFolder`.
- [ ] 2.11 Crear `src/storage/obsidian/code-todos.ts`: wrapper sobre `src/git/code-todos.ts` con formateo por vault.
- [ ] 2.12 Crear placeholders `src/storage/obsidian/backlinks.ts`, `git-context.ts`, `daily-note.ts` exportando funciones stub con TODO markers apuntando a changes futuros.
- [ ] 2.13 Adelgazar `src/storage/obsidian/index.ts` hasta que sea orquestador puro `<500` líneas; verificar con `wc -l`.
- [ ] 2.14 Eliminar `generateDashboard()` del monolito y sus tests asociados.
- [ ] 2.15 Eliminar `migrateTodosFolder()` del monolito y sus tests asociados.
- [ ] 2.16 Añadir tests unitarios por módulo para los dominios nuevos (notes, todos, entries, reminders, topics, inbox, templates, search temporal) usando `ctx` con `baseDir` en `os.tmpdir()`.
- [ ] 2.17 Ejecutar `npm test` + `npm run typecheck`; confirmar verde.
- [ ] 2.18 Implementar `src/storage/obsidian/reminders.ts` con `recurring` real: leer `reminders-state.json`, matching de patterns (`daily`, `weekdays`, `weekly:N`, `monthly:N`), devolver solo los no acked hoy; ack persistido por tool (no por resource).
- [ ] 2.19 Implementar `src/storage/obsidian/code-todos.ts` con snapshot diff: leer `.logbook/code-todos-snapshot.json`, escanear vía `git grep`, calcular `added/resolved`, persistir snapshot atómico; fallback a `{added:0,resolved:0}` si no hay git.
- [ ] 2.20 Crear `src/storage/obsidian/orama-adapter.ts`: exports `buildIndex`, `searchIndex`, `updateDoc`, `removeDoc`, `persistCache`, `loadCache` usando `@orama/orama`.
- [ ] 2.21 Integrar watcher `chokidar` en `ObsidianStorage` (debounce 500ms, eventos `add/change/unlink` → `updateDoc`/`removeDoc`).
- [ ] 2.22 Reemplazar el substring search temporal por Orama en `src/storage/obsidian/search.ts`; dejar el substring detrás de un feature flag como fallback (REQ-OS-8).
- [ ] 2.23 Migrator one-shot: al primer arranque v2 contra un vault, detectar líneas inline con emoji ⏰ en `todos.md`, moverlas a `reminders/<slug>.md` con frontmatter, borrar las líneas originales, escribir marker `.logbook/reminders-migrated`.

## Phase 3 — Dispatcher CLI y subcomandos

- [ ] 3.1 Crear `src/cli/dispatcher.ts` con `dispatch(argv)` que rutea `--mcp` a `startMcpServer()` y el resto a comandos.
- [ ] 3.2 Crear `src/cli/prompts.ts` con wrappers de `@clack/prompts` (select, text, confirm, intro/outro) y soporte para modo `--non-interactive`.
- [ ] 3.3 Crear `src/cli/snippet.ts`: genera snippet MCP por cliente (`claude-code`, `claude-desktop`, `cursor`, `windsurf`, `vscode`, `codex`, `gemini`) con el path absoluto del binario.
- [ ] 3.4 Crear `src/cli/commands/setup.ts` con subcomandos `init`, `status`, `reorganize`. `init` implementa el flujo del wizard incluyendo detección de config existente (3 caminos de Decision 1).
- [ ] 3.5 Crear `src/cli/commands/note.ts` implementando `note <content> [--topic X]`.
- [ ] 3.6 Crear `src/cli/commands/todo.ts` implementando `todo add <content> [--topic X] [--priority P]` (solo `add` en v2.0).
- [ ] 3.7 Crear `src/cli/commands/search.ts` implementando `search <query> [--scope global]`.
- [ ] 3.8 Modificar `src/index.ts` para invocar `dispatch(process.argv)` y salir con el exit code devuelto.
- [ ] 3.9 Tests: dispatcher con matriz de argv, snapshots de snippets por cada cliente, init no-interactivo con `HOME` en tmpdir y verificación de backup `config.json.bak-*`.
- [ ] 3.10 Test del flag `--force` en init no-interactivo: sobrescribe pero deja backup.

## Phase 4 — Consolidación de tools MCP (10 → 5)

- [ ] 4.1 Modificar `src/tools/query.ts`: añadir actions `tags`, `reminders`, `review` al switch; Zod discriminated union por action.
- [ ] 4.2 Modificar `src/tools/setup.ts`: añadir actions `inbox` (list/process), `topics` (list/add), `init`, `status`, `reorganize`, `migrate` (el `migrate` en MCP solo imprime instrucciones para ejecutar el binario externo).
- [ ] 4.3 Eliminar `src/tools/tags.ts` y sus tests dedicados.
- [ ] 4.4 Eliminar `src/tools/reminders.ts` y sus tests dedicados.
- [ ] 4.5 Eliminar `src/tools/review.ts` y sus tests dedicados.
- [ ] 4.6 Eliminar `src/tools/inbox.ts` y sus tests dedicados.
- [ ] 4.7 Eliminar `src/tools/topics.ts` y sus tests dedicados.
- [ ] 4.8 Modificar `src/server.ts`: registrar solo los 5 tools (`note`, `todo`, `entry`, `query`, `setup`) + recurso `logbook://reminders`.
- [ ] 4.9 Adaptar tests de tools consolidados: cubrir cada action con un caso mínimo.
- [ ] 4.10 Ejecutar `npm test` + `npm run typecheck`; confirmar verde.
- [ ] 4.11 Crear `src/tools/shims/tags.ts` delegando a `logbook_query action:tags` vía core.
- [ ] 4.12 Crear `src/tools/shims/reminders.ts` delegando a `logbook_query action:reminders`.
- [ ] 4.13 Crear `src/tools/shims/review.ts` delegando a `logbook_query action:review`.
- [ ] 4.14 Crear `src/tools/shims/inbox.ts` delegando a `logbook_setup action:inbox-list/inbox-process`.
- [ ] 4.15 Crear `src/tools/shims/topics.ts` delegando a `logbook_setup action:topics-list/topics-add`.
- [ ] 4.16 Registrar los 5 shims en `src/server.ts` con descripción `[DEPRECATED: se eliminará en v2.2. Usa X.]` y respuesta decorada con `{_deprecated: true, _replacement}`.
- [ ] 4.17 Tests: para cada shim, verificar que devuelve `_deprecated: true`, `_replacement` correcto, y el mismo payload que el action consolidado equivalente.
- [ ] 4.18 Añadir action `logbook_query action:get id:X` para lazy loading (fetch body+frontmatter por id tras search); error `not_found` si no existe.
- [ ] 4.19 Añadir action `logbook_query action:reminders ack id:X [snooze_until:YYYY-MM-DD]` que escribe en `reminders-state.json`.

## Phase 5 — Core compartido (tools ↔ CLI)

- [ ] 5.1 Crear `src/core/notes.ts`: funciones `createNote`, `listNotes`, etc. usadas tanto por `tools/note.ts` como por `cli/commands/note.ts`.
- [ ] 5.2 Crear `src/core/todos.ts`: análogo para TODOs.
- [ ] 5.3 Crear `src/core/entries.ts`: análogo para entries.
- [ ] 5.4 Crear `src/core/search.ts`: fachada sobre la búsqueda del storage.
- [ ] 5.5 Crear `src/core/reminders.ts`: fachada sobre recordatorios.
- [ ] 5.6 Refactorizar `src/tools/*.ts` para invocar `src/core/*` en lugar de hablar con el storage directamente.
- [ ] 5.7 Refactorizar `src/cli/commands/*.ts` para invocar `src/core/*`.
- [ ] 5.8 Tests para `src/core/*` con storage stub/fake.
- [ ] 5.9 Ejecutar suite completa; confirmar verde.
- [ ] 5.10 Extraer lógica de reminders recurring a `src/core/reminders.ts`: `matchesPattern(pattern, date)` para `daily`, `weekdays`, `weekly:N`, `monthly:N`; `getDueReminders(ctx)` que combina scan + state; `ack(ctx, id, snoozeUntil?)`.
- [ ] 5.11 Extraer lógica de code-todo diff a `src/core/code-todos.ts`: `syncCodeTodos(ctx)` con snapshot read/write atómico; tolerante a ausencia de git.
- [ ] 5.12 Crear `src/core/auto-wikilinks.ts` con `autoWrapIds(content, vaultIndex)` + `expandRefShortcut(content, vaultIndex)`; exporta una función fachada `applyAutoWikilinks(content, vaultIndex, config)` que respeta el flag `autoWikilink`.
- [ ] 5.13 Integrar auto-wikilinks en `src/core/notes.ts`, `src/core/todos.ts`, `src/core/entries.ts` antes de la escritura al storage; obtener `vaultIndex` del adaptador Orama; no-op si backend no es Obsidian (REQ-AW-7).
- [ ] 5.14 Tests de `src/core/auto-wikilinks.ts`: wrap correcto de IDs existentes, idempotencia (no duplica `[[id]]`), ID inexistente no se envuelve, `ref:<id>` expansion (existente e inexistente), flag `autoWikilink:false` deshabilita, múltiples IDs en un content, integración con los 3 cores (notes/todos/entries).

## Phase 6 — Eliminación de SQLite

- [ ] 6.1 Eliminar `src/db/` completo (connection.ts, schema.ts, queries.ts).
- [ ] 6.2 Eliminar `src/storage/sqlite/` completo.
- [ ] 6.3 Eliminar `src/auto-migrate.ts`.
- [ ] 6.4 Modificar `src/storage/index.ts` (`getStorage()`): devolver exclusivamente `ObsidianStorage`; si `config.storage === 'sqlite'` fue visto en un config legacy, loguear warning ("SQLite ya no está soportado, ignorando") y continuar en modo Obsidian.
- [ ] 6.5 Modificar `src/storage/types.ts`: limpiar referencias a `SqliteStorage`; `StorageBackend` conserva interfaz pública.
- [ ] 6.6 Eliminar tests específicos de SQLite (`SqliteStorage`, FTS5, auto-migrate).
- [ ] 6.7 Eliminar `better-sqlite3` de `package.json` (todas las secciones); regenerar lockfile.
- [ ] 6.8 Verificar: `grep -R "better-sqlite3" dist/` no devuelve resultados; `grep -R "better-sqlite3" src/` no devuelve resultados.
- [ ] 6.9 Ejecutar `npm test` + `npm run typecheck` + `npm run build`; confirmar verde.

## Phase 7 — Integración, docs y release

- [ ] 7.1 Actualizar `CLAUDE.md` del root del proyecto: nueva arquitectura (5 tools, CLI mode, sin SQLite, config en capas).
- [ ] 7.2 Actualizar `README.md` para v2.0: nueva instalación, 5 tools con acciones, wizard `logbook setup init`, aviso de breaking change v1→v2 (datos SQLite no se migran).
- [ ] 7.3 Crear/actualizar `CHANGELOG.md` con entrada `v2.0.0`: breaking changes, mapping tools viejo→nuevo, nota explícita "SQLite eliminado, datos v1 no se migran automáticamente", cambios de config.
- [ ] 7.4 Ejecutar suite completa; corregir flakes si aparecen.
- [ ] 7.5 `npm run build` final; verificar `dist/index.js` sin rastro de SQLite.
- [ ] 7.6 Smoke test manual: instalar desde `npm pack` en un dir temporal → ejecutar wizard → crear nota → crear todo → buscar → arrancar en modo `--mcp` contra MCP Inspector.
- [ ] 7.7 Bump `version` en `package.json` a `2.0.0`.
- [ ] 7.8 Tag release candidate: `git tag v2.0.0-rc.1` (publicar a dist-tag `next`; ver `openspec/ROADMAP.md` para estrategia de tags npm).
- [ ] 7.9 Benchmark Orama: fixture vault con 5000 notas sintéticas; verificar que search BM25+fuzzy responde `<100ms` P95. Si falla, activar fallback por feature flag y bloquear promoción a stable.
- [ ] 7.10 Smoke test: reminder recurrente `weekly:2` creado martes, acked martes; verificar que reaparece el martes siguiente y no antes.
- [ ] 7.11 Smoke test: `// TODO: foo` añadido en `a.ts`, `logbook_todo action:list source:all` lo muestra; eliminado del código, `syncCodeTodos` lo marca resolved y la lista ya no lo incluye.
- [ ] 7.12 Smoke test: invocar shim `logbook_reminders` devuelve el mismo payload que `logbook_query action:reminders` más `_deprecated: true` y `_replacement: "logbook_query.reminders"`.
