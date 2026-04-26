import { describe, it, expect } from 'vitest'
import { buildSnippet, MCP_CLIENTS } from '../cli/snippet.js'

describe('buildSnippet', () => {
  it('builds canonical mcpServers shape for claude-code', () => {
    const out = JSON.parse(buildSnippet({ vaultDir: '/v', client: 'claude-code' }))
    expect(out.mcpServers['logbook-mcp'].command).toBe('npx')
    expect(out.mcpServers['logbook-mcp'].args).toEqual(['@cocaxcode/logbook-mcp@latest', '--mcp', '--dir', '/v'])
  })

  it('includes workspace flag when provided', () => {
    const out = JSON.parse(buildSnippet({ vaultDir: '/v', workspace: 'team', client: 'claude-desktop' }))
    expect(out.mcpServers['logbook-mcp'].args).toContain('--workspace')
    expect(out.mcpServers['logbook-mcp'].args).toContain('team')
  })

  it('uses servers (flat) for codex', () => {
    const out = JSON.parse(buildSnippet({ vaultDir: '/v', client: 'codex' }))
    expect(out.servers['logbook-mcp']).toBeDefined()
    expect(out.mcpServers).toBeUndefined()
  })

  it('adds transport stdio for gemini', () => {
    const out = JSON.parse(buildSnippet({ vaultDir: '/v', client: 'gemini' }))
    expect(out.mcpServers['logbook-mcp'].transport).toBe('stdio')
  })

  it('exports list of supported clients', () => {
    expect(MCP_CLIENTS).toContain('claude-code')
    expect(MCP_CLIENTS).toContain('cursor')
    expect(MCP_CLIENTS.length).toBe(7)
  })
})
