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
 * Skips names already wrapped in [[]].
 * Only wraps whole-word matches.
 * Optionally also wraps known entry titles.
 */
export function applyWikilinks(content: string, knownProjects: string[], knownEntries?: string[]): string {
  const allNames = [...knownProjects, ...(knownEntries || [])]
  if (allNames.length === 0) return content

  let result = content

  for (const name of allNames) {
    // Skip if name is too short (avoid false positives)
    if (name.length < 3) continue

    // Regex: match name as whole word, NOT already inside [[]]
    // Negative lookbehind for [[ and negative lookahead for ]]
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(`(?<!\\[\\[)\\b(${escaped})\\b(?!\\]\\])`, 'gi')

    result = result.replace(regex, '[[$1]]')
  }

  return result
}
