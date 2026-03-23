import { basename } from 'node:path'
import type { WorkspaceInfo } from '../types.js'

/**
 * Detect workspace and project from a repo path.
 *
 * Heuristic:
 * 1. If path contains /projects/ → workspace = segment before "projects", project = basename
 *    Example: C:/cocaxcode/projects/cocaxcode-api → { workspace: "cocaxcode", project: "cocaxcode-api" }
 * 2. If no /projects/ → workspace = parent directory name
 *    Example: C:/optimus/optimus-hub → { workspace: "optimus", project: "optimus-hub" }
 * 3. No repo → env LOGBOOK_WORKSPACE or "default", project = "global"
 */
export function detectWorkspace(repoPath: string | null): WorkspaceInfo {
  if (!repoPath) {
    return {
      workspace: process.env.LOGBOOK_WORKSPACE || 'default',
      project: 'global',
    }
  }

  const normalized = repoPath.replace(/\\/g, '/')
  const project = basename(normalized)

  // Buscar /projects/ o /proyectos/ en el path (case-insensitive)
  const lowerPath = normalized.toLowerCase()
  let projectsIdx = lowerPath.indexOf('/projects/')
  if (projectsIdx === -1) {
    projectsIdx = lowerPath.indexOf('/proyectos/')
  }
  if (projectsIdx !== -1) {
    const before = normalized.slice(0, projectsIdx)
    const workspace = basename(before)
    if (workspace) {
      return { workspace, project }
    }
  }

  // Fallback: directorio padre como workspace
  const parts = normalized.split('/').filter(Boolean)
  if (parts.length >= 2) {
    return { workspace: parts[parts.length - 2], project }
  }

  return {
    workspace: process.env.LOGBOOK_WORKSPACE || 'default',
    project,
  }
}
