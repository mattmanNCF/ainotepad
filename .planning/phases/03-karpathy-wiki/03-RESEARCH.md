# Phase 03: Karpathy Wiki - Research

**Researched:** 2026-04-14
**Domain:** Electron IPC + React UI + Markdown rendering + force-graph visualization + AI prompt extension
**Confidence:** HIGH (all critical decisions verified via npm registry + official docs)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Wiki file structure**
- One file per concept/topic: `kb/concept-name.md` (flat folder, no subfolders)
- Full Obsidian vault compatibility — `[[wikilinks]]`, YAML frontmatter
- Frontmatter per file: `tags`, `created`, `updated` (ISO dates)
- Tags are domain labels (math, physics, coding) and project labels (DLS, TOT, GlassyNumbers, etc.)
- Location: `app.getPath('userData')/kb/` on disk
- Special file: `kb/_context.md` — AI-maintained rolling summary index (NOT a concept file)

**AI integration timing**
- Single expanded LLM call per note: organize + annotate + wiki update in one prompt
- Response JSON: `{organized, annotation, wiki_updates: [{file, content}]}`
- Before processing each note, worker reads `kb/_context.md` (rolling context) as AI working memory
- `_context.md` is updated by the AI after every note
- AI bootstraps on first note: if `_context.md` absent, prompt says "No context yet — bootstrapping."
- AI rewrites updated concept files in full (not patch-based)

**Model-agnostic architecture**
- Unified `callAI(prompt, options)` abstraction — dispatches to Anthropic, OpenAI, or future local LLM
- All wiki AI calls go through the same abstraction
- No per-call provider selection in v1

**AI context loading**
- Worker reads `kb/_context.md` in full before building the note prompt
- Worker also reads relevant existing concept files (keyword match heuristic, TBD by planner)
- AI rewrites updated concept files in full (idempotent)

**WikiTab Layout**
- Left sidebar + right pane (2-column)
- Sidebar: color-coded binder-style topic list per tag
- Right pane: toggleable between rendered Markdown (default) and knowledge graph
- Clicking `[[wikilink]]` in rendered view loads that concept in right pane; back/forward navigation
- Color model: per tag/label; AI assigns defaults; user overrides via right-click → color picker
- Tag colors propagate across sidebar, graph nodes, and note annotations

**Topic seeding**
- No pre-seeding — AI infers all tags from note content
- Tag vocabulary grows organically

### Claude's Discretion
- Graph visualization library choice (react-force-graph vs cytoscape.js vs d3-force)
- Exact `kb/_context.md` schema / sections
- Heuristic for selecting which existing concept files to load per note
- SQLite `kbPages` table structure for metadata/indexing
- Exact prompt template for the expanded wiki-integration call
- Back/forward navigation implementation in WikiTab
- Right-click color picker UI component

### Deferred Ideas (OUT OF SCOPE)
- Semantic search over wiki (Phase 4)
- Agent read-only API for KB access (Phase 5)
- Local LLM (llama.cpp) integration (v2 scope)
- Agent write-back to KB (v2 scope)
- Cross-device sync (explicitly never)
</user_constraints>

---

## Summary

Phase 03 extends the existing Electron AI pipeline in three distinct areas: (1) file system I/O for the `kb/` directory, (2) an expanded AI prompt that produces wiki concept files alongside note processing, and (3) a full WikiTab UI with Markdown rendering and an optional force-directed graph view.

The codebase provides clean integration points for all three areas. The aiWorker builds a prompt from raw text and posts a typed result; extending to include `wiki_updates` in the result and writing files in aiOrchestrator is straightforward. The WikiTab is currently a placeholder; it gets replaced with a two-panel layout using react-markdown for wikilink rendering and react-force-graph-2d for the graph toggle.

The most important technical decision is library choice for the graph: `react-force-graph-2d` (canvas-based, no Three.js, lighter than the full `react-force-graph` package) is the right pick. For Markdown rendering with `[[wikilink]]` support, `react-markdown` + `remark-wiki-link` is the mainstream pattern, with the `components` prop used to intercept anchor clicks.

**Primary recommendation:** Extend aiWorker prompt + drain() for file writes first (backend), then build WikiTab UI components (frontend). Keep them as separate plans so the graph and Markdown views can be built against real data.

---

## Standard Stack

