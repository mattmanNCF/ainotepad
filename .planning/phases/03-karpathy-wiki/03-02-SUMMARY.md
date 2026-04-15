---
phase: 03-karpathy-wiki
plan: 02
subsystem: ai
tags: [electron, ipc, anthropic, openai, karpathy-wiki, sqlite, drizzle, electron-conf]

# Dependency graph
requires:
  - phase: 03-01
    provides: kb.ts helpers (writeKbFile, readKbFile, listKbFiles), kbPages schema, notes.tags column
provides:
  - tagColors.ts isolated Conf accessor for tag colors (no circular import)
  - aiWorker.ts with expanded buildPrompt, 4096 max_tokens, wiki_updates + tags parsing
  - aiOrchestrator.ts async enqueueNote that reads _context.md + concept snippets before dispatch
  - aiOrchestrator.ts wiki file writes + kbPages upsert + kb:updated push + deterministic tag colors
  - ipc.ts kb:listFiles, kb:readFile, kb:getTagColors, kb:setTagColor IPC handlers
  - window.api.kb surface in preload/index.ts + index.d.ts with full TypeScript types
  - note:aiUpdate push includes tags array for renderer NoteCard display
affects: [03-03, renderer NoteCard tag color indicators, wiki browser]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "tagColors.ts as isolated Conf accessor breaks circular aiOrchestrator <-> ipc.ts dependency"
    - "Async enqueueNote pattern: load context before posting task to utilityProcess worker"
    - "Keyword heuristic for concept file injection: slug match against lowercased note text, cap 5"
    - "kbPages upsert via drizzle onConflictDoUpdate targeting kbPages.id"
    - "Deterministic tag color palette cycling: index = Object.keys(currentColors).length % palette.length"

key-files:
  created:
    - src/main/tagColors.ts
  modified:
    - src/main/aiWorker.ts
    - src/main/aiOrchestrator.ts
    - src/main/ipc.ts
    - src/preload/index.ts
    - src/preload/index.d.ts

key-decisions:
  - "tagColors.ts is a separate Conf instance with distinct type — avoids circular import between aiOrchestrator.ts and ipc.ts"
  - "enqueueNote is now async — loads _context.md and concept snippets before posting task message to worker"
  - "notes:create ipcMain.handle is now async to await enqueueNote"
  - "ipc.ts imports tagColors.ts directly — does NOT export getConf() or expose Conf to other modules"
  - "port1.on message handler is now async — Electron MessagePortMain does not require synchronous return"
  - "kbPages upsert skips _ prefixed files (_context.md etc) — only concept pages tracked in SQLite"

requirements-completed: []

# Metrics
duration: 20min
completed: 2026-04-14
---

# Phase 03 Plan 02: Karpathy Wiki AI Pipeline Extension Summary

**Async wiki pipeline wired end-to-end: every note submission triggers concept file writes to userData/kb/, kbPages upserts, deterministic tag color assignment, and a window.api.kb IPC surface exposed to the renderer**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-04-14T00:00:00Z
- **Completed:** 2026-04-14T00:20:00Z
- **Tasks:** 3 (Task 0, Task 1, Task 2)
- **Files modified:** 6 (1 created, 5 modified)

## Accomplishments
- Created tagColors.ts as a circular-import-safe isolated Conf accessor for tag color storage
- Extended aiWorker.ts with expanded buildPrompt (contextMd + conceptSnippets), 4096 max_tokens in both call paths, wiki_updates and tags parsing from AI response
- Wired aiOrchestrator.ts to load _context.md and keyword-matched concept snippets before each dispatch, write wiki files on result, upsert kbPages in SQLite, assign deterministic tag colors, and push kb:updated to renderer
- Added 4 KB IPC handlers to ipc.ts (kb:listFiles, kb:readFile, kb:getTagColors, kb:setTagColor)
- Exposed window.api.kb surface in preload with full TypeScript type definitions; onAiUpdate payload extended with tags array

## Task Commits

1. **Task 0: Create tagColors.ts** - `4845004` (feat)
2. **Task 1: Extend aiWorker.ts** - `183849e` (feat)
3. **Task 2: Wire orchestrator + ipc + preload** - `e592655` (feat)

## Files Created/Modified
- `src/main/tagColors.ts` - New: isolated Conf accessor for tag colors, no project imports
- `src/main/aiWorker.ts` - Expanded queue type, buildPrompt, drain, callClaude/callOpenAI/callAI with context params; max_tokens 4096
- `src/main/aiOrchestrator.ts` - Async enqueueNote with context loading; wiki file writes; kbPages upsert; tag color assignment; kb:updated push; note:aiUpdate with tags
- `src/main/ipc.ts` - Added kb: IPC handlers; notes:create made async with await enqueueNote; imports tagColors.ts
- `src/preload/index.ts` - window.api.kb surface with 5 methods; tags in onAiUpdate callback
- `src/preload/index.d.ts` - Window.api.kb typed block; onAiUpdate payload includes tags: string[]

## Decisions Made
- tagColors.ts as a separate Conf instance is the correct pattern to break circular aiOrchestrator <-> ipc.ts dependency. Both modules can import it without creating a cycle.
- enqueueNote made async rather than fire-and-forget so that _context.md and concept snippets are loaded before the task message is posted to the utilityProcess worker.
- notes:create ipcMain.handle made async to accommodate await enqueueNote — safe because ipcMain.handle callbacks always accept async functions.
- kbPages upsert skips _ prefixed files: only named concept pages tracked in SQLite; _context.md is AI working memory written to disk but not surfaced in the page index.
- Keyword heuristic capped at 5 files to avoid ballooning the context sent to the AI.

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None - build passed cleanly on first attempt.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 03-02 complete: AI pipeline fully wired for wiki writes
- window.api.kb surface ready for renderer consumption in Plan 03-03 (NoteCard tag indicators + KB browser)
- No blockers

---
*Phase: 03-karpathy-wiki*
*Completed: 2026-04-14*
