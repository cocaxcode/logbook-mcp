import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getDb } from '../db/connection.js'
import { getAllTopics, getTopicByName, updateTodo } from '../db/queries.js'

export function registerTodoEditTool(server: McpServer): void {
  server.tool(
    'logbook_todo_edit',
    'Edita un TODO existente: contenido, topic o prioridad.',
    {
      id: z.number().describe('ID del TODO a editar'),
      content: z.string().optional().describe('Nuevo contenido'),
      topic: z.string().optional().describe('Nuevo topic'),
      priority: z
        .enum(['low', 'normal', 'high', 'urgent'])
        .optional()
        .describe('Nueva prioridad'),
    },
    async ({ id, content, topic, priority }) => {
      try {
        const db = getDb()

        let topicId: number | undefined
        if (topic) {
          const topicRow = getTopicByName(db, topic)
          if (!topicRow) {
            const available = getAllTopics(db)
            return {
              isError: true,
              content: [{
                type: 'text' as const,
                text: `Topic "${topic}" no existe. Disponibles: ${available.map((t) => t.name).join(', ')}`,
              }],
            }
          }
          topicId = topicRow.id
        }

        const updated = updateTodo(db, id, { content, topicId, priority })

        if (!updated) {
          return {
            isError: true,
            content: [{ type: 'text' as const, text: `TODO #${id} no encontrado o sin cambios` }],
          }
        }

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(updated) }],
        }
      } catch (err: unknown) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: `Error editando TODO: ${(err as Error).message}` }],
        }
      }
    },
  )
}
