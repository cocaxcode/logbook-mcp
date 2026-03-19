<p align="center">
  <h1 align="center">@cocaxcode/logbook-mcp</h1>
  <p align="center">
    <strong>Your developer logbook, always one sentence away.</strong><br/>
    Notes &middot; TODOs &middot; Code TODOs &middot; Full-text search &middot; Zero config
  </p>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@cocaxcode/logbook-mcp"><img src="https://img.shields.io/npm/v/@cocaxcode/logbook-mcp.svg?style=flat-square&color=cb3837" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/@cocaxcode/logbook-mcp"><img src="https://img.shields.io/npm/dm/@cocaxcode/logbook-mcp.svg?style=flat-square" alt="npm downloads" /></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square" alt="License" /></a>
  <img src="https://img.shields.io/badge/node-%3E%3D20-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node" />
  <img src="https://img.shields.io/badge/tools-9-blueviolet?style=flat-square" alt="9 tools" />
  <img src="https://img.shields.io/badge/tests-56-brightgreen?style=flat-square" alt="56 tests" />
</p>

<p align="center">
  <a href="#the-problem">The Problem</a> &middot;
  <a href="#installation">Installation</a> &middot;
  <a href="#just-talk-to-it">Usage</a> &middot;
  <a href="#features">Features</a> &middot;
  <a href="#tool-reference">Tool Reference</a> &middot;
  <a href="#storage">Storage</a> &middot;
  <a href="#contributing">Contributing</a>
</p>

---

## The Problem

You make decisions every day. Why JWT over sessions? Why Redis over Memcached? Why that specific database schema?

**Nobody writes it down.** Three months later, you ask yourself _"why did we do this?"_ — and the answer is gone.

Your TODOs live in 5 different places: Jira, sticky notes, code comments, your head, and that Slack message you'll never find again.

**logbook-mcp** is a developer logbook that lives inside your AI assistant. Notes, TODOs, and code TODOs — all queryable with natural language, without ever leaving your workflow.

### Why logbook-mcp?

- **Zero context switching** — don't leave Claude/Cursor to open another app
- **Zero config** — auto-detects your project, creates the DB on first use
- **Zero AI costs** — returns raw data, your AI client does the formatting
- **Captures what git doesn't** — decisions, ideas, blockers, and context
- **Code TODOs included** — scans your source for `TODO/FIXME/HACK/BUG` automatically
- **Full-text search** — FTS5 powered, finds anything instantly

---

## Installation

### Claude Code (recommended)

