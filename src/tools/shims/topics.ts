import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getStorage } from '../../storage/index.js'

export function registerTopicsShim(server: McpServer): void {
  server.tool(
    'logbook_topics',
    '[DEPRECATED: se eliminará en v2.2. Usa logbook_setup action:topics en su lugar.] Lista o crea topics.',
    {
      action: z.enum(['list', 'add']).default('list').describe('Accion'),
      name: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/).optional(),
      description: z.string().max(200).optional(),
      kind: z.enum(['note', 'todo', 'table']).optional().default('note'),
      folder: z.string().max(50).regex(/^[a-z0-9-]+$/).optional(),
      show_in_index: z.boolean().optional().default(true),
    },
    async ({ action, name, description, kind, folder, show_in_index }) => {
      try {
        const storage = getStorage()
        if (action === 'add') {
          if (!name) return { isError: true, content: [{ type: 'text' as const, text: '"name" obligatorio para add' }] }
          const topics = storage.getTopics()
          if (topics.some((t) => t.name === name)) return { isError: true, content: [{ type: 'text' as const, text: `El topic "${name}" ya existe` }] }
          const topic = storage.insertTopic(name, description, kind, folder, show_in_index)
          return { content: [{ type: 'text' as const, text: JSON.stringify({ ...topic, _deprecated: true, _replacement: 'logbook_setup.topics' }) }] }
        }
        const topics = storage.getTopics()
        return { content: [{ type: 'text' as const, text: JSON.stringify({ topics, _deprecated: true, _replacement: 'logbook_setup.topics' }) }] }
      } catch (err: unknown) {
        return { isError: true, content: [{ type: 'text' as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }] }
      }
    },
  )
}
