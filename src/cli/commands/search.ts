import { getStorage } from '../../storage/index.js'

export function runSearch(args: string[]): number {
  const scopeIdx = args.indexOf('--scope')
  const scope = scopeIdx !== -1 ? args[scopeIdx + 1] : 'project'
  const positional = args.filter((_, i) => {
    if (args[i].startsWith('--')) return false
    if (args[i - 1] === '--scope') return false
    return true
  })
  const query = positional.join(' ').trim()
  if (!query) {
    console.error('Usage: logbook-mcp search <query> [--scope project|global]')
    return 1
  }
  try {
    const storage = getStorage()
    if (scope === 'project') storage.autoRegisterRepo()
    const results = storage.search(query, { scope: scope as 'project' | 'global', limit: 20 })
    console.log(JSON.stringify({ query, results, total: results.length }, null, 2))
    return 0
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`)
    return 1
  }
}
