# Phase 08: Connections + Digest Improvements - Research

**Researched:** 2026-04-18
**Domain:** SQLite text similarity, SVG overlay on CSS grid, Electron digest scheduling
**Confidence:** HIGH (all findings from direct source code inspection)

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CORK-05 | Notes sharing a tag that also discuss similar sub-topics are connected by visible edges on the corkboard (using existing sqlite-vec embeddings — no new AI calls) | Critical gap: no embeddings exist in DB. Must use text-similarity fallback OR implement embedding storage first. See "Critical Discovery" section. |
| PAT-02 | Weekly AI summary pre-generates on first open — no blank/Generate-Now state | PatternsTab already calls `loadDigest('daily')` on mount. Weekly needs same treatment + background generation at launch if no weekly digest exists. |
| PAT-03 | Weekly digest uses a rolling 7-day window that updates daily (Day 8 = days 2–8, Day 9 = days 3–9) | digestScheduler computes `periodStart = now - 168h`. Needs to become a calendar-aligned rolling window instead. |
</phase_requirements>

---

## CRITICAL DISCOVERY: No Embeddings Exist

**The CORK-05 requirement says "using existing sqlite-vec embeddings" — but there are NO embeddings in the database.**

From Phase 04 CONTEXT.md (locked decision): "Retrieval: NO vector embeddings. Embedding-based vector search (sqlite-vec already installed — do NOT use for Phase 04)"

