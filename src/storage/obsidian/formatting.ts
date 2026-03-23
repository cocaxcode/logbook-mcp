import type { EntryType } from '../types.js'
import type { Priority } from '../../types.js'

// ── Callout types per entry type ──

const CALLOUT_MAP: Record<EntryType, string> = {
  note: 'note',
  todo: 'todo',
  decision: 'info',
  debug: 'bug',
  standup: 'note',
  review: 'summary',
}

/**
 * Format content as an Obsidian callout block.
 * Example: > [!bug] Fix CORS
 *          > El error ocurre en Safari...
 */
export function formatCallout(type: EntryType, title: string, content: string): string {
  const calloutType = CALLOUT_MAP[type] || 'note'
  const lines = content.split('\n')
  const quoted = lines.map((l) => `> ${l}`).join('\n')
  return `> [!${calloutType}] ${title}\n${quoted}`
}

// ── Priority emoji mapping (compatible with Tasks plugin) ──

const PRIORITY_EMOJI: Record<Priority, string> = {
  urgent: '\u23EB', // ⏫
  high: '\uD83D\uDD3C', // 🔼
  normal: '',
  low: '\uD83D\uDD3D', // 🔽
}

/**
 * Format a TODO as a checkbox line compatible with Obsidian Tasks plugin.
 * Example: - [ ] Revisar deploy 🔼 📅 2026-03-25
 *          - [x] Fix CORS ✅ 2026-03-21
 */
export function formatTodoCheckbox(
  content: string,
  priority: Priority,
  due?: string | null,
  done?: boolean,
  completedAt?: string | null,
): string {
  const checkbox = done ? '- [x]' : '- [ ]'
  const parts = [checkbox, content]

  const emoji = PRIORITY_EMOJI[priority]
  if (emoji) parts.push(emoji)

  if (due && !done) {
    parts.push(`\uD83D\uDCC5 ${due}`) // 📅
  }

  if (done && completedAt) {
    parts.push(`\u2705 ${completedAt.split('T')[0]}`) // ✅
  }

  return parts.join(' ')
}

/**
 * Format a standup entry body.
 */
export function formatStandup(yesterday: string, today: string, blockers: string): string {
  return [
    '## Yesterday',
    yesterday,
    '',
    '## Today',
    today,
    '',
    '## Blockers',
    blockers || 'Ninguno',
  ].join('\n')
}

/**
 * Format a decision entry body (ADR-style).
 */
export function formatDecision(
  title: string,
  context: string,
  options: string[],
  decision: string,
  consequences: string,
): string {
  const optionsList = options.map((o, i) => `${i + 1}. ${o}`).join('\n')

  return [
    `# ${title}`,
    '',
    '## Contexto',
    context,
    '',
    '## Opciones',
    optionsList,
    '',
    '## Decision',
    decision,
    '',
    '## Consecuencias',
    consequences,
  ].join('\n')
}

/**
 * Format a debug entry body.
 */
export function formatDebug(
  title: string,
  error: string,
  cause: string,
  fix: string,
  attachment?: string | null,
): string {
  const parts = [
    `> [!bug] ${title}`,
    '>',
    '> **Error**',
    `> ${error}`,
    '>',
    '> **Causa**',
    `> ${cause}`,
    '>',
    '> **Fix**',
    `> ${fix}`,
  ]

  if (attachment) {
    parts.push('>', `> ![[${attachment}]]`)
  }

  return parts.join('\n')
}
