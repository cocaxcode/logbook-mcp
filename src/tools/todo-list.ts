import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getDb } from '../db/connection.js'
import { getTopicByName, getTodos } from '../db/queries.js'
import { autoRegisterRepo, detectRepoPath } from '../git/detect-repo.js'
import { scanCodeTodos } from '../git/code-todos.js'
import type { CodeTodo, TodoGroup, TodoWithMeta } from '../types.js'

export function registerTodoListTool(server: McpServer): void {
  server.tool(
    'logbook_todo_list',
    'Lista TODOs agrupados por topic. Incluye TODOs manuales y del codigo (TODO/FIXME/HACK/BUG). Por defecto muestra pendientes del proyecto actual.',
    {
      status: z
        .enum(['pending', 'done', 'all'])
        .optional()
        .default('pending')
        .describe('Filtrar por estado (default: pending)'),
      topic: z.string().optional().describe('Filtrar por topic'),
      priority: z
        .enum(['low', 'normal', 'high', 'urgent'])
        .optional()
        .describe('Filtrar por prioridad'),
      source: z
        .enum(['all', 'manual', 'code'])
        .optional()
        .default('all')
        .describe('Filtrar por origen: manual (DB), code (git grep), all'),
      scope: z
        .enum(['project', 'global'])
        .optional()
        .default('project')
        .describe('Scope: project (auto-detecta) o global (todos los proyectos)'),
      from: z.string().optional().describe('Desde fecha (YYYY-MM-DD)'),
      to: z.string().optional().describe('Hasta fecha (YYYY-MM-DD)'),
      limit: z.number().optional().default(100).describe('Maximo resultados manuales'),
    },
    async ({ status, topic, priority, source, scope, from, to, limit }) => {
      try {
        const db = getDb()
        const repo = scope === 'project' ? autoRegisterRepo(db) : null

        let topicId: number | undefined
        if (topic) {
          const topicRow = getTopicByName(db, topic)
          if (topicRow) topicId = topicRow.id
        }

        // Manual TODOs from DB
        const manualTodos: TodoWithMeta[] =
          source === 'code'
            ? []
            : getTodos(db, {
                status,
                repoId: repo?.id,
                topicId,
                priority,
                from,
                to,
                limit,
              })

        // Code TODOs from git grep
        let codeTodos: CodeTodo[] = []
        if (source !== 'manual' && status !== 'done') {
          const repoPath = scope === 'project' ? detectRepoPath() : null
          if (repoPath) {
            codeTodos = scanCodeTodos(repoPath)
            if (topic) {
              codeTodos = codeTodos.filter((ct) => ct.topic_name === topic)
            }
          }
        }

        // Group by topic
        const groupMap = new Map<string, (TodoWithMeta | CodeTodo)[]>()

        for (const todo of manualTodos) {
          const key = todo.topic_name ?? 'sin-topic'
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
          .map(([topicName, items]) => ({ topic: topicName, items }))

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              groups,
              summary: {
                manual: manualTodos.length,
                code: codeTodos.length,
                total: manualTodos.length + codeTodos.length,
              },
            }),
          }],
        }
      } catch (err: unknown) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: `Error listando TODOs: ${(err as Error).message}` }],
        }
      }
    },
  )
}
