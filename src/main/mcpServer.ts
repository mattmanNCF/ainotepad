import { createServer, IncomingMessage, ServerResponse } from 'node:http'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'
import { getSqlite, getDb } from './db'
import { listKbFiles, readKbFile } from './kb'
import { notes } from '../../drizzle/schema'
import { desc, gte, and, eq } from 'drizzle-orm'

const PORT = 7723
const HOST = '127.0.0.1'

function buildMcpServer(): McpServer {
  const server = new McpServer({ name: 'ainotepad', version: '1.0.0' })

  // Tool 1: get_recent_notes
  server.registerTool(
    'get_recent_notes',
    {
      title: 'Get Recent Notes',
      description:
        'Returns AInotepad notes ordered by created_at, newest first. Use the `since` param to fetch only notes added after a known timestamp (ISO 8601).',
      inputSchema: z.object({
        since: z
          .string()
          .optional()
          .describe(
            'ISO 8601 timestamp — return only notes created after this time, e.g. "2026-04-01T00:00:00Z"'
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(20)
          .describe('Maximum number of notes to return (default 20, max 100)'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ since, limit }) => {
      const db = getDb()
      const conditions = [eq(notes.hidden, 0)]
      if (since) conditions.push(gte(notes.submittedAt, since))
      const rows = db
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
        .limit(limit ?? 20)
        .all()
      return { content: [{ type: 'text' as const, text: JSON.stringify(rows, null, 2) }] }
    }
  )

  // Tool 2: search_notes
  server.registerTool(
    'search_notes',
    {
      title: 'Search Notes',
      description:
        'Full-text search across AInotepad notes using SQLite FTS5. Returns notes ranked by relevance.',
      inputSchema: z.object({
        query: z.string().min(1).describe('Search query string. Supports FTS5 MATCH syntax.'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .default(10)
          .describe('Maximum number of results (default 10, max 50)'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ query, limit }) => {
      const sqlite = getSqlite()
      let rows: unknown[] = []
      try {
        rows = sqlite
          .prepare(
            `SELECT n.id, n.raw_text AS rawText, n.organized_text AS organizedText,
                  n.tags, n.ai_insights AS aiInsights, n.submitted_at AS createdAt
           FROM notes_fts fts
           JOIN notes n ON fts.note_id = n.id
           WHERE notes_fts MATCH ? AND n.hidden = 0
           ORDER BY rank
           LIMIT ?`
          )
          .all(query, limit ?? 10)
      } catch {
        // FTS5 MATCH throws on malformed query syntax (special chars, unmatched parens).
        // Return empty result rather than propagating an error.
        rows = []
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify(rows, null, 2) }] }
    }
  )

  // Tool 3: get_wiki_page
  server.registerTool(
    'get_wiki_page',
    {
      title: 'Get Wiki Page',
      description:
        'Returns raw markdown content of a named KB wiki page. Use list_wiki_pages to discover available page names.',
      inputSchema: z.object({
        name: z
          .string()
          .describe('Filename without .md extension, e.g. "quantum-entanglement"'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ name }) => {
      const content = await readKbFile(`${name}.md`)
      if (!content) {
        return {
          content: [{ type: 'text' as const, text: `Page "${name}" not found in KB.` }],
          isError: true,
        }
      }
      return { content: [{ type: 'text' as const, text: content }] }
    }
  )

  // Tool 4: list_wiki_pages
  server.registerTool(
    'list_wiki_pages',
    {
      title: 'List Wiki Pages',
      description:
        'Returns an array of all KB markdown filenames (without path). Use these names with get_wiki_page.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async () => {
      const files = await listKbFiles()
      return { content: [{ type: 'text' as const, text: JSON.stringify(files) }] }
    }
  )

  return server
}

/**
 * Starts the MCP HTTP server on 127.0.0.1:7723.
 * Returns a shutdown function to call on app exit, or null if the server failed to start.
 *
 * Design: McpServer is created once (shared). StreamableHTTPServerTransport is created
 * per request (stateless mode: sessionIdGenerator: undefined). This is correct for
 * read-only tools with no streaming or session state.
 */
export function startMcpServer(): (() => Promise<void>) | null {
  const mcpServer = buildMcpServer()

  const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (req.url !== '/mcp' || req.method !== 'POST') {
      res.writeHead(404).end('Not found')
      return
    }

    // Collect request body
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(chunk as Buffer)
    let body: unknown
    try {
      body = JSON.parse(Buffer.concat(chunks).toString())
    } catch {
      body = {}
    }

    // New transport per request — stateless, no session tracking needed
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless mode
      enableJsonResponse: true, // plain JSON responses, no SSE streaming
    })

    res.on('close', () => transport.close())

    await mcpServer.connect(transport)
    await transport.handleRequest(req, res, body)
  })

  // EADDRINUSE arrives via the error event (listen is async), not via thrown exception.
  // Handle gracefully: log warning, leave httpServer in error state, return null.
  let startFailed = false
  httpServer.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(
        `[MCP] Port ${PORT} already in use — MCP server not started. Agents cannot connect until the port is free.`
      )
      startFailed = true
    } else {
      console.error('[MCP] HTTP server error:', err)
    }
  })

  httpServer.listen(PORT, HOST, () => {
    console.log(`[MCP] Server listening on http://${HOST}:${PORT}/mcp`)
  })

  // Return shutdown function. Resolves when the server has fully closed.
  return async () => {
    if (startFailed) return
    await new Promise<void>((resolve) => httpServer.close(() => resolve()))
    console.log('[MCP] Server shut down')
  }
}
