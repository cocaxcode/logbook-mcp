import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getStorage } from '../storage/index.js'

export function registerNoteTool(server: McpServer): void {
  server.tool(
    'logbook_note',
    'Añade una nota al logbook. Topics: feature, fix, chore, idea, decision, blocker. Si no se pasa topic, queda sin categorizar.',
    {
      content: z.string().min(1).max(5000).describe('Contenido de la nota'),
      topic: z
        .string()
        .optional()
        .describe('Topic: feature, fix, chore, idea, decision, blocker (o custom)'),
    },
    async ({ content, topic }) => {
      try {
        const storage = getStorage()
        storage.autoRegisterRepo()
        const note = storage.insertNote(content, topic)
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(note) }],
        }
      } catch (err: unknown) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: `Error creando nota: ${err instanceof Error ? err.message : String(err)}` }],
        }
      }
    },
  )
}
