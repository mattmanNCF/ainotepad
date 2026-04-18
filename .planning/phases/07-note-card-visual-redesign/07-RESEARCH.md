# Phase 07: Note Card Visual Redesign - Research

**Researched:** 2026-04-17
**Domain:** React/TailwindCSS v4 UI redesign in Electron; IPC tag loading; hover overlay patterns
**Confidence:** HIGH (primary sources: direct codebase inspection)

## Summary

Phase 07 is a pure UI/interaction redesign of the corkboard. The goal is compact 120×120px square post-it cards with primary-tag colored borders, always-visible tag dots, a hover-expand overlay with user/AI content bifurcation, and shrinking the Patterns tab word cloud to fit 800×600.

The critical integration problem is confirmed by code inspection: `notes:getAll` returns the Drizzle schema's full `Note` type which **includes `tags TEXT`** (JSON-serialized `string[]`), but `NoteRecord` in both `NotesTab.tsx` and `NoteCard.tsx` does **not** include a `tags` field. The IPC handler already returns tags from the DB; the renderer just discards them. The fix is purely on the renderer side — extend the local `NoteRecord` type, parse the JSON string in `NotesTab` on load, and initialize NoteCard's local `tags` state from `note.tags` instead of `[]`.

A second rendering gap: `NotesTab`'s `onAiUpdate` handler does not propagate `aiInsights` from the live push event into the notes array. For notes AI-processed in the current session, the expanded overlay would always show `null` aiInsights even after AI completes. The fix is in `NotesTab`'s `onAiUpdate` handler — add `aiInsights: (data as any).insights ?? n.aiInsights`. The `insights` field is confirmed present in the preload payload (`preload/index.ts` line 20).

The `createPortal` pattern for z-index escape is already established in `NoteCard.tsx` (context menu). The hover-expand overlay follows the same pattern. TailwindCSS v4 is in use (`@import 'tailwindcss'` only, no config file); all standard utilities including `line-clamp-3` work normally.

**Primary recommendation:** Modify `NoteCard.tsx` and `NotesTab.tsx` in-place (do not replace wholesale). Five self-contained changes: tags DB fix, aiInsights propagation fix, square card layout, hover-expand overlay, word cloud height reduction.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Fixed square dimensions: ~120×120px per card
- Grid: `repeat(auto-fill, minmax(120px, 1fr))` — fills corkboard width
- Text truncated to 3 lines with CSS `line-clamp: 3` + fade-out gradient (not hard cutoff)
- Tag colored dots always visible at the bottom of every compact card (satisfies CORK-04)
- Left border color = first tag in AI-returned tags array (= "primary tag")
- When note has no tags yet (AI pending or no tags assigned): neutral gray border (`#6b7280`)
- Amber/emerald/red AI-state border coloring is removed entirely
- Tags must be loaded from DB at component init time (not just from live `onAiUpdate`)
- All notes — including historical ones — must show colored dots for every assigned tag
- Hover trigger: hover (CSS `:hover` or `onMouseEnter`)
- Close: mouse-leave with ~100–150ms delay to prevent flicker on fast cursor moves
- Expanded card overlays neighbors using `position: absolute` + elevated `z-index` — NO layout reflow
- Expanded max-height: ~300px with `overflow-y: auto` scrollbar
- Expanded width: larger than 120px — expand to ~280–320px (discretion)
- Top section of expanded card: user's `rawText` (full, not truncated)
- Separator: thin horizontal line (`border-white/10`) with small "AI" label inline (`text-xs text-gray-500`)
- Bottom section: `aiAnnotation` as primary AI content; append `aiInsights` below if present and non-null
- Both sections sit inside the single scrollable expanded card
- Fix Patterns word cloud: reduce height from 220px to ~140px
- Goal: entire PatternsTab content fits within 800×600 without scrolling
- No sticky footer, no layout restructuring — shrinking the word cloud is sufficient

