import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getStorage } from '../storage/index.js'

export function registerSetupTool(server: McpServer): void {
  server.tool(
    'logbook_setup',
    'Inicializa el vault de Obsidian para el proyecto: genera dashboard (index.md), templates y carpeta inbox.',
    {
      force: z.boolean().optional().default(false).describe('Regenerar aunque ya existan'),
    },
    async ({ force }) => {
      try {
        const storage = getStorage()
        storage.autoRegisterRepo()
        const dashboard = storage.generateDashboard(force)
        const templates = storage.generateTemplates(force)

        // Ensure inbox dir exists
        const { join } = await import('node:path')
        const { mkdirSync, existsSync } = await import('node:fs')
        const baseDir = process.env.LOGBOOK_DIR || ''
        const inboxDir = join(baseDir, 'inbox')
        let inboxCreated = false
        if (baseDir && !existsSync(inboxDir)) {
          mkdirSync(inboxDir, { recursive: true })
          inboxCreated = true
        }

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              dashboard,
              templates,
              inbox: { path: inboxDir, created: inboxCreated },
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
