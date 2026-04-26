import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getStorage } from '../../storage/index.js'

export function registerRemindersShim(server: McpServer): void {
  server.tool(
    'logbook_reminders',
    '[DEPRECATED: se eliminará en v2.2. Usa logbook_query action:reminders en su lugar.] Muestra recordatorios pendientes.',
    {
      scope: z.enum(['project', 'workspace', 'global']).optional().default('project').describe('Scope'),
    },
    async ({ scope }) => {
      try {
        const storage = getStorage()
        storage.autoRegisterRepo()
        const result = storage.getDueReminders(scope)
        const payload = result
          ? { scope, ...result }
          : { scope, reminders: null, message: 'Sin recordatorios pendientes' }
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ ...payload, _deprecated: true, _replacement: 'logbook_query.reminders' }),
          }],
        }
      } catch (err: unknown) {
        return { isError: true, content: [{ type: 'text' as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }] }
      }
    },
  )
}
