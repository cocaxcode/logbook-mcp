import type { StorageBackend } from './types.js'
import { resolveConfig } from '../config.js'
import { ObsidianStorage } from './obsidian/index.js'

let instance: StorageBackend | null = null

export function getStorage(): StorageBackend {
  if (instance) return instance
  const config = resolveConfig()
  instance = new ObsidianStorage(config.dir, { language: config.language ?? undefined })
  return instance
}

export function resetStorage(): void {
  instance = null
}
