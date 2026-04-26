import { dispatch } from './cli/dispatcher.js'

/** Legacy entry kept for compatibility with src/index.ts. */
export async function runCli(argv: string[]): Promise<void> {
  // dispatch() expects full process.argv (slices off first 2 internally).
  // From src/index.ts we receive argv = process.argv.slice(2), so re-pad.
  const padded = ['node', 'logbook-mcp', ...argv]
  const code = await dispatch(padded)
  if (code !== 0) process.exitCode = code
}
