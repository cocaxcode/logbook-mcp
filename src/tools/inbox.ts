import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getStorage } from '../storage/index.js'

export function registerInboxTool(server: McpServer): void {
  server.tool(
    'logbook_inbox',
    'Bandeja de entrada para notas rápidas. list: ver pendientes, process: mover a proyecto con frontmatter.',
    {
      action: z.enum(['list', 'process']).describe('Accion: list (ver pendientes) o process (mover a proyecto)'),
      id: z.string().optional().describe('ID del item a procesar (requerido para process)'),
      project: z.string().optional().describe('Proyecto destino (requerido para process)'),
      topic: z.string().optional().describe('Topic a asignar'),
      type: z
        .enum(['note', 'decision', 'debug', 'standup'])
        .optional()
        .describe('Tipo de entrada (default: note)'),
    },
    async ({ action, id, project, topic, type }) => {
      try {
        const storage = getStorage()
        storage.autoRegisterRepo()

        if (action === 'list') {
          const items = storage.getInboxItems()
          return { content: [{ type: 'text' as const, text: JSON.stringify(items) }] }
        }

        // action === 'process'
        if (!id) {
          return { isError: true, content: [{ type: 'text' as const, text: 'Error: "id" es requerido para action=process' }] }
        }
        if (!project) {
          return { isError: true, content: [{ type: 'text' as const, text: 'Error: "project" es requerido para action=process' }] }
        }

        const result = storage.processInboxItem(id, project, topic, type)
        return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] }
      } catch (err: unknown) {
        return { isError: true, content: [{ type: 'text' as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }] }
      }
    },
  )
}
