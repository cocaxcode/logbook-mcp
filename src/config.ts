import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'

export type StorageMode = 'sqlite' | 'obsidian'

export interface LogbookConfig {
  storage: StorageMode
  dir: string | null
  workspace: string | null
  autoMigrate: boolean
}

const DEFAULTS: LogbookConfig = {
  storage: 'sqlite',
  dir: null,
  workspace: null,
  autoMigrate: true,
}

const VALID_MODES: StorageMode[] = ['sqlite', 'obsidian']

/** Base directory for logbook data (~/.logbook or LOGBOOK_BASE_DIR) */
export function getBaseDir(): string {
  return process.env.LOGBOOK_BASE_DIR ?? join(homedir(), '.logbook')
}

/** Path to config file */
export function getConfigPath(): string {
  return join(getBaseDir(), 'config.json')
}

/** Load config from file. Returns null if file doesn't exist. */
export function loadConfig(): LogbookConfig | null {
  const configPath = getConfigPath()
  try {
    const content = readFileSync(configPath, 'utf-8')
    const parsed = JSON.parse(content)
    return {
      storage: VALID_MODES.includes(parsed.storage) ? parsed.storage : DEFAULTS.storage,
      dir: typeof parsed.dir === 'string' ? parsed.dir : DEFAULTS.dir,
      workspace: typeof parsed.workspace === 'string' ? parsed.workspace : DEFAULTS.workspace,
      autoMigrate: typeof parsed.autoMigrate === 'boolean' ? parsed.autoMigrate : DEFAULTS.autoMigrate,
    }
  } catch {
    return null
  }
}

/** Write config to file. Creates directory if needed. */
export function writeConfig(config: LogbookConfig): void {
  const configPath = getConfigPath()
  const dir = dirname(configPath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
}

/**
 * Resolve final config with priority chain:
 * 1. CLI args (already written to process.env by applyCliArgs in index.ts)
 * 2. Environment variables
 * 3. Config file (~/.logbook/config.json)
 * 4. Defaults
 */
export function resolveConfig(): LogbookConfig {
  const fileConfig = loadConfig()

  // Storage mode: env > file > default
  let storage: StorageMode = DEFAULTS.storage
  const envStorage = process.env.LOGBOOK_STORAGE?.toLowerCase()
  if (envStorage) {
    if (envStorage === 'obsidian') storage = 'obsidian'
    else if (envStorage === 'sqlite') storage = 'sqlite'
    else throw new Error(`LOGBOOK_STORAGE invalido: "${envStorage}". Valores validos: ${VALID_MODES.join(', ')}`)
  } else if (fileConfig?.storage) {
    storage = fileConfig.storage
  }

  // Dir: env > file > default
  const dir = process.env.LOGBOOK_DIR ?? fileConfig?.dir ?? DEFAULTS.dir

  // Workspace: env > file > default
  const workspace = process.env.LOGBOOK_WORKSPACE ?? fileConfig?.workspace ?? DEFAULTS.workspace

  // AutoMigrate: file > default (not configurable via env)
  const autoMigrate = fileConfig?.autoMigrate ?? DEFAULTS.autoMigrate

  // Validate: obsidian requires dir
  if (storage === 'obsidian' && !dir) {
    throw new Error(
      'Se requiere un directorio cuando storage=obsidian. ' +
      'Configura "dir" en ~/.logbook/config.json, pasa --dir <path>, o define LOGBOOK_DIR.',
    )
  }

  return { storage, dir, workspace, autoMigrate }
}

/** Ensure config file exists with current resolved values. */
export function ensureConfigFile(): void {
  if (!existsSync(getConfigPath())) {
    writeConfig(DEFAULTS)
  }
}
