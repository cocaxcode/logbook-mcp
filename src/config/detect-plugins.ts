import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const RELEVANT = new Set([
  'periodic-notes',
  'templater-obsidian',
  'obsidian-tasks-plugin',
  'dataview',
  'obsidian-livesync',
])

/** Read the list of community plugins enabled in a vault. Returns plugin ids. */
export function detectPlugins(vaultPath: string): string[] {
  const file = join(vaultPath, '.obsidian', 'community-plugins.json')
  if (!existsSync(file)) return []
  try {
    const raw = JSON.parse(readFileSync(file, 'utf-8'))
    if (!Array.isArray(raw)) return []
    return raw.filter((id): id is string => typeof id === 'string')
  } catch {
    return []
  }
}

/** Subset of detected plugins relevant to the wizard. */
export function detectRelevantPlugins(vaultPath: string): string[] {
  return detectPlugins(vaultPath).filter((id) => RELEVANT.has(id))
}
