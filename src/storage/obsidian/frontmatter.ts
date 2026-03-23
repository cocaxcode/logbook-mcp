// ── Frontmatter parser/serializer — zero dependencies ──

export interface Frontmatter {
  [key: string]: string | number | boolean | string[] | null
}

export interface ParsedFile {
  frontmatter: Frontmatter
  body: string
}

/**
 * Parse YAML frontmatter between --- delimiters.
 * Supports: string, number, boolean, arrays [a, b, c], dates as strings.
 * No external YAML library needed — line-by-line parsing.
 */
export function parseFrontmatter(raw: string): ParsedFile {
  const lines = raw.split('\n')

  // Find first ---
  const firstIdx = lines.findIndex((l) => l.trim() === '---')
  if (firstIdx === -1) {
    return { frontmatter: {}, body: raw }
  }

  // Find second ---
  const secondIdx = lines.findIndex((l, i) => i > firstIdx && l.trim() === '---')
  if (secondIdx === -1) {
    return { frontmatter: {}, body: raw }
  }

  // Extract frontmatter lines
  const fmLines = lines.slice(firstIdx + 1, secondIdx)
  const frontmatter: Frontmatter = {}

  for (const line of fmLines) {
    if (!line.trim() || line.trim().startsWith('#')) continue

    // Split on first colon
    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue

    const key = line.slice(0, colonIdx).trim()
    const rawValue = line.slice(colonIdx + 1).trim()

    if (!key) continue

    frontmatter[key] = parseValue(rawValue)
  }

  // Body is everything after second ---
  const body = lines.slice(secondIdx + 1).join('\n').replace(/^\n/, '')

  return { frontmatter, body }
}

/**
 * Serialize a Frontmatter object to YAML frontmatter string.
 * Returns string including --- delimiters and trailing newline.
 */
export function serializeFrontmatter(data: Frontmatter): string {
  const lines: string[] = ['---']

  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined) continue
    lines.push(`${key}: ${serializeValue(value)}`)
  }

  lines.push('---')
  return lines.join('\n') + '\n'
}

// ── Internal helpers ──

function parseValue(raw: string): string | number | boolean | string[] | null {
  // Empty
  if (raw === '' || raw === 'null' || raw === '~') return null

  // Boolean
  if (raw === 'true') return true
  if (raw === 'false') return false

  // Array: [a, b, c]
  if (raw.startsWith('[') && raw.endsWith(']')) {
    const inner = raw.slice(1, -1).trim()
    if (inner === '') return []
    return inner.split(',').map((item) => item.trim().replace(/^["']|["']$/g, ''))
  }

  // Quoted string
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    return raw.slice(1, -1)
  }

  // Number (integer or float, but not dates like 2026-03-21)
  if (/^\d+(\.\d+)?$/.test(raw)) {
    return Number(raw)
  }

  // Everything else is a string (including dates, ISO timestamps)
  return raw
}

function serializeValue(value: string | number | boolean | string[]): string {
  if (typeof value === 'boolean') return String(value)
  if (typeof value === 'number') return String(value)
  if (Array.isArray(value)) {
    return `[${value.join(', ')}]`
  }
  // Strings: only quote if they contain special chars
  if (typeof value === 'string' && /[:#\[\]{},>|&*!%@`]/.test(value)) {
    return `"${value.replace(/"/g, '\\"')}"`
  }
  return String(value)
}
