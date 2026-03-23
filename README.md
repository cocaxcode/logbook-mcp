<p align="center">
  <h1 align="center">@cocaxcode/logbook-mcp</h1>
  <p align="center">
    <strong>Your developer logbook, always one sentence away.</strong><br/>
    Notes &middot; TODOs &middot; Reminders &middot; Code scanning &middot; Full-text search &middot; Obsidian mode &middot; Zero config
  </p>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@cocaxcode/logbook-mcp"><img src="https://img.shields.io/npm/v/@cocaxcode/logbook-mcp.svg?style=flat-square&color=cb3837" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/@cocaxcode/logbook-mcp"><img src="https://img.shields.io/npm/dm/@cocaxcode/logbook-mcp.svg?style=flat-square" alt="npm downloads" /></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square" alt="License" /></a>
  <img src="https://img.shields.io/badge/node-%3E%3D20-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node" />
  <img src="https://img.shields.io/badge/tools-15-blueviolet?style=flat-square" alt="15 tools" />
</p>

<p align="center">
  <a href="#quick-overview">Overview</a> &middot;
  <a href="#just-talk-to-it">Usage</a> &middot;
  <a href="#installation">Installation</a> &middot;
  <a href="#features">Features</a> &middot;
  <a href="#tool-reference">Tool Reference</a> &middot;
  <a href="#storage">Storage</a> &middot;
  <a href="#architecture">Architecture</a>
</p>

---

## Quick Overview

logbook-mcp is an MCP server that turns your AI assistant into a persistent developer logbook. Capture decisions, track TODOs, set reminders, scan code TODOs, and search everything with full-text search — without leaving your editor.

It auto-detects your git project, stores everything locally, and works with any MCP-compatible client: Claude Code, Claude Desktop, Cursor, Windsurf, VS Code, Codex CLI, or Gemini CLI. **All data stays on your machine — nothing is synced, nothing is tracked, nothing leaves your disk.** Notes are scoped per-project automatically, but you can search globally across all your projects at any time.

Two storage modes: **SQLite** (default, zero config) or **Obsidian** (markdown files with frontmatter, visible in your Obsidian vault with Graph View, Dataview, Tasks, and Calendar).

---

## Just Talk to It

No commands to memorize. Just say what you need.

### Capture notes

```
"I decided to use JWT instead of sessions for scalability"
→ Saved as a decision — retrievable months from now

"The CI is failing due to a timeout in integration tests"
→ Captured as a blocker — shows up when you review activity
```

### Track TODOs

```
"TODO: implement email validation"
→ Created with auto-inferred topic

"Add these: fix token refresh. update deps. add rate limiting"
→ 3 TODOs created at once, each categorized

"Mark 5 and 8 as done"
→ Both completed

"What's pending across all projects?"
→ Global view of everything, including code TODOs
```

### Set reminders

```
"Remind me tomorrow to deploy"
→ One-time reminder

"Remind me every Tuesday to review PRs"
→ Recurring weekly — auto-acknowledged after each session

"Remind me on weekdays to check the CI"
→ Monday to Friday
```

### Search anything

```
"Why did we choose JWT?"
→ Finds the decision note, even months later

"Search everything about auth"
→ FTS5 search across all notes and TODOs
```

---

## Installation

### Claude Code (recommended)

```bash
claude mcp add --scope user logbook -- npx @cocaxcode/logbook-mcp@latest --mcp
```

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "logbook-mcp": {
      "command": "npx",
      "args": ["@cocaxcode/logbook-mcp@latest", "--mcp"]
    }
  }
}
```

<details>
<summary>Config file locations</summary>

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`
</details>

<details>
<summary>Cursor, Windsurf, VS Code, Codex CLI, Gemini CLI</summary>

**Cursor** — add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "logbook-mcp": {
      "command": "npx",
      "args": ["@cocaxcode/logbook-mcp@latest", "--mcp"]
    }
  }
}
```

**Windsurf** — add to `.windsurf/mcp.json`:

```json
{
  "mcpServers": {
    "logbook-mcp": {
      "command": "npx",
      "args": ["@cocaxcode/logbook-mcp@latest", "--mcp"]
    }
  }
}
```

**VS Code** — add to `.vscode/mcp.json`:

```json
{
  "servers": {
    "logbook-mcp": {
      "command": "npx",
      "args": ["@cocaxcode/logbook-mcp@latest", "--mcp"]
    }
  }
}
```

**Codex CLI**:

```bash
codex mcp add logbook-mcp -- npx @cocaxcode/logbook-mcp@latest --mcp
```

**Gemini CLI** — add to `.gemini/settings.json`:

```json
{
  "mcpServers": {
    "logbook-mcp": {
      "command": "npx",
      "args": ["@cocaxcode/logbook-mcp@latest", "--mcp"]
    }
  }
}
```

</details>

---

## Features

### 7 built-in topics

Every note, TODO, and reminder is categorized automatically by your AI, or you can specify a topic explicitly.

| Topic | Purpose | Mapped from conventional commits |
|-------|---------|:--------------------------------:|
| **feature** | New functionality | `feat:` |
| **fix** | Bug fixes | `fix:` |
| **chore** | Maintenance, CI/CD, refactoring | `refactor:` `docs:` `ci:` `build:` `test:` |
| **idea** | Future proposals | — |
| **decision** | Architecture choices | — |
| **blocker** | Things blocking progress | — |
| **reminder** | Time-based reminders | — |

Custom topics can be created at any time — just say *"create a topic called security"*.

### Code TODO scanning

Your `TODO`, `FIXME`, `HACK`, and `BUG` comments are detected via `git grep` and shown alongside manual TODOs:

```
feature (2)
  [ ] #12 [manual] Implement email validation
      [code]  TODO: add OAuth support — src/auth/service.ts:45

