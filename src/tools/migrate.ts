import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { getStorage, getStorageMode } from '../storage/index.js'
import { ObsidianStorage } from '../storage/obsidian/index.js'
import { getDb } from '../db/connection.js'
import { getNotes, getTodos } from '../db/queries.js'

export function registerMigrateTool(server: McpServer): void {
  server.tool(
    'logbook_migrate',
    'Convierte datos existentes de SQLite a archivos markdown para Obsidian. Tambien consolida TODOs individuales (todos/) en un solo todos.md por proyecto. Requiere LOGBOOK_STORAGE=obsidian.',
    {},
    async () => {
      try {
        if (getStorageMode() !== 'obsidian') {
          return {
            isError: true,
            content: [{
              type: 'text' as const,
              text: 'logbook_migrate requiere LOGBOOK_STORAGE=obsidian. Configura las variables de entorno antes de migrar.',
            }],
          }
        }

        const storage = getStorage()
        storage.autoRegisterRepo()

        let migratedNotes = 0
        let migratedTodos = 0

        // 1. Migrar desde SQLite si existe
        let sqliteMigrated = false
        try {
          const db = getDb()
          const notes = getNotes(db, { limit: 10000 })
          const todos = getTodos(db, { limit: 10000 })

          for (const note of notes) {
            try {
              storage.insertNote(note.content, note.topic_name || undefined)
              migratedNotes++
            } catch {
              // Skip failed entries
            }
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
            } catch {
              // Skip failed entries
            }
          }

          sqliteMigrated = true
        } catch {
          // No hay SQLite — no es error, puede ser solo migracion de todos/
        }

        // 2. Consolidar archivos individuales todos/ → todos.md
        let todosFolderMigration = { migrated: 0, projects: [] as string[] }
        if (storage instanceof ObsidianStorage) {
          todosFolderMigration = storage.migrateTodosFolder()
        }

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              sqlite: sqliteMigrated ? {
                notes: migratedNotes,
                todos: migratedTodos,
                total: migratedNotes + migratedTodos,
                source: 'sqlite (~/.logbook/logbook.db)',
              } : 'No se encontro base de datos SQLite',
              todosConsolidation: {
                migrated: todosFolderMigration.migrated,
                projects: todosFolderMigration.projects,
              },
              destination: process.env.LOGBOOK_DIR,
            }),
          }],
        }
      } catch (err: unknown) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: `Error migrando: ${err instanceof Error ? err.message : String(err)}` }],
        }
      }
    },
  )
}
