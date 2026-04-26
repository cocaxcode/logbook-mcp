# Design: Eliminar SQLite y modularizar el backend Obsidian

**Change id**: `drop-sqlite-split-monolith`
**Fase del workflow**: Diseño técnico (posterior a proposal y specs).

## Technical Approach

El cambio se ejecuta como una secuencia de tres movimientos ortogonales sobre la misma codebase:

1. **Modularización Obsidian**: el monolito `src/storage/obsidian/index.ts` (2134 líneas) se descompone en módulos por dominio. Cada módulo exporta funciones puras que reciben un contexto (`baseDir`, `ws`, `config`) y devuelven datos o efectos sobre el filesystem. `ObsidianStorage` se reduce a un orquestador delgado que delega en estos módulos.
2. **Eliminación SQLite**: tras el split y con tests verdes, se elimina `src/db/`, `src/storage/sqlite/` y `src/auto-migrate.ts`. **No hay migración**: los datos v1 quedan inaccesibles desde v2 por decisión explícita. `better-sqlite3` se elimina por completo del paquete.
3. **Superficie pública nueva**: config en capas (`src/config/resolve.ts`), wizard `logbook setup init`, dispatcher CLI (`--mcp` vs modo CLI nativo), y consolidación de tools MCP (10 → 5).

El orden de commits en PR importa: primero split + capa de config (no destructivo), luego tools consolidados + CLI, y solo al final los borrados de SQLite y código muerto. Así el rollback vía `git revert` no requiere restaurar código eliminado si algo falla en las fases previas.

Referencia a specs delta aplicables:
- `specs/storage-obsidian.md` — split modular, requisitos de `<500 líneas` y funciones puras.
- `specs/config-layers.md` — orden de resolución, `resolveConfig()`.
- `specs/wizard-init.md` — flujo interactivo del wizard.
- `specs/tools-consolidation.md` — 5 tools, acciones soportadas.
- `specs/cli-mode.md` — dispatcher y subcomandos v2.0.
- `specs/shims-deprecation.md` — shims deprecated para compatibilidad v2.0→v2.2.
- `specs/reminders-fix.md` — fix de `ackRecurringReminder` y `recurring[]`.
- `specs/code-todos-fix.md` — fix de `syncCodeTodos` con snapshot diff.
- `specs/orama-search.md` — índice Orama, watcher, cache, fallback.

## Architecture Decisions

### Decision 1: Idempotencia del wizard `init` (resuelve REQ-WI-6)

**Choice**: cuando el wizard detecta un config existente (`~/.logbook/config.json`, `.logbook.json` de repo o `<vault>/.logbook/vault.json`), ofrece tres caminos explícitos:

- **(a) Adoptar existente** — reutiliza los valores y sólo pregunta por los campos ausentes o cambiados.
- **(b) Re-ejecutar desde cero** — crea un backup `config.json.bak-YYYYMMDD-HHMM` y arranca un wizard limpio.
- **(c) Cancelar** — salida sin cambios.

En modo `--non-interactive` la política es **fallar por defecto** si el config existe. Se requiere `--force` para sobrescribir; `--force` siempre crea el backup antes de escribir.

**Alternatives considered**:
- Sobrescribir silenciosamente — rechazado: pérdida de configuración previa sin aviso.
- Solo permitir `status` si ya hay config y nunca reejecutar `init` — rechazado: el usuario puede querer rehacer la configuración tras añadir un vault nuevo.
- Pedir al usuario renombrar el config manualmente — rechazado: carga cognitiva innecesaria.

**Rationale**: tres caminos cubren los tres escenarios reales (añadir un campo, rehacer, abortar) sin riesgo de pérdida de datos. La obligación de backup en `--force` mantiene reversibilidad también en CI.

### Decision 2: Eliminación total de SQLite (sin migración)

**Choice**: SQLite se elimina del proyecto sin proporcionar binario de migración. Los datos v1 (`~/.logbook/logbook.db`) quedan intactos en disco pero v2 los ignora.