fix (3)
  [ ] #8  [manual] Token doesn't refresh
      [code]  FIXME: handle null case — src/users/controller.ts:78
      [code]  BUG: race condition — src/chat/gateway.ts:112
```

When a code TODO disappears from source (because you fixed it), logbook detects it automatically and marks it as resolved.

### Reminders

Both one-time and recurring patterns are supported:

| Pattern | Example | Schedule |
|---------|---------|----------|
| One-time | `remind_at: "2026-03-25"` | March 25 only |
| `daily` | Every day | Every day |
| `weekdays` | Monday to Friday | Mon–Fri |
| `weekly:2` | Every Tuesday | Specific day of week |
| `weekly:1,3` | Monday and Wednesday | Multiple days |
| `monthly:1` | 1st of each month | Specific day of month |
| `monthly:1,15` | 1st and 15th | Multiple days |

Recurring reminders auto-acknowledge after being shown once per day. One-time reminders that were missed show as overdue.

> **Tip:** logbook-mcp exposes an MCP Resource (`logbook://reminders`) that clients can load on session start. In Claude Code and Claude Desktop, reminders appear automatically without asking. In other clients, just say *"any reminders?"*.

### Full-text search (FTS5)

Search across all notes and TODOs instantly, powered by SQLite FTS5. Filter by topic, type, project, or search globally across all projects.

### Batch operations

```
"Add: validate email. fix token. update deps"     → 3 TODOs created
"Mark 5, 8, and 12 as done"                       → 3 TODOs completed
"Delete TODOs 3 and 7"                             → 2 TODOs removed
```

### Smart project detection

logbook-mcp auto-detects which git project you're in via `git rev-parse`. No config needed — it scopes queries to the current project by default, with a `global` option to see everything.

---

## Tool Reference

| Category | Tools | Count |
|----------|-------|:-----:|
| **Activity** | `logbook_log` `logbook_search` `logbook_timeline` | 3 |
| **Notes** | `logbook_note` `logbook_standup` `logbook_decision` `logbook_debug` | 4 |
| **TODOs** | `logbook_todo_add` `logbook_todo_list` `logbook_todo_done` `logbook_todo_edit` `logbook_todo_rm` | 5 |
| **Config** | `logbook_topics` `logbook_tags` | 2 |
| **Migration** | `logbook_migrate` | 1 |
| **Resource** | `logbook://reminders` | — |
| | | **15 tools + 1 resource** |

<details>
<summary><code>logbook_log</code> — Activity for a period</summary>

Shows notes, completed TODOs, and resolved code TODOs for a time range.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `period` | `today` `yesterday` `week` `month` | `today` | Quick date filter |
| `from` | `YYYY-MM-DD` | — | Custom start date (overrides period) |
| `to` | `YYYY-MM-DD` | — | Custom end date |
| `type` | `all` `notes` `todos` | `all` | Filter by entry type |
| `topic` | string | — | Filter by topic name |
| `scope` | `project` `global` | `project` | Current project or all |
</details>

<details>
<summary><code>logbook_note</code> — Add a note</summary>

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `content` | string | Yes | Note content (max 5000 chars) |
| `topic` | string | No | Topic name — AI infers it, or auto-created if new |
</details>

<details>
<summary><code>logbook_todo_add</code> — Create TODOs</summary>

| Param | Type | Description |
|-------|------|-------------|
| `content` | string | Single TODO content (max 2000 chars) |
| `topic` | string | Topic — auto-inferred or auto-created |
| `priority` | `low` `normal` `high` `urgent` | Priority (default: normal) |
| `remind_at` | `YYYY-MM-DD` | One-time reminder date |
| `remind_pattern` | string | Recurring: `daily`, `weekdays`, `weekly:N`, `monthly:N` |
| `items` | array | Multiple TODOs: `[{content, topic?, priority?, remind_at?, remind_pattern?}]` (max 50) |
</details>

<details>
<summary><code>logbook_todo_list</code> — List TODOs</summary>

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `status` | `pending` `done` `all` | `pending` | Filter by status |
| `topic` | string | — | Filter by topic |
| `priority` | `low` `normal` `high` `urgent` | — | Filter by priority |
| `source` | `all` `manual` `code` | `all` | Manual DB or code comments |
| `scope` | `project` `global` | `project` | Current project or all |
| `from` / `to` | `YYYY-MM-DD` | — | Date range filter |
</details>

