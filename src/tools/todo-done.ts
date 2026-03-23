import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getStorage } from '../storage/index.js'
import type { TodoEntry } from '../storage/types.js'

export function registerTodoDoneTool(server: McpServer): void {
  server.tool(
    'logbook_todo_done',
    'Marca TODOs como hechos o los devuelve a pendiente (undo). Los recordatorios recurrentes se marcan como hechos por hoy y vuelven automaticamente el proximo dia que toque.',
    {
      ids: z
        .union([z.number(), z.string(), z.array(z.union([z.number(), z.string()]))])
        .describe('ID o array de IDs de TODOs a marcar'),
      undo: z
        .boolean()
        .optional()
        .default(false)
        .describe('Si true, devuelve a pendiente en vez de marcar como hecho'),
    },
    async ({ ids, undo }) => {
      try {
        const storage = getStorage()
        storage.autoRegisterRepo()

        const idArray = (Array.isArray(ids) ? ids : [ids]).map(String)

        // Get all todos to separate recurring from regular
        const allTodos = storage.getTodos({ status: 'all' })
        const todoMap = new Map(allTodos.map((t) => [t.id, t]))

        const regularIds: string[] = []
        const recurringIds: string[] = []

        for (const id of idArray) {
          const todo = todoMap.get(id)
          if (todo?.remind_pattern && !undo) {
            recurringIds.push(id)
          } else {
            regularIds.push(id)
          }
        }

        const results: TodoEntry[] = []

        // Regular TODOs: mark done/undo
        if (regularIds.length > 0) {
          const status = undo ? 'pending' : 'done'
          const updated = storage.updateTodoStatus(regularIds, status)
          results.push(...updated)
        }

        // Recurring reminders: just ack for today
        for (const id of recurringIds) {
          storage.ackRecurringReminder(id)
          const todo = todoMap.get(id)
          if (todo) results.push(todo)
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