sqlite-vec 0.1.9 is installed as a dependency and externalized in electron.vite.config.ts but is **never imported or called anywhere in src/**. There is no `note_embeddings` table, no `loadExtension` call, and no embedding generation in any AI pipeline step.

**This means CORK-05 cannot be implemented as literally specified.** The planner must choose one of:

**Option A (Recommended): TF-IDF cosine similarity over raw_text**
- All note raw_text is in the DB already
- Compute term-frequency vectors in the main process (pure JS, no new dependency)
- Cosine similarity between notes that share a tag
- No AI calls, no new schema, immediate implementation
- Accuracy: lower than embedding-based but adequate for "similar sub-topics"

**Option B: Implement embedding storage first**
- Generate embeddings via the existing AI provider when notes are processed
- Store in a new `note_embeddings` table using sqlite-vec
- Much higher accuracy but adds AI calls per note and schema migration
- Contradicts the "no new AI calls" requirement from CORK-05

**Option C: Use sqlite-vec with a local embedding model**
- node-llama-cpp is already installed and externalized
- Could run a small embedding model (e.g., nomic-embed-text) locally
- Zero AI API calls but adds complexity and requires model download

**Recommendation: Option A (TF-IDF)**. It satisfies "no new AI calls", requires no new dependencies, and the existing raw_text in SQLite is sufficient. The requirement's mention of "sqlite-vec embeddings" appears to be an aspirational description that predates the Phase 04 decision to skip embedding storage.

---

## Summary

Phase 08 has two independent tracks: (1) corkboard edge overlay for CORK-05, and (2) digest pre-load + rolling window for PAT-02 + PAT-03.

**Track 1 (CORK-05):** The corkboard is a CSS `grid` in `NotesTab.tsx`. Cards are absolutely positioned within grid cells. Adding edges between cards requires a full-width/height SVG layer positioned absolutely over the grid. Card positions must be read via `getBoundingClientRect()` after render. The similarity computation (TF-IDF recommended) runs in the main process and is exposed via IPC. Edges should be drawn only between notes that (a) share at least one tag AND (b) exceed a similarity threshold (~0.3 TF-IDF cosine).

**Track 2 (PAT-02 + PAT-03):** The weekly digest can show a blank state because `checkAndScheduleDigest()` uses a 20h threshold — if the last weekly digest is less than 20h old it skips dispatch. On first launch ever, no digest exists. PAT-02 fix: dispatch a weekly digest unconditionally on first open if `digests:getLatest('weekly')` returns null. PAT-03 fix: replace the `now - 168h` window with a calendar-aligned `periodStart` that anchors to midnight 7 days ago and advances one day per day.

**Primary recommendation:** Use TF-IDF cosine similarity for CORK-05 (no embeddings to implement), SVG overlay for edges, and digest pre-generation in the main process launch sequence.

---

## Standard Stack

### Core (already installed — no new installs needed)
| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| better-sqlite3 | existing | Text retrieval for TF-IDF | getSqlite() already available |
| React | 19 | SVG overlay rendering | Native SVG in JSX |
| TailwindCSS v4 | existing | Styling | No changes needed |

### No New Dependencies Required
The TF-IDF approach requires only plain JS math — no library needed. The SVG overlay uses native browser SVG. No npm installs for this phase.

If the team decides on Option B/C (embedding-based), then sqlite-vec's `loadExtension` API would be needed in db.ts — but this contradicts the "no new AI calls" constraint.

---

## Architecture Patterns

### CORK-05: SVG Edge Overlay

The corkboard grid in `NotesTab.tsx` renders cards via:
```tsx
<div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}>
  {notes.map((note) => <NoteCard key={note.id} ... />)}
</div>
```

Cards are not absolutely positioned — they flow in the grid. The SVG overlay must:
1. Wrap the grid container in a `relative` div
2. Place an `<svg>` with `position: absolute; inset: 0; pointer-events: none; z-index: 10` over it
3. After notes render, use `useRef` + `getBoundingClientRect()` to find each card's center
4. Draw `<line>` elements between connected card centers

**Pattern: Overlay ref collection**
```tsx
// In NotesTab — collect refs per note id
const cardRefs = useRef<Map<string, HTMLElement>>(new Map())

// Pass ref setter to NoteCard
<NoteCard
  key={note.id}
  ...
  onRef={(el) => {
    if (el) cardRefs.current.set(note.id, el)
    else cardRefs.current.delete(note.id)
  }}
/>

// After render, compute edge positions
const edges = computeEdgePositions(cardRefs.current, connectedPairs)
```

**SVG overlay:**
```tsx
<div className="relative flex flex-col h-full overflow-hidden">
  <svg
    className="absolute inset-0 pointer-events-none"
    style={{ zIndex: 10 }}
    width="100%"
    height="100%"
  >
    {edges.map(({ x1, y1, x2, y2, key }) => (
      <line
        key={key}
        x1={x1} y1={y1} x2={x2} y2={y2}
        stroke="#6366f1"
        strokeOpacity={0.35}
        strokeWidth={1.5}
      />
    ))}
  </svg>
  <div className="grid gap-2" ...>
    {notes.map(...)}
  </div>
</div>
```

**Coordinate transform:** `getBoundingClientRect()` returns viewport coordinates. The SVG is positioned over the grid container, so subtract the container's `getBoundingClientRect()` from each card rect to get SVG-local coordinates.

### CORK-05: TF-IDF Similarity Computation

Runs in the **main process** (has DB access). Exposed via IPC handler.

**Algorithm:**
1. Load all non-hidden complete notes: `id`, `raw_text`, `tags`
2. Build term-frequency vectors for each note (tokenize, lowercase, strip punctuation, filter stop-words)
3. Compute IDF across the corpus
4. For each pair of notes that share a tag: compute cosine similarity of their TF-IDF vectors
5. Return pairs with similarity >= threshold (recommend 0.25–0.35 as starting point)

**IPC handler:**
```typescript
// src/main/ipc.ts — new handler
ipcMain.handle('notes:getSimilarPairs', () => {
  const rows = getSqlite()
    .prepare("SELECT id, raw_text, tags FROM notes WHERE hidden=0 AND ai_state='complete'")
    .all() as Array<{ id: string; raw_text: string; tags: string }>

  const notesWithTags = rows.map(r => ({
    id: r.id,
    text: r.raw_text,
    tags: JSON.parse(r.tags) as string[],
  }))

  return computeSimilarPairs(notesWithTags, 0.3)
})
```

**Return type:** `Array<{ a: string; b: string; similarity: number }>` (note id pairs)

### PAT-02: Weekly Digest Pre-Load

Current flow in `PatternsTab.tsx`:
- On mount: calls `loadDigest('daily')` only
- Weekly: only loaded when user clicks the "Weekly" toggle button

**Fix:** On mount, also check if weekly digest exists. If `getLatest('weekly')` returns null, immediately dispatch a generation:

```typescript
// In PatternsTab.tsx useEffect on mount
useEffect(() => {
  loadDigest('daily')

  // Pre-load weekly or trigger generation if none exists
  window.api.digest.getLatest('weekly').then(result => {
    if (!result) {
      // No weekly digest — trigger background generation silently
      window.api.digest.generate('weekly')
    }
  })

  // ... existing onUpdated/onError subscriptions
}, [])
```

**Alternative (main process approach):** In `checkAndScheduleDigest()`, change the weekly threshold from `thresholdHours=20` to `thresholdHours=0` when no digest exists at all (first launch). The `lastWasEmpty && nowHasData` bypass already handles this partially — but only when there's data. On first launch with no notes, neither branch fires.

The renderer-side approach is simpler and doesn't require changing the scheduler logic.

### PAT-03: Rolling 7-Day Window

**Current behavior:** `periodStart = new Date(Date.now() - 168 * 60 * 60 * 1000).toISOString()`

This is a sliding window anchored to the current moment. On Day 8 at noon, it covers "day 1 noon through day 8 noon" — not the clean "days 2–8" the requirement specifies.

**Required behavior:** Calendar-day aligned rolling window:
- periodStart = midnight of (today - 7 days)
- periodEnd = midnight of today (or end of today)

**Implementation:**
```typescript
function getRollingWeekStart(): string {
  const now = new Date()
  // Midnight 7 days ago (local time, stored as ISO)
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7, 0, 0, 0, 0)
  return start.toISOString()
}
```

**In `maybeDispatchDigest` for weekly:**
```typescript
const periodStart = period === 'weekly'
  ? getRollingWeekStart()
  : new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString()
```

**Threshold change:** The weekly digest should regenerate once per day, not once per 20 hours. Change `thresholdHours` for weekly to `22` hours (slight buffer below 24h to handle scheduling drift).

**Edge case: fewer than 7 days of notes:** The SQL `WHERE submitted_at >= ?` naturally handles this — it just returns whatever notes exist in the window. Already noted in STATE.md. No special handling needed.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cosine similarity | Custom linear algebra | Simple dot-product over JS objects | TF-IDF vectors are sparse; no library needed for this scale |
| Force-directed graph for edges | react-force-graph-2d on the corkboard | SVG `<line>` elements | Cards are in a grid — positions are stable, not physics-driven. Force graph would fight the layout. |
| Overlap detection for SVG lines | Geometry library | Accept overlapping lines | Visual clarity is secondary; overlapping lines are acceptable for corkboard aesthetics |
| Digest scheduling via cron | node-cron or setInterval | Extend existing launch-time check | checkAndScheduleDigest() already runs on app launch; daily advancement is handled by the rolling window calc |

---

## Common Pitfalls

### Pitfall 1: SVG coordinates from getBoundingClientRect
**What goes wrong:** Card rects are in viewport coordinates. SVG positioned with `inset: 0` over the scrollable grid container shares the container's coordinate space, NOT the viewport.
**How to avoid:** Subtract the container's `getBoundingClientRect()` from each card's rect to get container-relative coordinates. This must be recomputed on scroll and window resize.
**Warning signs:** Edges appear offset from cards, especially after scrolling.

### Pitfall 2: Edge flicker on note updates
**What goes wrong:** When `notes` state updates (new note, AI update), the card refs map is rebuilt and edges recalculate — causing a flash.
**How to avoid:** Use `useLayoutEffect` (not `useEffect`) to read card positions after DOM paint. Debounce the edge position computation by one animation frame.

### Pitfall 3: TF-IDF on short notes
**What goes wrong:** Very short notes (2–5 words) produce high cosine similarity to each other because they share common stop words after filtering.
**How to avoid:** Apply a minimum token count threshold (skip notes with < 4 non-stop-word tokens). Also cap similarity display: don't show edges unless both notes have >= 4 meaningful tokens.

### Pitfall 4: getLatest('weekly') blank on first launch
**What goes wrong:** PatternsTab renders, user clicks Weekly, no digest exists, they see the "No digest yet" blank state.
**How to avoid:** PAT-02 fix pre-triggers generation on mount. But there's a timing issue — the generation may take 5–30s (AI call). Show a "Generating..." state while generation is pending, not a blank state.

### Pitfall 5: Rolling window periodStart stored in digest
**What goes wrong:** The digests table stores `period_start` as a string. Old digests with `now - 168h` period_start will co-exist with new calendar-aligned ones after the PAT-03 fix.
**How to avoid:** The display always reads the most recent digest — `ORDER BY generated_at DESC LIMIT 1`. Old period_start values don't affect UX. No migration needed.

### Pitfall 6: SVG z-index vs hover-expand portal
**What goes wrong:** NoteCard renders its hover-expand overlay via `createPortal` at `zIndex: 9998`. The SVG overlay at `zIndex: 10` will appear BELOW expanded cards (correct), but may appear above the corkboard grid cards.
**How to avoid:** Keep SVG at a low z-index (10). Grid cards have no explicit z-index and stack above the SVG by default (SVG is absolutely positioned over the grid's background layer, not above the cards).

---

## Code Examples

### IPC handler: notes:getSimilarPairs
```typescript
// src/main/ipc.ts
ipcMain.handle('notes:getSimilarPairs', () => {
  const rows = getSqlite()
    .prepare("SELECT id, raw_text, tags FROM notes WHERE hidden=0 AND ai_state='complete'")
    .all() as Array<{ id: string; raw_text: string; tags: string }>

  // Group by shared tags first (avoids O(n^2) over unrelated notes)
  const tagToNoteIds = new Map<string, string[]>()
  const noteTexts = new Map<string, string>()
  const noteTags = new Map<string, string[]>()

  for (const row of rows) {
    noteTexts.set(row.id, row.raw_text)
    const tags: string[] = JSON.parse(row.tags)
    noteTags.set(row.id, tags)
    for (const tag of tags) {
      if (!tagToNoteIds.has(tag)) tagToNoteIds.set(tag, [])
      tagToNoteIds.get(tag)!.push(row.id)
    }
  }

  // Compute TF-IDF vectors and find similar pairs
  return computeSimilarPairs(noteTexts, noteTags, tagToNoteIds, 0.3)
})
```

### TF-IDF cosine similarity (pure JS, main process)
```typescript
// src/main/similarity.ts (new file)
const STOP_WORDS = new Set(['the','a','an','is','it','in','on','at','to','of','and','or','for','with','this','that'])

function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w))
}

function tfIdf(doc: string[], corpus: string[][]): Record<string, number> {
  const tf: Record<string, number> = {}
  for (const t of doc) tf[t] = (tf[t] ?? 0) + 1
  const N = corpus.length
  const result: Record<string, number> = {}
  for (const [term, freq] of Object.entries(tf)) {
    const df = corpus.filter(d => d.includes(term)).length
    result[term] = (freq / doc.length) * Math.log(N / (df + 1))
  }
  return result
}

function cosineSim(a: Record<string, number>, b: Record<string, number>): number {
  let dot = 0, magA = 0, magB = 0
  for (const [k, v] of Object.entries(a)) {
    dot += v * (b[k] ?? 0)
    magA += v * v
  }
  for (const v of Object.values(b)) magB += v * v
  const denom = Math.sqrt(magA) * Math.sqrt(magB)
  return denom === 0 ? 0 : dot / denom
}

export function computeSimilarPairs(
  noteTexts: Map<string, string>,
  noteTags: Map<string, string[]>,
  tagToNoteIds: Map<string, string[]>,
  threshold: number
): Array<{ a: string; b: string }> {
  const tokens = new Map<string, string[]>()
  for (const [id, text] of noteTexts) tokens.set(id, tokenize(text))

  const corpus = [...tokens.values()]
  const vectors = new Map<string, Record<string, number>>()
  for (const [id, doc] of tokens) {
    if (doc.length < 4) continue  // skip very short notes
    vectors.set(id, tfIdf(doc, corpus))
  }

  const seen = new Set<string>()
  const pairs: Array<{ a: string; b: string }> = []

  for (const [_tag, noteIds] of tagToNoteIds) {
    for (let i = 0; i < noteIds.length; i++) {
      for (let j = i + 1; j < noteIds.length; j++) {
        const a = noteIds[i], b = noteIds[j]
        const key = [a, b].sort().join('|')
        if (seen.has(key)) continue
        seen.add(key)
        const va = vectors.get(a), vb = vectors.get(b)
        if (!va || !vb) continue
        if (cosineSim(va, vb) >= threshold) pairs.push({ a, b })
      }
    }
  }
  return pairs
}
```

### SVG edge overlay in NotesTab
```tsx
// NotesTab.tsx changes
const gridRef = useRef<HTMLDivElement>(null)
const cardRefs = useRef<Map<string, HTMLElement>>(new Map())
const [similarPairs, setSimilarPairs] = useState<Array<{ a: string; b: string }>>([])
const [edgeLines, setEdgeLines] = useState<Array<{ key: string; x1: number; y1: number; x2: number; y2: number }>>([])

// Fetch pairs when notes load (or notes change)
useEffect(() => {
  if (notes.length < 2) return
  window.api.notes.getSimilarPairs().then(setSimilarPairs)
}, [notes.length])

// Recompute edge positions after render
useLayoutEffect(() => {
  const container = gridRef.current
  if (!container || similarPairs.length === 0) return
  const containerRect = container.getBoundingClientRect()
  const lines = []
  for (const { a, b } of similarPairs) {
    const elA = cardRefs.current.get(a)
    const elB = cardRefs.current.get(b)
    if (!elA || !elB) continue
    const ra = elA.getBoundingClientRect()
    const rb = elB.getBoundingClientRect()
    lines.push({
      key: `${a}|${b}`,
      x1: ra.left + ra.width / 2 - containerRect.left,
      y1: ra.top + ra.height / 2 - containerRect.top,
      x2: rb.left + rb.width / 2 - containerRect.left,
      y2: rb.top + rb.height / 2 - containerRect.top,
    })
  }
  setEdgeLines(lines)
}, [similarPairs, notes])
```

### Rolling window calculation (digestScheduler.ts)
```typescript
function getRollingWeekStart(): string {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7, 0, 0, 0, 0)
  return start.toISOString()
}

// In maybeDispatchDigest for weekly period:
const periodStart = period === 'weekly'
  ? getRollingWeekStart()
  : new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString()
```

---

## Architecture: What Changes Where

### New files
- `src/main/similarity.ts` — TF-IDF computation, `computeSimilarPairs()` export

### Modified files
| File | Change |
|------|--------|
| `src/main/ipc.ts` | Add `notes:getSimilarPairs` handler |
| `src/main/digestScheduler.ts` | Rolling week start calc + adjust weekly threshold to 22h |
| `src/renderer/src/components/NotesTab.tsx` | Add gridRef, cardRefs, SVG overlay, similarPairs state, useLayoutEffect for edge positions |
| `src/renderer/src/components/NoteCard.tsx` | Add `onRef` prop to expose DOM ref to parent |
| `src/renderer/src/components/PatternsTab.tsx` | Pre-trigger weekly digest generation on mount if none exists |
| `src/preload/index.ts` + `index.d.ts` | Expose `notes.getSimilarPairs()` via IPC bridge |

---

## Open Questions

1. **Edge visibility with few notes**
   - What we know: TF-IDF cosine similarity of 0.3 threshold may produce zero edges for a user with < 10 notes
   - What's unclear: Should we show the corkboard with no edges (silent), or show a hint "Add more notes on related topics to see connections"?
   - Recommendation: Silent (no edges, no hint) — matches the zero-friction ethos

2. **SVG edge recompute on scroll**
   - What we know: The corkboard has `overflow-y: auto` — scrolling changes card viewport positions
   - What's unclear: Should edges recompute on scroll, or should the SVG scroll with the content?
   - Recommendation: Make the SVG part of the scrollable content (not `position: fixed`) — put it inside the `overflow-y: auto` div, sized to the grid's scrollHeight

3. **Performance with many notes (> 200)**
   - What we know: TF-IDF is O(n^2) in the worst case for all pairs
   - What's unclear: At what note count does it become slow?
   - Recommendation: Cap pairs computation at 100 notes max (most recent); skip computation if notes.length > 100 and return []

4. **Preload type surface for getSimilarPairs**
   - What we know: preload/index.d.ts must be kept in sync with preload/index.ts (existing pattern)
   - Recommendation: Add `getSimilarPairs: () => Promise<Array<{ a: string; b: string }>>` to the notes API surface

---

## Validation Architecture

> nyquist_validation is explicitly false in .planning/config.json — validation section skipped.

---

## Sources

### Primary (HIGH confidence — direct source code inspection)
- `src/main/db.ts` — confirmed no embeddings table, no sqlite-vec import
- `src/renderer/src/components/NotesTab.tsx` — grid layout, card rendering pattern
- `src/renderer/src/components/NoteCard.tsx` — portal pattern, ref usage, onMouseEnter
- `src/renderer/src/components/WikiGraph.tsx` — ForceGraph2D usage (NOT used for corkboard)
- `src/main/digestScheduler.ts` — window calculation, threshold logic
- `src/renderer/src/components/PatternsTab.tsx` — loadDigest on mount, weekly blank state
- `src/main/ipc.ts` — existing IPC handler patterns
- `.planning/phases/04-search/04-CONTEXT.md` — locked decision: no embedding storage in Phase 04

### Secondary (MEDIUM confidence)
- `.planning/STATE.md` — risk register confirms "SVG edge rendering on corkboard — need canvas or SVG overlay layer"
- `electron.vite.config.ts` — sqlite-vec externalized but unused

---

## Metadata

**Confidence breakdown:**
- CORK-05 approach (TF-IDF + SVG): HIGH — direct code inspection confirms no embeddings exist; SVG overlay pattern is standard React
- PAT-02 pre-load fix: HIGH — PatternsTab source is clear; fix is straightforward
- PAT-03 rolling window: HIGH — digestScheduler logic is simple; change is localized
- Edge position calculation: MEDIUM — getBoundingClientRect + scroll offset requires careful testing

**Research date:** 2026-04-18
**Valid until:** Stable — this stack doesn't change frequently
