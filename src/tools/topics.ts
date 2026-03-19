import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getDb } from '../db/connection.js'
import { getAllTopics, insertTopic } from '../db/queries.js'

export function registerTopicsTool(server: McpServer): void {
  server.tool(
    'logbook_topics',
    'Lista o crea temas para organizar notas y TODOs. Temas predefinidos: feature, fix, chore, idea, decision, blocker.',
    {
      action: z
        .enum(['list', 'add'])
        .default('list')
        .describe('Accion: list (ver temas) o add (crear tema custom)'),
      name: z
        .string()
        .optional()
        .describe('Nombre del nuevo tema (solo para action=add, lowercase, sin espacios)'),
      description: z
        .string()
        .optional()
        .describe('Descripcion del nuevo tema (solo para action=add)'),
    },
    async ({ action, name, description }) => {
      try {
        const db = getDb()

        if (action === 'add') {
          if (!name) {
            return {
              isError: true,
              content: [{ type: 'text' as const, text: 'El parametro "name" es obligatorio para action=add' }],
            }
          }

          const normalized = name.toLowerCase().replace(/\s+/g, '-')
          const topic = insertTopic(db, normalized, description)
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(topic) }],
          }
        }

        const topics = getAllTopics(db)
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(topics) }],
        }
      } catch (err: unknown) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
        }
      }
    },
  )
}