- `src/index.ts` — entry único del binario (MCP server + CLI). No importa nada de `better-sqlite3`, directa ni transitivamente.
- `package.json` — `better-sqlite3` eliminado por completo (no en `dependencies`, no en `optionalDependencies`).
- `tsup.config.ts` — single entry, sin `external` para `better-sqlite3` (ya no aparece en ningún import).
- CHANGELOG documenta que v2 es hard breaking respecto a datos v1.

**Alternatives considered**:
- Binario de migración independiente (`logbook-migrate`) — rechazado: el usuario decidió que los datos v1 no son interesantes y prefiere superficie cero. Ahorra un binario, una entry de tsup, una dep nativa opcional, ~500 líneas de tests, y simplifica todo el rollback.
- Mantener la migración auto-ejecutada al arrancar (`src/auto-migrate.ts` actual) — rechazado: es parte del problema original (forza `better-sqlite3` en el runtime normal).

**Rationale**: máxima simplicidad. Sin SQLite en ninguna parte del paquete v2, nada puede arrastrar la dependencia nativa. Los usuarios que necesiten datos v1 pueden quedarse en v1 (que sigue publicada en `0.4.x`).

### Decision 3: Estrategia de split del monolito Obsidian

**Choice**: cada módulo de dominio (`notes.ts`, `todos.ts`, `entries.ts`, …) exporta **funciones puras** que reciben un contexto explícito:

```ts
// src/storage/obsidian/notes.ts
export interface ObsidianCtx {
  baseDir: string
  ws: WorkspaceInfo
  config: ResolvedConfig
}

export async function addNote(ctx: ObsidianCtx, input: NoteInput): Promise<NoteResult> { … }
export async function listNotes(ctx: ObsidianCtx, filter: NoteFilter): Promise<Note[]> { … }
```

`ObsidianStorage` queda como orquestador delgado:

```ts
export class ObsidianStorage implements StorageBackend {
  constructor(private ctx: ObsidianCtx) {}
  addNote(input) { return notes.addNote(this.ctx, input) }
  listNotes(filter) { return notes.listNotes(this.ctx, filter) }
  // …delega al resto de módulos
}
```

**Alternatives considered**:
- Clases por dominio (`NotesRepository`, `TodosRepository`) — rechazado: duplica el coste de instanciación y complica el singleton actual.
- Funciones sobre `this` (métodos partidos en archivos via `prototype`) — rechazado: no es idiomático en TS/ESM y degrada la DX.

**Rationale**: funciones puras son trivialmente testeables (se inyecta un `ctx` con `baseDir` apuntando a un dir temporal), habilitan trabajo paralelo (cada módulo en su PR), y mantienen `ObsidianStorage` como punto único de composición.

### Decision 4: Algoritmo de resolución de config en capas

**Choice**: `resolveConfig()` centralizado en `src/config/resolve.ts` con estas reglas:

- **Orden de precedencia** (de mayor a menor): `CLI args > env vars > repo `.logbook.json` > vault `vault.json` > global `~/.logbook/config.json` > defaults hardcoded`.
- **Merge por clave** a nivel raíz; **deep-merge** para objetos anidados conocidos (`folders`, `dailyNote`, `templates`, `workspaceStrategyOptions`).
- **Arrays reemplazan** (no concatenan). Ejemplo: `excludeProjects` del repo reemplaza completamente al del global.
- El resultado es un objeto fuertemente tipado `ResolvedConfig` más un metadato `ConfigTrace` que anota, por cada campo, qué capa lo aportó. `logbook setup status` imprime este trace.

**Alternatives considered**:
- Reemplazo total por capa (última gana) — rechazado: obliga a repetir toda la config aunque solo cambie un campo.
- Deep-merge incluyendo arrays (concat) — rechazado: la semántica de "excluir proyectos" es definitoria por capa; concat genera sorpresas.

