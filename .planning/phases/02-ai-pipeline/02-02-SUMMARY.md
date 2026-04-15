---
phase: 02-ai-pipeline
plan: 02
subsystem: ai-pipeline
tags: [electron, utilityProcess, MessageChannelMain, rollup, ipc, react]
dependency_graph:
  requires: [02-01]
  provides: [ai-worker-pipeline, enqueue-on-create, renderer-push, startup-requeue]
  affects: [02-03, 02-04]
tech_stack:
  added: []
  patterns:
    - Rollup multi-entry (index + aiWorker) for separate utilityProcess bundle
    - MessageChannelMain port transfer pattern (port2 to worker via postMessage)
    - Serial queue drain loop in utility process (array + processing flag)
    - webContents.send push from main to renderer via preload onAiUpdate
    - Startup re-queue of pending notes after worker fork
key_files:
  created:
    - src/main/aiWorker.ts
    - src/main/aiOrchestrator.ts
  modified:
    - electron.vite.config.ts
    - src/main/db.ts
    - src/main/ipc.ts
    - src/main/index.ts
    - src/preload/index.ts
    - src/renderer/src/components/NotesTab.tsx
decisions:
  - Electron MessagePortMain uses .on('message', handler) not .onmessage — web MessagePort interface incompatible with main process type
  - Handler parameter typed as Electron.MessageEvent (not browser MessageEvent<any>) to satisfy TypeScript overload
  - getDecryptedApiKey stub returns null in 02-02; real key wired in 02-04
  - startAiWorker called with empty apiKey ('') — worker starts but STUB callAI returns immediately, no real API calls until 02-03
metrics:
  duration_seconds: 169
  completed_date: "2026-04-15"
  tasks_completed: 2
  tasks_total: 2
  files_created: 2
  files_modified: 6
---

# Phase 02 Plan 02: AI Pipeline Wiring Summary

**One-liner:** Forked aiWorker.ts as a separate Rollup entry via utilityProcess + MessageChannelMain, plumbed full note-create-to-renderer-push pipeline with startup re-queue and stub callAI().

## What Was Built

### Task 1: aiWorker Rollup Entry + Core Files

**electron.vite.config.ts** — added dual `rollupOptions.input` with `index` and `aiWorker` entries. Build now produces `out/main/aiWorker.js` (1.73 kB) and `out/main/index.js` (6.57 kB) as separate bundles.

**src/main/db.ts** — added `updateNoteAiResult(noteId, aiState, aiAnnotation, organizedText)` export using Drizzle's `eq` operator. Writes AI result back to SQLite synchronously via `.run()`.

**src/main/aiOrchestrator.ts** — new file. Exports:
- `startAiWorker(win, provider, apiKey)` — forks aiWorker.js via utilityProcess, creates MessageChannelMain, transfers port2 to worker, starts port1, listens for result messages and pushes to renderer via `webContents.send('note:aiUpdate', ...)`
- `enqueueNote(noteId, rawText)` — posts task message to workerPort
- `reQueuePendingNotes()` — queries SQLite for pending notes and enqueues all
- `getWorkerPort()` — accessor for plan 02-04 settings-update dispatch

**src/main/aiWorker.ts** — new file. Utility process worker with:
- `process.parentPort.on('message')` init handler receiving port2 from MessageChannelMain
- Serial queue drain loop (processes one note at a time, 500ms gap between calls)
- Handles `task` and `settings-update` message types
- STUB `callAI()` returns valid JSON `{organized, annotation}` for end-to-end pipeline testing
- `taskPort.start()` called after init (required — port is paused by default)

### Task 2: IPC Wiring + Renderer Subscription

**src/main/ipc.ts** — added `enqueueNote` import, `getDecryptedApiKey()` stub (returns null), updated `notes:create` handler to call `enqueueNote(id, rawText)` after DB insert when key is non-null. Also added `organizedText: null` to the returned record shape.

**src/main/index.ts** — added import of `startAiWorker` and `reQueuePendingNotes`, called both after `createTray(win)` inside `app.whenReady()`.

**src/preload/index.ts** — added `onAiUpdate` to the exposed `window.api` object. Subscribes to `note:aiUpdate` IPC channel from main and calls the callback with `{ noteId, aiState, aiAnnotation, organizedText }`.

**src/renderer/src/components/NotesTab.tsx** — added second `useEffect` that subscribes to `window.api.onAiUpdate` on mount. Updates note state in-place via `setNotes` map when AI result arrives, replacing `aiState`, `aiAnnotation`, and `organizedText`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Electron MessagePortMain type mismatch in aiWorker.ts**
- **Found during:** Task 1, first typecheck run
- **Issue:** Plan specified `taskPort.onmessage = handleMessage` but `Electron.MessagePortMain` does not expose an `.onmessage` setter — TypeScript error TS2339. Then, switching to `.on('message', handler)` revealed the handler parameter type `MessageEvent<any>` (browser interface) is incompatible with `Electron.MessageEvent` (which only has `data` and `ports`).
- **Fix:** Changed assignment to `.on('message', handleMessage)` and typed handler parameter as `Electron.MessageEvent` instead of `MessageEvent<any>`.
- **Files modified:** `src/main/aiWorker.ts`
- **Commit:** ba54ac7

## Build Output Confirmation

```
out/main/aiWorker.js  1.73 kB  (separate Rollup entry — verified)
out/main/index.js     6.57 kB
out/preload/index.js  0.37 kB
out/renderer/...      561.82 kB
```

- `npm run typecheck` — exit 0 (both typecheck:node and typecheck:web)
- `npm run build` — exit 0, no warnings

## Self-Check: PASSED

- [x] `C:/Users/mflma/workspace/AInotepad/src/main/aiWorker.ts` — FOUND
- [x] `C:/Users/mflma/workspace/AInotepad/src/main/aiOrchestrator.ts` — FOUND
- [x] `C:/Users/mflma/workspace/AInotepad/out/main/aiWorker.js` — FOUND (1.73 kB)
- [x] Commit ba54ac7 — Task 1
- [x] Commit 778f19c — Task 2