### Core (new packages for Phase 03)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| react-markdown | 10.1.0 | Render Markdown to React elements | Official remarkjs/rehype ecosystem; `components` prop intercepts link clicks |
| remark-wiki-link | 2.0.1 | Parse `[[wikilinks]]` in Markdown AST | The canonical remark plugin for wiki-style links; renders as `<a>` tags interceptable via `components` |
| react-force-graph-2d | 1.29.1 | 2D force-directed graph visualization | Canvas-based (no SVG, no Three.js), lean deps (`force-graph` only), React peer dep only |
| rehype-raw | 7.0.0 | Allow raw HTML pass-through in rehype | Needed when remark-wiki-link emits HTML-level elements |

### Already Present (no new install needed)
| Library | Version | Purpose |
|---------|---------|---------|
| better-sqlite3 + Drizzle | 12.9.0 / 0.45.2 | kbPages metadata table — sync pattern already established |
| electron (fs module) | — | File system access from main process — no extra package |
| Node `fs.promises` | — | Async write for kb/ files from aiOrchestrator |

### Alternatives Considered
| Instead of | Could Use | Why Not |
|------------|-----------|---------|
| react-force-graph-2d | react-force-graph (full) | Full package adds Three.js + 3D/VR/AR — ~2x bundle size for no benefit |
| react-force-graph-2d | cytoscape.js | SVG-based, heavier, less React-idiomatic, no force layout out of box |
| react-force-graph-2d | d3-force directly | Requires manual canvas/SVG rendering — significant hand-rolling |
| react-markdown + remark-wiki-link | marked + custom tokenizer | Less ecosystem, no rehype pipeline, harder to customize |
| `<input type="color">` | react-colorful or similar | Native color input works in Electron renderer; no package needed |

**Installation (new packages only):**
```bash
npm install react-markdown remark-wiki-link react-force-graph-2d rehype-raw
```

**Version verification (run before implementing):**
```
react-markdown        10.1.0  (verified 2026-04-14)
remark-wiki-link       2.0.1  (verified 2026-04-14)
react-force-graph-2d   1.29.1 (verified 2026-04-14)
rehype-raw             7.0.0  (verified 2026-04-14)
```

---

## Architecture Patterns

### Recommended Project Structure (additions only)
```
src/
├── main/
│   ├── aiWorker.ts          # Extend: buildPrompt + callAI max_tokens + result type
│   ├── aiOrchestrator.ts    # Extend: drain() writes wiki files; push kb:updated IPC
│   ├── ipc.ts               # Add: kb:listFiles, kb:readFile, kb:getTagColors, kb:setTagColor
│   └── kb.ts                # NEW: fs helpers — ensureKbDir, readContext, writeKbFile
├── renderer/src/
│   └── components/
│       ├── WikiTab.tsx       # Replace placeholder; owns layout
│       ├── WikiSidebar.tsx   # NEW: color-coded tag/file list
│       ├── WikiPane.tsx      # NEW: Markdown view OR graph toggle
│       ├── WikiMarkdown.tsx  # NEW: react-markdown + remark-wiki-link renderer
│       └── WikiGraph.tsx     # NEW: ForceGraph2D wrapper
drizzle/
└── schema.ts                 # Add: kbPages table
```

### Pattern 1: AI Worker — Expanded Prompt + File Writes

The worker currently calls `buildPrompt(rawText)` and parses `{organized, annotation}` from the response. Extension:

1. Before queuing, aiOrchestrator reads `_context.md` and passes it to the worker as part of the task message.
2. Worker `buildPrompt()` accepts `(rawText, contextMd)` and adds wiki instructions.
3. Worker `callClaude` / `callOpenAI` increase `max_tokens` to 4096 (concept files can be multi-hundred tokens each).
4. `drain()` parses `{organized, annotation, wiki_updates}` and posts full result back.
5. aiOrchestrator `port1.on('message')` handler writes wiki files via `kb.ts` helpers, then pushes `kb:updated` IPC event to renderer.

**CRITICAL: max_tokens must increase from 512 to 4096.** The current 512 is tuned for a two-field JSON. wiki_updates may include multiple full concept file rewrites — easily 1000–3000 tokens. Keeping 512 will cause truncated JSON that fails to parse.

