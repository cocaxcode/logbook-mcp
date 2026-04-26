import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir, homedir } from 'node:os'
import { join } from 'node:path'
import { readObsidianVaults, detectVaults } from '../config/detect-vaults.js'

const ORIGINAL_HOME = homedir()
let tmpHome: string

function setHome(path: string): void {
  process.env.HOME = path
  process.env.USERPROFILE = path
}

describe('detect-vaults', () => {
  beforeEach(() => {
    tmpHome = mkdtempSync(join(tmpdir(), 'logbook-vaults-'))
    setHome(tmpHome)
  })

  afterEach(() => {
    setHome(ORIGINAL_HOME)
    rmSync(tmpHome, { recursive: true, force: true })
  })

  it('returns empty when obsidian.json absent and no common folders', () => {
    expect(readObsidianVaults()).toEqual([])
  })

  it('reads obsidian.json registered vaults', () => {
    const vaultPath = join(tmpHome, 'MyVault')
    mkdirSync(vaultPath, { recursive: true })
    const obsidianDir =
      process.platform === 'win32'
        ? join(tmpHome, 'AppData', 'Roaming', 'obsidian')
        : process.platform === 'darwin'
          ? join(tmpHome, 'Library', 'Application Support', 'obsidian')
          : join(tmpHome, '.config', 'obsidian')
    mkdirSync(obsidianDir, { recursive: true })
    writeFileSync(
      join(obsidianDir, 'obsidian.json'),
      JSON.stringify({ vaults: { abc: { path: vaultPath, ts: 1 } } }),
    )

    const out = readObsidianVaults()
    expect(out).toHaveLength(1)
    expect(out[0].path).toBe(vaultPath)
    expect(out[0].source).toBe('obsidian-config')
  })

  it('skips vaults whose path no longer exists', () => {
    const obsidianDir =
      process.platform === 'win32'
        ? join(tmpHome, 'AppData', 'Roaming', 'obsidian')
        : process.platform === 'darwin'
          ? join(tmpHome, 'Library', 'Application Support', 'obsidian')
          : join(tmpHome, '.config', 'obsidian')
    mkdirSync(obsidianDir, { recursive: true })
    writeFileSync(
      join(obsidianDir, 'obsidian.json'),
      JSON.stringify({ vaults: { gone: { path: '/nope/missing/vault', ts: 1 } } }),
    )
    expect(readObsidianVaults()).toEqual([])
  })

  it('detects vault from common folder scan', () => {
    const vaultPath = join(tmpHome, 'Documents', 'Notas')
    mkdirSync(join(vaultPath, '.obsidian'), { recursive: true })
    const all = detectVaults()
    expect(all.some((v) => v.path === vaultPath)).toBe(true)
  })

  it('deduplicates between obsidian-config and common-folder', () => {
    const vaultPath = join(tmpHome, 'Documents', 'MyVault')
    mkdirSync(join(vaultPath, '.obsidian'), { recursive: true })
    const obsidianDir =
      process.platform === 'win32'
        ? join(tmpHome, 'AppData', 'Roaming', 'obsidian')
        : process.platform === 'darwin'
          ? join(tmpHome, 'Library', 'Application Support', 'obsidian')
          : join(tmpHome, '.config', 'obsidian')
    mkdirSync(obsidianDir, { recursive: true })
    writeFileSync(
      join(obsidianDir, 'obsidian.json'),
      JSON.stringify({ vaults: { x: { path: vaultPath, ts: 1 } } }),
    )

    const out = detectVaults()
    const matches = out.filter((v) => v.path === vaultPath)
    expect(matches).toHaveLength(1)
    expect(matches[0].source).toBe('obsidian-config')
  })
})
