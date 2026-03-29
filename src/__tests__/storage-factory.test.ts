import { describe, it, expect, afterEach } from 'vitest'
import { getStorageMode, resetStorage } from '../storage/index.js'

describe('getStorageMode', () => {
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

  it('returns sqlite by default', () => {
    process.env.LOGBOOK_STORAGE = 'sqlite'
    expect(getStorageMode()).toBe('sqlite')
  })

  it('returns sqlite when explicitly set', () => {
    process.env.LOGBOOK_STORAGE = 'sqlite'
    expect(getStorageMode()).toBe('sqlite')
  })

  it('returns obsidian when set', () => {
    process.env.LOGBOOK_STORAGE = 'obsidian'
    process.env.LOGBOOK_DIR = '/tmp/test-vault'
    expect(getStorageMode()).toBe('obsidian')
  })

  it('is case-insensitive', () => {
    process.env.LOGBOOK_STORAGE = 'OBSIDIAN'
    process.env.LOGBOOK_DIR = '/tmp/test-vault'
    expect(getStorageMode()).toBe('obsidian')
  })

  it('throws on invalid value', () => {
    process.env.LOGBOOK_STORAGE = 'mongodb'
    expect(() => getStorageMode()).toThrow('LOGBOOK_STORAGE invalido: "mongodb"')
  })

  it('throws with valid options in message', () => {
    process.env.LOGBOOK_STORAGE = 'redis'
    expect(() => getStorageMode()).toThrow('sqlite, obsidian')
  })
})
