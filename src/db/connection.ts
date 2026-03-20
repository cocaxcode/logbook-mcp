import Database from 'better-sqlite3'
import { existsSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  MIGRATIONS_SQL,
  POST_MIGRATION_SQL,
  SCHEMA_SQL,
  SEED_TOPICS_SQL,
} from './schema.js'

const DB_DIR = join(homedir(), '.logbook')
const DB_PATH = join(DB_DIR, 'logbook.db')

let db: Database.Database | null = null

export function getDb(dbPath?: string): Database.Database {
  if (db) return db

  const path = dbPath ?? DB_PATH
  const dir = dirname(path)

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(SCHEMA_SQL)

  // Run migrations safely (ignore "duplicate column" errors for existing DBs)
  for (const stmt of MIGRATIONS_SQL.split(';').map((s) => s.trim()).filter(Boolean)) {
    try {
      db.exec(stmt)
    } catch {
      // Column already exists — safe to ignore
    }
  }

  // Create indexes that depend on migration columns
  db.exec(POST_MIGRATION_SQL)

  db.exec(SEED_TOPICS_SQL)

  return db
}

export function closeDb(): void {
  if (db) {
    db.close()
    db = null
  }
}