### Claude's Discretion
- Exact expanded card width (suggested: 280–320px)
- Hover delay implementation (useRef timeout or CSS transition approach)
- Whether to use a React portal or `position: absolute` within the card's stacking context for the expanded overlay
- Word cloud exact pixel height (target: total content fits 800×600 minus tab bar and capture buffer)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CORK-01 | Notes display as small square post-it cards with text truncated to fit compact size | NoteCard.tsx uses free-height today; change to fixed 120px height + `overflow-hidden` + `line-clamp-3` + fade gradient |
| CORK-02 | Hovering a note brings it to foreground and expands — full user text + AI insights, user/AI bifurcation, scrollbar, no layout shift | Portal overlay (same as context menu); useRef timeout for leave delay; aiInsights propagation fix needed in NotesTab onAiUpdate |
| CORK-03 | Note left border color reflects primary tag's wiki color (replacing AI-state amber/emerald/red) | `tagColors` from `window.api.kb.getTagColors()` already returns hex; `aiStateStyle` map in NoteCard.tsx must be removed and replaced |
| CORK-04 | All notes display colored dot indicators for every assigned tag (currently only most recent note shows dots) | DB `tags` column exists and is returned by `notes:getAll`; fix: extend `NoteRecord` type + parse JSON in NotesTab + init NoteCard state from `note.tags` |
| PAT-01 | Patterns page footer fully visible at default window size without scrolling | PatternsTab.tsx `WordCloud height={220}` → `height={140}`; layout budget confirms 140px fits comfortably within 600px |
</phase_requirements>

---

## Standard Stack

### Core (all already installed — no new packages needed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19 | Component model, hooks, portal | Project baseline |
| TailwindCSS | v4 | Utility CSS — `line-clamp`, `overflow`, `z-index`, etc. | Project baseline |
| react-d3-cloud | installed | Word cloud in PatternsTab | Project baseline (installed with `--legacy-peer-deps`) |

**No new dependencies required.** All changes are pure CSS/JSX/layout modifications to existing components.

---

## Architecture Patterns

### Fix 1: Tags DB Loading (CORK-04) — Renderer-Only, No IPC Changes

**Root cause confirmed by code inspection:**

`ipc.ts` `notes:getAll` handler returns the full Drizzle `Note` type including `tags: string` (JSON-encoded). But `NoteRecord` in `NotesTab.tsx` and `NoteCard.tsx` declares no `tags` field, so the value is silently dropped.

**Fix:**

1. Extend `NoteRecord` in both files:
   ```typescript
   interface NoteRecord {
     // existing fields unchanged...
     tags: string[]  // parsed from DB JSON on renderer side
   }
   ```

2. Parse tags in `NotesTab.tsx` init load:
   ```typescript
   window.api.notes.getAll()
     .then((loaded) => {
       setNotes(loaded.map(n => {
         let tags: string[] = []
         try { tags = JSON.parse((n as any).tags ?? '[]') } catch { /* leave empty */ }
         return { ...n, tags }
       }))
       setLoading(false)
     })
   ```

3. Add `tags: []` to the optimistic note in `handleSubmit`.

4. In `NoteCard.tsx`, initialize tags from props:
   ```typescript
   const [tags, setTags] = useState<string[]>(note.tags)
   ```
   The existing `onAiUpdate` handler that calls `setTags(data.tags)` remains unchanged for live updates.

5. Update `preload/index.d.ts` `NoteRecord` interface to include `tags: string[]`.

### Fix 2: aiInsights Propagation (CORK-02) — NotesTab onAiUpdate

**Root cause:** `NotesTab`'s `onAiUpdate` handler (line 34) only destructures `{ noteId, aiState, aiAnnotation, organizedText }`. The `insights` field is present in the preload payload (confirmed in `preload/index.ts` line 20) but is not mapped into the notes array state.

**Impact:** Notes AI-processed in the current session will show `null` aiInsights in the expanded overlay, even after AI completes.

