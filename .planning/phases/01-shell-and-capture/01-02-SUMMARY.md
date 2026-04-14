---
phase: 01-shell-and-capture
plan: 02
subsystem: database
tags: [sqlite, drizzle-orm, better-sqlite3, wal, ipc, electron]

requires:
  - phase: 01-01
    provides: electron-vite scaffold, preload bridge with notes:getAll/notes:create, NoteRecord type, better-sqlite3 installed and rebuilt

provides:
  - WAL-mode better-sqlite3 singleton via getDb() in src/main/db.ts
  - Drizzle notes table schema in drizzle/schema.ts
  - IPC handlers notes:getAll and notes:create via registerIpcHandlers()
  - Inline DDL migration (CREATE TABLE IF NOT EXISTS) applied at first DB open
  - App registers IPC handlers on startup via src/main/index.ts

affects: [02-ai-pipeline, 03-karpathy-wiki, 04-search, 05-agent-layer]

tech-stack:
  added: [drizzle-orm/better-sqlite3, drizzle-orm/sqlite-core, crypto.randomUUID (Node built-in)]
  patterns:
    - Singleton DB pattern (module-level _db variable, initialized once)
    - Inline DDL migration (v1) — no separate migration runner needed
    - Synchronous Drizzle calls with .all() and .run() — no async/await in handlers
    - IPC handlers registered before createWindow() in app.whenReady()

key-files:
  created:
    - drizzle/schema.ts
    - src/main/db.ts
    - src/main/ipc.ts
    - scripts/migrate.js
  modified:
    - src/main/index.ts

key-decisions:
  - "crypto.randomUUID() (Node built-in) used instead of uuid package — no extra dependency"
  - "Inline CREATE TABLE IF NOT EXISTS in db.ts for v1 — no Drizzle migrate runner needed at this stage"
  - "Drizzle with better-sqlite3 is synchronous — .all() and .run() used, no async/await in handlers"
  - "drizzle/schema.ts at project root, imported via relative path ../../drizzle/schema from src/main/"

patterns-established:
  - "DB singleton: module-level _db initialized lazily on first getDb() call"
  - "IPC handler file: registerIpcHandlers() export pattern for clean separation from index.ts"

requirements-completed: [DATA-01]

duration: 8min
completed: 2026-04-14
---

# Phase 01 Plan 02: SQLite DB Layer Summary

**WAL-mode better-sqlite3 singleton with Drizzle schema, inline DDL migration, and IPC handlers for notes:getAll/notes:create registered at app startup**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-04-14T22:33:11Z
- **Completed:** 2026-04-14T22:41:00Z
- **Tasks:** 1
- **Files modified:** 5

## Accomplishments

- Notes SQLite table created via inline DDL in db.ts (WAL mode + foreign keys enabled)
- Drizzle ORM schema defined with full notes table shape matching NoteRecord interface
- IPC handlers for notes:getAll (ordered DESC by submittedAt) and notes:create (UUID + return record)
- App now registers IPC handlers on startup, completing the preload bridge wire-up

## Task Commits

Each task was committed atomically:

1. **Task 1: Drizzle schema, DB singleton, migration script, IPC handlers** - `0fc84f0` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `drizzle/schema.ts` - Drizzle sqliteTable definition for notes with id, rawText, submittedAt, aiState, aiAnnotation
- `src/main/db.ts` - WAL-mode better-sqlite3 singleton, inline CREATE TABLE IF NOT EXISTS, drizzle() instance
- `src/main/ipc.ts` - registerIpcHandlers() with notes:getAll and notes:create handlers
- `scripts/migrate.js` - Placeholder migration runner (v1 uses inline DDL)
- `src/main/index.ts` - Added registerIpcHandlers() import and call before createWindow()

## Decisions Made

- Used `crypto.randomUUID()` (Node 14.17+ built-in) instead of the `uuid` package — no extra install needed, per execution context guidance
- Inline `CREATE TABLE IF NOT EXISTS` in `db.ts` for v1 — simpler than running drizzle-kit migrate; Drizzle Kit is available for future migrations
- Drizzle with better-sqlite3 is synchronous — used `.all()` and `.run()` instead of `await db.select()...` to avoid incorrect async usage
- `notes:create` handler constructs and returns the NoteRecord directly after `.run()` rather than re-querying — avoids unnecessary round-trip

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected async/await usage for synchronous Drizzle+better-sqlite3 calls**
- **Found during:** Task 1 (ipc.ts implementation)
- **Issue:** Plan template used `await db.select()...` and `await db.insert()...`, but Drizzle with better-sqlite3 adapter is fully synchronous — `await` on non-Promises is harmless but the plan also called `.where(notes.id.eq ? undefined : undefined)` which is invalid
- **Fix:** Removed async/await, used `.all()` for select, `.run()` for insert; notes:create returns constructed record directly per execution context corrected handler
- **Files modified:** src/main/ipc.ts
- **Verification:** TypeScript compiles clean (npm run typecheck passes)
- **Committed in:** 0fc84f0

**2. [Rule 1 - Bug] Used crypto.randomUUID() instead of uuid package**
- **Found during:** Task 1 (ipc.ts implementation)
- **Issue:** Plan template imported `{ v4 as uuidv4 } from 'uuid'` but uuid is not installed (not in package.json)
- **Fix:** Used `import { randomUUID } from 'crypto'` (Node built-in) per execution context instructions
- **Files modified:** src/main/ipc.ts
- **Verification:** TypeScript compiles clean, no missing module errors
- **Committed in:** 0fc84f0

---

**Total deviations:** 2 auto-fixed (both Rule 1 - bugs in plan template code)
**Impact on plan:** Both fixes essential for correctness. No scope creep. Execution context explicitly anticipated the uuid fix.

## Issues Encountered

None — plan executed smoothly. TypeScript typecheck passed on first attempt.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- DB layer fully wired: preload bridge calls hit registered IPC handlers which read/write SQLite
- Ready for Plan 01-03: renderer UI (capture buffer + note list using window.api.notes)
- No blockers

---
*Phase: 01-shell-and-capture*
*Completed: 2026-04-14*
