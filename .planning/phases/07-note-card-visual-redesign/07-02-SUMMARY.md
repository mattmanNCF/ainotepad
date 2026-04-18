---
phase: 07-note-card-visual-redesign
plan: "02"
subsystem: renderer/visual-layer
tags: [compact-cards, hover-expand, portal-overlay, tag-colors, corkboard]
dependency_graph:
  requires: [07-01]
  provides: [compact-card-layout, primaryTagColor-border, hover-expand-overlay, tag-dots-absolute]
  affects: [NoteCard, NotesTab]
tech_stack:
  added: []
  patterns: [portal-overlay, leave-timer-delay, getBoundingClientRect-on-hover, fixed-positioning]
key_files:
  created: []
  modified:
    - src/renderer/src/components/NoteCard.tsx
    - src/renderer/src/components/NotesTab.tsx
decisions:
  - "getBoundingClientRect() called inside handleMouseEnter callback (not useEffect) — captures fresh rect at hover time, avoids stale rect after scroll"
  - "Overlay zIndex 9998 vs context menu 9999 — context menu always appears above expand overlay"
  - "Leave delay 120ms via useRef timeout — avoids React setState on unmounted component; cancels on overlay mouseEnter for safe card-to-overlay cursor transit"
  - "AI divider rendered conditionally — only shown when aiAnnotation or aiInsights present, not for pending notes"
metrics:
  duration: "~15 minutes"
  completed_date: "2026-04-17"
  tasks_completed: 2
  files_modified: 2
---

# Phase 07 Plan 02: Note Card Visual Redesign Summary

**One-liner:** Compact 120px post-it cards with primary-tag left border color, fade-truncated text, pinned tag dots, and a hover-expand portal overlay showing full rawText plus AI annotation/insights with user/AI bifurcation.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Compact card layout — square cards, tag-color border, tag dots, grid update | b167910 | NoteCard.tsx, NotesTab.tsx |
| 2 | Hover-expand portal overlay with user/AI bifurcation | d0cbc4c | NoteCard.tsx |

## What Was Done

### Task 1 — Compact card layout, tag-color border, tag dots, grid update

**NoteCard.tsx — four changes:**

**1. Removed `aiStateStyle` entirely.** The entire `aiStateStyle` const block (amber/emerald/red AI-state border colors) and the `const style = aiStateStyle[note.aiState]` line were deleted. Badge references (`style.badge`, `style.badgeClass`) in the footer were removed with the footer div.

**2. Added `primaryTagColor` computed value.** Reads `tags[0]` from component state, looks it up in `tagColors` map, falls back to `#6b7280` gray. Used as the `borderLeft` color on the card container.

**3. Redesigned card container div.** Changed from `flex flex-col` with `minHeight: 120px` to `relative overflow-hidden` with `height: 120px`. Added `ref={cardRef}`, `onMouseEnter`, `onMouseLeave` handlers, and `cursor-default`. The fixed height with overflow-hidden is what keeps cards compact.

**4. Replaced card body content.** Old structure (flex body + footer) replaced with:
- Truncated text: `text-xs line-clamp-3` paragraph with absolute fade gradient (`bg-gradient-to-t`) overlay at bottom
- Tag dots: absolute-positioned `bottom-5 left-2` with 6px colored circles per tag
- Timestamp: absolute `bottom-1 left-2` in 9px gray

**NotesTab.tsx:** Grid changed from `minmax(160px, 1fr) gap-3` to `minmax(120px, 1fr) gap-2` — denser corkboard layout.

### Task 2 — Hover-expand portal overlay with user/AI bifurcation

Added expand-on-hover behavior using a second portal (sibling to the existing context menu portal).

**State and refs added:**
- `expanded: boolean` — controls portal render
- `cardRect: DOMRect | null` — captures card position at hover time
- `leaveTimer: useRef<ReturnType<typeof setTimeout>>` — 120ms debounce ref

**Full `handleMouseEnter`/`handleMouseLeave` implementations** replaced the Task 1 stubs:
- `handleMouseEnter`: cancels any pending close timer, captures fresh `getBoundingClientRect()`, sets `expanded=true`
- `handleMouseLeave`: starts 120ms timer to `setExpanded(false)`

**Cleanup useEffect** clears `leaveTimer` on component unmount.

**Overlay portal JSX:**
- Fixed at `cardRect.left/top`, 300px wide, max 300px tall, `zIndex: 9998`
- `onMouseEnter` inline handler cancels `leaveTimer` — enables cursor transit from compact card to overlay without dismissal
- `onMouseLeave` restarts the close timer
- Content: full `rawText` (whitespace-pre-wrap), conditional AI divider (text-gray-500 "AI" label flanked by border lines), `aiAnnotation` in `text-blue-400/70`, `aiInsights` in `text-gray-400`
- AI section only renders when `aiAnnotation || aiInsights` — no empty divider for pending notes

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

### Files exist

- [x] `src/renderer/src/components/NoteCard.tsx` — modified
- [x] `src/renderer/src/components/NotesTab.tsx` — modified

### Commits exist

- [x] b167910 — Task 1 (compact card layout)
- [x] d0cbc4c — Task 2 (hover-expand overlay)

### Acceptance criteria

**Task 1:**
- [x] `aiStateStyle` zero matches in NoteCard.tsx
- [x] `primaryTagColor` at least 2 matches (declaration line 44, usage line 104)
- [x] `height: '120px'` in inline style (line 104)
- [x] `line-clamp-3` exactly one match (line 96)
- [x] `bg-gradient-to-t` one match (line 97)
- [x] `bottom-5 left-2` one match (line 102)
- [x] `minmax(120px` one match in NotesTab.tsx (line 108)
- [x] `gap-2` one match in grid div (line 108)

**Task 2:**
- [x] `setExpanded` at least 3 matches (lines 40, 52, 56)
- [x] `leaveTimer` at least 4 matches (lines 42, 49, 56, 89, 166)
- [x] `cardRect` at least 4 matches (lines 41, 164, 170, 171)
- [x] `9998` exactly one match (line 174)
- [x] `onMouseEnter.*leaveTimer` one match (line 166)
- [x] `whitespace-pre-wrap` one match (line 181)
- [x] `text-gray-500` AI divider label (line 188)
- [x] `text-blue-400` aiAnnotation (line 196)

**Build:**
- [x] `npm run build` exits 0 (both after Task 1 and after Task 2)

## Self-Check: PASSED
