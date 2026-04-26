# Proposal: Eliminar SQLite y modularizar el backend Obsidian

**Change id**: `drop-sqlite-split-monolith`
**Tipo**: Breaking change (v2.0.0 major)
**Posición en el roadmap v2**: 1 de 3 (cambio fundacional; v2.1 y v2.2 condicionadas a demanda — ver `openspec/ROADMAP.md`)

## Intent

logbook-mcp arrastra desde v0.x un diseño dual storage (SQLite + Obsidian) que multiplica el coste de mantenimiento sin justificarlo: la mayoría de usuarios reales operan en modo Obsidian (archivos `.md` con frontmatter), y SQLite se ha convertido en un camino muerto que sólo añade código, dependencia nativa (`better-sqlite3`) y complejidad de migración. A la vez, el backend Obsidian vive en un monolito (`src/storage/obsidian/index.ts`, 2134 líneas, 30+ métodos en una sola clase) que es imposible de mantener, testear o extender con responsabilidades bien delimitadas.

Problemas concretos a resolver:

1. **Superficie de mantenimiento duplicada**: cada nueva feature debe implementarse dos veces (SQLite + Obsidian) o romper la paridad del `StorageBackend`.
2. **Dependencia nativa frágil**: `better-sqlite3` requiere compilación por plataforma/versión de Node, lo que complica la instalación del paquete npm.
3. **Monolito Obsidian**: 2134 líneas impiden navegación simbólica, refactors seguros y tests focalizados.
4. **Ruido heredado**: `generateDashboard()` (~100 líneas de Dataview hardcoded) duplica lo que ya hacen plugins de Obsidian; `migrateTodosFolder()` (~130 líneas) es migración muerta de una reescritura previa.
5. **Coste de tokens en MCP**: los 10 tools actuales publican schemas redundantes. Consolidándolos a 5 (vía `action`) se reduce el coste de schema ~50 % sin perder funcionalidad.
6. **Falta de configuración en capas**: el config actual es plano (`~/.logbook/config.json`) y no soporta override por repo, por vault, ni registro de múltiples vaults. El setup inicial no guía al usuario.

Este cambio es el **cambio fundacional** del roadmap v2: desbloquea los otros 5 cambios planificados (`orama-search`, `token-optimizations`, etc.), porque la arquitectura modular y el sistema de config en capas son precondición para ellos.

## Scope

### In Scope

1. **Eliminación completa del backend SQLite**
   - Borrar `src/db/` (connection.ts, schema.ts, queries.ts — 819 líneas).
   - Borrar `src/storage/sqlite/`.
   - Borrar `src/auto-migrate.ts`.
   - Eliminar `better-sqlite3` de `package.json` (dependencies y cualquier tipo/mention).
   - Obsidian pasa a ser el único modo de almacenamiento; `StorageBackend` conserva su interfaz pública.

2. **No hay migración SQLite → Obsidian**
   - Decisión explícita: los datos en `~/.logbook/logbook.db` (v1) **no se migran**. v2 es un hard breaking change.
   - El CHANGELOG y README documentan que quien quiera conservar datos v1 debe exportarlos manualmente antes de actualizar (o quedarse en v1).
   - `~/.logbook/logbook.db` queda intacto en disco si existe; el server v2 simplemente lo ignora.

3. **Split del monolito Obsidian**
   - Refactor de `src/storage/obsidian/index.ts` en módulos por dominio dentro de `src/storage/obsidian/`:
     - `notes.ts`, `todos.ts`, `entries.ts`, `search.ts`, `reminders.ts`, `topics.ts`, `inbox.ts`, `templates.ts`, `code-todos.ts`, `backlinks.ts`, `git-context.ts`, `daily-note.ts`.
   - `ObsidianStorage` queda como orquestador delgado (~300 líneas) que delega a funciones puras de los módulos.
   - La interfaz `StorageBackend` exportada se mantiene sin cambios para no romper consumidores internos (tools) más allá de lo ya derivado del resto de cambios.

4. **Limpieza de código muerto**
   - Eliminar `generateDashboard()` y la escritura del `index.md` con Dataview hardcoded (~100 líneas).
   - Eliminar `migrateTodosFolder()` (~130 líneas), residuo de una migración previa.

