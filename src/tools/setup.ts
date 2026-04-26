import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { getStorage } from '../storage/index.js'
import { resolveConfig, getConfigPath } from '../config.js'

export function registerSetupTool(server: McpServer): void {
  server.tool(
    'logbook_setup',
    `Administracion del logbook. Acciones disponibles:
- init: Inicializa vault Obsidian (dashboard, templates, inbox).
- status: Muestra config y vault activo.
- inbox: Bandeja de entrada (sub-accion via inbox_action: list|process).
- topics: Topics (sub-accion via topic_action: list|add).`,
    {
      action: z.enum(['init', 'status', 'inbox', 'topics']).describe('Accion principal'),
      force: z.boolean().optional().default(false).describe('Regenerar (init)'),
      // inbox sub-action
      inbox_action: z.enum(['list', 'process']).optional().describe('Sub-accion de inbox'),
      id: z.string().optional().describe('ID (inbox process)'),
      project: z.string().optional().describe('Proyecto destino (inbox process)'),
      topic: z.string().optional().describe('Topic a asignar (inbox process, topics add)'),
      type: z.enum(['note', 'decision', 'debug', 'standup']).optional().describe('Tipo (inbox process)'),
      // topics sub-action
      topic_action: z.enum(['list', 'add']).optional().describe('Sub-accion de topics'),
      name: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/).optional().describe('Nombre del topic (add)'),
      description: z.string().max(200).optional().describe('Descripcion (add)'),
      kind: z.enum(['note', 'todo', 'table']).optional().default('note').describe('Tipo (add)'),
      folder: z.string().max(50).regex(/^[a-z0-9-]+$/).optional().describe('Carpeta (add)'),
      show_in_index: z.boolean().optional().default(true).describe('Mostrar en index (add)'),
    },
    async (params) => {
      try {
        const storage = getStorage()

        switch (params.action) {
          case 'init': {
            storage.autoRegisterRepo()
            const dashboard = storage.generateDashboard(params.force)
            const templates = storage.generateTemplates(params.force)
            const baseDir = process.env.LOGBOOK_DIR
            let inboxCreated = false
            let inboxDir = ''
            if (baseDir) {
              inboxDir = join(baseDir, 'inbox')
              if (!existsSync(inboxDir)) {
                mkdirSync(inboxDir, { recursive: true })
                inboxCreated = true
              }
            }
            return {
              content: [{ type: 'text' as const, text: JSON.stringify({ dashboard, templates, inbox: { path: inboxDir, created: inboxCreated } }) }],
            }
          }

          case 'status': {
            const config = resolveConfig()
            return {
              content: [{ type: 'text' as const, text: JSON.stringify({ dir: config.dir, workspace: config.workspace, configFile: getConfigPath() }) }],
            }
          }

          case 'inbox': {
            storage.autoRegisterRepo()
            if (params.inbox_action === 'process') {
              if (!params.id) return { isError: true, content: [{ type: 'text' as const, text: '"id" requerido para inbox process' }] }
              if (!params.project) return { isError: true, content: [{ type: 'text' as const, text: '"project" requerido para inbox process' }] }
              const result = storage.processInboxItem(params.id, params.project, params.topic, params.type)
              return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] }
            }
            const items = storage.getInboxItems()
            return { content: [{ type: 'text' as const, text: JSON.stringify(items) }] }
          }

          case 'topics': {
            if (params.topic_action === 'add') {
              if (!params.name) return { isError: true, content: [{ type: 'text' as const, text: '"name" requerido para topics add' }] }
              const topics = storage.getTopics()
              if (topics.some((t) => t.name === params.name)) {
                return { isError: true, content: [{ type: 'text' as const, text: `El topic "${params.name}" ya existe` }] }
              }
              const topic = storage.insertTopic(params.name, params.description, params.kind, params.folder, params.show_in_index)
              return { content: [{ type: 'text' as const, text: JSON.stringify(topic) }] }
            }
            const topics = storage.getTopics()
            return { content: [{ type: 'text' as const, text: JSON.stringify(topics) }] }
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
