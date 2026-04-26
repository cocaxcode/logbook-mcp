import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir, platform } from 'node:os'

export interface DetectedVault {
  path: string
  name: string
  source: 'obsidian-config' | 'common-folder'
}

function obsidianConfigPath(): string {
  const home = homedir()
  if (platform() === 'win32') return join(home, 'AppData', 'Roaming', 'obsidian', 'obsidian.json')
  if (platform() === 'darwin') return join(home, 'Library', 'Application Support', 'obsidian', 'obsidian.json')
  return join(home, '.config', 'obsidian', 'obsidian.json')
}

/** Read Obsidian's registered vaults from obsidian.json. */
export function readObsidianVaults(): DetectedVault[] {
  const path = obsidianConfigPath()
  if (!existsSync(path)) return []
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8'))
    const vaults = raw?.vaults ?? {}
    const out: DetectedVault[] = []
    for (const id of Object.keys(vaults)) {
      const v = vaults[id]
      if (typeof v?.path !== 'string') continue
      if (!existsSync(v.path)) continue
      out.push({
        path: v.path,
        name: v.path.split(/[\\/]/).filter(Boolean).pop() ?? id,
        source: 'obsidian-config',
      })
    }
    return out
  } catch {
    return []
  }
}

const COMMON_FOLDERS = ['Documents', 'ObsidianVault', 'Obsidian', 'Notes', 'Vault']

/** Scan common folders under home for `.obsidian/` directories. */
export function scanCommonFolders(): DetectedVault[] {
  const home = homedir()
  const out: DetectedVault[] = []
  for (const folder of COMMON_FOLDERS) {
    const root = join(home, folder)
    if (!existsSync(root)) continue
    try {
      if (existsSync(join(root, '.obsidian'))) {
        out.push({ path: root, name: folder, source: 'common-folder' })
      }
      const entries = readdirSync(root)
      for (const entry of entries) {
        const candidate = join(root, entry)
        try {
          if (!statSync(candidate).isDirectory()) continue
          if (existsSync(join(candidate, '.obsidian'))) {
            out.push({ path: candidate, name: entry, source: 'common-folder' })
          }
        } catch {}
      }
    } catch {}
  }
  return out
}

/** Cascade: obsidian.json > common folder scan. Deduplicates by path. */
export function detectVaults(): DetectedVault[] {
  const obs = readObsidianVaults()
  const seen = new Set(obs.map((v) => v.path))
  const out = [...obs]
  for (const v of scanCommonFolders()) {
    if (seen.has(v.path)) continue
    seen.add(v.path)
    out.push(v)
  }
  return out
}
