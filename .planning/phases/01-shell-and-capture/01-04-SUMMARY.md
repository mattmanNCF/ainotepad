---
phase: 01-shell-and-capture
plan: "04"
subsystem: ui
tags: [react, electron, ipc, sqlite, tailwindcss, animation]

# Dependency graph
requires:
  - phase: 01-02
    provides: SQLite DB layer + IPC handlers for notes.create and notes.getAll
  - phase: 01-03
    provides: System tray and global shortcut infrastructure
provides:
  - CaptureBuffer component (Enter-to-submit, auto-grow textarea)
  - NoteCard component (rawText + time + aiState badge + slide-in animation)
  - NotesTab wired to IPC — loads on mount, optimistic prepend on submit
affects: [02-ai-pipeline]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Optimistic UI prepend with IPC resolution and ID swap
    - Inline NoteRecord type in renderer (avoids preload type coupling)
    - CSS @keyframes in main.css for TailwindCSS v4 (not in component)

key-files:
  created:
    - src/renderer/src/components/CaptureBuffer.tsx
    - src/renderer/src/components/NoteCard.tsx
  modified:
    - src/renderer/src/components/NotesTab.tsx
    - src/renderer/src/assets/main.css

key-decisions:
  - "Optimistic prepend uses temporary id (optimistic-${Date.now()}) replaced by real ID after IPC resolves"
  - "NoteRecord type inlined in renderer rather than imported from preload/index.d.ts — keeps renderer self-contained"
  - "@keyframes slideIn defined in main.css (not inline) — TailwindCSS v4 does not support arbitrary keyframe classes in JSX"
  - "Failed IPC in v1 leaves optimistic entry visible — no error UI yet (deferred to v2)"

patterns-established:
  - "Optimistic prepend pattern: setNotes([optimistic, ...prev]) then swap on IPC resolve"
  - "Auto-grow textarea via scrollHeight reassignment on input"
  - "aiState badge via Record<aiState, {label, className}> lookup table"

requirements-completed: [CAP-01, CAP-02]

# Metrics
duration: ~30min
completed: 2026-04-14
---

# Phase 01, Plan 04: Capture Buffer + Note List Summary

**Textarea capture buffer with optimistic prepend to SQLite-backed note list, slide-in animation on NoteCard entry, human-verified end-to-end**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-04-14T22:17:47Z
- **Completed:** 2026-04-14
- **Tasks:** 3 (2 auto + 1 human-verify)
- **Files modified:** 4

## Accomplishments

- CaptureBuffer textarea submits on Enter (not Shift+Enter), clears after submit, auto-grows with content
- NoteCard displays rawText, formatted time, and aiState badge with slide-in entry animation
- NotesTab loads notes via IPC on mount and prepends new notes optimistically before IPC resolves
- Human verification PASSED — capture flow, persistence across restart, tray hide, and Ctrl+Shift+Space shortcut all confirmed working

## Task Commits

1. **Task 1: Build CaptureBuffer and NoteCard components** - `e5859e5` (feat)
2. **Task 2: Wire NotesTab with capture buffer and note list** - `59623fc` (feat)
3. **Task 3: Visual verification** - Human checkpoint — PASSED

## Files Created/Modified

- `src/renderer/src/components/CaptureBuffer.tsx` - Textarea capture buffer, Enter-to-submit, auto-grow
- `src/renderer/src/components/NoteCard.tsx` - Note display card with aiState badge and slide-in animation
- `src/renderer/src/components/NotesTab.tsx` - Notes tab: loads on mount via IPC, optimistic prepend on submit
- `src/renderer/src/assets/main.css` - Added `@keyframes slideIn` + `.note-card-enter` class

## Decisions Made

- **Optimistic prepend pattern:** Note is immediately prepended with a temporary ID (`optimistic-${Date.now()}`), then the real saved record replaces it after `window.api.notes.create()` resolves. Rationale: instant feedback without waiting on SQLite round-trip.
- **Inline NoteRecord type:** NoteRecord interface duplicated in both CaptureBuffer and NotesTab rather than importing from `src/preload/index.d.ts`. Rationale: keeps renderer components self-contained; avoids coupling renderer to preload type surface.
- **@keyframes in main.css:** Animation defined in CSS file rather than in JSX or Tailwind config. Rationale: TailwindCSS v4 does not support arbitrary keyframe injection from class utilities; CSS file is the correct location.
- **No error UI on IPC failure (v1):** If `notes.create` throws, the optimistic entry remains visible. Error UI deferred to v2.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## Human Verification Result

**PASSED** — User confirmed:
- `npm run dev` launches successfully
- App is visually confirmed working
- Capture flow, persistence, tray, and shortcut all verified

## User Setup Required

None — no external service configuration required.

## Self-Check: PASSED

- `src/renderer/src/components/CaptureBuffer.tsx` — created in Task 1 commit e5859e5
- `src/renderer/src/components/NoteCard.tsx` — created in Task 1 commit e5859e5
- `src/renderer/src/components/NotesTab.tsx` — modified in Task 2 commit 59623fc
- `src/renderer/src/assets/main.css` — modified in Task 1 commit e5859e5
- Human verification: PASSED (user confirmed)

## Next Phase Readiness

- Phase 01 Shell & Capture is complete. All four plans (01-01 through 01-04) are done.
- Phase 02 AI Pipeline can begin: IPC handler surface (`notes.create`, `notes.getAll`) is in place; AI worker wiring can attach to existing note records via `aiState`/`aiAnnotation` fields.
- No blockers.

---
*Phase: 01-shell-and-capture*
*Completed: 2026-04-14*