5. **Consolidación de tools MCP (10 → 5)**
   - Mantener tal cual: `logbook_note`, `logbook_todo`, `logbook_entry`.
   - `logbook_query` absorbe como `action`: `tags`, `reminders`, `review` (además de los `search/log/timeline` actuales).
   - `logbook_setup` absorbe como `action`: `inbox`, `topics` (además de `init/status` actuales). El `migrate` v1 desaparece (no hay migración).
   - Zod schemas por acción; validación runtime per action.
   - Objetivo: ~50 % de reducción en coste de schema publicado.

6. **Sistema de configuración en capas + wizard `init`**
   - Defaults hardcoded iguales a la estructura actual (usuarios que no configuran nada no se rompen más allá del cambio de backend).
   - Tres capas opcionales de override (merge, no reemplazo):
     - `.logbook.json` en la raíz del repo (per-project, versionable).
     - `~/.logbook/config.json` (preferencias globales del usuario + registro de vaults).
     - `<vault>/<root>/.logbook/vault.json` (viaja con el vault).
   - Orden de resolución: `CLI args > env vars > repo config > vault config > global config > defaults`.
   - Campos configurables: `alias` (renombrar el display del proyecto), `folders` (renombrar carpetas por tipo), `pathTemplate` (variables `{workspace}` `{project}` `{folder}` `{YYYY}` `{MM}`), `workspace` override, `workspaceStrategy` (`git-remote-org` | `parent-folder` | `manual` | `none`), `dailyNote`, `templates.userFolder`, `excludeProjects`.
   - Registro de vaults en global: `{ defaultVault: "name", vaults: { name: { path, root } } }`. Con un solo vault registrado, `--vault` es opcional.
   - `logbook setup init` (wizard): detección en cascada de vaults (Obsidian `obsidian.json` → scan de carpetas comunes → preguntar), detección de plugins relevantes (Periodic Notes, Templates, Tasks), detección del repo git actual, 7 preguntas con defaults sensatos, generación de los archivos de config aplicables y un snippet MCP para el cliente detectado (Claude Code, Desktop, Cursor, Windsurf, VS Code, Codex, Gemini).
   - `logbook setup status` muestra la config efectiva con las capas aplicadas.
   - `logbook setup reorganize --dry-run` para migrar a un nuevo layout de carpetas tras cambios de config.

7. **Modo CLI (mínimo en v2.0)**

   El binario actual solo acepta `--mcp` y entra en modo server. Añadimos un dispatcher: sin `--mcp`, el binario entra en modo CLI nativo. En v2.0 solo implementamos los comandos esenciales; el CLI completo (list/done/edit/rm/log/reminders/entry con `--json`/`--quiet`) queda diferido al change `cli-complete` (v2.1).

   Comandos implementados en v2.0:

   - `logbook-mcp setup init` — wizard interactivo (ya previsto en item 6).
   - `logbook-mcp setup status` — ver config activa.
   - `logbook-mcp setup reorganize [--dry-run]` — migrar layout tras cambio de config.
   - `logbook-mcp note <content> [--topic X]` — captura rápida de nota (0 tokens, sin LLM).
   - `logbook-mcp todo add <content> [--topic X] [--priority P]` — captura rápida de TODO.
   - `logbook-mcp search <query> [--scope global]` — búsqueda rápida desde terminal.

   Los comandos CLI comparten la misma lógica que los tools MCP (misma función subyacente, dos presentaciones).

   Arquitectura: un `src/cli/dispatcher.ts` que discrimina `--mcp` vs CLI. Subcomandos en `src/cli/commands/{setup,note,todo,search}.ts`. Preparado para extensión en el change `cli-complete`.

   Beneficios: captura fuera del LLM, scripting, git hooks, onboarding accesible sin depender del cliente MCP.

