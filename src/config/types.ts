/**
 * Types for the layered config system (v2).
 * See openspec/changes/drop-sqlite-split-monolith/specs/config-layers.md
 */

export type WorkspaceStrategy = 'git-remote-org' | 'parent-folder' | 'manual' | 'none'

export type EntryKind =
  | 'notes'
  | 'todos'
  | 'decisions'
  | 'debug'
  | 'standups'
  | 'attachments'
  | 'reminders'
  | 'inbox'

export interface FoldersConfig {
  notes?: string
  todos?: string
  decisions?: string
  debug?: string
  standups?: string
  attachments?: string
  reminders?: string
  inbox?: string
}

export interface DailyNoteConfig {
  enabled?: boolean
  folder?: string
  format?: string
}

export interface TemplatesConfig {
  userFolder?: string
}

export interface VaultRef {
  path: string
  root: string
}

/** Per-layer config. Every field optional. */
export interface ConfigLayer {
  alias?: string
  folders?: FoldersConfig
  pathTemplate?: string
  workspace?: string
  workspaceStrategy?: WorkspaceStrategy
  dailyNote?: DailyNoteConfig
  templates?: TemplatesConfig
  excludeProjects?: string[]
  autoWikilink?: boolean
}

/** Global layer adds vault registry. */
export interface GlobalConfig extends ConfigLayer {
  defaultVault?: string
  vaults?: Record<string, VaultRef>
}

export interface ConfigLayers {
  cli?: ConfigLayer
  env?: ConfigLayer
  repo?: ConfigLayer
  vault?: ConfigLayer
  global?: GlobalConfig
}

/** Resolved config. All fields populated (with defaults if needed). */
export interface ResolvedConfig {
  vault: VaultRef & { name: string }
  alias?: string
  folders: Required<FoldersConfig>
  pathTemplate: string
  workspace?: string
  workspaceStrategy: WorkspaceStrategy
  dailyNote: Required<DailyNoteConfig>
  templates: TemplatesConfig
  excludeProjects: string[]
  autoWikilink: boolean
}

export type ConfigSource = 'cli' | 'env' | 'repo' | 'vault' | 'global' | 'default'

/** For each field of ResolvedConfig, which layer supplied the value. */
export type ConfigTrace = Record<string, ConfigSource>
