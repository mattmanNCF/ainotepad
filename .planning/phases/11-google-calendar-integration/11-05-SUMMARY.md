---
phase: 11-google-calendar-integration
plan: "05"
subsystem: calendar-cascade
tags: [calendar, delete-cascade, ipc, preload, CAL-DEL-01]
dependency_graph:
  requires: [11-04]
  provides: [cascadeCalendarEventForNote, needDeleteConfirm, calendar:needsDeleteConfirm, calendar:setDontAskDeleteCalEvent, calendar:getDontAskDeleteCalEvent]
  affects: [notes:delete handler, reminderService.ts, ipc.ts, preload surface]
tech_stack:
  added: []
  patterns: [extendedProperties-reconciliation, non-fatal-cascade, orphan-safe-delete]
key_files:
  created: []
  modified:
    - src/main/calendar/reminderService.ts
    - src/main/ipc.ts
    - src/preload/index.ts
    - src/preload/index.d.ts
decisions:
  - cascadeCalendarEventForNote queries Google's privateExtendedProperty index (not local reminders.event_id) as source of truth — survives reinstall and DPAPI mismatch
  - 404 and 410 on events.delete counted as deletedCount++ (already-gone = successfully deleted)
  - cascadeCalendarEventForNote never re-throws — local note deletion always proceeds
  - pendingTimers cleared for matching noteId to prevent dangling setTimeouts after note gone
metrics:
  duration_minutes: 8
  completed_date: "2026-04-21"
  tasks_completed: 1
  tasks_total: 1
  files_modified: 4
---

# Phase 11 Plan 05: Delete Cascade (CAL-DEL-01) Summary

Wire the delete-cascade half of CAL-DEL-01: Google Calendar events linked via `extendedProperties.private.notal_note_id` are deleted when the associated note is deleted, with orphan reconciliation via live Google query (not local cache).

## What Was Built

### 2 new reminderService exports

**`needDeleteConfirm(noteId: string): Promise<boolean>`**
- Returns false immediately if calendar not connected (nothing to cascade)
- Returns false if `getDontAskDeleteCalEvent()` is true (user set "don't ask again")
- Otherwise queries `calendar.events.list` with `privateExtendedProperty: [notal_note_id=<id>]`, `maxResults: 1`
- Returns true only if at least one linked event exists in Google's index
- On error: logs warning and returns false (don't block delete or prompt unnecessarily)
- Error contract: never re-throws

**`cascadeCalendarEventForNote(noteId: string): Promise<{ deletedCount: number; errors: string[] }>`**
- Returns `{ deletedCount: 0, errors: [] }` immediately if calendar not connected
- Step 1: `buildCalendarClient()` — on failure returns zero-result safely
- Step 2: `events.list` with `privateExtendedProperty: [notal_note_id=<id>]`, `maxResults: 10` — on failure appends to errors and returns early (partial result)
- Step 3: best-effort `events.delete` for each event id — 404/410 counted as already-deleted (deletedCount++); other errors appended to errors array with event id
- Step 4: clears matching `pendingTimers` entries (by noteId) — prevents dangling in-flight create timers after note gone
- Error contract: NEVER re-throws — all errors returned in `errors` array

Source of truth design: Google's `privateExtendedProperty` index is queried directly — we do NOT rely on `reminders.event_id` local column. This correctly handles: reinstall (DPAPI mismatch wiped token), orphan events from prior installs, notes with multiple linked events (up to 10 per cascade).

### 3 new IPC handlers (ipc.ts)

Added immediately after `calendar:confirmCreate`:

| Channel | Handler | Notes |
|---------|---------|-------|
| `calendar:needsDeleteConfirm` | `async (noteId) => await needDeleteConfirm(noteId)` | Returns boolean |
| `calendar:setDontAskDeleteCalEvent` | `(value) => setDontAskDeleteCalEvent(value)` | Sync write to conf |
| `calendar:getDontAskDeleteCalEvent` | `() => getDontAskDeleteCalEvent()` | Sync read from conf |

### notes:delete handler modification (ipc.ts)

Exact insertion site: line 151 (before the existing `// Delete the note (+ notes_fts)` comment + `deleteNote(id)` call at line 173).

```typescript
// Cascade: delete any Google Calendar events linked via notal_note_id
// BEFORE deleting the note locally — if something explodes, we can retry.
try {
  const cascadeRes = await cascadeCalendarEventForNote(id)
  if (cascadeRes.deletedCount > 0) { console.log(...) }
  if (cascadeRes.errors.length > 0) { console.warn(...) }
} catch (err) {
  // Defence-in-depth — should never throw but catch anyway
  console.error(...)
}
// Delete the note (+ notes_fts)
deleteNote(id)
```

Existing handler behavior unchanged: wiki_files lookup, orphaned wiki cleanup, tag-color pruning all execute as before.

### Preload surface (index.ts + index.d.ts)

3 new entries added to `window.api.calendar`:
- `needsDeleteConfirm(noteId: string): Promise<boolean>`
- `setDontAskDeleteCalEvent(value: boolean): Promise<void>`
- `getDontAskDeleteCalEvent(): Promise<boolean>`

## Key Design Notes

- **Orphan reconciliation is live-queried**: Plan 11-06 can call `needsDeleteConfirm` before the delete, and the cascade itself re-queries Google at delete time. The local `reminders.event_id` column is intentionally not used as the source of truth.
- **Offline deletion**: If Google is unreachable, `cascadeCalendarEventForNote` returns `{ deletedCount: 0, errors: ['events.list: ...'] }`. The local note deletes normally. Remnant events require manual deletion — documented gap acceptable for v0.3.1.
- **"Don't ask again" flag**: `getDontAskDeleteCalEvent()` is checked in `needDeleteConfirm`. Once set, all future confirmation queries return false (silent cascade). Plan 11-06 sets this via `window.api.calendar.setDontAskDeleteCalEvent(true)` from the confirmation dialog's "don't ask again" checkbox.

## Smoke Case Status (manual — not automated in this plan)

| Case | Expected | Implementation |
|------|----------|---------------|
| Normal cascade: note with linked event → delete | Event gone from Google Calendar; console shows "cascaded 1 calendar event(s)" | cascadeCalendarEventForNote queries + deletes |
| Orphan cascade: manually-created event with notal_note_id="fake-123" | Event deleted when note "fake-123" deleted | Live Google query finds it regardless of local state |
| Offline cascade: delete while wifi off | Local note deletes; no hang; remnant event logged | cascade returns early with error; try/catch in handler continues to deleteNote |
| Don't-ask-again set: flag=true | needDeleteConfirm returns false; no prompt; cascade runs silently | getDontAskDeleteCalEvent() checked first |
| Don't-ask-again unset: flag=false, no linked events | needDeleteConfirm returns false; no prompt (nothing to cascade) | events.list returns 0 items → false |

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- `src/main/calendar/reminderService.ts` modified: FOUND (exports cascadeCalendarEventForNote + needDeleteConfirm)
- `src/main/ipc.ts` modified: FOUND (cascade before deleteNote + 3 new handlers)
- `src/preload/index.ts` modified: FOUND (3 new calendar entries)
- `src/preload/index.d.ts` modified: FOUND (3 new ambient type entries)
- Commit 75e3fef: FOUND
- `npm run typecheck`: PASSED
- `npm run build`: PASSED
