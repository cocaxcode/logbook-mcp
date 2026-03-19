import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getDb } from '../db/connection.js'
import { updateTodoStatus } from '../db/queries.js'

export function registerTodoDoneTool(server: McpServer): void {
  server.tool(
    'logbook_todo_done',
    'Marca TODOs como hechos o los devuelve a pendiente (undo). Acepta uno o varios IDs.',
    {
      ids: z
        .union([z.number(), z.array(z.number())])
        .describe('ID o array de IDs de TODOs a marcar'),
      undo: z
        .boolean()
        .optional()
        .default(false)
        .describe('Si true, devuelve a pendiente en vez de marcar como hecho'),
    },
    async ({ ids, undo }) => {
      try {
        const db = getDb()
        const idArray = Array.isArray(ids) ? ids : [ids]
        const status = undo ? 'pending' : 'done'
        const updated = updateTodoStatus(db, idArray, status)

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              action: undo ? 'undo' : 'done',
              updated: updated.length,
              todos: updated,
            }),
          }],
        }
      } catch (err: unknown) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
        }
      }
    },
  )
}
