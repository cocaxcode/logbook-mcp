import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getStorage } from '../storage/index.js'

export function registerQueryTool(server: McpServer): void {
  server.tool(
    'logbook_query',
    `Busca y consulta el logbook. Acciones disponibles:
- search: Busqueda full-text en notas y TODOs (FTS5). Requiere "query".
- log: Actividad (notas + TODOs completados) para un periodo. Default: hoy.
- timeline: Timeline cross-project/workspace. Default: semana.`,
    {
      action: z.enum(['search', 'log', 'timeline']).describe('Tipo de consulta'),
      // search params
      query: z.string().min(1).max(500).optional().describe('Texto a buscar (search)'),
      // shared params
      type: z.enum(['all', 'notes', 'todos']).optional().default('all').describe('Filtrar por tipo (search, log)'),
      topic: z.string().optional().describe('Filtrar por topic (search, log)'),
      scope: z.enum(['project', 'global']).optional().default('project').describe('Scope (search, log)'),
      limit: z.number().optional().default(20).describe('Maximo resultados (search)'),
      // log/timeline params
      period: z.enum(['today', 'yesterday', 'week', 'month']).optional().describe('Periodo (log, timeline)'),
      from: z.string().optional().describe('Desde fecha YYYY-MM-DD'),
      to: z.string().optional().describe('Hasta fecha YYYY-MM-DD'),
      // timeline params
      workspace: z.string().optional().describe('Filtrar por workspace (timeline)'),
    },
    async (params) => {
      try {
        const storage = getStorage()

        switch (params.action) {
          case 'search': {
            if (!params.query) {
              return { isError: true, content: [{ type: 'text' as const, text: '"query" es requerido para la accion "search"' }] }
            }
            if (params.scope === 'project') storage.autoRegisterRepo()
            const results = storage.search(params.query, {
              type: params.type,
              topic: params.topic,
              scope: params.scope,
              limit: params.limit,
            })
            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({ query: params.query, results, total: results.length }),
              }],
            }
          }

          case 'log': {
            const repo = params.scope === 'project' ? storage.autoRegisterRepo() : null
            const entries = storage.getLog({
              period: params.period,
              from: params.from,
              to: params.to,
              type: params.type,
              topic: params.topic,
              scope: params.scope,
            })
            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({
                  period: params.from ? `${params.from} — ${params.to || params.from}` : (params.period ?? 'today'),
                  scope: params.scope ?? 'project',
                  project: repo?.name ?? null,
                  entries,
                  summary: { total: entries.length },
                }),
              }],
            }
          }

          case 'timeline': {
            storage.autoRegisterRepo()
            const entries = storage.getTimeline({
              period: params.period ?? 'week',
              from: params.from,
              to: params.to,
              workspace: params.workspace,
            })
            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({
                  period: params.from ? `${params.from} — ${params.to || params.from}` : (params.period ?? 'week'),
                  entries,
                  total: entries.length,
                }),
              }],
            }
          }

          default:
            return { isError: true, content: [{ type: 'text' as const, text: `Accion desconocida: ${params.action}` }] }
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
