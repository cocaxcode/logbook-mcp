import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, readdirSync } from 'node:fs'
import { join, basename } from 'node:path'
import { parseFrontmatter, serializeFrontmatter } from './frontmatter.js'
import type { Frontmatter, ParsedFile } from './frontmatter.js'

/**
 * Ensure a directory exists, creating it recursively if needed.
 */
export function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

/**
 * Recursively list all .md files in a directory.
 */
export function globMarkdown(dir: string): string[] {
  const results: string[] = []

  if (!existsSync(dir)) return results

  function walk(currentDir: string): void {
    const entries = readdirSync(currentDir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name)
      if (entry.isDirectory()) {
        walk(fullPath)
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        results.push(fullPath)
      }
    }
  }

  walk(dir)
  return results
}

/**
 * Read and parse a markdown file with frontmatter.
 */
export function readEntry(path: string): ParsedFile {
  const raw = readFileSync(path, 'utf-8')
  return parseFrontmatter(raw)
}

/**
 * Write a markdown file with frontmatter and body.
 */
export function writeEntry(path: string, frontmatter: Frontmatter, body: string): void {
  const dir = join(path, '..')
  ensureDir(dir)
  const content = serializeFrontmatter(frontmatter) + '\n' + body
  writeFileSync(path, content, 'utf-8')
}

/**
 * Copy an attachment file to the destination directory.
 * Returns the filename of the copied file.
 */
export function copyAttachment(src: string, destDir: string): string {
  ensureDir(destDir)
  const filename = basename(src)

  let destPath = join(destDir, filename)

  // Handle name collision
  if (existsSync(destPath)) {
    const ext = filename.includes('.') ? filename.slice(filename.lastIndexOf('.')) : ''
    const name = filename.includes('.') ? filename.slice(0, filename.lastIndexOf('.')) : filename
    let counter = 2
    while (existsSync(destPath)) {
      destPath = join(destDir, `${name}-${counter}${ext}`)
      counter++
    }
  }

  copyFileSync(src, destPath)
  return basename(destPath)
}

/**
 * Extract date from filename pattern: YYYY-MM-DD-slug.md
 */
export function extractDateFromFilename(filename: string): string | null {
  const match = filename.match(/^(\d{4}-\d{2}-\d{2})/)
  return match ? match[1] : null
}

/**
 * Extract ID from filename (filename without .md extension).
 */
export function extractIdFromFilename(filename: string): string {
  return filename.replace(/\.md$/, '')
}