8. **Shims de compatibilidad deprecated**

   Los 5 tools eliminados (`logbook_tags`, `logbook_reminders`, `logbook_review`, `logbook_inbox`, `logbook_topics`) siguen registrados en v2.0 como shims deprecated. Cada shim:
   - Mantiene nombre y schema de v1.
   - Delega internamente al action consolidado (`logbook_query` o `logbook_setup`).
   - Descripción empieza con `[DEPRECATED: se eliminará en v2.2. Usa X en su lugar.]`.
   - Respuesta incluye `_deprecated: true` y `_replacement: "<tool>.<action>"`.
   - En v2.1.0 añade `console.warn` al invocarse (una vez por proceso).
   - En v2.2.0 se eliminan completamente.

   Razón: **silent breakage MCP**. Los clientes (Claude Code, Cursor, Claude Desktop, etc.) cachean las definiciones de tools entre arranques. Sin shims, sesiones activas que llamen a los nombres viejos fallan silenciosamente (el LLM alucina respuestas en lugar de recibir un error claro). Los shims dan tiempo a que la cache se refresque y al usuario a migrar.

9. **Fix `ackRecurringReminder` y `recurring[]` en Obsidian (no-op actual)**

   En v1, `ackRecurringReminder` está implementado como `void {}` y `recurring: []` está hardcoded. Implementar:
   - Estado de acks en `<vault>/<root>/.logbook/reminders-state.json` con `{ version, acks: { "<reminder_id>": "<YYYY-MM-DD>" } }` (escritura atómica).
   - `getDueReminders` lee state y devuelve `recurring` real según patrón (`daily`, `weekdays`, `weekly:N`, `monthly:N`).
   - Ack se ejecuta desde el tool (`logbook_query action:reminders ack`), NO desde el resource `logbook://reminders` (que pasa a ser read-only para no perder reminders no vistos).
   - Unificar formato: solo carpeta `reminders/` con frontmatter; migrar one-shot las líneas inline de `todos.md` con emoji ⏰ a archivos individuales.
   - Soporte de snooze vía `snooze_until: YYYY-MM-DD` en el ack.

10. **Fix `syncCodeTodos` en Obsidian (no-op actual)**

    En v1, `syncCodeTodos` devuelve `{ added: 0, resolved: 0 }` sin hacer nada. Implementar:
    - Snapshot anterior en `<vault>/<root>/.logbook/code-todos-snapshot.json` con `{ version, updatedAt, items: [{file, line, text}] }` (escritura atómica).
    - Diff vs. escaneo actual (`git grep`): ítems nuevos se añaden como `source: code`, ítems desaparecidos se marcan `resolved` automáticamente.
    - Snapshot se actualiza tras cada sync exitoso.
    - Si `git grep` no está disponible (no es repo git), devolver `{ added: 0, resolved: 0 }` sin error.

11. **Búsqueda Orama (reemplazo de FTS5 perdido al quitar SQLite)**

    En v1 tras quitar SQLite la búsqueda sería `String.includes()` sobre file walk O(N), más lenta que la FTS5 original. Para evitar regresión de performance en v2.0, se introduce Orama:
    - Dependencia `@orama/orama` (puro JS, sin nativas).
    - Índice lazy al primer `search`/`log` call, construido leyendo todos los `.md` del vault bajo `<root>` y parseando frontmatter; docs con campos `{id, type, title, body, topic, tags, project, workspace, date, priority, status}`.
    - Cache opcional `.logbook/index-cache.json` con mtime check para arranque incremental.
    - Watcher `chokidar` (debounce 500ms) para cambios externos (usuario edita en Obsidian).
    - Escrituras internas actualizan el índice síncronamente.
    - Search con BM25 + fuzzy + filtros por facetas (`type`, `topic`, `project`, `workspace`, `date_from`, `date_to`, `priority`, `status`).
    - Lazy loading: `search` devuelve `{id, type, title, snippet, rank, topic, project, date}`; el body completo se obtiene con la nueva action `logbook_query action:get id:X`.
    - Fallback substring si Orama falla al cargar (safety net durante v2.0.0-alpha).

    Esta funcionalidad reemplaza la "búsqueda temporal" marcada `// TEMPORARY` en `storage-obsidian.md` y obsoleta la Decision 6 del design.

