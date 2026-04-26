import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getStorage } from '../../storage/index.js'

export function registerReviewShim(server: McpServer): void {
  server.tool(
    'logbook_review',
    '[DEPRECATED: se eliminará en v2.2. Usa logbook_query action:review en su lugar.] Genera review semanal o mensual.',
    {
      period: z.enum(['week', 'month']).describe('Periodo'),
      project: z.string().optional().describe('Proyecto (default: actual)'),
    },
    async ({ period, project }) => {
      try {
        const storage = getStorage()
        storage.autoRegisterRepo()
        const result = storage.generateReview(period, project)
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ ...result, _deprecated: true, _replacement: 'logbook_query.review' }),
          }],
        }
      } catch (err: unknown) {
        return { isError: true, content: [{ type: 'text' as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }] }
      }
    },
  )
}
