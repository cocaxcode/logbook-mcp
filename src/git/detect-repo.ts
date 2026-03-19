import { execFileSync } from 'node:child_process'
import { basename } from 'node:path'
import type Database from 'better-sqlite3'
import type { Repo } from '../types.js'
import { getRepoByPath, insertRepo, getRepoByName } from '../db/queries.js'

export function detectRepoPath(): string | null {
  try {
    const result = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    return result.trim().replace(/\\/g, '/')
  } catch {
    return null
  }
}

export function isGitRepo(path: string): boolean {
  try {
    execFileSync('git', ['-C', path, 'rev-parse', '--is-inside-work-tree'], {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    return true
  } catch {
    return false
  }
}

export function autoRegisterRepo(db: Database.Database): Repo | null {
  const repoPath = detectRepoPath()
  if (!repoPath) return null

  const existing = getRepoByPath(db, repoPath)
  if (existing) return existing

  let name = basename(repoPath)

  // Handle name collision: append parent dir if name already exists
  const nameConflict = getRepoByName(db, name)
  if (nameConflict) {
    const parts = repoPath.split('/')
    const parent = parts.length >= 2 ? parts[parts.length - 2] : 'repo'
    name = `${parent}-${name}`
  }

  return insertRepo(db, name, repoPath)
}
