import { existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import type { LogbookConfig } from './config.js'
import { getBaseDir } from './config.js'

interface MigrationMarker {
  migratedAt: string
  notes: number
  todos: number
}

function getMarkerPath(): string {
  return join(getBaseDir(), '.migrated')
}

function hasMarker(): boolean {
  return existsSync(getMarkerPath())
}

function writeMarker(notes: number, todos: number): void {
  const marker: MigrationMarker = {
    migratedAt: new Date().toISOString(),
    notes,
    todos,
  }
  const dir = dirname(getMarkerPath())
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(getMarkerPath(), JSON.stringify(marker, null, 2), 'utf-8')
}

function getSqliteDbPath(): string {
  return join(getBaseDir(), 'logbook.db')
}

/**
 * Check if auto-migration is needed and run it.
 * Condition: storage=obsidian AND SQLite DB exists with data AND no .migrated marker.
 */
export async function checkAndMigrate(config: LogbookConfig): Promise<void> {
  // Already migrated?
  if (hasMarker()) return

  // SQLite DB exists?
  const dbPath = getSqliteDbPath()
  if (!existsSync(dbPath)) return

  // Check if DB has data
  let noteCount = 0
  let todoCount = 0
  try {
    const { default: Database } = await import('better-sqlite3')
    const db = new Database(dbPath, { readonly: true })
    try {
      noteCount = (db.prepare('SELECT COUNT(*) as c FROM notes').get() as { c: number }).c
      todoCount = (db.prepare('SELECT COUNT(*) as c FROM todos').get() as { c: number }).c
    } finally {
      db.close()
    }
  } catch {
    // DB doesn't exist, is corrupt, or tables don't exist — skip migration
    return
  }

  if (noteCount === 0 && todoCount === 0) {
    writeMarker(0, 0)
    return
  }

  // Migrate!
  console.error(`logbook-mcp: auto-migrating ${noteCount} notes + ${todoCount} todos from sqlite to obsidian...`)

  try {
    const { default: Database } = await import('better-sqlite3')
    const { ObsidianStorage } = await import('./storage/obsidian/index.js')

    const db = new Database(dbPath, { readonly: true })
    const obsidian = new ObsidianStorage(config.dir!)

    let migratedNotes = 0
    let migratedTodos = 0

    try {
      // Migrate notes
      const notes = db.prepare(`
        SELECT n.content, t.name as topic_name
        FROM notes n
        LEFT JOIN topics t ON n.topic_id = t.id
        ORDER BY n.created_at
      `).all() as Array<{ content: string; topic_name: string | null }>

      for (const note of notes) {
        try {
          obsidian.insertNote(note.content, note.topic_name || undefined)
          migratedNotes++
        } catch {
          // Skip failed entries
        }
      }

      // Migrate todos
      const todos = db.prepare(`
        SELECT td.content, td.status, td.priority, td.remind_at, td.remind_pattern, t.name as topic_name
        FROM todos td
        LEFT JOIN topics t ON td.topic_id = t.id
        ORDER BY td.created_at
      `).all() as Array<{
        content: string
        status: string
        priority: string
        remind_at: string | null
        remind_pattern: string | null
        topic_name: string | null
      }>

      for (const todo of todos) {
        try {
          const entry = obsidian.insertTodo(todo.content, {
            topic: todo.topic_name || undefined,
            priority: todo.priority as 'low' | 'normal' | 'high' | 'urgent',
            remind_at: todo.remind_at || undefined,
            remind_pattern: todo.remind_pattern || undefined,
          })

          if (todo.status === 'done') {
            obsidian.updateTodoStatus([entry.id], 'done')
          }

          migratedTodos++
        } catch {
          // Skip failed entries
        }
      }
    } finally {
      db.close()
    }

    writeMarker(migratedNotes, migratedTodos)
    console.error(`logbook-mcp: auto-migration complete (${migratedNotes} notes, ${migratedTodos} todos)`)
  } catch (err) {
    console.error(`logbook-mcp: auto-migration failed: ${err instanceof Error ? err.message : String(err)}`)
    // Don't write marker on failure — will retry next startup
  }
}
