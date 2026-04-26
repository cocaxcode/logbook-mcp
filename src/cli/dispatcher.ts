import { runSetup } from './commands/setup.js'
import { runNote } from './commands/note.js'
import { runTodo } from './commands/todo.js'
import { runSearch } from './commands/search.js'

declare const __PKG_VERSION__: string
const VERSION = typeof __PKG_VERSION__ !== 'undefined' ? __PKG_VERSION__ : '0.0.0'

const HELP = `logbook-mcp v${VERSION}

USAGE
  logbook-mcp --mcp [--dir <path>] [--workspace <name>]   Start MCP server (stdio)
  logbook-mcp setup init    [--vault <path>] [--client <name>] [--workspace <name>] [--force] [--non-interactive]
  logbook-mcp setup status
  logbook-mcp note <content> [--topic <name>]
  logbook-mcp todo add <content> [--topic <name>] [--priority urgent|high|normal|low]
  logbook-mcp search <query> [--scope project|global]
  logbook-mcp -v, --version

CLIENTS for setup --client: claude-code (default), claude-desktop, cursor, windsurf, vscode, codex, gemini

ENV (overridden by CLI flags)
  LOGBOOK_DIR        Path to vault root (e.g. /path/to/vault/logbook)
  LOGBOOK_WORKSPACE  Workspace name (auto-detected from git when omitted)
`

export async function dispatch(argv: string[]): Promise<number> {
  const args = argv.slice(2)

  if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
    console.log(HELP)
    return 0
  }
  if (args.includes('-v') || args.includes('--version')) {
    console.log(`logbook-mcp v${VERSION}`)
    return 0
  }

  const [cmd, ...rest] = args

  switch (cmd) {
    case 'setup': {
      const sub = (rest[0] === 'init' || rest[0] === 'status' || rest[0] === 'reorganize') ? rest[0] : undefined
      return runSetup({ sub, rest: sub ? rest.slice(1) : rest })
    }
    case 'note':
      return runNote(rest)
    case 'todo':
      return runTodo(rest[0], rest.slice(1))
    case 'search':
      return runSearch(rest)
    default:
      console.error(`Unknown command: ${cmd}`)
      console.error(HELP)
      return 1
  }
}
