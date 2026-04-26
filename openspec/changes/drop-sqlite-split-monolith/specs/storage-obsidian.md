# Delta: storage-obsidian (ADDED)

**Action**: ADDED
**Capability**: `storage-obsidian`
**Change**: `drop-sqlite-split-monolith`

Define el backend Obsidian como única implementación de `StorageBackend` en v2. Sustituye al monolito de v1 (`src/storage/obsidian/index.ts`, 2134 líneas) por una arquitectura modular por dominio. SQLite se elimina por completo del paquete; los datos v1 (si existían) quedan inaccesibles desde v2 por decisión explícita.

## Requirements

### REQ-SO-1: Backend Obsidian como única implementación

El sistema DEBE exponer `ObsidianStorage` como la única clase que implementa la interfaz `StorageBackend`. La factory `getStorage()` DEBE devolver siempre una instancia de `ObsidianStorage` (singleton).

El sistema NO DEBE incluir código, dependencias ni referencias al backend SQLite (`better-sqlite3`, `src/db/`, `src/storage/sqlite/`, `auto-migrate.ts`).

La interfaz `StorageBackend` pública DEBE preservarse respecto a v1 en cuanto a firmas de métodos existentes (añadir campos opcionales es aceptable; romper firmas no).

#### Scenario: Factory devuelve ObsidianStorage

- **Given** un entorno con config válida apuntando a un vault Obsidian
- **When** el código llama a `getStorage()`
- **Then** se DEBE devolver una instancia de `ObsidianStorage`
- **And** llamadas sucesivas DEBEN devolver la misma instancia (singleton)

#### Scenario: Ausencia de dependencia SQLite

- **Given** el árbol del repositorio tras aplicar este cambio
- **When** se inspecciona `package.json` y `dist/` tras `npm run build`
- **Then** `better-sqlite3` NO DEBE aparecer en `dependencies`, `devDependencies`, ni en artefactos de `dist/`
- **And** los directorios `src/db/` y `src/storage/sqlite/` NO DEBEN existir

#### Scenario: Interfaz StorageBackend preservada

- **Given** el consumidor interno (tools MCP) que invocaba métodos de `StorageBackend` en v1
- **When** se compila el proyecto con `npm run typecheck`
- **Then** NO DEBE haber errores de tipos en los llamadores existentes de `StorageBackend` por firmas eliminadas o renombradas

### REQ-SO-2: Estructura modular por dominio

El backend Obsidian DEBE organizarse en módulos por dominio dentro de `src/storage/obsidian/`:

- `notes.ts`, `todos.ts`, `entries.ts`, `search.ts`, `reminders.ts`, `topics.ts`, `inbox.ts`, `templates.ts`, `code-todos.ts`, `backlinks.ts`, `git-context.ts`, `daily-note.ts`.

Cada módulo DEBE exponer funciones puras (o factories) que reciben explícitamente el contexto necesario (vault path, config resuelta, helpers FS) y devuelven resultados tipados; NO DEBEN depender de estado global de la clase.

El orquestador `src/storage/obsidian/index.ts` (`ObsidianStorage`) DEBE quedar por debajo de 500 líneas y su responsabilidad DEBE limitarse a: componer los módulos, mantener el singleton, y delegar cada método de `StorageBackend` al módulo correspondiente.

#### Scenario: Existencia de los 12 módulos

- **Given** el árbol del proyecto tras el refactor
- **When** se listan los ficheros bajo `src/storage/obsidian/`
- **Then** DEBEN existir los 12 ficheros de dominio enumerados
- **And** cada uno DEBE exportar al menos una función pública consumida por el orquestador

#### Scenario: Orquestador delgado

- **Given** el fichero `src/storage/obsidian/index.ts` tras el refactor
- **When** se cuentan sus líneas no vacías
- **Then** DEBE tener menos de 500 líneas
- **And** NO DEBE contener lógica de parsing de frontmatter, generación de slugs, resolución de rutas ni generación de contenido markdown; esa lógica DEBE residir en los módulos de dominio

#### Scenario: Módulos testeables aisladamente

- **Given** un módulo de dominio (ej. `notes.ts`)
- **When** un test unitario invoca una función exportada pasando un vault temporal y config stub
- **Then** la función DEBE ejecutarse sin necesidad de instanciar `ObsidianStorage`

### REQ-SO-3: Eliminación de código muerto

El sistema NO DEBE incluir `generateDashboard()` (generación de `index.md` con Dataview hardcoded) ni `migrateTodosFolder()` (migración heredada de una reescritura previa).

#### Scenario: generateDashboard ausente

- **Given** el árbol del proyecto tras el cambio
- **When** se busca la función `generateDashboard` en el código
- **Then** NO DEBE existir ninguna definición ni llamada a ella
- **And** NO DEBE generarse automáticamente un `index.md` con bloques Dataview al inicializar un proyecto en Obsidian

#### Scenario: migrateTodosFolder ausente

- **Given** el árbol del proyecto tras el cambio
- **When** se busca la función `migrateTodosFolder`
- **Then** NO DEBE existir ninguna definición ni llamada

### REQ-SO-4: Búsqueda de reemplazo post-FTS5

El módulo `search.ts` DEBE implementar una búsqueda textual sobre los ficheros `.md` del vault suficiente para mantener la funcionalidad de `logbook_query action:search` tras eliminar FTS5.

La búsqueda DEBERÍA soportar: filtrado por workspace/proyecto, scope (`project` por defecto, `global` opcional), límite de resultados.

La búsqueda PUEDE ser significativamente más lenta que FTS5 en vaults grandes; esta limitación DEBE estar documentada en el CHANGELOG y se resolverá en el change hermano `orama-search`.

#### Scenario: Búsqueda devuelve resultados tras eliminar SQLite

- **Given** un vault con varias notas que contienen la palabra "refactor"
- **When** se invoca `search({ query: 'refactor' })`
- **Then** DEBE devolver todas las notas que contienen la palabra
- **And** cada resultado DEBE incluir path y un snippet de contexto

#### Scenario: Scope global

- **Given** un vault con notas en múltiples proyectos
- **When** se invoca `search({ query: 'foo', scope: 'global' })`
- **Then** DEBEN devolverse resultados de todos los proyectos del vault, no solo del actual
