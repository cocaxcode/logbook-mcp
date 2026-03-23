import { existsSync, readFileSync, writeFileSync, rmSync, readdirSync, unlinkSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
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
import { applyWikilinks, getKnownProjects, getKnownEntryTitles } from './wikilinks.js'
import { ensureDir, globMarkdown, readEntry, writeEntry, copyAttachment, extractIdFromFilename } from './files.js'
import { formatStandup, formatDecision, formatDebug } from './formatting.js'

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

export class ObsidianStorage implements StorageBackend {
  private baseDir: string
  private repoPath: string | null = null
  private wsInfo: WorkspaceInfo | null = null

  constructor(baseDir: string) {
    this.baseDir = baseDir
    ensureDir(baseDir)
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
    const slug = generateSlug(content.slice(0, 80))
    const dir = this.typeDir(ws, 'note')
    const filename = resolveFilename(dir, date, slug)
    const id = extractIdFromFilename(filename)

    const projectDir = this.projectDir(ws)
    const knownProjects = getKnownProjects(this.baseDir)
    const knownEntries = getKnownEntryTitles(this.baseDir, projectDir)
    const body = applyWikilinks(content, knownProjects, knownEntries)

    const fm: Frontmatter = {
      type: 'note',
      date,
      project: ws.project,
      workspace: ws.workspace,
    }
    if (topic) fm.topic = topic
    if (topic) fm.tags = [topic]

    writeEntry(join(dir, filename), fm, body)

    const entry: NoteEntry = {
      id, type: 'note', date, project: ws.project, workspace: ws.workspace,
      topic: topic || null, tags: topic ? [topic] : [], content: body,
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

    // Leer o crear todos.md
    const todosPath = this.todosFilePath(ws)
    const { lines, fm } = this.readTodosFile(ws)

    // Crear nueva linea
    const newLine = formatTodoLine(content, priority, opts?.remind_at, false, null, topic)
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
      content, status: 'pending', priority,
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
    }

    return results
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

  ackRecurringReminder(_id: EntryId): void {
    // En el modelo de todos.md no hay remind_pattern inline — no-op
    // Los reminders ahora van en carpeta reminders/
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
    const knownProjects = getKnownProjects(this.baseDir)
    const knownEntries = getKnownEntryTitles(this.baseDir, projectDir)
    const body = applyWikilinks(formatStandup(yesterday, today, blockers), knownProjects, knownEntries)
    writeEntry(join(dir, filename), fm, body)

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
    const knownProjects = getKnownProjects(this.baseDir)
    const knownEntries = getKnownEntryTitles(this.baseDir, projectDir)
    const body = applyWikilinks(formatDecision(title, context, options, decision, consequences), knownProjects, knownEntries)
    writeEntry(join(dir, filename), fm, body)

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
    const knownProjects = getKnownProjects(this.baseDir)
    const knownEntries = getKnownEntryTitles(this.baseDir, projectDir)
    const body = applyWikilinks(formatDebug(title, error, cause, fix, attachmentName), knownProjects, knownEntries)
    writeEntry(join(dir, filename), fm, body)

    const entry: DebugEntry = {
      id, type: 'debug', date, project: ws.project, workspace: ws.workspace,
      topic: topic || 'fix', tags: [topic || 'fix'],
      title, error, cause, fix, attachment: attachmentName,
    }
    this.ensureDashboard()
    return entry
  }

  // ── Search & queries ──

  search(query: string, filters: SearchFilters): SearchResult[] {
    const ws = this.getWorkspace()
    const searchDir = filters.scope === 'global' ? this.baseDir : this.projectDir(ws)
    const queryLower = query.toLowerCase()
    const results: SearchResult[] = []

    // Buscar en archivos .md individuales (notes, decisions, debug, standups)
    const files = globMarkdown(searchDir)
    for (const file of files) {
      // Saltar todos.md — se busca aparte
      if (basename(file) === 'todos.md') continue

      const { frontmatter: fm, body } = readEntry(file)

      // Filter by type
      if (filters.type && filters.type !== 'all') {
        const fmType = fm.type as string
        if (filters.type === 'notes' && fmType !== 'note') continue
        if (filters.type === 'todos') continue // TODOs se buscan abajo
      }

      // Filter by topic
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

    // Buscar en todos.md si aplica
    if (!filters.type || filters.type === 'all' || filters.type === 'todos') {
      const todosResults = this.searchInTodosFile(ws, queryLower, filters.topic)
      results.push(...todosResults)
    }

    // Buscar en reminders/ si aplica
    if (!filters.type || filters.type === 'all') {
      const reminderResults = this.searchInReminders(ws, queryLower, filters.topic)
      results.push(...reminderResults)
    }

    return results.slice(0, filters.limit || 20)
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
  private collectRemindersFromProject(
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

      const { lines, fm } = this.readTodosFileAt(todosPath)
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
    const files = globMarkdown(this.baseDir)
    const topicSet = new Map<string, number>()

    for (const file of files) {
      if (basename(file) === 'todos.md') continue
      const { frontmatter: fm } = readEntry(file)
      if (fm.topic) {
        const name = String(fm.topic)
        topicSet.set(name, (topicSet.get(name) || 0) + 1)
      }
    }

    // Contar topics de todos.md
    this.countTodoTopics(topicSet)

    return Array.from(topicSet.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name]) => ({
        id: name,
        name,
        description: null,
        is_custom: true,
      }))
  }

  insertTopic(name: string, _description?: string): TopicInfo {
    return {
      id: name,
      name,
      description: _description || null,
      is_custom: true,
    }
  }

  // ── Code TODOs ──

  getCodeTodos(repoPath: string): CodeTodo[] {
    return scanCodeTodos(repoPath)
  }

  syncCodeTodos(_repoPath: string, _todos: CodeTodo[]): { added: number; resolved: number } {
    return { added: 0, resolved: 0 }
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

## \u{1F517} Enlaces r\u00E1pidos

- [[todos]]
- [[notes]]
- [[decisions]]
- [[debug]]
- [[standups]]
`

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

  private ensureDashboard(): void {
    this.generateDashboard(false)
  }

  /** Busca en qué workspace está un proyecto dado */
  private findWorkspaceForProject(project: string): string {
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

  private projectDir(ws: WorkspaceInfo): string {
    return join(this.baseDir, ws.workspace, ws.project)
  }

  private typeDir(ws: WorkspaceInfo, type: EntryType): string {
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

  /** Ruta al archivo todos.md del proyecto */
  private todosFilePath(ws: WorkspaceInfo): string {
    const dir = this.projectDir(ws)
    ensureDir(dir)
    return join(dir, 'todos.md')
  }

  /** Lee todos.md y devuelve frontmatter + array de lineas de TODOs */
  private readTodosFile(ws: WorkspaceInfo): { lines: string[]; fm: Frontmatter } {
    const todosPath = this.todosFilePath(ws)
    return this.readTodosFileAt(todosPath, ws)
  }

  private readTodosFileAt(todosPath: string, ws?: WorkspaceInfo): { lines: string[]; fm: Frontmatter } {
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
  private writeTodosFile(path: string, fm: Frontmatter, lines: string[]): void {
    ensureDir(join(path, '..'))
    const content = serializeFrontmatter(fm) + '\n' + lines.join('\n') + '\n'
    writeFileSync(path, content, 'utf-8')
  }

  /** Extrae contenido de un TODO legacy (formato viejo con checkbox en body) */
  private extractLegacyTodoContent(body: string): string {
    const match = body.match(/^- \[[ x]\] (.+?)(?:\s*[\u23EB\uD83D\uDD3C\uD83D\uDD3D\uD83D\uDCC5\u2705].*)?$/m)
    return match ? match[1].trim() : body.trim()
  }

  /** Busca en todos.md por query */
  private searchInTodosFile(ws: WorkspaceInfo, queryLower: string, topicFilter?: string): SearchResult[] {
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
  private searchInReminders(ws: WorkspaceInfo, queryLower: string, topicFilter?: string): SearchResult[] {
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
  private getTodoLogEntries(ws: WorkspaceInfo, from?: string, to?: string, topic?: string): LogEntry[] {
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
  private countTodoTags(tagCounts: Map<string, number>): void {
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

  /** Cuenta topics de TODOs en todos.md del vault */
  private countTodoTopics(topicSet: Map<string, number>): void {
    this.walkProjectDirs((projectDir) => {
      const todosPath = join(projectDir, 'todos.md')
      if (!existsSync(todosPath)) return

      const { lines } = this.readTodosFileAt(todosPath)
      for (const line of lines) {
        const parsed = parseTodoLine(line)
        if (parsed?.topic) {
          topicSet.set(parsed.topic, (topicSet.get(parsed.topic) || 0) + 1)
        }
      }
    })
  }

  /** Recorre todos los directorios de proyecto del vault */
  private walkProjectDirs(callback: (projectDir: string, workspace: string, project: string) => void): void {
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

  private filterAndMap<T>(
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

  private groupByProject(items: TodoEntry[]): ReminderGroup[] {
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

  private resolveDates(filters: { period?: string; from?: string; to?: string }): { from?: string; to?: string } {
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
