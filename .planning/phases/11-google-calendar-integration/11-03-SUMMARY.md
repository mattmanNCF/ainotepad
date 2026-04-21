---
phase: 11-google-calendar-integration
plan: "03"
subsystem: ai-worker-calendar-pipeline
tags: [calendar, ai-worker, timezone, chrono-node, luxon, reminder-parsing]
dependency_graph:
  requires: [11-01]
  provides: [reminder-field-pipeline, parseReminderDate, systemIanaZone]
  affects: [aiWorker.ts, aiOrchestrator.ts, preload/index.ts, preload/index.d.ts]
tech_stack:
  added: [tsx (devDep, test runner)]
  patterns: [chrono.parse + Luxon DateTime.fromObject for IANA-correct timezone conversion, Function() indirect dynamic import to bypass rollup static analysis]
key_files:
  created:
    - src/main/calendar/reminderParser.ts
    - test/reminderParser.test.mjs
  modified:
    - src/main/aiWorker.ts
    - src/main/aiOrchestrator.ts
    - src/preload/index.ts
    - src/preload/index.d.ts
    - package.json
decisions:
  - "Used chrono.parse() + Luxon DateTime.fromObject instead of chrono.parseDate() — parseDate interprets wall-clock in host TZ not userIanaZone, causing test failures on non-LA hosts"
  - "Used Function('p', 'return import(p)') indirect dynamic import for reminderService to bypass rollup static module resolution at build time"
  - "ts-expect-error was not needed with Function() trick — no TypeScript error is generated"
metrics:
  duration: ~25 minutes
  completed: "2026-04-21"
  tasks_completed: 3
  files_modified: 7
requirements_satisfied: [CAL-COST-01, CAL-TZ-01]
---

# Phase 11 Plan 03: Reminder Parser + AI Worker Piggybacking Summary

**One-liner:** Zero-cost reminder detection piggybacking on the existing AI note call with a Luxon+chrono IANA timezone triple converter passing an 8-case test matrix including Pacific/Chatham and DST crossover.

---

## What Was Built

### Task 1: reminderParser.ts + 5-zone test matrix

`src/main/calendar/reminderParser.ts` exports:

- `parseReminderDate(dateText, userIanaZone, referenceDate?)` — converts natural-language date text + IANA zone into the authoritative `{timestamp_utc, original_tz, original_text}` triple
- `systemIanaZone()` — returns the system IANA zone via `Intl.DateTimeFormat().resolvedOptions().timeZone`

**Key architectural deviation from plan template:** The plan code used `chrono.parseDate()` which interprets absolute date strings in the host system's local timezone — not in `userIanaZone`. This would cause all timezone tests to fail on any machine not in the target zone (e.g., UTC host testing LA times). The correct pattern:

1. Use `chrono.parse()` (not `parseDate`) to get structured `ParsedResult` objects
2. Extract wall-clock components via `results[0].start.get('year')`, `get('month')`, etc.
3. Construct `DateTime.fromObject({ year, month, day, hour, minute, second }, { zone: userIanaZone })` in Luxon
4. Call `.toUTC().toISO()` for the authoritative UTC epoch

This correctly handles unusual offsets (Pacific/Chatham +12:45) and DST transitions without any special casing.

**Test matrix (`npm run test:reminder`) — 8 tests, all pass:**

| Test | Zone | Input | Assertion |
|------|------|-------|-----------|
| UTC round-trip | UTC | `2026-06-20 10:30` | `back = 2026-06-20 10:30` |
| LA PDT | America/Los_Angeles | `2026-06-20 15:00` | `back = 2026-06-20 15:00` |
| Kolkata UTC+5:30 | Asia/Kolkata | `2026-06-20 10:30` | `back = 2026-06-20 10:30` |
| Pacific/Chatham +12:45 | Pacific/Chatham | `2026-06-20 09:15` | `back = 2026-06-20 09:15`, `isValid = true` |
| DST crossover | America/Los_Angeles | `2026-11-01 09:00` | `back = 2026-11-01 09:00 PST` (UTC-8 post-DST) |
| Gibberish | UTC | `asdfghjkl` | `null` |
| Invalid zone | `Not/A_Real_Zone_Blah` | `2026-06-20 10:30` | `null` |
| Relative "tomorrow at 9am" | America/Los_Angeles | `tomorrow at 9am` (ref: 2026-06-15) | `back = 2026-06-16 09:00` |

### Task 2: aiWorker.ts — 4 surgical edits

All edits are self-contained; zero new model calls:

1. **buildPrompt()** — Added 6th task instruction:
   ```
   6. **reminder**: If the note contains a specific date/time-bound intent the user is likely trying to remember ("remind me to X on Friday", "meeting Tuesday 3pm", "call Mom tomorrow") return {"text":"concise reminder title","date_text":"exact date phrase from the note","confidence":0.0..1.0}. Confidence reflects BOTH certainty of reminder intent AND date precision — high only for specific datetimes. Return null if no reminder is present.
   ```
   JSON example line extended to include `"reminder":null`.

