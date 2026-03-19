import { describe, it, expect } from 'vitest'
import { parseGitGrepOutput } from '../git/code-todos.js'

describe('parseGitGrepOutput', () => {
  it('parsea TODO correctamente', () => {
    const output = 'src/auth.ts:45:  // TODO: add OAuth support'
    const result = parseGitGrepOutput(output)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      content: 'add OAuth support',
      source: 'code',
      file: 'src/auth.ts',
      line: 45,
      tag: 'TODO',
      topic_name: 'feature',
    })
  })

  it('parsea FIXME como fix', () => {
    const output = 'src/users.ts:78:  // FIXME: handle null case'
    const result = parseGitGrepOutput(output)
    expect(result[0].tag).toBe('FIXME')
    expect(result[0].topic_name).toBe('fix')
  })

  it('parsea BUG como fix', () => {
    const output = 'src/chat.ts:112:  // BUG: race condition in handler'
    const result = parseGitGrepOutput(output)
    expect(result[0].tag).toBe('BUG')
    expect(result[0].topic_name).toBe('fix')
  })

  it('parsea HACK como chore', () => {
    const output = 'src/cors.ts:23:  // HACK: workaround for proxy issue'
    const result = parseGitGrepOutput(output)
    expect(result[0].tag).toBe('HACK')
    expect(result[0].topic_name).toBe('chore')
  })

  it('parsea multiples lineas', () => {
    const output = [
      'src/a.ts:10:  // TODO: feature A',
      'src/b.ts:20:  // FIXME: bug B',
      'src/c.ts:30:  // HACK: workaround C',
    ].join('\n')
    const result = parseGitGrepOutput(output)
    expect(result).toHaveLength(3)
  })

  it('ignora lineas malformadas', () => {
    const output = [
      'src/a.ts:10:  // TODO: valid',
      'invalid line without format',
      'src/b.ts:20:  // FIXME: also valid',
    ].join('\n')
    const result = parseGitGrepOutput(output)
    expect(result).toHaveLength(2)
  })

  it('retorna array vacio con output vacio', () => {
    expect(parseGitGrepOutput('')).toEqual([])
    expect(parseGitGrepOutput('  ')).toEqual([])
  })

  it('maneja contenido con caracteres especiales', () => {
    const output = "src/api.ts:5:  // TODO: fix endpoint /api/v2 (breaks on 'quotes')"
    const result = parseGitGrepOutput(output)
    expect(result).toHaveLength(1)
    expect(result[0].content).toContain('/api/v2')
  })
})
