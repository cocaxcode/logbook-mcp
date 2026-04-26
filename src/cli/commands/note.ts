import { getStorage } from '../../storage/index.js'

export function runNote(args: string[]): number {
  const topicIdx = args.indexOf('--topic')
  const topic = topicIdx !== -1 ? args[topicIdx + 1] : undefined
  const positional = args.filter((_, i) => {
    if (args[i].startsWith('--')) return false
    if (i > 0 && args[i - 1] === '--topic') return false
    return true
  })
  const content = positional.join(' ').trim()
  if (!content) {
    console.error('Usage: logbook-mcp note <content> [--topic X]')
    return 1
  }
  try {
    const storage = getStorage()
    storage.autoRegisterRepo()
    const entry = storage.insertNote(content, topic)
    console.log(JSON.stringify(entry, null, 2))
    return 0
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`)
    return 1
  }
}
