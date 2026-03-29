declare const __PKG_VERSION__: string

/**
 * Parse CLI args into env vars so config.ts picks them up.
 * Supports: --storage obsidian --dir "C:/path/to/vault" --workspace "name"
 * CLI args take precedence over env vars and config file.
 */
function applyCliArgs(argv: string[]): void {
  const storageIdx = argv.indexOf('--storage')
  if (storageIdx !== -1 && argv[storageIdx + 1]) {
    process.env.LOGBOOK_STORAGE = argv[storageIdx + 1]
  }

  const dirIdx = argv.indexOf('--dir')
  if (dirIdx !== -1 && argv[dirIdx + 1]) {
    process.env.LOGBOOK_DIR = argv[dirIdx + 1]
  }

  const workspaceIdx = argv.indexOf('--workspace')
  if (workspaceIdx !== -1 && argv[workspaceIdx + 1]) {
    process.env.LOGBOOK_WORKSPACE = argv[workspaceIdx + 1]
  }
}

async function main() {
  const argv = process.argv.slice(2)
  const hasMcpFlag = argv.includes('--mcp')

  if (hasMcpFlag) {
    // Apply CLI args before anything reads config
    applyCliArgs(argv)

    const { resolveConfig, ensureConfigFile } = await import('./config.js')
    ensureConfigFile()
    const config = resolveConfig()

    // Auto-migrate if switching to obsidian with existing SQLite data
    if (config.storage === 'obsidian' && config.autoMigrate) {
      const { checkAndMigrate } = await import('./auto-migrate.js')
      await checkAndMigrate(config)
    }

    const { StdioServerTransport } = await import(
      '@modelcontextprotocol/sdk/server/stdio.js'
    )
    const { createServer } = await import('./server.js')

    const server = createServer()
    const transport = new StdioServerTransport()
    await server.connect(transport)
    console.error(`logbook-mcp server running on stdio (storage: ${config.storage}${config.storage === 'obsidian' ? `, dir: ${config.dir}` : ''})`)

    const shutdown = async () => {
      console.error('logbook-mcp: shutting down...')
      try {
        await server.close()
      } catch {
        // Ignorar errores de cierre
      }
      process.exit(0)
    }

    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)
  } else {
    const { runCli } = await import('./cli.js')
    await runCli(argv)
  }
}

main().catch((err) => {
  console.error(`Fatal: ${(err as Error).message}`)
  process.exit(1)
})
