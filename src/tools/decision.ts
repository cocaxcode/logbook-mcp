import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getStorage } from '../storage/index.js'

export function registerDecisionTool(server: McpServer): void {
  server.tool(
    'logbook_decision',
    'Registra una decision arquitectonica o tecnica (ADR). Incluye contexto, opciones, decision y consecuencias.',
    {
      title: z.string().min(1).max(200).describe('Titulo de la decision'),
      context: z.string().min(1).max(3000).describe('Contexto: por que se necesita esta decision'),
      options: z
        .array(z.string().min(1).max(500))
        .min(1)
        .max(10)
        .describe('Opciones consideradas'),
      decision: z.string().min(1).max(2000).describe('Decision tomada'),
      consequences: z.string().min(1).max(2000).describe('Consecuencias de la decision'),
      topic: z.string().optional().describe('Topic (default: decision)'),
    },
    async ({ title, context, options, decision, consequences, topic }) => {
      try {
        const storage = getStorage()
        storage.autoRegisterRepo()
        const entry = storage.insertDecision(title, context, options, decision, consequences, topic)
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(entry) }],
        }
      } catch (err: unknown) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: `Error creando decision: ${err instanceof Error ? err.message : String(err)}` }],
        }
      }
    },
  )
}
