import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ObsidianStorage } from '../storage/obsidian/index.js'

// Mock detectRepoPath to return a controlled path
vi.mock('../git/detect-repo.js', () => ({
  detectRepoPath: () => '/test/cocaxcode/projects/test-project',
}))

// Mock scanCodeTodos
vi.mock('../git/code-todos.js', () => ({
  scanCodeTodos: () => [],
}))

describe('ObsidianStorage', () => {
  let testDir: string
  let storage: ObsidianStorage

  beforeEach(() => {
    testDir = join(tmpdir(), `logbook-obsidian-test-${Date.now()}`)
    mkdirSync(testDir, { recursive: true })
    storage = new ObsidianStorage(testDir)
    storage.autoRegisterRepo()
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  // ── Notes ──

  describe('insertNote', () => {
    it('creates a markdown file with frontmatter', () => {
      const note = storage.insertNote('Test note content', 'feature')
      expect(note.type).toBe('note')
      expect(note.content).toContain('Test note content')
      expect(note.topic).toBe('feature')
      expect(note.project).toBe('test-project')
      expect(note.workspace).toBe('cocaxcode')

      // Verify file exists
      const dir = join(testDir, 'cocaxcode', 'test-project', 'notes')
      expect(existsSync(dir)).toBe(true)
    })

    it('creates file with valid frontmatter', () => {
      storage.insertNote('My note', 'fix')
      const dir = join(testDir, 'cocaxcode', 'test-project', 'notes')
      const files = require('node:fs').readdirSync(dir)
      const content = readFileSync(join(dir, files[0]), 'utf-8')
      expect(content).toContain('---')
      expect(content).toContain('type: note')
      expect(content).toContain('project: test-project')
      expect(content).toContain('My note')
    })
  })

  describe('getNotes', () => {
    it('returns inserted notes', () => {
      storage.insertNote('Note 1', 'feature')
      storage.insertNote('Note 2', 'fix')
      const notes = storage.getNotes({})
      expect(notes.length).toBe(2)
    })

    it('respects limit', () => {
      storage.insertNote('Note 1')
      storage.insertNote('Note 2')
      storage.insertNote('Note 3')
      const notes = storage.getNotes({ limit: 2 })
      expect(notes.length).toBe(2)
    })
  })

  // ── TODOs ──

  describe('insertTodo', () => {
    it('creates a todo with checkbox format', () => {
      const todo = storage.insertTodo('Fix the CORS bug', { priority: 'high', topic: 'fix' })
      expect(todo.type).toBe('todo')
      expect(todo.status).toBe('pending')
      expect(todo.priority).toBe('high')
      expect(todo.content).toBe('Fix the CORS bug')
    })

    it('creates todo with due date', () => {
      const todo = storage.insertTodo('Review deploy', { remind_at: '2026-03-25' })
      expect(todo.due).toBe('2026-03-25')
    })
  })

  describe('getTodos', () => {
    it('returns pending todos by default', () => {
      storage.insertTodo('TODO 1')
      storage.insertTodo('TODO 2')
      const todos = storage.getTodos({ status: 'pending' })
      expect(todos.length).toBe(2)
      expect(todos.every((t) => t.status === 'pending')).toBe(true)
    })

    it('filters by priority', () => {
      storage.insertTodo('Low', { priority: 'low' })
      storage.insertTodo('High', { priority: 'high' })
      const high = storage.getTodos({ priority: 'high' })
      expect(high.length).toBe(1)
      expect(high[0].priority).toBe('high')
    })
  })

  describe('updateTodoStatus', () => {
    it('marks todo as done', () => {
      const todo = storage.insertTodo('My task')
      const [updated] = storage.updateTodoStatus([todo.id], 'done')
      expect(updated.status).toBe('done')
      expect(updated.completed_at).toBeTruthy()
    })

    it('marks todo as pending (undo)', () => {
      const todo = storage.insertTodo('My task')
      storage.updateTodoStatus([todo.id], 'done')
      const [updated] = storage.updateTodoStatus([todo.id], 'pending')
      expect(updated.status).toBe('pending')
    })
  })

  describe('updateTodo', () => {
    it('updates todo content', () => {
      const todo = storage.insertTodo('Old content')
      const updated = storage.updateTodo(todo.id, { content: 'New content' })
      expect(updated?.content).toBe('New content')
    })

    it('returns null for non-existent id', () => {
      const result = storage.updateTodo('non-existent-id', { content: 'test' })
      expect(result).toBeNull()
    })
  })

  describe('deleteTodos', () => {
    it('deletes todo files', () => {
      const todo = storage.insertTodo('To delete')
      const deleted = storage.deleteTodos([todo.id])
      expect(deleted).toContain(todo.id)
      const remaining = storage.getTodos({ status: 'all' })
      expect(remaining.length).toBe(0)
    })
  })

  // ── Specialized entries ──

  describe('insertStandup', () => {
    it('creates standup file', () => {
      const standup = storage.insertStandup('Fixed bugs', 'New feature', 'None')
      expect(standup.type).toBe('standup')
      expect(standup.yesterday).toBe('Fixed bugs')
      expect(standup.today).toBe('New feature')
    })
  })

  describe('insertDecision', () => {
    it('creates decision file', () => {
      const decision = storage.insertDecision(
        'Use JWT', 'Need auth', ['JWT', 'Sessions'], 'JWT', 'Need refresh tokens',
      )
      expect(decision.type).toBe('decision')
      expect(decision.title).toBe('Use JWT')
      expect(decision.options).toEqual(['JWT', 'Sessions'])
    })
  })

  describe('insertDebug', () => {
    it('creates debug file', () => {
      const debug = storage.insertDebug('CORS bug', '403 error', 'Missing headers', 'Added middleware')
      expect(debug.type).toBe('debug')
      expect(debug.error).toBe('403 error')
      expect(debug.fix).toBe('Added middleware')
    })

    it('throws error if attachment file does not exist', () => {
      expect(() => {
        storage.insertDebug('Bug', 'Error', 'Cause', 'Fix', '/nonexistent/file.png')
      }).toThrow('Archivo no encontrado: /nonexistent/file.png')
    })

    it('copies attachment if file exists', () => {
      // Create a temp file to attach
      const tempFile = join(testDir, 'screenshot.png')
      require('node:fs').writeFileSync(tempFile, 'fake-image-data')

      const debug = storage.insertDebug('Bug', 'Error', 'Cause', 'Fix', tempFile)
      expect(debug.attachment).toBe('screenshot.png')

      // Verify file was copied
      const attachDir = join(testDir, 'cocaxcode', 'test-project', 'attachments')
      expect(require('node:fs').existsSync(join(attachDir, 'screenshot.png'))).toBe(true)
    })
  })

  // ── Search ──

  describe('search', () => {
    it('finds notes by content', () => {
      storage.insertNote('CORS issue with Safari')
      storage.insertNote('JWT token refresh')
      const results = storage.search('CORS', {})
      expect(results.length).toBe(1)
      expect(results[0].data.content).toContain('CORS')
    })

    it('returns empty for no matches', () => {
      storage.insertNote('Hello world')
      const results = storage.search('nonexistent', {})
      expect(results.length).toBe(0)
    })
  })

  // ── Tags ──

  describe('getTags', () => {
    it('collects tags from all entries', () => {
      storage.insertNote('Note 1', 'feature')
      storage.insertNote('Note 2', 'feature')
      storage.insertNote('Note 3', 'fix')
      const tags = storage.getTags()
      expect(tags.length).toBe(2)
      const featureTag = tags.find((t) => t.tag === 'feature')
      expect(featureTag?.count).toBe(2)
    })

    it('filters by specific tag', () => {
      storage.insertNote('Note 1', 'feature')
      storage.insertNote('Note 2', 'fix')
      const tags = storage.getTags('fix')
      expect(tags.length).toBe(1)
      expect(tags[0].tag).toBe('fix')
    })
  })

  // ── Reminders ──

  describe('getDueReminders', () => {
    it('returns null when no reminders', () => {
      storage.insertTodo('No reminder')
      expect(storage.getDueReminders()).toBeNull()
    })

    it('finds today reminders', () => {
      const today = new Date().toISOString().split('T')[0]
      storage.insertTodo('Due today', { remind_at: today })
      const result = storage.getDueReminders()
      expect(result).not.toBeNull()
      expect(result!.today.length).toBeGreaterThan(0)
    })

    it('finds overdue reminders', () => {
      storage.insertTodo('Overdue', { remind_at: '2020-01-01' })
      const result = storage.getDueReminders()
      expect(result).not.toBeNull()
      expect(result!.overdue.length).toBeGreaterThan(0)
    })
  })

  // ── Topics ──

  describe('getTopics', () => {
    it('returns topics from frontmatter', () => {
      storage.insertNote('Note 1', 'feature')
      storage.insertNote('Note 2', 'fix')
      const topics = storage.getTopics()
      expect(topics.length).toBe(2)
      expect(topics.map((t) => t.name).sort()).toEqual(['feature', 'fix'])
    })
  })

  // ── Timeline ──

  describe('getTimeline', () => {
    it('returns entries sorted by date', () => {
      storage.insertNote('Note 1')
      storage.insertTodo('Todo 1')
      const entries = storage.getTimeline({ period: 'today' })
      expect(entries.length).toBe(2)
    })
  })
})
