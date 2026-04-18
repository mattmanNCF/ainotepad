# Phase 05: Agent Layer — Context

**Gathered:** 2026-04-17
**Status:** Ready for planning
**Source:** /gsd:discuss-phase conversation

<domain>
## Phase Boundary

Expose AInotepad's note and wiki data to external AI agents via a bundled MCP server.
Read-only. The server starts automatically with the Electron app (no separate install).
The primary consumer is Claude-based agents (Atlas, ClaudeClaw, any Claude session).

Delivers:
- MCP server running inside Electron main process on localhost HTTP
- 4 read-only MCP tools surfacing notes + wiki data
- User-facing connection instructions (Settings or README)

Does NOT deliver:
- Write access of any kind
- Remote/network-accessible server (localhost only)
- Authentication layer (stdio/localhost = no auth surface)
- Real-time push notifications (agents poll via `get_recent_notes(since=...)`)

</domain>

<decisions>
## Implementation Decisions

### Transport: HTTP-based MCP (not stdio)
The MCP server runs as an HTTP server inside the Electron main process.
- **Why not stdio:** Electron can't expose a child process's stdio to external callers cleanly. An HTTP server on localhost is directly addressable.
- **Port:** 7723 (already stubbed in STATE.md decisions)
- **Transport:** MCP Streamable HTTP (the current MCP spec standard for HTTP servers)
- **Library:** `@modelcontextprotocol/sdk` — the official TypeScript SDK

### Bundled in main process (not utilityProcess)
The MCP server runs in the Electron main process alongside existing IPC handlers.
- Shares the same SQLite connection — no extra DB setup
- Shares the same `kb.ts` file I/O helpers
- Starts automatically when app launches, no user action required
- Stops when app closes

### Read-only tools (4 tools, v1 scope)
1. `get_recent_notes` — returns notes ordered by created_at, optional `since` (ISO timestamp) and `limit` (default 20) params. Returns: id, raw_text, organized_text, tags, ai_insights, created_at.
2. `search_notes` — FTS5 full-text search. Params: `query` (required), `limit` (default 10). Returns same shape as get_recent_notes.
3. `get_wiki_page` — reads a single KB markdown file. Params: `name` (filename without .md). Returns raw markdown content.
4. `list_wiki_pages` — returns array of all .md filenames in the KB directory.

### No authentication
Localhost HTTP with no auth token. Security comes from the server only binding to 127.0.0.1 (not 0.0.0.0). External processes on the same machine can connect, which is intentional — it's the user's own agents.

### User connection config
The user adds the MCP server to their Claude Code / Atlas config as:
```json
{
  "ainotepad": {
    "type": "http",
    "url": "http://127.0.0.1:7723/mcp"
  }
}
```
Settings panel shows the connection URL + a copy button (no API key needed).

### Claude's Discretion
- Exact MCP SDK version and initialization pattern
- Whether to use Fastify or Node's built-in http for the MCP HTTP layer
- Error handling for DB unavailability at server start
- Graceful shutdown when Electron app quits

</decisions>

<canonical_refs>
## Canonical References

Downstream agents MUST read these before planning or implementing.

### Existing codebase
- `src/main/index.ts` — app startup, where MCP server init should be called
- `src/main/db.ts` — getDb() and getSqlite() accessors, notes_fts FTS5 table
- `src/main/kb.ts` — listKbFiles(), readKbFile() helpers
- `src/main/ipc.ts` — pattern reference for reading notes/tags from DB
- `drizzle/schema.ts` — notes table shape (id, raw_text, organized_text, tags, ai_insights, created_at, hidden)
- `.planning/STATE.md` — existing decisions, port 7723 already reserved

### MCP specification
- Official MCP TypeScript SDK: `@modelcontextprotocol/sdk`
- Streamable HTTP transport is the current standard for HTTP-based MCP servers

</canonical_refs>

<specifics>
## Specific Ideas

- `get_recent_notes` with `since` param is the agent's "what's new since I last checked" primitive — the core use case
- The Settings panel connection URL display should be obvious enough that the user can copy it into their agent config without documentation
- Port 7723 should have a fallback: if already in use, log a warning and skip MCP server init (don't crash the app)

</specifics>

<deferred>
## Deferred Ideas

- Write access (create notes from agent) — v2
- Remote/network access with auth — v2
- WebSocket/SSE real-time push to agents — v2
- MCP resources (as opposed to tools) — v2
- Per-agent session tracking — v2
</deferred>

---

*Phase: 05-agent-layer*
*Context gathered: 2026-04-17 via /gsd:discuss-phase conversation*
