export const SCHEMA_SQL = `
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
  remind_at TEXT,
  remind_pattern TEXT,
  remind_last_done TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_notes_repo ON notes(repo_id);
CREATE INDEX IF NOT EXISTS idx_notes_topic ON notes(topic_id);
CREATE INDEX IF NOT EXISTS idx_notes_date ON notes(created_at);
CREATE INDEX IF NOT EXISTS idx_todos_repo ON todos(repo_id);
CREATE INDEX IF NOT EXISTS idx_todos_topic ON todos(topic_id);
CREATE INDEX IF NOT EXISTS idx_todos_status ON todos(status);
CREATE INDEX IF NOT EXISTS idx_todos_date ON todos(created_at);
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

CREATE INDEX IF NOT EXISTS idx_code_snapshots_repo ON code_todo_snapshots(repo_id);
CREATE INDEX IF NOT EXISTS idx_code_snapshots_resolved ON code_todo_snapshots(resolved_at);

CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
  content,
  content='notes',
  content_rowid='id'
);

CREATE VIRTUAL TABLE IF NOT EXISTS todos_fts USING fts5(
  content,
  content='todos',
  content_rowid='id'
);

CREATE TRIGGER IF NOT EXISTS notes_ai AFTER INSERT ON notes BEGIN
  INSERT INTO notes_fts(rowid, content) VALUES (new.id, new.content);
END;
CREATE TRIGGER IF NOT EXISTS notes_ad AFTER DELETE ON notes BEGIN
  INSERT INTO notes_fts(notes_fts, rowid, content) VALUES ('delete', old.id, old.content);
END;
CREATE TRIGGER IF NOT EXISTS notes_au AFTER UPDATE ON notes BEGIN
  INSERT INTO notes_fts(notes_fts, rowid, content) VALUES ('delete', old.id, old.content);
  INSERT INTO notes_fts(rowid, content) VALUES (new.id, new.content);
END;

CREATE TRIGGER IF NOT EXISTS todos_ai AFTER INSERT ON todos BEGIN
  INSERT INTO todos_fts(rowid, content) VALUES (new.id, new.content);
END;
CREATE TRIGGER IF NOT EXISTS todos_ad AFTER DELETE ON todos BEGIN
  INSERT INTO todos_fts(todos_fts, rowid, content) VALUES ('delete', old.id, old.content);
END;
CREATE TRIGGER IF NOT EXISTS todos_au AFTER UPDATE ON todos BEGIN
  INSERT INTO todos_fts(todos_fts, rowid, content) VALUES ('delete', old.id, old.content);
  INSERT INTO todos_fts(rowid, content) VALUES (new.id, new.content);
END;
`

export const MIGRATIONS_SQL = `
-- Add reminder columns to existing todos tables (safe to run multiple times)
ALTER TABLE todos ADD COLUMN remind_at TEXT;
ALTER TABLE todos ADD COLUMN remind_pattern TEXT;
ALTER TABLE todos ADD COLUMN remind_last_done TEXT;
`

export const POST_MIGRATION_SQL = `
CREATE INDEX IF NOT EXISTS idx_todos_remind ON todos(remind_at);
`

export const SEED_TOPICS_SQL = `
INSERT OR IGNORE INTO topics (name, description, commit_prefix, is_custom) VALUES
  ('feature', 'Funcionalidad nueva', 'feat', 0),
  ('fix', 'Corrección de errores', 'fix', 0),
  ('chore', 'Mantenimiento general', 'refactor,docs,ci,build,chore,test,perf', 0),
  ('idea', 'Ideas y propuestas futuras', NULL, 0),
  ('decision', 'Decisiones tomadas', NULL, 0),
  ('blocker', 'Bloqueos activos', NULL, 0),
  ('reminder', 'Recordatorios con fecha', NULL, 0);
`
