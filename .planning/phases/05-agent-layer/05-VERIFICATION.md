---
phase: 05-agent-layer
verified: 2026-04-17T00:00:00Z
status: human_needed
score: 8/8 automated must-haves verified
human_verification:
  - test: "Launch app in dev mode (npm run dev), then POST to MCP endpoint"
    expected: "curl -s -X POST http://127.0.0.1:7723/mcp -H 'Content-Type: application/json' -d '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\",\"params\":{\"protocolVersion\":\"2025-03-26\",\"capabilities\":{},\"clientInfo\":{\"name\":\"test\",\"version\":\"1\"}}}' returns valid JSON-RPC 2.0 result with serverInfo.name='ainotepad'"
    why_human: "Server only binds when Electron app is running; cannot verify without launching the app"
  - test: "POST tools/list returns exactly 4 tools"
    expected: "JSON response contains get_recent_notes, search_notes, get_wiki_page, list_wiki_pages"
    why_human: "Requires live running server"
  - test: "Copy button in SettingsPanel writes correct URL to clipboard"
    expected: "Clicking Copy writes 'http://127.0.0.1:7723/mcp' to clipboard (verifiable by paste)"
    why_human: "navigator.clipboard.writeText requires a running browser context; cannot grep-verify behavior"
  - test: "Port conflict scenario: bind port 7723 with nc, then launch app"
    expected: "App starts normally; console shows '[MCP] Port 7723 already in use' warning; no crash"
    why_human: "Runtime behavior of EADDRINUSE error handler"
  - test: "Graceful shutdown: launch app, verify port 7723 is bound, quit app"
    expected: "After app.quit(), port 7723 is no longer in use (netstat/ss confirms port free)"
    why_human: "before-quit handler calls stopMcp() then app.quit(); requires runtime observation"
---

# Phase 05: Agent Layer Verification Report

**Phase Goal:** Expose AInotepad's notes and wiki data to external Claude agents via the Model Context Protocol (MCP) over HTTP. Agents connect to http://127.0.0.1:7723/mcp and call read-only tools.
**Verified:** 2026-04-17
**Status:** human_needed (all automated checks pass; 5 items need runtime verification)
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | src/main/mcpServer.ts exists with 4 tools registered | VERIFIED | File exists, 4 `registerTool` calls confirmed (grep count=4) |
| 2 | startMcpServer() exported from mcpServer.ts | VERIFIED | `export function startMcpServer()` at line 158 |
| 3 | src/main/index.ts imports and calls startMcpServer() after checkAndScheduleDigest() | VERIFIED | Import at line 8, call at line 137, sequence confirmed |
| 4 | isCleaningUp guard present in before-quit handler | VERIFIED | Lines 139-141 in index.ts; guard + comment confirmed |
| 5 | EADDRINUSE handled gracefully (error event, not thrown exception) | VERIFIED | `httpServer.on('error', ...)` with `err.code === 'EADDRINUSE'` at lines 192-201 in mcpServer.ts |
| 6 | SettingsPanel.tsx has "Agent API (MCP)" section with URL and copy button | VERIFIED | Lines 251-278; section heading, URL in code element, copy button with clipboard.writeText, JSON config snippet all present |
| 7 | TypeScript compiles without errors in mcpServer.ts and index.ts | VERIFIED | `npx tsc --noEmit -p tsconfig.node.json` — zero errors for mcpServer.ts and index.ts (pre-existing errors in aiWorker.ts and ipc.ts are out of scope, documented in SUMMARY) |
| 8 | @modelcontextprotocol/sdk is in package.json dependencies | VERIFIED | `"@modelcontextprotocol/sdk": "^1.29.0"` in dependencies (not devDependencies) |

