import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readState, writeStateAtomic } from '../config/reminders-state.js'

let dir: string

describe('reminders-state', () => {
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'logbook-reminders-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('returns empty state when file absent', () => {
    expect(readState(dir)).toEqual({ version: 1, acks: {} })
  })

  it('roundtrips state via writeStateAtomic', () => {
    writeStateAtomic(dir, { version: 1, acks: { 'r1': '2026-04-26' } })
    expect(readState(dir).acks['r1']).toBe('2026-04-26')
  })

  it('atomic write creates .logbook dir if missing', () => {
    writeStateAtomic(dir, { version: 1, acks: {} })
    expect(readFileSync(join(dir, '.logbook', 'reminders-state.json'), 'utf-8')).toContain('"version": 1')
  })

  it('returns empty state when JSON corrupt', () => {
    mkdirSync(join(dir, '.logbook'), { recursive: true })
    writeFileSync(join(dir, '.logbook', 'reminders-state.json'), '{not json')
    expect(readState(dir)).toEqual({ version: 1, acks: {} })
  })

  it('returns empty when shape invalid', () => {
    mkdirSync(join(dir, '.logbook'), { recursive: true })
    writeFileSync(join(dir, '.logbook', 'reminders-state.json'), '{"version": 99}')
    expect(readState(dir)).toEqual({ version: 1, acks: {} })
  })
})
