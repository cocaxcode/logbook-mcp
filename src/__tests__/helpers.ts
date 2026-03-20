import Database from 'better-sqlite3'
import {
  MIGRATIONS_SQL,
  POST_MIGRATION_SQL,
  SCHEMA_SQL,
  SEED_TOPICS_SQL,
} from '../db/schema.js'

export function createTestDb(): Database.Database {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  db.exec(SCHEMA_SQL)
  db.exec(SEED_TOPICS_SQL)
  return db
}

/**
 * Creates a DB with the old schema (pre-v0.4.0) — no remind_at/remind_pattern/remind_last_done columns,
 * no reminder topic. Used to test that migrations work correctly on existing installations.
 */
export function createLegacyTestDb(): Database.Database {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')

  // Old schema: todos table WITHOUT reminder columns
  db.exec(`
    CREATE TABLE IF NOT EXISTS repos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      path TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS topics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      commit_prefix TEXT,
      is_custom INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      repo_id INTEGER REFERENCES repos(id) ON DELETE SET NULL,
      topic_id INTEGER REFERENCES topics(id) ON DELETE SET NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS todos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      repo_id INTEGER REFERENCES repos(id) ON DELETE SET NULL,
      topic_id INTEGER REFERENCES topics(id) ON DELETE SET NULL,
      content TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      priority TEXT NOT NULL DEFAULT 'normal',
      completed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS code_todo_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      repo_id INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
      file TEXT NOT NULL,
      line INTEGER NOT NULL,
      tag TEXT NOT NULL,
      content TEXT NOT NULL,
      topic_name TEXT NOT NULL,
      first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
      resolved_at TEXT,
      UNIQUE(repo_id, file, content)
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(content, content='notes', content_rowid='id');
    CREATE VIRTUAL TABLE IF NOT EXISTS todos_fts USING fts5(content, content='todos', content_rowid='id');
    CREATE TRIGGER IF NOT EXISTS notes_ai AFTER INSERT ON notes BEGIN
      INSERT INTO notes_fts(rowid, content) VALUES (new.id, new.content);
    END;
    CREATE TRIGGER IF NOT EXISTS todos_ai AFTER INSERT ON todos BEGIN
      INSERT INTO todos_fts(rowid, content) VALUES (new.id, new.content);
    END;
  `)

  // Old seed: only 6 topics (no reminder)
  db.exec(`
    INSERT OR IGNORE INTO topics (name, description, commit_prefix, is_custom) VALUES
      ('feature', 'Funcionalidad nueva', 'feat', 0),
      ('fix', 'Corrección de errores', 'fix', 0),
      ('chore', 'Mantenimiento general', 'refactor,docs,ci,build,chore,test,perf', 0),
      ('idea', 'Ideas y propuestas futuras', NULL, 0),
      ('decision', 'Decisiones tomadas', NULL, 0),
      ('blocker', 'Bloqueos activos', NULL, 0);
  `)

  return db
}

/**
 * Applies migrations safely (same logic as connection.ts) to a legacy DB.
 */
export function applyMigrations(db: Database.Database): void {
  for (const stmt of MIGRATIONS_SQL.split(';').map((s) => s.trim()).filter(Boolean)) {
    try {
      db.exec(stmt)
    } catch {
      // Column already exists — safe to ignore
    }
  }
  db.exec(POST_MIGRATION_SQL)
  db.exec(SEED_TOPICS_SQL)
}

export function seedRepo(
  db: Database.Database,
  name = 'test-repo',
  path = '/test/repo',
): number {
  return Number(
    db
      .prepare('INSERT INTO repos (name, path) VALUES (?, ?)')
      .run(name, path).lastInsertRowid,
  )
}

export function seedNote(
  db: Database.Database,
  repoId: number,
  topicId: number,
  content = 'Test note',
): number {
  return Number(
    db
      .prepare(
        'INSERT INTO notes (repo_id, topic_id, content) VALUES (?, ?, ?)',
      )
      .run(repoId, topicId, content).lastInsertRowid,
  )
}

export function seedTodo(
  db: Database.Database,
  repoId: number,
  topicId: number,
  content = 'Test todo',
  priority = 'normal',
): number {
  return Number(
    db
      .prepare(
        'INSERT INTO todos (repo_id, topic_id, content, priority) VALUES (?, ?, ?, ?)',
      )
      .run(repoId, topicId, content, priority).lastInsertRowid,
  )
}

export function getTopicId(db: Database.Database, name: string): number {
  return (
    db.prepare('SELECT id FROM topics WHERE name = ?').get(name) as {
      id: number
    }
  ).id
}