**Rationale**: es el comportamiento que el usuario espera viniendo de otras tools (ESLint, Prettier). El trace hace auditable cada valor sin debugging extra.

### Decision 5: Dispatcher CLI

**Choice**: `src/cli/dispatcher.ts` parsea `process.argv` con una única regla inicial:

- Si existe `--mcp` → llama a `startMcpServer()` (server.ts).
- En otro caso → ruta al subcomando correspondiente (`setup`, `note`, `todo`, `search`).

Los subcomandos viven en `src/cli/commands/*.ts`. Toda la lógica de negocio compartida entre tools MCP y comandos CLI vive bajo `src/core/*.ts`; los subcomandos y las tools son dos capas de presentación encima del core.

**Alternatives considered**:
- Usar commander/yargs — rechazado (por ahora): añade peso; el set de subcomandos v2.0 es pequeño. Se puede introducir en `cli-complete` sin romper el dispatcher.
- Mantener `--mcp` como default y CLI opt-in — rechazado: la UX moderna de CLIs es "binario sin flags = CLI"; el flag `--mcp` va alineado con cómo lo invoca el cliente MCP en su config.

**Rationale**: el dispatcher es <50 líneas, preparable para extensión, y preserva compatibilidad con los snippets MCP existentes que invocan `logbook-mcp --mcp`.

### Decision 6: Backend de búsqueda durante este change (OBSOLETA — superada por Decision 11)

> **Nota**: esta decisión queda obsoleta por la Decision 11 (Orama). Se preserva aquí para
> trazabilidad histórica del proceso de diseño. El fallback substring descrito sigue
> existiendo como safety net durante v2.0.0-alpha según REQ-OS-8.


**Choice**: implementación temporal en `src/storage/obsidian/search.ts`: en la primera llamada a `search`, construye un índice en memoria tipo `Map<filePath, {frontmatter, content}>` escaneando el vault; en llamadas sucesivas dentro del mismo proceso, reutiliza el índice. Búsqueda por substring + tokens del query.

Marcado explícitamente como temporal:

```ts
// TEMPORARY: replaced by orama-search change (roadmap v2)
// See openspec/changes/orama-search for the definitive implementation.
```

**Alternatives considered**:
- Mantener FTS5 vía SQLite shadow — rechazado: contradice el objetivo del change (eliminar SQLite).
- Introducir Orama ya — rechazado: lo gestiona `orama-search`; forzarlo aquí infla el change y acopla releases.
- Dejar la búsqueda desactivada con un mensaje "próximamente" — rechazado: degrada UX existente.

**Rationale**: un scan en memoria es aceptable para vaults <5k notas (la mayoría de usuarios). Para el resto, `orama-search` llega inmediatamente después. El marker `// TEMPORARY` garantiza que no queda oculto.

### Decision 7: Estrategia de coste de tokens para schemas MCP

**Choice**: en este change los schemas Zod se escriben de forma **compacta** (descripciones breves, sin texto auto-inflado). La optimización fina queda diferida a `token-optimizations`. El criterio aquí es "no hacer peor de lo actual y no introducir descripciones que luego haya que recortar".

**Rationale**: mantiene el change enfocado. Habilita que `token-optimizations` trabaje sobre una base ya consolidada (5 tools con acciones) en vez de sobre 10 tools duplicados.

### Decision 8: Estrategia de tests

**Choice**:

- Los tests Vitest existentes (151 tests) deben seguir verdes tras cada fase del split. Se ejecuta `npm test` al final de cada PR intermedio.
- Nuevos tests se añaden para: `resolveConfig()` (matriz de capas), wizard en modo no-interactivo con `HOME` apuntando a un dir temporal, dispatcher CLI (args variants), módulos de dominio Obsidian refactorizados.
- Los tests de `generateDashboard()`, `migrateTodosFolder()` y `SqliteStorage` se eliminan en la misma PR que borra el código correspondiente.

**Rationale**: preserva la red de seguridad del refactor sin mezclar "borrar tests válidos" con "borrar tests obsoletos".

