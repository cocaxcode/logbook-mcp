# Spec delta: `shims-deprecation`

**Change id**: `drop-sqlite-split-monolith`
**Capability**: `shims-deprecation` (ADDED)

## Contexto

La consolidación de 10 tools MCP a 5 (ver `tools-consolidation.md`) elimina cinco tools:
`logbook_tags`, `logbook_reminders`, `logbook_review`, `logbook_inbox`, `logbook_topics`.

Los clientes MCP (Claude Code, Claude Desktop, Cursor, Windsurf, VS Code, Codex, Gemini)
cachean las definiciones de tools entre arranques. Si v2.0 los elimina de golpe, las
sesiones activas llaman a nombres inexistentes y el LLM alucina respuestas en vez de
recibir un error claro. Esto es **silent breakage MCP**.

Para mitigarlo, v2.0 conserva los 5 nombres como **shims deprecated** que delegan a los
actions consolidados equivalentes. v2.1 añade `console.warn` al invocarse. v2.2 los elimina.

## Requirements

### REQ-SD-1 — Los shims DEBEN seguir registrados en v2.0

Los 5 tools eliminados DEBEN seguir registrados por el servidor MCP en v2.0 con su nombre
original y su schema Zod original, sin cambios de tipos de input.

#### Scenario: Cliente MCP lista tools y ve los shims

- Given un cliente MCP conectado al servidor en v2.0.0
- When el cliente invoca `tools/list`
- Then la respuesta DEBE incluir los 5 nombres deprecated
  (`logbook_tags`, `logbook_reminders`, `logbook_review`, `logbook_inbox`, `logbook_topics`)
  junto con los 5 tools v2 (`logbook_note`, `logbook_todo`, `logbook_entry`, `logbook_query`, `logbook_setup`).

#### Scenario: Schema de shim idéntico a v1

- Given un cliente que llamaba a `logbook_reminders` en v1 con `{ scope: 'global' }`
- When el mismo cliente llama a `logbook_reminders` con `{ scope: 'global' }` en v2.0
- Then la validación Zod del shim DEBE aceptar el input sin error.

### REQ-SD-2 — Los shims DEBEN delegar al action consolidado

Cada shim DEBE delegar internamente al action consolidado equivalente sin duplicar
lógica de negocio. El mapping obligatorio es:

| Shim | Tool v2 | Action |
|------|---------|--------|
| `logbook_tags` | `logbook_query` | `tags` |
| `logbook_reminders` | `logbook_query` | `reminders` |
| `logbook_review` | `logbook_query` | `review` |
| `logbook_inbox` | `logbook_setup` | `inbox-list` / `inbox-process` |
| `logbook_topics` | `logbook_setup` | `topics-list` / `topics-add` |

#### Scenario: Shim produce el mismo dato que el action

- Given un vault con 3 tags distintos
- When el cliente llama a `logbook_tags` (shim)
- And el cliente llama a `logbook_query action:tags`
- Then ambas respuestas DEBEN contener los mismos 3 tags en el mismo orden.

#### Scenario: Shim NO reimplementa lógica

- Given el código del shim `src/tools/shims/tags.ts`
- When se inspecciona su handler
- Then el handler DEBE invocar la función del core o al action del tool consolidado,
  y NO DEBE contener consultas al storage ni transformaciones propias.

### REQ-SD-3 — Descripción DEBE marcar la deprecación

La descripción registrada del shim DEBE empezar con el literal
`[DEPRECATED: se eliminará en v2.2. Usa <replacement>.]` donde `<replacement>`
nombra el tool y action de reemplazo.

#### Scenario: Descripción incluye prefijo deprecated

- Given el servidor MCP en v2.0.0 arrancado
- When el cliente solicita la definición del tool `logbook_reminders`
- Then el campo `description` DEBE empezar por
  `[DEPRECATED: se eliminará en v2.2. Usa logbook_query action:reminders.]`.

### REQ-SD-4 — Respuesta del shim DEBE incluir flags de deprecación

La respuesta JSON del shim DEBE incluir los campos `_deprecated: true` y
`_replacement: "<tool>.<action>"` además del payload normal.

#### Scenario: Cliente recibe flags de deprecación

- Given un vault válido
- When el cliente invoca `logbook_inbox action:list`
- Then la respuesta DEBE contener `_deprecated: true`
- And DEBE contener `_replacement: "logbook_setup.inbox-list"`
- And DEBE contener los datos normales de la inbox (items, count, etc.).

### REQ-SD-5 — Eliminación en v2.2.0

Los shims DEBEN eliminarse completamente en la versión v2.2.0. El CHANGELOG de v2.2.0
DEBE documentar la eliminación. En v2.1.0 cada shim DEBE además emitir
`console.warn('[logbook-mcp] tool <nombre> is deprecated, use <replacement>')`
al invocarse, una sola vez por proceso.

#### Scenario: v2.1 emite warn al primer uso

- Given el servidor corriendo en v2.1.0
- When el cliente llama a `logbook_tags` por primera vez en el proceso
- Then `console.warn` DEBE emitir un mensaje con el reemplazo
- And sucesivas llamadas al mismo shim en el mismo proceso NO DEBEN repetir el warn.

#### Scenario: v2.2 ya no registra el shim

- Given el servidor corriendo en v2.2.0
- When el cliente invoca `tools/list`
- Then la respuesta NO DEBE incluir `logbook_tags`, `logbook_reminders`,
  `logbook_review`, `logbook_inbox` ni `logbook_topics`.
