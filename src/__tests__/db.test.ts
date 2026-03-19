import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDb, seedRepo, seedNote, seedTodo, getTopicId } from './helpers.js'
import {
  insertRepo,
  getRepoByPath,
  getRepoByName,
  getAllRepos,
  getTopicByName,
  getAllTopics,
  insertTopic,
  insertNote,
  getNotes,
  insertTodo,
  getTodos,
  updateTodoStatus,
  updateTodo,
  deleteTodos,
  searchNotes,
  searchTodos,
  getCompletedTodos,
  syncCodeTodos,
  getResolvedCodeTodos,
} from '../db/queries.js'

let db: Database.Database

beforeEach(() => {
  db = createTestDb()
})

describe('schema', () => {
  it('crea las tablas correctamente', () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[]
    const names = tables.map((t) => t.name)
    expect(names).toContain('repos')
    expect(names).toContain('topics')
    expect(names).toContain('notes')
    expect(names).toContain('todos')
  })

  it('seed inserta 6 topics predefinidos', () => {
    const topics = getAllTopics(db)
    expect(topics).toHaveLength(7)
    expect(topics.map((t) => t.name).sort()).toEqual([
      'blocker', 'chore', 'decision', 'feature', 'fix', 'idea', 'reminder',
    ])
  })
})

describe('repos', () => {
  it('inserta y recupera por path', () => {
    const repo = insertRepo(db, 'my-repo', '/path/to/repo')
    expect(repo.name).toBe('my-repo')
    expect(repo.path).toBe('/path/to/repo')

    const found = getRepoByPath(db, '/path/to/repo')
    expect(found?.id).toBe(repo.id)
  })

  it('recupera por name', () => {
    insertRepo(db, 'my-repo', '/path/to/repo')
    const found = getRepoByName(db, 'my-repo')
    expect(found?.path).toBe('/path/to/repo')
  })

  it('lista todos los repos', () => {
    insertRepo(db, 'repo-a', '/a')
    insertRepo(db, 'repo-b', '/b')
    const all = getAllRepos(db)
    expect(all).toHaveLength(2)
  })
})

describe('topics', () => {
  it('recupera topic por nombre', () => {
    const topic = getTopicByName(db, 'feature')
    expect(topic?.name).toBe('feature')
    expect(topic?.commit_prefix).toBe('feat')
  })

  it('crea topic custom', () => {
    const topic = insertTopic(db, 'security', 'Temas de seguridad')
    expect(topic.name).toBe('security')
    expect(topic.is_custom).toBe(1)
  })

  it('falla al crear topic duplicado', () => {
    expect(() => insertTopic(db, 'feature')).toThrow()
  })
})

describe('notes', () => {
  it('inserta nota con metadata', () => {
    const repoId = seedRepo(db)
    const topicId = getTopicId(db, 'decision')
    const note = insertNote(db, repoId, topicId, 'Decidí usar JWT')
    expect(note.content).toBe('Decidí usar JWT')
    expect(note.repo_name).toBe('test-repo')
    expect(note.topic_name).toBe('decision')
  })

  it('inserta nota sin repo ni topic', () => {
    const note = insertNote(db, null, null, 'Nota global')
    expect(note.repo_name).toBeNull()
    expect(note.topic_name).toBeNull()
  })

  it('filtra notas por repoId', () => {
    const repo1 = seedRepo(db, 'repo1', '/r1')
    const repo2 = seedRepo(db, 'repo2', '/r2')
    const topicId = getTopicId(db, 'idea')
    insertNote(db, repo1, topicId, 'Nota 1')
    insertNote(db, repo2, topicId, 'Nota 2')

    const notes = getNotes(db, { repoId: repo1 })
    expect(notes).toHaveLength(1)
    expect(notes[0].content).toBe('Nota 1')
  })

  it('filtra notas por topicId', () => {
    const repoId = seedRepo(db)
    const featureId = getTopicId(db, 'feature')
    const fixId = getTopicId(db, 'fix')
    insertNote(db, repoId, featureId, 'Feature note')
    insertNote(db, repoId, fixId, 'Fix note')

    const notes = getNotes(db, { topicId: featureId })
    expect(notes).toHaveLength(1)
    expect(notes[0].topic_name).toBe('feature')
  })
})