12. **Auto-wikilinks en TODOs/notes/entries**

    Cuando el `content` de `logbook_todo add`, `logbook_note` o `logbook_entry` menciona el ID de una nota existente en el vault (patrón `YYYY-MM-DD-slug`), logbook DEBE envolverlo automáticamente como `[[id]]` al guardar. Esto hace el TODO clickable en Obsidian: al pulsarlo abre la nota referenciada. Idempotente (no duplica). Seguro (no crea wikilinks rotos: solo envuelve si el ID existe como nota). Configurable: `config.autoWikilink` (default `true`). Además soporta atajo `ref:<id>` que se expande a `[[<id>]]`. Extiende `src/storage/obsidian/wikilinks.ts` con `autoWrapIds(content, vaultIndex)`.

    Razón: user-requested. Sin esto, los TODOs que referencian notas-plan grandes quedan huérfanos y hay que buscar la nota a mano. Con esto, un clic en Obsidian abre la nota referenciada.

### Out of Scope (deferido a cambios hermanos — ver `openspec/ROADMAP.md`)

- **CLI completo con `--json`/`--quiet`, list/done/edit/rm/log/reminders/entry, papelera, git hook** — diferido a `v2-dx` (target v2.1.0). **Condicionado a demanda**: solo se ejecuta si aparece señal concreta de uso.
- **PKM features: daily notes integration, plantillas de ingeniería múltiples, exporters (standup/changelog/ADR index), backlinks semánticos** — diferido a `v2-pkm` (target v2.2.0). **Condicionado a demanda**.
- 13 features especulativas adicionales (attachments con OCR, encryption, time tracking, standups en equipo, etc.) en parking lot explícito — ver `openspec/ROADMAP.md`.

## Approach

Estrategia en tres bloques, aplicables en este orden dentro de la implementación:

1. **Refactor no-destructivo primero** — Split del monolito Obsidian en módulos por dominio manteniendo SQLite intacto. Esto permite validar la descomposición con los tests existentes sin mezclarla con borrado de código.
2. **Borrado de SQLite y código muerto** — Una vez Obsidian está modular y pasa tests, eliminar `src/db/`, `src/storage/sqlite/`, `auto-migrate.ts`, dependencia `better-sqlite3`, `generateDashboard()`, `migrateTodosFolder()`. No hay binario de migración: los datos v1 quedan inaccesibles desde v2 por decisión explícita.
3. **API pública y config** — Consolidar los tools MCP a 5, introducir el sistema de config en capas y el wizard `logbook setup init`. Última fase porque altera contratos externos (schemas MCP, archivos de config) y debe quedar estable antes de cortar v2.0.0.

Principios de diseño:
- Módulos Obsidian como funciones puras que reciben contexto (vault path, resolved config) — facilita tests unitarios por módulo sin instanciar la clase.
- `ObsidianStorage` sólo compone y mantiene el singleton; no contiene lógica de dominio.
- Config en capas implementada con un único `resolveConfig()` que merge recursivo; cada capa es opcional y el resultado es un objeto fuertemente tipado.

## Affected Areas