**Fix in `NotesTab.tsx` `onAiUpdate` handler:**
```typescript
const unsub = window.api.onAiUpdate(({ noteId, aiState, aiAnnotation, organizedText, tags, insights }) => {
  setNotes((prev) =>
    prev.map((n) =>
      n.id === noteId
        ? {
            ...n,
            aiState: aiState as NoteRecord['aiState'],
            aiAnnotation,
            organizedText: organizedText ?? null,
            tags: tags ?? n.tags,
            aiInsights: insights ?? n.aiInsights,  // ADD THIS
          }
        : n
    )
  )
})
```

Note: the preload field name is `insights` (not `aiInsights`) — confirmed in `preload/index.ts` line 20.

### Fix 3: Square Cards (CORK-01)

**Current grid** in `NotesTab.tsx`:
```tsx
<div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
```

**New grid:**
```tsx
<div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}>
```

**IMPORTANT — `aspect-square` vs fixed height:**

`repeat(auto-fill, minmax(120px, 1fr))` makes columns that are minimum 120px but expand to fill available width. With `aspect-square`, the card height equals the column width — so at 800px with 5+ columns, each card could be ~140–160px square, not 120px.

Two options:

| Approach | Result | Tradeoff |
|----------|--------|----------|
| `aspect-square` | Cards are square but width/height > 120px at typical window sizes | Consistent square shape; size varies with window width |
| `height: 120px; overflow: hidden` | Cards are always exactly 120px tall regardless of column width | Fixed height; columns can be wider than tall (not square) |

**Recommendation:** Use `height: 120px; overflow: hidden` for the compact view — this guarantees the "compact" behavior regardless of window width, which is the design intent ("compact square post-it cards"). The card may be slightly wider than 120px at large windows, which is acceptable. The planner should make the final call here.

```tsx
<div
  ref={cardRef}
  className="relative overflow-hidden rounded-sm bg-[#1a1a14] hover:bg-[#1f1f18] transition-colors shadow-md cursor-default"
  style={{ borderLeft: `4px solid ${primaryTagColor}`, height: '120px' }}
  onMouseEnter={handleMouseEnter}
  onMouseLeave={handleMouseLeave}
  onContextMenu={handleContextMenu}
>
```

**Text truncation with fade-out gradient:**
```tsx
<div className="relative p-2 pb-0">
  <p className="text-xs text-gray-200 leading-snug line-clamp-3 break-words">{note.rawText}</p>
  {/* Soft fade at text bottom */}
  <div className="absolute bottom-0 left-0 right-0 h-3 bg-gradient-to-t from-[#1a1a14] to-transparent pointer-events-none" />
</div>
```

TailwindCSS v4 includes `line-clamp-{n}` natively. No plugin needed.

### Fix 4: Primary Tag Border Color (CORK-03)

**Remove** the `aiStateStyle` map entirely. Replace with:

```typescript
// Computed once in render — tags is already string[] from DB or live update
const primaryTagColor = tags.length > 0 && tagColors[tags[0]]
  ? tagColors[tags[0]]
  : '#6b7280'
```

```tsx
style={{ borderLeft: `4px solid ${primaryTagColor}`, height: '120px' }}
```

The border color is correct on first render (DB-loaded tags), not just after AI completes.

### Fix 5: Tag Dots Pinned to Bottom (CORK-04)

With a fixed-height card and `overflow: hidden`, pin dots to the bottom using absolute positioning:

```tsx
{/* Tag dots — always visible at bottom */}
{tags.length > 0 && (
  <div className="absolute bottom-5 left-2 flex flex-wrap gap-0.5">
    {tags.map(tag => (
      <span
        key={tag}
        title={tag}
        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{ backgroundColor: tagColors[tag] ?? '#6b7280' }}
      />
    ))}
  </div>
)}
{/* Timestamp footer */}
<div className="absolute bottom-1 left-2 right-2 flex items-center justify-between">
  <span className="text-[9px] text-gray-600">{formatTime(note.submittedAt)}</span>
</div>
```

### Fix 6: Hover-Expand Overlay (CORK-02)

**Approach: Portal to `document.body`** — same pattern as context menu. Scroll container uses `overflow-y: auto` which creates a new stacking context; portal escapes it cleanly.

