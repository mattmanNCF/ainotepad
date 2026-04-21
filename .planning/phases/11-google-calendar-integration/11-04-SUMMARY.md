---
phase: 11-google-calendar-integration
plan: "04"
subsystem: calendar-reminder-lifecycle
tags: [calendar, reminder, ipc, preload, state-machine]
dependency_graph:
  requires: [11-02, 11-03]
  provides: [reminderService-API, calendar-IPC-lifecycle, preload-subscription-surface]
  affects: [11-05, 11-06]
tech_stack:
  added: []
  patterns: [drizzle-ORM-camelCase-query, Function-indirect-dynamic-import, setTimeout-undo-window, IPC-push-subscription]
key_files:
  created:
    - src/main/calendar/reminderService.ts
  modified:
    - src/main/ipc.ts
    - src/preload/index.ts
    - src/preload/index.d.ts
    - src/main/aiOrchestrator.ts
    - src/main/index.ts
decisions:
  - "getLatestReminderForNote uses drizzle select (not raw SQL) — raw SELECT * returns snake_case breaking calendarSyncStatus on renderer"
  - "getSqlite import removed from reminderService; getLatestReminderForNote upgraded to drizzle to maintain camelCase Reminder type shape"
  - "desc import added from drizzle-orm to support ordering in getLatestReminderForNote"
metrics:
  duration_seconds: 200
  tasks_completed: 2
  files_changed: 6
  completed_date: "2026-04-21"
---

# Phase 11 Plan 04: Reminder Lifecycle Engine Summary

**One-liner:** Reminder state machine with 0.85 confidence gate, 10s auto-undo window (5s confirm-mode), events.insert with extendedProperties.private.notal_note_id, and full IPC push surface for Plan 11-06's UI.

## What Was Built

### reminderService.ts Public API (10 exports + 3 constants)

**Constants (tune here only):**
- `CONFIDENCE_GATE = 0.85` — CAL-COST-01 gate; only reminders at or above this score trigger calendar writes
- `UNDO_WINDOW_MS = 10_000` — CAL-UX-01 auto-mode undo window (10 seconds)
- `CONFIRM_WINDOW_MS = 5_000` — CAL-UX-01 confirm-mode window (5 seconds)

**Exported functions:**
- `setMainWindow(win)` — called from aiOrchestrator.startAiWorker() so service can push to renderer
- `handleNoteReminder(noteId, reminder)` — main entry point; gates on confidence + isConnected + parseReminderDate; inserts pending row; arms timer
- `cancelPendingCreate(reminderId)` — cancels in-progress timer, marks row cancelled; called by calendar:undoCreate IPC
- `confirmPendingCreate(reminderId)` — commits confirm-mode reminder immediately; called by calendar:confirmCreate IPC
- `getLatestReminderForNote(noteId)` — returns most recent Reminder row for a note (or null); consumed by reminders:getForNote IPC + Plan 11-06
- `cancelAllTimersForShutdown()` — clears all in-memory timers on before-quit; called from index.ts

### 4 IPC Push Channels (renderer subscriptions)

| Channel | Trigger | Payload |
|---|---|---|
| `calendar:eventPending` | Row inserted, timer armed | noteId, reminderId, eventTitle, timestampUtc, originalTz, mode, undoDeadlineMs |
| `calendar:eventSynced` | events.insert succeeded | noteId, reminderId, eventId, eventTitle, timestampUtc, calendarLink |
| `calendar:eventCancelled` | Undo pressed or confirm-mode timeout | noteId, reminderId, reason |
| `calendar:eventFailed` | events.insert threw | noteId, reminderId, error |

### 3 New IPC Invoke Channels

| Channel | Handler | Purpose |
|---|---|---|
| `calendar:undoCreate` | cancelPendingCreate | Undo pending event before 10s window expires |
| `calendar:confirmCreate` | confirmPendingCreate | Commit confirm-mode event within 5s window |
| `reminders:getForNote` | getLatestReminderForNote | Fetch current reminder status for NoteCard chip |

### Preload Surface (window.api extensions)

- `calendar.undoCreate(reminderId)` — invoke
- `calendar.confirmCreate(reminderId)` — invoke
- `calendar.onEventPending(cb)` — subscription (returns unsubscribe fn)
- `calendar.onEventSynced(cb)` — subscription
- `calendar.onEventCancelled(cb)` — subscription
- `calendar.onEventFailed(cb)` — subscription
- `reminders.getForNote(noteId)` — invoke

### reminders.calendar_sync_status State Machine

