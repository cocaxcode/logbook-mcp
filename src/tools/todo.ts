import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getStorage } from '../storage/index.js'
import { detectRepoPath } from '../git/detect-repo.js'
import type { CodeTodo, TodoGroup, TodoAddItem, TodoStatus, Priority } from '../types.js'
import type { TodoEntry } from '../storage/types.js'

const priorityEnum = z.enum(['low', 'normal', 'high', 'urgent'])

export function registerTodoTool(server: McpServer): void {
  server.tool(
    'logbook_todo',
    `Gestiona TODOs del logbook. Acciones disponibles:
- add: Crea uno (content) o varios (items). Soporta prioridades y recordatorios.
- list: Lista TODOs agrupados por topic. Incluye manuales y del codigo (TODO/FIXME/HACK/BUG).
- done: Marca como hecho (o undo). Recordatorios recurrentes se ack por hoy.
- edit: Edita contenido, topic o prioridad de un TODO.
- rm: Elimina TODOs por ID.`,
    {
      action: z.enum(['add', 'list', 'done', 'edit', 'rm']).describe('Accion a ejecutar'),
      // add params
      content: z.string().min(1).max(2000).optional().describe('Contenido del TODO (para add de uno solo)'),
      items: z.array(z.object({
        content: z.string().min(1).max(2000),
        topic: z.string().optional(),
        priority: priorityEnum.optional().default('normal'),
        remind_at: z.string().optional(),
        remind_pattern: z.string().optional(),
      })).max(50).optional().describe('Array de TODOs para crear varios (add)'),
      topic: z.string().optional().describe('Topic'),
      priority: priorityEnum.optional().describe('Prioridad'),
      remind_at: z.string().optional().describe('Fecha recordatorio unica (YYYY-MM-DD)'),
      remind_pattern: z.string().optional().describe('Patron recurrente: daily, weekdays, weekly:N, monthly:N'),
      // list params
      status: z.enum(['pending', 'done', 'all']).optional().default('pending').describe('Filtrar por estado (list)'),
      source: z.enum(['all', 'manual', 'code']).optional().default('all').describe('Filtrar por origen (list)'),
      scope: z.enum(['project', 'global']).optional().default('project').describe('Scope (list)'),
      from: z.string().optional().describe('Desde fecha YYYY-MM-DD (list)'),
      to: z.string().optional().describe('Hasta fecha YYYY-MM-DD (list)'),
      limit: z.number().optional().default(100).describe('Maximo resultados (list)'),
      // done/edit/rm params
      ids: z.union([z.number(), z.string(), z.array(z.union([z.number(), z.string()]))]).optional().describe('ID o IDs (done, rm)'),
      undo: z.boolean().optional().default(false).describe('Devolver a pendiente (done)'),
      id: z.union([z.number(), z.string()]).optional().describe('ID del TODO (edit)'),
    },
    async (params) => {
      try {
        const storage = getStorage()

        switch (params.action) {
          case 'add':
            return handleAdd(storage, params)
          case 'list':
            return handleList(storage, params)
          case 'done':
            return handleDone(storage, params)
          case 'edit':
            return handleEdit(storage, params)
          case 'rm':
            return handleRm(storage, params)
          default:
            return { isError: true, content: [{ type: 'text' as const, text: `Accion desconocida: ${params.action}` }] }
        }
      } catch (err: unknown) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
        }
      }
    },
  )
}

function handleAdd(storage: ReturnType<typeof getStorage>, params: Record<string, unknown>) {
  const { content, items, topic, priority, remind_at, remind_pattern } = params as {
    content?: string; items?: TodoAddItem[]; topic?: string; priority?: string
    remind_at?: string; remind_pattern?: string
  }

  if (!content && (!items || items.length === 0)) {
    return { isError: true, content: [{ type: 'text' as const, text: 'Debes pasar "content" (para uno) o "items" (para varios)' }] }
  }

  storage.autoRegisterRepo()

  const todoItems: TodoAddItem[] = items
    ? items
    : [{ content: content!, topic, priority: (priority ?? 'normal') as TodoAddItem['priority'], remind_at, remind_pattern }]

  const results: TodoEntry[] = []
  for (const item of todoItems) {
    const hasReminder = item.remind_at || item.remind_pattern
    const effectiveTopic = hasReminder && !item.topic ? 'reminder' : item.topic
    const todo = storage.insertTodo(item.content, {
      topic: effectiveTopic,
      priority: (item.priority ?? 'normal') as 'low' | 'normal' | 'high' | 'urgent',
      remind_at: item.remind_at,
      remind_pattern: item.remind_pattern,
    })
    results.push(todo)
  }

  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify(results.length === 1 ? results[0] : { created: results.length, todos: results }),
    }],
  }
}

