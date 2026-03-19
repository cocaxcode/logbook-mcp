import type Database from 'better-sqlite3'
import type {
  NoteWithMeta,
  Repo,
  TodoWithMeta,
  Topic,
} from '../types.js'

// ── Repos ──

export function insertRepo(
  db: Database.Database,
  name: string,
  path: string,
): Repo {
  const stmt = db.prepare(
    'INSERT INTO repos (name, path) VALUES (?, ?)',
  )
  const result = stmt.run(name, path)
  return db
    .prepare('SELECT * FROM repos WHERE id = ?')
    .get(result.lastInsertRowid) as Repo
}

export function getRepoByPath(
  db: Database.Database,
  path: string,
): Repo | undefined {
  return db
    .prepare('SELECT * FROM repos WHERE path = ?')
    .get(path) as Repo | undefined
}

export function getRepoByName(
  db: Database.Database,
  name: string,
): Repo | undefined {
  return db
    .prepare('SELECT * FROM repos WHERE name = ?')
    .get(name) as Repo | undefined
}

export function getAllRepos(db: Database.Database): Repo[] {
  return db.prepare('SELECT * FROM repos ORDER BY name').all() as Repo[]
}

// ── Topics ──

export function getTopicByName(
  db: Database.Database,
  name: string,
): Topic | undefined {
  return db
    .prepare('SELECT * FROM topics WHERE name = ?')
    .get(name) as Topic | undefined
}

export function getAllTopics(db: Database.Database): Topic[] {
  return db
    .prepare('SELECT * FROM topics ORDER BY is_custom, name')
    .all() as Topic[]
}

export function insertTopic(
  db: Database.Database,
  name: string,
  description?: string,
): Topic {
  const stmt = db.prepare(
    'INSERT INTO topics (name, description, is_custom) VALUES (?, ?, 1)',
  )
  const result = stmt.run(name, description ?? null)
  return db
    .prepare('SELECT * FROM topics WHERE id = ?')
    .get(result.lastInsertRowid) as Topic
}

// ── Notes ──

const NOTE_WITH_META_SQL = `
  SELECT n.*, r.name as repo_name, t.name as topic_name
  FROM notes n
  LEFT JOIN repos r ON n.repo_id = r.id
  LEFT JOIN topics t ON n.topic_id = t.id
`

export function insertNote(
  db: Database.Database,
  repoId: number | null,
  topicId: number | null,
  content: string,
): NoteWithMeta {
  const stmt = db.prepare(
    'INSERT INTO notes (repo_id, topic_id, content) VALUES (?, ?, ?)',
  )
  const result = stmt.run(repoId, topicId, content)
  return db
    .prepare(`${NOTE_WITH_META_SQL} WHERE n.id = ?`)
    .get(result.lastInsertRowid) as NoteWithMeta
}

export function getNotes(
  db: Database.Database,
  filters: {
    repoId?: number
    topicId?: number
    from?: string
    to?: string
    limit?: number
  } = {},
): NoteWithMeta[] {
  const conditions: string[] = []
  const params: (string | number)[] = []

  if (filters.repoId !== undefined) {
    conditions.push('n.repo_id = ?')
    params.push(filters.repoId)
  }
  if (filters.topicId !== undefined) {
    conditions.push('n.topic_id = ?')
    params.push(filters.topicId)
  }
  if (filters.from) {
    conditions.push('n.created_at >= ?')
    params.push(filters.from)
  }
  if (filters.to) {
    conditions.push('n.created_at < ?')
    params.push(filters.to)
  }

  const where = conditions.length
    ? ` WHERE ${conditions.join(' AND ')}`
    : ''
  const limit = filters.limit ?? 100

  return db
    .prepare(
      `${NOTE_WITH_META_SQL}${where} ORDER BY n.created_at DESC LIMIT ?`,
    )
    .all(...params, limit) as NoteWithMeta[]
}

// ── TODOs ──

const TODO_WITH_META_SQL = `
  SELECT t.*, r.name as repo_name, tp.name as topic_name, 'manual' as source
  FROM todos t
  LEFT JOIN repos r ON t.repo_id = r.id
  LEFT JOIN topics tp ON t.topic_id = tp.id
`

export function insertTodo(
  db: Database.Database,
  repoId: number | null,
  topicId: number | null,
  content: string,
  priority: string = 'normal',
  remindAt?: string,
  remindPattern?: string,
): TodoWithMeta {
  const stmt = db.prepare(
    'INSERT INTO todos (repo_id, topic_id, content, priority, remind_at, remind_pattern) VALUES (?, ?, ?, ?, ?, ?)',
  )
  const result = stmt.run(repoId, topicId, content, priority, remindAt ?? null, remindPattern ?? null)
  return db
    .prepare(`${TODO_WITH_META_SQL} WHERE t.id = ?`)
    .get(result.lastInsertRowid) as TodoWithMeta
}

