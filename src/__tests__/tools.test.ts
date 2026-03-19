import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDb, seedRepo, getTopicId } from './helpers.js'
import {
  insertNote,
  insertTodo,
  getTodos,
  getAllTopics,
  getTopicByName,
  insertTopic,
  updateTodoStatus,
  updateTodo,
  deleteTodos,
  getNotes,
  searchNotes,
  searchTodos,
  getCompletedTodos,
} from '../db/queries.js'

let db: Database.Database
let repoId: number

beforeEach(() => {
  db = createTestDb()
  repoId = seedRepo(db)
})

describe('logbook_note (simulado)', () => {
  it('crea nota con topic valido', () => {
    const topicId = getTopicId(db, 'decision')
    const note = insertNote(db, repoId, topicId, 'Decidí usar Redis')
    expect(note.topic_name).toBe('decision')
    expect(note.repo_name).toBe('test-repo')
  })

  it('crea nota sin topic', () => {
    const note = insertNote(db, repoId, null, 'Nota sin categoria')
    expect(note.topic_name).toBeNull()
  })

  it('topic invalido no existe en DB', () => {
    const topic = getTopicByName(db, 'nonexistent')
    expect(topic).toBeUndefined()
  })
})

describe('logbook_todo_add (simulado)', () => {
  it('crea un solo TODO', () => {
    const topicId = getTopicId(db, 'feature')
    const todo = insertTodo(db, repoId, topicId, 'Implementar auth', 'high')
    expect(todo.content).toBe('Implementar auth')
    expect(todo.priority).toBe('high')
    expect(todo.status).toBe('pending')
  })

  it('crea multiples TODOs', () => {
    const featureId = getTopicId(db, 'feature')
    const fixId = getTopicId(db, 'fix')
    const choreId = getTopicId(db, 'chore')

    insertTodo(db, repoId, featureId, 'Feature 1')
    insertTodo(db, repoId, fixId, 'Fix 1')
    insertTodo(db, repoId, choreId, 'Chore 1')

    const all = getTodos(db)
    expect(all).toHaveLength(3)
  })

  it('respeta prioridad por defecto (normal)', () => {
    const topicId = getTopicId(db, 'chore')
    const todo = insertTodo(db, repoId, topicId, 'Tarea basica')
    expect(todo.priority).toBe('normal')
  })
})

describe('logbook_todo_list (simulado)', () => {
  it('filtra por status pending', () => {
    const topicId = getTopicId(db, 'feature')
    insertTodo(db, repoId, topicId, 'Pending')
    const id2 = Number(
      db.prepare('INSERT INTO todos (repo_id, topic_id, content, status) VALUES (?, ?, ?, ?)')
        .run(repoId, topicId, 'Done', 'done').lastInsertRowid,
    )

    const pending = getTodos(db, { status: 'pending' })
    expect(pending).toHaveLength(1)
    expect(pending[0].content).toBe('Pending')
  })

  it('filtra por topic', () => {
    const featureId = getTopicId(db, 'feature')
    const fixId = getTopicId(db, 'fix')
    insertTodo(db, repoId, featureId, 'Feature')
    insertTodo(db, repoId, fixId, 'Fix')

    const features = getTodos(db, { topicId: featureId })
    expect(features).toHaveLength(1)
    expect(features[0].topic_name).toBe('feature')
  })

  it('filtra por priority', () => {
    const topicId = getTopicId(db, 'blocker')
    insertTodo(db, repoId, topicId, 'Normal', 'normal')
    insertTodo(db, repoId, topicId, 'Urgent', 'urgent')

    const urgent = getTodos(db, { priority: 'urgent' })
    expect(urgent).toHaveLength(1)
    expect(urgent[0].content).toBe('Urgent')
  })
})

describe('logbook_todo_done (simulado)', () => {
  it('marca como hecho', () => {
    const topicId = getTopicId(db, 'fix')
    const todo = insertTodo(db, repoId, topicId, 'Bug fix')
    const done = updateTodoStatus(db, [todo.id], 'done')
    expect(done[0].status).toBe('done')
  })

  it('marca varios a la vez', () => {
    const topicId = getTopicId(db, 'chore')
    const t1 = insertTodo(db, repoId, topicId, 'T1')
    const t2 = insertTodo(db, repoId, topicId, 'T2')
    const done = updateTodoStatus(db, [t1.id, t2.id], 'done')
    expect(done).toHaveLength(2)
    expect(done.every((t) => t.status === 'done')).toBe(true)
  })

  it('undo devuelve a pending', () => {
    const topicId = getTopicId(db, 'feature')
    const todo = insertTodo(db, repoId, topicId, 'Test')
    updateTodoStatus(db, [todo.id], 'done')
    const undone = updateTodoStatus(db, [todo.id], 'pending')
    expect(undone[0].status).toBe('pending')
    expect(undone[0].completed_at).toBeNull()
  })
})

