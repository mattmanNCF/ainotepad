---
phase: 04-search
plan: 03
subsystem: ai-worker
tags: [local-model, node-llama-cpp, fts5, insights, ai-worker]
dependency_graph:
  requires: [04-01, 04-02]
  provides: [local-model-dispatch, insights-field, fts5-retrieval]
  affects: [aiWorker.ts, aiOrchestrator.ts, localModel.ts]
tech_stack:
  added: [node-llama-cpp getLlama/LlamaChatSession/InsufficientMemoryError]
  patterns: [lazy-init-with-init-promise, json-grammar-enforcement, fts5-or-query]
key_files:
  created: [src/main/localModel.ts]
  modified: [src/main/aiWorker.ts, src/main/aiOrchestrator.ts]
decisions:
  - "onProgress callback receives {totalSize, downloadedSize} — percent computed as downloadedSize/totalSize*100"
  - "InsufficientMemoryError caught for GPU fallback; retry with gpuLayers: 0 for CPU-only execution"
  - "queryRelatedNotes returns '' on any error — safe before first FTS5 migration on new installs"
  - "callLocal awaits localModelInitPromise before processing — non-blocking init with queue drain"
  - "WikiGraph.tsx unused variable pre-exists in working copy; out of scope for this plan"
metrics:
  duration: "~25 minutes"
  completed: "2026-04-16"
  tasks_completed: 3
  files_modified: 3
---

# Phase 04 Plan 03: Local Model Dispatch + Insights Summary

One-liner: Local Gemma 4 E4B dispatch via node-llama-cpp with FTS5-grounded insights wired through the full result chain.

## What Was Built

### Task 1: localModel.ts (NEW)

New file providing the main process with helpers to locate and download the Gemma 4 E4B GGUF model:

- `MODEL_URIS` — HuggingFace URIs for Q3/Q4/Q5 quantization tiers
- `MODEL_FILENAMES` — GGUF filenames for path scanning
- `detectModelTier()` — RAM-based tier selection (>=16GB large, >=8GB default, else small)
- `getModelStoragePath()` — returns `userData/models`, creates dir if absent
- `findExistingModel(tier)` — scans LM Studio cache and app storage (not Ollama blobs)
- `downloadModel(tier, onProgress?)` — uses `createModelDownloader` from node-llama-cpp; progress callback receives percent (0–100)

### Task 2: aiWorker.ts (EXTENDED)

Extended with local model dispatch and enriched prompt/result schema:

- Imports `getLlama`, `LlamaChatSession`, `InsufficientMemoryError` from node-llama-cpp
- Module-level llama state: instance, model, context, session, ready flag, init promise
- `initLocalModel(path)` — GPU init with `InsufficientMemoryError` catch → CPU fallback (gpuLayers: 0)
- `callLocal()` — awaits init promise, builds JSON grammar via `createGrammarForJsonSchema`, calls `session.prompt`
- `callAI()` — new `local` branch before existing providers; all providers now receive `relatedNotes`
- `buildPrompt()` — 4th param `relatedNotes` injected as "Related Past Notes" section; 5th task instruction for non-obvious `insights`
- Queue item type extended with `relatedNotes`
- Parsed result extended with `insights: string | null`
- taskPort result messages (complete + failed paths) include `insights` field
- `digest-task` handler stub: logs TODO, posts `{ type: 'digest-result', stub: true }` (full impl in 04-04)

### Task 3: aiOrchestrator.ts (EXTENDED)

Extended with FTS5 retrieval and insights wiring through the result chain:

- `getSqlite` imported from `./db`
- `queryRelatedNotes(rawText)` — extracts up to 10 words, OR-joins for FTS5 MATCH, returns top 5 snippets joined with `\n---\n`; returns `''` on any error
- `enqueueNote()` — calls `queryRelatedNotes()`, passes `relatedNotes` in worker task message
- Result handler destructures `insights` from event.data
- `updateNoteAiResult` called with `insights ?? null` as 6th argument
- `note:aiUpdate` push includes `insights: insights ?? null`

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written.

### Out-of-Scope Discoveries

**[Pre-existing] WikiGraph.tsx unused variable (TS6133)**
- **Found during:** Final typecheck:web
- **File:** `src/renderer/src/components/WikiGraph.tsx:22`
- **Issue:** `tagColors` declared but never read — pre-exists in uncommitted working copy before this plan's changes
- **Action:** Logged to deferred-items; not fixed (out of scope per deviation rules)

## Self-Check

### Files exist:
- `src/main/localModel.ts` — FOUND
- `src/main/aiWorker.ts` — FOUND (modified)
- `src/main/aiOrchestrator.ts` — FOUND (modified)

### Commits exist:
- `5e5974c` — localModel.ts creation — FOUND
- `ba9efd7` — aiWorker.ts extension — FOUND
- `be1a01e` — aiOrchestrator.ts extension — FOUND

### TypeScript (files modified in this plan):
- `typecheck:node` — PASSED (all 3 files clean)

## Self-Check: PASSED
