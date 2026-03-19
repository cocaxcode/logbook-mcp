import Database from 'better-sqlite3'
import { SCHEMA_SQL, SEED_TOPICS_SQL } from '../db/schema.js'

export function createTestDb(): Database.Database {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  db.exec(SCHEMA_SQL)
  db.exec(SEED_TOPICS_SQL)
  return db
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
