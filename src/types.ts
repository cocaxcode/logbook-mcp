// ── DB entities ──

export interface Repo {
  id: number
  name: string
  path: string
  created_at: string
}

export interface Topic {
  id: number
  name: string
  description: string | null
  commit_prefix: string | null
  is_custom: number // SQLite boolean: 0 | 1
  created_at: string
}

export interface Note {
  id: number
  repo_id: number | null
  topic_id: number | null
  content: string
  created_at: string
}

export interface NoteWithMeta extends Note {
  repo_name: string | null
  topic_name: string | null
}

export interface Todo {
  id: number
  repo_id: number | null
  topic_id: number | null
  content: string
  status: 'pending' | 'done'
  priority: Priority
  completed_at: string | null
  created_at: string
}

export interface TodoWithMeta extends Todo {
  repo_name: string | null
  topic_name: string | null
  source: 'manual'
}

// ── Code TODOs (no DB, from git grep) ──

export interface CodeTodo {
  content: string
  source: 'code'
  file: string
  line: number
  tag: 'TODO' | 'FIXME' | 'HACK' | 'BUG'
  topic_name: string
}

// ── Tool responses ──

export interface TodoGroup {
  topic: string
  items: (TodoWithMeta | CodeTodo)[]
}

export interface LogEntry {
  type: 'note' | 'todo' | 'code_todo_resolved'
  data: NoteWithMeta | TodoWithMeta | { file: string; line: number; tag: string; content: string; topic_name: string }
  timestamp: string
}

export interface SearchResult {
  type: 'note' | 'todo'
  data: NoteWithMeta | TodoWithMeta
  rank: number
}

// ── Shared types ──

export type Period = 'today' | 'yesterday' | 'week' | 'month'
export type TodoStatus = 'pending' | 'done' | 'all'
export type Priority = 'low' | 'normal' | 'high' | 'urgent'
export type Source = 'all' | 'manual' | 'code'
export type Scope = 'project' | 'global'
export type LogType = 'all' | 'notes' | 'todos'
export type SearchType = 'all' | 'notes' | 'todos'
export type TopicAction = 'list' | 'add'

export interface TodoAddItem {
  content: string
  topic?: string
  priority?: Priority
}
