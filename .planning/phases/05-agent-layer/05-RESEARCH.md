# Phase 05: Agent Layer — Research

**Researched:** 2026-04-17
**Domain:** MCP HTTP server via `@modelcontextprotocol/sdk` in Electron main process
**Confidence:** HIGH (verified against official SDK source and Anthropic skills reference)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Transport: MCP Streamable HTTP (not stdio). Port 7723. Library: `@modelcontextprotocol/sdk`.
- Bundled in main process (not utilityProcess). Shares SQLite connection and kb.ts helpers.
- 4 read-only tools: `get_recent_notes`, `search_notes`, `get_wiki_page`, `list_wiki_pages`.
- No authentication. Bind to 127.0.0.1 only.
- Port 7723. If port in use: log warning, skip MCP init (don't crash).
- Client config: `{ "ainotepad": { "type": "http", "url": "http://127.0.0.1:7723/mcp" } }`.
- Settings panel shows connection URL + copy button.

### Claude's Discretion
- Exact MCP SDK version and initialization pattern.
- Whether to use Fastify or Node's built-in http for the underlying HTTP layer.
- Error handling for DB unavailability at server start.
- Graceful shutdown when Electron app quits.

### Deferred Ideas (OUT OF SCOPE)
- Write access (create notes from agent) — v2
- Remote/network access with auth — v2
- WebSocket/SSE real-time push to agents — v2
- MCP resources (as opposed to tools) — v2
- Per-agent session tracking — v2
</user_constraints>

---

## Summary

Phase 05 exposes AInotepad's SQLite notes and KB markdown files to Claude agents via a bundled MCP HTTP server. The official `@modelcontextprotocol/sdk@1.29.0` provides `McpServer` and `StreamableHTTPServerTransport` — everything needed lives in the SDK with no separate packages required. The server runs inside the Electron main process using Node's built-in `http` module (not Express), binding to 127.0.0.1:7723 and handling MCP protocol requests at `POST /mcp`.

The implementation is simpler than the full example server because this server is **stateless** — setting `sessionIdGenerator: undefined` on the transport means each POST request creates a fresh transport, no session map needed. This is correct for a read-only, local-only server with infrequent agent calls.

The main process shutdown hook (`app.on('before-quit', ...)`) calls `server.close()` on the Node http server to release the port before the app exits.

**Primary recommendation:** Use `@modelcontextprotocol/sdk@1.29.0` with stateless `StreamableHTTPServerTransport` and Node's built-in `http.createServer()`. Create a single `src/main/mcpServer.ts` module, call `startMcpServer()` from `index.ts` inside `app.whenReady()`, and return a cleanup function wired to `app.on('before-quit', ...)`.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@modelcontextprotocol/sdk` | 1.29.0 | MCP protocol + HTTP transport | Official Anthropic SDK, pure JS, no native modules |
| `zod` | bundled via SDK (^3.25 or ^4.0) | Input schema validation for tools | SDK resolves its own zod peer dep |
| Node built-in `http` | N/A | HTTP server to handle incoming requests | Zero extra deps; avoids Express overhead for 1 route |

### Supporting (existing in project — no new installs for these)
| Library | Version | Purpose |
|---------|---------|---------|
| `better-sqlite3` | existing | Notes FTS5 search, recent notes query |
| `drizzle-orm` | existing | ORM queries for notes |
| `kb.ts` helpers | local | `listKbFiles()`, `readKbFile()` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Node `http` | Express 5 (already bundled in SDK deps) | Express adds nothing for 1 route; raw http is simpler |
| Node `http` | Fastify | Fastify is faster but overkill; not already bundled |
| Stateless transport | Stateful with session map | Stateful needed only for streaming/push; overkill here |

### Installation
```bash
npm install @modelcontextprotocol/sdk
```

**Note:** The SDK brings Express 5, Hono, zod, and other runtime deps. These will be in `node_modules` but not actively used by our code (we use raw http). electron-vite will bundle the SDK modules into the main build. No asarUnpack needed — the SDK is pure JavaScript, no native binaries.

**Externalization:** Do NOT add `@modelcontextprotocol/sdk` to `rollupOptions.external`. It is pure JS and should be bundled. Adding it to external would require it to be present at runtime outside the ASAR, which is wrong for a pure-JS package.

**Verified version:** `npm view @modelcontextprotocol/sdk version` returns `1.29.0` (published 2026-03-30).

---

## Architecture Patterns

### Recommended Project Structure
```
src/main/
├── index.ts          # Add: startMcpServer() call + shutdown hook
├── mcpServer.ts      # NEW: MCP server module (all MCP code here)
├── db.ts             # Existing — getDb(), getSqlite()
├── kb.ts             # Existing — listKbFiles(), readKbFile()
├── ipc.ts            # Existing — reference for notes query patterns
└── ...
```

### Pattern 1: Stateless MCP HTTP Server (per-request transport)

**What:** One `McpServer` instance lives at module scope with all tools registered. Each POST /mcp request creates a new `StreamableHTTPServerTransport` with `sessionIdGenerator: undefined`, connects it to the shared `McpServer`, handles the request, then closes the transport. No session state is maintained between requests.

**When to use:** Simple read-only tools with no streaming, no server-initiated messages. This is the correct mode for AInotepad's 4 read-only tools.

**Source:** Anthropic skills reference `node_mcp_server.md`, verified against SDK source v1.29.0.

```typescript
// Source: github.com/anthropics/skills mcp-builder/reference/node_mcp_server.md
// src/main/mcpServer.ts

import { createServer, IncomingMessage, ServerResponse } from 'node:http'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'
import { getSqlite, getDb } from './db'
import { listKbFiles, readKbFile } from './kb'
import { notes } from '../../drizzle/schema'
import { desc, gte, and, eq } from 'drizzle-orm'

function buildMcpServer(): McpServer {
  const server = new McpServer({ name: 'ainotepad', version: '1.0.0' })

  server.registerTool(
    'get_recent_notes',
    {
      title: 'Get Recent Notes',
      description: 'Returns notes ordered by created_at, newest first.',
      inputSchema: z.object({
        since: z.string().optional().describe('ISO 8601 timestamp — return only notes after this time'),
        limit: z.number().int().min(1).max(100).default(20).describe('Max notes to return'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ since, limit }) => {
      const db = getDb()
      const rows = db.select().from(notes)
        .where(and(eq(notes.hidden, 0), since ? gte(notes.submittedAt, since) : undefined))
        .orderBy(desc(notes.submittedAt))
        .limit(limit ?? 20)
        .all()
      return {
        content: [{ type: 'text', text: JSON.stringify(rows, null, 2) }],
      }
    }
  )

  server.registerTool(
    'search_notes',
    {
      title: 'Search Notes',
      description: 'Full-text search across notes using SQLite FTS5.',
      inputSchema: z.object({
        query: z.string().min(1).describe('Search query string'),
        limit: z.number().int().min(1).max(50).default(10),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ query, limit }) => {
      const sqlite = getSqlite()
      const rows = sqlite.prepare(
        `SELECT n.id, n.raw_text, n.organized_text, n.tags, n.ai_insights, n.submitted_at
         FROM notes_fts fts
         JOIN notes n ON fts.note_id = n.id
         WHERE notes_fts MATCH ? AND n.hidden = 0
         ORDER BY rank
         LIMIT ?`
      ).all(query, limit ?? 10)
      return { content: [{ type: 'text', text: JSON.stringify(rows, null, 2) }] }
    }
  )

  server.registerTool(
    'get_wiki_page',
    {
      title: 'Get Wiki Page',
      description: 'Returns raw markdown content of a KB wiki page.',
      inputSchema: z.object({
        name: z.string().describe('Filename without .md extension, e.g. "quantum-entanglement"'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ name }) => {
      const content = await readKbFile(`${name}.md`)
      if (!content) {
        return { content: [{ type: 'text', text: `Page "${name}" not found.` }], isError: true }
      }
      return { content: [{ type: 'text', text: content }] }
    }
  )

  server.registerTool(
    'list_wiki_pages',
    {
      title: 'List Wiki Pages',
      description: 'Returns array of all KB markdown filenames.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async () => {
      const files = await listKbFiles()
      return { content: [{ type: 'text', text: JSON.stringify(files) }] }
    }
  )

  return server
}

export function startMcpServer(): (() => Promise<void>) | null {
  const PORT = 7723
  const HOST = '127.0.0.1'

  // McpServer created once at function scope — tools are registered once, transports are per-request
  const mcpServer = buildMcpServer()

  const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (req.url !== '/mcp' || req.method !== 'POST') {
      res.writeHead(404).end()
      return
    }

    // Parse body
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(chunk as Buffer)
    let body: unknown
    try { body = JSON.parse(Buffer.concat(chunks).toString()) } catch { body = {} }

    // New transport per request (stateless) — shared McpServer handles the call
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless mode
      enableJsonResponse: true,      // plain JSON responses (no SSE)
    })

    res.on('close', () => transport.close())

    await mcpServer.connect(transport)
    await transport.handleRequest(req, res, body)
  })

  // EADDRINUSE arrives via error event (listen is async), not as a thrown exception
  httpServer.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[MCP] Port ${PORT} already in use — MCP server skipped`)
    } else {
      console.error('[MCP] HTTP server error:', err)
    }
  })

  httpServer.listen(PORT, HOST, () => {
    console.log(`[MCP] Server listening on http://${HOST}:${PORT}/mcp`)
  })

  // Return shutdown function for index.ts to call on before-quit
  return async () => {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()))
  }
}
```

**Wiring in index.ts** (inside `app.whenReady()`):
```typescript
import { startMcpServer } from './mcpServer'

