import { describe, it, expect } from 'vitest'
import { applyWikilinks } from '../storage/obsidian/wikilinks.js'

describe('applyWikilinks', () => {
  it('wraps known project names in [[]]', () => {
    const result = applyWikilinks(
      'Working on cocaxcode-api today',
      ['cocaxcode-api', 'cocaxcode-web'],
    )
    expect(result).toBe('Working on [[cocaxcode-api]] today')
  })

  it('wraps multiple projects', () => {
    const result = applyWikilinks(
      'cocaxcode-api and cocaxcode-web integration',
      ['cocaxcode-api', 'cocaxcode-web'],
    )
    expect(result).toContain('[[cocaxcode-api]]')
    expect(result).toContain('[[cocaxcode-web]]')
  })

  it('does not double-wrap already linked', () => {
    const result = applyWikilinks(
      'Using [[cocaxcode-api]] already',
      ['cocaxcode-api'],
    )
    expect(result).toBe('Using [[cocaxcode-api]] already')
    expect(result).not.toContain('[[[')
  })

  it('skips short project names (< 3 chars)', () => {
    const result = applyWikilinks('The db is broken', ['db'])
    expect(result).toBe('The db is broken')
  })

  it('returns unchanged if no projects known', () => {
    const text = 'Just regular text'
    expect(applyWikilinks(text, [])).toBe(text)
  })

  it('handles whole-word matching', () => {
    const result = applyWikilinks(
      'logbook-mcp-extended is not logbook-mcp',
      ['logbook-mcp'],
    )
    // Should only wrap the standalone match, not the extended one
    expect(result).toContain('[[logbook-mcp]]')
  })

  it('does not produce nested wikilinks when project name appears inside an existing [[id]]', () => {
    // Regression for the bug surfaced in v2.0.0 smoke tests.
    const result = applyWikilinks(
      'Ver [[2026-04-26-prueba-v2-logbook-mcp-lanzamiento]] para detalles',
      ['logbook-mcp'],
    )
    expect(result).not.toContain('[[2026-04-26-prueba-v2-[[')
    expect(result).toBe('Ver [[2026-04-26-prueba-v2-logbook-mcp-lanzamiento]] para detalles')
  })

  it('wraps project name outside but skips inside when both contexts coexist', () => {
    const result = applyWikilinks(
      'logbook-mcp lanzado. Ver [[2026-04-26-prueba-logbook-mcp]].',
      ['logbook-mcp'],
    )
    expect(result).toBe('[[logbook-mcp]] lanzado. Ver [[2026-04-26-prueba-logbook-mcp]].')
  })
})
