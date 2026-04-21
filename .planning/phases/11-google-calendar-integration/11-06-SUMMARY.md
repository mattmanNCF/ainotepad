---
phase: 11-google-calendar-integration
plan: "06"
subsystem: renderer-ui
tags: [calendar, ux, settings, toast, notecard, delete-confirm]
dependency_graph:
  requires: [11-04, 11-05]
  provides: [CAL-UX-01, CAL-UX-02]
  affects: [SettingsPanel, App, NoteCard, NotesTab]
tech_stack:
  added: []
  patterns:
    - Fixed-position toast with shrinking progress bar (UndoToast)
    - Combined useEffect for multi-channel subscription + initial data load (NoteCard)
    - Async confirm gate before destructive IPC (NotesTab delete flow)
key_files:
  created:
    - src/renderer/src/components/GoogleCalendarSection.tsx
    - src/renderer/src/components/UndoToast.tsx
  modified:
    - src/renderer/src/components/SettingsPanel.tsx
    - src/renderer/src/App.tsx
    - src/renderer/src/components/NoteCard.tsx
    - src/renderer/src/components/NotesTab.tsx
    - src/preload/index.ts
    - src/preload/index.d.ts
decisions:
  - "Cancelled reminder state renders no chip (hidden) — user already pressed Undo, chip disappearing is the correct UX signal"
  - "UndoToast single-toast policy: new pending replaces current — matches main-process independent timer behavior"
  - "NoteCard refreshReminder() re-fetches via IPC on every push (rather than updating state from push payload) for DB consistency"
metrics:
  duration_seconds: 261
  tasks_completed: 2
  files_created: 2
  files_modified: 6
  completed_date: "2026-04-21T23:20:45Z"
requirements_closed: [CAL-UX-01, CAL-UX-02]
---

# Phase 11 Plan 06: Renderer UI — Calendar UX Summary

Complete renderer UI for Google Calendar integration. Two new components and four modified files ship the full user-visible surface: settings pane, global toast, per-note chips, and delete-confirm flow.

## What Was Built

**GoogleCalendarSection.tsx** (new — 110 lines)

Settings > Integrations > Google Calendar pane. Layout: header row with Google Calendar label left-aligned and a 2px health dot + last-sync timestamp right-aligned. Health logic:
- Red: not connected or encryptionAvailable=false
- Yellow: connected but lastSuccess more than 24h ago
- Green: connected and lastSuccess recent (or no events yet, freshly connected)

When disconnected: a "Connect Google Calendar" button (disabled when encryptionAvailable=false with an explanatory red message). When connected: a "Ask before creating events" checkbox (bound to setConfirmBeforeCreate) and a "Disconnect & revoke" button below it. Inline error string rendered below buttons on failure. Refreshes status on mount and on onEventSynced / onEventFailed pushes to keep the last-sync time current.

**UndoToast.tsx** (new — 130 lines)

Fixed bottom-right toast (z-index 9997) with role="status" aria-live="polite". Two modes:

Auto mode (10s): Shows "Calendar event (undo)" label, event title (truncated), formatted datetime, [Undo] button. Blue shrinking progress bar. On undo: calls undoCreate. On synced push: brief emerald "Calendar: [title]" flash for 1.2s then hides. On failed push: red "Calendar failed: [error]" for 4s. On cancelled push: hides immediately.