describe('todos', () => {
  it('inserta todo con metadata', () => {
    const repoId = seedRepo(db)
    const topicId = getTopicId(db, 'feature')
    const todo = insertTodo(db, repoId, topicId, 'Implementar auth', 'high')
    expect(todo.content).toBe('Implementar auth')
    expect(todo.priority).toBe('high')
    expect(todo.status).toBe('pending')
    expect(todo.source).toBe('manual')
  })

  it('filtra por status', () => {
    const repoId = seedRepo(db)
    const topicId = getTopicId(db, 'fix')
    seedTodo(db, repoId, topicId, 'Bug 1')
    const id2 = seedTodo(db, repoId, topicId, 'Bug 2')
    db.prepare("UPDATE todos SET status = 'done' WHERE id = ?").run(id2)

    const pending = getTodos(db, { status: 'pending' })
    expect(pending).toHaveLength(1)
    expect(pending[0].content).toBe('Bug 1')
  })

  it('marca como hecho y undo', () => {
    const repoId = seedRepo(db)
    const topicId = getTopicId(db, 'chore')
    const id = seedTodo(db, repoId, topicId, 'Tarea')

    const done = updateTodoStatus(db, [id], 'done')
    expect(done[0].status).toBe('done')
    expect(done[0].completed_at).toBeTruthy()

    const undone = updateTodoStatus(db, [id], 'pending')
    expect(undone[0].status).toBe('pending')
    expect(undone[0].completed_at).toBeNull()
  })

  it('edita campos parciales', () => {
    const repoId = seedRepo(db)
    const topicId = getTopicId(db, 'feature')
    const id = seedTodo(db, repoId, topicId, 'Original')

    const updated = updateTodo(db, id, { content: 'Modificado', priority: 'urgent' })
    expect(updated?.content).toBe('Modificado')
    expect(updated?.priority).toBe('urgent')
  })

  it('elimina todos por ids', () => {
    const repoId = seedRepo(db)
    const topicId = getTopicId(db, 'chore')
    const id1 = seedTodo(db, repoId, topicId, 'Uno')
    const id2 = seedTodo(db, repoId, topicId, 'Dos')
    seedTodo(db, repoId, topicId, 'Tres')

    const deleted = deleteTodos(db, [id1, id2])
    expect(deleted).toEqual([id1, id2])

    const remaining = getTodos(db)
    expect(remaining).toHaveLength(1)
  })
})

describe('FTS5 search', () => {
  it('busca en notas por texto', () => {
    const repoId = seedRepo(db)
    const topicId = getTopicId(db, 'decision')
    insertNote(db, repoId, topicId, 'Decidí usar JWT para autenticación')
    insertNote(db, repoId, topicId, 'Redis para cache de sesiones')

    const results = searchNotes(db, 'JWT')
    expect(results).toHaveLength(1)
    expect(results[0].content).toContain('JWT')
  })

  it('busca en todos por texto', () => {
    const repoId = seedRepo(db)
    const topicId = getTopicId(db, 'feature')
    insertTodo(db, repoId, topicId, 'Implementar validación email')
    insertTodo(db, repoId, topicId, 'Crear endpoint usuarios')

    const results = searchTodos(db, 'email')
    expect(results).toHaveLength(1)
    expect(results[0].content).toContain('email')
  })

  it('FTS se actualiza al borrar', () => {
    const repoId = seedRepo(db)
    const topicId = getTopicId(db, 'idea')
    const id = Number(
      db
        .prepare('INSERT INTO notes (repo_id, topic_id, content) VALUES (?, ?, ?)')
        .run(repoId, topicId, 'WebSockets idea').lastInsertRowid,
    )

    let results = searchNotes(db, 'WebSockets')
    expect(results).toHaveLength(1)

    db.prepare('DELETE FROM notes WHERE id = ?').run(id)
    results = searchNotes(db, 'WebSockets')
    expect(results).toHaveLength(0)
  })

  it('FTS se actualiza al editar todo', () => {
    const repoId = seedRepo(db)
    const topicId = getTopicId(db, 'feature')
    insertTodo(db, repoId, topicId, 'Texto original')

    let results = searchTodos(db, 'original')
    expect(results).toHaveLength(1)

    const id = results[0].id
    updateTodo(db, id, { content: 'Texto modificado' })

    results = searchTodos(db, 'original')
    expect(results).toHaveLength(0)

    results = searchTodos(db, 'modificado')
    expect(results).toHaveLength(1)
  })
})