export function getTodos(
  db: Database.Database,
  filters: {
    status?: string
    repoId?: number
    topicId?: number
    priority?: string
    from?: string
    to?: string
    limit?: number
  } = {},
): TodoWithMeta[] {
  const conditions: string[] = []
  const params: (string | number)[] = []

  if (filters.status && filters.status !== 'all') {
    conditions.push('t.status = ?')
    params.push(filters.status)
  }
  if (filters.repoId !== undefined) {
    conditions.push('t.repo_id = ?')
    params.push(filters.repoId)
  }
  if (filters.topicId !== undefined) {
    conditions.push('t.topic_id = ?')
    params.push(filters.topicId)
  }
  if (filters.priority) {
    conditions.push('t.priority = ?')
    params.push(filters.priority)
  }
  if (filters.from) {
    conditions.push('t.created_at >= ?')
    params.push(filters.from)
  }
  if (filters.to) {
    conditions.push('t.created_at < ?')
    params.push(filters.to)
  }

  const where = conditions.length
    ? ` WHERE ${conditions.join(' AND ')}`
    : ''
  const limit = filters.limit ?? 100

  return db
    .prepare(
      `${TODO_WITH_META_SQL}${where} ORDER BY t.created_at DESC LIMIT ?`,
    )
    .all(...params, limit) as TodoWithMeta[]
}

export function updateTodoStatus(
  db: Database.Database,
  ids: number[],
  status: 'pending' | 'done',
): TodoWithMeta[] {
  if (ids.length === 0) return []

  const completedAt = status === 'done' ? new Date().toISOString() : null
  const placeholders = ids.map(() => '?').join(',')

  db.prepare(
    `UPDATE todos SET status = ?, completed_at = ? WHERE id IN (${placeholders})`,
  ).run(status, completedAt, ...ids)

  return db
    .prepare(
      `${TODO_WITH_META_SQL} WHERE t.id IN (${placeholders})`,
    )
    .all(...ids) as TodoWithMeta[]
}

export function updateTodo(
  db: Database.Database,
  id: number,
  fields: { content?: string; topicId?: number; priority?: string },
): TodoWithMeta | undefined {
  const sets: string[] = []
  const params: (string | number)[] = []

  if (fields.content !== undefined) {
    sets.push('content = ?')
    params.push(fields.content)
  }
  if (fields.topicId !== undefined) {
    sets.push('topic_id = ?')
    params.push(fields.topicId)
  }
  if (fields.priority !== undefined) {
    sets.push('priority = ?')
    params.push(fields.priority)
  }

  if (sets.length === 0) return undefined

  params.push(id)
  db.prepare(`UPDATE todos SET ${sets.join(', ')} WHERE id = ?`).run(
    ...params,
  )

  return db
    .prepare(`${TODO_WITH_META_SQL} WHERE t.id = ?`)
    .get(id) as TodoWithMeta | undefined
}

export function deleteTodos(
  db: Database.Database,
  ids: number[],
): number[] {
  if (ids.length === 0) return []

  const placeholders = ids.map(() => '?').join(',')
  const existing = db
    .prepare(`SELECT id FROM todos WHERE id IN (${placeholders})`)
    .all(...ids) as { id: number }[]

  const existingIds = existing.map((r) => r.id)
  if (existingIds.length > 0) {
    const ep = existingIds.map(() => '?').join(',')
    db.prepare(`DELETE FROM todos WHERE id IN (${ep})`).run(
      ...existingIds,
    )
  }
  return existingIds
}

// ── Search (FTS5) ──

export function searchNotes(
  db: Database.Database,
  query: string,
  filters: { repoId?: number; topicId?: number; limit?: number } = {},
): NoteWithMeta[] {
  const conditions: string[] = ['notes_fts MATCH ?']
  const params: (string | number)[] = [sanitizeFts(query)]

  if (filters.repoId !== undefined) {
    conditions.push('n.repo_id = ?')
    params.push(filters.repoId)
  }
  if (filters.topicId !== undefined) {
    conditions.push('n.topic_id = ?')
    params.push(filters.topicId)
  }

  const limit = filters.limit ?? 20
  const where = conditions.join(' AND ')

  return db
    .prepare(
      `SELECT n.*, r.name as repo_name, t.name as topic_name, rank
       FROM notes_fts
       JOIN notes n ON n.id = notes_fts.rowid
       LEFT JOIN repos r ON n.repo_id = r.id
       LEFT JOIN topics t ON n.topic_id = t.id
       WHERE ${where}
       ORDER BY rank
       LIMIT ?`,
    )
    .all(...params, limit) as NoteWithMeta[]
}

