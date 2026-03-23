import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerTopicsTool } from './tools/topics.js'
import { registerNoteTool } from './tools/note.js'
import { registerTodoAddTool } from './tools/todo-add.js'
import { registerTodoListTool } from './tools/todo-list.js'
import { registerTodoDoneTool } from './tools/todo-done.js'
import { registerTodoEditTool } from './tools/todo-edit.js'
import { registerTodoRmTool } from './tools/todo-rm.js'
import { registerLogTool } from './tools/log.js'
import { registerSearchTool } from './tools/search.js'
import { registerStandupTool } from './tools/standup.js'
import { registerDecisionTool } from './tools/decision.js'
import { registerDebugTool } from './tools/debug.js'
import { registerTagsTool } from './tools/tags.js'
import { registerTimelineTool } from './tools/timeline.js'
import { registerMigrateTool } from './tools/migrate.js'
import { registerSetupTool } from './tools/setup.js'
import { registerInboxTool } from './tools/inbox.js'
import { registerReviewTool } from './tools/review.js'
import { registerEntryTool } from './tools/entry.js'
import { registerRemindersTool } from './tools/reminders.js'
import { registerRemindersResource } from './resources/reminders.js'

declare const __PKG_VERSION__: string
const VERSION = typeof __PKG_VERSION__ !== 'undefined' ? __PKG_VERSION__ : '0.0.0'

const INSTRUCTIONS = `logbook-mcp es un cuaderno de bitácora para desarrolladores. Registra notas, TODOs, decisiones y sesiones de debug.

FLUJO TÍPICO:
1. Usa logbook_note para registrar hallazgos, ideas o progreso.
2. Gestiona TODOs con logbook_todo_add/list/done/edit/rm.
3. Registra decisiones arquitectónicas con logbook_decision (ADR).
4. Documenta bugs resueltos con logbook_debug (error → causa → fix).
5. Haz standups con logbook_standup (yesterday/today/blockers).

COMPORTAMIENTO:
- logbook_todo_list incluye TODOs manuales y del código (TODO/FIXME/HACK/BUG via git grep).
- logbook_search usa FTS5 para búsqueda full-text rápida.
- logbook_timeline muestra actividad cross-project y cross-workspace.
- Soporta modo SQLite (default) y Obsidian (archivos .md con frontmatter).
- Topics predefinidos: feature, fix, chore, idea, decision, blocker, reminder.
- logbook_todo_done con recordatorios recurrentes marca como hecho por hoy y vuelve automáticamente.`

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'logbook-mcp',
    version: VERSION,
  }, {
    instructions: INSTRUCTIONS,
  })

  registerTopicsTool(server)
  registerNoteTool(server)
  registerTodoAddTool(server)
  registerTodoListTool(server)
  registerTodoDoneTool(server)
  registerTodoEditTool(server)
  registerTodoRmTool(server)
  registerLogTool(server)
  registerSearchTool(server)
  registerStandupTool(server)
  registerDecisionTool(server)
  registerDebugTool(server)
  registerTagsTool(server)
  registerTimelineTool(server)
  registerMigrateTool(server)
  registerSetupTool(server)
  registerInboxTool(server)
  registerReviewTool(server)
  registerEntryTool(server)
  registerRemindersTool(server)

  // Resources
  registerRemindersResource(server)

  return server
}
