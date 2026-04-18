---
phase: 08-connections-digest-improvements
plan: "01"
subsystem: similarity
tags: [tfidf, ipc, preload, similarity, corkboard]
dependency_graph:
  requires: []
  provides: [notes:getSimilarPairs IPC endpoint, computeSimilarPairs function]
  affects: [src/main/ipc.ts, src/preload/index.ts, src/preload/index.d.ts]
tech_stack:
  added: []
  patterns: [TF-IDF cosine similarity, IPC handler pattern, preload bridge pattern]
key_files:
  created:
    - src/main/similarity.ts
  modified:
    - src/main/ipc.ts
    - src/preload/index.ts
    - src/preload/index.d.ts
decisions:
  - "noteTags parameter prefixed with _ (unused) — grouping by tag done via tagToNoteIds in IPC handler before calling computeSimilarPairs; function signature kept for API clarity"
  - "Pure TypeScript TF-IDF with no new dependencies — meets plan spec exactly"
metrics:
  duration: "~5 minutes"
  completed: "2026-04-18T23:03:09Z"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 4
requirements:
  - CORK-05
---

# Phase 08 Plan 01: TF-IDF Similarity Data Layer Summary

TF-IDF cosine similarity engine with IPC handler and preload bridge — provides `window.api.notes.getSimilarPairs()` returning same-tag note pairs with cosine similarity >= 0.3, capped at 100 most-recent complete notes.

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Create src/main/similarity.ts with TF-IDF computeSimilarPairs | 78102a0 | src/main/similarity.ts (created) |
| 2 | Add notes:getSimilarPairs IPC handler + preload bridge + type declaration | 86fe2a2 | src/main/ipc.ts, src/preload/index.ts, src/preload/index.d.ts |

## What Was Built

`src/main/similarity.ts` — pure TypeScript module with three internal helpers and one export:
- `tokenize()` — lowercases, strips punctuation, removes stop words, filters tokens < 3 chars
- `tfIdf()` — TF-IDF vector for a document relative to a corpus
- `cosineSim()` — dot-product cosine similarity between two TF-IDF vectors
- `computeSimilarPairs()` — takes Maps for noteTexts, noteTags, tagToNoteIds, and a threshold; skips notes with < 4 meaningful tokens; deduplicates pairs via a seen-set; returns `Array<{ a: string; b: string }>`

`src/main/ipc.ts` — new `notes:getSimilarPairs` handler:
- Queries up to 100 most-recent complete non-hidden notes (id, raw_text, tags)
- Builds three Maps from DB rows
- Calls `computeSimilarPairs(..., 0.3)` and returns result

`src/preload/index.ts` and `src/preload/index.d.ts` — `getSimilarPairs` exposed under `window.api.notes` with correct Promise type.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed unused parameter causing TS6133 error**
- **Found during:** Task 2 build verification (`npm run build`)
- **Issue:** `noteTags` parameter in `computeSimilarPairs` signature was unused; TypeScript strict mode emitted `TS6133: 'noteTags' is declared but its value is never read`
- **Fix:** Prefixed parameter name with `_` (`_noteTags`) — standard TypeScript convention for intentionally unused parameters that must remain in the signature for API compatibility
- **Files modified:** src/main/similarity.ts
- **Commit:** 86fe2a2 (included in Task 2 commit)

## Self-Check

Files exist:
- src/main/similarity.ts: FOUND
- src/main/ipc.ts: modified
- src/preload/index.ts: modified
- src/preload/index.d.ts: modified

Commits exist:
- 78102a0: FOUND (Task 1)
- 86fe2a2: FOUND (Task 2)

Build: PASSED (npm run build clean, no TypeScript errors)

## Self-Check: PASSED
