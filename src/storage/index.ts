import type { StorageBackend } from './types.js'
import type { StorageMode } from '../config.js'
import { resolveConfig } from '../config.js'
import { SqliteStorage } from './sqlite/index.js'
import { ObsidianStorage } from './obsidian/index.js'

let instance: StorageBackend | null = null
let resolvedMode: StorageMode | null = null

export function getStorageMode(): StorageMode {
  if (resolvedMode) return resolvedMode
  const config = resolveConfig()
  resolvedMode = config.storage
  return resolvedMode
}

export function getStorage(): StorageBackend {
  if (instance) return instance

  const config = resolveConfig()
  resolvedMode = config.storage

  if (config.storage === 'obsidian') {
    // dir is guaranteed non-null by resolveConfig() validation
    instance = new ObsidianStorage(config.dir!)
  } else {
    instance = new SqliteStorage()
  }

  return instance
}

export function resetStorage(): void {
  instance = null
  resolvedMode = null
}

export type { StorageMode }