```typescript
// Source: aiWorker.ts pattern — extend existing drain() after plan 02-03
const result = await callAI(task.rawText, task.contextMd)
const parsed = JSON.parse(result) as {
  organized: string
  annotation: string
  wiki_updates: Array<{ file: string; content: string }>
}
taskPort!.postMessage({
  type: 'result',
  noteId: task.noteId,
  aiState: 'complete',
  aiAnnotation: parsed.annotation,
  organizedText: parsed.organized,
  wikiUpdates: parsed.wiki_updates,
})
```

### Pattern 2: File System IPC — main process writes, renderer reads

File I/O lives entirely in the main process. The renderer never touches the filesystem directly.

```typescript
// src/main/kb.ts — new helper module
import { app } from 'electron'
import fs from 'fs/promises'
import path from 'path'

export function kbDir(): string {
  return path.join(app.getPath('userData'), 'kb')
}

export async function ensureKbDir(): Promise<void> {
  await fs.mkdir(kbDir(), { recursive: true })
}

export async function writeKbFile(filename: string, content: string): Promise<void> {
  await ensureKbDir()
  // Write to temp file in same dir, then rename — avoids Windows partial-write (STATE.md risk)
  const target = path.join(kbDir(), filename)
  const tmp = target + '.tmp'
  await fs.writeFile(tmp, content, 'utf8')
  await fs.rename(tmp, target)
}

export async function readKbFile(filename: string): Promise<string | null> {
  try {
    return await fs.readFile(path.join(kbDir(), filename), 'utf8')
  } catch {
    return null
  }
}

export async function listKbFiles(): Promise<string[]> {
  await ensureKbDir()
  const files = await fs.readdir(kbDir())
  return files.filter(f => f.endsWith('.md'))
}
```

IPC handlers in `ipc.ts`:
```typescript
ipcMain.handle('kb:listFiles', async () => listKbFiles())
ipcMain.handle('kb:readFile', async (_e, filename: string) => readKbFile(filename))
ipcMain.handle('kb:getTagColors', () => conf.get('tagColors', {}) as Record<string, string>)
ipcMain.handle('kb:setTagColor', (_e, tag: string, color: string) => {
  const colors = conf.get('tagColors', {}) as Record<string, string>
  colors[tag] = color
  conf.set('tagColors', colors)
})
```

Preload extensions:
```typescript
kb: {
  listFiles: () => ipcRenderer.invoke('kb:listFiles'),
  readFile: (filename: string) => ipcRenderer.invoke('kb:readFile', filename),
  getTagColors: () => ipcRenderer.invoke('kb:getTagColors'),
  setTagColor: (tag: string, color: string) => ipcRenderer.invoke('kb:setTagColor', tag, color),
  onUpdated: (cb: () => void) => {
    const handler = () => cb()
    ipcRenderer.on('kb:updated', handler)
    return () => ipcRenderer.removeListener('kb:updated', handler)
  }
}
```

### Pattern 3: Markdown Rendering with [[wikilink]] Click Interception

`remark-wiki-link` transforms `[[filename]]` into `<a href="#/page/filename" class="internal">` in the AST. `react-markdown`'s `components` prop intercepts the rendered `<a>` element:

```tsx
// Source: react-markdown docs + remark-wiki-link options
import Markdown from 'react-markdown'
import remarkWikiLink from 'remark-wiki-link'
import rehypeRaw from 'rehype-raw'

interface Props {
  content: string
  existingFiles: string[]
  onNavigate: (filename: string) => void
}

export function WikiMarkdown({ content, existingFiles, onNavigate }: Props) {
  const permalinks = existingFiles.map(f => f.replace(/\.md$/, ''))
  
  return (
    <Markdown
      remarkPlugins={[[remarkWikiLink, {
        permalinks,
        hrefTemplate: (permalink: string) => permalink,
        wikiLinkClassName: 'wiki-link',
        newClassName: 'wiki-link-new',
      }]]}
      rehypePlugins={[rehypeRaw]}
      components={{
        a: ({ href, children, className, ...props }) => {
          // Intercept wiki-link clicks (class="wiki-link"); pass through external links
          if (className?.includes('wiki-link') && href) {
            return (
              <a
                className={className}
                href="#"
                onClick={(e) => { e.preventDefault(); onNavigate(href + '.md') }}
                {...props}
              >
                {children}
              </a>
            )
          }
          return <a href={href} target="_blank" rel="noreferrer" {...props}>{children}</a>
        }
      }}
    >
      {content}
    </Markdown>
  )
}
```

