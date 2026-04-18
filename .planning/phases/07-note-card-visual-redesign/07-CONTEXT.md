# Phase 7: Note Card Visual Redesign - Context

**Gathered:** 2026-04-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Transform the corkboard from free-height text cards into compact square post-it cards with tag-color borders, hover-expand with user/AI bifurcation, always-visible tag dots, and a Patterns tab footer that fits at the default window size. No new capabilities — this is purely a visual/interaction redesign of existing features.

Requirements in scope: CORK-01, CORK-02, CORK-03, CORK-04, PAT-01.

</domain>

<decisions>
## Implementation Decisions

### Card size & grid layout
- Fixed square dimensions: ~120×120px per card
- Grid: `repeat(auto-fill, minmax(120px, 1fr))` — fills corkboard width
- Text truncated to 3 lines with CSS `line-clamp: 3` + fade-out gradient (not hard cutoff)
- Tag colored dots always visible at the bottom of every compact card (satisfies CORK-04)

### Tag color border (CORK-03)
- Left border color = first tag in AI-returned tags array (= "primary tag")
- When note has no tags yet (AI pending or no tags assigned): neutral gray border (`#6b7280`)
- Amber/emerald/red AI-state border coloring is removed entirely

### Tag dots on all notes (CORK-04)
- Tags must be loaded from DB at component init time (not just from live `onAiUpdate`)
- All notes — including historical ones — must show colored dots for every assigned tag
- Current code only populates `tags` via `onAiUpdate` (new notes only) — this needs fixing

### Hover-expand behavior (CORK-02)
- Trigger: hover (CSS `:hover` or `onMouseEnter`)
- Close: mouse-leave with ~100–150ms delay to prevent flicker on fast cursor moves
- Expanded card overlays neighbors using `position: absolute` + elevated `z-index` — NO layout reflow, no other cards shift
- Expanded max-height: ~300px with `overflow-y: auto` scrollbar appearing when content exceeds it
- Expanded width: larger than 120px — expand to ~280–320px (you decide exact width)

### User/AI bifurcation in expanded card
- Top section: user's `rawText` (full, not truncated)
- Separator: thin horizontal line (`border-white/10`) with small "AI" label inline (e.g., `text-xs text-gray-500`)
- Bottom section: `aiAnnotation` as primary AI content; append `aiInsights` below if present and non-null
- Both sections sit inside the single scrollable expanded card

### Patterns tab footer (PAT-01)
- Fix: reduce word cloud height from 220px to ~140px
- Goal: entire PatternsTab content (toggle + cloud + narrative + stats pills) fits within 800×600 without scrolling
- No sticky footer, no layout restructuring — shrinking the word cloud is sufficient

### Claude's Discretion
- Exact expanded card width (suggested: 280–320px)
- Hover delay implementation (useRef timeout or CSS transition approach)
- Whether to use a React portal or `position: absolute` within the card's stacking context for the expanded overlay
- Word cloud exact pixel height (target: total content fits 800×600 minus tab bar and capture buffer)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Component source files
- `src/renderer/src/components/NoteCard.tsx` — current card implementation; border logic, tag dot logic, context menu
- `src/renderer/src/components/NotesTab.tsx` — grid layout, note list, AI update subscription
- `src/renderer/src/components/PatternsTab.tsx` — patterns layout, word cloud, stats pills

### Requirements
- `.planning/REQUIREMENTS.md` — CORK-01 through CORK-04 and PAT-01 success criteria

### No external specs — requirements are fully captured in decisions above

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `NoteCard.tsx` — existing component to modify (don't replace wholesale); context menu via `createPortal` already working
- `tagColors` via `window.api.kb.getTagColors()` — already available, returns `Record<string, string>` hex colors
- `onAiUpdate` subscription — already fires `{ noteId, tags, ... }` on new tag assignments
- `window.api.notes.getAll()` — loads notes at init; must also load tags per note (check if tags are included in this payload)

### Established Patterns
- Dark theme: `bg-[#1a1a14]`, `hover:bg-[#1f1f18]`, `border-white/5`
- Tag dots: `w-2 h-2 rounded-full` with `backgroundColor: tagColors[tag]` — already in NoteCard, just needs DB-loaded initial state
- Portal for overlay elements: `createPortal(..., document.body)` — established pattern for z-index escaping (context menu uses this)

### Integration Points
- Tags per note: currently only set via `onAiUpdate`. Need a `window.api.notes.getTags(noteId)` or tags included in `notes.getAll()` payload — check preload and main IPC
- Grid in `NotesTab.tsx`: change `minmax(160px, 1fr)` → `minmax(120px, 1fr)` and enforce square aspect ratio

</code_context>

<specifics>
## Specific Ideas

- Expanded card should feel like the card "lifts" off the board — shadow elevation increase on expand reinforces the post-it metaphor
- The divider+label bifurcation: thin line, "AI" label small and muted (text-gray-500), not prominent

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 07-note-card-visual-redesign*
*Context gathered: 2026-04-17*