### Decision 9 — Shims policy (resuelve REQ-SD-1..5)

**Choice**: los 5 shims deprecated (`logbook_tags`, `logbook_reminders`, `logbook_review`,
`logbook_inbox`, `logbook_topics`) se implementan como **delegadores thin**, ubicados en
`src/tools/shims/{tags,reminders,review,inbox,topics}.ts`.

Cada shim:

- Registra el tool con el **nombre viejo** y el **schema viejo** (compatibilidad exacta).
- En el handler, resuelve el input al action equivalente del tool consolidado (`logbook_query`
  o `logbook_setup`) llamando directamente a la función del core (`src/core/*`) — NO
  reimplementa lógica.
- Decora la respuesta con `{ _deprecated: true, _replacement: "<tool>.<action>" }`.
- v2.0: descripción con prefijo `[DEPRECATED: se eliminará en v2.2. Usa X.]`.
- v2.1: añade `logger.warn` one-shot por proceso (guardado en un `Set<string>` para evitar spam).
- v2.2: archivos `src/tools/shims/*` eliminados; registro en `src/server.ts` limpiado.

**Alternatives considered**:

- Reescribir tools viejos para seguir conteniendo lógica propia — rechazado: duplica superficie.
- Eliminar de golpe y documentar breaking change — rechazado: silent breakage en clientes con tools cacheados (LLM alucina).
- Middleware genérico que detecta nombres viejos en `tools/call` — rechazado: los clientes los enumeran vía `tools/list` y los cachean; el middleware no resuelve la cache.

**Rationale**: mínima superficie de código para máxima compatibilidad; período de deprecación
explícito de dos minors da a clientes y usuarios tiempo de migrar sin sorpresas.

### Decision 10 — Reminders state storage (resuelve REQ-RF-1..6)

**Choice**: archivo `.logbook/reminders-state.json` dentro de `<vault>/<root>/` (el mismo
directorio donde vive `vault.json`, `index-cache.json` y `code-todos-snapshot.json`).

Schema:

```json
{ "version": 1, "acks": { "<reminder_id>": "<YYYY-MM-DD>" } }
```

- **Escritura atómica**: write-to-temp + rename (`fs.rename` es atómico a nivel POSIX y
  aceptable en Windows sobre el mismo volumen).
- **Lectura tolerante**: si el archivo está corrupto (JSON inválido), se recrea vacío y se
  loguea warning.
- **Portabilidad**: al vivir dentro del vault, viaja con el sync del usuario (Obsidian Sync,
  iCloud, Syncthing).

**Alternatives considered**:

- Archivo en `~/.logbook/reminders-state.json` (global) — rechazado: no viaja con el vault;
  usuarios con varios dispositivos perderían estado.
- Frontmatter del propio reminder (`lastAck: YYYY-MM-DD`) — rechazado: acoplar estado dinámico
  al contenido inmutable complica el diff git y el merge entre dispositivos.
- SQLite dedicado solo para acks — rechazado: contradice el objetivo del change (eliminar
  dependencia nativa).

**Rationale**: portable, inspeccionable a ojo, zero-dependency, atómico en la práctica.

### Decision 11 — Orama index lifecycle (resuelve REQ-OS-1..8)

**Choice**: construcción **lazy** al primer `search`/`log` call (no al arranque del server).

- **Cache**: `.logbook/index-cache.json` serializado con la API `persist`/`restore` de Orama.
  Invalidación por mtime del archivo más reciente del vault vs. mtime de la cache.
- **Watcher**: `chokidar` con debounce 500ms sobre `<vault>/<root>/**/*.md`, eventos `add`,
  `change`, `unlink`.
- **Updates internos síncronos**: operaciones de escritura del propio server
  (`insertNote`, etc.) actualizan el índice en memoria antes de devolver la respuesta, sin
  esperar al watcher (evita race con un `search` inmediato posterior).
