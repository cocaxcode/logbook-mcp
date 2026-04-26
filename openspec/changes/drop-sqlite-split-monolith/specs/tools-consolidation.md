# Delta: tools-consolidation (ADDED)

**Action**: ADDED
**Capability**: `tools-consolidation`
**Change**: `drop-sqlite-split-monolith`

Define la consolidación de los 10 tools MCP de v1 a 5 tools en v2, mediante `action` como parámetro discriminador. Objetivo: reducir el coste de schema publicado ~50 % sin perder funcionalidad.

## Requirements

### REQ-TC-1: Cinco tools MCP expuestos

El servidor MCP DEBE registrar exactamente 5 tools:

1. `logbook_note`
2. `logbook_todo`
3. `logbook_entry`
4. `logbook_query`
5. `logbook_setup`

El servidor NO DEBE registrar `logbook_topics`, `logbook_tags`, `logbook_reminders`, `logbook_review`, `logbook_inbox` (absorbidos como actions).

#### Scenario: ListTools devuelve 5 tools

- **Given** el servidor MCP arrancado en modo stdio
- **When** un cliente envía `tools/list`
- **Then** la respuesta DEBE contener exactamente 5 entradas
- **And** los nombres DEBEN ser los cinco listados arriba

#### Scenario: Tools de v1 ausentes

- **Given** el servidor MCP arrancado
- **When** un cliente intenta invocar `logbook_tags`
- **Then** el servidor DEBE responder con error `Method not found` o equivalente

### REQ-TC-2: logbook_query con múltiples actions

`logbook_query` DEBE soportar como `action`: `search`, `log`, `timeline`, `review`, `tags`, `reminders`.

Cada action DEBE validarse con un schema Zod específico por action (runtime validation).

#### Scenario: action:search

- **Given** una llamada con `{ action: 'search', query: 'foo' }`
- **When** el tool se ejecuta
- **Then** DEBE devolver resultados de búsqueda textual

#### Scenario: action:reminders

- **Given** una llamada con `{ action: 'reminders' }`
- **When** el tool se ejecuta
- **Then** DEBE devolver la lista de recordatorios pendientes/vencidos/recurrentes

#### Scenario: action inválida

- **Given** una llamada con `{ action: 'unknown' }`
- **When** el tool se ejecuta
- **Then** DEBE responder con un error de validación Zod que enumere las actions válidas

### REQ-TC-3: logbook_setup con múltiples actions

`logbook_setup` DEBE soportar como `action`: `init`, `status`, `reorganize`, `inbox-list`, `inbox-process`, `topics-list`, `topics-add`.

Los parámetros requeridos y opcionales DEBEN diferir por action y validarse con schemas Zod per-action.

#### Scenario: action:status

- **Given** una llamada con `{ action: 'status' }`
- **When** el tool se ejecuta
- **Then** DEBE devolver la config efectiva con trazabilidad por capa

#### Scenario: action:reorganize --dry-run

- **Given** una llamada con `{ action: 'reorganize', dryRun: true }`
- **When** el tool se ejecuta
- **Then** NO DEBE mover ficheros en el vault
- **And** DEBE devolver una lista de movimientos previstos

#### Scenario: action:topics-add sin parámetro name

- **Given** una llamada con `{ action: 'topics-add' }` sin `name`
- **When** el tool se ejecuta
- **Then** DEBE fallar con un error de validación Zod indicando que `name` es requerido

### REQ-TC-4: Descripciones y parámetros per-action

Las descripciones de los tools y de sus parámetros DEBEN reflejar claramente qué actions existen y qué parámetros aplican a cada una.

Los schemas publicados DEBERÍAN minimizar campos opcionales globales para reducir coste de tokens; usar `discriminatedUnion` de Zod por `action` cuando sea posible.

#### Scenario: Descripción enumera actions

- **Given** el schema publicado de `logbook_query`
- **When** un cliente lee la descripción del tool
- **Then** DEBE listar las 6 actions soportadas con una línea por cada una

### REQ-TC-5: Resource logbook://reminders preservado

El servidor MCP DEBE seguir exponiendo el resource `logbook://reminders` con la misma semántica que en v1 (recordatorios pendientes/vencidos/recurrentes, con auto-ack).

#### Scenario: Listar resources

- **Given** el servidor MCP arrancado
- **When** un cliente envía `resources/list`
- **Then** la respuesta DEBE incluir `logbook://reminders`