### Pattern 4: ForceGraph2D — Graph View

`react-force-graph-2d` renders on `<canvas>`. It needs explicit `width`/`height`; use a ResizeObserver on the container div:

```tsx
// Source: react-force-graph-2d README + vasturiano/react-force-graph GitHub
import ForceGraph2D from 'react-force-graph-2d'
import { useRef, useEffect, useState } from 'react'

interface Node { id: string; name: string; color: string }
interface Link { source: string; target: string }

interface Props {
  nodes: Node[]
  links: Link[]
  onNodeClick: (filename: string) => void
}

export function WikiGraph({ nodes, links, onNodeClick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [dims, setDims] = useState({ width: 600, height: 400 })

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      setDims({ width, height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div ref={containerRef} className="w-full h-full">
      <ForceGraph2D
        graphData={{ nodes, links }}
        width={dims.width}
        height={dims.height}
        nodeLabel="name"
        nodeColor={(node) => (node as Node).color}
        onNodeClick={(node) => onNodeClick((node as Node).id)}
        linkColor={() => '#4b5563'}
      />
    </div>
  )
}
```

### Pattern 5: Back/Forward Navigation in WikiTab

Simple history stack — no router needed:

```typescript
// In WikiTab state
const [history, setHistory] = useState<string[]>([])  // filenames
const [cursor, setCursor] = useState<number>(-1)

const navigate = (filename: string) => {
  const newHistory = [...history.slice(0, cursor + 1), filename]
  setHistory(newHistory)
  setCursor(newHistory.length - 1)
}
const canBack = cursor > 0
const canForward = cursor < history.length - 1
const currentFile = history[cursor] ?? null
```

### Pattern 6: kbPages SQLite Table

Drizzle schema extension — tracks concept file metadata for sidebar/search:

```typescript
// drizzle/schema.ts addition
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const kbPages = sqliteTable('kb_pages', {
  id: text('id').primaryKey(),        // = filename without .md (e.g. "quantum-entanglement")
  filename: text('filename').notNull(), // e.g. "quantum-entanglement.md"
  title: text('title').notNull(),       // human display title
  tags: text('tags').notNull().default('[]'),  // JSON array: ["physics", "TOT"]
  created: text('created').notNull(),   // ISO date
  updated: text('updated').notNull(),   // ISO date
})
```

Tags stored as JSON text (consistent with the project's existing text-column pattern). No separate tags table in v1.

ADD via ALTER TABLE (idempotent try-catch, same pattern as Phase 02-01):
```typescript
try {
  db.exec(`CREATE TABLE IF NOT EXISTS kb_pages (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    title TEXT NOT NULL,
    tags TEXT NOT NULL DEFAULT '[]',
    created TEXT NOT NULL,
    updated TEXT NOT NULL
  )`)
} catch { /* already exists */ }
```


**Decision: per-note tags column in `notes` table**

The expanded AI prompt returns `{organized, annotation, wiki_updates, tags}` where `tags` is an array of strings for the note. Because CONTEXT.md requires tag colors to propagate to note annotations (not just the wiki sidebar), the `notes` table needs a `tags TEXT NOT NULL DEFAULT '[]'` column. Add this as a third ALTER TABLE migration in the same Phase 03 schema migration plan (alongside creating `kb_pages`). The `tags` array returned by the AI for a note is stored here and read by the renderer to color the note card annotation with the tag color palette.

### Pattern 7: _context.md Schema

Recommended structure for the AI-maintained rolling context file:

```markdown
---
updated: 2026-04-15T10:23:00Z
note_count: 42
---

## Active Interests
<!-- Inferred from recent notes: top 3-5 recurring themes -->

## Project Map
<!-- Known projects mentioned: DLS, TOT, GlassyNumbers, etc. with brief domain notes -->

## Recurring Concepts
<!-- Concepts that appear across multiple notes with connection notes -->

## Recent Notes Summary
<!-- Rolling last-5 note summaries (oldest dropped when > 5) -->
```

This structure gives the AI enough context to assign relevant tags and wikilinks without the file growing unboundedly.

### Pattern 8: Keyword Heuristic for Loading Concept Files

Before the AI call, the worker loads `_context.md` in full and then loads concept files whose filename (slug) appears as a word in the raw note text:

```typescript
// v1 heuristic — no embeddings needed (that's Phase 4)
async function loadRelevantConceptFiles(rawText: string): Promise<string> {
  const files = await listKbFiles()
  const lowerNote = rawText.toLowerCase()
  const relevant = files
    .filter(f => !f.startsWith('_'))  // exclude _context.md
    .filter(f => {
      const slug = f.replace(/\.md$/, '').replace(/-/g, ' ')
      return lowerNote.includes(slug)
    })
    .slice(0, 5)  // cap at 5 files to control token budget
  
  const contents = await Promise.all(relevant.map(async f => {
    const content = await readKbFile(f)
    return `### ${f}\n${content ?? ''}`
  }))
  return contents.join('\n\n')
}
```

Cap at 5 concept files. Each file may be 200-500 tokens; 5 files = ~2500 additional context tokens, well within Haiku's 200K context window.

### Pattern 9: Color Picker via Native Input

Right-click context menu on sidebar tag opens a popover with `<input type="color">`:

```tsx
// No library — native HTML color input works in Electron renderer
const [colorPickerState, setColorPickerState] = useState<{tag: string; x: number; y: number} | null>(null)