- **Fallback**: si `@orama/orama` falla al importarse o al construir, el adaptador en
  `src/storage/obsidian/orama-adapter.ts` activa un fallback substring y loguea un warning.
  Solo se mantiene durante v2.0.0-alpha.

Adaptador: `src/storage/obsidian/orama-adapter.ts` expone
`buildIndex(ctx)`, `searchIndex(ctx, query, filters)`, `updateDoc(ctx, doc)`,
`removeDoc(ctx, id)`, `persistCache(ctx)`, `loadCache(ctx)`.

**Alternatives considered**:

- Construcción eager al arrancar el server — rechazado: penaliza sesiones que solo capturan
  (note/todo) sin buscar; ~200ms extra de coldstart sobre vaults medios.
- Pasar FTS5 a sql.js (SQLite WASM) — rechazado: más peso (~1MB wasm) y peor DX que Orama
  puro JS.
- Watcher basado en polling manual cada N segundos — rechazado: chokidar ya resuelve
  correctamente la matriz Windows/macOS/Linux.

**Rationale**: coste amortizado (solo indexa quien busca), arranque rápido,
escrituras sin race, recuperación ante fallo.

### Decision 12 — Auto-wikilinks architecture (resuelve REQ-AW-1..7)

**Choice**: implementado como middleware en la capa de core (`src/core/auto-wikilinks.ts`) que recibe `content: string` + `vaultIndex: Set<string>` (IDs de notas existentes) y devuelve el content procesado. Llamado desde `src/core/notes.ts`, `src/core/todos.ts`, `src/core/entries.ts` antes de pasar el content al storage.

- **vaultIndex**: se obtiene del mismo índice Orama (Decision 11) filtrando por campo `id`, sin coste adicional (el índice ya vive en memoria).
- **Detection regex**: `/\b(\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]*)\b/g` aplicada sobre el content, con chequeo previo de que la ocurrencia no está ya dentro de un `[[…]]` (idempotencia REQ-AW-2).
- **Expansion de `ref:<id>`**: regex separada `/\bref:(\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]*)\b/g`; ambos procesamientos se aplican secuencialmente (primero ref-expansion, luego auto-wrap para capturar el caso en que un `ref:` inexistente no se envuelve tras la primera fase).
- **Flag**: `config.autoWikilink` (default `true`). Si `false`, el middleware devuelve el content sin cambios.
- **Fallback SQLite legacy**: el middleware sólo se inserta en la cadena de core cuando el backend activo es Obsidian; en modo SQLite legacy el core pasa el content sin invocar al middleware (REQ-AW-7).

**Alternatives considered**:

- Hacerlo en `src/storage/obsidian/wikilinks.ts` directamente — rechazado: acopla dominio (IDs) con formato (markdown); el middleware pertenece al core compartido tools↔CLI.
- Resolver el vaultIndex por `fs.stat` on-demand por cada ID candidato — rechazado: latencia O(N) por disco; Orama ya tiene los IDs en memoria.
- Implementar con un parser markdown completo — rechazado: overkill; dos regex cubren el 100% de los casos documentados sin tocar code fences (que no contienen IDs con ese patrón en la práctica).

**Rationale**: middleware puro y testeable aislado (entrada: `(content, vaultIndex, config)`; salida: `content'`), comparte el índice Orama existente sin coste extra, no añade latencia perceptible (<1ms para content medio), y no toca el wikilinks.ts actual (que sigue dedicado a rendering).

## Data Flow

Flujo principal del proceso al arrancar el binario:

```
argv ──→ src/cli/dispatcher.ts
             │
             ├── --mcp ──→ src/server.ts (createServer)
             │                 │
             │                 └──→ tools/{note,todo,entry,query,setup}.ts
             │                          │
             │                          └──→ src/core/* (lógica compartida)
             │                                   │
             │                                   └──→ storage.getStorage()
             │                                            │
             │                                            └──→ ObsidianStorage
             │                                                     │
             │                                                     └──→ obsidian/{notes,todos,…}.ts
             │
             └── cli ──→ src/cli/commands/{setup,note,todo,search}.ts
                              │
                              └──→ src/core/* (los MISMOS módulos que tools)
                                       │
                                       └──→ (misma cadena hacia storage)
```

