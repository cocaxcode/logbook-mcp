import { describe, it, expect } from 'vitest'
import { resolveConfig } from '../config/resolve.js'
import { DEFAULTS } from '../config/defaults.js'

describe('resolveConfig', () => {
  it('returns defaults when no layers', () => {
    const { config, trace } = resolveConfig({})
    expect(config.folders.notes).toBe(DEFAULTS.folders.notes)
    expect(config.autoWikilink).toBe(true)
    expect(trace.folders).toBe('default')
    expect(trace.autoWikilink).toBe('default')
  })

  it('CLI args win over env', () => {
    const { config, trace } = resolveConfig({
      cli: { workspace: 'from-cli' },
      env: { workspace: 'from-env' },
    })
    expect(config.workspace).toBe('from-cli')
    expect(trace.workspace).toBe('cli')
  })

  it('env wins over repo', () => {
    const { config, trace } = resolveConfig({
      env: { alias: 'env' },
      repo: { alias: 'repo' },
    })
    expect(config.alias).toBe('env')
    expect(trace.alias).toBe('env')
  })

  it('repo wins over vault', () => {
    const { config, trace } = resolveConfig({
      repo: { alias: 'api-v2' },
      vault: { alias: 'default-alias' },
    })
    expect(config.alias).toBe('api-v2')
    expect(trace.alias).toBe('repo')
  })

  it('vault wins over global', () => {
    const { config } = resolveConfig({
      vault: { workspace: 'vault-ws' },
      global: { workspace: 'global-ws' },
    })
    expect(config.workspace).toBe('vault-ws')
  })

  it('deep-merges folders, not replaces', () => {
    const { config, trace } = resolveConfig({
      global: { folders: { notes: 'Notas', todos: 'Tareas' } },
      repo: { folders: { todos: 'TODO' } },
    })
    expect(config.folders.notes).toBe('Notas')
    expect(config.folders.todos).toBe('TODO')
    expect(config.folders.decisions).toBe(DEFAULTS.folders.decisions)
    expect(trace['folders.notes']).toBe('global')
    expect(trace['folders.todos']).toBe('repo')
  })

  it('arrays replace, do not concat', () => {
    const { config } = resolveConfig({
      global: { excludeProjects: ['a', 'b'] },
      repo: { excludeProjects: ['c'] },
    })
    expect(config.excludeProjects).toEqual(['c'])
  })

  it('autoWikilink false from repo overrides default true', () => {
    const { config, trace } = resolveConfig({ repo: { autoWikilink: false } })
    expect(config.autoWikilink).toBe(false)
    expect(trace.autoWikilink).toBe('repo')
  })

  it('selects single registered vault automatically', () => {
    const { config } = resolveConfig({
      global: { vaults: { personal: { path: '/v', root: 'logbook' } } },
    })
    expect(config.vault.name).toBe('personal')
    expect(config.vault.path).toBe('/v')
  })

  it('uses defaultVault when multiple vaults', () => {
    const { config } = resolveConfig({
      global: {
        defaultVault: 'work',
        vaults: {
          personal: { path: '/p', root: 'logbook' },
          work: { path: '/w', root: 'logbook' },
        },
      },
    })
    expect(config.vault.name).toBe('work')
  })

  it('explicit vaultName overrides default', () => {
    const { config } = resolveConfig(
      {
        global: {
          defaultVault: 'work',
          vaults: {
            personal: { path: '/p', root: 'logbook' },
            work: { path: '/w', root: 'logbook' },
          },
        },
      },
      { vaultName: 'personal' },
    )
    expect(config.vault.name).toBe('personal')
  })

  it('falls back to placeholder vault when no vaults registered', () => {
    const { config } = resolveConfig({})
    expect(config.vault.name).toBe('default')
    expect(config.vault.path).toBe('')
  })
})
