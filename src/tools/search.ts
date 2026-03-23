import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getStorage } from '../storage/index.js'

export function registerSearchTool(server: McpServer): void {
  server.tool(
    'logbook_search',
    'Busqueda full-text en notas y TODOs. Usa FTS5 para busqueda rapida.',
    {
      query: z.string().min(1).max(500).describe('Texto a buscar'),
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
        const storage = getStorage()
        if (scope === 'project') storage.autoRegisterRepo()

        const results = storage.search(query, { type, topic, scope, limit })

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
          content: [{ type: 'text' as const, text: `Error buscando: ${err instanceof Error ? err.message : String(err)}` }],
        }
      }
    },
  )
}
