---
phase: quick
plan: 260418-pue
subsystem: ai-worker
tags: [digest, ollama, max-tokens, cleanup]
dependency_graph:
  requires: []
  provides: [digest-narrative-generation-fix]
  affects: [src/main/aiWorker.ts, src/main/aiOrchestrator.ts]
tech_stack:
  added: []
  patterns: [ollama-openai-compat, sqlite-cleanup]
key_files:
  modified:
    - src/main/aiWorker.ts
    - src/main/aiOrchestrator.ts
decisions:
  - "Raise Ollama and OpenAI max_tokens to 4096; Claude stays at 512 (no thinking overhead)"
  - "Cleanup uses 48h cutoff rather than keep-only-latest to avoid deleting a row still in flight"
metrics:
  duration: 5m
  completed: 2026-04-18
  tasks_completed: 2
  files_modified: 2
---

# Quick Task 260418-pue: Fix Digest Narrative max_tokens + Cleanup DELETE

**One-liner:** Raised Ollama/OpenAI callAIWithPrompt max_tokens from 512 to 4096 so Gemma 4 thinking tokens do not exhaust the budget before JSON is written; added periodic DELETE to prevent digest row accumulation.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Raise max_tokens for Ollama and OpenAI branches | c788523 | src/main/aiWorker.ts |
| 2 | Add digest row cleanup after INSERT | c788523 | src/main/aiOrchestrator.ts |

## Changes

### src/main/aiWorker.ts

`callAIWithPrompt()` lines 141 and 152: `max_tokens` changed from 512 to 4096 for Ollama and OpenAI branches respectively. Claude branch (line 162) remains at 512.

### src/main/aiOrchestrator.ts

In the `digest-result` handler, after the INSERT `.run(...)` call, added:

```typescript
const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
getSqlite().prepare(
  `DELETE FROM digests WHERE period=? AND generated_at < ?`
).run(period, cutoff)
```

This deletes stale rows older than 48 hours for the same period after each successful INSERT, preventing indefinite DB growth from repeated Generate Now clicks.

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- `grep -n "max_tokens" src/main/aiWorker.ts`: lines 141=4096, 152=4096, 162=512 - PASS
- `grep -n "DELETE FROM digests" src/main/aiOrchestrator.ts`: match at line 58 - PASS
- `npx tsc --noEmit`: zero errors - PASS

## Self-Check: PASSED

- src/main/aiWorker.ts: modified and committed
- src/main/aiOrchestrator.ts: modified and committed
- Commit c788523 exists