describe('completed todos (log)', () => {
  it('retorna solo todos completados', () => {
    const repoId = seedRepo(db)
    const topicId = getTopicId(db, 'fix')
    seedTodo(db, repoId, topicId, 'Pendiente')
    const id2 = seedTodo(db, repoId, topicId, 'Hecho')
    updateTodoStatus(db, [id2], 'done')

    const completed = getCompletedTodos(db, { repoId })
    expect(completed).toHaveLength(1)
    expect(completed[0].content).toBe('Hecho')
  })
})

describe('code TODO sync', () => {
  it('primer sync guarda snapshots', () => {
    const repoId = seedRepo(db)
    const todos = [
      { file: 'src/a.ts', line: 10, tag: 'TODO', content: 'add auth', topic_name: 'feature' },
      { file: 'src/b.ts', line: 20, tag: 'FIXME', content: 'handle null', topic_name: 'fix' },
    ]
    const result = syncCodeTodos(db, repoId, todos)
    expect(result.added).toBe(2)
    expect(result.resolved).toBe(0)
  })

  it('detecta TODOs resueltos (desaparecieron del codigo)', () => {
    const repoId = seedRepo(db)
    const initial = [
      { file: 'src/a.ts', line: 10, tag: 'TODO', content: 'add auth', topic_name: 'feature' },
      { file: 'src/b.ts', line: 20, tag: 'FIXME', content: 'handle null', topic_name: 'fix' },
    ]
    syncCodeTodos(db, repoId, initial)

    // Segundo scan: solo queda uno
    const current = [
      { file: 'src/a.ts', line: 10, tag: 'TODO', content: 'add auth', topic_name: 'feature' },
    ]
    const result = syncCodeTodos(db, repoId, current)
    expect(result.added).toBe(0)
    expect(result.resolved).toBe(1)

    const resolved = getResolvedCodeTodos(db, repoId)
    expect(resolved).toHaveLength(1)
    expect(resolved[0].content).toBe('handle null')
  })

  it('no re-inserta TODOs ya resueltos que reaparecen', () => {
    const repoId = seedRepo(db)
    const todos = [
      { file: 'src/a.ts', line: 10, tag: 'TODO', content: 'add auth', topic_name: 'feature' },
    ]

    syncCodeTodos(db, repoId, todos)
    syncCodeTodos(db, repoId, []) // desaparece
    const result = syncCodeTodos(db, repoId, todos) // reaparece

    expect(result.added).toBe(0) // no re-inserta
  })

  it('sync sin cambios no modifica nada', () => {
    const repoId = seedRepo(db)
    const todos = [
      { file: 'src/a.ts', line: 10, tag: 'TODO', content: 'add auth', topic_name: 'feature' },
    ]
    syncCodeTodos(db, repoId, todos)
    const result = syncCodeTodos(db, repoId, todos)
    expect(result.added).toBe(0)
    expect(result.resolved).toBe(0)
  })
})

describe('ON DELETE SET NULL', () => {
  it('nota.repo_id = null al borrar repo', () => {
    const repoId = seedRepo(db)
    const topicId = getTopicId(db, 'idea')
    insertNote(db, repoId, topicId, 'Nota con repo')

    db.prepare('DELETE FROM repos WHERE id = ?').run(repoId)

    const notes = getNotes(db)
    expect(notes[0].repo_id).toBeNull()
    expect(notes[0].repo_name).toBeNull()
  })
})
