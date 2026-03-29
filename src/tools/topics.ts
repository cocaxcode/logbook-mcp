import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getStorage } from '../storage/index.js'

export function registerTopicsTool(server: McpServer): void {
  server.tool(
    'logbook_topics',
    'Lista o crea temas para organizar notas y TODOs. Temas predefinidos: feature, fix, chore, idea, decision, blocker. Los custom pueden tener tipo (note o todo) y carpeta propia en Obsidian.',
    {
      action: z
        .enum(['list', 'add'])
        .default('list')
        .describe('Accion: list (ver temas) o add (crear tema custom)'),
      name: z
        .string()
        .min(1)
        .max(50)
        .regex(/^[a-z0-9-]+$/, 'Solo letras minusculas, numeros y guiones')
        .optional()
        .describe('Nombre del nuevo tema (solo para action=add, lowercase, sin espacios)'),
      description: z
        .string()
        .max(200)
        .optional()
        .describe('Descripcion del nuevo tema (solo para action=add)'),
      kind: z
        .enum(['note', 'todo', 'table'])
        .optional()
        .default('note')
        .describe('Tipo de comportamiento: note (archivo individual), todo (checkbox consolidado), table (tabla markdown con filas). Default: note'),
      folder: z
        .string()
        .max(50)
        .regex(/^[a-z0-9-]+$/, 'Solo letras minusculas, numeros y guiones')
        .optional()
        .describe('Carpeta propia en Obsidian (si no se pasa, usa notes/ o todos/). Ej: "incidents" crea proyecto/incidents/'),
      show_in_index: z
        .boolean()
        .optional()
        .default(true)
        .describe('Mostrar este topic en el dashboard index.md de Obsidian (default: true)'),
    },
    async ({ action, name, description, kind, folder, show_in_index }) => {
      try {
        const storage = getStorage()

        if (action === 'add') {
          if (!name) {
            return {
              isError: true,
              content: [{ type: 'text' as const, text: 'El parametro "name" es obligatorio para action=add' }],
            }
          }

          // Check if exists
          const topics = storage.getTopics()
          if (topics.some((t) => t.name === name)) {
            return {
              isError: true,
              content: [{ type: 'text' as const, text: `El topic "${name}" ya existe` }],
            }
          }

          const topic = storage.insertTopic(name, description, kind, folder, show_in_index)
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(topic) }],
          }
        }

        const topics = storage.getTopics()
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(topics) }],
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
