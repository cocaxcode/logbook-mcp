import { describe, it, expect } from 'vitest'
import {
  extractLinkedIds,
  stripWikilinkBrackets,
  upsertResolvedRef,
  removeResolvedRef,
} from '../storage/obsidian/index.js'

describe('extractLinkedIds', () => {
  it('finds date-prefixed ids inside [[...]]', () => {
    expect(extractLinkedIds('Ver [[2026-04-26-foo]] y luego [[2026-01-01-bar]]')).toEqual([
      '2026-04-26-foo',
      '2026-01-01-bar',
    ])
  })

  it('returns empty when no ids', () => {
    expect(extractLinkedIds('Sólo texto sin enlaces')).toEqual([])
  })

  it('deduplicates repeated ids', () => {
    expect(extractLinkedIds('[[2026-04-26-foo]] y [[2026-04-26-foo]] otra vez')).toEqual([
      '2026-04-26-foo',
    ])
  })
})

describe('stripWikilinkBrackets', () => {
  it('removes [[ ]] but keeps inner text', () => {
    expect(stripWikilinkBrackets('Ver [[2026-04-26-foo]] entonces')).toBe(
      'Ver 2026-04-26-foo entonces',
    )
  })
})

describe('upsertResolvedRef', () => {
  it('creates section if missing', () => {
    const body = '# Mi nota\n\ncontenido'
    const next = upsertResolvedRef(body, '42', 'Arreglar bug', '2026-04-26')
    expect(next).toContain('## ✅ Resueltos')
    expect(next).toContain('- ✅ 2026-04-26: TODO #42 — Arreglar bug')
  })

  it('appends to existing section without duplicating', () => {
    const body = '# Nota\n\n## ✅ Resueltos\n\n- ✅ 2026-04-25: TODO #41 — Otro\n'
    const next = upsertResolvedRef(body, '42', 'Arreglar bug', '2026-04-26')
    expect(next).toContain('TODO #41 — Otro')
    expect(next).toContain('TODO #42 — Arreglar bug')
  })

  it('updates existing line when same todoId is upserted again', () => {
    const body = '# Nota\n\n## ✅ Resueltos\n\n- ✅ 2026-04-25: TODO #42 — Old text\n'
    const next = upsertResolvedRef(body, '42', 'Updated text', '2026-04-26')
    expect(next).not.toContain('Old text')
    expect(next).toContain('TODO #42 — Updated text')
    expect(next.match(/TODO #42/g)?.length).toBe(1)
  })
})

describe('removeResolvedRef', () => {
  it('removes the line and cleans empty section', () => {
    const body = '# Nota\n\n## ✅ Resueltos\n\n- ✅ 2026-04-26: TODO #42 — Arreglar bug\n'
    const next = removeResolvedRef(body, '42')
    expect(next).not.toContain('TODO #42')
    expect(next).not.toContain('## ✅ Resueltos')
  })

  it('keeps section when other entries remain', () => {
    const body = '# Nota\n\n## ✅ Resueltos\n\n- ✅ 2026-04-25: TODO #41 — Otro\n- ✅ 2026-04-26: TODO #42 — Bug\n'
    const next = removeResolvedRef(body, '42')
    expect(next).toContain('TODO #41 — Otro')
    expect(next).not.toContain('TODO #42 — Bug')
    expect(next).toContain('## ✅ Resueltos')
  })

  it('no-op when todoId is not present', () => {
    const body = '# Nota\n\ncontenido'
    expect(removeResolvedRef(body, '42')).toBe(body)
  })
})
