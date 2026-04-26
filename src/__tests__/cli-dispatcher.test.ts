import { describe, it, expect, vi, afterEach } from 'vitest'
import { dispatch } from '../cli/dispatcher.js'

const log = vi.spyOn(console, 'log').mockImplementation(() => {})
const err = vi.spyOn(console, 'error').mockImplementation(() => {})

afterEach(() => {
  log.mockClear()
  err.mockClear()
})

describe('dispatch', () => {
  it('prints help on no args', async () => {
    expect(await dispatch(['node', 'logbook-mcp'])).toBe(0)
    expect(log).toHaveBeenCalled()
    expect(log.mock.calls[0][0]).toContain('USAGE')
  })

  it('prints version with -v', async () => {
    expect(await dispatch(['node', 'logbook-mcp', '-v'])).toBe(0)
    expect(log.mock.calls[0][0]).toMatch(/logbook-mcp v/)
  })

  it('returns 1 for unknown command', async () => {
    expect(await dispatch(['node', 'logbook-mcp', 'frobnicate'])).toBe(1)
  })

  it('routes setup status command (returns 0 or 1, no throw)', async () => {
    const code = await dispatch(['node', 'logbook-mcp', 'setup', 'status'])
    expect([0, 1]).toContain(code)
  })
})