Flujo de config (cold start):

```
defaults ──┐
global ────┤
vault ─────┼──→ resolveConfig() ──→ ResolvedConfig + ConfigTrace
repo ──────┤                              │
env ───────┤                              └─→ pasado a ObsidianCtx
CLI args ──┘                                    └─→ disponible en todo core/ y tools/
```

## File Changes

Árbol objetivo tras el cambio:

```
src/
├── index.ts                    # binario principal (delegates to dispatcher)
├── server.ts                   # createServer() con 5 tools + recurso reminders
├── config/
│   ├── defaults.ts             # constantes hardcoded (estructura actual v1)
│   ├── resolve.ts              # resolveConfig() merge por capas + ConfigTrace
│   ├── types.ts                # Config, VaultConfig, ProjectConfig, ResolvedConfig
│   ├── detect-vaults.ts        # cascada: obsidian.json → scan → manual
│   ├── detect-plugins.ts       # lee <vault>/.obsidian/community-plugins.json
│   └── reminders-state.ts      # read/write atómico de .logbook/reminders-state.json
├── cli/
│   ├── dispatcher.ts           # --mcp vs CLI mode routing
│   ├── prompts.ts              # utilidades interactivas (@clack/prompts)
│   ├── snippet.ts              # snippet MCP por cliente (claude-code, desktop, cursor, …)
│   └── commands/
│       ├── setup.ts            # init | status | reorganize
│       ├── note.ts             # note <content>
│       ├── todo.ts             # todo add <content>   (v2.0 solo add)
│       └── search.ts           # search <query>
├── core/
│   ├── notes.ts                # lógica compartida MCP + CLI
│   ├── todos.ts
│   ├── entries.ts
│   ├── search.ts
│   ├── reminders.ts
│   └── auto-wikilinks.ts       # middleware: autoWrapIds + expandRefShortcut
├── storage/
│   ├── types.ts                # StorageBackend (interfaz preservada)
│   ├── index.ts                # getStorage() — solo obsidian
│   └── obsidian/
│       ├── index.ts            # ObsidianStorage orquestador (<500 líneas)
│       ├── notes.ts
│       ├── todos.ts
│       ├── entries.ts
│       ├── search.ts           # // TEMPORARY: replaced by orama-search
│       ├── reminders.ts
│       ├── topics.ts
│       ├── inbox.ts
│       ├── templates.ts
│       ├── code-todos.ts       # snapshot diff contra .logbook/code-todos-snapshot.json
│       ├── reminders.ts        # recurring real + ack persistido en .logbook/reminders-state.json
│       ├── orama-adapter.ts    # buildIndex/searchIndex/updateDoc/persistCache/loadCache + watcher
│       ├── backlinks.ts        # placeholder v2.0 (cuerpo completo en change siguiente)
│       ├── git-context.ts      # placeholder v2.0
│       ├── daily-note.ts       # placeholder v2.0
│       └── internals/          # preservados: frontmatter, slug, wikilinks, files, formatting, workspace
├── git/
│   ├── detect-repo.ts
│   └── code-todos.ts           # git grep (lectura)
├── resources/
│   └── reminders.ts            # logbook://reminders (cap 500 tokens)
├── tools/
│   ├── note.ts
│   ├── todo.ts
│   ├── entry.ts
│   ├── query.ts                # absorbe tags + reminders + review; añade action:get
│   ├── setup.ts                # absorbe inbox + topics; init/status/reorganize
│   └── shims/                  # delegadores thin deprecated (eliminados en v2.2)
│       ├── tags.ts
│       ├── reminders.ts
│       ├── review.ts
│       ├── inbox.ts
│       └── topics.ts
```

Eliminados:

