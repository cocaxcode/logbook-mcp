import { getStorage } from '../../storage/index.js'
import type { Priority } from '../../types.js'

export function runTodo(sub: string | undefined, args: string[]): number {
  if (sub !== 'add') {
    console.error('Usage: logbook-mcp todo add <content> [--topic X] [--priority urgent|high|normal|low]')
    return 1
  }
  const topicIdx = args.indexOf('--topic')
  const topic = topicIdx !== -1 ? args[topicIdx + 1] : undefined
  const priorityIdx = args.indexOf('--priority')
  const priorityRaw = priorityIdx !== -1 ? args[priorityIdx + 1] : 'normal'
  const validPriority: Priority[] = ['urgent', 'high', 'normal', 'low']
  const priority = (validPriority.includes(priorityRaw as Priority) ? priorityRaw : 'normal') as Priority

  const positional = args.filter((_, i) => {
    if (args[i].startsWith('--')) return false
    const prev = args[i - 1]
    if (prev === '--topic' || prev === '--priority') return false
    return true
  })
  const content = positional.join(' ').trim()
  if (!content) {
    console.error('Usage: logbook-mcp todo add <content> [--topic X] [--priority P]')
    return 1
  }
  try {
    const storage = getStorage()
    storage.autoRegisterRepo()
    const entry = storage.insertTodo(content, { topic, priority })
    console.log(JSON.stringify(entry, null, 2))
    return 0
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`)
    return 1
  }
}
