import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getStorage } from '../storage/index.js'

export function registerLogTool(server: McpServer): void {
  server.tool(
    'logbook_log',
    'Muestra actividad: notas y TODOs completados para un periodo. Por defecto muestra el dia de hoy del proyecto actual.',
    {
      period: z
        .enum(['today', 'yesterday', 'week', 'month'])
        .optional()
        .describe('Periodo predefinido (default: today)'),
      from: z
        .string()
        .optional()
        .describe('Desde fecha (YYYY-MM-DD). Sobreescribe period.'),
      to: z
        .string()
        .optional()
        .describe('Hasta fecha (YYYY-MM-DD). Sobreescribe period.'),
      type: z
        .enum(['all', 'notes', 'todos'])
        .optional()
        .default('all')
        .describe('Filtrar por tipo: all, notes, todos'),
      topic: z.string().optional().describe('Filtrar por topic'),
      scope: z
        .enum(['project', 'global'])
        .optional()
        .default('project')
        .describe('Scope: project (auto-detecta) o global'),
    },
    async ({ period, from, to, type, topic, scope }) => {
      try {
        const storage = getStorage()
        const repo = scope === 'project' ? storage.autoRegisterRepo() : null

        const entries = storage.getLog({
          period,
          from,
          to,
          type,
          topic,
          scope,
        })

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              period: from ? `${from} — ${to || from}` : (period ?? 'today'),
              scope: scope ?? 'project',
              project: repo?.name ?? null,
              entries,
              summary: {
                total: entries.length,
              },
            }),
          }],
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
