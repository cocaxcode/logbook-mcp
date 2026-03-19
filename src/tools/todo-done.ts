import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getDb } from '../db/connection.js'
import { ackRecurringReminder, updateTodoStatus } from '../db/queries.js'
import type { TodoWithMeta } from '../types.js'

export function registerTodoDoneTool(server: McpServer): void {
  server.tool(
    'logbook_todo_done',
    'Marca TODOs como hechos o los devuelve a pendiente (undo). Los recordatorios recurrentes se marcan como hechos por hoy y vuelven automaticamente el proximo dia que toque.',
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

        // Separate recurring from regular
        const regularIds: number[] = []
        const recurringIds: number[] = []

        for (const id of idArray) {
          const todo = db
            .prepare('SELECT remind_pattern FROM todos WHERE id = ?')
            .get(id) as { remind_pattern: string | null } | undefined

          if (todo?.remind_pattern && !undo) {
            recurringIds.push(id)
          } else {
            regularIds.push(id)
          }
        }

        const results: TodoWithMeta[] = []

        // Regular TODOs: mark done/undo as usual
        if (regularIds.length > 0) {
          const status = undo ? 'pending' : 'done'
          const updated = updateTodoStatus(db, regularIds, status)
          results.push(...updated)
        }

        // Recurring reminders: just ack for today
        for (const id of recurringIds) {
          ackRecurringReminder(db, id)
          const todo = db
            .prepare(
              `SELECT t.*, r.name as repo_name, tp.name as topic_name, 'manual' as source
               FROM todos t
               LEFT JOIN repos r ON t.repo_id = r.id
               LEFT JOIN topics tp ON t.topic_id = tp.id
               WHERE t.id = ?`,
            )
            .get(id) as TodoWithMeta
          results.push(todo)
        }

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              action: undo ? 'undo' : 'done',
              updated: results.length,
              recurring_acked: recurringIds.length,
              todos: results,
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