export function searchTodos(
  db: Database.Database,
  query: string,
  filters: { repoId?: number; topicId?: number; limit?: number } = {},
): TodoWithMeta[] {
  const conditions: string[] = ['todos_fts MATCH ?']
  const params: (string | number)[] = [sanitizeFts(query)]

  if (filters.repoId !== undefined) {
    conditions.push('t.repo_id = ?')
    params.push(filters.repoId)
  }
  if (filters.topicId !== undefined) {
    conditions.push('t.topic_id = ?')
    params.push(filters.topicId)
  }

  const limit = filters.limit ?? 20
  const where = conditions.join(' AND ')

  return db
    .prepare(
      `SELECT t.*, r.name as repo_name, tp.name as topic_name, 'manual' as source, rank
       FROM todos_fts
       JOIN todos t ON t.id = todos_fts.rowid
       LEFT JOIN repos r ON t.repo_id = r.id
       LEFT JOIN topics tp ON t.topic_id = tp.id
       WHERE ${where}
       ORDER BY rank
       LIMIT ?`,
    )
    .all(...params, limit) as TodoWithMeta[]
}

// ── Log (completed todos) ──

export function getCompletedTodos(
  db: Database.Database,
  filters: {
    repoId?: number
    topicId?: number
    from?: string
    to?: string
  } = {},
): TodoWithMeta[] {
  const conditions: string[] = ["t.status = 'done'"]
  const params: (string | number)[] = []

  if (filters.repoId !== undefined) {
    conditions.push('t.repo_id = ?')
    params.push(filters.repoId)
  }
  if (filters.topicId !== undefined) {
    conditions.push('t.topic_id = ?')
    params.push(filters.topicId)
  }
  if (filters.from) {
    conditions.push('t.completed_at >= ?')
    params.push(filters.from)
  }
  if (filters.to) {
    conditions.push('t.completed_at < ?')
    params.push(filters.to)
  }

  const where = conditions.join(' AND ')

  return db
    .prepare(
      `${TODO_WITH_META_SQL} WHERE ${where} ORDER BY t.completed_at DESC`,
    )
    .all(...params) as TodoWithMeta[]
}

// ── Reminders ──

export interface ReminderGroup {
  repo_name: string | null
  reminders: TodoWithMeta[]
}

export function getDueReminders(db: Database.Database): {
  today: ReminderGroup[]
  overdue: ReminderGroup[]
  recurring: ReminderGroup[]
} | null {
  const now = new Date()
  const today = now.toISOString().split('T')[0]
  const tomorrow = new Date(now.getTime() + 86400000).toISOString().split('T')[0]

  // Fixed date reminders for today
  const todayItems = db
    .prepare(
      `${TODO_WITH_META_SQL} WHERE t.status = 'pending' AND t.remind_at >= ? AND t.remind_at < ? ORDER BY t.remind_at`,
    )
    .all(today, tomorrow) as TodoWithMeta[]

  // Overdue fixed date reminders
  const overdueItems = db
    .prepare(
      `${TODO_WITH_META_SQL} WHERE t.status = 'pending' AND t.remind_at IS NOT NULL AND t.remind_at < ? AND t.remind_pattern IS NULL ORDER BY t.remind_at`,
    )
    .all(today) as TodoWithMeta[]

  // Recurring reminders: check if pattern matches today
  const recurringAll = db
    .prepare(
      `${TODO_WITH_META_SQL} WHERE t.remind_pattern IS NOT NULL AND (t.remind_last_done IS NULL OR t.remind_last_done < ?)`,
    )
    .all(today) as TodoWithMeta[]

  const recurringToday = recurringAll.filter((r) => matchesPattern(r.remind_pattern!, now))

  const hasAny = todayItems.length > 0 || overdueItems.length > 0 || recurringToday.length > 0
  if (!hasAny) return null

  return {
    today: groupByRepo(todayItems),
    overdue: groupByRepo(overdueItems),
    recurring: groupByRepo(recurringToday),
  }
}

// Mark recurring reminder as done for today (resets next matching day)
export function ackRecurringReminder(db: Database.Database, id: number): void {
  const today = new Date().toISOString().split('T')[0]
  db.prepare('UPDATE todos SET remind_last_done = ? WHERE id = ?').run(today, id)
}

/**
 * Pattern matching for recurring reminders:
 *   daily              → every day
 *   weekdays           → Monday to Friday
 *   weekly:1           → every Monday (1=Mon, 7=Sun)
 *   weekly:2,4         → every Tuesday and Thursday
 *   monthly:1          → 1st of each month
 *   monthly:1,15       → 1st and 15th of each month
 */
