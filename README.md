<p align="center">
  <h1 align="center">@cocaxcode/logbook-mcp</h1>
  <p align="center">
    <strong>Your developer logbook, always one sentence away.</strong><br/>
    Notes &middot; TODOs &middot; Reminders &middot; Code TODOs &middot; Full-text search &middot; Zero config
  </p>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@cocaxcode/logbook-mcp"><img src="https://img.shields.io/npm/v/@cocaxcode/logbook-mcp.svg?style=flat-square&color=cb3837" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/@cocaxcode/logbook-mcp"><img src="https://img.shields.io/npm/dm/@cocaxcode/logbook-mcp.svg?style=flat-square" alt="npm downloads" /></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square" alt="License" /></a>
  <img src="https://img.shields.io/badge/node-%3E%3D20-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node" />
  <img src="https://img.shields.io/badge/tools-9-blueviolet?style=flat-square" alt="9 tools" />
  <img src="https://img.shields.io/badge/tests-63-brightgreen?style=flat-square" alt="63 tests" />
</p>

<p align="center">
  <a href="#the-problem">The Problem</a> &middot;
  <a href="#installation">Installation</a> &middot;
  <a href="#just-talk-to-it">Usage</a> &middot;
  <a href="#features">Features</a> &middot;
  <a href="#reminders">Reminders</a> &middot;
  <a href="#tool-reference">Tool Reference</a> &middot;
  <a href="#storage">Storage</a> &middot;
  <a href="#contributing">Contributing</a>
</p>

---

## The Problem

You make decisions every day. Why JWT over sessions? Why Redis over Memcached? Why that specific database schema?

**Nobody writes it down.** Three months later, you ask yourself _"why did we do this?"_ — and the answer is gone.

Your TODOs live in 5 different places: Jira, sticky notes, code comments, your head, and that Slack message you'll never find again.

**logbook-mcp** is a developer logbook that lives inside your AI assistant. Notes, TODOs, reminders, and code TODOs — all queryable with natural language, without ever leaving your workflow.

### Why logbook-mcp?

| Feature | Benefit |
|---------|---------|
| **Zero context switching** | Don't leave Claude/Cursor to open another app |
| **Zero config** | Auto-detects your project, creates the DB on first use |
| **Zero AI costs** | Returns raw data, your AI client does the formatting |
| **Captures what git doesn't** | Decisions, ideas, blockers, reminders, and context |
| **Code TODOs included** | Scans your source for `TODO/FIXME/HACK/BUG` automatically |
| **Auto-sync code TODOs** | Detects when code TODOs disappear (you fixed them) |
| **Full-text search** | FTS5 powered, finds anything instantly |
| **Recurring reminders** | Daily, weekly, monthly patterns with auto-ack |
| **Multi-project** | One database, all your projects, query per-project or globally |

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

### Cursor

Add to `.cursor/mcp.json` in your project:

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

### Windsurf

Add to `.windsurf/mcp.json`:

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

### VS Code

Add to `.vscode/mcp.json`:

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

### Codex CLI

```bash
codex mcp add logbook-mcp -- npx @cocaxcode/logbook-mcp@latest --mcp
```

### Gemini CLI

Add to `.gemini/settings.json`:

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

---

## Just Talk to It

No commands to memorize. Just tell your AI what you need:

### Notes — capture what matters

| You say | What happens |
|---------|-------------|
| *"I decided to use JWT instead of sessions for scalability"* | Saved as **decision** — retrievable months from now |
| *"Note: Redis doesn't support nested JSON queries natively"* | Saved as a note for future reference |
| *"The CI is failing due to a timeout in integration tests"* | Captured as **blocker** — shows up in standups |
| *"We could add WebSocket support for real-time updates"* | Saved as **idea** — won't get lost in Slack |

### TODOs — your checklist, always at hand

| You say | What happens |
|---------|-------------|
| *"TODO: implement email validation"* | Created with topic **feature** (AI infers it) |
| *"Add these: fix token refresh. update deps. add rate limiting"* | **3 TODOs** created at once, each categorized |
| *"Mark 5 and 8 as done"* | Both marked as completed |
| *"What's pending?"* | All TODOs grouped by topic, including code TODOs |
| *"What's pending across all projects?"* | Global view of everything |

### Reminders — never forget