function handleList(storage: ReturnType<typeof getStorage>, params: Record<string, unknown>) {
  const { status, topic, priority, source, scope, from, to, limit } = params as {
    status?: TodoStatus; topic?: string; priority?: Priority; source?: string
    scope?: string; from?: string; to?: string; limit?: number
  }

  if (scope === 'project') storage.autoRegisterRepo()

  const manualTodos: TodoEntry[] = source === 'code'
    ? []
    : storage.getTodos({ status, topicId: topic, priority, from, to, limit })

  let codeTodos: CodeTodo[] = []
  let syncResult: { added: number; resolved: number } | null = null

  if (source !== 'manual' && status !== 'done') {
    const repoPath = scope === 'project' ? detectRepoPath() : null
    if (repoPath) {
      codeTodos = storage.getCodeTodos(repoPath)
      syncResult = storage.syncCodeTodos(repoPath, codeTodos)
      if (topic) codeTodos = codeTodos.filter((ct) => ct.topic_name === topic)
    }
  }

  const groupMap = new Map<string, (TodoEntry | CodeTodo)[]>()
  for (const todo of manualTodos) {
    const key = todo.topic ?? 'sin-topic'
    if (!groupMap.has(key)) groupMap.set(key, [])
    groupMap.get(key)!.push(todo)
  }
  for (const ct of codeTodos) {
    const key = ct.topic_name
    if (!groupMap.has(key)) groupMap.set(key, [])
    groupMap.get(key)!.push(ct)
  }

  const groups: TodoGroup[] = Array.from(groupMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([topicName, items]) => ({ topic: topicName, items: items as TodoGroup['items'] }))

  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify({
        groups,
        summary: {
          manual: manualTodos.length,
          code: codeTodos.length,
          total: manualTodos.length + codeTodos.length,
          ...(syncResult && (syncResult.added > 0 || syncResult.resolved > 0) ? { sync: syncResult } : {}),
        },
      }),
    }],
  }
}

function handleDone(storage: ReturnType<typeof getStorage>, params: Record<string, unknown>) {
  const { ids, undo } = params as { ids?: unknown; undo?: boolean }

  if (!ids) return { isError: true, content: [{ type: 'text' as const, text: '"ids" es requerido para la accion "done"' }] }

  storage.autoRegisterRepo()
  const idArray = (Array.isArray(ids) ? ids : [ids]).map(String)

  const allTodos = storage.getTodos({ status: 'all' })
  const todoMap = new Map(allTodos.map((t) => [t.id, t]))

  const regularIds: string[] = []
  const recurringIds: string[] = []

  for (const id of idArray) {
    const todo = todoMap.get(id)
    if (todo?.remind_pattern && !undo) {
      recurringIds.push(id)
    } else {
      regularIds.push(id)
    }
  }

  const results: TodoEntry[] = []
  if (regularIds.length > 0) {
    const status = undo ? 'pending' : 'done'
    results.push(...storage.updateTodoStatus(regularIds, status))
  }
  for (const id of recurringIds) {
    storage.ackRecurringReminder(id)
    const todo = todoMap.get(id)
    if (todo) results.push(todo)
  }

  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify({
        action: undo ? 'undo' : 'done',
        updated: results.length,
        recurring_acked: recurringIds.length,
        todos: results,
      }),
    }],
  }
}

function handleEdit(storage: ReturnType<typeof getStorage>, params: Record<string, unknown>) {
  const { id, content, topic, priority } = params as {
    id?: unknown; content?: string; topic?: string; priority?: string
  }

  if (!id) return { isError: true, content: [{ type: 'text' as const, text: '"id" es requerido para la accion "edit"' }] }

  storage.autoRegisterRepo()
  const updated = storage.updateTodo(String(id), { content, topic, priority: priority as Priority | undefined })

  if (!updated) {
    return { isError: true, content: [{ type: 'text' as const, text: `TODO #${id} no encontrado o sin cambios` }] }
  }

  return { content: [{ type: 'text' as const, text: JSON.stringify(updated) }] }
}

function handleRm(storage: ReturnType<typeof getStorage>, params: Record<string, unknown>) {
  const { ids } = params as { ids?: unknown }

  if (!ids) return { isError: true, content: [{ type: 'text' as const, text: '"ids" es requerido para la accion "rm"' }] }

  storage.autoRegisterRepo()
  const idArray = (Array.isArray(ids) ? ids : [ids]).map(String)
  const deleted = storage.deleteTodos(idArray)

  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify({ deleted: deleted.length, ids: deleted }),
    }],
  }
}
