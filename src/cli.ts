declare const __PKG_VERSION__: string
const VERSION = typeof __PKG_VERSION__ !== 'undefined' ? __PKG_VERSION__ : '0.0.0'

export async function runCli(argv: string[]): Promise<void> {
  if (argv.includes('--version') || argv.includes('-v')) {
    console.log(`logbook-mcp v${VERSION}`)
    return
  }

  console.log(`logbook-mcp v${VERSION}`)
  console.log('')
  console.log('Uso:')
  console.log('  logbook-mcp --mcp    Iniciar como MCP server (stdio)')
  console.log('  logbook-mcp -v       Mostrar version')
  console.log('')
  console.log('Para usar con Claude Code, añade a tu configuracion MCP:')
  console.log('  "logbook-mcp": {')
  console.log('    "command": "npx",')
  console.log('    "args": ["@cocaxcode/logbook-mcp@latest", "--mcp"]')
  console.log('  }')
}
