import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getStorage } from '../storage/index.js'

export function registerQueryTool(server: McpServer): void {
  server.tool(
    'logbook_query',
    `Consulta del logbook. Acciones disponibles:
- search: Busqueda full-text en notas y TODOs.
- log: Actividad (notas + TODOs completados) para un periodo.
- timeline: Timeline cross-project/workspace.
- tags: Lista todos los tags con conteo.
- reminders: Recordatorios pendientes (action puede llevar 'ack').
- review: Genera review semanal/mensual.
- get: Obtiene el body completo de un entry por id.`,
    {
      action: z
        .enum(['search', 'log', 'timeline', 'tags', 'reminders', 'review', 'get'])
        .describe('Tipo de consulta'),
      query: z.string().min(1).max(500).optional().describe('Texto a buscar (search)'),
      type: z.enum(['all', 'notes', 'todos']).optional().default('all').describe('Filtrar por tipo (search, log)'),
      topic: z.string().optional().describe('Filtrar por topic (search, log)'),
      scope: z
        .enum(['project', 'workspace', 'global'])
        .optional()
        .default('project')
        .describe('Scope (search, log, reminders)'),
      limit: z.number().optional().default(20).describe('Maximo resultados (search)'),
      period: z.enum(['today', 'yesterday', 'week', 'month']).optional().describe('Periodo (log, timeline, review)'),
      from: z.string().optional().describe('Desde fecha YYYY-MM-DD'),
      to: z.string().optional().describe('Hasta fecha YYYY-MM-DD'),
      workspace: z.string().optional().describe('Filtrar por workspace (timeline)'),
      filter: z.string().optional().describe('Filtro de tag (action:tags)'),
      reminder_action: z.enum(['list', 'ack']).optional().default('list').describe('Sub-accion de reminders'),
      id: z.string().optional().describe('ID del item (action:reminders ack, action:get)'),
      snooze_until: z.string().optional().describe('Fecha hasta la que posponer (action:reminders ack)'),
      project: z.string().optional().describe('Proyecto (action:review)'),
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
            const allowedScope = params.scope === 'workspace' ? 'project' : params.scope
            const results = await storage.search(params.query, {
              type: params.type,
              topic: params.topic,
              scope: allowedScope as 'project' | 'global' | undefined,
              limit: params.limit,
            })
            return { content: [{ type: 'text' as const, text: JSON.stringify({ query: params.query, results, total: results.length }) }] }
          }

          case 'log': {
            const repo = params.scope === 'project' ? storage.autoRegisterRepo() : null
            const entries = storage.getLog({
              period: params.period,
              from: params.from,
              to: params.to,
              type: params.type,
              topic: params.topic,
              scope: params.scope === 'workspace' ? 'project' : (params.scope as 'project' | 'global' | undefined),
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

          case 'tags': {
            storage.autoRegisterRepo()
            const tags = storage.getTags(params.filter)
            return { content: [{ type: 'text' as const, text: JSON.stringify({ tags, total: tags.length }) }] }
          }

          case 'reminders': {
            storage.autoRegisterRepo()
            if (params.reminder_action === 'ack') {
              if (!params.id) return { isError: true, content: [{ type: 'text' as const, text: '"id" requerido para reminders ack' }] }
              storage.ackRecurringReminder(params.id, params.snooze_until)
              return { content: [{ type: 'text' as const, text: JSON.stringify({ acked: params.id, snooze_until: params.snooze_until ?? null }) }] }
            }
            const result = storage.getDueReminders(params.scope as 'project' | 'workspace' | 'global' | undefined)
            if (!result) return { content: [{ type: 'text' as const, text: JSON.stringify({ scope: params.scope, reminders: null, message: 'Sin recordatorios pendientes' }) }] }
            return { content: [{ type: 'text' as const, text: JSON.stringify({ scope: params.scope, ...result }) }] }
          }

          case 'review': {
            storage.autoRegisterRepo()
            const period = params.period === 'week' || params.period === 'month' ? params.period : 'week'
            const result = storage.generateReview(period, params.project)
            return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] }
          }

          case 'get': {
            if (!params.id) return { isError: true, content: [{ type: 'text' as const, text: '"id" requerido para action:get' }] }
            const entry = storage.getEntryById(params.id)
            if (!entry) return { isError: true, content: [{ type: 'text' as const, text: `not_found: ${params.id}` }] }
            return { content: [{ type: 'text' as const, text: JSON.stringify(entry) }] }
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