// On tag right-click:
onContextMenu={(e) => {
  e.preventDefault()
  setColorPickerState({ tag, x: e.clientX, y: e.clientY })
}}

// Popover:
{colorPickerState && (
  <div style={{ position: 'fixed', left: colorPickerState.x, top: colorPickerState.y, zIndex: 50 }}>
    <input
      type="color"
      defaultValue={tagColors[colorPickerState.tag] ?? '#6366f1'}
      onChange={(e) => onSetTagColor(colorPickerState.tag, e.target.value)}
    />
    <button onClick={() => setColorPickerState(null)}>Close</button>
  </div>
)}
```

### Anti-Patterns to Avoid

- **Writing files from the renderer:** Never call `fs` directly in renderer — always via IPC. Electron context isolation blocks it.
- **Keeping max_tokens at 512:** Wiki response includes multiple full file rewrites. 512 will truncate JSON, causing parse failures. Must be 4096.
- **Synchronous file I/O in aiOrchestrator:** The orchestrator runs in main process where sync I/O blocks the event loop. Use `fs.promises` throughout `kb.ts`.
- **Loading all concept files into every prompt:** Unbounded token growth. The keyword heuristic + 5-file cap keeps it bounded.
- **Bundling react-force-graph-2d via externalizeDeps:** It is a pure JS package (no native modules) — it bundles fine via Vite. Only better-sqlite3 and sqlite-vec need externalization.
- **Using TailwindCSS arbitrary keyframes in JSX:** The project uses TailwindCSS v4 — define any animations in `main.css` with `@keyframes`, not in JSX class strings.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| `[[wikilink]]` parsing | Custom regex parser | remark-wiki-link | AST-level, handles aliases (`[[page:alias]]`), edge cases |
| Markdown to React | dangerouslySetInnerHTML | react-markdown | XSS safe, components prop for interception, maintained |
| Force-directed layout | d3-force + canvas manually | react-force-graph-2d | Physics simulation, zoom/pan, node drag — 2000+ lines of complexity |
| Color storage | New SQLite table for tag colors | electron-conf key `tagColors` | Already have Conf instance in ipc.ts; one JSON key suffices |

---

## Common Pitfalls

### Pitfall 1: Truncated JSON from AI (max_tokens too low)
**What goes wrong:** AI response cuts off mid-JSON when wiki_updates contains multiple file writes. `JSON.parse` throws, note goes to `aiState: 'failed'`.
**Why it happens:** Current `max_tokens: 512` was sized for `{organized, annotation}` only. wiki_updates adds 3-10x more tokens.
**How to avoid:** Set `max_tokens: 4096` on both `callClaude` and `callOpenAI` when wiki updates are in scope.
**Warning signs:** Notes fail with aiState='failed' and console logs show JSON parse error mid-string.

### Pitfall 2: Windows rename collision in file writes
**What goes wrong:** `fs.writeFile` directly to target path fails or produces corrupt files when the file is already open (Electron on Windows).
**Why it happens:** Windows file locks; STATE.md explicitly flags "Windows temp file rename" as a known risk.
**How to avoid:** Write to `filename.tmp` first, then `fs.rename` to target — same directory ensures same volume, atomic rename.

### Pitfall 3: ForceGraph2D renders at 0×0
**What goes wrong:** Graph is invisible; canvas has zero dimensions.
**Why it happens:** ForceGraph2D requires explicit `width`/`height` props — it does not auto-size from CSS.
**How to avoid:** Use ResizeObserver on the container div to derive pixel dimensions and pass them as props. See Pattern 4.

### Pitfall 4: remark-wiki-link produces unresolved links without permalinks list
**What goes wrong:** All wikilinks render with `newClassName` (e.g., red styling) even when the concept file exists.
**Why it happens:** The `permalinks` option must list all existing filenames (without `.md`); plugin uses this to distinguish known vs. new links.
**How to avoid:** Pass `existingFiles.map(f => f.replace(/\.md$/, ''))` as `permalinks` when constructing the plugin config.

### Pitfall 5: _context.md grows without bound
**What goes wrong:** After hundreds of notes, `_context.md` becomes thousands of tokens, consuming the AI's token budget before the note is processed.
**Why it happens:** AI may append to the file rather than maintain a bounded rolling structure.
**How to avoid:** The prompt must explicitly instruct the AI to maintain bounded sections (5 recent notes, 10 concepts max) and rewrite the entire file. The recommended schema above has natural size limits.

### Pitfall 6: Drizzle kbPages out of sync with kb/ files
**What goes wrong:** Sidebar shows stale data; files written by AI don't appear in sidebar until app restart.
**Why it happens:** aiOrchestrator writes files directly; kbPages table update is a separate step that might be skipped.
**How to avoid:** After writing each wiki file in aiOrchestrator, upsert the corresponding kbPages row in the same result-handling block. Emit `kb:updated` IPC after all writes complete.

---

## Code Examples

### Expanded AI Prompt Template

```typescript
// Source: extend buildPrompt() in aiWorker.ts
function buildPrompt(rawText: string, contextMd: string, conceptSnippets: string): string {
  const hasContext = contextMd.trim().length > 0
  const contextSection = hasContext
    ? `## Your Current Knowledge Context\n${contextMd}`
    : `## Your Current Knowledge Context\nNo context yet — bootstrapping.`
  
  const conceptSection = conceptSnippets.trim().length > 0
    ? `## Relevant Existing Concept Files\n${conceptSnippets}`
    : ''

  return `You are a silent note-processing and knowledge-base assistant. Process the raw note below and return a JSON object with exactly these four fields.

${contextSection}

${conceptSection}

## Your Tasks
1. **organized**: Clean/organize the note. Fix typos, improve clarity. Keep the user's voice.
2. **annotation**: 1-2 sentence insight or connection to consider.
3. **wiki_updates**: Array of concept file writes. Each entry: {"file": "slug.md", "content": "...full file content..."}
   - Create/update concept files for key ideas in this note
   - Each file: YAML frontmatter (tags, created, updated), then Markdown with [[wikilinks]] to related concepts
   - Rewrite files in full — do not patch
   - Include ONE entry for "_context.md" — your updated rolling context. Keep it bounded: max 5 recent notes, max 10 recurring concepts.
4. **tags**: Array of tag strings that apply to this note (e.g. ["physics", "TOT", "math"])

IMPORTANT: Respond with ONLY a JSON object. No markdown fences, no explanation.
{"organized": "...", "annotation": "...", "wiki_updates": [{"file": "...", "content": "..."}], "tags": [...]}

Raw note:
${rawText}`
}
```

### Drizzle Schema Migration Pattern (idempotent, matches Phase 02-01 style)

```typescript
// In db.ts — add after existing table creation
try {
  db.exec(`CREATE TABLE IF NOT EXISTS kb_pages (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    title TEXT NOT NULL,
    tags TEXT NOT NULL DEFAULT '[]',
    created TEXT NOT NULL,
    updated TEXT NOT NULL
  )`)
} catch {
  // table already exists across app restarts
}
```

### Upsert kbPages After Wiki File Write

```typescript
// In aiOrchestrator.ts — after writing wiki files
import { kbPages } from '../../drizzle/schema'

