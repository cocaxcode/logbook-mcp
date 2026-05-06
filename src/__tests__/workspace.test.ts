import { describe, it, expect, afterEach } from 'vitest'
import { detectWorkspace } from '../storage/obsidian/workspace.js'

describe('detectWorkspace', () => {
  const originalEnv = process.env.LOGBOOK_WORKSPACE

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.LOGBOOK_WORKSPACE = originalEnv
    } else {
      delete process.env.LOGBOOK_WORKSPACE
    }
  })

  it('detects workspace from /projects/ path', () => {
    const result = detectWorkspace('C:/cocaxcode/projects/cocaxcode-api')
    expect(result).toEqual({ workspace: 'cocaxcode', project: 'cocaxcode-api' })
  })

  it('detects workspace from backslash path', () => {
    const result = detectWorkspace('C:\\cocaxcode\\projects\\cocaxcode-web')
    expect(result).toEqual({ workspace: 'cocaxcode', project: 'cocaxcode-web' })
  })

  it('detects workspace without /projects/', () => {
    const result = detectWorkspace('C:/optimus/optimus-hub')
    expect(result).toEqual({ workspace: 'optimus', project: 'optimus-hub' })
  })

  it('returns default for null repoPath', () => {
    const result = detectWorkspace(null)
    expect(result).toEqual({ workspace: 'default', project: 'global' })
  })

  it('uses env var LOGBOOK_WORKSPACE when null', () => {
    process.env.LOGBOOK_WORKSPACE = 'my-workspace'
    const result = detectWorkspace(null)
    expect(result.workspace).toBe('my-workspace')
  })

  it('handles deep paths with /projects/', () => {
    const result = detectWorkspace('/home/user/code/cocaxcode/projects/logbook-mcp')
    expect(result).toEqual({ workspace: 'cocaxcode', project: 'logbook-mcp' })
  })

  it('does not return a Windows drive letter as workspace', () => {
    // Repo at the root of a drive: C:\ingles → workspace must NOT be "C:"
    // because that produces an invalid NTFS path like vault/logbook/C:/ingles.
    const result = detectWorkspace('C:\\ingles')
    expect(result.workspace).not.toMatch(/^[a-zA-Z]:$/)
    expect(result.workspace).not.toContain(':')
    expect(result.project).toBe('ingles')
  })

  it('falls back to default when only a drive letter is present', () => {
    const result = detectWorkspace('C:/ingles')
    expect(result.workspace).toBe('default')
    expect(result.project).toBe('ingles')
  })

  it('strips characters invalid in Windows directory names', () => {
    const result = detectWorkspace('C:/weird:project*name?/sub')
    expect(result.workspace).not.toMatch(/[<>:"/\\|?*]/)
    expect(result.project).not.toMatch(/[<>:"/\\|?*]/)
  })
})