**Score:** 8/8 truths verified (automated)

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/main/mcpServer.ts` | McpServer with 4 tools + startMcpServer() export | VERIFIED | 213 lines, substantive implementation, all 4 tools with full query logic |
| `src/main/index.ts` | MCP server startup wired into app.whenReady() with before-quit shutdown | VERIFIED | Import present, call after checkAndScheduleDigest(), shutdown handler with isCleaningUp guard |
| `src/renderer/src/components/SettingsPanel.tsx` | Static MCP connection section at bottom of settings modal | VERIFIED | Section at lines 251-278, after Save button, before closing divs |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| src/main/index.ts | src/main/mcpServer.ts | `import { startMcpServer } from './mcpServer'` | WIRED | Import at line 8, startMcpServer() called at line 137 |
| src/main/mcpServer.ts | src/main/db.ts | `getSqlite(), getDb()` | WIRED | Both imported (line 5), getSqlite used in search_notes (line 82), getDb used in get_recent_notes (line 41) |
| src/main/mcpServer.ts | src/main/kb.ts | `listKbFiles(), readKbFile()` | WIRED | Both imported (line 6), listKbFiles used in list_wiki_pages (line 142), readKbFile used in get_wiki_page (line 120) |
| SettingsPanel.tsx MCP section | navigator.clipboard.writeText | onClick handler | WIRED | `onClick={() => navigator.clipboard.writeText('http://127.0.0.1:7723/mcp')}` at line 262 |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| MCP-01 | 05-01 | MCP HTTP server starts on 127.0.0.1:7723 inside Electron main process | SATISFIED | createServer() with httpServer.listen(PORT, HOST) in mcpServer.ts; called from app.whenReady() in index.ts |
| MCP-02 | 05-01 | 4 read-only tools registered | SATISFIED | 4 registerTool calls: get_recent_notes, search_notes, get_wiki_page, list_wiki_pages; all with readOnlyHint:true |
| MCP-03 | 05-01 | Port conflict (EADDRINUSE) logs warning and skips MCP init without crashing | SATISFIED | httpServer.on('error') handler logs console.warn, sets startFailed=true; startMcpServer returns shutdown fn regardless (shutdown fn exits early if startFailed) |
| MCP-04 | 05-01 | Graceful shutdown closes HTTP server before app exits | SATISFIED | before-quit handler: event.preventDefault(), await stopMcp(), app.quit(); isCleaningUp guard prevents infinite loop |
| MCP-05 | 05-02 | Settings panel shows the MCP connection URL with a copy button | SATISFIED | SettingsPanel.tsx lines 251-278: URL in monospace code, copy button, JSON config snippet |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None found | — | — | — | — |

No TODOs, FIXMEs, placeholder returns, or empty implementations found in mcpServer.ts, the relevant index.ts additions, or the SettingsPanel MCP section.

Note: The shutdown function has a subtle behavior — when EADDRINUSE fires, `startFailed` is set to `true` inside the error handler (async), but `startMcpServer()` already returned the shutdown lambda before the error event fires. The lambda correctly checks `startFailed` at call time, so graceful shutdown still works correctly. This is the intended design documented in the plan.

---

### Human Verification Required

#### 1. MCP Server Responds to JSON-RPC Requests

**Test:** Start app with `npm run dev`, then run:
```
curl -s -X POST http://127.0.0.1:7723/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"1"}}}'
```
**Expected:** JSON response with `{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2025-03-26","capabilities":{...},"serverInfo":{"name":"ainotepad",...}}}`
**Why human:** Server only binds when Electron app is running; cannot verify without launching the app.

#### 2. tools/list Returns Exactly 4 Tools

**Test:** With app running, POST `{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}` to http://127.0.0.1:7723/mcp
**Expected:** Response contains tools array with get_recent_notes, search_notes, get_wiki_page, list_wiki_pages
**Why human:** Requires live running server.

#### 3. Copy Button Writes URL to Clipboard

**Test:** Open app, open Settings (gear icon), scroll to bottom, click Copy button next to the MCP URL, then paste in any text field.
**Expected:** Pasted text is `http://127.0.0.1:7723/mcp`
**Why human:** navigator.clipboard.writeText requires a running browser context.

#### 4. Port Conflict Scenario (EADDRINUSE)

**Test:** Run `nc -l 127.0.0.1 7723` (or equivalent) to occupy port 7723, then launch the app.
**Expected:** App starts normally, console shows `[MCP] Port 7723 already in use — MCP server not started...`, no crash.
**Why human:** Runtime behavior of EADDRINUSE error handler requires live execution.

#### 5. Graceful Shutdown Releases Port

**Test:** Launch app, verify with `netstat -an | findstr 7723` that port is bound, then quit the app via tray menu.
**Expected:** After app exits, `netstat -an | findstr 7723` shows nothing (port is free).
**Why human:** before-quit handler and async shutdown require runtime observation.

---

### Gaps Summary

No gaps. All automated must-haves verified against the actual codebase:

- mcpServer.ts is a full, substantive implementation (not a stub) — 213 lines with real database queries, FTS5 SQL, KB file reads
- All 4 tools are registered with complete handlers
- startMcpServer() is exported and properly imported+called in index.ts
- The isCleaningUp guard is present and correctly placed
- EADDRINUSE is handled via the error event (not a try/catch on listen)
- SettingsPanel has the complete MCP section with URL, copy button, and JSON snippet
- @modelcontextprotocol/sdk is in dependencies (not devDependencies)
- SDK is NOT in rollupOptions.external (only better-sqlite3, sqlite-vec, node-llama-cpp are externalized)

Pre-existing TypeScript errors in aiWorker.ts (node-llama-cpp type changes) and ipc.ts (unused import) are confirmed out-of-scope and documented in the plan summary.

Phase 5 goal is structurally achieved. Remaining items require human runtime testing.

---

_Verified: 2026-04-17_
_Verifier: Claude (gsd-verifier)_
