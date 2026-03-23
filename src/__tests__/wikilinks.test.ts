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
})
