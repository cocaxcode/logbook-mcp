import { describe, it, expect } from 'vitest'
import { parseFrontmatter, serializeFrontmatter } from '../storage/obsidian/frontmatter.js'

describe('parseFrontmatter', () => {
  it('parses basic string fields', () => {
    const raw = '---\ntype: note\nproject: my-app\n---\nBody content'
    const { frontmatter, body } = parseFrontmatter(raw)
    expect(frontmatter.type).toBe('note')
    expect(frontmatter.project).toBe('my-app')
    expect(body).toBe('Body content')
  })

  it('parses number fields', () => {
    const raw = '---\ncount: 42\nprice: 9.99\n---\n'
    const { frontmatter } = parseFrontmatter(raw)
    expect(frontmatter.count).toBe(42)
    expect(frontmatter.price).toBe(9.99)
  })

  it('parses boolean fields', () => {
    const raw = '---\nactive: true\ndeleted: false\n---\n'
    const { frontmatter } = parseFrontmatter(raw)
    expect(frontmatter.active).toBe(true)
    expect(frontmatter.deleted).toBe(false)
  })

  it('parses array fields', () => {
    const raw = '---\ntags: [auth, jwt, security]\n---\n'
    const { frontmatter } = parseFrontmatter(raw)
    expect(frontmatter.tags).toEqual(['auth', 'jwt', 'security'])
  })

  it('parses empty array', () => {
    const raw = '---\ntags: []\n---\n'
    const { frontmatter } = parseFrontmatter(raw)
    expect(frontmatter.tags).toEqual([])
  })

  it('parses date strings (not as numbers)', () => {
    const raw = '---\ndate: 2026-03-21\ncreated: 2026-03-21T10:30:00Z\n---\n'
    const { frontmatter } = parseFrontmatter(raw)
    expect(frontmatter.date).toBe('2026-03-21')
    expect(frontmatter.created).toBe('2026-03-21T10:30:00Z')
  })

  it('parses null values', () => {
    const raw = '---\nvalue: null\nother: ~\nempty: \n---\n'
    const { frontmatter } = parseFrontmatter(raw)
    expect(frontmatter.value).toBeNull()
    expect(frontmatter.other).toBeNull()
    expect(frontmatter.empty).toBeNull()
  })

  it('parses quoted strings', () => {
    const raw = '---\ntitle: "Hello: World"\nsingle: \'test\'\n---\n'
    const { frontmatter } = parseFrontmatter(raw)
    expect(frontmatter.title).toBe('Hello: World')
    expect(frontmatter.single).toBe('test')
  })

  it('returns empty frontmatter for no delimiters', () => {
    const raw = 'Just plain text\nno frontmatter here'
    const { frontmatter, body } = parseFrontmatter(raw)
    expect(frontmatter).toEqual({})
    expect(body).toBe(raw)
  })

  it('returns empty frontmatter for single delimiter', () => {
    const raw = '---\ntype: note\nno closing delimiter'
    const { frontmatter } = parseFrontmatter(raw)
    expect(frontmatter).toEqual({})
  })

  it('handles empty frontmatter block', () => {
    const raw = '---\n---\nBody'
    const { frontmatter, body } = parseFrontmatter(raw)
    expect(frontmatter).toEqual({})
    expect(body).toBe('Body')
  })

  it('ignores comment lines', () => {
    const raw = '---\n# comment\ntype: note\n---\n'
    const { frontmatter } = parseFrontmatter(raw)
    expect(frontmatter.type).toBe('note')
    expect(Object.keys(frontmatter)).toHaveLength(1)
  })

  it('preserves multiline body', () => {
    const raw = '---\ntype: note\n---\nLine 1\nLine 2\nLine 3'
    const { body } = parseFrontmatter(raw)
    expect(body).toBe('Line 1\nLine 2\nLine 3')
  })
})

describe('serializeFrontmatter', () => {
  it('serializes basic types', () => {
    const result = serializeFrontmatter({
      type: 'note',
      date: '2026-03-21',
      count: 5,
      active: true,
    })
    expect(result).toContain('type: note')
    expect(result).toContain('date: 2026-03-21')
    expect(result).toContain('count: 5')
    expect(result).toContain('active: true')
    expect(result).toMatch(/^---\n/)
    expect(result).toMatch(/---\n$/)
  })

  it('serializes arrays', () => {
    const result = serializeFrontmatter({ tags: ['auth', 'jwt'] })
    expect(result).toContain('tags: [auth, jwt]')
  })

  it('skips null values', () => {
    const result = serializeFrontmatter({ type: 'note', topic: null })
    expect(result).not.toContain('topic')
  })

  it('quotes strings with special chars', () => {
    const result = serializeFrontmatter({ title: 'Hello: World' })
    expect(result).toContain('title: "Hello: World"')
  })

  it('round-trips correctly', () => {
    const original = {
      type: 'todo',
      date: '2026-03-21',
      priority: 'high',
      tags: ['auth', 'urgent'],
      active: true,
      count: 3,
    }
    const serialized = serializeFrontmatter(original)
    const { frontmatter } = parseFrontmatter(serialized + '\nBody')
    expect(frontmatter.type).toBe(original.type)
    expect(frontmatter.date).toBe(original.date)
    expect(frontmatter.priority).toBe(original.priority)
    expect(frontmatter.tags).toEqual(original.tags)
    expect(frontmatter.active).toBe(original.active)
    expect(frontmatter.count).toBe(original.count)
  })
})