// After registerIpcHandlers()
const stopMcp = startMcpServer()
if (stopMcp) {
  app.on('before-quit', async (event) => {
    event.preventDefault()
    await stopMcp()
    app.quit()
  })
}
```

### Pattern 2: FTS5 Search Query

The existing `notes_fts` table uses FTS5 with `MATCH`. The correct query pattern (matching ipc.ts for notes and db.ts schema):

```typescript
// Source: ipc.ts and db.ts in project codebase
const rows = getSqlite().prepare(
  `SELECT n.id, n.raw_text, n.organized_text, n.tags, n.ai_insights, n.submitted_at as createdAt
   FROM notes_fts fts
   JOIN notes n ON fts.note_id = n.id
   WHERE notes_fts MATCH ? AND n.hidden = 0
   ORDER BY rank LIMIT ?`
).all(query, limit)
```

Note: FTS5 `rank` is a special column for relevance ordering. Always include `n.hidden = 0` filter.

### Pattern 3: Settings Panel — Connection URL Display

Add a static "Agent API" section at the bottom of `SettingsPanel.tsx`:

```tsx
{/* Agent API section — no state needed, URL is constant */}
<div className="mt-6 border-t border-zinc-700 pt-4">
  <h3 className="text-sm font-medium text-zinc-300 mb-2">Agent API (MCP)</h3>
  <p className="text-xs text-zinc-400 mb-2">
    Add to your Claude Code or Atlas config:
  </p>
  <div className="flex items-center gap-2">
    <code className="flex-1 text-xs bg-zinc-800 px-2 py-1.5 rounded text-zinc-200 font-mono truncate">
      http://127.0.0.1:7723/mcp
    </code>
    <button
      onClick={() => navigator.clipboard.writeText('http://127.0.0.1:7723/mcp')}
      className="text-xs px-2 py-1.5 bg-zinc-700 hover:bg-zinc-600 rounded text-zinc-300"
    >
      Copy
    </button>
  </div>
