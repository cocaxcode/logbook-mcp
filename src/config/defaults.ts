import type { ResolvedConfig, FoldersConfig, DailyNoteConfig } from './types.js'

export const DEFAULT_FOLDERS: Required<FoldersConfig> = {
  notes: 'notes',
  todos: 'todos',
  decisions: 'decisions',
  debug: 'debug',
  standups: 'standups',
  attachments: 'attachments',
  reminders: 'reminders',
  inbox: 'inbox',
}

export const DEFAULT_DAILY_NOTE: Required<DailyNoteConfig> = {
  enabled: false,
  folder: 'daily',
  format: 'YYYY-MM-DD',
}

export const DEFAULT_PATH_TEMPLATE = '{workspace}/{project}/{folder}'

/** Defaults applied when no layer supplies a value. The vault field has no default — it must be supplied. */
export const DEFAULTS: Omit<ResolvedConfig, 'vault'> = {
  folders: DEFAULT_FOLDERS,
  pathTemplate: DEFAULT_PATH_TEMPLATE,
  workspaceStrategy: 'git-remote-org',
  dailyNote: DEFAULT_DAILY_NOTE,
  templates: {},
  excludeProjects: [],
  autoWikilink: true,
}
