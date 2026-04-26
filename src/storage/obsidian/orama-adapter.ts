/**
 * Orama search adapter.
 * Lazy-built full-text index over the Obsidian vault. Replaces SQLite FTS5.
 *
 * - buildIndex: scans all .md under <vault>/<root>, parses frontmatter, indexes.
 * - searchIndex: BM25 + fuzzy with optional filters.
 * - updateDoc / removeDoc: keep the in-memory index in sync with writes.
 * - persistCache / loadCache: serialize index to .logbook/index-cache.json.
 */

import { create, insert, search as oramaSearch, remove, save, load, AnyOrama } from '@orama/orama'
import { readFileSync, writeFileSync, existsSync, statSync, readdirSync, mkdirSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { parseFrontmatter } from './frontmatter.js'
import { extractIdFromFilename } from './files.js'

export interface IndexedDoc {
  /** Unique key inside Orama: the relative path. */
  id: string
  /** Public-facing entry id (`YYYY-MM-DD-slug` when applicable, else filename). */
  slug: string
  type: string
  title: string
  body: string
  topic: string
  tags: string[]
  project: string
  workspace: string
  date: string
  path: string
}

/** Languages supported by Orama out-of-the-box. */
export type OramaLanguage =
  | 'arabic' | 'armenian' | 'bulgarian' | 'catalan' | 'chinese' | 'danish'
  | 'dutch' | 'english' | 'finnish' | 'french' | 'german' | 'greek'
  | 'hindi' | 'hungarian' | 'indonesian' | 'irish' | 'italian' | 'japanese'
  | 'korean' | 'lithuanian' | 'mongolian' | 'nepali' | 'norwegian' | 'persian'
  | 'portuguese' | 'romanian' | 'russian' | 'serbian' | 'slovenian' | 'spanish'
  | 'swedish' | 'tamil' | 'turkish' | 'ukrainian' | 'sanskrit'

export interface OramaCtx {
  baseDir: string
  /** Optional. Defaults to 'spanish' (configurable via LOGBOOK_LANG / repo config). */
  language?: OramaLanguage
}

const SCHEMA = {
  id: 'string',
  slug: 'string',
  type: 'string',
  title: 'string',
  body: 'string',
  topic: 'string',
  tags: 'string[]',
  project: 'string',
  workspace: 'string',
  date: 'string',
  path: 'string',
} as const

let indexInstance: AnyOrama | null = null
let indexedPaths = new Map<string, number>() // path → mtime

function cachePath(baseDir: string): string {
  return join(baseDir, '.logbook', 'index-cache.json')
}

function walkMd(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.')) continue
    const full = join(dir, entry)
    try {
      const st = statSync(full)
      if (st.isDirectory()) walkMd(full, out)
      else if (entry.endsWith('.md')) out.push(full)
    } catch {}
  }
  return out
}

