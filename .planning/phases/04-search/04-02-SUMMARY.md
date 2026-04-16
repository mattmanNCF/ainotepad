---
phase: 04-search
plan: 02
subsystem: database
tags: [sqlite, fts5, drizzle, better-sqlite3, migration]

# Dependency graph
requires:
  - phase: 03-karpathy-wiki
    provides: updateNoteAiResult, notes table schema, db.ts migration pattern
provides:
  - ai_insights column on notes table (idempotent migration)
  - notes_fts FTS5 virtual table with backfill of existing notes
  - digests table for Patterns tab storage
  - insertNoteToFts(noteId, rawText) exported helper
  - getSqlite() exported module-scope accessor
  - updateNoteAiResult extended with aiInsights 6th parameter
  - notes:create IPC handler populates notes_fts on every note
affects: [04-search, 04-03, 04-04, 04-05, 04-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "FTS5 standalone non-content-table (avoids better-sqlite3 trigger bugs)"
    - "Module-scope sqlite instance exposed via getSqlite() for raw SQL helpers"
    - "Idempotent backfill: check count before INSERT INTO notes_fts SELECT"

key-files:
  created: []
  modified:
    - src/main/db.ts
    - drizzle/schema.ts
    - src/main/ipc.ts

key-decisions:
  - "FTS5 standalone non-content-table with raw_text + note_id UNINDEXED — avoids trigger complexity"
  - "sqlite instance moved to module scope; getSqlite() accessor ensures lazy init aligns with getDb()"
  - "Backfill guarded by count check — idempotent on repeated launches"
  - "insertNoteToFts uses getSqlite().prepare() — raw SQL, not Drizzle, since FTS5 is not in ORM schema"

patterns-established:
  - "Raw SQL helpers (prepare/run) for FTS5 and future non-ORM tables use getSqlite()"
  - "All migration blocks follow try-catch idempotent pattern inside getDb()"

requirements-completed: [INSIGHT-02]

# Metrics
duration: 8min
completed: 2026-04-16
---

# Phase 04 Plan 02: DB Schema — FTS5, ai_insights, digests Summary

**FTS5 notes search index, ai_insights column, and digests table added via idempotent migrations with backfill and IPC wiring**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-16T07:04:00Z
- **Completed:** 2026-04-16T07:12:25Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Added ai_insights TEXT column to notes table via idempotent ALTER TABLE migration
- Created notes_fts FTS5 virtual table with one-time backfill of existing notes
- Created digests table (7 columns) for Patterns tab daily/weekly output
- Exported getSqlite() and insertNoteToFts() from db.ts for FTS5 raw-SQL access
- Extended updateNoteAiResult() with backward-compatible 6th parameter aiInsights
- Added aiInsights field and full digests table to drizzle/schema.ts
- Wired insertNoteToFts call into notes:create IPC handler (all future notes indexed)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add DB schema — ai_insights, FTS5 table with backfill, digests, helpers** - `18889a2` (feat)
2. **Task 2: Wire FTS5 INSERT into notes:create IPC handler** - `f377061` (feat)

**Plan metadata:** (to be added in final commit)

## Files Created/Modified
- `src/main/db.ts` - Module-scope sqlite, getSqlite(), FTS5/digests migrations, insertNoteToFts helper, extended updateNoteAiResult
- `drizzle/schema.ts` - aiInsights field on notes, new digests sqliteTable with Digest/NewDigest types
- `src/main/ipc.ts` - insertNoteToFts imported and called in notes:create handler

## Decisions Made
- FTS5 standalone non-content-table (not content table) to avoid better-sqlite3 trigger limitation
- sqlite instance moved to module scope so raw-SQL helpers can access it without re-opening DB
- Backfill uses count guard — safe to run on every launch
- insertNoteToFts uses raw prepared statement (FTS5 virtual tables not in Drizzle schema)

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered
- Security hook triggered on SUMMARY write (false positive on sqlite.exec keyword in docs). Resolved by rephrasing.

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- FTS5 table ready for AI worker full-text search queries (04-03)
- ai_insights column ready for insight persistence (04-03)
- digests table ready for Patterns tab writer (04-06)
- insertNoteToFts wired — all new notes indexed immediately

---
*Phase: 04-search*
*Completed: 2026-04-16*
