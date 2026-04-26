# Delta: cli-mode (ADDED)

**Action**: ADDED
**Capability**: `cli-mode`
**Change**: `drop-sqlite-split-monolith`

Define el modo CLI nativo del binario `logbook-mcp`. En v1 el binario solo entraba en modo server con `--mcp`. En v2 se añade un dispatcher: sin `--mcp`, el binario entra en modo CLI con un subset mínimo de comandos. El CLI completo (list/done/edit/rm/log/reminders/entry con `--json`/`--quiet`) queda diferido al change `cli-complete` (v2.1).

## Requirements

### REQ-CM-1: Dispatcher del binario

El entry-point del binario DEBE inspeccionar `process.argv` y decidir el modo:

- Si `--mcp` está presente → modo server (stdio MCP).
- En cualquier otro caso (incluyendo sin argumentos) → modo CLI.

El dispatcher DEBE residir en `src/cli/dispatcher.ts` y DEBE ser el único punto que discrimina ambos modos.

#### Scenario: --mcp entra en server

- **Given** el binario invocado con `logbook-mcp --mcp`
- **When** el dispatcher se ejecuta
- **Then** DEBE arrancar el servidor MCP en stdio
- **And** NO DEBE imprimir ayuda de CLI

#### Scenario: Sin --mcp entra en CLI

- **Given** el binario invocado con `logbook-mcp note "hola"`
- **When** el dispatcher se ejecuta
- **Then** DEBE despachar al subcomando `note`
- **And** NO DEBE abrir el transport MCP

#### Scenario: Sin argumentos muestra help

- **Given** el binario invocado con `logbook-mcp` sin args
- **When** el dispatcher se ejecuta
- **Then** DEBE mostrar la ayuda del CLI y salir con código 0

### REQ-CM-2: Subcomandos implementados en v2.0

El CLI DEBE implementar los siguientes subcomandos, cada uno en su fichero bajo `src/cli/commands/`:

- `setup init` — wizard interactivo (ver `wizard-init`).
- `setup status` — mostrar config efectiva con trazabilidad.
- `setup reorganize [--dry-run]` — migrar layout tras cambio de config.
- `note <content> [--topic X]` — captura rápida de nota.
- `todo add <content> [--topic X] [--priority P]` — captura rápida de TODO.
- `search <query> [--scope global]` — búsqueda rápida.

Cada subcomando DEBE compartir la misma lógica subyacente que el tool MCP equivalente (misma función de dominio, dos presentaciones).

El CLI NO DEBE implementar en v2.0: `todo list/done/edit/rm`, `log`, `reminders`, `entry`. Esos quedan para `cli-complete` (v2.1).

#### Scenario: note crea una nota sin LLM

- **Given** el usuario ejecuta `logbook-mcp note "idea rápida" --topic idea`
- **When** el comando termina
- **Then** DEBE crearse un fichero `.md` en el vault correspondiente al topic `idea`
- **And** NO DEBE invocarse ningún LLM ni tool MCP
- **And** el comando DEBE salir con código 0

#### Scenario: todo add con prioridad

- **Given** el usuario ejecuta `logbook-mcp todo add "revisar PR" --priority high`
- **When** el comando termina
- **Then** DEBE añadirse un TODO con prioridad `high` en el fichero consolidado de todos

#### Scenario: search --scope global

- **Given** el vault tiene notas en múltiples proyectos
- **When** el usuario ejecuta `logbook-mcp search "refactor" --scope global`
- **Then** DEBEN devolverse resultados de todos los proyectos

#### Scenario: Comando v2.1 no disponible

- **Given** el usuario ejecuta `logbook-mcp todo list` en v2.0
- **When** el dispatcher procesa el comando
- **Then** DEBE responder con un mensaje claro indicando que el comando estará disponible en v2.1 (`cli-complete`)

### REQ-CM-3: Compartición de lógica CLI/MCP

Cada subcomando CLI DEBE delegar en la misma función de dominio que usa el tool MCP correspondiente. No DEBE duplicarse lógica de storage, validación de input ni resolución de config.

La diferencia entre CLI y MCP DEBE limitarse a la capa de presentación (parsing de args vs. parsing de JSON MCP, formateo de salida humana vs. `{ content: [...] }`).

#### Scenario: Cambio en la lógica impacta ambos

- **Given** una modificación en la función de dominio `createNote()`
- **When** se ejecuta la suite de tests
- **Then** los tests del tool MCP `logbook_note` y del subcomando CLI `note` DEBEN ejercitar la misma función

### REQ-CM-4: Salida humana preparada para v2.1

La salida por defecto del CLI en v2.0 DEBE ser legible por humano (texto plano con indicadores visuales mínimos).

El CLI v2.0 NO necesita soportar `--json` ni `--quiet`, pero la arquitectura DEBERÍA dejar ganchos para añadirlos en `cli-complete` sin reescribir los comandos (ej. pasar un `formatter` por parámetro, no hardcodear `console.log`).

#### Scenario: Salida humana por defecto

- **Given** el usuario ejecuta `logbook-mcp note "test"`
- **When** el comando termina con éxito
- **Then** la salida DEBE incluir una confirmación legible (ej. `Nota creada en <path>`)
- **And** NO DEBE emitir JSON

### REQ-CM-5: Arquitectura `src/cli/`

El código del CLI DEBE vivir en `src/cli/` con la estructura:

- `src/cli/dispatcher.ts` — entry-point de decisión.
- `src/cli/commands/setup.ts` — subcomandos `init`, `status`, `reorganize`.
- `src/cli/commands/note.ts`.
- `src/cli/commands/todo.ts`.
- `src/cli/commands/search.ts`.

`src/cli.ts` en v2.0 DEBE reducirse a una fachada que re-exporta o llama al dispatcher.

#### Scenario: Estructura de ficheros

- **Given** el árbol tras el cambio
- **When** se lista `src/cli/`
- **Then** DEBEN existir `dispatcher.ts` y `commands/{setup,note,todo,search}.ts`
