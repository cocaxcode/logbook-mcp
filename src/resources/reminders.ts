import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { getDb } from '../db/connection.js'
import { getDueReminders } from '../db/queries.js'

export function registerRemindersResource(server: McpServer): void {
  server.resource(
    'reminders',
    'logbook://reminders',
    {
      description: 'Recordatorios pendientes para hoy y atrasados, agrupados por proyecto',
      mimeType: 'application/json',
    },
    async (uri) => {
      try {
        const db = getDb()
        const { today, overdue } = getDueReminders(db)

        const hasReminders = today.length > 0 || overdue.length > 0

        return {
          contents: [{
            uri: uri.href,
            text: JSON.stringify({
              hasReminders,
              today,
              overdue,
            }),
          }],
        }
      } catch {
        return {
          contents: [{
            uri: uri.href,
            text: JSON.stringify({ hasReminders: false, today: [], overdue: [] }),
          }],
        }
      }
    },
  )
}
