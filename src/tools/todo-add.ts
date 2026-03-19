import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getDb } from '../db/connection.js'
import { insertTodo, resolveTopicId } from '../db/queries.js'
import { autoRegisterRepo } from '../git/detect-repo.js'
import type { TodoAddItem, TodoWithMeta } from '../types.js'

const priorityEnum = z.enum(['low', 'normal', 'high', 'urgent'])

export function registerTodoAddTool(server: McpServer): void {
  server.tool(
    'logbook_todo_add',
    'Crea uno o varios TODOs. Para uno solo usa content. Para varios usa items (array). El topic se puede pasar o dejar que la AI lo infiera.',
    {
      content: z
        .string()
        .min(1)
        .max(2000)
        .optional()
        .describe('Contenido del TODO (para crear uno solo)'),
      topic: z
        .string()
        .optional()
        .describe('Topic para el TODO individual'),
      priority: priorityEnum
        .optional()
        .default('normal')
        .describe('Prioridad del TODO individual'),
      remind_at: z
        .string()
        .optional()
        .describe('Fecha recordatorio (YYYY-MM-DD). Se asigna topic "reminder" automaticamente.'),
      items: z
        .array(
          z.object({
            content: z.string().min(1).max(2000).describe('Contenido del TODO'),
            topic: z.string().optional().describe('Topic'),
            priority: priorityEnum.optional().default('normal').describe('Prioridad'),
            remind_at: z.string().optional().describe('Fecha recordatorio (YYYY-MM-DD)'),
          }),
        )
        .max(50)
        .optional()
        .describe('Array de TODOs para crear varios a la vez (max 50)'),
    },
    async ({ content, topic, priority, remind_at, items }) => {
      try {
        if (!content && (!items || items.length === 0)) {
          return {
            isError: true,
            content: [{
              type: 'text' as const,
              text: 'Debes pasar "content" (para uno) o "items" (para varios)',
            }],
          }
        }

        const db = getDb()
        const repo = autoRegisterRepo(db)
        const repoId = repo?.id ?? null

        const todoItems: TodoAddItem[] = items
          ? items
          : [{ content: content!, topic, priority: priority ?? 'normal', remind_at }]

        const results: TodoWithMeta[] = []

        for (const item of todoItems) {
          // Auto-assign topic "reminder" if remind_at is set and no topic
          const effectiveTopic = item.remind_at && !item.topic ? 'reminder' : item.topic
          const topicId = effectiveTopic ? resolveTopicId(db, effectiveTopic) : null

          const todo = insertTodo(
            db,
            repoId,
            topicId,
            item.content,
            item.priority ?? 'normal',
            item.remind_at,
          )
          results.push(todo)
        }

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify(
              results.length === 1 ? results[0] : { created: results.length, todos: results },
            ),
          }],
        }
      } catch (err: unknown) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: `Error creando TODO: ${err instanceof Error ? err.message : String(err)}` }],
        }
      }
    },
  )
}
