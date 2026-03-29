import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { getStorage, getStorageMode } from '../storage/index.js'
import { resolveConfig, getConfigPath, getBaseDir } from '../config.js'
import { ObsidianStorage } from '../storage/obsidian/index.js'
import { getDb } from '../db/connection.js'
import { getNotes, getTodos } from '../db/queries.js'

export function registerSetupTool(server: McpServer): void {
  server.tool(
    'logbook_setup',
    `Administracion del logbook. Acciones disponibles:
- init: Inicializa vault Obsidian (dashboard, templates, inbox).
- migrate: Migra datos de SQLite a Obsidian manualmente. Requiere modo obsidian.
- status: Muestra modo actual, config, estado de migracion.`,
    {
      action: z.enum(['init', 'migrate', 'status']).describe('Accion a ejecutar'),
      force: z.boolean().optional().default(false).describe('Regenerar aunque ya existan (init)'),
    },
    async ({ action, force }) => {
      try {
        switch (action) {
          case 'init': {
            const storage = getStorage()
            storage.autoRegisterRepo()
            const dashboard = storage.generateDashboard(force)
            const templates = storage.generateTemplates(force)

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
              content: [{
                type: 'text' as const,
                text: JSON.stringify({ dashboard, templates, inbox: { path: inboxDir, created: inboxCreated } }),
              }],
            }
          }

          case 'migrate': {
            if (getStorageMode() !== 'obsidian') {
              return {
                isError: true,
                content: [{
                  type: 'text' as const,
                  text: 'logbook_setup action:migrate requiere modo obsidian. Configura --storage obsidian --dir <path> en los args del MCP, o "storage": "obsidian" en ~/.logbook/config.json. Luego reinicia el servidor.',
                }],
              }
            }

            const storage = getStorage()
            storage.autoRegisterRepo()

            let migratedNotes = 0
            let migratedTodos = 0
            let sqliteMigrated = false

            try {
              const db = getDb()
              const notes = getNotes(db, { limit: 10000 })
              const todos = getTodos(db, { limit: 10000 })

              for (const note of notes) {
                try {
                  storage.insertNote(note.content, note.topic_name || undefined)
                  migratedNotes++
                } catch { /* skip */ }
              }

              for (const todo of todos) {
                try {
                  const entry = storage.insertTodo(todo.content, {
                    topic: todo.topic_name || undefined,
                    priority: todo.priority,
                    remind_at: todo.remind_at || undefined,
                    remind_pattern: todo.remind_pattern || undefined,
                  })
                  if (todo.status === 'done') {
                    storage.updateTodoStatus([entry.id], 'done')
                  }
                  migratedTodos++
                } catch { /* skip */ }
              }

              sqliteMigrated = true
            } catch { /* no sqlite db */ }

            let todosFolderMigration = { migrated: 0, projects: [] as string[] }
            if (storage instanceof ObsidianStorage) {
              todosFolderMigration = storage.migrateTodosFolder()
            }

            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({
                  sqlite: sqliteMigrated ? { notes: migratedNotes, todos: migratedTodos, total: migratedNotes + migratedTodos, source: 'sqlite (~/.logbook/logbook.db)' } : 'No se encontro base de datos SQLite',
                  todosConsolidation: todosFolderMigration,
                  destination: process.env.LOGBOOK_DIR,
                }),
              }],
            }
          }

          case 'status': {
            const config = resolveConfig()
            const markerPath = join(getBaseDir(), '.migrated')
            const dbPath = join(getBaseDir(), 'logbook.db')

            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({
                  storage: config.storage,
                  dir: config.dir,
                  workspace: config.workspace,
                  autoMigrate: config.autoMigrate,
                  configFile: getConfigPath(),
                  sqliteDb: { path: dbPath, exists: existsSync(dbPath) },
                  migrated: existsSync(markerPath),
                }),
              }],
            }
          }

          default:
            return { isError: true, content: [{ type: 'text' as const, text: `Accion desconocida: ${action}` }] }
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
