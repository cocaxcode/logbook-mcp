import { describe, it, expect, afterEach } from 'vitest'
import { getStorageMode, resetStorage } from '../storage/index.js'

describe('getStorageMode', () => {
  const originalStorage = process.env.LOGBOOK_STORAGE

  afterEach(() => {
    if (originalStorage !== undefined) {
      process.env.LOGBOOK_STORAGE = originalStorage
    } else {
      delete process.env.LOGBOOK_STORAGE
    }
    resetStorage()
  })

  it('returns sqlite by default', () => {
    delete process.env.LOGBOOK_STORAGE
    expect(getStorageMode()).toBe('sqlite')
  })

  it('returns sqlite when explicitly set', () => {
    process.env.LOGBOOK_STORAGE = 'sqlite'
    expect(getStorageMode()).toBe('sqlite')
  })

  it('returns obsidian when set', () => {
    process.env.LOGBOOK_STORAGE = 'obsidian'
    expect(getStorageMode()).toBe('obsidian')
  })

  it('is case-insensitive', () => {
    process.env.LOGBOOK_STORAGE = 'OBSIDIAN'
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