| You say | What happens |
|---------|-------------|
| *"Remind me tomorrow to deploy"* | One-time reminder for tomorrow |
| *"Remind me every Tuesday to review PRs"* | Recurring weekly reminder |
| *"Remind me the 1st of each month to renew certificates"* | Monthly recurring reminder |
| *"Remind me on weekdays to check the CI"* | Monday to Friday reminder |

### Search — find anything, instantly

| You say | What happens |
|---------|-------------|
| *"What did I do yesterday?"* | Notes + completed TODOs from yesterday |
| *"Search everything about auth"* | FTS5 search across all notes and TODOs |
| *"Show me all decisions this month"* | Filtered by topic **decision** and date range |
| *"Why did we choose JWT?"* | Finds the decision note, even months later |

---

## Features

### Smart project detection

logbook-mcp auto-detects which git project you're in. No setup, no config files:

```
You're in ~/projects/my-api/
  → "What's pending?" shows only my-api TODOs

You're in ~/projects/my-frontend/
  → Same question shows only my-frontend TODOs

You ask "all projects"
  → Global view across everything
```

### 7 built-in topics

Every note, TODO, and reminder is categorized. The AI infers the topic automatically, or you can specify it:

| Topic | Purpose | Auto-mapped from commits | AI infers from |
|-------|---------|:------------------------:|----------------|
| **feature** | New functionality | `feat:` | "implement", "add", "create" |
| **fix** | Bug fixes | `fix:` | "fix", "bug", "broken" |
| **chore** | Maintenance, CI/CD, refactoring | `refactor:` `docs:` `ci:` `build:` `test:` | "update", "clean", "refactor" |
| **idea** | Future proposals | — | "maybe", "could", "explore" |
| **decision** | Architecture choices | — | "decided", "chose", "going with" |
| **blocker** | Things blocking progress | — | "blocked", "can't", "waiting" |
| **reminder** | Time-based reminders | — | Auto-assigned when `remind_at` is set |

Topics are auto-created when the AI uses one that doesn't exist. You can also create custom topics:

```
"Create a topic called 'security'"
→ Done. Now you can tag notes and TODOs with 'security'.
```

### TODOs as checklist

Manual TODOs with priority levels:

```
📋 feature (3)
  ☐ #12 Implement email validation
  ☐ #15 [HIGH] Dynamic permissions endpoint
  ☑ #9  Google OAuth login (completed Mar 17)

📋 fix (1)
  ☐ #8  [URGENT] Token doesn't refresh

📋 blocker (1)
  ☐ #20 Resolve CI timeout
```

### Code TODOs — live from your source

Your `TODO`, `FIXME`, `HACK`, and `BUG` comments appear alongside manual TODOs:

```
📋 feature (2)
  ☐ #12 [manual] Implement email validation
  📄 [code]  TODO: add OAuth support — src/auth/service.ts:45

📋 fix (3)
  ☐ #8  [manual] Token doesn't refresh
  📄 [code]  FIXME: handle null case — src/users/controller.ts:78
  📄 [code]  BUG: race condition — src/chat/gateway.ts:112

📋 chore (1)
  📄 [code]  HACK: proxy workaround — src/middleware/cors.ts:23
```

**Auto-sync:** When you fix a code TODO and it disappears from the source, logbook detects it and marks it as resolved. No action needed — it happens automatically when you list your TODOs.

### Batch operations

```
"Add: validate email. fix token. update deps"     → 3 TODOs created
"Mark 5, 8, and 12 as done"                       → 3 TODOs completed
"Delete TODOs 3 and 7"                             → 2 TODOs removed
```

### Full-text search (FTS5)

Instant search across all notes and TODOs, powered by SQLite FTS5:

```
"Search auth"
→ Finds notes about JWT decisions, TODOs about auth endpoints,
  and anything mentioning "auth" — across all projects if you want
```

---

## Reminders

logbook-mcp supports both one-time and recurring reminders.

### One-time reminders

```
"Remind me tomorrow to deploy to production"
→ remind_at: "2026-03-20", topic: "reminder"

"Remind me on March 25 to review the quarterly report"
→ remind_at: "2026-03-25", topic: "reminder"
```

### Recurring reminders

