import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getStorage } from '../storage/index.js'

export function registerRemindersTool(server: McpServer): void {
  server.tool(
    'logbook_reminders',
    'Muestra recordatorios pendientes. scope: project (actual), workspace (todos los proyectos del workspace), global (todo).',
    {
      scope: z
        .enum(['project', 'workspace', 'global'])
        .optional()
        .default('project')
        .describe('Scope: project (actual), workspace (todos los proyectos del workspace), global (todo)'),
    },
    async ({ scope }) => {
      try {
        const storage = getStorage()
        storage.autoRegisterRepo()
        const result = storage.getDueReminders(scope)

        if (!result) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ scope, reminders: null, message: 'Sin recordatorios pendientes' }) }],
          }
        }

        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ scope, ...result }) }],
        }
      } catch (err: unknown) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: `Error obteniendo recordatorios: ${err instanceof Error ? err.message : String(err)}` }],
        }
      }
    },
  )
}
