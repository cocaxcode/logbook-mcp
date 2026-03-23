import type { StorageBackend, StorageMode } from './types.js'
import { SqliteStorage } from './sqlite/index.js'
import { ObsidianStorage } from './obsidian/index.js'

const VALID_MODES = ['sqlite', 'obsidian'] as const

let instance: StorageBackend | null = null

export function getStorageMode(): StorageMode {
  const mode = process.env.LOGBOOK_STORAGE?.toLowerCase()
  if (!mode) return 'sqlite'
  if (mode === 'obsidian') return 'obsidian'
  if (mode === 'sqlite') return 'sqlite'
  throw new Error(
    `LOGBOOK_STORAGE invalido: "${mode}". Valores validos: ${VALID_MODES.join(', ')}`,
  )
}

export function getStorage(): StorageBackend {
  if (instance) return instance

  const mode = getStorageMode()

  if (mode === 'obsidian') {
    const dir = process.env.LOGBOOK_DIR
    if (!dir) {
      throw new Error(
        'LOGBOOK_DIR es requerido cuando LOGBOOK_STORAGE=obsidian. Debe apuntar a la carpeta del vault de Obsidian.',
      )
    }
    instance = new ObsidianStorage(dir)
  } else {
    instance = new SqliteStorage()
  }

  return instance
}

export function resetStorage(): void {
  instance = null
}
