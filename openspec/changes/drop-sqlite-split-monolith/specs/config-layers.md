# Delta: config-layers (ADDED)

**Action**: ADDED
**Capability**: `config-layers`
**Change**: `drop-sqlite-split-monolith`

Define el sistema de configuración en capas para v2. Sustituye al config plano (`~/.logbook/config.json` único) por una resolución con prioridad, merge por campo, y registro de múltiples vaults.

## Requirements

### REQ-CL-1: Orden de resolución por prioridad

La función `resolveConfig()` DEBE aplicar las capas de configuración en este orden de precedencia (de mayor a menor):

1. CLI args
2. Variables de entorno (`LOGBOOK_*`)
3. `.logbook.json` en la raíz del repo (per-project, versionable)
4. `<vault>/<root>/.logbook/vault.json` (viaja con el vault)
5. `~/.logbook/config.json` (global del usuario)
6. Defaults hardcoded

Cada capa DEBE ser opcional; su ausencia NO DEBE producir errores. La capa de mayor prioridad DEBE sobreescribir campo a campo (merge recursivo), no reemplazar el objeto completo.

#### Scenario: CLI args ganan sobre env vars

- **Given** `LOGBOOK_WORKSPACE=from-env` exportado en el entorno
- **And** el proceso se invoca con `--workspace from-cli`
- **When** `resolveConfig()` devuelve la config efectiva
- **Then** el campo `workspace` DEBE valer `from-cli`

#### Scenario: Repo config gana sobre vault config

- **Given** un repo con `.logbook.json` que define `alias: "api-v2"`
- **And** el vault registrado tiene `vault.json` con `alias: "default-alias"`
- **When** `resolveConfig()` se ejecuta desde dentro del repo
- **Then** `alias` DEBE valer `"api-v2"`

#### Scenario: Merge profundo, no reemplazo

- **Given** la capa global define `folders: { notes: "Notas", todos: "Tareas" }`
- **And** la capa de repo define `folders: { todos: "TODO" }`
- **When** `resolveConfig()` se ejecuta
- **Then** `folders.notes` DEBE valer `"Notas"` (de global)
- **And** `folders.todos` DEBE valer `"TODO"` (de repo, sobreescribe el campo, no borra el resto)

#### Scenario: Ausencia total de capas

- **Given** ningún fichero de config existe y no hay env vars ni CLI args
- **When** `resolveConfig()` se ejecuta
- **Then** DEBE devolver los defaults hardcoded sin errores

### REQ-CL-2: Campos configurables por capa

Las capas opcionales (repo, vault, global) DEBEN soportar al menos los siguientes campos, todos opcionales y con merge por campo:

- `alias` (string): renombra el display del proyecto.
- `folders` (object): nombres de carpeta por tipo (notes, todos, decisions, debug, standups, attachments).
- `pathTemplate` (string): plantilla con variables `{workspace}`, `{project}`, `{folder}`, `{YYYY}`, `{MM}`.
- `workspace` (string): override del workspace detectado.
- `workspaceStrategy` (`git-remote-org` | `parent-folder` | `manual` | `none`).
- `dailyNote` (object): config de Daily Notes.
- `templates.userFolder` (string).
- `excludeProjects` (string[]).

Campos no reconocidos DEBERÍAN ignorarse con un warning (no fallar).

#### Scenario: pathTemplate con variables

- **Given** la capa de repo define `pathTemplate: "{workspace}/{project}/{YYYY}/{folder}"`
- **When** se resuelve la ruta de una nota en `cocaxcode/api` en abril 2026 con carpeta `notes`
- **Then** la ruta resultante DEBE ser `cocaxcode/api/2026/notes`

#### Scenario: Campo no reconocido

- **Given** una capa de repo contiene un campo `futureFeature: true` no definido en el esquema
- **When** `resolveConfig()` se ejecuta
- **Then** NO DEBE fallar
- **And** DEBERÍA emitir un warning a stderr indicando que el campo se ignora

### REQ-CL-3: Registro de vaults en global config

El fichero `~/.logbook/config.json` DEBE soportar un registro de vaults con la forma:

```json
{
  "defaultVault": "personal",
  "vaults": {
    "personal": { "path": "C:/vaults/personal", "root": "logbook" },
    "work": { "path": "D:/vaults/work", "root": "logbook" }
  }
}
```

Cuando solo haya un vault registrado, el flag `--vault` DEBE ser opcional y el sistema DEBE seleccionar ese vault automáticamente.

Cuando haya múltiples vaults y no se especifique `--vault`, el sistema DEBE usar `defaultVault`. Si `defaultVault` no está definido, DEBE fallar con un error descriptivo que liste los vaults disponibles.

#### Scenario: Un solo vault, --vault opcional

- **Given** `~/.logbook/config.json` registra un único vault llamado `personal`
- **When** el usuario invoca un comando sin `--vault`
- **Then** el sistema DEBE operar contra el vault `personal`

#### Scenario: Múltiples vaults con default

- **Given** dos vaults registrados (`personal`, `work`) y `defaultVault: "work"`
- **When** el usuario invoca un comando sin `--vault`
- **Then** el sistema DEBE operar contra el vault `work`

#### Scenario: Múltiples vaults sin default

- **Given** dos vaults registrados y `defaultVault` no definido
- **When** el usuario invoca un comando sin `--vault`
- **Then** el sistema DEBE fallar con un error que liste los vaults disponibles y sugiera usar `--vault <name>` o `setup status`

### REQ-CL-4: Trazabilidad de capas en setup status

El comando `logbook-mcp setup status` DEBE mostrar, para cada campo de la config efectiva, qué capa aportó su valor (ej. `alias: "api-v2" (repo)`, `workspace: "cocaxcode" (env)`).

#### Scenario: Trazabilidad visible

- **Given** una config efectiva compuesta de global + repo
- **When** el usuario ejecuta `logbook-mcp setup status`
- **Then** la salida DEBE indicar explícitamente el origen de cada campo no-default
