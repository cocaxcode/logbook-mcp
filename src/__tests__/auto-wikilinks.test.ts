import { describe, it, expect } from 'vitest'
import { autoWrapIds, expandRefShortcut, applyAutoWikilinks } from '../core/auto-wikilinks.js'

describe('autoWrapIds', () => {
  it('wraps id present in vault index', () => {
    const idx = new Set(['2026-04-15-plan'])
    expect(autoWrapIds('Ver 2026-04-15-plan ahora', idx)).toBe('Ver [[2026-04-15-plan]] ahora')
  })

  it('does not wrap id absent from index', () => {
    expect(autoWrapIds('Ver 2026-04-15-plan ahora', new Set())).toBe('Ver 2026-04-15-plan ahora')
  })

  it('is idempotent: does not re-wrap existing wikilink', () => {
    const idx = new Set(['2026-04-15-plan'])
    expect(autoWrapIds('Ver [[2026-04-15-plan]] ahora', idx)).toBe('Ver [[2026-04-15-plan]] ahora')
  })

  it('handles multiple ids in one content', () => {
    const idx = new Set(['2026-04-15-plan', '2026-04-19-memory'])
    const out = autoWrapIds('De 2026-04-15-plan a 2026-04-19-memory', idx)
    expect(out).toBe('De [[2026-04-15-plan]] a [[2026-04-19-memory]]')
  })

  it('only wraps known ids when both known and unknown present', () => {
    const idx = new Set(['2026-04-15-plan'])
    const out = autoWrapIds('De 2026-04-15-plan a 2026-04-19-other', idx)
    expect(out).toBe('De [[2026-04-15-plan]] a 2026-04-19-other')
  })
})

describe('expandRefShortcut', () => {
  it('replaces ref:<id> with [[id]] when id known', () => {
    const idx = new Set(['2026-04-15-plan'])
    expect(expandRefShortcut('Ver ref:2026-04-15-plan', idx)).toBe('Ver [[2026-04-15-plan]]')
  })

  it('leaves ref:<id> untouched when id unknown', () => {
    expect(expandRefShortcut('Ver ref:2026-04-15-plan', new Set())).toBe('Ver ref:2026-04-15-plan')
  })
})

describe('applyAutoWikilinks', () => {
  it('disabled when config.autoWikilink === false', () => {
    const idx = new Set(['2026-04-15-plan'])
    expect(applyAutoWikilinks('Ver 2026-04-15-plan', idx, { autoWikilink: false })).toBe('Ver 2026-04-15-plan')
  })

  it('enabled by default', () => {
    const idx = new Set(['2026-04-15-plan'])
    expect(applyAutoWikilinks('Ver 2026-04-15-plan', idx)).toBe('Ver [[2026-04-15-plan]]')
  })

  it('combines ref expansion + auto-wrap', () => {
    const idx = new Set(['2026-04-15-plan'])
    const out = applyAutoWikilinks('Plan ref:2026-04-15-plan, no 2026-04-15-plan', idx)
    expect(out).toBe('Plan [[2026-04-15-plan]], no [[2026-04-15-plan]]')
  })
})
