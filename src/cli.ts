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
  console.log('  logbook-mcp --mcp                          Iniciar como MCP server (stdio, SQLite)')
  console.log('  logbook-mcp --mcp --storage obsidian --dir <path>  Iniciar en modo Obsidian')
  console.log('  logbook-mcp -v                             Mostrar version')
  console.log('')
  console.log('Opciones MCP:')
  console.log('  --storage <sqlite|obsidian>  Modo de almacenamiento (default: sqlite)')
  console.log('  --dir <path>                Directorio del vault Obsidian (requerido con --storage obsidian)')
  console.log('  --workspace <name>          Nombre del workspace (opcional)')
  console.log('')
  console.log('Las opciones CLI tienen prioridad sobre las variables de entorno')
  console.log('(LOGBOOK_STORAGE, LOGBOOK_DIR, LOGBOOK_WORKSPACE).')
  console.log('')
  console.log('Ejemplo SQLite (default):')
  console.log('  "logbook-mcp": {')
  console.log('    "command": "npx",')
  console.log('    "args": ["@cocaxcode/logbook-mcp@latest", "--mcp"]')
  console.log('  }')
  console.log('')
  console.log('Ejemplo Obsidian:')
  console.log('  "logbook-mcp": {')
  console.log('    "command": "npx",')
  console.log('    "args": ["@cocaxcode/logbook-mcp@latest", "--mcp", "--storage", "obsidian", "--dir", "C:/Users/me/vault/logbook"]')
  console.log('  }')
}
