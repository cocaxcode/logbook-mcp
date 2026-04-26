# Delta: wizard-init (ADDED)

**Action**: ADDED
**Capability**: `wizard-init`
**Change**: `drop-sqlite-split-monolith`

Define el wizard interactivo `logbook-mcp setup init` que guía al usuario en la configuración inicial de v2: detección de vault, estructura, alias, workspace, Daily Notes, y generación del snippet MCP para el cliente detectado.

## Requirements

### REQ-WI-1: Detección en cascada de vaults Obsidian

El wizard DEBE intentar detectar vaults Obsidian en este orden:

1. Leer `obsidian.json` (en ubicaciones conocidas por plataforma: `%APPDATA%/obsidian/obsidian.json` en Windows, `~/Library/Application Support/obsidian/obsidian.json` en macOS, `~/.config/obsidian/obsidian.json` en Linux).
2. Si no se encuentra, escanear carpetas comunes (`~/Documents`, `~/Obsidian`, `~/vaults`, `~/Dropbox`).
3. Si no hay candidatos, preguntar al usuario el path manualmente.

El wizard DEBE mostrar la lista de vaults candidatos y permitir al usuario elegir o introducir uno manual.

#### Scenario: obsidian.json encontrado

- **Given** existe `%APPDATA%/obsidian/obsidian.json` con dos vaults registrados
- **When** el usuario ejecuta `logbook-mcp setup init`
- **Then** el wizard DEBE listar esos dos vaults como candidatos
- **And** DEBE permitir seleccionar uno con teclas o introducir otro path manual

#### Scenario: obsidian.json ausente, scan encuentra candidato

- **Given** no existe `obsidian.json` pero `~/Documents/MyVault/.obsidian/` existe
- **When** el wizard ejecuta la cascada
- **Then** DEBE ofrecer `~/Documents/MyVault` como candidato

#### Scenario: Ningún vault detectado

- **Given** no hay `obsidian.json` ni carpetas `.obsidian/` en ubicaciones comunes
- **When** el wizard ejecuta la cascada
- **Then** DEBE preguntar al usuario el path del vault manualmente
- **And** DEBE validar que el path existe antes de continuar

### REQ-WI-2: Detección de plugins Obsidian relevantes

El wizard DEBE intentar leer los plugins habilitados del vault seleccionado (`<vault>/.obsidian/community-plugins.json` o equivalente) y detectar al menos: Periodic Notes, Templates, Tasks.

Si se detectan plugins, el wizard DEBE ajustar defaults (ej. si Periodic Notes está activo, preguntar por la ruta de Daily Notes configurada allí).

#### Scenario: Periodic Notes detectado

- **Given** el vault tiene Periodic Notes habilitado con Daily Notes en `Journal/Daily`
- **When** el wizard procesa el vault
- **Then** DEBE ofrecer `Journal/Daily` como default para `dailyNote.folder`

#### Scenario: Sin plugins relevantes

- **Given** el vault no tiene plugins relevantes habilitados
- **When** el wizard procesa el vault
- **Then** DEBE usar defaults internos sin fallar

### REQ-WI-3: Preguntas del wizard

El wizard interactivo DEBE preguntar, con defaults sensatos:

1. Vault path (con detección previa).
2. Carpeta raíz dentro del vault (default `logbook`).
3. Estructura de carpetas: `Hierarchical` (workspace/project/folder), `Flat` (todo en una carpeta), `Custom` (pedir `pathTemplate`).
4. Alias del proyecto actual (detectado del repo git si es posible).
5. Workspace (detectado por estrategia elegida).
6. Daily Notes: activar y carpeta.

Cada pregunta DEBE mostrar el default entre corchetes y permitir aceptar con Enter.

#### Scenario: Aceptar todos los defaults

- **Given** el usuario pulsa Enter en todas las preguntas
- **When** el wizard termina
- **Then** DEBE generar una config válida usando los defaults
- **And** NO DEBE fallar por falta de input

#### Scenario: Estructura Custom

- **Given** el usuario elige estructura `Custom`
- **When** el wizard pregunta `pathTemplate`
- **Then** DEBE aceptar una plantilla con variables `{workspace}`, `{project}`, `{folder}`, `{YYYY}`, `{MM}`
- **And** DEBE validar que la plantilla al menos contiene `{folder}`

### REQ-WI-4: Outputs del wizard

Al finalizar, el wizard DEBE generar:

1. `~/.logbook/config.json` — actualizado con el vault registrado y `defaultVault` si es el primero.
2. `<vault>/<root>/.logbook/vault.json` — config específica del vault.
3. Un snippet MCP para el cliente detectado, mostrado en pantalla con instrucciones de copia.

El wizard DEBE detectar y generar snippets para al menos: Claude Code, Claude Desktop, Cursor, Windsurf, VS Code, Codex, Gemini. Si no se detecta cliente, DEBE mostrar un snippet genérico con la nota de que puede adaptarse.

#### Scenario: Primer vault registrado

- **Given** `~/.logbook/config.json` no existe o no tiene vaults
- **When** el wizard termina con éxito
- **Then** `~/.logbook/config.json` DEBE existir con el nuevo vault registrado
- **And** `defaultVault` DEBE apuntar a él

#### Scenario: Snippet para Claude Code detectado

- **Given** el sistema tiene Claude Code instalado (detectable por presencia de `~/.claude/` o similar)
- **When** el wizard finaliza
- **Then** DEBE mostrar un snippet JSON válido para `mcpServers` compatible con Claude Code
- **And** DEBE incluir instrucciones de dónde pegarlo

#### Scenario: Cliente no detectado

- **Given** ningún cliente MCP conocido está presente
- **When** el wizard finaliza
- **Then** DEBE mostrar un snippet genérico
- **And** DEBE explicar que puede adaptarse a cualquier cliente compatible con MCP

### REQ-WI-5: Modo no interactivo

El wizard DEBE aceptar un flag `--non-interactive` que usa defaults sin prompts, útil para CI o instalaciones automatizadas.

En modo no interactivo, si falta información crítica (ej. vault path) el wizard DEBE fallar con un error descriptivo en lugar de quedarse esperando input.

#### Scenario: CI con vault path por flag

- **Given** el usuario invoca `setup init --non-interactive --vault /path/to/vault`
- **When** el wizard se ejecuta
- **Then** DEBE completar sin prompts usando defaults
- **And** DEBE escribir los ficheros de config esperados

#### Scenario: No interactivo sin vault

- **Given** `setup init --non-interactive` sin `--vault` y sin detección posible
- **When** el wizard se ejecuta
- **Then** DEBE fallar con un mensaje claro indicando que se requiere `--vault`

### REQ-WI-6: [DECIDIR:] Idempotencia y sobreescritura

[DECIDIR:] El prompt no especifica qué hace el wizard cuando `~/.logbook/config.json` ya existe con vaults registrados ni cuando `vault.json` ya existe. Propuesta a resolver en design: preguntar antes de sobreescribir en modo interactivo; en `--non-interactive`, requerir flag `--force` para sobreescribir.
