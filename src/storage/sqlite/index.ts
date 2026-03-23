import type { CodeTodo } from '../../types.js'
import { getDb } from '../../db/connection.js'
import {
  insertRepo,
  getRepoByPath,
  getRepoByName,
  getAllTopics,
  insertTopic as dbInsertTopic,
  getTopicByName,
  resolveTopicId,
  insertNote as dbInsertNote,
  getNotes as dbGetNotes,
  searchNotes,
  insertTodo as dbInsertTodo,
  getTodos as dbGetTodos,
  updateTodoStatus as dbUpdateTodoStatus,
  updateTodo as dbUpdateTodo,
  deleteTodos as dbDeleteTodos,
  searchTodos,
  getCompletedTodos,
  getDueReminders as dbGetDueReminders,
  ackRecurringReminder as dbAckRecurringReminder,
  getResolvedCodeTodos,
  syncCodeTodos as dbSyncCodeTodos,
} from '../../db/queries.js'
import { detectRepoPath } from '../../git/detect-repo.js'
import { scanCodeTodos } from '../../git/code-todos.js'
import { basename } from 'node:path'
import type {
  StorageBackend,
  RepoInfo,
  WorkspaceInfo,
  NoteEntry,
  NoteFilters,
  TodoEntry,
  TodoFilters,
  TodoOpts,
  TodoUpdateFields,
  StandupEntry,
  DecisionEntry,
  DebugEntry,
  SearchResult,
  SearchFilters,
  LogEntry,
  LogFilters,
  ReminderResult,
  TagResult,
  TimelineFilters,
  TimelineEntry,
  TopicInfo,
  EntryId,
  InboxItem,
  ReviewEntry,
} from '../types.js'

// ── Helpers ──

function toEntryId(id: number): EntryId {
  return String(id)
}

function toNumericId(id: EntryId): number {
  return Number(id)
}

function detectWorkspaceFromPath(repoPath: string | null): WorkspaceInfo {
  if (!repoPath) {
    return {
      workspace: process.env.LOGBOOK_WORKSPACE || 'default',
      project: 'global',
    }
  }

  const normalized = repoPath.replace(/\\/g, '/')
  const project = basename(normalized)

  // Heuristica: buscar /projects/ en el path
  const projectsIdx = normalized.toLowerCase().indexOf('/projects/')
  if (projectsIdx !== -1) {
    const before = normalized.slice(0, projectsIdx)
    const workspace = basename(before)
    return { workspace, project }
  }

  // Fallback: directorio padre
  const parts = normalized.split('/')
  const workspace = parts.length >= 2 ? parts[parts.length - 2] : process.env.LOGBOOK_WORKSPACE || 'default'
  return { workspace, project }
}

function todayDate(): string {
  return new Date().toISOString().split('T')[0]
}

// ── SqliteStorage ──

export class SqliteStorage implements StorageBackend {
  private repoPath: string | null = null
  private repoId: number | null = null

  // ── Repos ──

  autoRegisterRepo(): RepoInfo | null {
    const db = getDb()
    this.repoPath = detectRepoPath()
    if (!this.repoPath) return null

    const existing = getRepoByPath(db, this.repoPath)
    if (existing) {
      this.repoId = existing.id
      return { id: toEntryId(existing.id), name: existing.name, path: existing.path }
    }

    let name = basename(this.repoPath)
    const nameConflict = getRepoByName(db, name)
    if (nameConflict) {
      const parts = this.repoPath.split('/')
      const parent = parts.length >= 2 ? parts[parts.length - 2] : 'repo'
      name = `${parent}-${name}`
    }

    const repo = insertRepo(db, name, this.repoPath)
    this.repoId = repo.id
    return { id: toEntryId(repo.id), name: repo.name, path: repo.path }
  }

  getWorkspace(): WorkspaceInfo {
    if (!this.repoPath) {
      this.repoPath = detectRepoPath()
    }
    return detectWorkspaceFromPath(this.repoPath)
  }

  // ── Notes ──

  insertNote(content: string, topic?: string): NoteEntry {
    const db = getDb()
    this.ensureRepo()
    const topicId = topic ? resolveTopicId(db, topic) : null
    const note = dbInsertNote(db, this.repoId, topicId, content)
    const ws = this.getWorkspace()

    return {
      id: toEntryId(note.id),
      type: 'note',
      date: note.created_at,
      project: ws.project,
      workspace: ws.workspace,
      topic: note.topic_name,
      tags: note.topic_name ? [note.topic_name] : [],
      content: note.content,
    }
  }

