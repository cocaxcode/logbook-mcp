import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

// Tools (10)
import { registerNoteTool } from './tools/note.js'
import { registerTodoTool } from './tools/todo.js'
import { registerEntryTool } from './tools/entry.js'
import { registerQueryTool } from './tools/query.js'
import { registerTopicsTool } from './tools/topics.js'
import { registerTagsTool } from './tools/tags.js'
import { registerRemindersTool } from './tools/reminders.js'
import { registerReviewTool } from './tools/review.js'
import { registerInboxTool } from './tools/inbox.js'
import { registerSetupTool } from './tools/setup.js'

// Resources
import { registerRemindersResource } from './resources/reminders.js'

declare const __PKG_VERSION__: string
const VERSION = typeof __PKG_VERSION__ !== 'undefined' ? __PKG_VERSION__ : '0.0.0'

const INSTRUCTIONS = `logbook-mcp es un cuaderno de bitácora para desarrolladores. Registra notas, TODOs, decisiones y sesiones de debug.

FLUJO TÍPICO:
1. Usa logbook_note para registrar hallazgos, ideas o progreso.
2. Gestiona TODOs con logbook_todo (action: add/list/done/edit/rm).
3. Registra decisiones arquitectónicas con logbook_entry (action: decision).
4. Documenta bugs resueltos con logbook_entry (action: debug).
5. Haz standups con logbook_entry (action: standup).

COMPORTAMIENTO:
- logbook_todo action:list incluye TODOs manuales y del código (TODO/FIXME/HACK/BUG via git grep).
- logbook_query action:search usa FTS5 para búsqueda full-text rápida.
- logbook_query action:timeline muestra actividad cross-project y cross-workspace.
- Soporta modo SQLite (default) y Obsidian (archivos .md con frontmatter).
- Topics predefinidos: feature, fix, chore, idea, decision, blocker, reminder.
- logbook_todo action:done con recordatorios recurrentes marca como hecho por hoy y vuelve automáticamente.

TOPICS CUSTOM:
- Los topics custom pueden tener carpeta propia (folder) y tipo (kind: note, todo, table).
- IMPORTANTE: Cuando el usuario pide crear una nota/TODO y el contenido encaja con un topic custom existente, SIEMPRE pasa el topic correspondiente para que se guarde en su carpeta. Usa logbook_topics action:list para ver los topics disponibles si no estás seguro.
- kind=note: archivo individual en la carpeta del topic.
- kind=todo: checkbox en archivo consolidado.
- kind=table: tablas markdown dentro de la carpeta del topic. Formato del content:
  - "nombre-tabla | valor1 | valor2 | valor3" → crea/añade fila en {folder}/nombre-tabla.md
  - "headers:Versión|Entorno|Estado\nv1.2|prod|ok" → primera vez define headers, luego datos
  - Sin | → tabla simple con columnas Fecha + Entrada
  - Múltiples tablas en la misma carpeta: usa nombres diferentes antes del primer |`

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'logbook-mcp',
    version: VERSION,
  }, {
    instructions: INSTRUCTIONS,
  })

  // ── Notes & Knowledge ──
  registerNoteTool(server)
  registerTopicsTool(server)
  registerTagsTool(server)

  // ── TODO Management ──
  registerTodoTool(server)

  // ── Structured Entries (standup, decision, debug, list, edit, delete) ──
  registerEntryTool(server)

  // ── Search & Discovery ──
  registerQueryTool(server)

  // ── Reminders ──
  registerRemindersTool(server)

  // ── Reviews & Inbox ──
  registerReviewTool(server)
  registerInboxTool(server)

  // ── Admin ──
  registerSetupTool(server)

  // ── Resources ──
  registerRemindersResource(server)

  return server
}
