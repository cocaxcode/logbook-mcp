import { describe, it, expect, afterEach } from 'vitest'
import { getStorageMode, resetStorage } from '../storage/index.js'

describe('migrate tool prerequisites', () => {
  const originalStorage = process.env.LOGBOOK_STORAGE
  const originalDir = process.env.LOGBOOK_DIR

  afterEach(() => {
    if (originalStorage !== undefined) {
      process.env.LOGBOOK_STORAGE = originalStorage
    } else {
      delete process.env.LOGBOOK_STORAGE
    }
    if (originalDir !== undefined) {
      process.env.LOGBOOK_DIR = originalDir
    } else {
      delete process.env.LOGBOOK_DIR
    }
    resetStorage()
  })

  it('getStorageMode returns obsidian when configured', () => {
    process.env.LOGBOOK_STORAGE = 'obsidian'
    process.env.LOGBOOK_DIR = '/tmp/test-vault'
    expect(getStorageMode()).toBe('obsidian')
  })

  it('migrate requires obsidian mode', () => {
    process.env.LOGBOOK_STORAGE = 'sqlite'
    expect(getStorageMode()).toBe('sqlite')
  })
})