function docFromFile(baseDir: string, filePath: string): IndexedDoc | null {
  try {
    const raw = readFileSync(filePath, 'utf-8')
    const { frontmatter: fm, body } = parseFrontmatter(raw)
    const fileName = filePath.split(/[\\/]/).pop() ?? ''
    const slug = extractIdFromFilename(fileName) || fileName.replace(/\.md$/, '')
    const relPath = relative(baseDir, filePath).replace(/\\/g, '/')
    // Use relative path as Orama id to guarantee uniqueness across the vault
    // (filenames like `index.md`, `todos.md` repeat per project).
    const id = relPath
    const titleLine = body.split('\n').find((l) => l.trim()) ?? slug
    const title = titleLine.replace(/^#+\s*/, '').slice(0, 200)
    return {
      id,
      slug,
      type: String(fm.type ?? 'note'),
      title,
      body,
      topic: String(fm.topic ?? ''),
      tags: Array.isArray(fm.tags) ? (fm.tags as string[]) : [],
      project: String(fm.project ?? ''),
      workspace: String(fm.workspace ?? ''),
      date: String(fm.date ?? ''),
      path: relPath,
    }
  } catch {
    return null
  }
}

export async function buildIndex(ctx: OramaCtx): Promise<AnyOrama> {
  if (indexInstance) return indexInstance
  const cached = await loadCache(ctx)
  if (cached) {
    indexInstance = cached
    return cached
  }
  const db = create({ schema: SCHEMA, language: ctx.language ?? 'spanish' })
  const files = walkMd(ctx.baseDir)
  for (const f of files) {
    const doc = docFromFile(ctx.baseDir, f)
    if (!doc) continue
    await insert(db, doc)
    try {
      indexedPaths.set(f, statSync(f).mtimeMs)
    } catch {}
  }
  indexInstance = db
  await persistCache(ctx)
  return db
}

export async function searchIndex(
  ctx: OramaCtx,
  query: string,
  filters: { type?: string; topic?: string; project?: string; workspace?: string; limit?: number } = {},
): Promise<Array<IndexedDoc & { score: number; snippet: string }>> {
  const db = await buildIndex(ctx)
  const where: Record<string, string> = {}
  if (filters.type && filters.type !== 'all') where.type = filters.type
  if (filters.topic) where.topic = filters.topic
  if (filters.project) where.project = filters.project
  if (filters.workspace) where.workspace = filters.workspace

  const result = await oramaSearch(db, {
    term: query,
    properties: ['title', 'body', 'topic'],
    limit: filters.limit ?? 20,
    tolerance: 1,
    where: Object.keys(where).length ? where : undefined,
  })
  return result.hits.map((h) => {
    const d = h.document as unknown as IndexedDoc
    const snippet = d.body.length > 200 ? `${d.body.slice(0, 197)}...` : d.body
    return { ...d, score: h.score, snippet }
  })
}

export async function updateDoc(ctx: OramaCtx, filePath: string): Promise<void> {
  const db = await buildIndex(ctx)
  const doc = docFromFile(ctx.baseDir, filePath)
  if (!doc) return
  try {
    await remove(db, doc.id)
  } catch {}
  await insert(db, doc)
  try {
    indexedPaths.set(filePath, statSync(filePath).mtimeMs)
  } catch {}
}

export async function removeDoc(ctx: OramaCtx, idOrPath: string): Promise<void> {
  const db = await buildIndex(ctx)
  // Orama id is the relative path. If we got a slug, search the index for it.
  let oramaId: string | null = null
  if (idOrPath.includes('/') || idOrPath.includes('\\')) {
    oramaId = idOrPath.replace(/\\/g, '/')
  } else {
    // Treat as slug — find the doc whose slug matches.
    const result = await oramaSearch(db, {
      term: idOrPath,
      properties: ['slug'],
      exact: true,
      limit: 1,
    })
    if (result.hits[0]) oramaId = (result.hits[0].document as unknown as IndexedDoc).id
  }
  if (!oramaId) return
  try {
    await remove(db, oramaId)
  } catch {}
  indexedPaths.delete(oramaId)
}

export async function persistCache(ctx: OramaCtx): Promise<void> {
  if (!indexInstance) return
  const data = save(indexInstance)
  const path = cachePath(ctx.baseDir)
  if (!existsSync(dirname(path))) mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(data), 'utf-8')
}

export async function loadCache(ctx: OramaCtx): Promise<AnyOrama | null> {
  const path = cachePath(ctx.baseDir)
  if (!existsSync(path)) return null
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8'))
    const db = create({ schema: SCHEMA, language: ctx.language ?? 'spanish' })
    load(db, raw)
    return db
  } catch {
    return null
  }
}

export function resetIndex(): void {
  indexInstance = null
  indexedPaths = new Map()
}

export function getVaultIdSet(): Set<string> {
  if (!indexInstance) return new Set()
  // Orama API: enumerate via search with a wildcard would be expensive.
  // The index is the source; reconstruct from filesystem.
  return new Set()
}
