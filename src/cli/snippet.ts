/**
 * MCP snippets for popular clients.
 * Returns the JSON snippet ready to paste into the client's config.
 */

export type McpClient =
  | 'claude-code'
  | 'claude-desktop'
  | 'cursor'
  | 'windsurf'
  | 'vscode'
  | 'codex'
  | 'gemini'

export const MCP_CLIENTS: McpClient[] = [
  'claude-code',
  'claude-desktop',
  'cursor',
  'windsurf',
  'vscode',
  'codex',
  'gemini',
]

export interface SnippetParams {
  vaultDir: string
  workspace?: string
  client: McpClient
}

export function buildSnippet(params: SnippetParams): string {
  const args = ['@cocaxcode/logbook-mcp@latest', '--mcp', '--dir', params.vaultDir]
  if (params.workspace) args.push('--workspace', params.workspace)
  const command = 'npx'

  // Claude Desktop / Claude Code / Cursor / Windsurf / VS Code share the canonical mcpServers shape.
  switch (params.client) {
    case 'claude-code':
    case 'claude-desktop':
    case 'cursor':
    case 'windsurf':
    case 'vscode':
      return JSON.stringify(
        {
          mcpServers: {
            'logbook-mcp': { command, args },
          },
        },
        null,
        2,
      )

    case 'codex':
      // Codex uses a flatter format
      return JSON.stringify(
        {
          servers: {
            'logbook-mcp': { command, args },
          },
        },
        null,
        2,
      )

    case 'gemini':
      return JSON.stringify(
        {
          mcpServers: {
            'logbook-mcp': { command, args, transport: 'stdio' },
          },
        },
        null,
        2,
      )

    default:
      return JSON.stringify({ command, args }, null, 2)
  }
}