```typescript
// State additions to NoteCard
const [expanded, setExpanded] = useState(false)
const [cardRect, setCardRect] = useState<DOMRect | null>(null)
const cardRef = useRef<HTMLDivElement>(null)
const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

const handleMouseEnter = useCallback(() => {
  if (leaveTimer.current) clearTimeout(leaveTimer.current)
  const rect = cardRef.current?.getBoundingClientRect()
  if (rect) setCardRect(rect)
  setExpanded(true)
}, [])

const handleMouseLeave = useCallback(() => {
  leaveTimer.current = setTimeout(() => setExpanded(false), 120)
}, [])

// Cleanup on unmount — prevents state update after unmount
useEffect(() => () => {
  if (leaveTimer.current) clearTimeout(leaveTimer.current)
}, [])
```

Portal overlay JSX (add after context menu portal):
```tsx
{expanded && cardRect && createPortal(
  <div
    onMouseEnter={() => { if (leaveTimer.current) clearTimeout(leaveTimer.current) }}
    onMouseLeave={handleMouseLeave}
    style={{
      position: 'fixed',
      left: cardRect.left,
      top: cardRect.top,
      width: 300,
      maxHeight: 300,
      zIndex: 9998,  // below context menu (9999) but above everything else
      overflowY: 'auto',
    }}
    className="rounded-sm bg-[#1f1f18] border border-white/10 shadow-2xl"
  >
    {/* User text — full, no truncation */}
    <div className="p-3">
      <p className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed break-words">{note.rawText}</p>
    </div>
    {/* User/AI divider — only when AI content exists */}
    {(note.aiAnnotation || note.aiInsights) && (
      <div className="flex items-center gap-2 px-3 py-1">
        <div className="flex-1 border-t border-white/10" />
        <span className="text-[10px] text-gray-500">AI</span>
        <div className="flex-1 border-t border-white/10" />
      </div>
    )}
    {/* AI annotation */}
    {note.aiAnnotation && (
      <div className="px-3 pb-2">
        <p className="text-xs text-blue-400/70 leading-relaxed">{note.aiAnnotation}</p>
      </div>
    )}
    {/* AI insights (appended below annotation if present) */}
    {note.aiInsights && (
      <div className="px-3 pb-3">
        <p className="text-xs text-gray-400 leading-relaxed">{note.aiInsights}</p>
      </div>
    )}
  </div>,
  document.body
)}
```

The overlay attaches `onMouseEnter` to clear the leave timer, preventing close when cursor transitions from card to overlay.

### Fix 7: PatternsTab Word Cloud Height (PAT-01)

**Single-line change in `PatternsTab.tsx`:**

```tsx
// Line 113 — change height prop only
<WordCloud
  data={digest.words}
  width={500}
  height={140}   // was 220
  ...
/>
```

**Layout budget (800×600 window):**
- Tab bar: ~40px
- PatternsTab `p-4` padding: 32px total
- Period toggle row: ~48px (button + gap)
- Word cloud: 140px (was 220px, saves 80px)
- AI Summary block: ~80px
- Stats pills row: ~52px
- Internal `gap-4` spacing: ~64px (4 gaps)
- Total: ~456px — 144px below 600px ceiling

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CSS text truncation | Manual JS character slicing | `line-clamp-3` (TailwindCSS v4 core) | Browser handles multi-line clamp correctly across fonts |
| z-index overlay | Complex stacking context hacks | `createPortal` to `document.body` | Already established pattern in NoteCard (context menu) |
| Hover delay / debounce | Custom event queue | `useRef` timeout cleared on re-enter | Minimal, reliable, matches codebase style |
| JSON tag parsing | Assume already array | `JSON.parse` with try/catch fallback | DB stores `'[]'` string not array; parse errors must not crash |

---

## Common Pitfalls