for (const update of wikiUpdates) {
  if (update.file.startsWith('_')) continue  // skip _context.md
  const id = update.file.replace(/\.md$/, '')
  const title = id.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  const now = new Date().toISOString()
  // Extract tags from frontmatter if present
  const tagsMatch = update.content.match(/^tags:\s*\[(.+?)\]/m)
  const tags = tagsMatch ? JSON.stringify(tagsMatch[1].split(',').map(t => t.trim().replace(/['"]/g, ''))) : '[]'
  
  db.insert(kbPages)
    .values({ id, filename: update.file, title, tags, created: now, updated: now })
    .onConflictDoUpdate({ target: kbPages.id, set: { title, tags, updated: now } })
    .run()
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| react-force-graph (includes Three.js) | react-force-graph-2d (canvas only) | Always separate packages | ~60% smaller install for 2D-only use |
| `dangerouslySetInnerHTML` for Markdown | react-markdown + unified pipeline | 2020+ | XSS safe; components prop for interception |
| TailwindCSS config file | `@import 'tailwindcss'` (v4) | TW v4 (2024) | No config file; arbitrary keyframes in JSX NOT supported — use main.css |

---

## Open Questions

1. **Context file read from aiWorker vs aiOrchestrator**
   - What we know: Worker is a utilityProcess; file reads must go through IPC or be done in main. The worker cannot call `app.getPath('userData')` directly — that method lives in the main process.
   - What's unclear: Should the orchestrator read `_context.md` before enqueuing the task (simpler, orchestrator stays authoritative for file I/O), or should the worker get a new IPC channel back to main?
   - Recommendation: Orchestrator reads `_context.md` + relevant concept snippets before posting the `task` message, includes them in the task payload. Worker receives `{noteId, rawText, contextMd, conceptSnippets}`. No new IPC channel needed — same MessagePort pattern.

2. **Tag color initialization**
   - What we know: AI assigns tags; user overrides via color picker. Default colors need to be assigned when a new tag is first seen.
   - Recommendation: In aiOrchestrator, after writing wiki files, check each new tag against `conf.get('tagColors', {})`. If absent, assign a deterministic color from a predefined palette (e.g., index % palette.length). Persist via `conf.set('tagColors', ...)`.

3. **`callAI` signature change is a coordinated three-file change (not additive)**
   - What we know: Current `callAI(rawText)` called in `drain()`, task posted by `enqueueNote` as `{noteId, rawText}` -- a tight three-file chain: aiWorker.ts, aiOrchestrator.ts, and the `enqueueNote()` call site in ipc.ts.
   - What changes: Task message schema changes from `{noteId, rawText}` to `{noteId, rawText, contextMd, conceptSnippets}`. The orchestrator must call `readKbFile('_context.md')` and keyword-match concept files BEFORE posting the task message. The worker `handleMessage` and `drain()` must destructure the new fields. All three files change in lockstep -- this is a breaking internal change across the existing interface, not an additive extension.
   - Recommendation: One plan task should touch aiWorker.ts and aiOrchestrator.ts together to avoid a broken intermediate state where the worker receives task messages it cannot handle.


---

## Sources

### Primary (HIGH confidence)
- npm registry — react-markdown@10.1.0, remark-wiki-link@2.0.1, react-force-graph-2d@1.29.1, rehype-raw@7.0.0 (all verified 2026-04-14)
- `react-force-graph-2d` npm registry — confirmed Canvas-based, no Three.js, peer dep React only
- react-markdown GitHub (remarkjs/react-markdown) — `components` prop pattern for `<a>` interception confirmed
- remark-wiki-link GitHub (landakram/remark-wiki-link) — `permalinks`, `hrefTemplate`, `wikiLinkClassName` confirmed

### Secondary (MEDIUM confidence)
- WebFetch of react-force-graph README — `ForceGraph2D` import, `onNodeClick`, `nodeColor`, `width`/`height` props confirmed
- WebFetch of react-markdown README — `components` prop anchor override pattern confirmed

### Tertiary (LOW confidence — not needed, avoided)
- None — all required claims verified via npm or official docs

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified via npm view 2026-04-14
- Architecture: HIGH — integration points read directly from existing source files
- Pitfalls: HIGH — Windows rename risk from STATE.md; max_tokens from direct code inspection; others from library API inspection
- IPC pattern: HIGH — follows identical pattern to existing notes: IPC handlers

**Research date:** 2026-04-14
**Valid until:** 2026-05-14 (stable libraries; remark-wiki-link is slow-moving)