| Área | Impacto | Descripción |
|------|---------|-------------|
| `src/db/` | Removed | Eliminación completa (connection.ts, schema.ts, queries.ts). |
| `src/storage/sqlite/` | Removed | Backend SQLite eliminado. |
| `src/auto-migrate.ts` | Removed | Eliminado; no hay migración en v2. |
| `src/storage/obsidian/index.ts` | Modified | Pasa de 2134 líneas a orquestador ~300 líneas. |
| `src/storage/obsidian/notes.ts` | New | Módulo de dominio extraído. |
| `src/storage/obsidian/todos.ts` | New | Módulo de dominio extraído. |
| `src/storage/obsidian/entries.ts` | New | Módulo de dominio extraído. |
| `src/storage/obsidian/search.ts` | New | Búsqueda temporal post-SQLite (reemplazo FTS5). |
| `src/storage/obsidian/reminders.ts` | New | Módulo de dominio extraído. |
| `src/storage/obsidian/topics.ts` | New | Módulo de dominio extraído. |
| `src/storage/obsidian/inbox.ts` | New | Módulo de dominio extraído. |
| `src/storage/obsidian/templates.ts` | New | Módulo de dominio extraído. |
| `src/storage/obsidian/code-todos.ts` | New | Módulo de dominio extraído. |
| `src/storage/obsidian/backlinks.ts` | New | Módulo de dominio extraído. |
| `src/storage/obsidian/git-context.ts` | New | Módulo de dominio extraído. |
| `src/storage/obsidian/daily-note.ts` | New | Módulo de dominio extraído. |
| `src/storage/index.ts` | Modified | Factory `getStorage()` sólo devuelve ObsidianStorage. |
| `src/storage/types.ts` | Modified | `StorageBackend` conservado; limpiar referencias a SQLite. |
| `src/tools/tags.ts` | Removed | Absorbido por `logbook_query`. |
| `src/tools/reminders.ts` | Removed | Absorbido por `logbook_query`. |
| `src/tools/review.ts` | Removed | Absorbido por `logbook_query`. |
| `src/tools/inbox.ts` | Removed | Absorbido por `logbook_setup`. |
| `src/tools/topics.ts` | Removed | Absorbido por `logbook_setup`. |
| `src/tools/query.ts` | Modified | Nuevas actions: `tags`, `reminders`, `review`. |
| `src/tools/setup.ts` | Modified | Nuevas actions: `inbox`, `topics`; wizard `init`, `status`, `reorganize`. |
| `src/server.ts` | Modified | Registra 5 tools en vez de 10. |
| `src/config.ts` | Modified | Implementa resolución en capas (repo + vault + global + defaults). |
| `src/cli.ts` | Modified | Reducido a entry-point; lógica movida a `src/cli/`. |
| `src/cli/*` | New | Dispatcher (`dispatcher.ts`) + subcomandos (`commands/{setup,note,todo,search}.ts`). |
| `package.json` | Modified | Elimina `better-sqlite3` por completo, añade deps `@orama/orama` y `chokidar`, bump a `2.0.0`. |
| `src/index.ts` | Modified | Quita `generateDashboard()`, `migrateTodosFolder()`, llamada a auto-migrate. |
| `src/tools/shims/{tags,reminders,review,inbox,topics}.ts` | New | Shims deprecated (delegadores thin) para compatibilidad v2.0→v2.2. |
| `src/storage/obsidian/orama-adapter.ts` | New | Adaptador Orama: buildIndex, searchIndex, updateDoc, persistCache, loadCache. |
| `src/config/reminders-state.ts` | New | Lectura/escritura atómica de `.logbook/reminders-state.json`. |
| `@orama/orama`, `chokidar` | Added (deps) | Búsqueda full-text + watcher de cambios externos en el vault. |

## Risks

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| Usuarios v1 con datos en SQLite pierden acceso desde el server v2. | Baja | Bajo | Decisión explícita y documentada: v2 no migra. CHANGELOG y README marcan v2 como hard breaking; el `.db` queda intacto en disco — el usuario puede revertir a v1 si necesita los datos. |
| Regresiones funcionales al modularizar el monolito (2134 líneas con dependencias implícitas entre métodos). | Media | Medio | Refactor antes que borrado; mantener suite Vitest pasando en cada split; cubrir cada módulo con tests unitarios. |
| Búsqueda temporal (sin FTS5 ni Orama) es notablemente más lenta en vaults grandes. | Alta | Bajo | Documentar expectativa en CHANGELOG; `orama-search` llega inmediatamente después. |
| Consolidación 10→5 tools rompe integraciones de usuarios que llaman tools por nombre. | Alta | Medio | Documentar mapping viejo→nuevo en CHANGELOG; v2 es major bump. |
| Config en capas introduce bugs de merge (override accidental, profundidad incorrecta). | Media | Medio | Tests del `resolveConfig()` con matriz de combinaciones; `logbook setup status` muestra qué capa aporta cada campo. |
| Wizard `init` falla en clientes MCP no contemplados. | Baja | Bajo | Fallback a snippet genérico MCP; lista de clientes ampliable. |
| Publicar v2.0.0 sin que los cambios hermanos estén listos deja un periodo con búsqueda degradada. | Media | Bajo | Plan de release: `orama-search` PR lista antes de publicar npm; o publicar v2.0.0-rc hasta tener `orama-search` mergeado. |

## Rollback Plan