</div>
```

### Anti-Patterns to Avoid
- **Stateful session map with McpServer:** Not needed for 4 read-only tools. Session management adds complexity with no benefit here.
- **Express or Fastify:** Not needed for one route. Raw Node http is sufficient and avoids bundling another framework.
- **Adding SDK to `rollupOptions.external`:** The SDK is pure JS and must be bundled into the main process output. Externalizing it would make it inaccessible inside the ASAR archive.
- **Calling `process.on('SIGINT')` for shutdown:** In Electron, use `app.on('before-quit', ...)` — not signal handlers. Electron manages its own lifecycle.
- **Binding to 0.0.0.0:** Always bind to 127.0.0.1 per MCP security spec (DNS rebinding protection).
- **Blocking `app.listen` call:** Use the httpServer error event (`EADDRINUSE`) to handle port conflicts gracefully instead of try/catch around `.listen()` (which is async).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| MCP protocol (initialize, tools/list, tools/call) | Custom JSON-RPC handlers | `McpServer` from SDK | Protocol negotiation, capability advertisement, error codes are complex |
| Input schema validation | Manual type checking | Zod via SDK | SDK validates inputs before calling handler; incorrect types rejected automatically |
| SSE streaming for HTTP transport | Custom SSE emitter | `StreamableHTTPServerTransport.enableJsonResponse: true` | Plain JSON mode handles everything cleanly for our use case |
| Tool result formatting | Custom response shape | SDK content array `[{ type: 'text', text: '...' }]` | Protocol requires specific content block format |

**Key insight:** The MCP SDK handles the entire protocol layer — session headers, initialize/tools handshake, error codes, content type negotiation. Our code is purely: register tools with business logic, start HTTP server, wire transport to server per request.

---

## Common Pitfalls

### Pitfall 1: EADDRINUSE Not Caught (Port Conflict)
**What goes wrong:** `httpServer.listen()` is asynchronous. Errors like `EADDRINUSE` come through the `'error'` event, not synchronously. If you only try/catch `.listen()`, the error silently kills the process.
**Why it happens:** Node.js `net.Server.listen()` is async; the error event fires on the server object.
**How to avoid:** Always attach `httpServer.on('error', ...)` handler. Log and skip gracefully.
**Warning signs:** App crashes with unhandled error `listen EADDRINUSE :::7723`.

### Pitfall 2: `before-quit` Double-Fire
**What goes wrong:** Calling `event.preventDefault()` in `before-quit` and then doing async work before `app.quit()` again can cause an infinite loop if `app.quit()` triggers `before-quit` again.
**How to avoid:** Use a guard flag:
```typescript
let isCleaningUp = false
app.on('before-quit', async (event) => {
  if (isCleaningUp) return
  isCleaningUp = true
  event.preventDefault()
  await stopMcp()
  app.quit()
})
```

### Pitfall 3: `registerTool` vs `tool` API
**What goes wrong:** The MCP SDK has both `server.tool()` (older, some overloads deprecated) and `server.registerTool()` (current preferred API).
**How to avoid:** Use `server.registerTool()` consistently. The Anthropic skills reference explicitly states: "Use `server.registerTool()` (NOT deprecated `server.tool()` or manual `setRequestHandler`)."

### Pitfall 4: Zod Version Conflict
**What goes wrong:** The MCP SDK brings its own zod (`^3.25 || ^4.0`). If the project installs a different zod version, schema objects from different instances may not be recognized.
**How to avoid:** Import `z` from `'zod'` — npm will resolve to the SDK's zod if it's the only installation. Do not install a separate `zod` unless needed; the SDK's peer dep will be deduped.

### Pitfall 5: electron-vite Bundling of MCP SDK
**What goes wrong:** If `@modelcontextprotocol/sdk` is added to `rollupOptions.external` (mirroring the pattern for `better-sqlite3`), it won't be in the bundle and will fail to load from inside ASAR.
**Why it happens:** `better-sqlite3` is native and must be external. The MCP SDK is pure JS and should be bundled.
**How to avoid:** Do NOT add `@modelcontextprotocol/sdk` to the `external` array. Let electron-vite bundle it normally.

### Pitfall 6: FTS5 MATCH Syntax
**What goes wrong:** FTS5 `MATCH` queries with special characters (parentheses, quotes, operators) can throw SQLite errors if the query string is passed unsanitized.
**How to avoid:** Wrap user queries in a try/catch and return an empty result set on parse error:
```typescript
try {
  rows = sqlite.prepare('...WHERE notes_fts MATCH ?...').all(query, limit)
} catch {
  rows = []
}
```

### Pitfall 7: McpServer and Transport Both Per-Request
**What goes wrong:** Creating both `McpServer` AND `StreamableHTTPServerTransport` per request means tool registrations re-run each time, adding overhead and wasting allocations.
**Correct pattern:** Create `McpServer` once (at module/function scope, outside the request handler). Create `StreamableHTTPServerTransport` per request. The SDK allows `server.connect()` to be called multiple times — each call adds a new transport connection. Tool registrations are retained on the shared server instance.
**Why:** Tool registration is expensive relative to transport creation; transports are lightweight and stateless in stateless mode.

---

## Code Examples

### Minimal Working Pattern (Verified)
```typescript
// Source: github.com/anthropics/skills mcp-builder reference + SDK source v1.29.0
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'
import { createServer } from 'node:http'

