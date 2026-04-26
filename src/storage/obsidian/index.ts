import { existsSync, readFileSync, writeFileSync, rmSync, readdirSync, unlinkSync, statSync, openSync, closeSync } from 'node:fs'
import { basename, dirname, join, relative } from 'node:path'
import type { CodeTodo, Priority } from '../../types.js'
import { detectRepoPath } from '../../git/detect-repo.js'
import { scanCodeTodos } from '../../git/code-todos.js'
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
  ReminderGroup,
  TagResult,
  TimelineFilters,
  TimelineEntry,
  TopicInfo,
  EntryId,
  EntryType,
  EntryMeta,
  InboxItem,
  ReviewEntry,
  ReviewStats,
} from '../types.js'
import type { Frontmatter } from './frontmatter.js'
import { parseFrontmatter, serializeFrontmatter } from './frontmatter.js'
import { generateSlug, resolveFilename } from './slug.js'
import { detectWorkspace } from './workspace.js'
import { getVaultIdSet } from './wikilinks.js'
import { applyAutoWikilinks } from '../../core/auto-wikilinks.js'
import { ensureDir, globMarkdown, readEntry, writeEntry, copyAttachment, extractIdFromFilename } from './files.js'
import { formatStandup, formatDecision, formatDebug } from './formatting.js'
import { readState as readReminderState, writeStateAtomic as writeReminderStateAtomic } from '../../config/reminders-state.js'
import { searchIndex as oramaSearch, updateDoc as oramaUpdateDoc, removeDoc as oramaRemoveDoc } from './orama-adapter.js'

// ── Cross-reference helpers (TODO done → linked note) ──

const RESOLVED_SECTION_HEADER = '## ✅ Resueltos'
const LINKED_ID_RE = /\[\[(\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]*)\]\]/g

/** Extract entry ids referenced by [[id]] in text. */
export function extractLinkedIds(text: string): string[] {
  const ids = new Set<string>()
  for (const m of text.matchAll(LINKED_ID_RE)) ids.add(m[1])
  return [...ids]
}

/** Remove [[wikilink]] brackets so the line in the resolved section stays readable. */
export function stripWikilinkBrackets(text: string): string {
  return text.replace(/\[\[([^\]]+)\]\]/g, '$1')
}

const todoLineRe = (todoId: string) =>
  new RegExp(`^- ✅ \\d{4}-\\d{2}-\\d{2}: TODO #${todoId} —.*$`, 'm')

/**
 * Insert or update the resolved TODO entry inside a `## ✅ Resueltos` section.
 * Idempotent: if a line for the same todoId exists, it is replaced.
 */
