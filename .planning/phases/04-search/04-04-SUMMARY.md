---
phase: 04-search
plan: 04
subsystem: ai-pipeline
tags: [digest, brave-search, word-cloud, sqlite, electron-ipc]

requires:
  - phase: 04-search-04-03
    provides: aiWorker with digest-task stub, FTS5 index, getWorkerPort()
  - phase: 04-search-04-02
    provides: digests table in SQLite, getSqlite() accessor

provides:
  - digestScheduler.ts: checkAndScheduleDigest(), buildWordCloudData(), buildStats()
  - aiWorker.ts: full digest-task handler with Brave Search + narrative generation via AI
  - aiOrchestrator.ts: digest-result handler persisting to DB and notifying renderer
  - ipc.ts: getBraveKey() stub (returns null, placeholder for 04-05 safeStorage decrypt)
  - index.ts: checkAndScheduleDigest() called on app launch after startAiWorker()

affects: [04-05-brave-key, 04-07-patterns-ui]

tech-stack:
  added: []
  patterns:
    - "digest pipeline: main process builds word cloud + stats, worker generates narrative, orchestrator stores result"
    - "fire-and-forget digest generation: handleDigestTask not queued with note tasks"
    - "best-effort Brave Search: returns empty string on any error, skipped silently when no key"
    - "callAIWithPrompt(): provider-agnostic AI call without buildPrompt/grammar enforcement"

key-files:
  created:
    - src/main/digestScheduler.ts
  modified:
    - src/main/aiWorker.ts
    - src/main/aiOrchestrator.ts
    - src/main/ipc.ts
    - src/main/index.ts

key-decisions:
  - "Word cloud built in main process (digestScheduler) not worker — data aggregation stays with DB access"
  - "handleDigestTask fires as fire-and-forget Promise (not queued with note tasks) to avoid blocking note pipeline"
  - "callAIWithPrompt() added as separate function routing to all providers without grammar enforcement — digest narrative is free text"
  - "getBraveKey() stub returns null in 04-04; 04-05 replaces with real safeStorage decrypt"
  - "digest-result branch uses return after handling to prevent fall-through into note result logic"

patterns-established:
  - "Pattern: best-effort pipeline tasks — wrap in try-catch, log error, never propagate to caller"
  - "Pattern: fire-and-forget worker tasks — call async function without await in message handler"

requirements-completed: [PATTERNS-02, INSIGHT-03]

duration: 18min
completed: 2026-04-16
---

# Phase 04 Plan 04: Digest Generation Pipeline Summary

**End-to-end digest pipeline: scheduler queries DB for word cloud + stats, aiWorker generates narrative via AI with optional Brave Search enrichment, aiOrchestrator persists to digests table and notifies renderer via digest:updated IPC push**

## Performance

- **Duration:** 18 min
- **Started:** 2026-04-16T08:10:00Z
- **Completed:** 2026-04-16T08:28:00Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- Created digestScheduler.ts with 20-hour elapsed check, tag frequency word cloud builder (capped at 50), stats aggregation, and worker dispatch
- Replaced aiWorker digest-task stub with full implementation: Brave Search API call, buildDigestPrompt(), callAIWithPrompt() routing all providers, handleDigestTask() fire-and-forget with JSON narrative parsing
- Extended aiOrchestrator with digest-result handler: INSERT into digests table via raw SQLite, push digest:updated to renderer

## Task Commits

Each task was committed atomically:

1. **Task 1: digestScheduler.ts + getBraveKey() stub + index.ts scheduler call** - `be82579` (feat)
2. **Task 2: aiWorker full digest-task handler + Brave Search + narrative generation** - `fc3fc3f` (feat)
3. **Task 3: aiOrchestrator digest-result handler — persist + notify renderer** - `960f89a` (feat)

## Files Created/Modified

- `src/main/digestScheduler.ts` - New: checkAndScheduleDigest(), buildWordCloudData(), buildStats()
- `src/main/aiWorker.ts` - Extended: searchBrave(), buildDigestPrompt(), callAIWithPrompt(), handleDigestTask(), full digest-task handler
- `src/main/aiOrchestrator.ts` - Extended: randomUUID import, digest-result branch in port1.on('message')
- `src/main/ipc.ts` - Added: getBraveKey() stub (returns null)
- `src/main/index.ts` - Added: import + call checkAndScheduleDigest() after reQueuePendingNotes()

## Decisions Made

- Word cloud built in main process (digestScheduler) not the worker — keeps DB access centralized
- handleDigestTask fires as fire-and-forget Promise (not queued with note tasks) to avoid blocking note processing pipeline
- callAIWithPrompt() added as separate AI routing function without grammar enforcement — digest narrative is free text
- getBraveKey() stub returns null in 04-04; 04-05 replaces with real safeStorage decrypt
- digest-result branch uses early return to prevent fall-through into note result destructuring

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added null check and error handling for getSqlite().prepare INSERT in aiOrchestrator**
- **Found during:** Task 3 (aiOrchestrator digest-result handler)
- **Issue:** Plan's code snippet had no try-catch around the INSERT; DB errors would propagate as unhandled rejections
- **Fix:** Wrapped INSERT + webContents.send in try-catch with console.error logging
- **Files modified:** src/main/aiOrchestrator.ts
- **Verification:** TypeScript compiles cleanly
- **Committed in:** 960f89a (Task 3 commit)

**2. [Advisor guidance] Added separate callAIWithPrompt() instead of overloading callAI()**
- **Found during:** Task 2 planning (per advisor review)
- **Issue:** callAI() calls buildPrompt() internally and has signature incompatible with digest prompts
- **Fix:** Implemented callAIWithPrompt(prompt: string) routing to all providers without buildPrompt/grammar enforcement
- **Files modified:** src/main/aiWorker.ts
- **Verification:** TypeScript compiles cleanly; function used in handleDigestTask
- **Committed in:** fc3fc3f (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 missing critical error handling, 1 architectural refinement from advisor)
**Impact on plan:** Both fixes necessary for robustness. No scope creep.

## Issues Encountered

- Pre-existing TypeScript warning in src/renderer/src/components/WikiGraph.tsx (`tagColors` declared but unused) — out of scope for this plan, logged as deferred item.

## User Setup Required

None - no external service configuration required. Brave Search key stub returns null; real key wired in 04-05.

## Next Phase Readiness

- Full digest pipeline connected: scheduler -> worker -> orchestrator -> DB -> renderer
- 04-05 (Brave Search key storage) can replace getBraveKey() stub with real safeStorage decrypt
- 04-07 (Patterns UI) can now query the digests table for display — word cloud data and narrative are stored

---
*Phase: 04-search*
*Completed: 2026-04-16*
