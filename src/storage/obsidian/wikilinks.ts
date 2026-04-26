import { existsSync, readdirSync } from 'node:fs'
import { basename, join } from 'node:path'

/**
 * Get known project names by scanning subdirectories of the vault.
 * Scans: baseDir/{workspace}/{project}/
 */
export function getKnownProjects(baseDir: string): string[] {
  const projects: string[] = []

  try {
    // Scan workspace dirs
    const workspaces = readdirSync(baseDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())

    for (const ws of workspaces) {
      // Scan project dirs inside each workspace
      try {
        const projectDirs = readdirSync(join(baseDir, ws.name), { withFileTypes: true })
          .filter((d) => d.isDirectory())

        for (const proj of projectDirs) {
          projects.push(proj.name)
        }
      } catch {
        // Skip unreadable workspace dirs
      }
    }
  } catch {
    // baseDir doesn't exist yet or not readable
  }

  return [...new Set(projects)] // Deduplicate
}

/**
 * Get known entry titles from decisions/ and debug/ directories.
 * Extracts titles from filename slugs (converts dashes to spaces, strips date prefix).
 * Only returns titles longer than 4 characters.
 */
/**
 * Collect all entry IDs (`YYYY-MM-DD-slug`) reachable under projectDir.
 * Used by the auto-wikilinks middleware to wrap mentions of existing notes.
 */
export function getVaultIdSet(projectDir: string): Set<string> {
  const ids = new Set<string>()
  const subDirs = ['notes', 'todos', 'decisions', 'debug', 'standups', 'reminders']
  for (const sub of subDirs) {
    const dir = join(projectDir, sub)
    if (!existsSync(dir)) continue
    try {
      const files = readdirSync(dir, { withFileTypes: true })
        .filter((f) => f.isFile() && f.name.endsWith('.md'))
      for (const file of files) {
        const name = basename(file.name, '.md')
        if (/^\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]*$/.test(name)) ids.add(name)
      }
    } catch {}
  }
  return ids
}

export function getKnownEntryTitles(_baseDir: string, projectDir: string): string[] {
  const titles: string[] = []
  const subDirs = ['decisions', 'debug']

  for (const sub of subDirs) {
    const dir = join(projectDir, sub)
    if (!existsSync(dir)) continue

    try {
      const files = readdirSync(dir, { withFileTypes: true })
        .filter((f) => f.isFile() && f.name.endsWith('.md'))

      for (const file of files) {
        const name = basename(file.name, '.md')
        // Strip date prefix (YYYY-MM-DD-)
        const withoutDate = name.replace(/^\d{4}-\d{2}-\d{2}-/, '')
        // Convert dashes to spaces
        const title = withoutDate.replace(/-/g, ' ')

        if (title.length > 4) {
          titles.push(title)
        }
      }
    } catch {
      // Skip unreadable dirs
    }
  }

  return [...new Set(titles)]
}

/**
 * Wrap known project names in [[wikilinks]] for Obsidian.
 *
 * Splits the content into segments outside vs. inside existing `[[...]]` and
 * only applies replacements on outside segments. This prevents nested wikilinks
 * such as `[[2026-04-26-prueba-v2-[[logbook-mcp]]-...]]` when an auto-wrapped
 * id contains a known project name.
 *
 * Only wraps whole-word matches (length >= 3).
 * Optionally also wraps known entry titles.
 */
export function applyWikilinks(content: string, knownProjects: string[], knownEntries?: string[]): string {
  const allNames = [...knownProjects, ...(knownEntries || [])]
  if (allNames.length === 0) return content

  // Split: even-indexed parts are outside wikilinks, odd-indexed are wikilinks themselves.
  const parts = content.split(/(\[\[[^\]]*\]\])/g)

  for (let i = 0; i < parts.length; i += 2) {
    let segment = parts[i]
    for (const name of allNames) {
      if (name.length < 3) continue
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const regex = new RegExp(`\\b(${escaped})\\b`, 'gi')
      segment = segment.replace(regex, '[[$1]]')
    }
    parts[i] = segment
  }

  return parts.join('')
}