<details>
<summary><code>logbook_todo_done</code> — Mark as done / undo</summary>

| Param | Type | Description |
|-------|------|-------------|
| `ids` | number or number[] | ID(s) to mark |
| `undo` | boolean | If true, sets back to pending (default: false) |

For recurring reminders, "done" means acknowledged for today. It will reappear on the next matching day.
</details>

<details>
<summary><code>logbook_todo_edit</code> — Edit a TODO</summary>

| Param | Type | Description |
|-------|------|-------------|
| `id` | number | TODO ID to edit |
| `content` | string | New content |
| `topic` | string | New topic (auto-created if new) |
| `priority` | `low` `normal` `high` `urgent` | New priority |
</details>

<details>
<summary><code>logbook_todo_rm</code> — Delete TODOs</summary>

| Param | Type | Description |
|-------|------|-------------|
| `ids` | number or number[] | ID(s) to delete permanently |

Use this to stop recurring reminders permanently.
</details>

<details>
<summary><code>logbook_search</code> — Full-text search</summary>

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `query` | string | — | Search text (required, max 500 chars) |
| `type` | `all` `notes` `todos` | `all` | Search scope |
| `topic` | string | — | Filter by topic |
| `scope` | `project` `global` | `project` | Project or global |
| `limit` | number | 20 | Max results |
</details>

<details>
<summary><code>logbook_topics</code> — Manage topics</summary>

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `action` | `list` `add` | `list` | List or create topics |
| `name` | string | — | New topic name (lowercase, `[a-z0-9-]` only, max 50 chars) |
| `description` | string | — | Topic description (max 200 chars) |
</details>

---

## Storage

### SQLite mode (default)

All data lives in a single SQLite database at `~/.logbook/logbook.db`. Zero config.

- **WAL mode** for concurrent reads
- **FTS5** virtual tables for instant full-text search
- **Triggers** keep search indexes in sync automatically
- **Code TODO snapshots** — tracks which code TODOs existed, detects when they disappear

### Obsidian mode

Writes markdown files with YAML frontmatter directly to your Obsidian vault. Configure with environment variables:

```json
{
  "mcpServers": {
    "logbook-mcp": {
      "command": "npx",
      "args": ["@cocaxcode/logbook-mcp@latest", "--mcp"],
      "env": {
        "LOGBOOK_STORAGE": "obsidian",
        "LOGBOOK_DIR": "/path/to/your/vault/logbook"
      }
    }
  }
}
```

Files are organized by workspace, project, and type:

```
vault/logbook/
├── cocaxcode/
│   ├── cocaxcode-api/
│   │   ├── notes/          ← logbook_note
│   │   ├── todos/          ← logbook_todo_add
│   │   ├── decisions/      ← logbook_decision
│   │   ├── debug/          ← logbook_debug
│   │   ├── standups/       ← logbook_standup
│   │   └── attachments/    ← copied files
│   └── cocaxcode-web/
├── optimus/
│   └── optimus-hub/
```

Each file has YAML frontmatter that Obsidian plugins can query:

```yaml
---
type: todo
date: 2026-03-21
project: cocaxcode-api
workspace: cocaxcode
status: pending
priority: high
due: 2026-03-25
tags: [auth, urgent]
---
- [ ] Fix JWT refresh token 🔼 📅 2026-03-25
```

**Recommended Obsidian plugins:** Dataview (SQL-like queries), Calendar (date view), Tasks (checkbox management), Graph View (built-in, shows connections via `[[wikilinks]]`).

**Migration from SQLite:** Run `logbook_migrate` with Obsidian mode enabled to convert existing data.

> **Tip:** Combine with [Self-hosted LiveSync](https://github.com/vrtmrz/obsidian-livesync) + CouchDB on your VPS to sync your vault across PC, Android, and iOS for free.

---

## Architecture

```
src/
├── index.ts              # Entry: --mcp → server, else CLI
├── server.ts             # createServer() — 15 tools + 1 resource
├── cli.ts                # CLI (help, version)
├── types.ts              # Shared interfaces
├── storage/
│   ├── types.ts          # StorageBackend interface
│   ├── index.ts          # getStorage() factory (sqlite | obsidian)
│   ├── sqlite/           # SQLite backend (wraps db/)
│   └── obsidian/         # Obsidian backend (markdown + frontmatter)
├── db/                   # SQLite internals
├── git/                  # Git repo detection + code TODO scanning
├── resources/            # MCP Resource: logbook://reminders
└── tools/                # 15 MCP tools (one file each)
```

**Stack:** TypeScript &middot; MCP SDK &middot; better-sqlite3 &middot; Zod &middot; tsup

---

[MIT](./LICENSE) &middot; Built by [cocaxcode](https://github.com/cocaxcode)
