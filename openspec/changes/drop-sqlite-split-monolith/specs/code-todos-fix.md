# Spec delta: `code-todos-fix`

**Change id**: `drop-sqlite-split-monolith`
**Capability**: `code-todos` (MODIFIED)

## Contexto

En v1 el backend Obsidian implementa `syncCodeTodos` como una función que devuelve
`{ added: 0, resolved: 0 }` sin ejecutar ninguna acción real. Los code TODOs
(`// TODO`, `// FIXME`, `// HACK`, `// BUG`) detectados vía `git grep` no se reconcilian
con los listados previos.

Este spec define la semántica correcta de sync basada en un snapshot local.

## Requirements

### REQ-CT-1 — Snapshot DEBE persistirse en `.logbook/code-todos-snapshot.json`

`syncCodeTodos` DEBE leer y escribir un snapshot en
`<vault>/<root>/.logbook/code-todos-snapshot.json` con el schema:

```json
{
  "version": 1,
  "updatedAt": "<ISO-8601>",
  "items": [ { "file": "<path>", "line": 42, "text": "<contenido>" } ]
}
```

La escritura DEBE ser atómica (write-to-temp + rename).

#### Scenario: Primera sync crea snapshot

- Given un repo con 2 TODOs (`a.ts:5`, `b.ts:12`) y ningún snapshot previo
- When se invoca `syncCodeTodos`
- Then DEBE crearse `.logbook/code-todos-snapshot.json` con los 2 items.

### REQ-CT-2 — Code TODO nuevo DEBE aparecer en la lista

Un code TODO presente en el escaneo actual pero ausente en el snapshot previo DEBE aparecer
como `source: code` en la respuesta de `logbook_todo action:list source:all`, sin crear un
archivo de TODO manual.

#### Scenario: Nuevo TODO detectado

- Given un snapshot con `[{file:'a.ts', line:5, text:'TODO: foo'}]`
- And el escaneo actual encuentra `[{file:'a.ts', line:5, text:'TODO: foo'}, {file:'b.ts', line:12, text:'TODO: bar'}]`
- When se invoca `syncCodeTodos`
- Then el resultado DEBE ser `{ added: 1, resolved: 0 }`
- And `logbook_todo action:list source:all` DEBE incluir `TODO: bar` con `source: code`.

### REQ-CT-3 — Code TODO desaparecido DEBE marcarse resolved

Un code TODO presente en el snapshot previo pero ausente en el escaneo actual DEBE marcarse
como `status: done` automáticamente (resolved implícito por eliminación del código).

#### Scenario: TODO eliminado del código se resuelve

- Given un snapshot con `[{file:'a.ts', line:5, text:'TODO: foo'}]`
- And el escaneo actual devuelve `[]` (el TODO fue borrado del código)
- When se invoca `syncCodeTodos`
- Then el resultado DEBE ser `{ added: 0, resolved: 1 }`
- And el código TODO `TODO: foo` DEBE marcarse como `done` internamente.

### REQ-CT-4 — Snapshot DEBE actualizarse tras cada sync exitoso

Tras una ejecución exitosa de `syncCodeTodos`, el snapshot DEBE reflejar el estado actual
del escaneo, reemplazando el contenido anterior.

#### Scenario: Snapshot refleja escaneo tras sync

- Given un snapshot `[A, B]` y un escaneo `[B, C]`
- When `syncCodeTodos` se completa con éxito
- Then el snapshot persistido DEBE ser exactamente `[B, C]`.

### REQ-CT-5 — Ausencia de git grep NO DEBE romper sync

Si `git grep` no está disponible (el directorio no es un repo git, o git no está instalado),
`syncCodeTodos` DEBE devolver `{ added: 0, resolved: 0 }` sin lanzar excepción y sin tocar
el snapshot.

#### Scenario: Directorio no-git

- Given un cwd que no es repo git
- When se invoca `syncCodeTodos`
- Then el resultado DEBE ser `{ added: 0, resolved: 0 }`
- And el proceso NO DEBE terminar con error
- And el snapshot NO DEBE modificarse.