Confirm mode (5s): Shows "Create calendar event?" label, event title, datetime, [Create] + [Dismiss] buttons. Amber shrinking progress bar. [Create] calls confirmCreate, [Dismiss] calls undoCreate (treated as cancel from user's perspective). Timeout = main-process cancels silently.

Single-toast policy: a new pending event replaces the active toast (both the state and the timer are reset).

**SettingsPanel.tsx** (modified)

Added `import { GoogleCalendarSection } from './GoogleCalendarSection'` at top. Added new Integrations section as the last block inside the settings modal, after the Agent API (MCP) section, with the same border-t/pt-4/uppercase-tracking-wider styling pattern.

**App.tsx** (modified)

Added `import { UndoToast } from './components/UndoToast'` and `<UndoToast />` as the last child inside the root flex div. Since UndoToast is fixed-position, placement within the tree does not affect visual output, but being last in the DOM order ensures it renders above any siblings.

**NoteCard.tsx** (modified)

Added `ReminderRow` interface and `reminder` state. Merged the existing `onAiUpdate` useEffect into a combined effect that: (1) loads reminder on mount via `window.api.reminders.getForNote`, (2) subscribes to onAiUpdate for tag updates as before, (3) subscribes to all 4 calendar push channels (onEventPending, onEventSynced, onEventCancelled, onEventFailed) with a `refreshReminder()` helper that re-fetches the DB state for this noteId.

Footer row updated from `justify-between` to a flex row with timestamp left and a chip+aiState cluster right. Chip states:
- pending: amber "⏳ cal" text, title tooltip
- synced (with calendarLink): blue "▸ Cal" button, click calls `window.api.calendar.openLink(calendarLink)`
- failed: red "⚠ cal" text, title tooltip
- cancelled: renders nothing (chip hidden, user already pressed Undo)

**NotesTab.tsx** (modified)

Added `deleteConfirm: { noteId }` and `dontAskAgain` state. `handleDelete` is now async: calls `window.api.calendar.needsDeleteConfirm(noteId)` first. If true, sets `deleteConfirm` to show the modal. If false (note has no linked event, calendar not connected, or user previously ticked "don't ask"), proceeds directly with notes.delete.

`confirmDelete` callback: optionally calls `setDontAskDeleteCalEvent(true)` then `notes.delete`, then clears notes and modal state. Modal JSX rendered as a fixed-inset overlay inside the NotesTab return (same pattern as SettingsPanel), with backdrop click to cancel, "Delete both" confirm button (red), and a "Don't ask again" checkbox.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Missing preload bridge for 3 calendar IPC methods**
- **Found during:** Pre-implementation check of preload/index.ts vs the IPC handlers in main
- **Issue:** `needsDeleteConfirm`, `setDontAskDeleteCalEvent`, `getDontAskDeleteCalEvent` were registered as IPC handlers in `src/main/ipc.ts` (lines 469, 473, 477) and imported from reminderService/tokenStore, but were NOT exposed through `contextBridge.exposeInMainWorld` in `src/preload/index.ts`, and NOT declared in `src/preload/index.d.ts`. Without the bridge, `window.api.calendar.needsDeleteConfirm(id)` in NotesTab would be `undefined` at runtime and typecheck would fail.
- **Fix:** Added three bridge calls to `preload/index.ts` within the calendar object, and three type declarations to `preload/index.d.ts` within the calendar interface.
- **Files modified:** `src/preload/index.ts`, `src/preload/index.d.ts`
- **Commit:** 0a224b3 (bundled with Task 1)

## Accessibility Notes

- `UndoToast`: `role="status"` + `aria-live="polite"` on container. Screen readers announce new toast content without interrupting focus. The Undo/Create/Dismiss buttons are standard `<button>` elements, keyboard-focusable.
- Health dot in GoogleCalendarSection uses `aria-label="health: green/yellow/red"` on the span element.
- Reminder chip "▸ Cal" is a `<button>` (keyboard-reachable). The "⏳ cal" and "⚠ cal" indicators are `<span>` with `title` attribute (not keyboard-reachable, purely informational — acceptable for this small decoration).
- Delete-confirm modal has keyboard-accessible Cancel and Delete both buttons. No focus trap implemented (gap for v2 accessibility pass — modal is short-lived and the backdrop click-to-dismiss works with mouse).

## Manual Smoke Test Status

**Smoke tests 1-5 require a running dev app connected to a real Google account (npm run dev with .env.local configured). Build-mode verification confirms all code paths compile and typecheck.**

| Smoke | Description | Status (dev-mode) |
|-------|-------------|-------------------|
| 1 | Open Settings → Integrations → see red dot + "not connected" | Code complete, untested (no Google account in CI) |
| 2 | Submit reminder note, toast appears, press Undo → chip hidden | Code complete, untested |
| 3 | Submit reminder, let 10s elapse → toast shows ✓ → blue "▸ Cal" chip → click opens browser | Code complete, untested |
| 4 | Connected + synced note → Delete → confirm dialog → tick "Don't ask again" → Delete both → next deletion silent | Code complete, untested |
| 5 | Toggle "Ask before creating events" → submit reminder → confirm mode toast with [Create]/[Dismiss] + 5s timer | Code complete, untested |

Note: Plan 11-07 runs the human-verify checkpoint against an installed build — that is where these smokes are formally evaluated.

## Self-Check: PASSED

Files created:
- src/renderer/src/components/GoogleCalendarSection.tsx: FOUND
- src/renderer/src/components/UndoToast.tsx: FOUND

Files modified:
- src/renderer/src/components/SettingsPanel.tsx: FOUND (GoogleCalendarSection import + Integrations section)
- src/renderer/src/App.tsx: FOUND (UndoToast import + mount)
- src/renderer/src/components/NoteCard.tsx: FOUND (reminder state + combined useEffect + chip footer)
- src/renderer/src/components/NotesTab.tsx: FOUND (deleteConfirm flow + modal JSX)

Commits:
- 0a224b3: feat(11-06): create GoogleCalendarSection + UndoToast components
- f52bc70: feat(11-06): wire GoogleCalendarSection + UndoToast into app; add reminder chip + delete-confirm
