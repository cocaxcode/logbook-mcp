import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getDb } from '../db/connection.js'
import { deleteTodos } from '../db/queries.js'

export function registerTodoRmTool(server: McpServer): void {
  server.tool(
    'logbook_todo_rm',
    'Elimina TODOs por ID. Acepta uno o varios IDs.',
    {
      ids: z
        .union([z.number(), z.array(z.number())])
        .describe('ID o array de IDs de TODOs a eliminar'),
    },
    async ({ ids }) => {
      try {
        const db = getDb()
        const idArray = Array.isArray(ids) ? ids : [ids]
        const deleted = deleteTodos(db, idArray)

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
          content: [{ type: 'text' as const, text: `Error eliminando TODOs: ${(err as Error).message}` }],
        }
      }
    },
  )
}
