import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getStorage } from '../storage/index.js'

export function registerDebugTool(server: McpServer): void {
  server.tool(
    'logbook_debug',
    'Registra una sesion de debug: error, causa, fix y archivo adjunto opcional. En Obsidian se muestra como callout [!bug].',
    {
      title: z.string().min(1).max(200).describe('Titulo del bug/error'),
      error: z.string().min(1).max(3000).describe('Descripcion del error'),
      cause: z.string().min(1).max(3000).describe('Causa raiz identificada'),
      fix: z.string().min(1).max(3000).describe('Solucion aplicada'),
      file: z
        .string()
        .optional()
        .describe('Ruta a archivo adjunto (screenshot, log). Se copia al vault.'),
      topic: z.string().optional().describe('Topic (default: fix)'),
    },
    async ({ title, error, cause, fix, file, topic }) => {
      try {
        const storage = getStorage()
        storage.autoRegisterRepo()
        const entry = storage.insertDebug(title, error, cause, fix, file, topic)
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(entry) }],
        }
      } catch (err: unknown) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: `Error creando debug entry: ${err instanceof Error ? err.message : String(err)}` }],
        }
      }
    },
  )
}
