# Phase 03: Karpathy Wiki - Context

**Gathered:** 2026-04-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the AI-maintained Karpathy-style knowledge base: every note submission also updates a local Obsidian-compatible Markdown wiki. Extend the silent AI pipeline to produce concept files with [[wikilinks]], maintain a rolling `_context.md` for AI memory, and build the WikiTab UI with a color-coded sidebar and toggleable graph visualization. Search (Phase 4) and Agent Layer (Phase 5) are separate.

</domain>

<decisions>
## Implementation Decisions

### Wiki file structure
- One file per concept/topic: `kb/concept-name.md` (flat folder, no subfolders)
- Full Obsidian vault compatibility — `[[wikilinks]]`, YAML frontmatter
- Frontmatter per file: `tags`, `created`, `updated` (ISO dates)
- Tags are domain labels (math, physics, coding) and project labels (DLS, TOT, GlassyNumbers, etc.)
- Location: `app.getPath('userData')/kb/` on disk
- Special file: `kb/_context.md` — AI-maintained rolling summary index (NOT a concept file)

### AI integration timing
- Single expanded LLM call per note: organize + annotate + wiki update in one prompt
- Response JSON: `{organized, annotation, wiki_updates: [{file, content}]}`
- Before processing each note, worker reads `kb/_context.md` (rolling context) as AI working memory
- `_context.md` is updated by the AI after every note — contains: user's active interests, recurring concepts, project connections, inferred domain map
- AI bootstraps on first note: if `_context.md` absent, prompt says "No context yet — bootstrapping." AI creates initial concept files and `_context.md` from note content alone
- The AI's understanding of where notes fit improves recursively over time (day 30 >> day 1)

### Model-agnostic architecture
- Unified `callAI(prompt, options)` abstraction in aiWorker — dispatches to Anthropic, OpenAI, or future local LLM based on provider setting
- All wiki AI calls go through the same abstraction as organize/annotate — changing provider in settings affects all AI calls globally
- No per-call provider selection in v1

### AI context loading
- Worker reads `kb/_context.md` in full before building the note prompt
- Worker also reads any existing concept files that the AI identifies as relevant (based on keywords in note — heuristic TBD by planner)
- AI rewrites updated concept files in full (not patch-based) — simpler to implement and idempotent

### Wiki browsing UX (WikiTab)
- **Layout:** Left sidebar + right pane (2-column)
- **Sidebar:** Color-coded binder-style topic list — each tag/label gets a color; concept files grouped or tagged with colored indicators
- **Right pane:** Toggleable between:
  1. Rendered Markdown (default) — with [[wikilinks]] rendered as clickable links
  2. Knowledge graph visualization — nodes = concept files, edges = [[wikilinks]]; interactive, zoomable
- **Navigation:** Clicking [[wikilink]] in rendered view loads that concept in the right pane; back/forward navigation
- **Color model:** Colors are per tag/label (not per file); AI assigns default colors on tag creation; user overrides via right-click on topic in sidebar → color picker
- **Color consistency:** Tag colors propagate across sidebar, graph nodes, and note annotations to match

### Topic seeding & cold-start
- No pre-seeding or onboarding required — AI infers all tags from note content
- On first note: AI bootstraps from note alone; no initial tag vocabulary needed
- Tag vocabulary grows organically as the KB accumulates notes

### Claude's Discretion
- Graph visualization library choice (react-force-graph vs cytoscape.js vs d3-force)
- Exact `kb/_context.md` schema / sections
- Heuristic for selecting which existing concept files to load per note (keyword match, embedding similarity, or file listing)
- SQLite `kbPages` table structure for metadata/indexing
- Exact prompt template for the expanded wiki-integration call
- Back/forward navigation implementation in WikiTab
- Right-click color picker UI component

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project context
- `.planning/ROADMAP.md` — Phase 03 goal, phase boundaries, what's in scope vs other phases
- `.planning/STATE.md` — Architecture decisions from Phases 01 and 02, Electron/React/SQLite/Drizzle patterns

### Existing code (MUST read before implementing)
- `src/main/aiWorker.ts` — Current `callAI()` and `buildPrompt()` — extend, don't replace
- `src/main/aiOrchestrator.ts` — Queue/drain loop and IPC result handling — wiki file writes go here
- `src/main/ipc.ts` — `getDecryptedApiKey()`, `getProvider()`, IPC handler patterns
- `src/renderer/src/components/WikiTab.tsx` — Current placeholder — replace with full implementation
- `src/renderer/src/App.tsx` — Tab routing — understand existing tab switching pattern
- `drizzle/schema.ts` — Current schema — understand before extending

No external specs — requirements fully captured in decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `TabBar` + tab routing in `App.tsx`: already has `wiki` tab wired; just replace `WikiTab` contents
- `aiWorker.ts` `callAI()`: unified abstraction already partially exists for Claude + OpenAI; extend for local LLM interface
- `aiWorker.ts` `drain()`: result-posting pattern to copy for wiki file writes
- `better-sqlite3` + Drizzle (synchronous): established pattern for any new KB metadata table

### Established Patterns
- AI worker uses `process.parentPort` + `MessagePortMain` — do NOT use ipcMain in the worker
- SDK packages externalized via electron-vite (`externalizeDeps`) — do not bundle Anthropic/OpenAI
- TailwindCSS v4: `@import 'tailwindcss'` in CSS, no config file, no arbitrary keyframe classes in JSX
- Optimistic UI updates in renderer before IPC resolves (established in Phase 01)
- IPC result handling: worker posts `{type: 'result', noteId, ...fields}` → orchestrator catches → IPC push to renderer

### Integration Points
- `aiWorker.ts` `callAI()` → extend JSON response to include `wiki_updates`
- `aiOrchestrator.ts` `drain()` → after receiving result, write wiki files to `userData/kb/`
- `ipc.ts` → may need new IPC handler for renderer to request KB file list / file content
- `WikiTab.tsx` → new IPC calls to read kb/ directory listing and file contents
- `drizzle/schema.ts` → optional `kbPages` table for tracking concept file metadata

</code_context>

<specifics>
## Specific Ideas

- "Obsidian-style knowledge graph" — the KB folder should be directly openable in Obsidian as a vault and show the full graph view
- Color-coded binder tabs in sidebar — visual metaphor of a physical binder with colored section tabs
- The AI's memory should get meaningfully smarter over time: "day 30 vs day 1" — _context.md is the mechanism
- Model-agnostic: user should be able to swap Claude → OpenAI → local LLM without changing anything except Settings
- Graph visualization is a toggle (not a separate screen) — default view is Markdown, graph is the alternate mode

</specifics>

<deferred>
## Deferred Ideas

- Semantic search over wiki (Phase 4 — Search tab)
- Agent read-only API for KB access (Phase 5 — Agent Layer)
- Local LLM (llama.cpp) integration (v2 scope per PROJECT.md)
- Agent write-back to KB (v2 scope)
- Cross-device sync (explicitly never)

</deferred>

---

*Phase: 03-karpathy-wiki*
*Context gathered: 2026-04-15*
