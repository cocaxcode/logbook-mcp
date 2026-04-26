import { execFileSync } from 'node:child_process'

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

