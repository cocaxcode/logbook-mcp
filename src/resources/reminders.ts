import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { getStorage } from '../storage/index.js'

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
        const storage = getStorage()
        storage.autoRegisterRepo()
        const result = storage.getDueReminders()

        // No reminders → empty content (no tokens wasted)
        if (!result) {
          return { contents: [] }
        }

        // Auto-ack recurring reminders on first read (won't show again today)
        for (const group of result.recurring) {
          for (const reminder of group.reminders) {
            storage.ackRecurringReminder(reminder.id)
          }
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
