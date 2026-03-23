import { existsSync } from 'node:fs'
import { join } from 'node:path'

// Mapa de acentos a ASCII
const ACCENT_MAP: Record<string, string> = {
  'á': 'a', 'à': 'a', 'ä': 'a', 'â': 'a', 'ã': 'a',
  'é': 'e', 'è': 'e', 'ë': 'e', 'ê': 'e',
  'í': 'i', 'ì': 'i', 'ï': 'i', 'î': 'i',
  'ó': 'o', 'ò': 'o', 'ö': 'o', 'ô': 'o', 'õ': 'o',
  'ú': 'u', 'ù': 'u', 'ü': 'u', 'û': 'u',
  'ñ': 'n', 'ç': 'c',
}

/**
 * Generate a URL-safe slug from text.
 * Handles accented chars, special characters, and truncation.
 */
export function generateSlug(text: string, maxLen = 50): string {
  let slug = text.toLowerCase()

  // Replace accented chars
  slug = slug.replace(/[áàäâãéèëêíìïîóòöôõúùüûñç]/g, (ch) => ACCENT_MAP[ch] || ch)

  // Replace non-alphanumeric with dash
  slug = slug.replace(/[^a-z0-9]+/g, '-')

  // Collapse multiple dashes
  slug = slug.replace(/-{2,}/g, '-')

  // Trim leading/trailing dashes
  slug = slug.replace(/^-|-$/g, '')

  // Truncate
  if (slug.length > maxLen) {
    slug = slug.slice(0, maxLen).replace(/-$/, '')
  }

  return slug || 'entry'
}

/**
 * Resolve a unique filename in a directory.
 * If `2026-03-21-my-slug.md` exists, tries `-2`, `-3`, etc.
 */
export function resolveFilename(dir: string, date: string, slug: string): string {
  const base = `${date}-${slug}.md`
  const fullPath = join(dir, base)

  if (!existsSync(fullPath)) return base

  let counter = 2
  while (true) {
    const candidate = `${date}-${slug}-${counter}.md`
    if (!existsSync(join(dir, candidate))) return candidate
    counter++
  }
}
