import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync, unlinkSync } from 'node:fs'
import { join, dirname } from 'node:path'

export interface RemindersState {
  version: 1
  acks: Record<string, string>
}

const EMPTY: RemindersState = { version: 1, acks: {} }

function statePath(vaultRoot: string): string {
  return join(vaultRoot, '.logbook', 'reminders-state.json')
}

/** Read state, tolerant to corruption (returns empty + warns). */
export function readState(vaultRoot: string): RemindersState {
  const path = statePath(vaultRoot)
  if (!existsSync(path)) return { ...EMPTY, acks: {} }
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8'))
    if (raw?.version !== 1 || typeof raw?.acks !== 'object' || raw.acks === null) {
      console.error(`[logbook] reminders-state.json shape invalid, using empty state: ${path}`)
      return { ...EMPTY, acks: {} }
    }
    return { version: 1, acks: { ...raw.acks } }
  } catch (e) {
    console.error(`[logbook] reminders-state.json unreadable, using empty state: ${(e as Error).message}`)
    return { ...EMPTY, acks: {} }
  }
}

/** Atomic write: tmp file + rename. */
export function writeStateAtomic(vaultRoot: string, state: RemindersState): void {
  const path = statePath(vaultRoot)
  const dir = dirname(path)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`
  writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf-8')
  try {
    renameSync(tmp, path)
  } catch (e) {
    try {
      unlinkSync(tmp)
    } catch {}
    throw e
  }
}
