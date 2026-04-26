import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getStorage } from '../../storage/index.js'

export function registerTagsShim(server: McpServer): void {
  server.tool(
    'logbook_tags',
    '[DEPRECATED: se eliminará en v2.2. Usa logbook_query action:tags en su lugar.] Lista todos los tags usados en el logbook con su conteo.',
    { filter: z.string().optional().describe('Filtrar por tag especifico (opcional)') },
    async ({ filter }) => {
      try {
        const storage = getStorage()
        storage.autoRegisterRepo()
        const tags = storage.getTags(filter)
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              tags,
              total: tags.length,
              _deprecated: true,
              _replacement: 'logbook_query.tags',
            }),
          }],
        }
      } catch (err: unknown) {
        return { isError: true, content: [{ type: 'text' as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }] }
      }
    },
  )
}
