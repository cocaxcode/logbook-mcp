# Spec delta: auto-wikilinks

**Change id**: `drop-sqlite-split-monolith`
**Capability**: `auto-wikilinks` (ADDED)

## Intent

Cuando el `content` de un TODO/nota/entry menciona el ID de una nota existente en el vault (patrón `YYYY-MM-DD-slug`), logbook DEBE envolverlo automáticamente como `[[id]]` al guardar. Objetivo: hacer los TODOs y notas clickables en Obsidian para saltar a la nota referenciada sin búsqueda manual. La feature es idempotente, segura (no crea wikilinks rotos), configurable y scoped al modo Obsidian.

## Requirements

### REQ-AW-1 — Detección y wrap de IDs existentes

El sistema DEBE detectar IDs de notas en el `content` recibido por `logbook_todo add`, `logbook_note` y `logbook_entry` usando el patrón `\b(\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]*)\b`. Si el ID detectado corresponde a un archivo existente en el vault (presente en el `vaultIndex`), DEBE envolverlo como `[[id]]` antes de persistir el content.

#### Scenario: ID existente se envuelve

- **Given** un vault con la nota `2026-04-19-arch-plan.md` indexada
- **When** el usuario invoca `logbook_todo add` con `content: "revisar 2026-04-19-arch-plan antes del viernes"`
- **Then** el TODO persistido contiene `"revisar [[2026-04-19-arch-plan]] antes del viernes"`

#### Scenario: Múltiples IDs en un mismo content

- **Given** un vault con las notas `2026-04-10-spec-a.md` y `2026-04-12-spec-b.md` indexadas
- **When** el usuario invoca `logbook_note` con `content: "contrastar 2026-04-10-spec-a con 2026-04-12-spec-b"`
- **Then** el content persistido contiene `"contrastar [[2026-04-10-spec-a]] con [[2026-04-12-spec-b]]"`

### REQ-AW-2 — Idempotencia

La operación DEBE ser idempotente: si el content ya contiene `[[id]]` para ese ID, el sistema NO DEBE duplicar el wrap.

#### Scenario: Content con wikilink previo no se duplica

- **Given** un vault con la nota `2026-04-19-arch-plan.md` indexada
- **When** el usuario invoca `logbook_todo add` con `content: "revisar [[2026-04-19-arch-plan]] hoy"`
- **Then** el TODO persistido contiene `"revisar [[2026-04-19-arch-plan]] hoy"` sin cambios (no `[[[[...]]]]`)

#### Scenario: Mismo ID en wikilink y como texto plano

- **Given** un vault con la nota `2026-04-19-arch-plan.md` indexada
- **When** el content recibido es `"ver [[2026-04-19-arch-plan]] y también 2026-04-19-arch-plan"`
- **Then** el content persistido contiene exactamente dos wikilinks `[[2026-04-19-arch-plan]]` (el existente intacto y la segunda ocurrencia envuelta)

### REQ-AW-3 — Safety: IDs inexistentes no se envuelven

Si el ID detectado por el patrón NO existe como archivo en el vault (no está en `vaultIndex`), el sistema NO DEBE envolverlo. Esto evita generar wikilinks rotos.

#### Scenario: ID inexistente se deja intacto

- **Given** un vault sin nota con ID `2099-12-31-fake`
- **When** el usuario invoca `logbook_todo add` con `content: "recordar 2099-12-31-fake"`
- **Then** el TODO persistido contiene `"recordar 2099-12-31-fake"` sin wrap

#### Scenario: Mezcla de IDs existentes e inexistentes

- **Given** un vault con `2026-04-19-real.md` pero no con `2026-04-19-fake`
- **When** el content recibido es `"ver 2026-04-19-real y 2026-04-19-fake"`
- **Then** el content persistido contiene `"ver [[2026-04-19-real]] y 2026-04-19-fake"`

### REQ-AW-4 — Atajo `ref:<id>`

El atajo `ref:<id>` DEBE expandirse a `[[<id>]]` si el ID existe en `vaultIndex`. Si no existe, el atajo DEBE dejarse intacto (no se convierte a wikilink roto).

#### Scenario: ref:<id> existente se expande

- **Given** un vault con la nota `2026-04-19-arch-plan.md` indexada
- **When** el usuario invoca `logbook_note` con `content: "ver ref:2026-04-19-arch-plan"`
- **Then** el content persistido contiene `"ver [[2026-04-19-arch-plan]]"`

#### Scenario: ref:<id> inexistente queda intacto

- **Given** un vault sin nota con ID `2099-12-31-fake`
- **When** el content recibido es `"ref:2099-12-31-fake"`
- **Then** el content persistido contiene `"ref:2099-12-31-fake"` sin transformación

### REQ-AW-5 — Flag de configuración

La feature DEBE poder desactivarse via `config.autoWikilink: false`. Default: `true`. Cuando `autoWikilink` es `false`, el content se persiste tal cual sin detección ni expansión.

#### Scenario: Default true envuelve

- **Given** `config.autoWikilink` ausente (default `true`) y vault con `2026-04-19-plan.md`
- **When** el content recibido es `"ver 2026-04-19-plan"`
- **Then** el content persistido contiene `"ver [[2026-04-19-plan]]"`

#### Scenario: Flag false deshabilita

- **Given** `config.autoWikilink: false` y vault con `2026-04-19-plan.md`
- **When** el content recibido es `"ver 2026-04-19-plan y ref:2026-04-19-plan"`
- **Then** el content persistido contiene `"ver 2026-04-19-plan y ref:2026-04-19-plan"` sin transformación

### REQ-AW-6 — Alcance de tools afectados

La feature DEBE aplicarse a las acciones que reciban campos de texto libre de `logbook_todo` (actions `add`, `edit`), `logbook_note` y `logbook_entry` (actions `decision`, `debug`, `standup` y sus variantes `edit`), en todos los campos donde el usuario introduce prosa (`content`, `context`, `decision`, `fix`, `notes`, etc.).

#### Scenario: logbook_entry decision envuelve en content y context

- **Given** un vault con `2026-04-18-rfc.md` indexada
- **When** el usuario invoca `logbook_entry action:decision` con `content: "adoptar 2026-04-18-rfc"` y `context: "ver 2026-04-18-rfc"`
- **Then** el entry persistido contiene `[[2026-04-18-rfc]]` en ambos campos

#### Scenario: logbook_todo edit también envuelve

- **Given** un TODO existente y un vault con `2026-04-19-plan.md`
- **When** el usuario invoca `logbook_todo action:edit` con nuevo `content: "ahora referencia 2026-04-19-plan"`
- **Then** el TODO editado persiste con `[[2026-04-19-plan]]`

### REQ-AW-7 — No-op en modo SQLite legacy

Si el backend activo no es Obsidian (modo SQLite legacy, si aplica en la ventana de transición), la feature DEBE ser no-op silenciosa: el content pasa intacto al storage sin invocar el middleware de auto-wikilinks.

#### Scenario: SQLite legacy no transforma content

- **Given** el backend activo es SQLite legacy
- **When** el usuario invoca `logbook_todo add` con `content: "ver 2026-04-19-plan"`
- **Then** el content persistido en SQLite es `"ver 2026-04-19-plan"` sin wrap y sin warning

#### Scenario: SQLite legacy ignora el flag autoWikilink

- **Given** backend SQLite legacy y `config.autoWikilink: true`
- **When** el content recibido es `"ref:2026-04-19-plan"`
- **Then** el content persistido es `"ref:2026-04-19-plan"` sin expansión (la feature es no-op silenciosa)
