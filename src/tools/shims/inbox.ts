import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getStorage } from '../../storage/index.js'

export function registerInboxShim(server: McpServer): void {
  server.tool(
    'logbook_inbox',
    '[DEPRECATED: se eliminará en v2.2. Usa logbook_setup action:inbox en su lugar.] Bandeja de entrada para notas rápidas.',
    {
      action: z.enum(['list', 'process']).describe('Accion'),
      id: z.string().optional().describe('ID (process)'),
      project: z.string().optional().describe('Proyecto (process)'),
      topic: z.string().optional(),
      type: z.enum(['note', 'decision', 'debug', 'standup']).optional(),
    },
    async ({ action, id, project, topic, type }) => {
      try {
        const storage = getStorage()
        storage.autoRegisterRepo()
        if (action === 'list') {
          const items = storage.getInboxItems()
          return { content: [{ type: 'text' as const, text: JSON.stringify({ items, _deprecated: true, _replacement: 'logbook_setup.inbox' }) }] }
        }
        if (!id) return { isError: true, content: [{ type: 'text' as const, text: '"id" requerido' }] }
        if (!project) return { isError: true, content: [{ type: 'text' as const, text: '"project" requerido' }] }
        const result = storage.processInboxItem(id, project, topic, type)
        return { content: [{ type: 'text' as const, text: JSON.stringify({ ...result, _deprecated: true, _replacement: 'logbook_setup.inbox' }) }] }
      } catch (err: unknown) {
        return { isError: true, content: [{ type: 'text' as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }] }
      }
    },
  )
}