  getNotes(filters: NoteFilters): NoteEntry[] {
    const db = getDb()
    const ws = this.getWorkspace()
    const notes = dbGetNotes(db, {
      repoId: filters.repoId ? toNumericId(filters.repoId) : this.repoId ?? undefined,
      topicId: filters.topicId ? toNumericId(filters.topicId) : undefined,
      from: filters.from,
      to: filters.to,
      limit: filters.limit,
    })

    return notes.map((n) => ({
      id: toEntryId(n.id),
      type: 'note' as const,
      date: n.created_at,
      project: ws.project,
      workspace: ws.workspace,
      topic: n.topic_name,
      tags: n.topic_name ? [n.topic_name] : [],
      content: n.content,
    }))
  }

  // ── TODOs ──

  insertTodo(content: string, opts?: TodoOpts): TodoEntry {
    const db = getDb()
    this.ensureRepo()
    const topicId = opts?.topic ? resolveTopicId(db, opts.topic) : null
    const todo = dbInsertTodo(
      db,
      this.repoId,
      topicId,
      content,
      opts?.priority || 'normal',
      opts?.remind_at,
      opts?.remind_pattern,
    )
    const ws = this.getWorkspace()

    return this.todoToEntry(todo, ws)
  }

  getTodos(filters: TodoFilters): TodoEntry[] {
    const db = getDb()
    const ws = this.getWorkspace()
    const todos = dbGetTodos(db, {
      status: filters.status === 'all' ? undefined : (filters.status || 'pending'),
      repoId: filters.repoId ? toNumericId(filters.repoId) : (filters.status !== 'all' ? this.repoId ?? undefined : undefined),
      topicId: filters.topicId ? toNumericId(filters.topicId) : undefined,
      priority: filters.priority,
      from: filters.from,
      to: filters.to,
      limit: filters.limit,
    })

    return todos.map((t) => this.todoToEntry(t, ws))
  }

  updateTodoStatus(ids: EntryId[], status: 'pending' | 'done'): TodoEntry[] {
    const db = getDb()
    const ws = this.getWorkspace()
    const numericIds = ids.map(toNumericId)
    const todos = dbUpdateTodoStatus(db, numericIds, status)
    return todos.map((t) => this.todoToEntry(t, ws))
  }

  updateTodo(id: EntryId, fields: TodoUpdateFields): TodoEntry | null {
    const db = getDb()
    const ws = this.getWorkspace()
    const updateFields: { content?: string; topicId?: number; priority?: string } = {}

    if (fields.content !== undefined) updateFields.content = fields.content
    if (fields.topic !== undefined) updateFields.topicId = resolveTopicId(db, fields.topic)
    if (fields.priority !== undefined) updateFields.priority = fields.priority

    const todo = dbUpdateTodo(db, toNumericId(id), updateFields)
    if (!todo) return null
    return this.todoToEntry(todo, ws)
  }

  deleteTodos(ids: EntryId[]): EntryId[] {
    const db = getDb()
    const numericIds = ids.map(toNumericId)
    const deleted = dbDeleteTodos(db, numericIds)
    return deleted.map(toEntryId)
  }

  ackRecurringReminder(id: EntryId): void {
    const db = getDb()
    dbAckRecurringReminder(db, toNumericId(id))
  }

  // ── Specialized entries (stored as notes with topic in SQLite) ──

  insertStandup(yesterday: string, today: string, blockers: string, topic?: string): StandupEntry {
    const content = `## Yesterday\n${yesterday}\n\n## Today\n${today}\n\n## Blockers\n${blockers || 'Ninguno'}`
    const note = this.insertNote(content, topic || 'chore')

    return {
      ...note,
      type: 'standup',
      yesterday,
      today,
      blockers: blockers || 'Ninguno',
    }
  }

  insertDecision(title: string, context: string, options: string[], decision: string, consequences: string, topic?: string): DecisionEntry {
    const optionsList = options.map((o, i) => `${i + 1}. ${o}`).join('\n')
    const content = `# ${title}\n\n## Contexto\n${context}\n\n## Opciones\n${optionsList}\n\n## Decision\n${decision}\n\n## Consecuencias\n${consequences}`
    const note = this.insertNote(content, topic || 'decision')

    return {
      ...note,
      type: 'decision',
      title,
      context,
      options,
      decision,
      consequences,
    }
  }

