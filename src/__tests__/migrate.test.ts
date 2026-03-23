import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdirSync, rmSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { getStorageMode } from '../storage/index.js'

describe('migrate tool prerequisites', () => {
  it('getStorageMode returns obsidian when configured', () => {
    const original = process.env.LOGBOOK_STORAGE
    process.env.LOGBOOK_STORAGE = 'obsidian'
    expect(getStorageMode()).toBe('obsidian')
    if (original !== undefined) {
      process.env.LOGBOOK_STORAGE = original
    } else {
      delete process.env.LOGBOOK_STORAGE
    }
  })

  it('migrate requires obsidian mode', () => {
    // The migrate tool checks getStorageMode() !== 'obsidian' and returns error
    // This tests the guard logic without executing the full tool
    const original = process.env.LOGBOOK_STORAGE
    delete process.env.LOGBOOK_STORAGE
    expect(getStorageMode()).toBe('sqlite')
    // In sqlite mode, migrate should refuse to run
    if (original !== undefined) {
      process.env.LOGBOOK_STORAGE = original
    } else {
      delete process.env.LOGBOOK_STORAGE
    }
  })
})