function matchesPattern(pattern: string, date: Date): boolean {
  const dayOfWeek = date.getDay() // 0=Sun, 1=Mon, ..., 6=Sat
  const dayOfMonth = date.getDate()

  if (pattern === 'daily') return true

  if (pattern === 'weekdays') return dayOfWeek >= 1 && dayOfWeek <= 5

  if (pattern.startsWith('weekly:')) {
    const days = pattern.slice(7).split(',').map(Number)
    // Convert: 1=Mon..7=Sun to JS 0=Sun..6=Sat
    return days.some((d) => (d % 7) === dayOfWeek)
  }

  if (pattern.startsWith('monthly:')) {
    const days = pattern.slice(8).split(',').map(Number)
    return days.includes(dayOfMonth)
  }

  return false
}

function groupByRepo(items: TodoWithMeta[]): ReminderGroup[] {
  const map = new Map<string, TodoWithMeta[]>()
  for (const item of items) {
    const key = item.repo_name ?? 'global'
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(item)
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([repo_name, reminders]) => ({
      repo_name: repo_name === 'global' ? null : repo_name,
      reminders,
    }))
}

// ── Topic resolution (auto-create) ──

export function resolveTopicId(
  db: Database.Database,
  name: string,
): number {
  const existing = getTopicByName(db, name)
  if (existing) return existing.id

  const normalized = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
  if (!normalized) return getTopicByName(db, 'chore')!.id

  const existingNorm = getTopicByName(db, normalized)
  if (existingNorm) return existingNorm.id

  const created = insertTopic(db, normalized)
  return created.id
}

// ── Code TODO Sync ──

export interface CodeTodoSnapshot {
  id: number
  repo_id: number
  file: string
  line: number
  tag: string
  content: string
  topic_name: string
  first_seen_at: string
  resolved_at: string | null
}

export function syncCodeTodos(
  db: Database.Database,
  repoId: number,
  currentTodos: { file: string; content: string; tag: string; topic_name: string; line: number }[],
): { added: number; resolved: number } {
  const sync = db.transaction(() => {
    // Get all unresolved snapshots for this repo
    const existing = db
      .prepare('SELECT * FROM code_todo_snapshots WHERE repo_id = ? AND resolved_at IS NULL')
      .all(repoId) as CodeTodoSnapshot[]

    // Build a set of current code TODOs (file+content as key)
    const currentSet = new Set(currentTodos.map((t) => `${t.file}::${t.content}`))

    // Mark resolved: existed before but not in current scan
    let resolved = 0
    for (const snap of existing) {
      const key = `${snap.file}::${snap.content}`
      if (!currentSet.has(key)) {
        db.prepare('UPDATE code_todo_snapshots SET resolved_at = datetime(\'now\') WHERE id = ?')
          .run(snap.id)
        resolved++
      }
    }

    // Build set of existing keys
    const existingSet = new Set(existing.map((s) => `${s.file}::${s.content}`))

    // Also include already-resolved ones to avoid re-inserting
    const allSnapshots = db
      .prepare('SELECT file, content FROM code_todo_snapshots WHERE repo_id = ?')
      .all(repoId) as { file: string; content: string }[]
    const allSet = new Set(allSnapshots.map((s) => `${s.file}::${s.content}`))

    // Add new: in current scan but never seen before
    let added = 0
    for (const todo of currentTodos) {
      const key = `${todo.file}::${todo.content}`
      if (!allSet.has(key)) {
        db.prepare(
          'INSERT INTO code_todo_snapshots (repo_id, file, line, tag, content, topic_name) VALUES (?, ?, ?, ?, ?, ?)',
        ).run(repoId, todo.file, todo.line, todo.tag, todo.content, todo.topic_name)
        added++
      } else if (existingSet.has(key)) {
        // Update line number if the TODO moved
        db.prepare('UPDATE code_todo_snapshots SET line = ? WHERE repo_id = ? AND file = ? AND content = ? AND resolved_at IS NULL')
          .run(todo.line, repoId, todo.file, todo.content)
      }
    }

    return { added, resolved }
  })

  return sync()
}

export function getResolvedCodeTodos(
  db: Database.Database,
  repoId: number,
  from?: string,
  to?: string,
): CodeTodoSnapshot[] {
  const conditions = ['repo_id = ?', 'resolved_at IS NOT NULL']
  const params: (string | number)[] = [repoId]

  if (from) {
    conditions.push('resolved_at >= ?')
    params.push(from)
  }
  if (to) {
    conditions.push('resolved_at < ?')
    params.push(to)
  }

  return db
    .prepare(`SELECT * FROM code_todo_snapshots WHERE ${conditions.join(' AND ')} ORDER BY resolved_at DESC`)
    .all(...params) as CodeTodoSnapshot[]
}

// ── Utils ──

function sanitizeFts(query: string): string {
  const words = query
    .replace(/\0/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.replace(/"/g, ''))
    .filter(Boolean)

  if (words.length === 0) return '""'

  return words.map((word) => `"${word}"`).join(' ')
}