  insertDebug(title: string, error: string, cause: string, fix: string, file?: string, topic?: string): DebugEntry {
    const fileLine = file ? `\n\n## Archivo\n${file}` : ''
    const content = `# ${title}\n\n## Error\n${error}\n\n## Causa\n${cause}\n\n## Fix\n${fix}${fileLine}`
    const note = this.insertNote(content, topic || 'fix')

    return {
      ...note,
      type: 'debug',
      title,
      error,
      cause,
      fix,
      attachment: file || null,
    }
  }

  // ── Search & queries ──

  search(query: string, filters: SearchFilters): SearchResult[] {
    const db = getDb()
    const ws = this.getWorkspace()
    const results: SearchResult[] = []

    const topicId = filters.topic ? this.resolveTopicSafe(db, filters.topic) : undefined
    const repoId = filters.scope === 'global' ? undefined : (this.repoId ?? undefined)

    if (!filters.type || filters.type === 'all' || filters.type === 'notes') {
      const notes = searchNotes(db, query, { repoId, topicId, limit: filters.limit })
      for (const n of notes) {
        results.push({
          type: 'note',
          data: {
            id: toEntryId(n.id),
            type: 'note',
            date: n.created_at,
            project: ws.project,
            workspace: ws.workspace,
            topic: n.topic_name,
            tags: n.topic_name ? [n.topic_name] : [],
            content: n.content,
          },
          rank: (n as unknown as { rank: number }).rank || 0,
        })
      }
    }

    if (!filters.type || filters.type === 'all' || filters.type === 'todos') {
      const todos = searchTodos(db, query, { repoId, topicId, limit: filters.limit })
      for (const t of todos) {
        results.push({
          type: 'todo',
          data: {
            id: toEntryId(t.id),
            type: 'todo',
            date: t.created_at,
            project: ws.project,
            workspace: ws.workspace,
            topic: t.topic_name,
            tags: t.topic_name ? [t.topic_name] : [],
            content: t.content,
          },
          rank: (t as unknown as { rank: number }).rank || 0,
        })
      }
    }

    return results.sort((a, b) => a.rank - b.rank)
  }

  getLog(filters: LogFilters): LogEntry[] {
    const db = getDb()
    const ws = this.getWorkspace()
    const { from, to } = this.resolveDates(filters)
    const topicId = filters.topic ? this.resolveTopicSafe(db, filters.topic) : undefined
    const repoId = filters.scope === 'global' ? undefined : (this.repoId ?? undefined)

    const entries: LogEntry[] = []

    if (!filters.type || filters.type === 'all' || filters.type === 'notes') {
      const notes = dbGetNotes(db, { repoId, topicId, from, to })
      for (const n of notes) {
        entries.push({
          type: 'note',
          data: {
            id: toEntryId(n.id),
            type: 'note',
            date: n.created_at,
            project: ws.project,
            workspace: ws.workspace,
            topic: n.topic_name,
            tags: n.topic_name ? [n.topic_name] : [],
            content: n.content,
          },
          timestamp: n.created_at,
        })
      }
    }

    if (!filters.type || filters.type === 'all' || filters.type === 'todos') {
      const todos = getCompletedTodos(db, { repoId, topicId, from, to })
      for (const t of todos) {
        entries.push({
          type: 'todo',
          data: {
            id: toEntryId(t.id),
            type: 'todo',
            date: t.created_at,
            project: ws.project,
            workspace: ws.workspace,
            topic: t.topic_name,
            tags: t.topic_name ? [t.topic_name] : [],
            content: t.content,
          },
          timestamp: t.completed_at || t.created_at,
        })
      }

      // Code TODOs resolved
      if (repoId) {
        const resolved = getResolvedCodeTodos(db, repoId, from, to)
        for (const r of resolved) {
          entries.push({
            type: 'code_todo_resolved',
            data: {
              id: toEntryId(r.id),
              type: 'todo',
              date: r.first_seen_at,
              project: ws.project,
              workspace: ws.workspace,
              topic: r.topic_name,
              tags: [r.topic_name],
              file: r.file,
              line: r.line,
              tag: r.tag,
              content: r.content,
            },
            timestamp: r.resolved_at || r.first_seen_at,
          })
        }
      }
    }

    return entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  }