```
src/db/                         # connection.ts, schema.ts, queries.ts
src/storage/sqlite/
src/auto-migrate.ts
src/tools/tags.ts
src/tools/reminders.ts
src/tools/review.ts
src/tools/inbox.ts
src/tools/topics.ts
```

Tabla resumen:

| Ruta | Acción | Descripción |
|------|--------|-------------|
| `src/storage/obsidian/index.ts` | Modify | Reducido a orquestador `<500` líneas. |
| `src/storage/obsidian/{notes,todos,entries,search,reminders,topics,inbox,templates,code-todos,backlinks,git-context,daily-note}.ts` | Create | 12 módulos de dominio (funciones puras). |
| `src/config/{defaults,resolve,types,detect-vaults,detect-plugins}.ts` | Create | Sistema de config en capas. |
| `src/cli/{dispatcher,prompts,snippet}.ts` y `src/cli/commands/*` | Create | Dispatcher + subcomandos v2.0. |
| `src/core/*` | Create | Lógica compartida tools MCP ↔ CLI. |
| `src/core/auto-wikilinks.ts` | Create | Middleware `autoWrapIds` + `expandRefShortcut` aplicado antes de storage write. |
| `src/tools/{query,setup}.ts` | Modify | Nuevas `action`s consolidadas. |
| `src/tools/{tags,reminders,review,inbox,topics}.ts` | Delete | Absorbidos por `query`/`setup`. |
| `src/server.ts` | Modify | Registra 5 tools. |
| `src/index.ts` | Modify | Delega a dispatcher; quita auto-migrate, dashboard, migrateTodosFolder. |
| `src/config.ts` | Modify/Move | Contenido migrado a `src/config/`. |
| `src/cli.ts` | Modify/Move | Contenido migrado a `src/cli/`. |
| `src/db/**` | Delete | Backend SQLite eliminado. |
| `src/storage/sqlite/**` | Delete | Backend SQLite eliminado. |
| `src/auto-migrate.ts` | Delete | No hay migración. |
| `package.json` | Modify | `better-sqlite3` eliminado por completo; `version: 2.0.0`. |
| `tsup.config.ts` | Sin cambios | Single entry mantiene la config actual. |

## Interfaces / Contracts

### Contexto compartido de Obsidian

```ts
// src/storage/obsidian/internals/ctx.ts
export interface ObsidianCtx {
  baseDir: string             // <vault>/<root>
  ws: WorkspaceInfo           // workspace + project detectados
  config: ResolvedConfig      // config resuelta por capas
}
```

### Config resuelta

```ts
// src/config/types.ts
export interface ResolvedConfig {
  vault: { name: string; path: string; root: string }
  alias?: string
  folders: Record<EntryKind, string>
  pathTemplate: string
  workspace?: string
  workspaceStrategy: 'git-remote-org' | 'parent-folder' | 'manual' | 'none'
  dailyNote: { enabled: boolean; folder: string; format: string }
  templates: { userFolder?: string }
  excludeProjects: string[]
  autoWikilink: boolean          // default: true
}

export interface ConfigTrace {
  [field: string]: 'cli' | 'env' | 'repo' | 'vault' | 'global' | 'default'
}

export function resolveConfig(layers: ConfigLayers): {
  config: ResolvedConfig
  trace: ConfigTrace
}
```

### Dispatcher

```ts
// src/cli/dispatcher.ts
export async function dispatch(argv: string[]): Promise<number> {
  if (argv.includes('--mcp')) return startMcpServer()
  const [cmd, sub, ...rest] = argv.slice(2)
  switch (cmd) {
    case 'setup':  return runSetup(sub, rest)
    case 'note':   return runNote(rest)
    case 'todo':   return runTodo(sub, rest)
    case 'search': return runSearch(rest)
    default:       return printHelp()
  }
}
```

## Testing Strategy

