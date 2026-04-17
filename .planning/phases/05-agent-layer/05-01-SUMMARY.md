---
phase: 05-agent-layer
plan: "01"
subsystem: agent-layer
tags: [mcp, http-server, electron-main, tools, agent-connectivity]
dependency_graph:
  requires: [src/main/db.ts, src/main/kb.ts, drizzle/schema.ts]
  provides: [src/main/mcpServer.ts, startMcpServer export]
  affects: [src/main/index.ts]
tech_stack:
  added: ["@modelcontextprotocol/sdk"]
  patterns: [stateless-mcp-transport, node-http-server, drizzle-orm-query, fts5-raw-sql]
key_files:
  created: [src/main/mcpServer.ts]
  modified: [src/main/index.ts, package.json, package-lock.json]
decisions:
  - "@modelcontextprotocol/sdk bundled into ASAR (not externalized) — pure JS, no native binaries"
  - "StreamableHTTPServerTransport created per request (stateless mode) — correct for read-only tools"
  - "isCleaningUp guard in before-quit prevents infinite loop when app.quit() re-triggers before-quit"
  - "EADDRINUSE handled via error event (not try/catch on listen) — Node HTTP listen is async"
metrics:
  duration_minutes: 8
  completed_date: "2026-04-17"
  tasks_completed: 2
  files_created: 1
  files_modified: 3
---

# Phase 5 Plan 01: MCP HTTP Server Summary

**One-liner:** MCP HTTP server on 127.0.0.1:7723 exposing 4 read-only tools (notes, FTS5 search, wiki) to external Claude agents via stateless StreamableHTTPServerTransport.

---

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | Create src/main/mcpServer.ts with 4 tools | 0702db2 | src/main/mcpServer.ts, package.json, package-lock.json |
| 2 | Wire MCP server into app.whenReady() with graceful shutdown | 53b9f01 | src/main/index.ts |

---

## What Was Built

### src/main/mcpServer.ts (new)

MCP HTTP server exposing 4 read-only tools:

- **get_recent_notes** — Drizzle ORM query with `eq(notes.hidden, 0)` + optional `gte(notes.submittedAt, since)` filter, ordered newest first, limit 1–100
- **search_notes** — Raw SQLite FTS5 MATCH query joining notes_fts with notes; wrapped in try/catch to return empty array on malformed query syntax
- **get_wiki_page** — Reads KB file via `readKbFile(name + '.md')`; returns isError:true if not found
- **list_wiki_pages** — Returns all `.md` filenames from KB directory via `listKbFiles()`

Design: `McpServer` built once, `StreamableHTTPServerTransport` created per HTTP request (stateless mode: `sessionIdGenerator: undefined`, `enableJsonResponse: true`). Server binds to `127.0.0.1:7723`. EADDRINUSE handled via `httpServer.on('error')` — logs warning, returns null from `startMcpServer()`.

### src/main/index.ts (modified)

- Imports `startMcpServer` from `./mcpServer`
- Calls `startMcpServer()` after `checkAndScheduleDigest()`
- Registers `before-quit` handler with `isCleaningUp` guard to prevent infinite loop (app.quit() re-triggers before-quit)
- Only registers shutdown hook if `stopMcp` is non-null (port conflict safe path)

---

## Decisions Made

1. **@modelcontextprotocol/sdk bundled (not externalized):** Pure JavaScript package — no native binaries. Must be included in ASAR for packaged app. Adding to rollupOptions.external would break production build.

2. **Stateless transport per request:** `sessionIdGenerator: undefined` disables session tracking. Correct for read-only tools with no streaming or state. `enableJsonResponse: true` ensures plain JSON responses (no SSE).

3. **isCleaningUp guard is mandatory:** Without it, `app.quit()` inside `before-quit` re-triggers `before-quit` endlessly. Uses separate local variable (not the existing `isQuiting` which controls tray behavior).

4. **EADDRINUSE via error event:** Node's `http.listen()` is async — EADDRINUSE arrives via `httpServer.on('error')`, not as a thrown exception. Handled gracefully: logs warning, `startFailed = true`, shutdown function returns early.

---

## Deviations from Plan

None — plan executed exactly as written.

Note: Pre-existing TypeScript errors in `src/main/aiWorker.ts` (node-llama-cpp type changes) and `src/main/ipc.ts` (unused import) are out of scope and unrelated to this plan. `mcpServer.ts` and `index.ts` compile without errors.

---

## Self-Check

- [x] src/main/mcpServer.ts exists
- [x] 4 `registerTool` calls present (get_recent_notes, search_notes, get_wiki_page, list_wiki_pages)
- [x] `startMcpServer` exported
- [x] `sessionIdGenerator: undefined` — stateless mode confirmed
- [x] FTS5 try/catch in search_notes confirmed
- [x] EADDRINUSE handling confirmed
- [x] `startMcpServer` imported and called in index.ts
- [x] `isCleaningUp` guard confirmed in index.ts
- [x] `before-quit` handler registered conditionally
- [x] @modelcontextprotocol/sdk in package.json dependencies
- [x] Commits 0702db2, 53b9f01 exist

## Self-Check: PASSED
