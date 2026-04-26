import { resolveConfig, getConfigPath, getBaseDir, writeConfig } from '../../config.js'
import { detectVaults } from '../../config/detect-vaults.js'
import { detectRelevantPlugins } from '../../config/detect-plugins.js'
import { buildSnippet, type McpClient } from '../snippet.js'
import { existsSync, copyFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

interface SetupArgs {
  sub: 'init' | 'status' | 'reorganize' | undefined
  rest: string[]
}

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`)
  if (i === -1) return undefined
  return args[i + 1]
}

function hasFlag(args: string[], name: string): boolean {
  return args.includes(`--${name}`)
}

export async function runSetup(args: SetupArgs): Promise<number> {
  switch (args.sub) {
    case 'status':
      return runStatus()
    case 'init':
      return runInit(args.rest)
    case 'reorganize':
      console.error('reorganize: aún no implementado en v2.0 — usa setup init para reescribir config.')
      return 1
    default:
      console.error('Uso: logbook-mcp setup <init|status|reorganize>')
      return 1
  }
}

function runStatus(): number {
  try {
    const config = resolveConfig()
    const out = {
      dir: config.dir,
      workspace: config.workspace,
      configFile: getConfigPath(),
      baseDir: getBaseDir(),
    }
    console.log(JSON.stringify(out, null, 2))
    return 0
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`)
    return 1
  }
}

async function runInit(rest: string[]): Promise<number> {
  const nonInteractive = hasFlag(rest, 'non-interactive') || hasFlag(rest, 'force')
  const force = hasFlag(rest, 'force')
  const vaultArg = flag(rest, 'vault')
  const workspaceArg = flag(rest, 'workspace')
  const clientArg = (flag(rest, 'client') ?? 'claude-code') as McpClient

  // Detect vault
  let vaultDir = vaultArg
  if (!vaultDir) {
    const vaults = detectVaults()
    if (vaults.length === 1) {
      vaultDir = vaults[0].path
      console.error(`Detected vault: ${vaultDir} (${vaults[0].source})`)
    } else if (vaults.length > 1) {
      if (nonInteractive) {
        console.error(`Multiple vaults found, pass --vault <path>:`)
        for (const v of vaults) console.error(`  - ${v.path} (${v.source})`)
        return 1
      }
      // Interactive: ask
      const prompts = await import('@clack/prompts')
      const choice = await prompts.select<string>({
        message: 'Choose Obsidian vault',
        options: vaults.map((v) => ({ value: v.path, label: `${v.path} (${v.source})` })),
      })
      if (prompts.isCancel(choice)) {
        prompts.cancel('cancelled')
        return 1
      }
      vaultDir = choice as string
    } else {
      console.error('No Obsidian vault detected. Pass --vault <path>.')
      return 1
    }
  }

  if (!existsSync(vaultDir)) {
    console.error(`Vault path does not exist: ${vaultDir}`)
    return 1
  }

  // Detect plugins as informational
  const plugins = detectRelevantPlugins(vaultDir)
  if (plugins.length) console.error(`Detected plugins: ${plugins.join(', ')}`)

  // Resolve target dir under vault: <vault>/logbook
  const dir = join(vaultDir, 'logbook')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

  // Existing config check
  const cfgPath = getConfigPath()
  if (existsSync(cfgPath) && !force) {
    if (nonInteractive) {
      console.error(`Config already exists at ${cfgPath}; pass --force to overwrite (a backup will be created).`)
      return 1
    }
    const prompts = await import('@clack/prompts')
    const choice = await prompts.select<string>({
      message: `Config already exists at ${cfgPath}. What to do?`,
      options: [
        { value: 'adopt', label: 'Adopt existing (no changes)' },
        { value: 'overwrite', label: 'Overwrite (creates a backup)' },
        { value: 'cancel', label: 'Cancel' },
      ],
    })
    if (prompts.isCancel(choice) || choice === 'cancel') return 1
    if (choice === 'adopt') {
      printSnippet(dir, workspaceArg, clientArg)
      return 0
    }
  }

  // Write config (with backup if existed)
  if (existsSync(cfgPath)) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16)
    const backup = `${cfgPath}.bak-${ts}`
    copyFileSync(cfgPath, backup)
    console.error(`Backed up existing config to ${backup}`)
  }
  writeConfig({ dir, workspace: workspaceArg ?? null })
  console.error(`Wrote config to ${cfgPath}`)

  printSnippet(dir, workspaceArg, clientArg)
  return 0
}

function printSnippet(vaultDir: string, workspace: string | undefined, client: McpClient): void {
  console.log('\nMCP snippet (paste into your client config):\n')
  console.log(buildSnippet({ vaultDir, workspace, client }))
}
