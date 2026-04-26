import type {
  ConfigLayers,
  ConfigLayer,
  GlobalConfig,
  ResolvedConfig,
  ConfigTrace,
  ConfigSource,
  VaultRef,
} from './types.js'
import { DEFAULTS } from './defaults.js'

const LAYER_ORDER: ConfigSource[] = ['cli', 'env', 'repo', 'vault', 'global']

const TOP_FIELDS = [
  'alias',
  'folders',
  'pathTemplate',
  'workspace',
  'workspaceStrategy',
  'dailyNote',
  'templates',
  'excludeProjects',
  'autoWikilink',
] as const

const DEEP_MERGE_FIELDS = new Set(['folders', 'dailyNote', 'templates'])

function pickLayer(layers: ConfigLayers, source: ConfigSource): ConfigLayer | undefined {
  if (source === 'default') return undefined
  return layers[source]
}

function pickGlobal(layers: ConfigLayers): GlobalConfig | undefined {
  return layers.global
}

function resolveVault(layers: ConfigLayers, vaultName?: string): (VaultRef & { name: string }) | null {
  const global = pickGlobal(layers)
  if (!global?.vaults || Object.keys(global.vaults).length === 0) return null

  const names = Object.keys(global.vaults)
  let target: string | undefined
  if (vaultName && global.vaults[vaultName]) {
    target = vaultName
  } else if (names.length === 1) {
    target = names[0]
  } else if (global.defaultVault && global.vaults[global.defaultVault]) {
    target = global.defaultVault
  }

  if (!target) return null
  return { name: target, ...global.vaults[target] }
}

/** Layered resolution. Higher precedence layers (cli > env > repo > vault > global > default) override. */
export function resolveConfig(
  layers: ConfigLayers,
  opts: { vaultName?: string } = {},
): { config: ResolvedConfig; trace: ConfigTrace } {
  const trace: ConfigTrace = {}
  const out: Record<string, unknown> = {
    folders: { ...DEFAULTS.folders },
    pathTemplate: DEFAULTS.pathTemplate,
    workspaceStrategy: DEFAULTS.workspaceStrategy,
    dailyNote: { ...DEFAULTS.dailyNote },
    templates: { ...DEFAULTS.templates },
    excludeProjects: [...DEFAULTS.excludeProjects],
    autoWikilink: DEFAULTS.autoWikilink,
  }

  for (const f of TOP_FIELDS) trace[f] = 'default'

  for (const source of [...LAYER_ORDER].reverse()) {
    const layer = pickLayer(layers, source)
    if (!layer) continue
    for (const f of TOP_FIELDS) {
      const v = (layer as Record<string, unknown>)[f]
      if (v === undefined) continue
      if (DEEP_MERGE_FIELDS.has(f) && typeof v === 'object' && v !== null && !Array.isArray(v)) {
        const target = (out[f] as Record<string, unknown>) ?? {}
        for (const [k, val] of Object.entries(v)) {
          if (val === undefined) continue
          target[k] = val
          trace[`${f}.${k}`] = source
        }
        out[f] = target
        trace[f] = source
      } else {
        out[f] = v
        trace[f] = source
      }
    }
  }

  const vault = resolveVault(layers, opts.vaultName)
  const config: ResolvedConfig = {
    vault: vault ?? { name: 'default', path: '', root: 'logbook' },
    alias: out.alias as string | undefined,
    folders: out.folders as Required<NonNullable<ResolvedConfig['folders']>>,
    pathTemplate: out.pathTemplate as string,
    workspace: out.workspace as string | undefined,
    workspaceStrategy: out.workspaceStrategy as ResolvedConfig['workspaceStrategy'],
    dailyNote: out.dailyNote as Required<NonNullable<ResolvedConfig['dailyNote']>>,
    templates: out.templates as ResolvedConfig['templates'],
    excludeProjects: out.excludeProjects as string[],
    autoWikilink: out.autoWikilink as boolean,
  }

  if (vault) trace.vault = 'global'

  return { config, trace }
}
