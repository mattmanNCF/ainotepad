---
phase: 08-connections-digest-improvements
plan: 03
subsystem: digest
tags: [digest, scheduler, patterns-tab, reliability]
dependency_graph:
  requires: []
  provides: [rolling-week-window, weekly-digest-preload]
  affects: [src/main/digestScheduler.ts, src/renderer/src/components/PatternsTab.tsx]
tech_stack:
  added: []
  patterns: [calendar-aligned rolling window, mount-time IPC preload]
key_files:
  created: []
  modified:
    - src/main/digestScheduler.ts
    - src/renderer/src/components/PatternsTab.tsx
decisions:
  - getRollingWeekStart uses local midnight via new Date(y, m, d-7, 0,0,0,0) — avoids UTC drift for calendar-day alignment
  - Weekly pre-load uses getLatest check before generate call — avoids unnecessary regeneration if digest already exists
  - setGenerating(true) on silent background generation — reuses existing Generating... spinner with no new UI code needed
metrics:
  duration: ~4 minutes
  completed: "2026-04-18"
  tasks_completed: 2
  files_modified: 2
---

# Phase 08 Plan 03: Digest Reliability Fixes Summary

Calendar-aligned weekly rolling window (getRollingWeekStart) + mount-time weekly digest pre-load in PatternsTab.

## What Was Built

Two targeted reliability fixes for the Patterns tab digest system:

1. **getRollingWeekStart()** — new function in digestScheduler.ts that returns midnight (local time) 7 calendar days ago as an ISO string. The weekly `periodStart` in both `maybeDispatchDigest` and `forceScheduleDigest` now uses this instead of `Date.now() - 168h`. This produces a clean day-aligned rolling window: on Day 8, the window covers Day 1 midnight to Day 8 midnight; on Day 9, Day 2 midnight to Day 9 midnight.

2. **Weekly threshold bumped to 22h** in `checkAndScheduleDigest` — from 20h to 22h — ensuring at most one regeneration per day with margin for launch-time variance.

3. **Mount-time weekly pre-load** in PatternsTab.tsx — the mount `useEffect` now calls `window.api.digest.getLatest('weekly')` immediately after `loadDigest('daily')`. If the result is null (no weekly digest exists), it silently calls `window.api.digest.generate('weekly')` and sets `generating: true` to show the existing "Generating..." spinner. The existing `onUpdated` handler already clears the generating state when the digest arrives.

## Commits

| Hash | Description |
|------|-------------|
| 1a128a7 | feat(08-03): add getRollingWeekStart and calendar-aligned weekly periodStart |
| e98abde | feat(08-03): pre-load weekly digest on Patterns tab mount |

## Success Criteria Verification

1. `getRollingWeekStart()` function present in digestScheduler.ts — confirmed via grep
2. `maybeDispatchDigest` uses `getRollingWeekStart()` for weekly periodStart — confirmed (line 94-96)
3. `forceScheduleDigest` uses `getRollingWeekStart()` for weekly periodStart — confirmed (line 130-132)
4. Weekly threshold in `checkAndScheduleDigest` is 22 — confirmed (line 161)
5. PatternsTab mount useEffect calls `getLatest('weekly')` and `generate('weekly')` if null — confirmed (lines 57, 61)
6. `npm run build` completes without TypeScript errors — confirmed (built in 3.04s)

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- src/main/digestScheduler.ts: FOUND (modified, 163 lines)
- src/renderer/src/components/PatternsTab.tsx: FOUND (modified)
- Commit 1a128a7: FOUND
- Commit e98abde: FOUND
