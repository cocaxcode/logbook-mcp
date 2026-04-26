# Proposal: Split del monolito ObsidianStorage en 12 módulos por dominio

**Change id**: `v2.2-split-monolith`
**Tipo**: Refactor interno (sin cambio de API pública)
**Posición**: 2 de 3 cambios v2 (post `drop-sqlite-split-monolith`, pre features v2.2 PKM)

## Intent

`src/storage/obsidian/index.ts` tiene **2200+ líneas** y ~30 métodos en una sola clase. v2.0 entregó el resto del scope (drop SQLite, tools 10→5, CLI, Orama, fixes) pero el split estructural quedó deferido porque:

1. Los métodos están altamente acoplados a `this.x` con helpers privados (`projectDir`, `typeDir`, `getTopicFolder`, `getTopicKind`, `filterAndMap`, `ensureDashboard`...).
2. Un split limpio requiere extraer todos los helpers compartidos primero, propagar contexto, y replicar suficientes tests por módulo.
3. v2.0 ya entregaba muchos cambios disruptivos (drop SQLite, tools 10→5, async search). Añadir el split aumentaba el riesgo de regresiones sin valor visible para el usuario.

## Scope

### In Scope

Split del monolito en **12 módulos por dominio** dentro de `src/storage/obsidian/`:

```
src/storage/obsidian/
├── index.ts                # ObsidianStorage orquestador (<500 líneas)
├── internals/
│   ├── ctx.ts              # ObsidianContext interface (baseDir, ws, helpers públicos)
│   └── todos-file.ts       # readTodosFile, writeTodosFile, withFileLock, format/parse
├── notes.ts                # insertNote, getNotes, insertTableRow
├── todos.ts                # insertTodo, getTodos, updateTodoStatus, updateTodo, deleteTodos, ackRecurringReminder, searchInTodosFile
├── entries.ts              # insertStandup, insertDecision, insertDebug, updateEntry, deleteEntry, listEntries, getEntryById
├── search.ts               # search() con Orama + fallback substring
├── reminders.ts            # getDueReminders, collectRemindersFromProject, searchInReminders
├── topics.ts               # getTopics, insertTopic, getCustomTopicsPath, loadCustomTopics, saveCustomTopics, getTopicFolder, getTopicKind
├── tags.ts                 # getTags
├── inbox.ts                # getInboxItems, processInboxItem
├── templates.ts            # generateTemplates
├── code-todos.ts           # getCodeTodos, syncCodeTodos
├── dashboard.ts            # generateDashboard, ensureDashboard, findWorkspaceForProject
├── timeline.ts             # getLog, getTimeline
├── review.ts               # generateReview
└── (mantenidos) frontmatter.ts, slug.ts, workspace.ts, wikilinks.ts, files.ts, formatting.ts, orama-adapter.ts
```

Cada módulo expone **funciones puras** que reciben un contexto explícito:

```ts
export function insertNote(ctx: ObsidianContext, content: string, topic?: string): NoteEntry { … }
```

`ObsidianStorage` queda como orquestador delgado que implementa `ObsidianContext` y delega:

```ts
class ObsidianStorage implements StorageBackend, ObsidianContext {
  insertNote(content, topic) { return notes.insertNote(this, content, topic) }
  getNotes(filters)         { return notes.getNotes(this, filters) }
  // … 30+ delegaciones más
}
```

### Out of Scope

- Cambios en `StorageBackend` o tools MCP (la API pública no cambia).
- Cambios funcionales (este change es 100% refactor; comportamiento idéntico).
- Reestructuración del schema de Orama o de los archivos en disco.

## Approach

Extracción **por dominio** con tests verdes en cada paso:

1. **Setup**: crear `internals/ctx.ts` con `ObsidianContext` interface. Hacer públicos los helpers privados que necesitarán los módulos (con `@internal` JSDoc).
2. **Domain por domain**: extraer un módulo, replace las method bodies del class con delegators, run tests, commit. Repetir.
3. **Adelgazar**: una vez extraídos todos los dominios, `ObsidianStorage` queda como un mapeo 1:1 de métodos a llamadas a módulos.
4. **Tests por módulo**: añadir tests unitarios focalizados (con `os.tmpdir()` + ctx mínimo) por cada módulo extraído.

Orden sugerido (de menor a mayor riesgo):
- `tags`, `code-todos`, `inbox` — pequeños, aislados.
- `dashboard`, `templates`, `review` — autocontenidos pero más grandes.
- `topics`, `reminders` — usan helpers internos y persisten estado.
- `notes`, `todos`, `entries` — núcleo de la lógica.
- `search`, `timeline` — agregan resultados de varios dominios.
- `internals/todos-file.ts` — extraer al final cuando ya no haya métodos que lo usen directamente.

## Risks

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| Romper algún test al mover bodies | Alta | Medio | Extracción 1 dominio a la vez; tests verdes en cada paso |
| Pérdida de cohesión visual al separar archivos | Baja | Bajo | Convención de naming clara + ObsidianContext bien tipada |
| Bug por shadowing o renombrado (`this.x` → `ctx.x`) | Media | Medio | Reemplazos puntuales con grep+revisión; test runner como red de seguridad |

## Success Criteria

- [ ] `src/storage/obsidian/index.ts` <= 500 líneas (orquestador puro)
- [ ] 12 módulos de dominio existen
- [ ] Suite Vitest verde con cobertura al menos equivalente (137 tests)
- [ ] `npm run typecheck` sin errores
- [ ] `npm run build` produce `dist/` sin regresiones de tamaño
- [ ] Tests unitarios añadidos por cada módulo (mínimo 1 caso por dominio)
- [ ] Sin cambios en `StorageBackend` interface ni en los 5 tools MCP
- [ ] CHANGELOG documenta el cambio como refactor interno (no breaking)