const server = new McpServer({ name: 'ainotepad', version: '1.0.0' })

server.registerTool(
  'get_recent_notes',
  {
    title: 'Get Recent Notes',
    description: 'Returns recent notes.',
    inputSchema: z.object({
      limit: z.number().int().default(20),
    }),
    annotations: { readOnlyHint: true },
  },
  async ({ limit }) => {
    // ... query DB ...
    return { content: [{ type: 'text', text: JSON.stringify(results) }] }
  }
)

const httpServer = createServer(async (req, res) => {
  // parse body, then:
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless
    enableJsonResponse: true,
  })
  res.on('close', () => transport.close())
  await server.connect(transport)
  await transport.handleRequest(req, res, body)
})

httpServer.listen(7723, '127.0.0.1')
```

### Claude Code Agent Config
```json
{
  "mcpServers": {
    "ainotepad": {
      "type": "http",
      "url": "http://127.0.0.1:7723/mcp"
    }
  }
}
```

Add via CLI:
```bash
claude mcp add --transport http ainotepad http://127.0.0.1:7723/mcp
```

### Drizzle Query for `get_recent_notes` with `since` param
```typescript
// Source: drizzle/schema.ts + ipc.ts query patterns in project
import { desc, gte, and, eq } from 'drizzle-orm'
import { notes } from '../../drizzle/schema'

