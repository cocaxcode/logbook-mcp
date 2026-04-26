# Spec delta: `orama-search`

**Change id**: `drop-sqlite-split-monolith`
**Capability**: `search` (MODIFIED — reemplaza la búsqueda temporal definida en `storage-obsidian.md`)

## Contexto

Eliminar SQLite implica perder FTS5. La búsqueda temporal (`String.includes()` sobre file walk
O(N)) funcionaría para vaults <100 notas, pero degrada UX en cualquier caso real y sería
más lenta que v1.

Para evitar publicar v2.0.0 con regresión de rendimiento, se introduce Orama (`@orama/orama`):
motor de búsqueda full-text puro JS, sin dependencias nativas, con BM25 y fuzzy matching.

Esta spec reemplaza la implementación temporal marcada `// TEMPORARY` en `storage-obsidian.md`
(Decision 6 del `design.md` queda obsoleta por Decision 11).

## Requirements

### REQ-OS-1 — Índice Orama DEBE construirse a demanda

El índice Orama DEBE construirse la primera vez que se invoca `search`, `log` o cualquier
consulta que requiera indexación, leyendo todos los archivos `.md` bajo `<vault>/<root>` y
parseando su frontmatter.

Cada documento indexado DEBE contener los campos:
`{ id, type, title, body, topic, tags, project, workspace, date, priority, status }`.

#### Scenario: Primera búsqueda construye índice

- Given un vault con 100 notas y sin cache previo
- When el cliente invoca `logbook_query action:search query:"foo"` por primera vez
- Then el servidor DEBE construir el índice Orama
- And DEBE devolver resultados.

#### Scenario: Arranque sin search no construye índice

- Given un servidor recién arrancado
- When el cliente solo invoca `logbook_note add`
- Then el índice Orama NO DEBE construirse (lazy build).

### REQ-OS-2 — Cache `.logbook/index-cache.json` con arranque incremental

El índice DEBE persistirse en `<vault>/<root>/.logbook/index-cache.json` usando la API de
persistencia de Orama. En arranques sucesivos, el servidor DEBE:

1. Cargar la cache si existe y está sana.
2. Comparar mtime de cada `.md` del vault con la mtime registrada en la cache.
3. Re-indexar solo archivos con mtime posterior o archivos nuevos; eliminar del índice
   archivos ausentes.

#### Scenario: Cache limpia se reutiliza

- Given una cache válida del día anterior y cero cambios en el vault
- When el servidor arranca y el primer `search` se invoca
- Then el tiempo de construcción DEBE ser significativamente menor que un build completo
  (la cache se carga, no se reindexa).

#### Scenario: Archivo modificado se re-indexa

- Given una cache y un archivo `nota-X.md` con mtime posterior
- When el servidor construye el índice desde cache
- Then solo `nota-X.md` DEBE re-indexarse; el resto DEBE provenir de la cache.

### REQ-OS-3 — Watcher `chokidar` DEBE actualizar el índice ante cambios externos

El servidor DEBE registrar un watcher `chokidar` sobre `<vault>/<root>/**/*.md` con debounce
de 500ms. Eventos `add`, `change`, `unlink` DEBEN reflejarse en el índice Orama en memoria
y eventualmente en la cache persistida.

#### Scenario: Usuario edita en Obsidian y el índice se actualiza

- Given el servidor corriendo con índice construido
- When el usuario edita manualmente `notes/foo.md` desde Obsidian
- Then dentro de 1 segundo el índice DEBE reflejar el nuevo contenido
- And una búsqueda posterior DEBE encontrar los términos nuevos.

#### Scenario: Archivo borrado desaparece del índice

- Given el servidor corriendo con `notes/bar.md` indexado
- When el archivo se elimina externamente
- Then el índice NO DEBE seguir devolviendo `bar.md` en resultados.

### REQ-OS-4 — Escrituras internas DEBEN actualizar el índice síncronamente

Las operaciones de escritura invocadas por el propio servidor (`insertNote`, `insertTodo`,
`insertEntry`, `editNote`, `deleteNote`, etc.) DEBEN actualizar el índice Orama en memoria
síncronamente antes de devolver, sin esperar al debounce del watcher.

#### Scenario: Nota recién creada aparece en search inmediato

- Given un índice construido
- When el cliente invoca `logbook_note add content:"nota con palabra-única-xyz"`
- And el cliente invoca inmediatamente después `logbook_query action:search query:"palabra-única-xyz"`
- Then la respuesta DEBE incluir la nota recién creada.

### REQ-OS-5 — Search DEBE aceptar filtros por facetas

`search` DEBE aceptar los filtros opcionales
`{ type, topic, project, workspace, date_from, date_to, priority, status }` y combinarlos
con el query full-text vía BM25. Fuzzy matching DEBE estar habilitado por defecto con
tolerancia `1`.

#### Scenario: Filtro por project y fuzzy match

- Given un vault con notas en proyectos `api` y `web`
- When el cliente invoca `search query:"autenticaton" project:"api" fuzzy:true`
- Then la respuesta DEBE contener solo notas del proyecto `api`
- And DEBE encontrar "authentication" pese al typo.

#### Scenario: Filtro por rango de fechas

- Given notas del 2026-01 al 2026-04
- When el cliente invoca `search query:"*" date_from:"2026-03-01" date_to:"2026-03-31"`
- Then la respuesta DEBE contener solo notas de marzo 2026.

### REQ-OS-6 — Search DEBE devolver resultados ligeros (lazy loading)

Cada resultado de `search` DEBE contener
`{ id, type, title, snippet, rank, topic, project, date }`. El `body` completo NO DEBE
incluirse para evitar inflar la respuesta.

El `snippet` DEBE ser un fragmento de ~200 caracteres alrededor de la primera coincidencia.

#### Scenario: Respuesta sin body completo

- Given una nota de 5000 caracteres
- When el cliente busca un término que aparece en esa nota
- Then el resultado de esa nota DEBE incluir `snippet` de ~200 caracteres
- And NO DEBE incluir el campo `body` ni el contenido completo.

### REQ-OS-7 — Nueva action `get` DEBE devolver body completo por id

`logbook_query action:get id:<docId>` DEBE devolver el documento completo (frontmatter
parseado + body) permitiendo al cliente hacer fetch on-demand tras un `search`.

#### Scenario: Get tras search

- Given un resultado `search` con `id:"notes/foo"` y snippet
- When el cliente invoca `logbook_query action:get id:"notes/foo"`
- Then la respuesta DEBE incluir el body completo del archivo
- And DEBE incluir el frontmatter parseado.

#### Scenario: Id inexistente

- Given un id que no existe en el índice ni en el filesystem
- When el cliente invoca `logbook_query action:get id:"inexistente"`
- Then la respuesta DEBE devolver un error claro (`not_found`), sin romper el proceso.

### REQ-OS-8 — Fallback substring si Orama falla al cargar

Si `@orama/orama` falla al importarse o al construir el índice (p.ej. archivo corrupto,
error de memoria), el servidor DEBE activar un fallback substring (file walk +
`String.includes()`) y loguear un warning, sin terminar con error.

Este fallback SOLO se mantiene durante v2.0.0-alpha como safety net; v2.0.0 stable DEBE
tener Orama validado vía benchmark.

#### Scenario: Orama falla, fallback responde

- Given un entorno donde `@orama/orama` lanza al construir el índice
- When el cliente invoca `search query:"foo"`
- Then el servidor DEBE loguear un warning `[search] orama unavailable, using fallback`
- And DEBE devolver resultados usando substring matching
- And el proceso NO DEBE abortar.
