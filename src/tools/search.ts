import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getDb } from '../db/connection.js'
import {
  getTopicByName,
  searchNotes,
  searchTodos,
} from '../db/queries.js'
import { autoRegisterRepo } from '../git/detect-repo.js'
import type { SearchResult } from '../types.js'

export function registerSearchTool(server: McpServer): void {
  server.tool(
    'logbook_search',
    'Busqueda full-text en notas y TODOs. Usa FTS5 para busqueda rapida.',
    {
      query: z.string().describe('Texto a buscar'),
      type: z
        .enum(['all', 'notes', 'todos'])
        .optional()
        .default('all')
        .describe('Buscar en: all, notes, todos'),
      topic: z.string().optional().describe('Filtrar por topic'),
      scope: z
        .enum(['project', 'global'])
        .optional()
        .default('project')
        .describe('Scope: project o global'),
      limit: z
        .number()
        .optional()
        .default(20)
        .describe('Maximo resultados (default: 20)'),
    },
    async ({ query, type, topic, scope, limit }) => {
      try {
        const db = getDb()
        const repo = scope === 'project' ? autoRegisterRepo(db) : null

        let topicId: number | undefined
        if (topic) {
          const topicRow = getTopicByName(db, topic)
          if (topicRow) topicId = topicRow.id
        }

        const filters = {
          repoId: repo?.id,
          topicId,
          limit,
        }

        const results: SearchResult[] = []

        if (type !== 'todos') {
          const notes = searchNotes(db, query, filters)
          results.push(
            ...notes.map((n, i) => ({
              type: 'note' as const,
              data: n,
              rank: i,
            })),
          )
        }

        if (type !== 'notes') {
          const todos = searchTodos(db, query, filters)
          results.push(
            ...todos.map((t, i) => ({
              type: 'todo' as const,
              data: t,
              rank: i,
            })),
          )
        }

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              query,
              results,
              total: results.length,
            }),
          }],
        }
      } catch (err: unknown) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: `Error buscando: ${(err as Error).message}` }],
        }
      }
    },
  )
}