### Pitfall 1: Tags not initializing from DB (existing bug)
**What goes wrong:** Historical notes show no tag dots and gray border even when tags exist in DB.
**Root cause:** `NoteRecord` interface missing `tags` field; `useState<string[]>([])` ignores DB value.
**How to avoid:**
1. Add `tags: string[]` to `NoteRecord` in `NotesTab.tsx`, `NoteCard.tsx`, and `preload/index.d.ts`
2. Parse JSON string in `NotesTab` init (`(n as any).tags ?? '[]'`)
3. Initialize NoteCard: `useState<string[]>(note.tags)`
**Warning signs:** Tag dots absent on app reload even for AI-complete notes.

### Pitfall 2: aiInsights null for session-new notes in expanded overlay
**What goes wrong:** Notes processed by AI in the current session show no AI insights in the expanded overlay.
**Root cause:** `NotesTab.onAiUpdate` handler doesn't propagate `insights` field into the notes array state.
**How to avoid:** In `NotesTab` onAiUpdate handler, add `aiInsights: insights ?? n.aiInsights` (note: preload field is `insights`, not `aiInsights`).
**Warning signs:** Expanded overlay shows annotation but blank AI insights for new notes; reload shows insights correctly (because DB has them and `getAll` returns full record).

### Pitfall 3: `aspect-square` doesn't give 120px fixed squares
**What goes wrong:** Cards are larger than 120px because the grid columns expand past `minmax(120px, 1fr)`.
**Root cause:** `minmax(120px, 1fr)` gives 120px minimum; actual column width fills available space. `aspect-square` makes height = column width, not 120px.
**How to avoid:** Use `height: 120px; overflow: hidden` for compact card rather than `aspect-square`.
**Warning signs:** Cards look oversized at large window widths.

### Pitfall 4: Overlay closes when cursor moves from card to overlay
**What goes wrong:** Moving cursor from compact card to expanded overlay passes outside both elements briefly, triggering `mouseleave` and immediate close.
**Root cause:** Even with 120ms delay, fast cursor movement + rendering gap may trigger close before overlay renders.
**How to avoid:**
- Mount portal overlay at exactly `cardRect.left / cardRect.top` (same top-left corner as card)
- Apply `onMouseEnter`/`onMouseLeave` to the overlay element to cancel/set the timer
- 120ms delay provides sufficient buffer
**Warning signs:** Overlay flashes briefly and disappears when hovering.

### Pitfall 5: Overlay position drift after scrolling
**What goes wrong:** Expanded overlay appears offset from card after user scrolls the notes list.
**Root cause:** `cardRect` computed on first `mouseenter`; if scroll happened between hover and render, position is stale.
**How to avoid:** Always call `getBoundingClientRect()` fresh inside `handleMouseEnter` callback (not in a useEffect). The cursor must be over the card at the moment of hover, so the rect is correct at that instant.
**Warning signs:** Overlay offset from card position by the scroll amount.

### Pitfall 6: `notes:getAll` returns `tags` as `string`, not `string[]`
**What goes wrong:** TypeScript accepts `note.tags` as `string[]` but runtime value is `'["physics","math"]'` — passing it to `useState<string[]>` gives a string not an array.
**Root cause:** Drizzle `text(...)` column always returns `string`. TypeScript's `NoteRecord` interface in renderer is not the Drizzle type.
**How to avoid:** Parse in `NotesTab` before spreading into the typed NoteRecord. This is the single parse site; `NoteCard` receives a proper `string[]`.

### Pitfall 7: `line-clamp` not working
**What goes wrong:** Text not clamped — shows full content.
**Root cause:** Possible if TailwindCSS v4 `@import 'tailwindcss'` is missing from CSS entry, or if a parent flex/grid container stretches the card height beyond line-clamp's effect.
**How to avoid:** Ensure `overflow: hidden` is on the card container (`height: 120px; overflow: hidden`). `line-clamp-3` is in TailwindCSS v4 core — no plugin needed.

---

## Code Examples