export function upsertResolvedRef(body: string, todoId: string, content: string, date: string): string {
  const line = `- ✅ ${date}: TODO #${todoId} — ${content}`
  const sectionMatch = body.match(/\n## ✅ Resueltos\n+([\s\S]*?)(?=\n## |\n# |$)/)

  if (sectionMatch) {
    const sectionContent = sectionMatch[1]
    const re = todoLineRe(todoId)
    if (re.test(sectionContent)) {
      return body.replace(re, line)
    }
    // Append at end of section (preserve any trailing content after section)
    const trimmed = sectionContent.replace(/\n+$/, '')
    const newSection = `\n## ✅ Resueltos\n\n${trimmed ? trimmed + '\n' : ''}${line}\n`
    return body.slice(0, sectionMatch.index!) + newSection + body.slice(sectionMatch.index! + sectionMatch[0].length)
  }
  // Section does not exist — create it at the end
  const sep = body.endsWith('\n') ? '\n' : '\n\n'
  return body.replace(/\s+$/, '') + `${sep}\n${RESOLVED_SECTION_HEADER}\n\n${line}\n`
}

/** Remove the line for `todoId` from the section. If section becomes empty, drop it. */
export function removeResolvedRef(body: string, todoId: string): string {
  const re = todoLineRe(todoId)
  if (!re.test(body)) return body
  let next = body.replace(new RegExp(`\\n?${todoLineRe(todoId).source}`, 'm'), '')
  // Clean up empty section
  next = next.replace(/\n## ✅ Resueltos\n\s*(?=\n## |\n# |$)/, '\n')
  next = next.replace(/\n## ✅ Resueltos\n\s*$/, '')
  return next
}

/** Fire-and-forget update of the Orama index for a single file. */
function syncOramaFile(baseDir: string, filePath: string, language?: OramaLanguage): void {
  oramaUpdateDoc({ baseDir, language }, filePath).catch((e) => {
    console.error(`[logbook] Orama updateDoc failed: ${(e as Error).message}`)
  })
}

/** Fire-and-forget removal from the Orama index. */
function dropOramaFile(baseDir: string, idOrPath: string, language?: OramaLanguage): void {
  oramaRemoveDoc({ baseDir, language }, idOrPath).catch((e) => {
    console.error(`[logbook] Orama removeDoc failed: ${(e as Error).message}`)
  })
}

// ── Folder names per entry type (solo para tipos que siguen siendo archivos individuales) ──

const TYPE_FOLDERS: Record<EntryType, string> = {
  note: 'notes',
  todo: 'todos', // Ya no se usa como carpeta, pero se mantiene para compatibilidad
  decision: 'decisions',
  debug: 'debug',
  standup: 'standups',
  review: 'reviews',
}

// ── Priority emoji mapping (compatible con Obsidian Tasks plugin) ──

const PRIORITY_EMOJI: Record<Priority, string> = {
  urgent: '\u23EB', // ⏫
  high: '\uD83D\uDD3C', // 🔼
  normal: '',
  low: '\uD83D\uDD3D', // 🔽
}

const EMOJI_TO_PRIORITY: Record<string, Priority> = {
  '\u23EB': 'urgent',
  '\uD83D\uDD3C': 'high',
  '\uD83D\uDD3D': 'low',
}

// ── Parsed TODO line ──

interface ParsedTodoLine {
  done: boolean
  content: string
  priority: Priority
  due: string | null
  completedAt: string | null
  topic: string | null
}

// ── Helpers ──

function todayDate(): string {
  return new Date().toISOString().split('T')[0]
}

function nowISO(): string {
  return new Date().toISOString()
}

/**
 * Formatea una linea de TODO para todos.md
 * Ejemplo: - [ ] Revisar deploy 🔼 📅 2026-03-25
 *          - [x] Fix CORS ✅ 2026-03-21
 */
function formatTodoLine(
  content: string,
  priority: Priority,
  due?: string | null,
  done?: boolean,
  completedAt?: string | null,
  topic?: string | null,
): string {
  const checkbox = done ? '- [x]' : '- [ ]'
  const parts = [checkbox, content]

  const emoji = PRIORITY_EMOJI[priority]
  if (emoji) parts.push(emoji)

  if (due && !done) {
    parts.push(`\uD83D\uDCC5 ${due}`) // 📅
  }

  if (done && completedAt) {
    parts.push(`\u2705 ${completedAt.split('T')[0]}`) // ✅
  }

  if (topic) {
    parts.push(`#${topic}`)
  }

  return parts.join(' ')
}

/**
 * Parsea una linea de TODO de todos.md
 * Soporta: - [ ] contenido 🔼 📅 2026-03-25 #topic
 *           - [x] contenido ✅ 2026-03-21 #topic
 */
function parseTodoLine(line: string): ParsedTodoLine | null {
  const match = line.match(/^- \[([ x])\] (.+)$/)
  if (!match) return null

  const done = match[1] === 'x'
  let rest = match[2]

  // Extraer topic (#word al final)
  let topic: string | null = null
  const topicMatch = rest.match(/\s+#([a-z0-9-]+)\s*$/)
  if (topicMatch) {
    topic = topicMatch[1]
    rest = rest.slice(0, rest.length - topicMatch[0].length)
  }

  // Extraer completedAt (✅ YYYY-MM-DD)
  let completedAt: string | null = null
  const doneMatch = rest.match(/\s*\u2705\s+(\d{4}-\d{2}-\d{2})\s*$/)
  if (doneMatch) {
    completedAt = doneMatch[1]
    rest = rest.slice(0, rest.length - doneMatch[0].length)
  }

  // Extraer due (📅 YYYY-MM-DD)
  let due: string | null = null
  const dueMatch = rest.match(/\s*\uD83D\uDCC5\s+(\d{4}-\d{2}-\d{2})\s*$/)
  if (dueMatch) {
    due = dueMatch[1]
    rest = rest.slice(0, rest.length - dueMatch[0].length)
  }

  // Extraer priority (emoji al final)
  let priority: Priority = 'normal'
  const trimmed = rest.trimEnd()
  for (const [emoji, prio] of Object.entries(EMOJI_TO_PRIORITY)) {
    if (trimmed.endsWith(emoji)) {
      priority = prio
      rest = trimmed.slice(0, trimmed.length - emoji.length)
      break
    }
  }

  return {
    done,
    content: rest.trim(),
    priority,
    due,
    completedAt,
    topic,
  }
}

// ── ISO week number ──

function getISOWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}

// ── ObsidianStorage ──

import type { OramaLanguage } from './orama-adapter.js'

export interface ObsidianStorageOptions {
  /** Orama tokenizer language. Default 'spanish'. */
  language?: OramaLanguage | string
}

export class ObsidianStorage implements StorageBackend {
  baseDir: string
  repoPath: string | null = null
  wsInfo: WorkspaceInfo | null = null
  language: OramaLanguage | undefined

  constructor(baseDir: string, opts: ObsidianStorageOptions = {}) {
    this.baseDir = baseDir.replace(/\\/g, '/')
    this.language = opts.language as OramaLanguage | undefined
    ensureDir(this.baseDir)
  }

  // ── Repos ──

  autoRegisterRepo(): RepoInfo | null {
    this.repoPath = detectRepoPath()
    if (!this.repoPath) return null

    this.wsInfo = detectWorkspace(this.repoPath)
    const name = basename(this.repoPath)

    return {
      id: name,
      name,
      path: this.repoPath,
    }
  }

  getWorkspace(): WorkspaceInfo {
    if (!this.wsInfo) {
      if (!this.repoPath) this.repoPath = detectRepoPath()
      this.wsInfo = detectWorkspace(this.repoPath)
    }
    return this.wsInfo
  }

  // ── Notes ──

  insertNote(content: string, topic?: string): NoteEntry {
    const ws = this.getWorkspace()
    const date = todayDate()

    // Check if topic has table kind — append row instead of creating file
    if (topic) {
      const topicKind = this.getTopicKind(topic)
      if (topicKind === 'table') {
        return this.insertTableRow(ws, content, topic, date)
      }
    }

    const slug = generateSlug(content.slice(0, 80))

    // Resolve custom folder from topic
    const topicFolder = topic ? this.getTopicFolder(topic) : null
    const dir = this.typeDir(ws, 'note', topicFolder)
    const filename = resolveFilename(dir, date, slug)
    const id = extractIdFromFilename(filename)

    const projectDir = this.projectDir(ws)
    const vaultIds = getVaultIdSet(projectDir)
    const body = applyAutoWikilinks(content, vaultIds)

    const fm: Frontmatter = {
      type: 'note',
      date,
      project: ws.project,
      workspace: ws.workspace,
    }
    if (topic) fm.topic = topic
    if (topic) fm.tags = [topic]

    const filePath = join(dir, filename)
    writeEntry(filePath, fm, body)
    syncOramaFile(this.baseDir, filePath, this.language)

    const entry: NoteEntry = {
      id, type: 'note', date, project: ws.project, workspace: ws.workspace,
      topic: topic || null, tags: topic ? [topic] : [], content: body,
    }
    this.ensureDashboard()
    return entry
  }

  /**
   * Insert into a table-kind topic.
   *
   * Content format: "table_name | col1 | col2 | col3"
   * - First segment before | is the table name (used as filename slug)
   * - Remaining segments are column values
   * - If no | found: uses topic name as table, content as single entry
   *
   * First row of a new table defines column count. Header names come from
   * the optional "headers:" prefix: "headers:Version|Env|Status" then data rows.
   *
   * Tables are stored INSIDE the topic folder as individual .md files:
   *   proyecto/deploys/deploy-log.md
   *   proyecto/deploys/releases.md
   */
  insertTableRow(ws: WorkspaceInfo, content: string, topic: string, date: string): NoteEntry {
    const topicFolder = this.getTopicFolder(topic)
    const dir = this.typeDir(ws, 'note', topicFolder)

    let tableName: string
    let values: string[]
    let headers: string[] | null = null

    // Normalize: support both \n and literal "\n" (AI sometimes sends escaped)
    const normalized = content.replace(/\\n/g, '\n')

    // Format 1: "headers:H1|H2|H3\nval1|val2|val3" (no table name → uses topic)
    // Format 2: "table-name\nheaders:H1|H2|H3\nval1|val2|val3"
    // Format 3: "table-name | headers:H1|H2|H3" (headers-only, no data row yet)
    // Format 4: "table-name | val1 | val2 | val3" (data row)
    // Format 5: "plain text" (no pipes → topic as table, simple entry)

    if (normalized.startsWith('headers:')) {
      // Format 1: headers + optional data
      const lines = normalized.split('\n')
      headers = lines[0].slice('headers:'.length).split('|').map((h) => h.trim())
      tableName = topic
      const dataLine = lines.slice(1).join('\n').trim()
      values = dataLine ? (dataLine.includes('|') ? dataLine.split('|').map((v) => v.trim()) : [dataLine]) : []
    } else if (normalized.includes('\n') && normalized.split('\n').some((l) => l.trim().startsWith('headers:'))) {
      // Format 2: first line = table name, then headers line, then optional data
      const lines = normalized.split('\n').map((l) => l.trim())
      tableName = generateSlug(lines[0])
      const headerLineIdx = lines.findIndex((l) => l.startsWith('headers:'))
      headers = lines[headerLineIdx].slice('headers:'.length).split('|').map((h) => h.trim())
      const dataLine = lines.slice(headerLineIdx + 1).join('\n').trim()
      values = dataLine ? (dataLine.includes('|') ? dataLine.split('|').map((v) => v.trim()) : [dataLine]) : []
    } else {
      const parts = content.split('|').map((p) => p.trim())

      // Check if second part starts with "headers:" → Format 3
      if (parts.length >= 2 && parts[1].startsWith('headers:')) {
        tableName = generateSlug(parts[0])
        // Everything after "headers:" in the remaining parts are header names
        const headerStr = parts.slice(1).join('|')
        headers = headerStr.slice('headers:'.length).split('|').map((h) => h.trim())
        values = [] // Headers only, no data row
      } else if (parts.length >= 3) {
        // Format 4: table_name | val1 | val2
        tableName = generateSlug(parts[0])
        values = parts.slice(1)
      } else if (parts.length === 2) {
        tableName = generateSlug(parts[0])
        values = [parts[1]]
      } else {
        // Format 5: no pipes
        tableName = topic
        values = [content]
      }
    }

    const tableFile = join(dir, `${tableName}.md`)

    if (!existsSync(tableFile)) {
      // Create new table
      const fm: Frontmatter = {
        type: 'table',
        topic,
        project: ws.project,
        workspace: ws.workspace,
        updated: date,
      }

      const headerRow = headers
        ? headers
        : values.length === 1
          ? ['Fecha', 'Entrada']
          : ['Fecha', ...values.map((_v, i) => `Col ${i + 1}`)]

      const headerLine = `| ${headerRow.join(' | ')} |`
      const separatorLine = `| ${headerRow.map(() => '---').join(' | ')} |`

      let body = `${headerLine}\n${separatorLine}`

      // Only add data row if we have values (headers-only creates empty table)
      if (values.length > 0) {
        // With custom headers: don't auto-prepend date (user controls columns)
        // Without custom headers: auto-prepend date as first column
        const dataRow = headers
          ? `| ${values.join(' | ')} |`
          : values.length === 1
            ? `| ${date} | ${values[0]} |`
            : `| ${date} | ${values.join(' | ')} |`
        body += `\n${dataRow}`
      }

      writeEntry(tableFile, fm, body)
    } else {
      // Append row to existing table — check if table has custom headers
      const fileContent = readFileSync(tableFile, 'utf-8')

      // Detect if first header column is "Fecha" (auto-generated) or custom
      const firstHeaderMatch = fileContent.match(/^\| *([^|]+)/m)
      const hasAutoDate = firstHeaderMatch && firstHeaderMatch[1].trim() === 'Fecha'

      const dataRow = hasAutoDate
        ? values.length === 1
          ? `| ${date} | ${values[0]} |`
          : `| ${date} | ${values.join(' | ')} |`
        : `| ${values.join(' | ')} |`

      const updatedContent = fileContent.replace(
        /^updated:.*$/m,
        `updated: ${date}`,
      ) + '\n' + dataRow

      writeFileSync(tableFile, updatedContent, 'utf-8')
    }

    const id = `${tableName}-${Date.now()}`
    const entry: NoteEntry = {
      id, type: 'note', date, project: ws.project, workspace: ws.workspace,
      topic, tags: [topic], content,
    }
    this.ensureDashboard()
    return entry
  }

  getNotes(filters: NoteFilters): NoteEntry[] {
    const ws = this.getWorkspace()
    const dir = this.typeDir(ws, 'note')
    const files = globMarkdown(dir)

    return this.filterAndMap<NoteEntry>(files, filters, (fm, body, id) => ({
      id, type: 'note', date: String(fm.date || ''), project: String(fm.project || ws.project),
      workspace: String(fm.workspace || ws.workspace), topic: fm.topic as string | null,
      tags: (fm.tags as string[]) || [], content: body,
    }))
  }

  // ── TODOs (archivo unico todos.md por proyecto) ──

  insertTodo(content: string, opts?: TodoOpts): TodoEntry {
    const ws = this.getWorkspace()
    const date = todayDate()
    const priority = (opts?.priority || 'normal') as Priority
    const topic = opts?.topic || null

    // Auto-wikilinks: envuelve IDs existentes en [[id]] antes de persistir
    const vaultIds = getVaultIdSet(this.projectDir(ws))
    const wrappedContent = applyAutoWikilinks(content, vaultIds)

    // Leer o crear todos.md
    const todosPath = this.todosFilePath(ws)
    const { lines, fm } = this.readTodosFile(ws)

    // Crear nueva linea
    const newLine = formatTodoLine(wrappedContent, priority, opts?.remind_at, false, null, topic)
    lines.push(newLine)

    // Actualizar frontmatter
    fm.updated = date

    // Escribir
    this.writeTodosFile(todosPath, fm, lines)

    // El ID es el indice 1-based de la linea
    const id = String(lines.length)

    const entry: TodoEntry = {
      id, type: 'todo', date, project: ws.project, workspace: ws.workspace,
      topic, tags: topic ? [topic] : [],
      content: wrappedContent, status: 'pending', priority,
      due: opts?.remind_at || null, remind_pattern: opts?.remind_pattern || null,
      remind_last_done: null, completed_at: null,
    }
    this.ensureDashboard()
    return entry
  }

  getTodos(filters: TodoFilters): TodoEntry[] {
    const ws = this.getWorkspace()
    const { lines, fm } = this.readTodosFile(ws)
    const results: TodoEntry[] = []

    for (let i = 0; i < lines.length; i++) {
      const parsed = parseTodoLine(lines[i])
      if (!parsed) continue

      const id = String(i + 1)
      const status = parsed.done ? 'done' : 'pending'

      // Filtrar por status
      if (filters.status && filters.status !== 'all' && status !== filters.status) continue
      // Filtrar por priority
      if (filters.priority && parsed.priority !== filters.priority) continue
      // Filtrar por topic
      if (filters.topicId && parsed.topic !== filters.topicId) continue

      results.push({
        id, type: 'todo', date: String(fm.date || fm.updated || ''),
        project: String(fm.project || ws.project), workspace: String(fm.workspace || ws.workspace),
        topic: parsed.topic, tags: parsed.topic ? [parsed.topic] : [],
        content: parsed.content, status,
        priority: parsed.priority,
        due: parsed.due, remind_pattern: null,
        remind_last_done: null, completed_at: parsed.completedAt,
      })
    }

    const limit = filters.limit ?? 100
    return results.slice(0, limit)
  }

  updateTodoStatus(ids: EntryId[], status: 'pending' | 'done'): TodoEntry[] {
    const ws = this.getWorkspace()
    const { lines, fm } = this.readTodosFile(ws)
    const todosPath = this.todosFilePath(ws)
    const results: TodoEntry[] = []
    const today = todayDate()
    const completedAt = status === 'done' ? nowISO() : null

    for (const id of ids) {
      const idx = Number(id) - 1
      if (idx < 0 || idx >= lines.length) continue

      const parsed = parseTodoLine(lines[idx])
      if (!parsed) continue

      // Actualizar linea
      lines[idx] = formatTodoLine(
        parsed.content,
        parsed.priority,
        parsed.due,
        status === 'done',
        completedAt,
        parsed.topic,
      )

      results.push({
        id, type: 'todo', date: String(fm.date || fm.updated || ''),
        project: String(fm.project || ws.project), workspace: String(fm.workspace || ws.workspace),
        topic: parsed.topic, tags: parsed.topic ? [parsed.topic] : [],
        content: parsed.content, status,
        priority: parsed.priority,
        due: parsed.due, remind_pattern: null,
        remind_last_done: null, completed_at: completedAt,
      })
    }

    if (results.length > 0) {
      fm.updated = today
      this.writeTodosFile(todosPath, fm, lines)

      // Cross-reference linked notes: when done, mark the resolved TODO under
      // a `## ✅ Resueltos` section of any [[id]] mentioned in the TODO content.
      // When undone (going back to pending), remove the entry from that section.
      for (const r of results) {
        const linkedIds = extractLinkedIds(r.content)
        for (const linkedId of linkedIds) {
          this.syncResolvedRef(linkedId, r.id, stripWikilinkBrackets(r.content), status === 'done', today)
        }
      }
    }

    return results
  }

  /** Locate the .md file for a given entry id under the current project. */
  private findFileForId(id: EntryId): string | null {
    const ws = this.getWorkspace()
    const projectDir = this.projectDir(ws)
    const candidates = ['notes', 'decisions', 'debug', 'standups', 'reminders']
    for (const sub of candidates) {
      const dir = join(projectDir, sub)
      if (!existsSync(dir)) continue
      try {
        const files = globMarkdown(dir)
        for (const f of files) {
          if (extractIdFromFilename(basename(f)) === id) return f
        }
      } catch { /* ignore */ }
    }
    return null
  }

  /** Insert/update or remove the resolved TODO line in a linked note's `## ✅ Resueltos` section. */
  private syncResolvedRef(linkedId: string, todoId: string, content: string, done: boolean, date: string): void {
    const filePath = this.findFileForId(linkedId)
    if (!filePath) return // linked id doesn't resolve to a file; skip silently

    const parsed = readEntry(filePath)
    const body = parsed.body
    const newBody = done
      ? upsertResolvedRef(body, todoId, content, date)
      : removeResolvedRef(body, todoId)
    if (newBody === body) return
    writeEntry(filePath, parsed.frontmatter, newBody)
    syncOramaFile(this.baseDir, filePath, this.language)
  }

  updateTodo(id: EntryId, fields: TodoUpdateFields): TodoEntry | null {
    const ws = this.getWorkspace()
    const { lines, fm } = this.readTodosFile(ws)
    const todosPath = this.todosFilePath(ws)
    const idx = Number(id) - 1

    if (isNaN(idx) || idx < 0 || idx >= lines.length) return null

    const parsed = parseTodoLine(lines[idx])
    if (!parsed) return null

    const content = fields.content ?? parsed.content
    const priority = fields.priority ?? parsed.priority
    const topic = fields.topic !== undefined ? fields.topic : parsed.topic

    lines[idx] = formatTodoLine(
      content,
      priority,
      parsed.due,
      parsed.done,
      parsed.completedAt,
      topic,
    )

    fm.updated = todayDate()
    this.writeTodosFile(todosPath, fm, lines)

    return {
      id, type: 'todo', date: String(fm.date || fm.updated || ''),
      project: String(fm.project || ws.project), workspace: String(fm.workspace || ws.workspace),
      topic, tags: topic ? [topic] : [],
      content, status: parsed.done ? 'done' : 'pending',
      priority,
      due: parsed.due, remind_pattern: null,
      remind_last_done: null, completed_at: parsed.completedAt,
    }
  }

  deleteTodos(ids: EntryId[]): EntryId[] {
    const ws = this.getWorkspace()
    const { lines, fm } = this.readTodosFile(ws)
    const todosPath = this.todosFilePath(ws)
    const deleted: EntryId[] = []

    // Convertir a indices y ordenar DESC para borrar de abajo hacia arriba
    const indices = ids
      .map((id) => ({ id, idx: Number(id) - 1 }))
      .filter(({ idx }) => idx >= 0 && idx < lines.length)
      .sort((a, b) => b.idx - a.idx)

    for (const { id, idx } of indices) {
      lines.splice(idx, 1)
      deleted.push(id)
    }

    if (deleted.length > 0) {
      fm.updated = todayDate()
      this.writeTodosFile(todosPath, fm, lines)
    }

    return deleted
  }

  ackRecurringReminder(id: EntryId, snoozeUntil?: string): void {
    const state = readReminderState(this.baseDir)
    state.acks[id] = snoozeUntil ?? todayDate()
    writeReminderStateAtomic(this.baseDir, state)
  }

  getEntryById(id: EntryId): (EntryMeta & { content: string }) | null {
    // Busca el id (ID = "YYYY-MM-DD-slug") en cualquier carpeta del workspace.
    const ws = this.getWorkspace()
    const projectDir = this.projectDir(ws)
    const types: EntryType[] = ['note', 'decision', 'debug', 'standup']
    for (const t of types) {
      const folder = TYPE_FOLDERS[t]
      const dir = join(projectDir, folder)
      if (!existsSync(dir)) continue
      const files = globMarkdown(dir)
      for (const f of files) {
        const fid = extractIdFromFilename(basename(f))
        if (fid === id) {
          const parsed = readEntry(f)
          const fm = parsed.frontmatter
          return {
            id, type: t, date: String(fm.date || ''),
            project: String(fm.project || ws.project),
            workspace: String(fm.workspace || ws.workspace),
            topic: (fm.topic as string | undefined) ?? null,
            tags: (fm.tags as string[]) || [],
            content: parsed.body,
          }
        }
      }
    }
    return null
  }

  // ── Specialized entries ──

  insertStandup(yesterday: string, today: string, blockers: string, topic?: string): StandupEntry {
    const ws = this.getWorkspace()
    const date = todayDate()
    const slug = `standup-${date}`
    const dir = this.typeDir(ws, 'standup')
    const filename = resolveFilename(dir, date, slug)
    const id = extractIdFromFilename(filename)

    const fm: Frontmatter = {
      type: 'standup',
      date,
      project: ws.project,
      workspace: ws.workspace,
    }
    if (topic) { fm.topic = topic; fm.tags = [topic] }

    const projectDir = this.projectDir(ws)
    const vaultIds = getVaultIdSet(projectDir)
    const body = applyAutoWikilinks(formatStandup(yesterday, today, blockers), vaultIds)
    const standupPath = join(dir, filename)
    writeEntry(standupPath, fm, body)
    syncOramaFile(this.baseDir, standupPath, this.language)

    const entry: StandupEntry = {
      id, type: 'standup', date, project: ws.project, workspace: ws.workspace,
      topic: topic || null, tags: topic ? [topic] : [],
      yesterday, today, blockers: blockers || 'Ninguno',
    }
    this.ensureDashboard()
    return entry
  }

  insertDecision(title: string, context: string, options: string[], decision: string, consequences: string, topic?: string): DecisionEntry {
    const ws = this.getWorkspace()
    const date = todayDate()
    const slug = generateSlug(title)
    const dir = this.typeDir(ws, 'decision')
    const filename = resolveFilename(dir, date, slug)
    const id = extractIdFromFilename(filename)

    const fm: Frontmatter = {
      type: 'decision',
      date,
      project: ws.project,
      workspace: ws.workspace,
    }
    if (topic) { fm.topic = topic || 'decision'; fm.tags = [topic || 'decision'] }

    const projectDir = this.projectDir(ws)
    const vaultIdsDec = getVaultIdSet(projectDir)
    const body = applyAutoWikilinks(formatDecision(title, context, options, decision, consequences), vaultIdsDec)
    const decisionPath = join(dir, filename)
    writeEntry(decisionPath, fm, body)
    syncOramaFile(this.baseDir, decisionPath, this.language)

    const entry: DecisionEntry = {
      id, type: 'decision', date, project: ws.project, workspace: ws.workspace,
      topic: topic || 'decision', tags: [topic || 'decision'],
      title, context, options, decision, consequences,
    }
    this.ensureDashboard()
    return entry
  }

  insertDebug(title: string, error: string, cause: string, fix: string, file?: string, topic?: string): DebugEntry {
    const ws = this.getWorkspace()
    const date = todayDate()
    const slug = generateSlug(title)
    const dir = this.typeDir(ws, 'debug')
    const filename = resolveFilename(dir, date, slug)
    const id = extractIdFromFilename(filename)

    let attachmentName: string | null = null
    if (file) {
      if (!existsSync(file)) {
        throw new Error(`Archivo no encontrado: ${file}`)
      }
      const attachDir = join(this.projectDir(ws), 'attachments')
      attachmentName = copyAttachment(file, attachDir)
    }

    const fm: Frontmatter = {
      type: 'debug',
      date,
      project: ws.project,
      workspace: ws.workspace,
    }
    if (topic) { fm.topic = topic || 'fix'; fm.tags = [topic || 'fix'] }

    const projectDir = this.projectDir(ws)
    const vaultIdsDbg = getVaultIdSet(projectDir)
    const body = applyAutoWikilinks(formatDebug(title, error, cause, fix, attachmentName), vaultIdsDbg)
    const debugPath = join(dir, filename)
    writeEntry(debugPath, fm, body)
    syncOramaFile(this.baseDir, debugPath, this.language)

    const entry: DebugEntry = {
      id, type: 'debug', date, project: ws.project, workspace: ws.workspace,
      topic: topic || 'fix', tags: [topic || 'fix'],
      title, error, cause, fix, attachment: attachmentName,
    }
    this.ensureDashboard()
    return entry
  }

  // ── Search & queries ──

  async search(query: string, filters: SearchFilters): Promise<SearchResult[]> {
    const ws = this.getWorkspace()
    const searchDir = filters.scope === 'global' ? this.baseDir : this.projectDir(ws)
    const limit = filters.limit ?? 20

    // Run Orama (BM25 + fuzzy + facets) AND substring scan in parallel, then merge.
    // Orama-ranked hits come first; substring catches anything Orama misses
    // (rare tokens, frontmatter-only matches, tokenizer edge cases). Dedupe by id.
    const oramaPromise = (async (): Promise<SearchResult[]> => {
      try {
        const oramaHits = await oramaSearch(
          { baseDir: searchDir, language: this.language },
          query,
          {
            type: filters.type === 'all' ? undefined : filters.type === 'notes' ? 'note' : filters.type === 'todos' ? 'todo' : filters.type,
            topic: filters.topic,
            limit,
          },
        )
        return oramaHits.map((d) => ({
          type: (d.type as EntryType) || 'note',
          data: {
            id: d.slug,
            type: (d.type as EntryType) || 'note',
            date: d.date || '',
            project: d.project || ws.project,
            workspace: d.workspace || ws.workspace,
            topic: d.topic || null,
            tags: d.tags || [],
            content: d.body,
          } as NoteEntry,
          rank: d.score,
        }))
      } catch (e) {
        console.error(`[logbook] Orama search failed, returning substring only: ${(e as Error).message}`)
        return []
      }
    })()

    const substringResults = this.searchSubstring(ws, searchDir, query, filters)
    const oramaResults = await oramaPromise

    // Merge: Orama first (already sorted by BM25), then substring uniques.
    const seen = new Set<string>()
    const merged: SearchResult[] = []
    for (const r of oramaResults) {
      if (seen.has(r.data.id)) continue
      seen.add(r.data.id)
      merged.push(r)
    }
    for (const r of substringResults) {
      if (seen.has(r.data.id)) continue
      seen.add(r.data.id)
      merged.push(r)
    }
    return merged.slice(0, limit)
  }

  private searchSubstring(ws: WorkspaceInfo, searchDir: string, query: string, filters: SearchFilters): SearchResult[] {
    const queryLower = query.toLowerCase()
    const results: SearchResult[] = []

    const files = globMarkdown(searchDir)
    for (const file of files) {
      if (basename(file) === 'todos.md') continue
      const { frontmatter: fm, body } = readEntry(file)

      if (filters.type && filters.type !== 'all') {
        const fmType = fm.type as string
        if (filters.type === 'notes' && fmType !== 'note') continue
        if (filters.type === 'todos') continue
      }
      if (filters.topic && fm.topic !== filters.topic) continue

      const searchable = `${body} ${Object.values(fm).join(' ')}`.toLowerCase()
      if (!searchable.includes(queryLower)) continue

      results.push({
        type: (fm.type as EntryType) || 'note',
        data: {
          id: extractIdFromFilename(basename(file)),
          type: (fm.type as EntryType) || 'note',
          date: String(fm.date || ''),
          project: String(fm.project || ws.project),
          workspace: String(fm.workspace || ws.workspace),
          topic: (fm.topic as string) || null,
          tags: (fm.tags as string[]) || [],
          content: body,
        },
        rank: 0,
      })
    }

    if (!filters.type || filters.type === 'all' || filters.type === 'todos') {
      results.push(...this.searchInTodosFile(ws, queryLower, filters.topic))
    }
    if (!filters.type || filters.type === 'all') {
      results.push(...this.searchInReminders(ws, queryLower, filters.topic))
    }

    return results
  }

  getLog(filters: LogFilters): LogEntry[] {
    const ws = this.getWorkspace()
    const { from, to } = this.resolveDates(filters)
    const searchDir = filters.scope === 'global' ? this.baseDir : this.projectDir(ws)
    const files = globMarkdown(searchDir)
    const entries: LogEntry[] = []

    for (const file of files) {
      // Saltar todos.md — se procesa aparte
      if (basename(file) === 'todos.md') continue

      const { frontmatter: fm, body } = readEntry(file)
      const date = String(fm.date || '')
      if (!date) continue

      if (from && date < from.split('T')[0]) continue
      if (to && date > to.split('T')[0]) continue

      const fmType = (fm.type as EntryType) || 'note'
      if (filters.type && filters.type !== 'all') {
        if (filters.type === 'notes' && fmType !== 'note' && fmType !== 'decision' && fmType !== 'debug' && fmType !== 'standup') continue
        if (filters.type === 'todos') continue // Se procesan abajo
      }

      if (filters.topic && fm.topic !== filters.topic) continue

      entries.push({
        type: fmType,
        data: {
          id: extractIdFromFilename(basename(file)),
          type: fmType,
          date,
          project: String(fm.project || ws.project),
          workspace: String(fm.workspace || ws.workspace),
          topic: (fm.topic as string) || null,
          tags: (fm.tags as string[]) || [],
          content: body,
        },
        timestamp: String(fm.completed_at || fm.date || ''),
      })
    }

    // Incluir TODOs completados del todos.md si aplica
    if (!filters.type || filters.type === 'all' || filters.type === 'todos') {
      const todoEntries = this.getTodoLogEntries(ws, from, to, filters.topic)
      entries.push(...todoEntries)
    }

    return entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  }

  getDueReminders(scope?: 'project' | 'workspace' | 'global'): ReminderResult | null {
    const effectiveScope = scope || 'project'
    const ws = this.getWorkspace()
    const today = todayDate()

    const todayItems: TodoEntry[] = []
    const overdueItems: TodoEntry[] = []

    if (effectiveScope === 'project') {
      // Comportamiento original: solo el proyecto actual
      this.collectRemindersFromProject(this.projectDir(ws), ws.workspace, ws.project, today, todayItems, overdueItems)
    } else {
      // workspace o global: recorrer directorios de proyecto
      this.walkProjectDirs((projectDir, workspace, project) => {
        if (effectiveScope === 'workspace' && workspace !== ws.workspace) return
        this.collectRemindersFromProject(projectDir, workspace, project, today, todayItems, overdueItems)
      })
    }

    if (todayItems.length === 0 && overdueItems.length === 0) {
      return null
    }

    return {
      today: this.groupByProject(todayItems),
      overdue: this.groupByProject(overdueItems),
      recurring: [], // Recurring ya no aplica en este modelo
    }
  }

  /** Recolecta reminders de un directorio de proyecto (reminders/ + todos.md) */
  collectRemindersFromProject(
    projectDir: string,
    workspace: string,
    project: string,
    today: string,
    todayItems: TodoEntry[],
    overdueItems: TodoEntry[],
  ): void {
    // Leer reminders de la carpeta reminders/
    const remindersDir = join(projectDir, 'reminders')
    if (existsSync(remindersDir)) {
      const files = globMarkdown(remindersDir)
      for (const file of files) {
        const { frontmatter: fm, body } = readEntry(file)
        if (fm.status === 'done') continue

        const date = String(fm.date || '')
        if (!date) continue

        const entry: TodoEntry = {
          id: extractIdFromFilename(basename(file)),
          type: 'todo', date,
          project: String(fm.project || project),
          workspace: String(fm.workspace || workspace),
          topic: (fm.topic as string) || 'reminder',
          tags: ['reminder'],
          content: body.trim(),
          status: 'pending',
          priority: (fm.priority as Priority) || 'normal',
          due: date,
          remind_pattern: null,
          remind_last_done: null,
          completed_at: null,
        }

        if (date === today) {
          todayItems.push(entry)
        } else if (date < today) {
          overdueItems.push(entry)
        }
      }
    }

    // Tambien revisar TODOs con due date en todos.md
    const todosPath = join(projectDir, 'todos.md')
    const projWs: WorkspaceInfo = { workspace, project }
    const { lines, fm } = this.readTodosFileAt(todosPath, projWs)
    for (let i = 0; i < lines.length; i++) {
      const parsed = parseTodoLine(lines[i])
      if (!parsed || parsed.done || !parsed.due) continue

      const entry: TodoEntry = {
        id: String(i + 1), type: 'todo',
        date: String(fm.updated || ''),
        project: String(fm.project || project),
        workspace: String(fm.workspace || workspace),
        topic: parsed.topic, tags: parsed.topic ? [parsed.topic] : [],
        content: parsed.content, status: 'pending',
        priority: parsed.priority,
        due: parsed.due, remind_pattern: null,
        remind_last_done: null, completed_at: null,
      }

      if (parsed.due === today) {
        todayItems.push(entry)
      } else if (parsed.due < today) {
        overdueItems.push(entry)
      }
    }
  }

  getTags(filter?: string): TagResult[] {
    const files = globMarkdown(this.baseDir)
    const tagCounts = new Map<string, number>()

    for (const file of files) {
      // Saltar todos.md
      if (basename(file) === 'todos.md') continue

      const { frontmatter: fm } = readEntry(file)
      const tags = fm.tags as string[] | undefined
      if (!tags || !Array.isArray(tags)) continue

      for (const tag of tags) {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1)
      }
    }

    // Contar tags de todos.md por workspace/proyecto
    this.countTodoTags(tagCounts)

    const results = Array.from(tagCounts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)

    if (filter) {
      return results.filter((r) => r.tag === filter)
    }
    return results
  }

  getTimeline(filters: TimelineFilters): TimelineEntry[] {
    const { from, to } = this.resolveDates({
      period: filters.period,
      from: filters.from,
      to: filters.to,
    })

    const searchDir = filters.workspace
      ? join(this.baseDir, filters.workspace)
      : this.baseDir

    const files = globMarkdown(searchDir)
    const entries: TimelineEntry[] = []

    for (const file of files) {
      // Saltar todos.md — no tiene sentido en timeline individual
      if (basename(file) === 'todos.md') continue

      const { frontmatter: fm, body } = readEntry(file)
      const date = String(fm.date || '')
      if (!date) continue

      if (from && date < from.split('T')[0]) continue
      if (to && date > to.split('T')[0]) continue

      entries.push({
        type: (fm.type as EntryType) || 'note',
        date,
        workspace: String(fm.workspace || 'default'),
        project: String(fm.project || 'global'),
        summary: body.slice(0, 100).replace(/\n/g, ' '),
      })
    }

    // Incluir TODOs de todos.md en el timeline
    this.walkProjectDirs((projectDir, workspace, project) => {
      if (filters.workspace && workspace !== filters.workspace) return
      const todosPath = join(projectDir, 'todos.md')
      if (!existsSync(todosPath)) return

      const { lines, fm } = this.readTodosFileAt(todosPath, { workspace, project })
      const todosDate = String(fm.updated || '')
      if (from && todosDate < from.split('T')[0]) return
      if (to && todosDate > to.split('T')[0]) return

      for (const line of lines) {
        const parsed = parseTodoLine(line)
        if (!parsed) continue
        entries.push({
          type: 'todo',
          date: todosDate,
          workspace,
          project,
          summary: parsed.content.slice(0, 100),
        })
      }
    })

    return entries.sort((a, b) => b.date.localeCompare(a.date))
  }

  // ── Topics ──

  getTopics(): TopicInfo[] {
    // Start with persisted custom topics
    const customTopics = this.loadCustomTopics()
    const topicMap = new Map<string, { kind: TopicInfo['kind']; folder: string | null; description: string | null; showInIndex: boolean }>()

    for (const ct of customTopics) {
      topicMap.set(ct.name, { kind: ct.kind, folder: ct.folder, description: ct.description, showInIndex: ct.showInIndex ?? true })
    }

    // Discover topics from files
    const files = globMarkdown(this.baseDir)
    const discovered = new Set<string>()

    for (const file of files) {
      if (basename(file) === 'todos.md' || file.endsWith('.json')) continue
      const { frontmatter: fm } = readEntry(file)
      if (fm.topic) {
        discovered.add(String(fm.topic))
      }
    }

    // Merge discovered with custom (custom takes precedence for kind/folder)
    for (const name of discovered) {
      if (!topicMap.has(name)) {
        topicMap.set(name, { kind: 'note', folder: null, description: null, showInIndex: true })
      }
    }

    return Array.from(topicMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, info]) => ({
        id: name,
        name,
        description: info.description,
        is_custom: true,
        kind: info.kind,
        folder: info.folder,
        showInIndex: info.showInIndex,
      }))
  }

  /**
   * Remove a custom topic from the registry.
   * - Refuses to remove predefined topics (feature/fix/chore/idea/decision/blocker/reminder).
   * - Does NOT delete entries that referenced the topic; only de-registers it.
   * - If the topic had a folder with content, returns folderKept with the path so the caller can decide.
   */
  /**
   * Scan vault and strip `[[name]]` wikilinks that do not resolve to an existing `.md`.
   * Keeps date-prefixed valid ids and aliased `[[target|label]]` (uses target for resolution).
   */
  cleanupBrokenWikilinks(opts: { dryRun?: boolean; scope?: 'project' | 'global' } = {}): {
    filesScanned: number
    filesModified: number
    linksRemoved: number
    sample: Array<{ file: string; removed: string[] }>
    dryRun?: boolean
  } {
    const ws = this.getWorkspace()
    const root = opts.scope === 'global' ? this.baseDir : this.projectDir(ws)
    const files = globMarkdown(root)

    // Build set of valid filename slugs across the search root.
    // Only `.md` files count as valid wikilink targets — folders don't render as
    // wikilinks in Obsidian (clicking creates an empty file).
    const validFilenames = new Set<string>()
    for (const f of files) {
      const fname = basename(f, '.md')
      validFilenames.add(fname)
    }

    const wikilinkRe = /\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g
    let filesModified = 0
    let linksRemoved = 0
    const sample: Array<{ file: string; removed: string[] }> = []

    for (const f of files) {
      // Skip dashboard files: they intentionally link to folder names that may
      // not have a matching .md (e.g., [[notes]] navigation in index.md).
      if (basename(f) === 'index.md') continue

      const parsed = readEntry(f)
      const removed: string[] = []
      const newBody = parsed.body.replace(wikilinkRe, (match, target: string) => {
        const targetTrim = target.trim()
        if (validFilenames.has(targetTrim)) return match // resolves to a .md → keep
        removed.push(targetTrim)
        return targetTrim // strip brackets, keep inner text
      })
      if (newBody !== parsed.body) {
        filesModified++
        linksRemoved += removed.length
        if (sample.length < 10) {
          sample.push({ file: relative(this.baseDir, f).replace(/\\/g, '/'), removed })
        }
        if (!opts.dryRun) {
          writeEntry(f, parsed.frontmatter, newBody)
          syncOramaFile(this.baseDir, f, this.language)
        }
      }
    }

    return {
      filesScanned: files.length,
      filesModified,
      linksRemoved,
      sample,
      ...(opts.dryRun ? { dryRun: true } : {}),
    }
  }

  removeTopic(name: string, opts: { dryRun?: boolean } = {}): { removed: boolean; folderKept?: string; entriesAffected: number; dryRun?: boolean } {
    const PREDEFINED = new Set(['feature', 'fix', 'chore', 'idea', 'decision', 'blocker', 'reminder'])
    if (PREDEFINED.has(name)) {
      throw new Error(`Cannot remove predefined topic "${name}". Predefined topics: ${[...PREDEFINED].join(', ')}.`)
    }
    const custom = this.loadCustomTopics()
    const idx = custom.findIndex((t) => t.name === name)
    if (idx < 0) return { removed: false, entriesAffected: 0, ...(opts.dryRun ? { dryRun: true } : {}) }

    const entry = custom[idx]

    // Count entries (notes/todos) that reference this topic without deleting them.
    let entriesAffected = 0
    const ws = this.getWorkspace()
    const projectDir = this.projectDir(ws)
    for (const sub of ['notes', 'todos', 'decisions', 'debug', 'standups']) {
      const dir = join(projectDir, sub)
      if (!existsSync(dir)) continue
      try {
        const files = globMarkdown(dir)
        for (const f of files) {
          const { frontmatter: fm } = readEntry(f)
          if (fm.topic === name) entriesAffected++
        }
      } catch { /* ignore */ }
    }

    // Folder still exists with files? Inform caller.
    let folderKept: string | undefined
    if (entry.folder) {
      const folderPath = join(projectDir, entry.folder)
      if (existsSync(folderPath)) {
        try {
          const items = readdirSync(folderPath).filter((f) => !f.startsWith('.'))
          if (items.length > 0) folderKept = folderPath
        } catch { /* ignore */ }
      }
    }

    if (opts.dryRun) {
      return { removed: false, folderKept, entriesAffected, dryRun: true }
    }

    // Actually remove the registry entry
    custom.splice(idx, 1)
    this.saveCustomTopics(custom)

    // Refresh dashboard if this topic was visible
    if (entry.showInIndex) {
      try { this.generateDashboard(true) } catch { /* best-effort */ }
    }

    return { removed: true, folderKept, entriesAffected }
  }

  insertTopic(name: string, _description?: string, kind?: TopicInfo['kind'], folder?: string, showInIndex?: boolean): TopicInfo {
    const shouldShow = showInIndex !== false

    // Always persist custom topics with metadata
    const custom = this.loadCustomTopics()
    const existing = custom.findIndex((t) => t.name === name)
    const entry = { name, description: _description || null, kind: kind ?? 'note', folder: folder ?? null, showInIndex: shouldShow }
    if (existing >= 0) {
      custom[existing] = entry
    } else {
      custom.push(entry)
    }
    this.saveCustomTopics(custom)

    // Create the folder immediately if configured
    if (folder) {
      const ws = this.getWorkspace()
      const dir = join(this.projectDir(ws), folder)
      ensureDir(dir)
    }

    // Regenerate dashboard to include new topic
    if (shouldShow && folder) {
      this.generateDashboard(true)
    }

    return {
      id: name,
      name,
      description: _description || null,
      is_custom: true,
      kind: kind ?? 'note',
      folder: folder ?? null,
      showInIndex: shouldShow,
    }
  }

  // ── Code TODOs ──

  getCodeTodos(repoPath: string): CodeTodo[] {
    return scanCodeTodos(repoPath)
  }

  syncCodeTodos(repoPath: string, todos: CodeTodo[]): { added: number; resolved: number } {
    if (!repoPath) return { added: 0, resolved: 0 }
    const snapshotPath = join(this.baseDir, '.logbook', 'code-todos-snapshot.json')
    let prev: CodeTodo[] = []
    if (existsSync(snapshotPath)) {
      try {
        const raw = JSON.parse(readFileSync(snapshotPath, 'utf-8'))
        if (Array.isArray(raw?.items)) prev = raw.items as CodeTodo[]
      } catch {}
    }
    const key = (t: CodeTodo) => `${t.file}:${t.line}:${t.content}`
    const prevSet = new Set(prev.map(key))
    const currSet = new Set(todos.map(key))
    const added = todos.filter((t) => !prevSet.has(key(t))).length
    const resolved = prev.filter((t) => !currSet.has(key(t))).length
    ensureDir(dirname(snapshotPath))
    writeFileSync(
      snapshotPath,
      JSON.stringify({ version: 1, updatedAt: nowISO(), items: todos }, null, 2),
      'utf-8',
    )
    return { added, resolved }
  }

  // ── Obsidian features ──

  generateDashboard(force?: boolean): { path: string; created: boolean } {
    const ws = this.getWorkspace()
    const projectDir = this.projectDir(ws)
    ensureDir(projectDir)
    const dashboardPath = join(projectDir, 'index.md')

    if (existsSync(dashboardPath) && !force) {
      return { path: dashboardPath, created: false }
    }

    const relPath = `${ws.workspace}/${ws.project}`

    // Build custom topic sections
    const customTopics = this.loadCustomTopics().filter((t) => t.showInIndex && t.folder)

    let customSections = ''
    let customLinks = ''
    for (const topic of customTopics) {
      const icon = topic.kind === 'todo' ? '\u{2705}' : '\u{1F4C1}'
      const queryType = topic.kind === 'todo' ? 'TASK' : 'LIST'
      customSections += `
## ${icon} ${topic.name}

\`\`\`dataview
${queryType}
FROM "${relPath}/${topic.folder}"
SORT file.name DESC
LIMIT 10
\`\`\`
`
      customLinks += `- [[${topic.folder}]]\n`
    }

    const content = `# ${ws.project}

## \u{1F4CB} Pendientes

\`\`\`dataview
TASK
FROM "${relPath}/todos"
WHERE !completed
\`\`\`

## \u{1F4DD} Notas recientes

\`\`\`dataview
LIST
FROM "${relPath}/notes"
SORT file.name DESC
LIMIT 10
\`\`\`

## \u{1F3D7}\uFE0F Decisiones

\`\`\`dataview
LIST
FROM "${relPath}/decisions"
SORT file.name DESC
LIMIT 10
\`\`\`

## \u{1F41B} Debug

\`\`\`dataview
LIST
FROM "${relPath}/debug"
SORT file.name DESC
LIMIT 10
\`\`\`
${customSections}
## \u{1F517} Enlaces r\u00E1pidos

- [[todos]]
- [[notes]]
- [[decisions]]
- [[debug]]
- [[standups]]
${customLinks}`

    writeFileSync(dashboardPath, content, 'utf-8')
    return { path: dashboardPath, created: true }
  }

  getInboxItems(): InboxItem[] {
    const inboxPath = join(this.baseDir, 'inbox')
    if (!existsSync(inboxPath)) return []

    const files = readdirSync(inboxPath, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith('.md'))
      .sort((a, b) => a.name.localeCompare(b.name))

    const items: InboxItem[] = []
    for (const file of files) {
      const filePath = join(inboxPath, file.name)
      const content = readFileSync(filePath, 'utf-8')
      const id = file.name.replace(/\.md$/, '')
      const stats = statSync(filePath)
      items.push({
        id,
        filename: file.name,
        content,
        created: stats.birthtime.toISOString().split('T')[0],
      })
    }

    return items
  }

  processInboxItem(id: string, project: string, topic?: string, type?: EntryType): NoteEntry {
    const inboxPath = join(this.baseDir, 'inbox')

    // Buscar archivo en inbox
    let filePath = join(inboxPath, id.endsWith('.md') ? id : `${id}.md`)
    if (!existsSync(filePath)) {
      filePath = join(inboxPath, id)
      if (!existsSync(filePath)) {
        throw new Error(`No se encontró el archivo "${id}" en inbox/`)
      }
    }

    const content = readFileSync(filePath, 'utf-8')
    const entryType: EntryType = type || 'note'
    const date = todayDate()

    // Determinar workspace: buscar en qué workspace está el proyecto
    let workspace = 'default'
    this.walkProjectDirs((_dir, ws, proj) => {
      if (proj === project) workspace = ws
    })

    // Si no se encontró, usar workspace actual
    if (workspace === 'default') {
      const currentWs = this.getWorkspace()
      workspace = currentWs.workspace
    }

    const tags: string[] = topic ? [topic] : []

    const fm: Frontmatter = {
      type: entryType,
      date,
      project,
      workspace,
    }
    if (topic) fm.topic = topic
    if (tags.length > 0) fm.tags = tags

    // Determinar carpeta destino
    const typeFolder = TYPE_FOLDERS[entryType] || 'notes'
    const destDir = join(this.baseDir, workspace, project, typeFolder)
    ensureDir(destDir)

    // Generar slug desde contenido (primeros 50 chars)
    const slug = generateSlug(content.slice(0, 50))
    const filename = resolveFilename(destDir, date, slug)
    const entryId = extractIdFromFilename(filename)

    writeEntry(join(destDir, filename), fm, content)

    // Eliminar original de inbox
    unlinkSync(filePath)

    this.ensureDashboard()

    return {
      id: entryId,
      type: 'note',
      date,
      project,
      workspace,
      topic: topic || null,
      tags,
      content,
    }
  }

  generateReview(period: 'week' | 'month', project?: string): ReviewEntry {
    const ws = project ? { workspace: this.findWorkspaceForProject(project), project } : this.getWorkspace()
    const now = new Date()
    const date = todayDate()

    let from: string
    let to: string
    let periodLabel: string

    if (period === 'week') {
      const dayOfWeek = now.getDay() || 7 // Lunes = 1, Domingo = 7
      const monday = new Date(now)
      monday.setDate(now.getDate() - (dayOfWeek - 1))
      const sunday = new Date(monday)
      sunday.setDate(monday.getDate() + 6)
      from = monday.toISOString().split('T')[0]
      to = sunday.toISOString().split('T')[0]
      const weekNum = getISOWeekNumber(now)
      periodLabel = `Semana W${String(weekNum).padStart(2, '0')}`
    } else {
      from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      to = lastDay.toISOString().split('T')[0]
      periodLabel = `Mes ${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    }

    // Escanear entradas del proyecto en el rango de fechas
    const projectDir = join(this.baseDir, ws.workspace, ws.project)
    const counts = { notes: 0, decisions: 0, debugs: 0, standups: 0 }
    const topicCounts = new Map<string, number>()
    const activityEntries: string[] = []

    const typeDirs: { dir: string; type: keyof typeof counts }[] = [
      { dir: join(projectDir, 'notes'), type: 'notes' },
      { dir: join(projectDir, 'decisions'), type: 'decisions' },
      { dir: join(projectDir, 'debug'), type: 'debugs' },
      { dir: join(projectDir, 'standups'), type: 'standups' },
    ]

    for (const { dir, type } of typeDirs) {
      if (!existsSync(dir)) continue
      const files = globMarkdown(dir)
      for (const file of files) {
        const { frontmatter: fm, body } = readEntry(file)
        const entryDate = String(fm.date || '')
        if (entryDate < from || entryDate > to) continue

        counts[type]++

        const topic = fm.topic as string | null
        if (topic) {
          topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1)
        }

        // Extraer titulo/resumen para la lista de actividad
        const title = (fm.title as string) || body.split('\n')[0]?.slice(0, 80) || basename(file)
        activityEntries.push(`- ${entryDate} — ${title}`)
      }
    }

    // Contar TODOs desde todos.md
    let todosCreated = 0
    let todosCompleted = 0
    const todosPath = join(projectDir, 'todos.md')
    if (existsSync(todosPath)) {
      const raw = readFileSync(todosPath, 'utf-8')
      const todoLines = raw.split('\n').filter((l) => l.trim().startsWith('- ['))
      todosCreated = todoLines.length
      todosCompleted = todoLines.filter((l) => l.trim().startsWith('- [x]')).length
    }

    // Top topics ordenados por conteo
    const topTopics = Array.from(topicCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }))

    const stats: ReviewStats = {
      notes: counts.notes,
      decisions: counts.decisions,
      debugs: counts.debugs,
      standups: counts.standups,
      todosCreated,
      todosCompleted,
      topTopics,
    }

    // Generar markdown
    const topTopicsSection = topTopics.length > 0
      ? topTopics.map((t) => `- ${t.name} (${t.count})`).join('\n')
      : '- (sin actividad)'

    const activitySection = activityEntries.length > 0
      ? activityEntries.join('\n')
      : '(sin actividad en este periodo)'

    const reviewFm: Frontmatter = {
      type: 'review',
      date,
      project: ws.project,
      workspace: ws.workspace,
      period,
      from,
      to,
      tags: ['review'],
    }

    const body = `# Review ${periodLabel}

**Periodo**: ${from} — ${to}
**Proyecto**: [[${ws.project}]]

## Resumen

| Tipo | Cantidad |
|------|----------|
| Notas | ${counts.notes} |
| Decisiones | ${counts.decisions} |
| Debug | ${counts.debugs} |
| Standups | ${counts.standups} |
| TODOs completados | ${todosCompleted} |

## Top Topics

${topTopicsSection}

## Actividad

${activitySection}
`

    // Escribir en reviews/
    const reviewsDir = join(projectDir, 'reviews')
    ensureDir(reviewsDir)

    let filename: string
    if (period === 'week') {
      const weekNum = getISOWeekNumber(now)
      filename = `${now.getFullYear()}-W${String(weekNum).padStart(2, '0')}-review.md`
    } else {
      filename = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-review.md`
    }

    const reviewPath = join(reviewsDir, filename)
    writeEntry(reviewPath, reviewFm, body)

    return {
      id: extractIdFromFilename(filename),
      type: 'review',
      date,
      project: ws.project,
      workspace: ws.workspace,
      topic: null,
      tags: ['review'],
      path: reviewPath,
      period,
      from,
      to,
      stats,
    }
  }

  generateTemplates(force?: boolean): { path: string; count: number } {
    const templatesPath = join(this.baseDir, '_templates')
    ensureDir(templatesPath)

    const templates: Record<string, string> = {
      'Todo.md': '- [ ] \n',
      'Nota.md': `---
type: note
date: {{date}}
project:
workspace:
topic:
tags: []
---

{{title}}
`,
      'Decision.md': `---
type: decision
date: {{date}}
project:
workspace:
topic: decision
tags: [decision]
---

> [!info] {{title}}

## Contexto


## Opciones

1.
2.

## Decisión


## Consecuencias

`,
      'Debug.md': `---
type: debug
date: {{date}}
project:
workspace:
topic: fix
tags: [fix]
---

> [!bug] {{title}}

## Error


## Causa


## Fix

`,
      'Standup.md': `---
type: standup
date: {{date}}
project:
workspace:
topic: standup
tags: [standup]
---

## Yesterday


## Today


## Blockers

`,
    }

    let count = 0
    for (const [filename, content] of Object.entries(templates)) {
      const filePath = join(templatesPath, filename)
      if (existsSync(filePath) && !force) continue
      writeFileSync(filePath, content, 'utf-8')
      count++
    }

    return { path: templatesPath, count }
  }

  // ── Generic entry operations ──

  updateEntry(id: EntryId, fields: { content?: string; topic?: string; tags?: string[] }): EntryMeta | null {
    const ws = this.getWorkspace()

    // Buscar el archivo por id en todas las carpetas de tipo
    for (const [type, folder] of Object.entries(TYPE_FOLDERS)) {
      if (type === 'todo') continue // TODOs van en todos.md, usar updateTodo
      const dir = join(this.projectDir(ws), folder)
      if (!existsSync(dir)) continue

      const files = globMarkdown(dir)
      for (const file of files) {
        const fileId = extractIdFromFilename(basename(file))
        if (fileId !== id) continue

        // Encontrado — leer, actualizar y escribir
        const { frontmatter: fm, body } = readEntry(file)

        if (fields.topic !== undefined) fm.topic = fields.topic
        if (fields.tags !== undefined) fm.tags = fields.tags
        const newBody = fields.content !== undefined ? fields.content : body

        writeEntry(file, fm, newBody)

        return {
          id: fileId,
          type: type as EntryType,
          date: String(fm.date || ''),
          project: String(fm.project || ws.project),
          workspace: String(fm.workspace || ws.workspace),
          topic: (fm.topic as string) || null,
          tags: (fm.tags as string[]) || [],
        }
      }
    }

    // Buscar tambien en reminders/
    const remindersDir = join(this.projectDir(ws), 'reminders')
    if (existsSync(remindersDir)) {
      const files = globMarkdown(remindersDir)
      for (const file of files) {
        const fileId = extractIdFromFilename(basename(file))
        if (fileId !== id) continue

        const { frontmatter: fm, body } = readEntry(file)

        if (fields.topic !== undefined) fm.topic = fields.topic
        if (fields.tags !== undefined) fm.tags = fields.tags
        const newBody = fields.content !== undefined ? fields.content : body

        writeEntry(file, fm, newBody)

        return {
          id: fileId,
          type: 'note' as EntryType,
          date: String(fm.date || ''),
          project: String(fm.project || ws.project),
          workspace: String(fm.workspace || ws.workspace),
          topic: (fm.topic as string) || null,
          tags: (fm.tags as string[]) || [],
        }
      }
    }

    return null
  }

  deleteEntry(id: EntryId, type: EntryType): boolean {
    if (type === 'todo') return false // TODOs van en todos.md, usar deleteTodos

    const ws = this.getWorkspace()
    const folder = TYPE_FOLDERS[type]
    if (!folder) return false

    const dir = join(this.projectDir(ws), folder)
    if (!existsSync(dir)) return false

    const files = globMarkdown(dir)
    for (const file of files) {
      const fileId = extractIdFromFilename(basename(file))
      if (fileId !== id) continue

      unlinkSync(file)
      dropOramaFile(this.baseDir, id, this.language)
      return true
    }

    return false
  }

  listEntries(type: EntryType, filters?: { project?: string; topic?: string; from?: string; to?: string; limit?: number; scope?: 'project' | 'global'; workspace?: string }): EntryMeta[] {
    const scope = filters?.scope ?? 'project'

    if (type === 'todo') {
      // Para TODOs, usar getTodos
      const todos = this.getTodos({
        topicId: filters?.topic,
        from: filters?.from,
        to: filters?.to,
        limit: filters?.limit || 20,
      })
      const filtered = filters?.workspace
        ? todos.filter((t) => t.workspace === filters.workspace)
        : todos
      return filtered.map((t) => ({
        id: t.id, type: t.type, date: t.date,
        project: t.project, workspace: t.workspace,
        topic: t.topic, tags: t.tags,
      }))
    }

    const folder = TYPE_FOLDERS[type]
    if (!folder) return []

    const results: EntryMeta[] = []

    const collectFromDir = (dir: string, wsName: string, projName: string) => {
      if (!existsSync(dir)) return
      const files = globMarkdown(dir)

      for (const file of files) {
        const { frontmatter: fm } = readEntry(file)
        const date = String(fm.date || '')

        if (filters?.from && date < filters.from) continue
        if (filters?.to && date > filters.to) continue
        if (filters?.topic && fm.topic !== filters.topic) continue

        results.push({
          id: extractIdFromFilename(basename(file)),
          type,
          date,
          project: String(fm.project || projName),
          workspace: String(fm.workspace || wsName),
          topic: (fm.topic as string) || null,
          tags: (fm.tags as string[]) || [],
        })
      }
    }

    if (scope === 'global') {
      this.walkProjectDirs((projectDir, workspace, project) => {
        if (filters?.workspace && workspace !== filters.workspace) return
        collectFromDir(join(projectDir, folder), workspace, project)
      })
    } else {
      const ws = this.getWorkspace()
      collectFromDir(join(this.projectDir(ws), folder), ws.workspace, ws.project)
    }

    results.sort((a, b) => b.date.localeCompare(a.date))

    const limit = filters?.limit ?? 20
    return results.slice(0, limit)
  }

  // ── Migracion: todos/ individuales → todos.md consolidado ──

  migrateTodosFolder(): { migrated: number; projects: string[] } {
    let totalMigrated = 0
    const migratedProjects: string[] = []

    // Recorrer workspaces y proyectos
    this.walkProjectDirs((projectDir, workspace, project) => {
      const todosDir = join(projectDir, 'todos')
      if (!existsSync(todosDir)) return

      const files = globMarkdown(todosDir)
      if (files.length === 0) return

      const lines: string[] = []

      for (const file of files) {
        const { frontmatter: fm, body } = readEntry(file)

        // Intentar parsear como checkbox
        const parsed = parseTodoLine(body.trim())
        if (parsed) {
          // Ya es formato checkbox
          lines.push(body.trim().split('\n')[0])
        } else {
          // Formato viejo con frontmatter — reconstruir
          const content = this.extractLegacyTodoContent(body)
          const priority = (fm.priority as Priority) || 'normal'
          const done = fm.status === 'done'
          const completedAt = (fm.completed_at as string) || null
          const due = (fm.due as string) || null
          const topic = (fm.topic as string) || null

          lines.push(formatTodoLine(content, priority, due, done, completedAt, topic))
        }

        totalMigrated++
      }

      if (lines.length > 0) {
        const todosPath = join(projectDir, 'todos.md')
        const fm: Frontmatter = {
          type: 'todos',
          project,
          workspace,
          updated: todayDate(),
        }

        // Si ya existe todos.md, leer sus lineas existentes y fusionar
        if (existsSync(todosPath)) {
          const existing = this.readTodosFileAt(todosPath)
          lines.unshift(...existing.lines)
        }

        this.writeTodosFile(todosPath, fm, lines)
        migratedProjects.push(`${workspace}/${project}`)

        // Borrar carpeta todos/
        try {
          rmSync(todosDir, { recursive: true, force: true })
        } catch {
          // Si falla el borrado, no es critico
        }
      }
    })

    return { migrated: totalMigrated, projects: migratedProjects }
  }

  // ── Private helpers ──

  ensureDashboard(): void {
    this.generateDashboard(false)
  }

  /** Busca en qué workspace está un proyecto dado */
  findWorkspaceForProject(project: string): string {
    let found = 'default'
    this.walkProjectDirs((_dir, ws, proj) => {
      if (proj === project) found = ws
    })
    if (found === 'default') {
      const currentWs = this.getWorkspace()
      found = currentWs.workspace
    }
    return found
  }

  projectDir(ws: WorkspaceInfo): string {
    return join(this.baseDir, ws.workspace, ws.project)
  }

  typeDir(ws: WorkspaceInfo, type: EntryType, topicFolder?: string | null): string {
    // Custom folder from topic takes precedence
    if (topicFolder) {
      const dir = join(this.projectDir(ws), topicFolder)
      ensureDir(dir)
      return dir
    }
    // Para TODOs ya no creamos carpeta todos/
    if (type === 'todo') {
      const dir = this.projectDir(ws)
      ensureDir(dir)
      return dir
    }
    const dir = join(this.projectDir(ws), TYPE_FOLDERS[type])
    ensureDir(dir)
    return dir
  }

  /** Persisted custom topics config */
  getCustomTopicsPath(): string {
    return join(this.baseDir, 'topics.json')
  }

  loadCustomTopics(): Array<{ name: string; description: string | null; kind: TopicInfo['kind']; folder: string | null; showInIndex: boolean }> {
    const path = this.getCustomTopicsPath()
    if (!existsSync(path)) return []
    try {
      return JSON.parse(readFileSync(path, 'utf-8'))
    } catch {
      return []
    }
  }

  saveCustomTopics(topics: Array<{ name: string; description: string | null; kind: TopicInfo['kind']; folder: string | null; showInIndex: boolean }>): void {
    const path = this.getCustomTopicsPath()
    ensureDir(dirname(path))
    writeFileSync(path, JSON.stringify(topics, null, 2), 'utf-8')
  }

  /** Get the custom folder for a topic (if configured), null otherwise */
  getTopicFolder(topicName: string): string | null {
    const custom = this.loadCustomTopics()
    const match = custom.find((t) => t.name === topicName)
    return match?.folder ?? null
  }

  /** Get the kind for a topic ('note' or 'todo'), defaults to 'note' */
  getTopicKind(topicName: string): TopicInfo['kind'] {
    const custom = this.loadCustomTopics()
    const match = custom.find((t) => t.name === topicName)
    return match?.kind ?? 'note'
  }

  /** Ruta al archivo todos.md del proyecto */
  todosFilePath(ws: WorkspaceInfo): string {
    const dir = this.projectDir(ws)
    ensureDir(dir)
    return join(dir, 'todos.md')
  }

  /** Lee todos.md y devuelve frontmatter + array de lineas de TODOs */
  readTodosFile(ws: WorkspaceInfo): { lines: string[]; fm: Frontmatter } {
    const todosPath = this.todosFilePath(ws)
    return this.readTodosFileAt(todosPath, ws)
  }

  readTodosFileAt(todosPath: string, ws?: WorkspaceInfo): { lines: string[]; fm: Frontmatter } {
    if (!existsSync(todosPath)) {
      return {
        lines: [],
        fm: {
          type: 'todos',
          project: ws?.project || 'global',
          workspace: ws?.workspace || 'default',
          updated: todayDate(),
        },
      }
    }

    const raw = readFileSync(todosPath, 'utf-8')
    const { frontmatter: fm, body } = parseFrontmatter(raw)

    // Parsear lineas: solo las que empiezan con - [ ] o - [x]
    const lines = body
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.startsWith('- ['))

    return { lines, fm }
  }

  /** Escribe todos.md con frontmatter y lineas de TODOs */
  writeTodosFile(path: string, fm: Frontmatter, lines: string[]): void {
    ensureDir(dirname(path))
    const content = serializeFrontmatter(fm) + '\n' + lines.join('\n') + '\n'
    this.withFileLock(path, () => {
      writeFileSync(path, content, 'utf-8')
    })
  }

  /**
   * Simple file lock using a .lock file to prevent concurrent writes.
   * Uses retry with exponential backoff for contention.
   */
  withFileLock<T>(filePath: string, fn: () => T): T {
    const lockPath = filePath + '.lock'
    const maxRetries = 5
    const baseDelay = 50

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // O_EXCL ensures atomic creation — fails if file exists
        const fd = openSync(lockPath, 'wx')
        closeSync(fd)
        try {
          return fn()
        } finally {
          try { unlinkSync(lockPath) } catch { /* lock cleanup best-effort */ }
        }
      } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err

        // Check if lock is stale (> 10s old)
        try {
          const stat = statSync(lockPath)
          if (Date.now() - stat.mtimeMs > 10_000) {
            unlinkSync(lockPath)
            continue
          }
        } catch { /* lock disappeared, retry */ continue }

        // Wait before retrying
        const delay = baseDelay * Math.pow(2, attempt)
        const start = Date.now()
        while (Date.now() - start < delay) { /* busy wait */ }
      }
    }

    // Fallback: proceed without lock after max retries
    return fn()
  }

  /** Extrae contenido de un TODO legacy (formato viejo con checkbox en body) */
  extractLegacyTodoContent(body: string): string {
    const match = body.match(/^- \[[ x]\] (.+?)(?:\s*[\u23EB\uD83D\uDD3C\uD83D\uDD3D\uD83D\uDCC5\u2705].*)?$/m)
    return match ? match[1].trim() : body.trim()
  }

  /** Busca en todos.md por query */
  searchInTodosFile(ws: WorkspaceInfo, queryLower: string, topicFilter?: string): SearchResult[] {
    const { lines, fm } = this.readTodosFile(ws)
    const results: SearchResult[] = []

    for (let i = 0; i < lines.length; i++) {
      const parsed = parseTodoLine(lines[i])
      if (!parsed) continue
      if (topicFilter && parsed.topic !== topicFilter) continue
      if (!parsed.content.toLowerCase().includes(queryLower)) continue

      results.push({
        type: 'todo',
        data: {
          id: String(i + 1),
          type: 'todo',
          date: String(fm.updated || ''),
          project: String(fm.project || ws.project),
          workspace: String(fm.workspace || ws.workspace),
          topic: parsed.topic,
          tags: parsed.topic ? [parsed.topic] : [],
          content: lines[i],
        },
        rank: 0,
      })
    }

    return results
  }

  /** Busca en reminders/ por query */
  searchInReminders(ws: WorkspaceInfo, queryLower: string, topicFilter?: string): SearchResult[] {
    const remindersDir = join(this.projectDir(ws), 'reminders')
    if (!existsSync(remindersDir)) return []

    const files = globMarkdown(remindersDir)
    const results: SearchResult[] = []

    for (const file of files) {
      const { frontmatter: fm, body } = readEntry(file)
      if (topicFilter && fm.topic !== topicFilter) continue

      const searchable = `${body} ${Object.values(fm).join(' ')}`.toLowerCase()
      if (!searchable.includes(queryLower)) continue

      results.push({
        type: 'note', // Reminders se muestran como notas
        data: {
          id: extractIdFromFilename(basename(file)),
          type: 'note',
          date: String(fm.date || ''),
          project: String(fm.project || ws.project),
          workspace: String(fm.workspace || ws.workspace),
          topic: (fm.topic as string) || 'reminder',
          tags: ['reminder'],
          content: body,
        },
        rank: 0,
      })
    }

    return results
  }

  /** Obtiene TODOs completados para el log */
  getTodoLogEntries(ws: WorkspaceInfo, from?: string, to?: string, topic?: string): LogEntry[] {
    const { lines, fm } = this.readTodosFile(ws)
    const entries: LogEntry[] = []

    for (let i = 0; i < lines.length; i++) {
      const parsed = parseTodoLine(lines[i])
      if (!parsed || !parsed.done) continue
      if (topic && parsed.topic !== topic) continue

      const date = parsed.completedAt || String(fm.updated || '')
      if (from && date < from.split('T')[0]) continue
      if (to && date > to.split('T')[0]) continue

      entries.push({
        type: 'todo',
        data: {
          id: String(i + 1),
          type: 'todo',
          date,
          project: String(fm.project || ws.project),
          workspace: String(fm.workspace || ws.workspace),
          topic: parsed.topic,
          tags: parsed.topic ? [parsed.topic] : [],
          content: parsed.content,
        },
        timestamp: date,
      })
    }

    return entries
  }

  /** Cuenta tags de TODOs en todos.md del vault */
  countTodoTags(tagCounts: Map<string, number>): void {
    this.walkProjectDirs((projectDir) => {
      const todosPath = join(projectDir, 'todos.md')
      if (!existsSync(todosPath)) return

      const { lines } = this.readTodosFileAt(todosPath)
      for (const line of lines) {
        const parsed = parseTodoLine(line)
        if (parsed?.topic) {
          tagCounts.set(parsed.topic, (tagCounts.get(parsed.topic) || 0) + 1)
        }
      }
    })
  }

  /** Recorre todos los directorios de proyecto del vault */
  walkProjectDirs(callback: (projectDir: string, workspace: string, project: string) => void): void {
    if (!existsSync(this.baseDir)) return

    const workspaces = readdirSync(this.baseDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())

    for (const wsEntry of workspaces) {
      const wsDir = join(this.baseDir, wsEntry.name)
      const projects = readdirSync(wsDir, { withFileTypes: true })
        .filter((e) => e.isDirectory())

      for (const projEntry of projects) {
        callback(join(wsDir, projEntry.name), wsEntry.name, projEntry.name)
      }
    }
  }

  filterAndMap<T>(
    files: string[],
    filters: { from?: string; to?: string; limit?: number; topicId?: string },
    mapper: (fm: Frontmatter, body: string, id: string) => T,
  ): T[] {
    const results: T[] = []

    for (const file of files) {
      const { frontmatter: fm, body } = readEntry(file)
      const date = String(fm.date || '')

      if (filters.from && date < filters.from) continue
      if (filters.to && date > filters.to) continue
      if (filters.topicId && fm.topic !== filters.topicId) continue

      const id = extractIdFromFilename(basename(file))
      results.push(mapper(fm, body, id))
    }

    results.sort((a, b) => {
      const dateA = (a as unknown as EntryMeta).date || ''
      const dateB = (b as unknown as EntryMeta).date || ''
      return dateB.localeCompare(dateA)
    })

    const limit = filters.limit ?? 100
    return results.slice(0, limit)
  }

  groupByProject(items: TodoEntry[]): ReminderGroup[] {
    const map = new Map<string, TodoEntry[]>()
    for (const item of items) {
      const key = item.project || 'global'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(item)
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, reminders]) => ({
        repo_name: name === 'global' ? null : name,
        reminders,
      }))
  }

  resolveDates(filters: { period?: string; from?: string; to?: string }): { from?: string; to?: string } {
    if (filters.from || filters.to) {
      return { from: filters.from, to: filters.to }
    }

    const now = new Date()
    const today = todayDate()

    switch (filters.period) {
      case 'today':
        return { from: today, to: today }
      case 'yesterday': {
        const yesterday = new Date(now.getTime() - 86400000).toISOString().split('T')[0]
        return { from: yesterday, to: yesterday }
      }
      case 'week': {
        const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString().split('T')[0]
        return { from: weekAgo, to: today }
      }
      case 'month': {
        const monthAgo = new Date(now.getTime() - 30 * 86400000).toISOString().split('T')[0]
        return { from: monthAgo, to: today }
      }
      default:
        return { from: today, to: today }
    }
  }
}