  getDueReminders(_scope?: 'project' | 'workspace' | 'global'): ReminderResult | null {
    const db = getDb()
    const result = dbGetDueReminders(db)
    if (!result) return null

    const ws = this.getWorkspace()

    return {
      today: result.today.map((g) => ({
        repo_name: g.repo_name,
        reminders: g.reminders.map((r) => this.todoToEntry(r, ws)),
      })),
      overdue: result.overdue.map((g) => ({
        repo_name: g.repo_name,
        reminders: g.reminders.map((r) => this.todoToEntry(r, ws)),
      })),
      recurring: result.recurring.map((g) => ({
        repo_name: g.repo_name,
        reminders: g.reminders.map((r) => this.todoToEntry(r, ws)),
      })),
    }
  }

  getTags(filter?: string): TagResult[] {
    const db = getDb()
    const topics = getAllTopics(db)
    const results: TagResult[] = topics.map((t) => ({
      tag: t.name,
      count: 0, // SQLite mode: count not tracked per-tag
    }))

    if (filter) {
      return results.filter((r) => r.tag === filter)
    }
    return results
  }

  getTimeline(filters: TimelineFilters): TimelineEntry[] {
    // En SQLite, timeline usa getLog con scope global
    const logEntries = this.getLog({
      period: filters.period,
      from: filters.from,
      to: filters.to,
      scope: 'global',
    })

    return logEntries.map((e) => ({
      type: e.data.type as 'note' | 'todo' | 'decision' | 'debug' | 'standup',
      date: e.timestamp,
      workspace: e.data.workspace as string,
      project: e.data.project as string,
      summary: (e.data.content as string || '').slice(0, 100),
    }))
  }

  // ── Topics ──

  getTopics(): TopicInfo[] {
    const db = getDb()
    const topics = getAllTopics(db)
    return topics.map((t) => ({
      id: toEntryId(t.id),
      name: t.name,
      description: t.description,
      is_custom: t.is_custom === 1,
    }))
  }

  insertTopic(name: string, description?: string): TopicInfo {
    const db = getDb()
    const topic = dbInsertTopic(db, name, description)
    return {
      id: toEntryId(topic.id),
      name: topic.name,
      description: topic.description,
      is_custom: topic.is_custom === 1,
    }
  }

  // ── Code TODOs ──

  getCodeTodos(repoPath: string): CodeTodo[] {
    return scanCodeTodos(repoPath)
  }

  syncCodeTodos(_repoPath: string, todos: CodeTodo[]): { added: number; resolved: number } {
    const db = getDb()
    this.ensureRepo()
    if (!this.repoId) return { added: 0, resolved: 0 }
    return dbSyncCodeTodos(db, this.repoId, todos)
  }

  // ── Generic entry operations ──

  updateEntry(id: EntryId, fields: { content?: string; topic?: string; tags?: string[] }): import('../types.js').EntryMeta | null {
    const db = getDb()
    const ws = this.getWorkspace()
    // En SQLite, las entradas especializadas (decision, debug, standup) se almacenan como notas
    const updateFields: { content?: string; topicId?: number } = {}
    if (fields.content !== undefined) updateFields.content = fields.content
    if (fields.topic !== undefined) updateFields.topicId = resolveTopicId(db, fields.topic)

    const numericId = toNumericId(id)
    const stmt = db.prepare('SELECT id, content, topic_id, created_at FROM notes WHERE id = ?')
    const row = stmt.get(numericId) as { id: number; content: string; topic_id: number | null; created_at: string } | undefined
    if (!row) return null

    const sets: string[] = []
    const params: unknown[] = []
    if (updateFields.content !== undefined) { sets.push('content = ?'); params.push(updateFields.content) }
    if (updateFields.topicId !== undefined) { sets.push('topic_id = ?'); params.push(updateFields.topicId) }
    if (sets.length === 0) return null

    params.push(numericId)
    db.prepare(`UPDATE notes SET ${sets.join(', ')} WHERE id = ?`).run(...params)

    const topicName = fields.topic || null
    return {
      id: toEntryId(numericId),
      type: 'note',
      date: row.created_at,
      project: ws.project,
      workspace: ws.workspace,
      topic: topicName,
      tags: topicName ? [topicName] : [],
    }
  }