### Complete NotesTab init with tag parsing
```typescript
// Source: codebase inspection — required for CORK-04
window.api.notes.getAll()
  .then((loaded) => {
    setNotes(loaded.map(n => {
      let tags: string[] = []
      try { tags = JSON.parse((n as any).tags ?? '[]') } catch { /* leave empty */ }
      return { ...n, tags }
    }))
    setLoading(false)
  })
```

### NotesTab onAiUpdate with aiInsights propagation
```typescript
// Source: codebase inspection — required for CORK-02 aiInsights in expanded view
const unsub = window.api.onAiUpdate(({ noteId, aiState, aiAnnotation, organizedText, tags, insights }) => {
  setNotes((prev) =>
    prev.map((n) =>
      n.id === noteId
        ? {
            ...n,
            aiState: aiState as NoteRecord['aiState'],
            aiAnnotation,
            organizedText: organizedText ?? null,
            tags: tags ?? n.tags,
            aiInsights: insights ?? n.aiInsights,
          }
        : n
    )
  )
})
```

### Border color from primary tag
```typescript
// In NoteCard render — replaces aiStateStyle
const primaryTagColor = tags.length > 0 && tagColors[tags[0]]
  ? tagColors[tags[0]]
  : '#6b7280'
```

### Hover expand with portal and leave delay
```typescript
// useRef timer — no external deps, matches codebase style
const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

const handleMouseEnter = useCallback(() => {
  if (leaveTimer.current) clearTimeout(leaveTimer.current)
  setCardRect(cardRef.current?.getBoundingClientRect() ?? null)
  setExpanded(true)
}, [])

const handleMouseLeave = useCallback(() => {
  leaveTimer.current = setTimeout(() => setExpanded(false), 120)
}, [])

useEffect(() => () => { if (leaveTimer.current) clearTimeout(leaveTimer.current) }, [])
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@tailwindcss/line-clamp` plugin | `line-clamp-{n}` in v3.3+ / v4 core | Tailwind v3.3 (2023) | No plugin needed |
| `tailwind.config.ts` | `@import 'tailwindcss'` CSS only | Tailwind v4 (2025) | No config file — project already using this |

---

## Open Questions

1. **Square card: `height: 120px` vs `aspect-square`**
   - What we know: `minmax(120px, 1fr)` grid expands columns past 120px; `aspect-square` gives variable size
   - Recommendation: `height: 120px; overflow: hidden` for consistently compact behavior. Planner should confirm.

2. **Word cloud exact height for PAT-01**
   - What we know: 140px gives ~144px headroom from budget analysis
   - What's unclear: AI narrative block height varies with text length — long narratives may still scroll at edge
   - Recommendation: 140px as primary target; if needed also add `max-h-24 overflow-hidden` to narrative block as secondary safeguard

---

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection: `src/preload/index.ts`, `src/preload/index.d.ts`, `src/main/ipc.ts`, `src/main/db.ts`, `drizzle/schema.ts`
- Direct codebase inspection: `src/renderer/src/components/NoteCard.tsx`, `NotesTab.tsx`, `PatternsTab.tsx`
- `.planning/phases/07-note-card-visual-redesign/07-CONTEXT.md` — locked user decisions

### Secondary (MEDIUM confidence)
- TailwindCSS v4 `line-clamp` utilities: merged from plugin in v3.3+, in v4 core; project already on v4
- `createPortal(child, document.body)`: React docs pattern, confirmed working in codebase (NoteCard context menu)

---

## Metadata

**Confidence breakdown:**
- Tags DB fix: HIGH — confirmed by reading IPC handler, schema, and component code
- aiInsights propagation fix: HIGH — confirmed by reading NotesTab onAiUpdate and preload payload shape
- Square card CSS: HIGH — `height: 120px` + `overflow: hidden` is unconditionally reliable
- Hover portal overlay: HIGH — pattern already established in codebase
- Word cloud height: HIGH — direct code reading; single numeric change
- Architecture: HIGH — all patterns derived from existing codebase, no external research required

**Research date:** 2026-04-17
**Valid until:** Stable for v1.1 scope; valid until Electron or TailwindCSS major upgrade
