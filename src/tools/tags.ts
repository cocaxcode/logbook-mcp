import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getStorage } from '../storage/index.js'

export function registerTagsTool(server: McpServer): void {
  server.tool(
    'logbook_tags',
    'Lista todos los tags usados en el logbook con su conteo. Opcionalmente filtra por un tag especifico.',
    {
      filter: z
        .string()
        .optional()
        .describe('Filtrar por tag especifico (opcional)'),
    },
    async ({ filter }) => {
      try {
        const storage = getStorage()
        storage.autoRegisterRepo()
        const tags = storage.getTags(filter)
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ tags, total: tags.length }) }],
        }
      } catch (err: unknown) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: `Error listando tags: ${err instanceof Error ? err.message : String(err)}` }],
        }
      }
    },
  )
}
