# Phase 04: Search - Context

**Gathered:** 2026-04-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Upgrade AI intelligence depth: give the AI worker retrieval capabilities and web search so its annotations include genuinely insightful connections, pattern observations, and novelty analysis. Add a Patterns tab (daily/weekly AI-generated digest with word cloud + narrative). Introduce local model support (llama.cpp via node-llama-cpp) as priority 1 — frontier API becomes secondary. This phase does NOT build a user-facing search UI.

</domain>

<decisions>
## Implementation Decisions

### Phase reframe: no user-facing search
- The SearchTab placeholder is repurposed — renamed to **Patterns tab**
- There is no query box, no search results list
- "Search" in this phase means AI-internal retrieval, not user-initiated search
- The AI worker uses retrieval to ground its insights in actual note history

### AI insight layer
- Insights appear **inline in note annotations**, visually distinct from organized text: italics + different font color (exact color: Claude's discretion)
- Insights are **threshold-based** — only surface when genuinely informative; never generate an insight for its own sake
- Three insight types the AI can produce:
  1. **Connections** — "this relates to your note on X from Y ago" — grounded in past notes and wiki concept files
  2. **Patterns** — "you've been returning to this topic frequently lately" — grounded in temporal note history
  3. **Novelty analysis** — "regarding your idea for X, a web search shows no existing apps in this space; market signals suggest..." — grounded in live web search results
- Retrieval mechanism (NO vector embeddings): wiki graph traversal via `[[wikilinks]]` + SQLite FTS on note text + `_context.md` for active topic map
- The AI decides when to trigger web search based on note content (idea claims, novelty assertions, startup/product concepts)

### Web search
- **Provider**: Brave Search API — independent of AI provider, works with local models and frontier APIs alike
- **Setup**: Optional. User adds Brave Search API key in Settings. App works without it (insights still generated from local retrieval only)
- **Graceful degradation**: If no Brave key configured, insight types 1 and 2 still fire; type 3 (novelty analysis) is silently skipped
- No scraping fallbacks — either Brave API is configured or web search doesn't run

### Patterns tab (renamed from Search)
- Tab label: **"Patterns"**
- **Visualization**: Word cloud — topic/tag names as the words, sized by frequency/recurrence
- **AI narrative**: Written summary below or alongside the word cloud — "This week your thinking was concentrated on X, with strong new connections emerging between Y and Z. Notable: a new theme around W appeared on Tuesday."
- **Supporting numbers**: simple stats alongside the narrative (e.g. note count, top 3 tags, most active day)
- **Digest schedule**: AI generates the daily digest during a low-activity period (overnight typically); weekly rollup generated once per week
- **Views**: user can toggle between daily view and weekly view
- Daily digest is cumulative — weekly view groups and synthesizes the daily digests

### Local model support (Priority 1 — frontier API is secondary)
- Local model runtime: **llama.cpp via `node-llama-cpp`** — NOT Ollama. Self-contained within the app; no external process dependency.
- Default model: **Gemma 4 4B** (current open-source leader, designed for small system deployment)
- **Upgrade option**: larger Gemma 4 variant (e.g. 12B) — for users with more RAM/VRAM
- **Downgrade option**: significantly smaller model (e.g. Gemma 4 1B or equivalent) — for low-spec systems
- **Hardware detection**: app auto-detects available RAM/VRAM on first launch and recommends the appropriate tier. User sees the recommendation with alternatives available.
- **Model delivery**: downloaded on first launch — NOT bundled in the installer
- **Existing model check**: before downloading, app scans common model storage paths (Ollama cache, LM Studio models folder, user-specified path) to detect if the model is already present — avoids duplicate downloads for users who already have it
- If found locally: use it directly, skip download entirely
- If not found: download from HuggingFace (or equivalent) with progress indicator

### Claude's Discretion
- Exact font color for insight annotations (must contrast with organized text but remain readable)
- Exact RAM/VRAM thresholds for model tier recommendations
- Scheduling mechanism for overnight digest (node-cron, launch-time elapsed-check, or OS scheduler)
- FTS5 vs SQLite LIKE for note retrieval (FTS5 preferred — already supported in better-sqlite3)
- Exact common paths to scan for existing models (Ollama: `~/.ollama/models/`, LM Studio: `~/AppData/Local/lm-studio/...`, etc.)
- Word cloud library choice
- Exact model download source and resume behavior on interrupted download

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project context
- `.planning/ROADMAP.md` — Phase 04 goal, phase boundaries
- `.planning/STATE.md` — Architecture decisions from Phases 01–03, all established patterns
- `.planning/PROJECT.md` — Core principles (local-first, open source, quiet AI, no telemetry)

### Prior phase context (MUST read)
- `.planning/phases/03-karpathy-wiki/03-CONTEXT.md` — Wiki structure, AI worker patterns, IPC surface, `_context.md` rolling context mechanism

### Existing code (MUST read before implementing)
- `src/main/aiWorker.ts` — Current `callAI()`, `buildPrompt()`, result posting — extend for insight output and local model dispatch
- `src/main/aiOrchestrator.ts` — Queue/drain loop, IPC result handling — extend for insight fields
- `src/main/ipc.ts` — IPC handler patterns, settings/key storage — add Brave API key storage, model path setting
- `src/main/db.ts` — Current schema and migration pattern — add FTS5 virtual table for notes, digest storage table
- `src/main/kb.ts` — KB file I/O, `_context.md` read/write — used for graph traversal retrieval
- `src/renderer/src/components/SearchTab.tsx` — Current placeholder — replace entirely with Patterns tab
- `src/renderer/src/components/NoteCard.tsx` — Current annotation display — extend for insight rendering (italics + color)
- `src/renderer/src/components/SettingsPanel.tsx` — Settings UI — extend for Brave API key + model selection

No external specs — requirements fully captured in decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `aiWorker.ts` `callAI()`: unified abstraction for Claude + OpenAI; extend to dispatch to node-llama-cpp for local model
- `aiOrchestrator.ts` `drain()`: result-posting pattern — add `insights` field to the result object alongside `annotation`
- `better-sqlite3`: FTS5 virtual tables are natively supported — no extra dependency for note retrieval
- `WikiGraph.tsx` / `WikiSidebar.tsx`: graph/visualization components from Phase 03 — potentially reusable in Patterns tab
- `tagColors.ts`: tag color registry — word cloud can read tag colors from this for visual consistency
- `kb.ts` `writeKbFile` + `_context.md` read: retrieval foundation already partially in place

### Established Patterns
- AI worker uses `process.parentPort` + `MessagePortMain` — local model calls must go through the same message channel
- SDK packages externalized via electron-vite (`externalizeDeps`) — node-llama-cpp will need same treatment
- TailwindCSS v4: `@import 'tailwindcss'` in CSS, no config file
- `electron-rebuild` already wired for native module compilation (`better-sqlite3`) — node-llama-cpp follows same pattern
- IPC result shape: `{type: 'result', noteId, ...fields}` — add `insights: string | null` field
- `electron-conf` + `safeStorage` for sensitive key storage — use for Brave API key

### Integration Points
- `aiWorker.ts` `buildPrompt()` → add retrieval step before prompt construction: query FTS5 for related notes, traverse wiki wikilinks from `kb.ts`, read `_context.md`
- `aiWorker.ts` `callAI()` → add local model dispatch branch (node-llama-cpp) alongside Anthropic/OpenAI branches
- `db.ts` → add FTS5 virtual table migration for notes full-text search; add `digests` table for Patterns tab storage
- `NoteCard.tsx` → render `insights` field with distinct styling (italics + color class)
- `SearchTab.tsx` → full replacement: Patterns tab with word cloud + AI narrative + toggle (daily/weekly)
- `SettingsPanel.tsx` → add Brave Search API key field + local model tier selector with hardware recommendation
- `index.ts` → add digest scheduler (overnight check on app launch or node-cron)

</code_context>

<specifics>
## Specific Ideas

- "Check if the model is already on the system" — scan Ollama cache, LM Studio paths, and let user point to a custom path. Many target users already have these models pulled. Zero-wait for them.
- Insight annotations should feel qualitatively different from organized text — italics + color is the signal that this is the AI speaking, not just restructuring what you wrote
- The insight threshold should be high: "inform the user of something that might have otherwise been missed" — connections, patterns, novelty — not generic observations
- Novelty analysis example: "regarding your idea for [X] app, after a careful web search no such apps currently exist in that area, and market signals suggest..."
- Patterns tab word cloud: topics sized by recurrence/frequency — visually shows the shape of the user's thinking that week/day
- AI narrative in Patterns tab: "This week your thinking was concentrated on X, with strong new connections emerging between Y and Z"
- Local-first + open source is the primary value proposition — Gemma 4 4B is the flagship experience, frontier API is a convenience alternative

</specifics>

<deferred>
## Deferred Ideas

- **Ollama integration** — user prefers llama.cpp directly via node-llama-cpp to avoid external process dependency; Ollama support could be a community contribution later
- **Embedding-based vector search** — replaced by wiki graph traversal + FTS5; revisit if retrieval quality proves insufficient in practice
- **Agent write-back to KB** — v2 scope per PROJECT.md
- **Cross-device sync** — explicitly never, per PROJECT.md
- **llama.cpp local model in AI worker** — was v2 scope in PROJECT.md; promoted to Phase 4 priority 1 per user decision 2026-04-16

</deferred>

---

*Phase: 04-search*
*Context gathered: 2026-04-16*