| Capa | Qué se testea | Enfoque |
|------|---------------|---------|
| Unit | `resolveConfig()` — matriz de capas (defaults, global, vault, repo, env, cli) y deep-merge | Casos parametrizados; asserts sobre `config` y `trace`. |
| Unit | Módulos `src/storage/obsidian/*.ts` | Función pura + `ctx` apuntando a `os.tmpdir()`; fixtures de frontmatter. |
| Unit | `src/core/*.ts` | Invocación directa; stubs del storage con doble (spy/fake). |
| Unit | `src/cli/dispatcher.ts` | Inyectar `argv` sintético y verificar routing (sin ejecutar comandos). |
| Unit | `src/cli/snippet.ts` | Snapshots por cliente (claude-code, desktop, cursor, …). |
| Integration | Wizard `setup init` en modo `--non-interactive` | `HOME=os.tmpdir()`, verifica archivos generados; coverage de `--force` y su backup. |
| Integration | Compatibilidad Vitest v1 | Toda la suite heredada pasa tras cada fase del split. |
| E2E (smoke) | Fresh install → wizard → note → todo → search → modo `--mcp` | Script manual previo a release; documentado en `tasks.md`. |

## Migration / Rollout

### Release plan

1. PR 1: infraestructura de config + tsup dual-entry (no-op funcional).
2. PR 2..N: splits por dominio del monolito Obsidian (pequeños, revisables, cada uno con tests verdes).
3. PR de consolidación: tools 10→5, wizard, dispatcher CLI.
4. PR final: borrado SQLite + eliminar código muerto + eliminar `better-sqlite3` por completo.
5. Smoke test manual.
6. Tag `v2.0.0-rc.1` en npm; esperar a `orama-search` para `v2.0.0`.

### Impacto para usuarios

- **v1 sin datos SQLite** (ya en modo Obsidian): actualizar → el wizard detecta config existente y ofrece adoptar. Sin acción destructiva.
- **v1 con datos SQLite**: v2 ignora `~/.logbook/logbook.db`; el archivo queda intacto en disco. Si el usuario quiere recuperar acceso, debe reinstalar v1 (`npm i -g @cocaxcode/logbook-mcp@0.4`). El CHANGELOG y README marcan v2 como hard breaking respecto a datos v1.

### Rollback

- Vía `git revert` del merge — ver `proposal.md#rollback-plan`. Este diseño lo facilita: el orden de commits pone los deletes al final, de modo que el revert antes del delete restaura estado funcional sin recuperar archivos.
- Si un usuario ya migró sus datos, la reversión requiere reinstalar `@cocaxcode/logbook-mcp@0.4` y usar el `.db` original conservado (el migrate no lo modifica).
- Archivos de config nuevos son aditivos: borrarlos restaura defaults.

## Dependencies

- **Añadir**: `@clack/prompts` (wizard interactivo; pequeño, cero deps transitivas pesadas).
- **Añadir**: `@orama/orama` (motor de búsqueda full-text puro JS, sin nativas; ~40KB gzipped).
- **Añadir**: `chokidar` (watcher cross-platform para cambios externos en el vault).
- **Eliminar**: `better-sqlite3` por completo. v2 no carga SQLite en ningún momento.

## Build Config (tsup)

```ts
// tsup.config.ts
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node18',
  clean: true,
  sourcemap: true,
})
```

En `package.json`:

```json
{
  "bin": {
    "logbook-mcp": "./dist/index.js"
  }
}
```

`better-sqlite3` no aparece en ninguna sección de `package.json` tras v2.

## Rollback Plan References

Ver `proposal.md#rollback-plan`. Complementos específicos de este diseño:

- El orden de commits dentro de la PR se planifica para que los `rm -rf src/db` y `rm -rf src/storage/sqlite` sean los **últimos** en aterrizar. Si algo falla post-split pero antes del borrado de SQLite, basta con `git revert` del commit de consolidación y los datos SQLite siguen intactos.
- El `.db` v1 del usuario queda intacto en disco — v2 nunca lo lee ni lo borra.

## Open Questions

Ninguna. La ambigüedad marcada en specs (`REQ-WI-6`) queda resuelta por la Decision 1.
