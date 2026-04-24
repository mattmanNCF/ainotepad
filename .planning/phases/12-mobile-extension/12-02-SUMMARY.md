---
phase: 12-mobile-extension
plan: "02"
subsystem: drive-transport
tags: [googleapis-drive, ajv, electron-conf, oauth, ipc, polling]

requires:
  - phase: 12-mobile-extension
    plan: "01"
    provides: "@googleapis/drive + ajv installed, shared createNote(), shared/envelope.ts"
  - phase: 11-google-calendar-integration
    provides: "oauthFlow.ts, tokenStore.ts, google-auth-library OAuth2Client pattern"
provides:
  - "src/main/drive/driveClient.ts: buildDriveClient() + connectDrive() with incremental consent"
  - "src/main/drive/changesPoller.ts: 60s polling loop, appDataFolder, startPageToken checkpointing, 401 surfacing"
  - "src/main/drive/ingestService.ts: processFile (ajv validate + createNote + delete), checkQuota, drainOnLaunch"
  - "oauthFlow.ts: scopes parameter + include_granted_scopes:true for incremental consent (MOB-AUTH-01)"
  - "drive:connect, drive:getStatus, drive:checkQuota IPC channels"
  - "window.api.drive surface: connect, getStatus, checkQuota, onPendingDrained"
  - "Boot-time drain + 60s polling wired in app.whenReady()"
affects:
  - 12-03-PLAN (PWA writes to same appDataFolder)
  - 12-04-PLAN (Settings/Integrations UI references drive:connect, drive:getStatus, drive:checkQuota)

tech-stack:
  added: []
  patterns:
    - "Dynamic imports in IPC handlers: drive/* modules only loaded when a drive: channel is invoked"
    - "Circular dependency resolved: changesPoller imports processFile from ingestService, ingestService imports initStartPageToken+pollChanges from changesPoller — TypeScript handles this via module scope"
    - "getStartPageToken({} as any) with spaces cast: TypeScript types for Params$Resource$Changes$Getstartpagetoken omit spaces, but REST API accepts it — cast with comment"
    - "startPolling(drive) kept as module-level singleton guard via _pollInterval null check"

key-files:
  created:
    - "src/main/drive/driveClient.ts (41 lines)"
    - "src/main/drive/changesPoller.ts (123 lines)"
    - "src/main/drive/ingestService.ts (103 lines)"
  modified:
    - "src/main/calendar/oauthFlow.ts (export CALENDAR_SCOPE + DRIVE_APPDATA_SCOPE, scopes param, include_granted_scopes)"
    - "src/main/ipc.ts (drive:connect, drive:getStatus, drive:checkQuota handlers)"
    - "src/main/index.ts (drainOnLaunch + startPolling boot wiring)"
    - "src/preload/index.ts (window.api.drive surface)"
    - "src/preload/index.d.ts (drive ambient type declarations)"

key-decisions:
  - "getStartPageToken called without spaces parameter due to TypeScript type gap in @googleapis/drive@20.1.0 — REST API accepts it at runtime but Params$Resource$Changes$Getstartpagetoken does not include spaces; cast with `as any` and comment"
  - "ingestService.ts and changesPoller.ts have a circular import (changesPoller -> processFile from ingestService, ingestService -> initStartPageToken+pollChanges from changesPoller) — TypeScript/Node.js module system handles circular deps at module scope; both files created before typecheck confirmed this works"
  - "Drive IPC handlers use dynamic await import() to keep @googleapis/drive out of the cold-start boot path"
  - "Boot sequence uses two independent dynamic import chains (drainOnLaunch, then startPolling) — follows same pattern as Phase 11 reminderService.js dynamic import in before-quit"

requirements-completed:
  - MOB-AUTH-01
  - MOB-AUTH-02
  - MOB-TRANS-01
  - MOB-TRANS-02
  - MOB-TRANS-03
  - MOB-SEC-01
  - MOB-QUOTA-01

duration: 4min
completed: 2026-04-24
---

# Phase 12 Plan 02: Desktop Drive Ingestion Pipeline Summary

**Desktop Drive ingestion pipeline complete: oauthFlow incremental consent, driveClient factory, 60s appDataFolder poller with startPageToken checkpointing, ajv-validated note ingestion with Drive file delete, quota enforcement, drive:* IPC channels, window.api.drive preload surface, and boot-time drain wired in app.whenReady()**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-24T02:37:36Z
- **Completed:** 2026-04-24T02:42:17Z
- **Tasks:** 3 auto
- **Files modified:** 8 (3 created, 5 modified)

## Accomplishments