```
[AI worker emits reminder payload]
         |
    handleNoteReminder()
         |
    confidence >= 0.85 AND isConnected() AND parseReminderDate != null?
         |YES                                |NO
    INSERT row (pending)              return (silent, no side effects)
         |
    push calendar:eventPending
         |
    confirmBeforeCreate?
     |YES                  |NO (auto mode)
    5s timeout             10s setTimeout
    (no auto-commit)       |
         |                 |
    user confirms?     user undoes?
     |YES  |NO(timeout) |YES        |NO(fires)
     |     |            |           |
     |   mark        clearTimeout   events.insert
     |  cancelled    mark cancelled      |
     |              push eventCancelled  |success    |error
     |                                  |           |
   events.insert                   mark synced   mark failed
         |                         push eventSynced  push eventFailed
    mark synced
    push eventSynced
```

Final status values: `pending | synced | cancelled | failed`

### Confidence Gate Location

`CONFIDENCE_GATE = 0.85` is a const at the top of `reminderService.ts` (line 13). The gate is enforced at the consumer boundary (reminderService) NOT in the AI worker — this satisfies CAL-COST-01 architecture and the plan's trap #6 constraint. Grep: `grep "confidence < CONFIDENCE_GATE" src/main/calendar/reminderService.ts` returns exactly 1 hit.

### Note to Plan 11-05 (delete cascade)

Every event inserted by this service carries `extendedProperties.private.notal_note_id = <noteId>`. The delete cascade in Plan 11-05 should query:
```typescript
calendar.events.list({
  calendarId: 'primary',
  privateExtendedProperty: [`notal_note_id=${noteId}`],
})
```
Then delete each returned event before deleting the note.

### Note to Plan 11-06 (NoteCard chip)

Chip states map to `reminders.calendarSyncStatus` values as follows:
- `'pending'` — amber timer chip (show countdown, show Undo button)
- `'synced'` — blue link chip (show calendar link, event title)
- `'failed'` — red error chip (show error message)
- `'cancelled'` — hidden (no chip rendered)

Plan 11-06 can subscribe via `window.api.calendar.onEventPending/Synced/Cancelled/Failed` for live updates, and call `window.api.reminders.getForNote(noteId)` on initial render to hydrate existing state.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed getLatestReminderForNote to use drizzle instead of raw SQL**
- **Found during:** Task 1 (caught by advisor pre-work call)
- **Issue:** Plan specified `getSqlite().prepare('SELECT * FROM reminders WHERE note_id = ? ...')` which returns snake_case column names (`note_id`, `calendar_sync_status`), but casts to `Reminder` type (camelCase: `noteId`, `calendarSyncStatus`). The cast would silently lie — Plan 11-06's NoteCard chip would read `.calendarSyncStatus` and get `undefined`, causing every reminder to appear hidden.
- **Fix:** Replaced with `getDb().select().from(reminders).where(eq(reminders.noteId, noteId)).orderBy(desc(reminders.createdAt)).limit(1).get()` — drizzle maps column names to camelCase automatically. Added `desc` to drizzle-orm imports; removed unused `getSqlite` import.
- **Files modified:** `src/main/calendar/reminderService.ts`
- **Commit:** 21db074

**2. [Rule 1 - Bug] Removed unused `getSqlite` import**
- **Found during:** Task 1 typecheck (`TS6133: getSqlite declared but its value is never read`)
- **Fix:** Removed `getSqlite` from db import since `getLatestReminderForNote` was upgraded to use drizzle
- **Files modified:** `src/main/calendar/reminderService.ts`
- **Commit:** 21db074 (same commit, pre-commit fix)

**3. [Rule 1 - Bug] Removed unused `and`, `inArray` imports from plan template**
- **Found during:** Task 1 — plan's import line `{ eq, and, inArray }` included `and` and `inArray` which are never used in the file
- **Fix:** Import uses only `{ eq, desc }` — avoids potential `noUnusedLocals` typecheck failure
- **Files modified:** `src/main/calendar/reminderService.ts`
- **Commit:** 21db074

## SQLite Round-Trip Note for confidence REAL-in-INTEGER Column

The `reminders` schema uses `integer('confidence', { mode: 'number' })` in drizzle (no `real()` helper — drizzle-orm/sqlite-core lacks one). The DDL uses `REAL NOT NULL`. SQLite's dynamic typing bridges the gap at write time, but when drizzle reads back via `$inferSelect`, the TypeScript type is `number` (correct). When written as `0.87`, SQLite stores it as REAL and returns it as a float — no precision loss for confidence scores in the 0-1 range.

## Self-Check: PASSED

All 6 modified files verified on disk. Both task commits verified in git log:
- 21db074: reminderService.ts
- c07d8e3: IPC wiring + preload + aiOrchestrator + index.ts

`npm run typecheck` passes. `npm run build` succeeds.