describe('logbook_todo_edit (simulado)', () => {
  it('cambia contenido', () => {
    const topicId = getTopicId(db, 'feature')
    const todo = insertTodo(db, repoId, topicId, 'Original')
    const updated = updateTodo(db, todo.id, { content: 'Editado' })
    expect(updated?.content).toBe('Editado')
  })

  it('cambia prioridad', () => {
    const topicId = getTopicId(db, 'fix')
    const todo = insertTodo(db, repoId, topicId, 'Bug')
    const updated = updateTodo(db, todo.id, { priority: 'urgent' })
    expect(updated?.priority).toBe('urgent')
  })

  it('cambia topic', () => {
    const featureId = getTopicId(db, 'feature')
    const fixId = getTopicId(db, 'fix')
    const todo = insertTodo(db, repoId, featureId, 'Test')
    const updated = updateTodo(db, todo.id, { topicId: fixId })
    expect(updated?.topic_name).toBe('fix')
  })
})

describe('logbook_todo_rm (simulado)', () => {
  it('elimina uno', () => {
    const topicId = getTopicId(db, 'chore')
    const todo = insertTodo(db, repoId, topicId, 'Delete me')
    const deleted = deleteTodos(db, [todo.id])
    expect(deleted).toEqual([todo.id])
    expect(getTodos(db)).toHaveLength(0)
  })

  it('elimina varios', () => {
    const topicId = getTopicId(db, 'chore')
    const t1 = insertTodo(db, repoId, topicId, 'T1')
    const t2 = insertTodo(db, repoId, topicId, 'T2')
    insertTodo(db, repoId, topicId, 'T3')

    const deleted = deleteTodos(db, [t1.id, t2.id])
    expect(deleted).toHaveLength(2)
    expect(getTodos(db)).toHaveLength(1)
  })

  it('ignora IDs inexistentes', () => {
    const deleted = deleteTodos(db, [999, 1000])
    expect(deleted).toHaveLength(0)
  })
})

describe('logbook_log (simulado)', () => {
  it('retorna notas y todos completados', () => {
    const topicId = getTopicId(db, 'decision')
    insertNote(db, repoId, topicId, 'Nota del log')

    const fixId = getTopicId(db, 'fix')
    const todo = insertTodo(db, repoId, fixId, 'Bug arreglado')
    updateTodoStatus(db, [todo.id], 'done')

    const notes = getNotes(db, { repoId })
    const completed = getCompletedTodos(db, { repoId })
    expect(notes).toHaveLength(1)
    expect(completed).toHaveLength(1)
  })
})

describe('logbook_search (simulado)', () => {
  it('busca en notas y todos', () => {
    const topicId = getTopicId(db, 'feature')
    insertNote(db, repoId, topicId, 'Autenticación con JWT')
    insertTodo(db, repoId, topicId, 'Implementar autenticación OAuth')

    const noteResults = searchNotes(db, 'autenticación')
    const todoResults = searchTodos(db, 'autenticación')
    expect(noteResults.length + todoResults.length).toBe(2)
  })

  it('busca solo en notas', () => {
    const topicId = getTopicId(db, 'idea')
    insertNote(db, repoId, topicId, 'WebSockets para chat')
    insertTodo(db, repoId, topicId, 'Investigar WebSockets')

    const results = searchNotes(db, 'WebSockets')
    expect(results).toHaveLength(1)
  })

  it('retorna vacio sin resultados', () => {
    const results = searchNotes(db, 'inexistente')
    expect(results).toHaveLength(0)
  })
})

describe('logbook_topics (simulado)', () => {
  it('lista topics predefinidos', () => {
    const topics = getAllTopics(db)
    expect(topics).toHaveLength(6)
  })

  it('crea topic custom', () => {
    const topic = insertTopic(db, 'security', 'Temas de seguridad')
    expect(topic.is_custom).toBe(1)
    expect(getAllTopics(db)).toHaveLength(7)
  })

  it('falla al crear duplicado', () => {
    expect(() => insertTopic(db, 'feature')).toThrow()
  })
})
