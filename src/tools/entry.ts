import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getStorage } from '../storage/index.js'

export function registerEntryTool(server: McpServer): void {
  server.tool(
    'logbook_entry',
    'Gestionar entradas del logbook: listar, editar o eliminar notas, decisiones, debug y standups.',
    {
      action: z.enum(['list', 'edit', 'delete']),
      type: z
        .enum(['note', 'decision', 'debug', 'standup', 'reminder', 'review'])
        .optional()
        .describe('Tipo de entrada (requerido para list y delete)'),
      id: z.string().optional().describe('ID de la entrada (requerido para edit y delete)'),
      content: z.string().optional().describe('Nuevo contenido (para edit)'),
      topic: z.string().optional().describe('Nuevo topic (para edit)'),
      limit: z.number().optional().default(20).describe('Máximo de resultados (para list)'),
      scope: z
        .enum(['project', 'global'])
        .optional()
        .default('project')
        .describe('Scope: project (auto-detecta) o global (todos los proyectos)'),
      workspace: z
        .string()
        .optional()
        .describe('Filtrar por workspace (solo cuando scope=global)'),
    },
    async ({ action, type, id, content, topic, limit, scope, workspace }) => {
      try {
        const storage = getStorage()
        const repo = scope === 'project' ? storage.autoRegisterRepo() : null

        if (action === 'list') {
          if (!type) {
            return {
              isError: true,
              content: [{ type: 'text' as const, text: 'Error: "type" es requerido para la acción "list"' }],
            }
          }

          const entryType = type === 'reminder' ? 'note' : type
          const entries = storage.listEntries(entryType, { topic, limit, scope, workspace })
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                scope: scope ?? 'project',
                ...(workspace ? { workspace } : {}),
                ...(repo ? { project: repo.name } : {}),
                entries,
                count: entries.length,
              }),
            }],
          }
        }

        if (action === 'edit') {
          if (!id) {
            return {
              isError: true,
              content: [{ type: 'text' as const, text: 'Error: "id" es requerido para la acción "edit"' }],
            }
          }

          const fields: { content?: string; topic?: string; tags?: string[] } = {}
          if (content !== undefined) fields.content = content
          if (topic !== undefined) {
            fields.topic = topic
            fields.tags = [topic]
          }

          const updated = storage.updateEntry(id, fields)
          if (!updated) {
            return {
              isError: true,
              content: [{ type: 'text' as const, text: `Error: No se encontró la entrada con id "${id}"` }],
            }
          }

          return {
            content: [{ type: 'text' as const, text: JSON.stringify(updated) }],
          }
        }

        if (action === 'delete') {
          if (!id || !type) {
            return {
              isError: true,
              content: [{ type: 'text' as const, text: 'Error: "id" y "type" son requeridos para la acción "delete"' }],
            }
          }

          const entryType = type === 'reminder' ? 'note' : type
          const deleted = storage.deleteEntry(id, entryType)
          if (!deleted) {
            return {
              isError: true,
              content: [{ type: 'text' as const, text: `Error: No se encontró la entrada con id "${id}" de tipo "${type}"` }],
            }
          }

          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ deleted: true, id, type }) }],
          }
        }

        return {
          isError: true,
          content: [{ type: 'text' as const, text: `Error: Acción desconocida "${action}"` }],
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
