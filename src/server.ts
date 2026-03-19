import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerTopicsTool } from './tools/topics.js'
import { registerNoteTool } from './tools/note.js'
import { registerTodoAddTool } from './tools/todo-add.js'
import { registerTodoListTool } from './tools/todo-list.js'
import { registerTodoDoneTool } from './tools/todo-done.js'
import { registerTodoEditTool } from './tools/todo-edit.js'
import { registerTodoRmTool } from './tools/todo-rm.js'
import { registerLogTool } from './tools/log.js'
import { registerSearchTool } from './tools/search.js'

declare const __PKG_VERSION__: string
const VERSION = typeof __PKG_VERSION__ !== 'undefined' ? __PKG_VERSION__ : '0.0.0'

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'logbook-mcp',
    version: VERSION,
  })

  registerTopicsTool(server)
  registerNoteTool(server)
  registerTodoAddTool(server)
  registerTodoListTool(server)
  registerTodoDoneTool(server)
  registerTodoEditTool(server)
  registerTodoRmTool(server)
  registerLogTool(server)
  registerSearchTool(server)

  return server
}