  deleteEntry(id: EntryId, _type: import('../types.js').EntryType): boolean {
    const db = getDb()
    const numericId = toNumericId(id)
    const result = db.prepare('DELETE FROM notes WHERE id = ?').run(numericId)
    return result.changes > 0
  }

  listEntries(type: import('../types.js').EntryType, filters?: { project?: string; topic?: string; from?: string; to?: string; limit?: number; scope?: 'project' | 'global'; workspace?: string }): import('../types.js').EntryMeta[] {
    const scope = filters?.scope ?? 'project'
    const repoId = scope === 'global' ? undefined : (this.repoId ?? undefined)

    if (type === 'todo') {
      // Para TODOs, usar getTodos
      const todos = this.getTodos({
        repoId: repoId != null ? String(repoId) : undefined,
        topicId: filters?.topic,
        from: filters?.from,
        to: filters?.to,
        limit: filters?.limit || 20,
      })
      return todos.map((t) => ({
        id: t.id, type: t.type, date: t.date,
        project: t.project, workspace: t.workspace,
        topic: t.topic, tags: t.tags,
      }))
    }

    // Para el resto (note, decision, debug, standup, review) — todas son notas en SQLite
    const notes = this.getNotes({
      repoId: repoId != null ? String(repoId) : undefined,
      topicId: filters?.topic,
      from: filters?.from,
      to: filters?.to,
      limit: filters?.limit || 20,
    })
    return notes.map((n) => ({
      id: n.id, type: 'note' as const, date: n.date,
      project: n.project, workspace: n.workspace,
      topic: n.topic, tags: n.tags,
    }))
  }

  // ── Obsidian features (no-op en SQLite) ──

  generateDashboard(): { path: string; created: boolean } {
    return { path: '', created: false }
  }

  getInboxItems(): InboxItem[] {
    return []
  }

  processInboxItem(): NoteEntry {
    throw new Error('Solo disponible en modo Obsidian')
  }

  generateReview(): ReviewEntry {
    throw new Error('Solo disponible en modo Obsidian')
  }

  generateTemplates(): { path: string; count: number } {
    return { path: '', count: 0 }
  }

  // ── Private helpers ──

  private ensureRepo(): void {
    if (this.repoId === null) {
      this.autoRegisterRepo()
    }
  }

  private todoToEntry(todo: import('../../types.js').TodoWithMeta, ws: WorkspaceInfo): TodoEntry {
    return {
      id: toEntryId(todo.id),
      type: 'todo',
      date: todo.created_at,
      project: ws.project,
      workspace: ws.workspace,
      topic: todo.topic_name,
      tags: todo.topic_name ? [todo.topic_name] : [],
      content: todo.content,
      status: todo.status,
      priority: todo.priority,
      due: todo.remind_at,
      remind_pattern: todo.remind_pattern,
      remind_last_done: todo.remind_last_done,
      completed_at: todo.completed_at,
    }
  }

  private resolveTopicSafe(db: import('better-sqlite3').Database, name: string): number | undefined {
    const topic = getTopicByName(db, name)
    return topic?.id
  }

  private resolveDates(filters: LogFilters): { from?: string; to?: string } {
    if (filters.from || filters.to) {
      return { from: filters.from, to: filters.to }
    }

    const now = new Date()
    const today = todayDate()

    switch (filters.period) {
      case 'today':
        return { from: `${today}T00:00:00`, to: `${today}T23:59:59` }
      case 'yesterday': {
        const yesterday = new Date(now.getTime() - 86400000).toISOString().split('T')[0]
        return { from: `${yesterday}T00:00:00`, to: `${yesterday}T23:59:59` }
      }
      case 'week': {
        const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString().split('T')[0]
        return { from: `${weekAgo}T00:00:00`, to: `${today}T23:59:59` }
      }
      case 'month': {
        const monthAgo = new Date(now.getTime() - 30 * 86400000).toISOString().split('T')[0]
        return { from: `${monthAgo}T00:00:00`, to: `${today}T23:59:59` }
      }
      default:
        return { from: `${today}T00:00:00`, to: `${today}T23:59:59` }
    }
  }
}
