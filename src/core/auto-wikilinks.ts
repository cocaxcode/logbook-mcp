/**
 * Auto-wikilinks middleware.
 *
 * - autoWrapIds: when content mentions an ID (YYYY-MM-DD-slug) that exists in
 *   the vault, wrap it as [[id]] (idempotent — does not re-wrap existing).
 * - expandRefShortcut: replaces `ref:<id>` with `[[id]]` if id exists.
 *
 * Both are pure: input string + Set<string> of valid IDs → output string.
 */

const ID_REGEX = /\b(\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]*)\b/g
const REF_REGEX = /\bref:(\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]*)\b/g

function isInsideWikilink(content: string, idx: number, len: number): boolean {
  const before = content.slice(Math.max(0, idx - 2), idx)
  const after = content.slice(idx + len, idx + len + 2)
  return before === '[[' && after === ']]'
}

export function expandRefShortcut(content: string, vaultIndex: Set<string>): string {
  return content.replace(REF_REGEX, (match, id) => {
    if (vaultIndex.has(id)) return `[[${id}]]`
    return match
  })
}

export function autoWrapIds(content: string, vaultIndex: Set<string>): string {
  let result = ''
  let lastIndex = 0
  for (const m of content.matchAll(ID_REGEX)) {
    const id = m[1]
    const idx = m.index ?? 0
    result += content.slice(lastIndex, idx)
    if (vaultIndex.has(id) && !isInsideWikilink(content, idx, id.length)) {
      result += `[[${id}]]`
    } else {
      result += id
    }
    lastIndex = idx + id.length
  }
  result += content.slice(lastIndex)
  return result
}

export function applyAutoWikilinks(
  content: string,
  vaultIndex: Set<string>,
  config: { autoWikilink?: boolean } = { autoWikilink: true },
): string {
  if (config.autoWikilink === false) return content
  const refExpanded = expandRefShortcut(content, vaultIndex)
  return autoWrapIds(refExpanded, vaultIndex)
}