- **Código**: `git revert` del merge de este cambio revierte todo el split, restaura `src/db/`, `src/storage/sqlite/` y los tools consolidados. Como no se amenda historia, es seguro.
- **Paquete npm**: volver a publicar la última v1 funcional (`@cocaxcode/logbook-mcp@0.4.x`) con tag `latest` si v2 presenta un blocker en producción. Los usuarios reinstalan con `npm i -g @cocaxcode/logbook-mcp@0.4`.
- **Datos de usuario**: el `.db` v1 (si existía) queda intacto en disco — v2 no lo toca ni lo borra. Si un usuario quiere recuperar acceso a esos datos, basta con reinstalar v1; v2 nunca los modifica.
- **Config de usuario**: los archivos nuevos (`.logbook.json`, `<vault>/.logbook/vault.json`, `.logbook/reminders-state.json`, `.logbook/code-todos-snapshot.json`, `.logbook/index-cache.json`) son aditivos; eliminar los archivos restaura el comportamiento por defaults.
- **Fallback de búsqueda**: si Orama presenta un blocker en v2.0.0-alpha, el fallback `String.includes()` (grep en memoria) se mantiene como safety net detrás de un feature flag hasta que Orama esté validado. v2.0.0 stable requiere benchmark verde (<100ms sobre vault de 5000 notas).

## Dependencies

- **Añadir**: `@orama/orama` (búsqueda full-text, puro JS), `chokidar` (watcher vault), `@clack/prompts` (wizard).
- **Eliminar**: `better-sqlite3` por completo de `package.json` (no se usa ya — sin migración, sin runtime SQLite).
- Este cambio es prerequisito de los cambios hermanos del roadmap v2, **todos condicionados a demanda** (ver `openspec/ROADMAP.md`):
  - `v2-dx` (target v2.1.0) — CLI completo, papelera/undo, git hook commit↔TODO.
  - `v2-pkm` (target v2.2.0) — daily notes integration, plantillas eng múltiples, exporters.

## Success Criteria

- [ ] `better-sqlite3` no aparece en `package.json`, `package-lock.json`, ni en `dist/` tras build.
- [ ] `src/db/`, `src/storage/sqlite/` y `src/auto-migrate.ts` no existen en el árbol.
- [ ] `src/storage/obsidian/index.ts` <= 400 líneas y contiene sólo orquestación.
- [ ] Existen los 12 módulos de dominio listados bajo `src/storage/obsidian/`.
- [ ] `generateDashboard()` y `migrateTodosFolder()` no existen.
- [ ] El servidor MCP registra exactamente 5 tools: `logbook_note`, `logbook_todo`, `logbook_entry`, `logbook_query`, `logbook_setup`.
- [ ] `logbook_query` soporta acciones `search`, `log`, `timeline`, `tags`, `reminders`, `review`.
- [ ] `logbook_setup` soporta acciones `init`, `status`, `reorganize`, `inbox`, `topics`.
- [ ] `resolveConfig()` aplica capas en orden `CLI > env > repo > vault > global > defaults` y `logbook setup status` imprime trazabilidad por campo.
- [ ] `logbook setup init` ejecuta el wizard y genera snippet MCP para al menos: Claude Code, Claude Desktop, Cursor, Windsurf, VS Code, Codex, Gemini.
- [ ] Suite Vitest verde con cobertura al menos equivalente a v1 (baseline actual: 151 tests).
- [ ] `npm run typecheck` sin errores.
- [ ] `npm run build` produce `dist/` sin referencias a SQLite.
- [ ] CHANGELOG de v2.0.0 documenta: breaking changes, mapping de tools viejo→nuevo, nota explícita "datos SQLite v1 no se migran".
- [ ] Los 5 shims deprecated (`logbook_tags`, `logbook_reminders`, `logbook_review`, `logbook_inbox`, `logbook_topics`) están registrados y devuelven `_deprecated: true` + `_replacement`.
- [ ] `ackRecurringReminder` persiste en `.logbook/reminders-state.json` y `getDueReminders` devuelve `recurring` no vacío cuando aplica.
- [ ] `syncCodeTodos` reconcilia con snapshot `.logbook/code-todos-snapshot.json` y devuelve `{added, resolved}` reales.
- [ ] Índice Orama construido lazy, persistido en `.logbook/index-cache.json`, watcher chokidar activo, benchmark <100ms sobre vault de 5000 notas.
- [ ] Nueva action `logbook_query action:get id:X` devuelve body completo para lazy loading tras search.
