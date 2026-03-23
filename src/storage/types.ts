import type {
  CodeTodo,
  Priority,
  TodoStatus,
  Scope,
  Period,
  LogType,
  SearchType,
} from '../types.js'

// ── Storage modes ──

export type StorageMode = 'sqlite' | 'obsidian'
export type EntryType = 'note' | 'todo' | 'decision' | 'debug' | 'standup' | 'review'
export type EntryId = string // SQLite: "42", Obsidian: "2026-03-21-slug"

// ── Core entities ──

export interface RepoInfo {
  id: EntryId
  name: string
  path: string
}

export interface WorkspaceInfo {
  workspace: string
  project: string
}

export interface EntryMeta {
  id: EntryId
  type: EntryType
  date: string
  project: string
  workspace: string
  topic: string | null
  tags: string[]
}

// ── Entry types ──

export interface NoteEntry extends EntryMeta {
  type: 'note'
  content: string
}

export interface TodoEntry extends EntryMeta {
  type: 'todo'
  content: string
  status: 'pending' | 'done'
  priority: Priority
  due: string | null
  remind_pattern: string | null
  remind_last_done: string | null
  completed_at: string | null
}

export interface StandupEntry extends EntryMeta {
  type: 'standup'
  yesterday: string
  today: string
  blockers: string
}

export interface DecisionEntry extends EntryMeta {
  type: 'decision'
  title: string
  context: string
  options: string[]
  decision: string
  consequences: string
}

export interface DebugEntry extends EntryMeta {
  type: 'debug'
  title: string
  error: string
  cause: string
  fix: string
  attachment: string | null
}

export interface InboxItem {
  id: string
  filename: string
  content: string
  created: string
}

export interface ReviewStats {
  notes: number
  decisions: number
  debugs: number
  standups: number
  todosCreated: number
  todosCompleted: number
  topTopics: { name: string; count: number }[]
}

export interface ReviewEntry extends EntryMeta {
  type: 'review'
  path: string
  period: string
  from: string
  to: string
  stats: ReviewStats
}

// ── Filter types ──

export interface NoteFilters {
  repoId?: string
  topicId?: string
  from?: string
  to?: string
  limit?: number
}

export interface TodoFilters {
  status?: TodoStatus
  repoId?: string
  topicId?: string
  priority?: Priority
  from?: string
  to?: string
  limit?: number
}

export interface TodoOpts {
  topic?: string
  priority?: Priority
  remind_at?: string
  remind_pattern?: string
}

export interface TodoUpdateFields {
  content?: string
  topic?: string
  priority?: Priority
}

export interface SearchFilters {
  type?: SearchType
  topic?: string
  scope?: Scope
  limit?: number
}

export interface LogFilters {
  period?: Period
  from?: string
  to?: string
  type?: LogType
  topic?: string
  scope?: Scope
}

export interface TimelineFilters {
  period?: Period
  from?: string
  to?: string
  workspace?: string
}

// ── Result types ──

export interface SearchResult {
  type: 'note' | 'todo' | 'decision' | 'debug' | 'standup' | 'review'
  data: EntryMeta & { content: string }
  rank: number
}

export interface LogEntry {
  type: EntryType | 'code_todo_resolved'
  data: EntryMeta & Record<string, unknown>
  timestamp: string
}

export interface TagResult {
  tag: string
  count: number
  entries?: EntryMeta[]
}

export interface TimelineEntry {
  type: EntryType
  date: string
  workspace: string
  project: string
  summary: string
}

export interface TopicInfo {
  id: EntryId
  name: string
  description: string | null
  is_custom: boolean
}

export interface ReminderGroup {
  repo_name: string | null
  reminders: TodoEntry[]
}

export interface ReminderResult {
  today: ReminderGroup[]
  overdue: ReminderGroup[]
  recurring: ReminderGroup[]
}

// ── Storage backend interface ──

export interface StorageBackend {
  // Repos
  autoRegisterRepo(): RepoInfo | null
  getWorkspace(): WorkspaceInfo

  // Notes
  insertNote(content: string, topic?: string): NoteEntry
  getNotes(filters: NoteFilters): NoteEntry[]

  // TODOs
  insertTodo(content: string, opts?: TodoOpts): TodoEntry
  getTodos(filters: TodoFilters): TodoEntry[]
  updateTodoStatus(ids: EntryId[], status: 'pending' | 'done'): TodoEntry[]
  updateTodo(id: EntryId, fields: TodoUpdateFields): TodoEntry | null
  deleteTodos(ids: EntryId[]): EntryId[]
  ackRecurringReminder(id: EntryId): void

  // Specialized entries
  insertStandup(yesterday: string, today: string, blockers: string, topic?: string): StandupEntry
  insertDecision(title: string, context: string, options: string[], decision: string, consequences: string, topic?: string): DecisionEntry
  insertDebug(title: string, error: string, cause: string, fix: string, file?: string, topic?: string): DebugEntry

  // Search & queries
  search(query: string, filters: SearchFilters): SearchResult[]
  getLog(filters: LogFilters): LogEntry[]
  getDueReminders(scope?: 'project' | 'workspace' | 'global'): ReminderResult | null
  getTags(filter?: string): TagResult[]
  getTimeline(filters: TimelineFilters): TimelineEntry[]

  // Topics
  getTopics(): TopicInfo[]
  insertTopic(name: string, description?: string): TopicInfo

  // Code TODOs (only meaningful in SQLite, obsidian returns [])
  getCodeTodos(repoPath: string): CodeTodo[]
  syncCodeTodos(repoPath: string, todos: CodeTodo[]): { added: number; resolved: number }

  // Generic entry operations
  updateEntry(id: EntryId, fields: { content?: string; topic?: string; tags?: string[] }): EntryMeta | null
  deleteEntry(id: EntryId, type: EntryType): boolean
  listEntries(type: EntryType, filters?: { project?: string; topic?: string; from?: string; to?: string; limit?: number; scope?: 'project' | 'global'; workspace?: string }): EntryMeta[]

  // Obsidian features
  generateDashboard(force?: boolean): { path: string; created: boolean }
  getInboxItems(): InboxItem[]
  processInboxItem(id: string, project: string, topic?: string, type?: EntryType): NoteEntry
  generateReview(period: 'week' | 'month', project?: string): ReviewEntry
  generateTemplates(force?: boolean): { path: string; count: number }
}
