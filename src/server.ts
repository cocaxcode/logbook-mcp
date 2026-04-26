import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

// 5 main tools
import { registerNoteTool } from './tools/note.js'
import { registerTodoTool } from './tools/todo.js'
import { registerEntryTool } from './tools/entry.js'
import { registerQueryTool } from './tools/query.js'
import { registerSetupTool } from './tools/setup.js'

// Deprecated shims (eliminados en v2.2)
import { registerTagsShim } from './tools/shims/tags.js'
import { registerRemindersShim } from './tools/shims/reminders.js'
import { registerReviewShim } from './tools/shims/review.js'
import { registerInboxShim } from './tools/shims/inbox.js'
import { registerTopicsShim } from './tools/shims/topics.js'

// Resources
import { registerRemindersResource } from './resources/reminders.js'

declare const __PKG_VERSION__: string
const VERSION = typeof __PKG_VERSION__ !== 'undefined' ? __PKG_VERSION__ : '0.0.0'

const INSTRUCTIONS = `logbook-mcp es un cuaderno de bitácora para desarrolladores. Registra notas, TODOs, decisiones y sesiones de debug.

FLUJO TÍPICO:
1. Usa logbook_note para registrar hallazgos, ideas o progreso.
2. Gestiona TODOs con logbook_todo (action: add/list/done/edit/rm).
3. Registra decisiones, debug y standups con logbook_entry (action: decision|debug|standup).
4. Busca y consulta con logbook_query (action: search|log|timeline|tags|reminders|review|get).
5. Configura el logbook con logbook_setup (action: init|status|inbox|topics).

COMPORTAMIENTO:
- logbook_todo action:list incluye TODOs manuales y del código (TODO/FIXME/HACK/BUG via git grep).
- logbook_query action:search usa búsqueda full-text sobre el vault Obsidian.
- logbook_query action:timeline muestra actividad cross-project y cross-workspace.
- v2 sólo soporta backend Obsidian (archivos .md con frontmatter). SQLite eliminado.
- Topics predefinidos: feature, fix, chore, idea, decision, blocker, reminder.

TOPICS CUSTOM:
- Los topics custom pueden tener carpeta propia (folder) y tipo (kind: note, todo, table).
- IMPORTANTE: Cuando el contenido encaja con un topic custom existente, SIEMPRE pasa el topic correspondiente. Usa logbook_setup action:topics topic_action:list para verlos.
- kind=note: archivo individual en la carpeta del topic.
- kind=todo: checkbox en archivo consolidado.
- kind=table: tablas markdown dentro de la carpeta del topic.

DEPRECATED (se eliminan en v2.2): logbook_tags, logbook_reminders, logbook_review, logbook_inbox, logbook_topics. Usa las acciones consolidadas en logbook_query y logbook_setup.`

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'logbook-mcp',
    version: VERSION,
  }, {
    instructions: INSTRUCTIONS,
  })

  // ── 5 main tools ──
  registerNoteTool(server)
  registerTodoTool(server)
  registerEntryTool(server)
  registerQueryTool(server)
  registerSetupTool(server)

  // ── Deprecated shims ──
  registerTagsShim(server)
  registerRemindersShim(server)
  registerReviewShim(server)
  registerInboxShim(server)
  registerTopicsShim(server)

  // ── Resources ──
  registerRemindersResource(server)

  return server
}
