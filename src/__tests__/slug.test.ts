import { describe, it, expect } from 'vitest'
import { generateSlug, resolveFilename } from '../storage/obsidian/slug.js'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('generateSlug', () => {
  it('converts to lowercase', () => {
    expect(generateSlug('Hello World')).toBe('hello-world')
  })

  it('replaces accented chars', () => {
    expect(generateSlug('Implementación rápida')).toBe('implementacion-rapida')
  })

  it('replaces ñ', () => {
    expect(generateSlug('Año nuevo')).toBe('ano-nuevo')
  })

  it('removes special chars', () => {
    expect(generateSlug('fix: CORS bug (#123)')).toBe('fix-cors-bug-123')
  })

  it('collapses multiple dashes', () => {
    expect(generateSlug('hello---world')).toBe('hello-world')
  })

  it('trims leading/trailing dashes', () => {
    expect(generateSlug('--hello--')).toBe('hello')
  })

  it('truncates to maxLen', () => {
    const long = 'a'.repeat(100)
    expect(generateSlug(long, 20).length).toBeLessThanOrEqual(20)
  })

  it('returns "entry" for empty input', () => {
    expect(generateSlug('')).toBe('entry')
    expect(generateSlug('---')).toBe('entry')
  })
})

describe('resolveFilename', () => {
  const testDir = join(tmpdir(), 'logbook-slug-test')

  it('returns simple filename when no collision', () => {
    mkdirSync(testDir, { recursive: true })
    const result = resolveFilename(testDir, '2026-03-21', 'my-note')
    expect(result).toBe('2026-03-21-my-note.md')
    rmSync(testDir, { recursive: true, force: true })
  })

  it('appends counter on collision', () => {
    mkdirSync(testDir, { recursive: true })
    writeFileSync(join(testDir, '2026-03-21-my-note.md'), 'existing')
    const result = resolveFilename(testDir, '2026-03-21', 'my-note')
    expect(result).toBe('2026-03-21-my-note-2.md')
    rmSync(testDir, { recursive: true, force: true })
  })

  it('increments counter for multiple collisions', () => {
    mkdirSync(testDir, { recursive: true })
    writeFileSync(join(testDir, '2026-03-21-my-note.md'), 'existing')
    writeFileSync(join(testDir, '2026-03-21-my-note-2.md'), 'existing')
    const result = resolveFilename(testDir, '2026-03-21', 'my-note')
    expect(result).toBe('2026-03-21-my-note-3.md')
    rmSync(testDir, { recursive: true, force: true })
  })
})
