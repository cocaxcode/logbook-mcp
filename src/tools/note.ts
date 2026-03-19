import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getDb } from '../db/connection.js'
import { getAllTopics, getTopicByName, insertNote } from '../db/queries.js'
import { autoRegisterRepo } from '../git/detect-repo.js'

export function registerNoteTool(server: McpServer): void {
  server.tool(
    'logbook_note',
    'Añade una nota al logbook. Topics: feature, fix, chore, idea, decision, blocker. Si no se pasa topic, queda sin categorizar.',
    {
      content: z.string().describe('Contenido de la nota'),
      topic: z
        .string()
        .optional()
        .describe('Topic: feature, fix, chore, idea, decision, blocker (o custom)'),
    },
    async ({ content, topic }) => {
      try {
        const db = getDb()
        const repo = autoRegisterRepo(db)

        let topicId: number | null = null
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

        const note = insertNote(db, repo?.id ?? null, topicId, content)
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(note) }],
        }
      } catch (err: unknown) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: `Error creando nota: ${(err as Error).message}` }],
        }
      }
    },
  )
}