2. **drain() parse type** — Added `reminder: { text: string; date_text: string; confidence: number } | null`

3. **Success postMessage** — Added `reminder: parsed.reminder ?? null`. Fail branch: `reminder: null` (consistent message shape).

4. **Local model grammar** — Extended `createGrammarForJsonSchema` with `reminder: { oneOf: [{ type: 'object', required: ['text', 'date_text', 'confidence'] }, { type: 'null' }] }` per Pitfall 6 from RESEARCH.md.

### Task 3: aiOrchestrator.ts + preload extension

- Destructured `reminder` from `event.data`
- Extended `note:aiUpdate` push: `reminder: reminder ?? null`
- Added guarded dynamic-import hook for reminderService (Plan 11-04): `Function('p', 'return import(p)')` bypasses rollup static analysis. The catch block swallows MODULE_NOT_FOUND until 11-04 ships.
- Extended `onAiUpdate` callback type in both `preload/index.ts` and `preload/index.d.ts`
- `updateNoteAiResult()` signature: unchanged (still 6 positional args)

---

## Reminder JSON Shape

The reminder object flowing through the full pipeline:

```typescript
// Emitted by AI worker when reminder intent detected:
{ text: string; date_text: string; confidence: number } | null

// Flowing through note:aiUpdate push to renderer:
reminder: { text: "Call Mom", date_text: "tomorrow", confidence: 0.92 } | null

// Converted by Plan 11-04's reminderService into:
{ timestamp_utc: "2026-04-22T17:00:00.000Z", original_tz: "America/New_York", original_text: "tomorrow" }
```

---

## What Plan 11-04 is Responsible For

This plan deliberately does NOT implement:
- **Confidence gate**: `confidence >= 0.85` (CAL-COST-01 50-note corpus requirement) — in reminderService
- **isConnected() check**: Only create events if calendar is connected — in reminderService
- **10s undo lifecycle** (CAL-UX-01): `setTimeout(10_000)` before committing `events.insert` — in reminderService
- **reminders table insertion** and `calendar_sync_status` tracking — in reminderService

---

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed chrono.parseDate() host-TZ interpretation for absolute dates**

- **Found during:** Task 1 (pre-implementation advisor review)
- **Issue:** Plan template used `chrono.parseDate(dateText, anchor.toJSDate())` — this interprets `"2026-06-20 15:00"` in the host's local TZ, not in `userIanaZone`. Tests would pass only on hosts in the target zone.
- **Fix:** Used `chrono.parse()` to extract components, then `DateTime.fromObject({...}, { zone: userIanaZone })` in Luxon to construct the correct UTC epoch.
- **Files modified:** `src/main/calendar/reminderParser.ts`
- **Commit:** 7a6dcbf

**2. [Rule 3 - Blocking] Fixed rollup static import resolution failure in build**

- **Found during:** Task 3 (build verification)
- **Issue:** `await import('./calendar/reminderService.js')` causes rollup to resolve the path statically at build time → `Could not resolve "./calendar/reminderService.js"` build failure. Both `@ts-expect-error` and `/* @vite-ignore */` are TypeScript-level suppressions only; rollup resolves the path regardless.
- **Fix:** Replaced with `Function('p', 'return import(p)')(__dirname + '/calendar/reminderService.js')` — this is opaque to rollup's static analysis, executes the dynamic import at runtime only.
- **Files modified:** `src/main/aiOrchestrator.ts`
- **Commit:** 555dfd5

---

## Chrono-node Edge Cases Encountered

- **`chrono.parse()` returns an array** (not a single result) — take `results[0]`
- **Component fallbacks**: When a component is not present in the text (e.g., `hour` is implied), `c.get('hour')` still returns the implied value. The `?? 0` fallback is only needed when the component is truly absent (e.g., parsing a date-only string with no time).
- **Pacific/Chatham**: No special handling needed — `DateTime.fromObject({...}, { zone: 'Pacific/Chatham' })` correctly applies the +12:45/+13:45 offset. Luxon's bundled IANA database covers it.
- **DST crossover (Nov 1 2026 LA)**: `DateTime.fromObject({ year: 2026, month: 11, day: 1, hour: 9, minute: 0 }, { zone: 'America/Los_Angeles' })` correctly returns PST (UTC-8) because DST ended at 02:00 that morning. No manual offset math needed.

---

## Self-Check

Files verified to exist:
- src/main/calendar/reminderParser.ts: FOUND
- test/reminderParser.test.mjs: FOUND
- src/main/aiWorker.ts: FOUND (modified)
- src/main/aiOrchestrator.ts: FOUND (modified)
- src/preload/index.ts: FOUND (modified)
- src/preload/index.d.ts: FOUND (modified)

Commits verified:
- 7a6dcbf: feat(11-03): add reminderParser.ts with 5-zone test matrix
- 63b474a: feat(11-03): extend aiWorker with reminder field in prompt, parse type, grammar, and postMessage
- 555dfd5: feat(11-03): forward reminder from aiOrchestrator and extend note:aiUpdate push

## Self-Check: PASSED