const conditions = [eq(notes.hidden, 0)]
if (since) conditions.push(gte(notes.submittedAt, since))

const rows = getDb()
  .select({
    id: notes.id,
    rawText: notes.rawText,
    organizedText: notes.organizedText,
    tags: notes.tags,
    aiInsights: notes.aiInsights,
    createdAt: notes.submittedAt,
  })
  .from(notes)
  .where(and(...conditions))
  .orderBy(desc(notes.submittedAt))
  .limit(limit)
  .all()
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| HTTP+SSE (2-endpoint: POST + GET /sse) | Streamable HTTP (single /mcp endpoint) | MCP spec 2025-03-26 | One endpoint handles all; simpler server code |
| `server.setRequestHandler()` manual | `server.registerTool()` / `server.registerResource()` | SDK ~1.5+ | Strongly typed, schema validated, no protocol boilerplate |
| stdio only | HTTP transport in SDK | SDK 1.10+ (April 2025) | External processes can connect without subprocess management |

**Deprecated/outdated:**
- `SSEServerTransport`: The old 2024-11-05 protocol's GET /sse + POST / pattern. Do not use.
- `server.tool()` overloads: Some variants are deprecated; use `server.registerTool()`.
- `@modelcontextprotocol/server` and `@modelcontextprotocol/node`: These are alpha v2 packages (2.0.0-alpha.2). The stable SDK is `@modelcontextprotocol/sdk@1.29.0`.

---

