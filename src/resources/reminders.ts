import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { getDb } from '../db/connection.js'
import { getDueReminders } from '../db/queries.js'

export function registerRemindersResource(server: McpServer): void {
  server.resource(
    'reminders',
    'logbook://reminders',
    {
      description: 'Recordatorios pendientes para hoy y atrasados, agrupados por proyecto. Vacio si no hay ninguno.',
      mimeType: 'application/json',
    },
    async (uri) => {
      try {
        const db = getDb()
        const result = getDueReminders(db)

        // No reminders → empty content (no tokens wasted)
        if (!result) {
          return { contents: [] }
        }

        return {
          contents: [{
            uri: uri.href,
            text: JSON.stringify(result),
          }],
        }
      } catch {
        return { contents: [] }
      }
    },
  )
}
