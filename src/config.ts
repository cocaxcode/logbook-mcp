import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'

export interface LogbookConfig {
  dir: string | null
  workspace: string | null
  /** Orama tokenizer language. Default 'spanish'. Common: 'english', 'french', 'german', 'portuguese', 'italian'. */
  language: string | null
}

const DEFAULTS: LogbookConfig = {
  dir: null,
  workspace: null,
  language: null,
}

/** Base directory for logbook metadata (~/.logbook or LOGBOOK_BASE_DIR). */
export function getBaseDir(): string {
  return process.env.LOGBOOK_BASE_DIR ?? join(homedir(), '.logbook')
}

/** Path to legacy config file (kept for v1 compat read-only). */
export function getConfigPath(): string {
  return join(getBaseDir(), 'config.json')
}

/** Load config from file. Ignores legacy SQLite-mode fields. */
export function loadConfig(): LogbookConfig | null {
  const configPath = getConfigPath()
  try {
    const content = readFileSync(configPath, 'utf-8')
    const parsed = JSON.parse(content)
    if (parsed.storage && parsed.storage !== 'obsidian') {
      console.error('[logbook] v1 SQLite config detected; v2 ignores SQLite mode and runs Obsidian-only.')
    }
    return {
      dir: typeof parsed.dir === 'string' ? parsed.dir : DEFAULTS.dir,
      workspace: typeof parsed.workspace === 'string' ? parsed.workspace : DEFAULTS.workspace,
      language: typeof parsed.language === 'string' ? parsed.language : DEFAULTS.language,
    }
  } catch {
    return null
  }
}

/** Write config to file. */
export function writeConfig(config: LogbookConfig): void {
  const configPath = getConfigPath()
  const dir = dirname(configPath)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
}

/**
 * Resolve final config with priority chain:
 * 1. Environment variables (LOGBOOK_DIR, LOGBOOK_WORKSPACE)
 * 2. Config file (~/.logbook/config.json)
 * 3. Defaults
 */
export function resolveConfig(): LogbookConfig & { dir: string } {
  const fileConfig = loadConfig()

  const dir = process.env.LOGBOOK_DIR ?? fileConfig?.dir ?? DEFAULTS.dir
  const workspace = process.env.LOGBOOK_WORKSPACE ?? fileConfig?.workspace ?? DEFAULTS.workspace
  const language = process.env.LOGBOOK_LANG ?? fileConfig?.language ?? DEFAULTS.language

  if (!dir) {
    throw new Error(
      'logbook-mcp v2 requires an Obsidian vault directory. Set "dir" in ~/.logbook/config.json, pass --dir <path>, or define LOGBOOK_DIR.',
    )
  }

  return { dir, workspace, language }
}

/** Ensure config file exists. */
export function ensureConfigFile(): void {
  if (!existsSync(getConfigPath())) {
    writeConfig(DEFAULTS)
  }
}