| You say | Pattern | When it fires |
|---------|---------|---------------|
| *"Remind me every day to check CI"* | `daily` | Every day |
| *"Remind me on weekdays to do standup"* | `weekdays` | Monday to Friday |
| *"Remind me every Tuesday to review PRs"* | `weekly:2` | Every Tuesday |
| *"Remind me Mondays and Wednesdays to sync"* | `weekly:1,3` | Mon + Wed |
| *"Remind me the 1st of each month to renew certs"* | `monthly:1` | 1st of month |
| *"Remind me the 1st and 15th to check billing"* | `monthly:1,15` | 1st + 15th |

### How reminders behave

```
Tuesday 9:00 — you open Claude
  ⏰ Reminder: review PRs (weekly, every Tuesday)
  → Shows once, auto-acknowledged for today

Tuesday 14:00 — you open Claude again
  → Nothing. Already shown today.

Wednesday — you open Claude
  → Nothing. Not a Tuesday.

Next Tuesday — you open Claude
  → ⏰ Reminder: review PRs (shows again)
```

**To stop a recurring reminder permanently:** delete it with `logbook_todo_rm`.

### Overdue reminders

One-time reminders that weren't completed show as overdue:

```
⏰ Reminders for today (Mar 19)
  my-api: deploy to production

⚠️ Overdue
  my-frontend: fix dark mode (was due Mar 17 — 2 days late)
```

### MCP Resource: automatic reminder delivery

logbook-mcp exposes a **Resource** (`logbook://reminders`) that MCP clients can load automatically when starting a session. This means your AI tells you about pending reminders **without you asking**.

#### Resource compatibility

| Client | Resources support | Reminders behavior |
|--------|:-----------------:|-------------------|
| **Claude Code** | ✅ Yes | Reminders shown automatically on session start |
| **Claude Desktop** | ✅ Yes | Reminders shown automatically on session start |
| **Cursor** | ❌ No | Ask *"any reminders?"* — works via `logbook_todo_list` |
| **Windsurf** | ❌ No | Ask *"any reminders?"* — works via `logbook_todo_list` |
| **VS Code + Copilot** | ⚠️ Partial | Depends on MCP extension used |
| **Codex CLI** | ❌ No | Ask *"any reminders?"* — works via `logbook_todo_list` |
| **Gemini CLI** | ❌ No | Ask *"any reminders?"* — works via `logbook_todo_list` |

> **Important:** Even without Resource support, reminders always work. You just need to ask for them instead of getting them automatically. All 9 tools work identically across all MCP clients.

---

## A Day With logbook-mcp

Here's what a typical day looks like:

### Morning — start your day

```
You: "What did I do yesterday?"

Claude: Yesterday on my-api:
  📝 [decision] Chose sliding window for rate limiting over fixed window
  ☑ #8 Fixed token refresh bug
  ☑ #12 Implemented email validation
  📄 [resolved] FIXME in src/users/controller.ts (handle null case)

You: "What's pending?"

Claude: my-api — 4 pending:
  📋 feature
    ☐ #15 [HIGH] Dynamic permissions endpoint
    📄 TODO: add OAuth — src/auth/service.ts:45
  📋 chore
    ☐ #21 Update dependencies
  📋 reminder
    ⏰ #25 Review PRs (recurring: every Tuesday)
```

### Working — capture as you go

```
You: "I decided to use Redis for session cache because
      Memcached doesn't support key expiration callbacks"

Claude: ✅ Note saved [decision] in my-api

You: "TODO: add rate limit headers to API responses.
      TODO: document the new permissions endpoint.
      TODO: fix CORS for mobile app"

Claude: ✅ 3 TODOs created:
  ☐ #26 [feature] Add rate limit headers
  ☐ #27 [chore] Document permissions endpoint
  ☐ #28 [fix] Fix CORS for mobile app

You: "Remind me Friday to deploy the permissions update"

Claude: ✅ Reminder set for 2026-03-21 [reminder]
```

### End of day — wrap up

```
You: "Mark 15, 26, and 28 as done"

Claude: ✅ 3 TODOs completed

You: "What did I do today?"

Claude: Today on my-api:
  📝 [decision] Redis for session cache (expiration callbacks)
  ☑ #15 Dynamic permissions endpoint
  ☑ #26 Rate limit headers
  ☑ #28 CORS fix for mobile
  📄 [resolved] HACK in src/middleware/cors.ts (removed workaround)
```

### Weekly review — see the big picture

