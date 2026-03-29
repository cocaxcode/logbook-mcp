import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getStorage } from '../storage/index.js'

export function registerEntryTool(server: McpServer): void {
  server.tool(
    'logbook_entry',
    `Gestiona entradas estructuradas del logbook. Acciones disponibles:
- list: Lista entradas por tipo (note, decision, debug, standup, review).
- edit: Edita contenido o topic de una entrada por ID.
- delete: Elimina una entrada por ID y tipo.
- standup: Registra standup diario (yesterday, today, blockers).
- decision: Registra decision arquitectonica ADR (title, context, options, decision, consequences).
- debug: Registra sesion de debug (title, error, cause, fix).`,
    {
      action: z.enum(['list', 'edit', 'delete', 'standup', 'decision', 'debug']).describe('Accion a ejecutar'),
      // list/delete params
      type: z.enum(['note', 'decision', 'debug', 'standup', 'reminder', 'review']).optional().describe('Tipo de entrada (list, delete)'),
      // edit/delete params
      id: z.string().optional().describe('ID de la entrada (edit, delete)'),
      // edit params
      content: z.string().optional().describe('Nuevo contenido (edit)'),
      topic: z.string().optional().describe('Topic'),
      // list params
      limit: z.number().optional().default(20).describe('Maximo resultados (list)'),
      scope: z.enum(['project', 'global']).optional().default('project').describe('Scope (list)'),
      workspace: z.string().optional().describe('Filtrar por workspace (list, scope=global)'),
      // standup params
      yesterday: z.string().min(1).max(2000).optional().describe('Lo que se hizo ayer (standup)'),
      today: z.string().min(1).max(2000).optional().describe('Lo que se va a hacer hoy (standup)'),
      blockers: z.string().max(2000).optional().describe('Blockers actuales (standup)'),
      // decision params
      title: z.string().min(1).max(200).optional().describe('Titulo (decision, debug)'),
      context: z.string().min(1).max(3000).optional().describe('Contexto (decision)'),
      options: z.array(z.string().min(1).max(500)).min(1).max(10).optional().describe('Opciones consideradas (decision)'),
      decision: z.string().min(1).max(2000).optional().describe('Decision tomada (decision)'),
      consequences: z.string().min(1).max(2000).optional().describe('Consecuencias (decision)'),
      // debug params
      error: z.string().min(1).max(3000).optional().describe('Descripcion del error (debug)'),
      cause: z.string().min(1).max(3000).optional().describe('Causa raiz (debug)'),
      fix: z.string().min(1).max(3000).optional().describe('Solucion aplicada (debug)'),
      file: z.string().optional().describe('Ruta a archivo adjunto (debug)'),
    },
    async (params) => {
      try {
        const storage = getStorage()

        switch (params.action) {
          case 'list': {
            if (!params.type) {
              return { isError: true, content: [{ type: 'text' as const, text: '"type" es requerido para la accion "list"' }] }
            }
            const repo = params.scope === 'project' ? storage.autoRegisterRepo() : null
            const entryType = params.type === 'reminder' ? 'note' : params.type
            const entries = storage.listEntries(entryType, {
              topic: params.topic,
              limit: params.limit,
              scope: params.scope,
              workspace: params.workspace,
            })
            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({
                  scope: params.scope ?? 'project',
                  ...(params.workspace ? { workspace: params.workspace } : {}),
                  ...(repo ? { project: repo.name } : {}),
                  entries,
                  count: entries.length,
                }),
              }],
            }
          }

          case 'edit': {
            if (!params.id) {
              return { isError: true, content: [{ type: 'text' as const, text: '"id" es requerido para la accion "edit"' }] }
            }
            const fields: { content?: string; topic?: string; tags?: string[] } = {}
            if (params.content !== undefined) fields.content = params.content
            if (params.topic !== undefined) {
              fields.topic = params.topic
              fields.tags = [params.topic]
            }
            const updated = storage.updateEntry(params.id, fields)
            if (!updated) {
              return { isError: true, content: [{ type: 'text' as const, text: `No se encontro la entrada con id "${params.id}"` }] }
            }
            return { content: [{ type: 'text' as const, text: JSON.stringify(updated) }] }
          }

          case 'delete': {
            if (!params.id || !params.type) {
              return { isError: true, content: [{ type: 'text' as const, text: '"id" y "type" son requeridos para la accion "delete"' }] }
            }
            const entryType = params.type === 'reminder' ? 'note' : params.type
            const deleted = storage.deleteEntry(params.id, entryType)
            if (!deleted) {
              return { isError: true, content: [{ type: 'text' as const, text: `No se encontro la entrada con id "${params.id}" de tipo "${params.type}"` }] }
            }
            return { content: [{ type: 'text' as const, text: JSON.stringify({ deleted: true, id: params.id, type: params.type }) }] }
          }

          case 'standup': {
            if (!params.yesterday || !params.today) {
              return { isError: true, content: [{ type: 'text' as const, text: '"yesterday" y "today" son requeridos para la accion "standup"' }] }
            }
            storage.autoRegisterRepo()
            const standup = storage.insertStandup(params.yesterday, params.today, params.blockers ?? '', params.topic)
            return { content: [{ type: 'text' as const, text: JSON.stringify(standup) }] }
          }

          case 'decision': {
            if (!params.title || !params.context || !params.options || !params.decision || !params.consequences) {
              return { isError: true, content: [{ type: 'text' as const, text: '"title", "context", "options", "decision" y "consequences" son requeridos para la accion "decision"' }] }
            }
            storage.autoRegisterRepo()
            const entry = storage.insertDecision(params.title, params.context, params.options, params.decision, params.consequences, params.topic)
            return { content: [{ type: 'text' as const, text: JSON.stringify(entry) }] }
          }

          case 'debug': {
            if (!params.title || !params.error || !params.cause || !params.fix) {
              return { isError: true, content: [{ type: 'text' as const, text: '"title", "error", "cause" y "fix" son requeridos para la accion "debug"' }] }
            }
            storage.autoRegisterRepo()
            const entry = storage.insertDebug(params.title, params.error, params.cause, params.fix, params.file, params.topic)
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
