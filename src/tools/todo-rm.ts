import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getStorage } from '../storage/index.js'

export function registerTodoRmTool(server: McpServer): void {
  server.tool(
    'logbook_todo_rm',
    'Elimina TODOs por ID. Acepta uno o varios IDs.',
    {
      ids: z
        .union([z.number(), z.string(), z.array(z.union([z.number(), z.string()]))])
        .describe('ID o array de IDs de TODOs a eliminar'),
    },
    async ({ ids }) => {
      try {
        const storage = getStorage()
        storage.autoRegisterRepo()

        const idArray = (Array.isArray(ids) ? ids : [ids]).map(String)
        const deleted = storage.deleteTodos(idArray)

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              deleted: deleted.length,
              ids: deleted,
            }),
          }],
        }
      } catch (err: unknown) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: `Error eliminando TODOs: ${err instanceof Error ? err.message : String(err)}` }],
        }
      }
    },
  )
}
