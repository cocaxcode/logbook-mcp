import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getDb } from '../db/connection.js'
import {
  getCompletedTodos,
  getNotes,
  getTopicByName,
} from '../db/queries.js'
import { autoRegisterRepo } from '../git/detect-repo.js'
import type { LogEntry } from '../types.js'

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
        const db = getDb()
        const repo = scope === 'project' ? autoRegisterRepo(db) : null

        const { dateFrom, dateTo } = resolveDates(period, from, to)

        let topicId: number | undefined
        if (topic) {
          const topicRow = getTopicByName(db, topic)
          if (topicRow) topicId = topicRow.id
        }

        const filters = {
          repoId: repo?.id,
          topicId,
          from: dateFrom,
          to: dateTo,
        }

        const notes = type === 'todos' ? [] : getNotes(db, filters)
        const completedTodos = type === 'notes' ? [] : getCompletedTodos(db, filters)

        const entries: LogEntry[] = [
          ...notes.map((n) => ({
            type: 'note' as const,
            data: n,
            timestamp: n.created_at,
          })),
          ...completedTodos.map((t) => ({
            type: 'todo' as const,
            data: t,
            timestamp: t.completed_at ?? t.created_at,
          })),
        ].sort((a, b) => b.timestamp.localeCompare(a.timestamp))

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              period: from ? `${dateFrom} — ${dateTo}` : (period ?? 'today'),
              scope: scope ?? 'project',
              project: repo?.name ?? null,
              entries,
              summary: {
                notes: notes.length,
                todos_completed: completedTodos.length,
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

function resolveDates(
  period?: string,
  from?: string,
  to?: string,
): { dateFrom: string; dateTo: string } {
  if (from) {
    const dateTo = to ?? new Date(Date.now() + 86400000).toISOString().split('T')[0]
    return { dateFrom: from, dateTo }
  }

  const now = new Date()
  const today = now.toISOString().split('T')[0]
  const tomorrow = new Date(now.getTime() + 86400000).toISOString().split('T')[0]

  switch (period) {
    case 'yesterday': {
      const yesterday = new Date(now.getTime() - 86400000).toISOString().split('T')[0]
      return { dateFrom: yesterday, dateTo: today }
    }
    case 'week': {
      const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString().split('T')[0]
      return { dateFrom: weekAgo, dateTo: tomorrow }
    }
    case 'month': {
      const monthAgo = new Date(now.getTime() - 30 * 86400000).toISOString().split('T')[0]
      return { dateFrom: monthAgo, dateTo: tomorrow }
    }
    default: // today
      return { dateFrom: today, dateTo: tomorrow }
  }
}
