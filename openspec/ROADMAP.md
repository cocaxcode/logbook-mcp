# Logbook v2 — Roadmap

> Fuente de verdad del estado de v2. Se actualiza al cambiar el estado de cualquier change.

## Versión actual

- **v1 (latest):** @cocaxcode/logbook-mcp@1.4.12 (producción, sigue soportado)
- **v2 (next):** en desarrollo — Change 1 (drop-sqlite-split-monolith)

## Estrategia de publicación npm

| Tag | Versión | Estado |
|-----|---------|--------|
| `@latest` | 1.x.x | Producción actual |
| `@next` | 2.0.0-alpha.N / beta / rc | Canal de pruebas v2 |
| `@legacy` | 1.x.x congelado | Cuando 2.0.0 sea stable, v1 pasa aquí |

Al publicar 2.0.0 stable: `npm deprecate @cocaxcode/logbook-mcp@"<2.0.0" "v1 is in legacy mode. See MIGRATION.md"`.

## Changes

| # | ID | Estado | Target release | Bloqueadores |
|---|---|---|---|---|
| 1 | drop-sqlite-split-monolith | IN_PROGRESS | 2.0.0 | — |
| 2 | v2-dx (CLI completo + papelera + git hook) | DEFERRED | 2.1.0 | Señal de demanda tras v2.0.0 |
| 3 | v2-pkm (daily notes + templates eng + exporters) | DEFERRED | 2.2.0 | Señal de demanda tras v2.1.0 |

Estados: `DRAFT` → `QUEUED` → `IN_PROGRESS` → `BLOCKED` → `VERIFIED` → `ARCHIVED` → `DEFERRED`.

## Parking lot — ideas no priorizadas

Estas features se mencionaron en el análisis pero **no entran** hasta que aparezca señal concreta de demanda (uso propio, feedback externo, issue). No se pierden; se revisan al cerrar cada change.

- [IDEA] Integración con Daily Notes (Periodic Notes plugin)
- [IDEA] Backlinks semánticos automáticos (cerrar TODO linkeado a decisión → nota en decisión)
- [IDEA] Plantillas de ingeniería múltiples (ADR, post-mortem, retro, 1:1, RFC, spike)
- [IDEA] Auto-linking de entidades `@persona` → `[[people/persona]]`
- [IDEA] Contexto git auto-inyectado en captura (branch, commit, file)
- [IDEA] Exporters: `--standup` Slack, `--changelog` desde decisions, `--adr-index`
- [IDEA] Git hook commit↔TODO (close #42 en message → marca done)
- [IDEA] Papelera/undo (.logbook/trash/ con retención 30 días)
- [IDEA] Path templating avanzado (`{YYYY-MM}/{project}`)
- [IDEA] Attachments: paste image del portapapeles + OCR
- [IDEA] Encryption opcional entries sensibles (AES-256 + keyring OS)
- [IDEA] Tracking de tiempo por entrada (`logbook time start/stop`)
- [IDEA] Agregador de standups de equipo via vault compartido
- [IDEA] CLI `--json` / `--quiet` (si llega antes de v2.1 CLI completo, se adelanta)
- [IDEA] `logbook daemon` con notificaciones OS nativas
- [IDEA] Renderizar TODOs con URI scheme `obsidian://open?vault=X&file=Y` para clientes MCP que no sean Obsidian (Claude Desktop, Cursor)

## Política de deprecación

Ningún tool, parámetro o campo se elimina sin haber estado deprecated 1 minor version completa.

Ciclo:
- **vN.0** — se introduce reemplazo, lo viejo queda como shim con `[DEPRECATED: ...]` en descripción.
- **vN+1.0** — shim añade `console.warn` al invocarse.
- **vN+2.0** — shim eliminado.

## Riesgos abiertos

- **Silent breakage MCP** — Cache de tools en clientes. Mitigado por shims en v2.0.
- **Orama con vaults >5000 notas** — Benchmark requerido antes de 2.0.0 stable. Fallback grep si falla.
- **Migración SQLite → Obsidian con datos** — `--dry-run` obligatorio, DB nunca borrada. Renombrada a `.migrated-YYYYMMDD`.
- **Usuario abandonado en v1** — Mitigado por `@legacy` dist-tag + `npm deprecate` con mensaje a MIGRATION.

## Criterios de cierre de Change

Antes de archivar un change:

- [ ] Todas las tareas de `tasks.md` done.
- [ ] Todos los scenarios de specs verificados.
- [ ] Test suite verde.
- [ ] Build produce artefactos esperados.
- [ ] CHANGELOG.md actualizado.
- [ ] MIGRATION.md actualizado si breaking.
- [ ] Publicado a npm con dist-tag correcto.
- [ ] Carpeta del change movida a `openspec/changes/archive/YYYY-MM-DD-<id>/`.

## Log de decisiones clave

- **2026-04-19** — Scope ruthless v2.0: 3 changes, 10 no-negociables, parking lot explícito. [Decisión guardada en logbook id `2026-04-19-scope-ruthless-v2-0-3-changes-10-no-negociables-pa`]
