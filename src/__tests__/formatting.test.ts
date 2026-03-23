import { describe, it, expect } from 'vitest'
import { formatTodoCheckbox, formatStandup, formatDecision, formatDebug } from '../storage/obsidian/formatting.js'

describe('formatTodoCheckbox', () => {
  it('formats pending normal todo', () => {
    const result = formatTodoCheckbox('Fix CORS', 'normal')
    expect(result).toBe('- [ ] Fix CORS')
  })

  it('formats pending high priority todo', () => {
    const result = formatTodoCheckbox('Fix CORS', 'high')
    expect(result).toContain('- [ ] Fix CORS')
    expect(result).toContain('\uD83D\uDD3C') // 🔼
  })

  it('formats pending urgent todo', () => {
    const result = formatTodoCheckbox('Fix CORS', 'urgent')
    expect(result).toContain('\u23EB') // ⏫
  })

  it('formats pending todo with due date', () => {
    const result = formatTodoCheckbox('Fix CORS', 'normal', '2026-03-25')
    expect(result).toContain('\uD83D\uDCC5 2026-03-25') // 📅
  })

  it('formats done todo', () => {
    const result = formatTodoCheckbox('Fix CORS', 'normal', null, true, '2026-03-21T10:00:00Z')
    expect(result).toContain('- [x]')
    expect(result).toContain('\u2705 2026-03-21') // ✅
  })

  it('does not show due date when done', () => {
    const result = formatTodoCheckbox('Fix', 'normal', '2026-03-25', true, '2026-03-21T10:00:00Z')
    expect(result).not.toContain('\uD83D\uDCC5') // 📅
  })
})

describe('formatStandup', () => {
  it('formats standup with sections', () => {
    const result = formatStandup('Fixed bugs', 'New feature', 'Blocked by API')
    expect(result).toContain('## Yesterday')
    expect(result).toContain('Fixed bugs')
    expect(result).toContain('## Today')
    expect(result).toContain('New feature')
    expect(result).toContain('## Blockers')
    expect(result).toContain('Blocked by API')
  })

  it('uses "Ninguno" for empty blockers', () => {
    const result = formatStandup('Fixed bugs', 'New feature', '')
    expect(result).toContain('Ninguno')
  })
})

describe('formatDecision', () => {
  it('formats ADR-style decision', () => {
    const result = formatDecision(
      'Use JWT',
      'Need auth for API',
      ['JWT', 'Sessions', 'OAuth'],
      'JWT for stateless auth',
      'Need token refresh logic',
    )
    expect(result).toContain('# Use JWT')
    expect(result).toContain('## Contexto')
    expect(result).toContain('1. JWT')
    expect(result).toContain('2. Sessions')
    expect(result).toContain('3. OAuth')
    expect(result).toContain('## Decision')
    expect(result).toContain('## Consecuencias')
  })
})

describe('formatDebug', () => {
  it('formats debug entry with callout', () => {
    const result = formatDebug('CORS Bug', 'Error 403', 'Missing headers', 'Added CORS middleware')
    expect(result).toContain('> [!bug] CORS Bug')
    expect(result).toContain('**Error**')
    expect(result).toContain('**Causa**')
    expect(result).toContain('**Fix**')
  })

  it('includes attachment when provided', () => {
    const result = formatDebug('Bug', 'Error', 'Cause', 'Fix', 'screenshot.png')
    expect(result).toContain('![[screenshot.png]]')
  })

  it('omits attachment when not provided', () => {
    const result = formatDebug('Bug', 'Error', 'Cause', 'Fix')
    expect(result).not.toContain('![[')
  })
})
