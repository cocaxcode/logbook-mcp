# Spec delta: `reminders-fix`

**Change id**: `drop-sqlite-split-monolith`
**Capability**: `reminders` (MODIFIED)

## Contexto

En v1 el backend Obsidian tiene dos bugs silenciosos:

- `ackRecurringReminder` está implementado como `void {}` — nunca persiste el ack.
- `recurring: []` está hardcoded en el output de `getDueReminders` — nunca se devuelven
  recordatorios recurrentes reales.

El resource `logbook://reminders` hace auto-ack al listar, lo que provoca que recordatorios
no leídos por el LLM se marquen como vistos. Además hay dos formatos conviviendo:
líneas inline en `todos.md` con emoji ⏰ (formato legacy) y archivos individuales bajo
`reminders/` (formato nuevo).

Este spec fija el comportamiento correcto en v2.0.

## Requirements

### REQ-RF-1 — Estado de acks DEBE persistir en `.logbook/reminders-state.json`

Los reminders recurrentes DEBEN persistir su ack en
`<vault>/<root>/.logbook/reminders-state.json` con el schema:

```json
{ "version": 1, "acks": { "<reminder_id>": "<YYYY-MM-DD>" } }
```

La escritura DEBE ser atómica (write-to-temp + rename).

#### Scenario: Ack se persiste al invocar el tool

- Given un reminder recurrente `id:weekly-standup` sin ack hoy
- When se invoca `logbook_query action:reminders ack id:weekly-standup`
- Then `.logbook/reminders-state.json` DEBE contener `acks["weekly-standup"] = "<hoy>"`.

#### Scenario: Escritura atómica sobrevive a crash simulado

- Given un archivo `.logbook/reminders-state.json` existente
- When el proceso aborta entre el write temporal y el rename
- Then el archivo original DEBE quedar intacto y legible.

### REQ-RF-2 — `getDueReminders` DEBE devolver `recurring` real

`getDueReminders` DEBE escanear los reminders con patrón recurrente activo, leer el estado
de acks, y devolver en el campo `recurring` aquellos cuyo patrón está activo HOY y que no
tienen ack registrado para la fecha actual.

Patrones soportados: `daily`, `weekdays`, `weekly:N` (N=0..6, 0=domingo), `monthly:N` (N=1..31).

#### Scenario: Reminder weekly:2 (martes) reaparece cada martes

- Given un reminder `{ id:'r1', pattern:'weekly:2' }` acked el martes 2026-04-14
- When se llama a `getDueReminders` el martes 2026-04-21
- Then `recurring` DEBE contener `r1`.

#### Scenario: Reminder daily acked hoy no reaparece

- Given un reminder `{ id:'r2', pattern:'daily' }` acked hoy
- When se llama a `getDueReminders`
- Then `recurring` NO DEBE contener `r2`.

#### Scenario: Pattern monthly:15

- Given un reminder `{ id:'r3', pattern:'monthly:15' }` nunca acked
- When se llama a `getDueReminders` el día 15 del mes
- Then `recurring` DEBE contener `r3`
- When se llama el día 16
- Then `recurring` NO DEBE contener `r3`.

### REQ-RF-3 — Ack DEBE ocurrir desde el tool, no desde el resource

El resource `logbook://reminders` DEBE ser read-only: listar no hace ack.
El ack DEBE ejecutarse únicamente vía el tool `logbook_query action:reminders ack`
(o su shim deprecated `logbook_reminders action:ack`).

#### Scenario: Leer el resource no marca como vistos

- Given dos reminders recurrentes pendientes
- When el cliente lee `logbook://reminders` tres veces seguidas
- Then ninguno de los dos DEBE aparecer como acked en `reminders-state.json`
- And la tercera lectura DEBE devolver los mismos dos reminders.

### REQ-RF-4 — Migración de reminders inline legacy

Reminders con formato inline en `todos.md` (línea con emoji ⏰) DEBEN migrarse al formato
nuevo (archivo individual en `<root>/reminders/<slug>.md` con frontmatter) la primera vez
que se detecten en v2.0. La línea inline DEBE eliminarse del `todos.md` original.

#### Scenario: Migración one-shot detecta y mueve

- Given un `todos.md` con una línea `- [ ] ⏰ Reunión semanal #weekly:1`
- When el servidor arranca en v2.0 por primera vez contra ese vault
- Then DEBE existir `reminders/reunion-semanal.md` con frontmatter `pattern: weekly:1`
- And la línea inline DEBE haberse eliminado del `todos.md`.

#### Scenario: Migración idempotente en segundo arranque

- Given la migración ya se ejecutó una vez (marker `.logbook/reminders-migrated`)
- When el servidor vuelve a arrancar
- Then NO DEBE re-procesar `todos.md`.

### REQ-RF-5 — Filtro por status DEBE ser estricto

Reminders completados NO DEBEN aparecer en la lista de pendientes bajo ninguna combinación
de filtros que pida `status: pending` o equivalente.

#### Scenario: Status completed excluido

- Given un reminder marcado con frontmatter `status: done`
- When se llama a `getDueReminders` sin filtros
- Then el reminder NO DEBE aparecer en `pending`, `overdue` ni `recurring`.

### REQ-RF-6 — Snooze DEBE soportarse vía parámetro opcional

El ack DEBE aceptar un parámetro opcional `snooze_until: YYYY-MM-DD` que registra el ack
como si la fecha fuera la indicada, posponiendo la próxima aparición.

#### Scenario: Snooze pospone un reminder daily

- Given un reminder daily `id:r1`
- When se invoca `logbook_query action:reminders ack id:r1 snooze_until:2026-04-25`
- Then `reminders-state.json` DEBE tener `acks["r1"] = "2026-04-25"`
- And llamadas a `getDueReminders` entre hoy y el 2026-04-25 NO DEBEN incluir `r1`
- And la llamada del 2026-04-26 DEBE volver a incluir `r1`.