```
You: "Summary of this week across all projects"

Claude:
  my-api: 3 notes, 8 TODOs completed, 4 pending
  my-frontend: 1 note, 3 TODOs completed, 2 pending
  my-docs: 0 notes, 1 TODO completed, 0 pending

You: "Search everything about auth across all projects"

Claude: 12 results:
  [note] my-api — Decided JWT over sessions (Mar 12)
  [note] my-api — Redis for session cache (Mar 19)
  [todo] my-api — ☐ Add OAuth support
  [todo] my-frontend — ☑ Auth redirect fix (completed Mar 15)
  ...
```

---

## Tool Reference

| Category | Tools | Count |
|----------|-------|:-----:|
| **Activity** | `logbook_log` `logbook_search` | 2 |
| **Notes** | `logbook_note` | 1 |
| **TODOs** | `logbook_todo_add` `logbook_todo_list` `logbook_todo_done` `logbook_todo_edit` `logbook_todo_rm` | 5 |
| **Config** | `logbook_topics` | 1 |
| **Resource** | `logbook://reminders` | — |
| **Total** | | **9 tools + 1 resource** |

<details>
<summary><strong>logbook_log</strong> — Activity for a period</summary>

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
<summary><strong>logbook_note</strong> — Add a note</summary>

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `content` | string | Yes | Note content (max 5000 chars) |
| `topic` | string | No | Topic name — AI infers it, or auto-created if new |
</details>

<details>
<summary><strong>logbook_todo_add</strong> — Create TODOs</summary>

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

For recurring reminders, "done" means acknowledged for today. It will reappear on the next matching day.
</details>

<details>
<summary><strong>logbook_todo_edit</strong> — Edit a TODO</summary>

| Param | Type | Description |
|-------|------|-------------|
| `id` | number | TODO ID to edit |
| `content` | string | New content |
| `topic` | string | New topic (auto-created if new) |
| `priority` | `low` `normal` `high` `urgent` | New priority |
</details>

<details>
<summary><strong>logbook_todo_rm</strong> — Delete TODOs</summary>

| Param | Type | Description |
|-------|------|-------------|
| `ids` | number or number[] | ID(s) to delete permanently |

Use this to stop recurring reminders permanently.
</details>

<details>
<summary><strong>logbook_search</strong> — Full-text search</summary>

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `query` | string | — | Search text (required, max 500 chars) |
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
| `name` | string | — | New topic name (lowercase, `[a-z0-9-]` only, max 50 chars) |
| `description` | string | — | Topic description (max 200 chars) |
</details>

---

## Storage

All data lives in a single SQLite database:

```
~/.logbook/
└── logbook.db          # All projects, notes, TODOs, reminders in one file
```

- **WAL mode** for concurrent reads
- **FTS5** virtual tables for instant full-text search
- **Triggers** keep search indexes in sync automatically
- **Foreign keys** with `ON DELETE SET NULL` — delete a project, notes remain
- **Code TODO snapshots** — tracks which code TODOs existed, detects when they're resolved

---

## Architecture

```
src/
├── index.ts              # Entry: --mcp → server, else CLI
├── server.ts             # createServer() — 9 tools + 1 resource
├── cli.ts                # CLI (help, version)
├── types.ts              # Shared interfaces
├── db/
│   ├── connection.ts     # getDb() singleton → ~/.logbook/logbook.db
│   ├── schema.ts         # Tables + FTS5 + triggers + topic seed
│   └── queries.ts        # Typed query functions + reminder logic
├── git/
│   ├── detect-repo.ts    # Auto-detect project via git rev-parse
│   └── code-todos.ts     # Scan TODO/FIXME/HACK/BUG via git grep
├── resources/
│   └── reminders.ts      # MCP Resource: logbook://reminders
└── tools/                # 9 MCP tools (one file each)
```

**Stack:** TypeScript &middot; MCP SDK 1.27 &middot; better-sqlite3 &middot; Zod &middot; Vitest &middot; tsup

---

## Contributing

```bash
git clone https://github.com/cocaxcode/logbook-mcp.git
cd logbook-mcp
npm install
npm test              # 60 tests
npm run build         # Build with tsup
npm run typecheck     # TypeScript check
npm run inspector     # Test with MCP Inspector
```

---

## License

MIT &copy; [cocaxcode](https://github.com/cocaxcode)
