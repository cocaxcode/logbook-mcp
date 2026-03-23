import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getStorage } from '../storage/index.js'

export function registerTimelineTool(server: McpServer): void {
  server.tool(
    'logbook_timeline',
    'Timeline de actividad cruzando proyectos y workspaces. Muestra un resumen cronologico de toda la actividad.',
    {
      period: z
        .enum(['today', 'yesterday', 'week', 'month'])
        .optional()
        .default('week')
        .describe('Periodo (default: week)'),
      from: z.string().optional().describe('Desde fecha (YYYY-MM-DD). Sobreescribe period.'),
      to: z.string().optional().describe('Hasta fecha (YYYY-MM-DD). Sobreescribe period.'),
      workspace: z
        .string()
        .optional()
        .describe('Filtrar por workspace (opcional)'),
    },
    async ({ period, from, to, workspace }) => {
      try {
        const storage = getStorage()
        storage.autoRegisterRepo()
        const entries = storage.getTimeline({ period, from, to, workspace })
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              period: from ? `${from} — ${to || from}` : period,
              entries,
              total: entries.length,
            }),
          }],
        }
      } catch (err: unknown) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: `Error generando timeline: ${err instanceof Error ? err.message : String(err)}` }],
        }
      }
    },
  )
}
