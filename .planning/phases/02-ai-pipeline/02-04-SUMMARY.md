---
phase: 02-ai-pipeline
plan: "04"
subsystem: settings-persistence
tags: [safeStorage, electron-conf, settings-ui, ipc, worker-sync]
dependency_graph:
  requires: [02-02]
  provides: [SETT-01]
  affects: [src/main/ipc.ts, src/main/index.ts, src/main/aiOrchestrator.ts, src/preload/index.ts, src/preload/index.d.ts, src/renderer/src/App.tsx, src/renderer/src/components/TabBar.tsx, src/renderer/src/components/SettingsPanel.tsx]
tech_stack:
  added: [electron-conf (already installed), safeStorage (Electron built-in)]
  patterns: [safeStorage.encryptString/decryptString, Conf from electron-conf/main, workerPort.postMessage settings-update, modal overlay via fixed inset-0]
key_files:
  created: [src/renderer/src/components/SettingsPanel.tsx]
  modified: [src/main/ipc.ts, src/main/index.ts, src/preload/index.ts, src/preload/index.d.ts, src/renderer/src/App.tsx, src/renderer/src/components/TabBar.tsx]
decisions:
  - "getProvider() exported from ipc.ts so index.ts can read provider from electron-conf without duplicating Conf initialization"
  - "SettingsPanel uses unicode escape \\u2026 for ellipsis to avoid encoding issues in template"
  - "TabBar uses HTML entity &#9881; for gear icon to avoid raw unicode in JSX"
  - "safeStorage only called inside ipcMain.handle() callbacks and getDecryptedApiKey() — never at module load time"
metrics:
  duration_minutes: 15
  completed_date: "2026-04-15"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 7
---

# Phase 02 Plan 04: Settings Persistence + SettingsPanel Summary

**One-liner:** API key encrypted with safeStorage+DPAPI, stored in electron-conf, retrieved via getDecryptedApiKey(), with live worker notification via settings-update message and SettingsPanel overlay UI.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Settings IPC handlers, getDecryptedApiKey, index.ts wiring | b207f1a | src/main/ipc.ts, src/main/index.ts |
| 2 | Preload settings exposure + SettingsPanel UI + App/TabBar gear | c61027b | 5 files |

## What Was Built

### Task 1: Settings IPC + Main Process Wiring

**src/main/ipc.ts:**
- Replaced the 02-02 stub `getDecryptedApiKey()` (always returned null) with real implementation using `safeStorage.decryptString()` + electron-conf
- Added `getProvider()` export reading provider from electron-conf (defaults to 'claude')
- Added `settings:save` IPC handler: encrypts key with `safeStorage.encryptString()`, stores base64 ciphertext in electron-conf, then sends `{ type: 'settings-update', provider, apiKey }` to the running worker via `getWorkerPort()` so same-session note submissions pick up the new key immediately
- Added `settings:get` IPC handler: returns `{ provider, hasKey }` without exposing the raw key
- `safeStorage` is only accessed inside `ipcMain.handle()` callbacks and `getDecryptedApiKey()` — never at module load time

**src/main/index.ts:**
- Import `getDecryptedApiKey` and `getProvider` from `./ipc`
- `startAiWorker(win, getProvider(), getDecryptedApiKey() ?? '')` — passes real persisted settings at startup instead of hardcoded `('claude', '')`

**src/main/aiOrchestrator.ts:**
- Already had `getWorkerPort()` exported from plan 02-02 — no changes needed

### Task 2: Preload + UI

**src/preload/index.ts:**
- Added `settings: { save, get }` to the `contextBridge.exposeInMainWorld('api', ...)` object

**src/preload/index.d.ts:**
- Made `settings` non-optional (was `settings?`) with correct types
- Made `onAiUpdate` non-optional (was `onAiUpdate?`)

**src/renderer/src/components/SettingsPanel.tsx (new):**
- Modal overlay (fixed inset-0, backdrop click closes)
- Provider radio buttons: Claude / OpenAI
- Password-type API key input (Enter to save, placeholder changes when key is configured)
- Save button with saving/saved feedback states
- Loads current settings on mount via `window.api.settings.get()`

**src/renderer/src/components/TabBar.tsx:**
- Added `onSettingsClick` prop
- Gear button (&#9881;) pushed to right via `ml-auto` wrapper

**src/renderer/src/App.tsx:**
- Added `showSettings` state
- `<TabBar onSettingsClick={() => setShowSettings(true)} />`
- `{showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}` rendered after tab content

## Key Decisions Made

1. **`getProvider()` export from ipc.ts**: Avoids duplicating `new Conf(...)` initialization in index.ts. Both functions share the module-scope `conf` instance.

2. **Settings-update to running worker**: `settings:save` handler posts `{ type: 'settings-update', provider, apiKey: key }` to the running worker immediately after saving. The worker (implemented in 02-02) handles this message type by updating its module-level `provider` and `apiKey` variables. This means the user can enter their key and immediately submit notes in the same session without restarting the app.

3. **safeStorage timing**: `conf = new Conf(...)` is at module scope (safe — electron-conf does not call safeStorage at init). All actual `safeStorage.encryptString/decryptString` calls are inside `ipcMain.handle()` callbacks or `getDecryptedApiKey()` (which is called only from IPC handlers and `app.whenReady()`).

4. **decryptString error handling**: `getDecryptedApiKey()` wraps `decryptString` in try-catch and returns `null` on failure. This handles the Windows DPAPI key mismatch case after reinstall — the app treats it as "no key configured" rather than crashing.

## Confirmation of Must-Haves

- [x] `settings:save` encrypts with `safeStorage.encryptString()` and stores base64 in electron-conf
- [x] `settings:get` returns `{ provider, hasKey }` — never exposes raw key
- [x] `getDecryptedApiKey()` exported from ipc.ts, returns decrypted key or null
- [x] `safeStorage` only called inside IPC handler callbacks and `getDecryptedApiKey()` — never at module load time
- [x] SettingsPanel renders provider radio (claude/openai) and password-type API key input with Save button
- [x] Gear icon in TabBar toggles SettingsPanel overlay in App.tsx (not a new tab)
- [x] `notes:create` handler calls real `getDecryptedApiKey()` (stub replaced)
- [x] `settings:save` sends `settings-update` to worker via `getWorkerPort()`
- [x] `index.ts` passes `getProvider()` and `getDecryptedApiKey() ?? ''` to `startAiWorker()`
- [x] `npm run typecheck` passes (exit 0)
- [x] `npm run build` passes (exit 0)

## Deviations from Plan

None — plan executed exactly as written. The `getWorkerPort()` accessor was already present in `aiOrchestrator.ts` from plan 02-02 (plan 02-04 anticipated this and instructed to check first, which was done).

## Build Results

- `npm run typecheck`: PASS (exit 0) — both tsconfig.node.json and tsconfig.web.json clean
- `npm run build`: PASS (exit 0) — main, preload, and renderer all built successfully

## Self-Check: PASSED

Files exist:
- src/renderer/src/components/SettingsPanel.tsx: FOUND
- src/main/ipc.ts (modified): FOUND
- src/main/index.ts (modified): FOUND
- src/preload/index.ts (modified): FOUND
- src/preload/index.d.ts (modified): FOUND
- src/renderer/src/App.tsx (modified): FOUND
- src/renderer/src/components/TabBar.tsx (modified): FOUND

Commits exist:
- b207f1a: feat(02-04): settings IPC handlers — FOUND
- c61027b: feat(02-04): SettingsPanel UI — FOUND
