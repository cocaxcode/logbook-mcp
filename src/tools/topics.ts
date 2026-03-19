import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getDb } from '../db/connection.js'
import { getAllTopics, getTopicByName, insertTopic } from '../db/queries.js'

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
        .min(1)
        .max(50)
        .regex(/^[a-z0-9-]+$/, 'Solo letras minusculas, numeros y guiones')
        .optional()
        .describe('Nombre del nuevo tema (solo para action=add, lowercase, sin espacios)'),
      description: z
        .string()
        .max(200)
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

          const existing = getTopicByName(db, name)
          if (existing) {
            return {
              isError: true,
              content: [{ type: 'text' as const, text: `El topic "${name}" ya existe` }],
            }
          }

          const topic = insertTopic(db, name, description)
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
          content: [{ type: 'text' as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
        }
      }
    },
  )
}
