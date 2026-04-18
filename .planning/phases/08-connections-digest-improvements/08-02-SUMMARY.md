---
phase: 08-connections-digest-improvements
plan: 02
subsystem: renderer/corkboard
tags: [svg, connections, corkboard, CORK-05, react]
dependency_graph:
  requires: [08-01]
  provides: [CORK-05-visual-edges]
  affects: [NotesTab, NoteCard]
tech_stack:
  added: []
  patterns: [SVG overlay with absolute positioning, useLayoutEffect for DOM measurement, cardRefs map for imperative DOM collection, onRef callback prop pattern]
key_files:
  created: []
  modified:
    - src/renderer/src/components/NoteCard.tsx
    - src/renderer/src/components/NotesTab.tsx
decisions:
  - onRef inline arrow in notes.map uses stable note.id closure — intentional, NoteCard useEffect dep fires only on card mount/unmount
  - SVG placed inside overflow-y-auto container so edges scroll with content, not fixed to viewport
  - useLayoutEffect for edge computation prevents flicker by measuring after DOM paint but before browser repaint
  - similarPairs.length guard on SVG render avoids empty SVG element when no connections exist
metrics:
  duration: "~8 minutes"
  completed_date: "2026-04-18"
  tasks_completed: 2
  files_modified: 2
---

# Phase 08 Plan 02: SVG Edge Overlay for Corkboard Connections — Summary

**One-liner:** Indigo SVG edge lines between similar note cards on the corkboard, driven by TF-IDF getSimilarPairs IPC with scroll-aware DOM measurement via useLayoutEffect.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Add onRef prop to NoteCard | b913998 | src/renderer/src/components/NoteCard.tsx |
| 2 | Add SVG edge overlay to NotesTab | 10e57ca | src/renderer/src/components/NotesTab.tsx |

## What Was Built

### Task 1: NoteCard onRef prop
Added `onRef?: (el: HTMLElement | null) => void` to `NoteCardProps`. The component destructures it and calls it via `useEffect` watching `[onRef]` — fires with the card's root `HTMLDivElement` on mount, fires with `null` on unmount. This gives the parent an imperative handle to each card's DOM element.

### Task 2: NotesTab SVG edge overlay
- `gridRef` + `cardRefs` (Map) refs for DOM position tracking
- `similarPairs` state: fetched from `window.api.notes.getSimilarPairs()` in a `useEffect` triggered by `notes.length`; cleared when fewer than 2 notes
- `edgeLines` state: computed by `useLayoutEffect` — subtracts `containerRect` from each card's `getBoundingClientRect()` to get scroll-container-relative coordinates
- SVG rendered `absolute inset-0` inside the `overflow-y-auto` scroll container's `relative` wrapper — edges scroll with content
- Lines: `stroke="#6366f1"` (indigo-500), `strokeOpacity=0.35`, `strokeWidth=1.5`, `pointer-events:none`, `zIndex:10`
- SVG element only mounted when `similarPairs.length > 0`

## Truths Verified

- Notes sharing a tag with cosine similarity >= 0.3 show connecting lines (threshold enforced in similarity.ts from 08-01)
- Edge lines have `pointer-events:none` on SVG — card interactions unblocked
- SVG is inside the scroll container — edges scroll with cards, no offset drift
- Hover-expand portal renders at `zIndex: 9998`, above SVG at `zIndex: 10`
- No SVG rendered when `similarPairs` is empty

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

- [x] NoteCard.tsx modified: `onRef` in interface, destructuring, and useEffect
- [x] NotesTab.tsx modified: gridRef, cardRefs, similarPairs, edgeLines, useLayoutEffect, SVG render, onRef on NoteCard
- [x] Task 1 commit: b913998
- [x] Task 2 commit: 10e57ca
- [x] TypeScript: no errors
- [x] Build: succeeded (✓ built in 2.99s)

## Self-Check: PASSED
