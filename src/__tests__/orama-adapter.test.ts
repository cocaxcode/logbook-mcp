import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildIndex, searchIndex, updateDoc, removeDoc, resetIndex } from '../storage/obsidian/orama-adapter.js'

let baseDir: string

function writeMd(rel: string, fm: Record<string, unknown>, body: string): string {
  const path = join(baseDir, rel)
  mkdirSync(join(path, '..'), { recursive: true })
  const fmStr = `---\n${Object.entries(fm).map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`).join('\n')}\n---\n\n${body}`
  writeFileSync(path, fmStr, 'utf-8')
  return path
}

describe('orama-adapter', () => {
  beforeEach(() => {
    baseDir = mkdtempSync(join(tmpdir(), 'logbook-orama-'))
    resetIndex()
  })
  afterEach(() => {
    rmSync(baseDir, { recursive: true, force: true })
    resetIndex()
  })

  it('builds index from vault and finds doc by term', async () => {
    writeMd('proj/notes/2026-04-26-test-note.md', { type: 'note', date: '2026-04-26', project: 'proj' }, '# Hola mundo\n\nEsta es la nota')
    const results = await searchIndex({ baseDir }, 'mundo')
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].slug).toBe('2026-04-26-test-note')
  })

  it('filters by type', async () => {
    writeMd('proj/notes/2026-04-26-aa.md', { type: 'note', date: '2026-04-26', project: 'proj' }, 'Mundo nota')
    writeMd('proj/decisions/2026-04-26-bb.md', { type: 'decision', date: '2026-04-26', project: 'proj' }, 'Mundo decision')
    resetIndex()
    const results = await searchIndex({ baseDir }, 'Mundo', { type: 'decision' })
    expect(results.every((r) => r.type === 'decision')).toBe(true)
  })

  it('updateDoc reindexes a single file', async () => {
    const path = writeMd('proj/notes/2026-04-26-up.md', { type: 'note', date: '2026-04-26', project: 'proj' }, 'Original content')
    await buildIndex({ baseDir })
    writeFileSync(path, '---\ntype: note\ndate: 2026-04-26\nproject: proj\n---\n\nUpdated body xyzzy')
    await updateDoc({ baseDir }, path)
    const results = await searchIndex({ baseDir }, 'xyzzy')
    expect(results.length).toBe(1)
  })

  it('removeDoc removes by id', async () => {
    writeMd('proj/notes/2026-04-26-rm.md', { type: 'note', date: '2026-04-26', project: 'proj' }, 'borrame qwerty')
    await buildIndex({ baseDir })
    await removeDoc({ baseDir }, '2026-04-26-rm')
    const results = await searchIndex({ baseDir }, 'qwerty')
    expect(results.length).toBe(0)
  })
})