```bash
claude mcp add logbook-mcp -- npx @cocaxcode/logbook-mcp --mcp
```

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "logbook-mcp": {
      "command": "npx",
      "args": ["@cocaxcode/logbook-mcp", "--mcp"]
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

### Cursor

Add to `.cursor/mcp.json` in your project:

```json
{
  "mcpServers": {
    "logbook-mcp": {
      "command": "npx",
      "args": ["@cocaxcode/logbook-mcp", "--mcp"]
    }
  }
}
```

### Windsurf

Add to `.windsurf/mcp.json`:

```json
{
  "mcpServers": {
    "logbook-mcp": {
      "command": "npx",
      "args": ["@cocaxcode/logbook-mcp", "--mcp"]
    }
  }
}
```

### VS Code

Add to `.vscode/mcp.json`:

```json
{
  "servers": {
    "logbook-mcp": {
      "command": "npx",
      "args": ["@cocaxcode/logbook-mcp", "--mcp"]
    }
  }
}
```

### Codex CLI

```bash
codex mcp add logbook-mcp -- npx @cocaxcode/logbook-mcp --mcp
```

### Gemini CLI

Add to `.gemini/settings.json`:

```json
{
  "mcpServers": {
    "logbook-mcp": {
      "command": "npx",
      "args": ["@cocaxcode/logbook-mcp", "--mcp"]
    }
  }
}
```

---

## Just Talk to It

No commands to memorize. Just tell your AI what you need:

### Notes — capture decisions and context

| You say | What happens |
|---------|-------------|
| *"I decided to use JWT instead of sessions for scalability"* | `logbook_note` saves it as a **decision** in the current project |
| *"Note: Redis doesn't support nested JSON queries natively"* | `logbook_note` saves it as a **learning** for future reference |
| *"The CI pipeline is failing due to a timeout in integration tests"* | `logbook_note` captures the **blocker** so standup reports include it |

### TODOs — your checklist, always at hand

| You say | What happens |
|---------|-------------|
| *"TODO: implement email validation for registration"* | `logbook_todo_add` creates a TODO, AI infers topic **feature** |
| *"Add these TODOs: fix token refresh. update dependencies. add rate limiting"* | `logbook_todo_add` creates **3 TODOs** at once, each with its inferred topic |
| *"Mark 5 and 8 as done"* | `logbook_todo_done` marks both TODOs as completed |
| *"What's pending?"* | `logbook_todo_list` shows all TODOs grouped by topic, including code TODOs |

### Search and history

| You say | What happens |
|---------|-------------|
| *"What did I do yesterday?"* | `logbook_log` returns notes + completed TODOs from yesterday |
| *"Search everything about auth"* | `logbook_search` finds notes and TODOs matching "auth" via FTS5 |
| *"Show me all decisions this month"* | `logbook_log` filters by topic **decision** and date range |
| *"What's pending across all projects?"* | `logbook_todo_list` with global scope shows everything |

---

## Features

### Smart project detection

logbook-mcp auto-detects which git project you're in. No setup, no config files:

```
Working in ~/projects/my-api/
  → Notes and TODOs automatically linked to "my-api"

Working in ~/projects/my-frontend/
  → Separate context, same database

Ask for "all projects"
  → Global view across everything
```

### Notes with topics

6 built-in topics that cover every scenario:

| Topic | What it captures | From commits |
|-------|-----------------|--------------|
| **feature** | New functionality | `feat:` |
| **fix** | Bug fixes | `fix:` |
| **chore** | Maintenance, refactoring, CI/CD | `refactor:` `docs:` `ci:` `build:` `test:` |
| **idea** | Future proposals, explorations | — |
| **decision** | Architecture choices with reasoning | — |
| **blocker** | Things blocking your progress | — |

Need more? Create custom topics:

```
"Create a topic called 'security' for security-related items"
→ logbook_topics(action: 'add', name: 'security')
```

### TODOs as checklist

Manual TODOs with priority levels (`low`, `normal`, `high`, `urgent`):

```
feature (3)
  ☐ #12 Implement email validation
  ☐ #15 [HIGH] Dynamic permissions endpoint
  ☑ #9  Google OAuth login (completed Mar 17)

fix (1)
  ☐ #8  [URGENT] Token doesn't refresh

blocker (1)
  ☐ #20 Resolve CI timeout
```

### Code TODOs

Your `TODO`, `FIXME`, `HACK`, and `BUG` comments in source code appear alongside manual TODOs:

```
feature (2)
  ☐ #12 [manual] Implement email validation
  📄 [code]  TODO: add OAuth support — src/auth/service.ts:45

fix (2)
  ☐ #8  [manual] Token doesn't refresh
  📄 [code]  FIXME: handle null case — src/users/controller.ts:78
  📄 [code]  BUG: race condition — src/chat/gateway.ts:112

chore (1)
  📄 [code]  HACK: proxy workaround — src/middleware/cors.ts:23
```

Code TODOs are scanned live via `git grep` — they disappear when you fix them.

### Full-text search (FTS5)

Search across all notes and TODOs instantly:

```
"Search auth"
→ Finds notes about JWT decisions, TODOs about auth endpoints,
  and anything mentioning "auth" across all projects
```

### Batch operations

Create, complete, or delete multiple items at once:

```
"Add: validate email. fix token. update deps"     → 3 TODOs created
"Mark 5, 8, and 12 as done"                       → 3 TODOs completed
"Delete TODOs 3 and 7"                             → 2 TODOs removed
```

---

## Tool Reference

| Category | Tools | Count |
|----------|-------|:-----:|
| **Activity** | `logbook_log` `logbook_search` | 2 |
| **Notes** | `logbook_note` | 1 |
| **TODOs** | `logbook_todo_add` `logbook_todo_list` `logbook_todo_done` `logbook_todo_edit` `logbook_todo_rm` | 5 |
| **Config** | `logbook_topics` | 1 |
| **Total** | | **9** |

<details>
<summary><strong>logbook_log</strong> — Activity for a period</summary>

Shows notes and completed TODOs for a time range.

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
<summary><strong>logbook_note</strong> — Add a note</summary>

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `content` | string | Yes | Note content |
| `topic` | string | No | Topic name (AI can infer it) |
</details>

<details>
<summary><strong>logbook_todo_add</strong> — Create TODOs</summary>

| Param | Type | Description |
|-------|------|-------------|
| `content` | string | Single TODO content |
| `topic` | string | Topic for single TODO |
| `priority` | `low` `normal` `high` `urgent` | Priority (default: normal) |
| `items` | array | Multiple TODOs: `[{content, topic?, priority?}]` |
</details>

<details>
<summary><strong>logbook_todo_list</strong> — List TODOs</summary>

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
<summary><strong>logbook_todo_done</strong> — Mark as done/undo</summary>

| Param | Type | Description |
|-------|------|-------------|
| `ids` | number or number[] | ID(s) to mark |
| `undo` | boolean | If true, sets back to pending (default: false) |
</details>

<details>
<summary><strong>logbook_todo_edit</strong> — Edit a TODO</summary>

| Param | Type | Description |
|-------|------|-------------|
| `id` | number | TODO ID to edit |
| `content` | string | New content |
| `topic` | string | New topic |
| `priority` | `low` `normal` `high` `urgent` | New priority |
</details>

<details>
<summary><strong>logbook_todo_rm</strong> — Delete TODOs</summary>

| Param | Type | Description |
|-------|------|-------------|
| `ids` | number or number[] | ID(s) to delete |
</details>

<details>
<summary><strong>logbook_search</strong> — Full-text search</summary>

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `query` | string | — | Search text (required) |
| `type` | `all` `notes` `todos` | `all` | Search scope |
| `topic` | string | — | Filter by topic |
| `scope` | `project` `global` | `project` | Project or global |
| `limit` | number | 20 | Max results |
</details>

<details>
<summary><strong>logbook_topics</strong> — Manage topics</summary>

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `action` | `list` `add` | `list` | List or create topics |
| `name` | string | — | New topic name (for add) |
| `description` | string | — | Topic description (for add) |
</details>

---

## Storage

All data lives in a single SQLite database:

```
~/.logbook/
└── logbook.db          # All projects, notes, TODOs in one file
```

- **WAL mode** for concurrent reads
- **FTS5** virtual tables for instant full-text search
- **Triggers** keep search indexes in sync automatically
- **Foreign keys** with `ON DELETE SET NULL` — delete a project, notes remain

Add to your global `.gitignore`:
```
.logbook/
```

---

## How It Improves Your Productivity

### Morning standup in 10 seconds

Instead of trying to remember what you did yesterday:

```
"What did I do yesterday?"
→ Complete summary: notes, decisions, completed TODOs
```

### Never lose a decision again

```
"Why did we choose JWT?"
→ Search finds your note: "Decided JWT over sessions for horizontal scalability"
```

### One place for all TODOs

No more scattered checklists. Manual TODOs + code TODOs + priorities, all in one view:

```
"What's pending?"
→ Grouped by topic, with priority flags, across code and manual items
```

### Context that survives across sessions

Your AI assistant forgets everything between sessions. Your logbook doesn't:

```
"Search everything about the auth migration"
→ All notes, decisions, and TODOs related to auth — from any date
```

---

## Architecture

```
src/
├── index.ts              # Entry: --mcp → server, else CLI
├── server.ts             # createServer() factory, registers 9 tools
├── cli.ts                # CLI (help, version)
├── types.ts              # Shared interfaces
├── db/
│   ├── connection.ts     # getDb() singleton → ~/.logbook/logbook.db
│   ├── schema.ts         # Tables + FTS5 + triggers + topic seed
│   └── queries.ts        # Typed query functions
├── git/
│   ├── detect-repo.ts    # Auto-detect project via git rev-parse
│   └── code-todos.ts     # Scan TODO/FIXME/HACK/BUG via git grep
└── tools/                # 9 MCP tools (one file each)
```

**Stack:** TypeScript &middot; MCP SDK 1.27 &middot; better-sqlite3 &middot; Zod &middot; Vitest &middot; tsup

---

## Contributing

```bash
git clone https://github.com/cocaxcode/logbook-mcp.git
cd logbook-mcp
npm install
npm test              # 56 tests
npm run build         # Build with tsup
npm run typecheck     # TypeScript check
npm run inspector     # Test with MCP Inspector
```

---

## License

MIT &copy; [cocaxcode](https://github.com/cocaxcode)
