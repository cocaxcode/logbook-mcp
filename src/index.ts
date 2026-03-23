declare const __PKG_VERSION__: string

async function main() {
  const argv = process.argv.slice(2)
  const hasMcpFlag = argv.includes('--mcp')

  if (hasMcpFlag) {
    const { StdioServerTransport } = await import(
      '@modelcontextprotocol/sdk/server/stdio.js'
    )
    const { createServer } = await import('./server.js')

    const server = createServer()
    const transport = new StdioServerTransport()
    await server.connect(transport)
    console.error('logbook-mcp server running on stdio')

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