## Open Questions

1. **`server.connect()` called per-request on same McpServer instance**
   - What we know: `connect()` registers a transport; the SDK should handle multiple transport connections sequentially.
   - What's unclear: Whether a single `McpServer` instance supports concurrent tool calls from multiple simultaneous transport connections.
   - Recommendation: For safety, create `McpServer` per-request too (since it's lightweight). Alternative: test with shared instance during verification.

2. **`enableJsonResponse: true` behavior**
   - What we know: Setting this returns plain JSON instead of SSE streams.
   - What's unclear: Whether Claude Code's HTTP MCP client supports plain JSON responses vs SSE (the spec says clients MUST support both).
   - Recommendation: `enableJsonResponse: true` is simpler and correct for a local read-only server. If Claude Code fails to connect, try without this flag (SSE mode).

3. **Origin header validation requirement**
   - What we know: MCP spec says servers MUST validate Origin header to prevent DNS rebinding.
   - What's unclear: Whether Claude Code sends an Origin header or not.
   - Recommendation: Since we bind to 127.0.0.1 only (not 0.0.0.0), DNS rebinding is already mitigated. Add an Origin check as defense-in-depth but don't let it break legitimate agent connections (allowlist `null` and `http://127.0.0.1`).

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None detected in project |
| Config file | None — Wave 0 gap |
| Quick run command | N/A |
| Full suite command | N/A |

### Phase Requirements -> Test Map
| Behavior | Test Type | Notes |
|----------|-----------|-------|
| MCP server starts on port 7723 | manual smoke | `curl -X POST http://127.0.0.1:7723/mcp -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"1"}}}'` |
| tools/list returns 4 tools | manual smoke | `curl -X POST /mcp -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'` |
| get_recent_notes returns notes | manual smoke | Send tools/call with method get_recent_notes |
| search_notes FTS returns results | manual smoke | Tools/call search_notes with query="test" |
| Port conflict → app starts anyway | manual | Run `netstat -an | findstr 7723` then launch app |
| App quit → port released | manual | Quit app; verify port freed |

*(No automated test infrastructure exists in this project — manual smoke tests are the validation approach for Phase 05.)*

---

## Sources

### Primary (HIGH confidence)
- `@modelcontextprotocol/sdk@1.29.0` npm registry — version, dependencies confirmed
- `github.com/modelcontextprotocol/typescript-sdk` v1.29.0 — `StreamableHTTPServerTransport` class, `McpServer` constructor, `server.registerTool()` API
- `modelcontextprotocol.io/docs/concepts/transports` — Streamable HTTP spec (bind to 127.0.0.1, POST/GET/DELETE endpoints, session management, Origin header requirement)
- `github.com/anthropics/skills mcp-builder/reference/node_mcp_server.md` — Verified end-to-end pattern for stateless HTTP MCP server with `StreamableHTTPServerTransport`

### Secondary (MEDIUM confidence)
- `builder.io/blog/claude-code-mcp-servers` — Claude Code `claude mcp add --transport http` CLI syntax and `type: http, url` JSON config format
- `github.com/modelcontextprotocol/typescript-sdk examples/server/src/simpleStreamableHttp.ts` — Full stateful session management pattern (confirmed our simpler stateless approach is correct alternative)

### Tertiary (LOW confidence)
- WebSearch results on Electron + Express graceful shutdown — general patterns verified against Node.js http module docs

---

## Metadata

**Confidence breakdown:**
- Standard stack (SDK version, imports): HIGH — verified via npm registry + GitHub source
- Architecture (stateless transport, per-request pattern): HIGH — verified against Anthropic skills reference
- Tool API (`registerTool`, zod schema, content array): HIGH — verified against SDK source
- Agent config JSON (`type: http, url`): MEDIUM — verified via builder.io blog + spec
- Electron integration (before-quit hook, listen error): MEDIUM — standard Node.js patterns

**Research date:** 2026-04-17
**Valid until:** 2026-05-17 (SDK is stable; unlikely to change in 30 days)