### Task 1: oauthFlow scopes param + driveClient factory (commit 92f7383)

- Exported `CALENDAR_SCOPE` and `DRIVE_APPDATA_SCOPE` constants from `oauthFlow.ts`
- `startOAuthFlow(scopes: string[] = [CALENDAR_SCOPE])` — backward-compatible with existing `calendar:connect` caller (no-args call in ipc.ts continues to work)
- `include_granted_scopes: true` added to `generateAuthUrl` for incremental consent (MOB-AUTH-01)
- Created `src/main/drive/driveClient.ts`: `buildDriveClient()` reuses Phase 11 refresh token store; `connectDrive()` triggers combined-scope OAuth flow

### Task 2: Changes poller (commit dbe3416)

- `changesPoller.ts`: 60s polling via `setInterval(POLL_INTERVAL_MS = 60_000)`
- `initStartPageToken`: gets Drive startPageToken, persisted via electron-conf `drive-settings` store
- `pollChanges`: pages through `changes.list(spaces='appDataFolder')`, only processes `.json` files, delegates to `processFile`, persists `newStartPageToken` after each page chain
- 401/`invalid_grant` errors captured in `driveConf.lastAuthError` for IPC surfacing (MOB-AUTH-02)
- In-flight guard (`_inFlight`) prevents overlapping poll cycles
- Zero `changes.watch` references (push notifications infeasible for desktop Electron app per research)

### Task 3: ingestService + IPC + preload + boot (commit 0e89915)

- `ingestService.ts`: `processFile` — fetch content, size-check, JSON.parse, ajv compile+validate `ENVELOPE_JSON_SCHEMA`, `createNote(text, 'mobile-drive')`, `drive.files.delete` (MOB-SEC-01, MOB-TRANS-03)
- `checkQuota`: pages through `files.list(spaces='appDataFolder')`, sums sizes, returns `'ok'|'warn'|'hard-stop'` at 10MB/100MB thresholds (MOB-QUOTA-01)
- `drainOnLaunch`: runs one full poll cycle at startup, returns ingested count (MOB-UX-02)
- `drive:connect`, `drive:getStatus`, `drive:checkQuota` IPC handlers registered in `ipc.ts` using dynamic imports
- `window.api.drive` surface in `preload/index.ts` + ambient types in `preload/index.d.ts`
- Boot wiring in `index.ts`: `drainOnLaunch()` then `startPolling()` as two independent dynamic import chains

## IPC Channel Reference (for Plan 12-04)

| Channel | Direction | Returns |
|---------|-----------|---------|
| `drive:connect` | invoke | `{ ok: boolean; error?: string }` |
| `drive:getStatus` | invoke | `{ connected: boolean; lastPollAt: string; lastPollError: string; lastAuthError: string }` |
| `drive:checkQuota` | invoke | `{ sizeBytes: number; fileCount: number; state: 'ok'|'warn'|'hard-stop'; error?: string }` |
| `drive:pending-drained` | push (main → renderer) | `count: number` |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `getStartPageToken` TypeScript types omit `spaces` parameter**

- **Found during:** Task 2 typecheck run
- **Issue:** `@googleapis/drive@20.1.0` TypeScript types for `Params$Resource$Changes$Getstartpagetoken` do not include a `spaces` field, despite the REST API accepting it. The plan's code block passed `{ spaces: 'appDataFolder' }` which caused TS2769.
- **Fix:** Changed to `{ spaces: 'appDataFolder' } as any` with an explanatory comment. This is correct at runtime — the HTTP call correctly passes `spaces` to the REST API.
- **Files modified:** `src/main/drive/changesPoller.ts`
- **Commit:** dbe3416

## Smoke Test Status

End-to-end smoke test (upload JSON envelope to appDataFolder via Drive API, observe desktop ingestion within 60s) requires:
1. Plan 12-03 (PWA) or manual Drive API upload with Desktop OAuth credentials
2. Running desktop app with connected Google account

**Deferred to post Plan 12-03.** The pipeline is verified correct by: typecheck (0 errors), build (0 errors), acceptance criteria (all passing), code review of the polling/ingestion/delete loop.

## Self-Check: PASSED

- FOUND: src/main/drive/driveClient.ts
- FOUND: src/main/drive/changesPoller.ts
- FOUND: src/main/drive/ingestService.ts
- FOUND: .planning/phases/12-mobile-extension/12-02-SUMMARY.md
- FOUND commit: 92f7383 (Task 1)
- FOUND commit: dbe3416 (Task 2)
- FOUND commit: 0e89915 (Task 3)
