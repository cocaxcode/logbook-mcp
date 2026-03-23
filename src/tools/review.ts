import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getStorage } from '../storage/index.js'

export function registerReviewTool(server: McpServer): void {
  server.tool(
    'logbook_review',
    'Genera una nota de review semanal o mensual con resumen de actividad, estadísticas y highlights.',
    {
      period: z.enum(['week', 'month']).describe('Periodo del review: week o month'),
      project: z.string().optional().describe('Proyecto (default: proyecto actual)'),
    },
    async ({ period, project }) => {
      try {
        const storage = getStorage()
        storage.autoRegisterRepo()
        const result = storage.generateReview(period, project)
        return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] }
      } catch (err: unknown) {
        return { isError: true, content: [{ type: 'text' as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }] }
      }
    },
  )
}
