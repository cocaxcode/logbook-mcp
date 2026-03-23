import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getStorage } from '../storage/index.js'

export function registerStandupTool(server: McpServer): void {
  server.tool(
    'logbook_standup',
    'Registra un standup diario con lo que se hizo ayer, lo de hoy y blockers. Ideal para Daily Notes en Obsidian.',
    {
      yesterday: z.string().min(1).max(2000).describe('Lo que se hizo ayer'),
      today: z.string().min(1).max(2000).describe('Lo que se va a hacer hoy'),
      blockers: z
        .string()
        .max(2000)
        .optional()
        .default('')
        .describe('Blockers actuales (opcional)'),
      topic: z.string().optional().describe('Topic (opcional)'),
    },
    async ({ yesterday, today, blockers, topic }) => {
      try {
        const storage = getStorage()
        storage.autoRegisterRepo()
        const standup = storage.insertStandup(yesterday, today, blockers, topic)
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(standup) }],
        }
      } catch (err: unknown) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: `Error creando standup: ${err instanceof Error ? err.message : String(err)}` }],
        }
      }
    },
  )
}
