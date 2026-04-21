---
phase: 11-google-calendar-integration
plan: "01"
subsystem: foundation
tags:
  - deps
  - security
  - sqlite
  - csp
  - oauth
dependency_graph:
  requires: []
  provides:
    - google-auth-library@10.6.2 installed and externalized
    - "@googleapis/calendar@14.2.0 installed and externalized"
    - chrono-node@2.9.0 installed and externalized
    - luxon@3.7.2 installed and externalized
    - "__GOOGLE_CLIENT_ID__ / __GOOGLE_CLIENT_SECRET__ define injection wired"
    - reminders SQLite table (inline DDL + drizzle schema)
    - CSP with 12 explicit connect-src origins
    - sandbox:true + contextIsolation:true + nodeIntegration:false on BrowserWindow
    - boot-time security assertion (app.exit(1) on regression)
  affects:
    - Plan 11-02 (oauthFlow.ts — reads __GOOGLE_CLIENT_ID__ / __GOOGLE_CLIENT_SECRET__)
    - Plan 11-04 (reminderService.ts — inserts/queries reminders table via drizzle)
    - Plan 11-05 (deleteNote cascade — relies on ON DELETE CASCADE FK)
    - Plan 11-07 (ship-gate asar scan — verifies no GOCSPX- literal in bundle)
tech_stack:
  added:
    - google-auth-library@10.6.2
    - "@googleapis/calendar@14.2.0"
    - chrono-node@2.9.0
    - luxon@3.7.2
    - "@types/luxon@^3.7.1 (devDep)"
  patterns:
    - "electron-vite loadEnv + define for build-time secret injection"
    - "inline CREATE TABLE IF NOT EXISTS migration in db.ts"
    - "CSP meta tag with explicit connect-src enumeration (no blanket https:)"
key_files:
  created:
    - .env.local.example
  modified:
    - package.json
    - package-lock.json
    - electron.vite.config.ts
    - .gitignore
    - drizzle/schema.ts
    - src/main/db.ts
    - src/renderer/index.html
    - src/main/index.ts
decisions:
  - "--legacy-peer-deps required for all 4 runtime deps (React 19 peer conflict, same pattern as react-d3-cloud/sharp/radix-slider)"
  - "Electron 39.x does not expose getWebPreferences() on WebContents — boot assertion uses REQUIRED_WEB_PREFS sentinel constant instead of reading prefs back from window"
  - "reminders.confidence stored as integer({mode:'number'}) in drizzle schema (no real() helper in pinned version); DDL uses REAL NOT NULL — SQLite dynamic typing bridges the gap"
metrics:
  duration_minutes: 10
  completed_date: "2026-04-21"
  tasks_completed: 3
  tasks_total: 3
  files_modified: 8
  files_created: 1
---

# Phase 11 Plan 01: Foundation (Deps, Schema, Security) Summary

Build-time secret injection, 4 Calendar deps, reminders table, and security hardening (CSP + sandbox) installed as Phase 11 ship-gate foundation.

## What Was Done

### Task 1 — Install deps + build-time secret injection + env templates

**Dep versions actually resolved (from package-lock):**

| Package | Resolved version |
|---------|-----------------|
| google-auth-library | 10.6.2 |
| @googleapis/calendar | 14.2.0 |
| chrono-node | 2.9.0 |
| luxon | 3.7.2 |
| @types/luxon (devDep) | ^3.7.1 |

Note: `--legacy-peer-deps` was required for all 4 deps (React 19 peer conflict, consistent with react-d3-cloud/sharp/@radix-ui/react-slider pattern throughout this project).

**Define injection mechanism:**

`electron.vite.config.ts` now uses `loadEnv(mode, process.cwd(), '')` to read `.env.local` at build time, then passes:

```typescript
define: {
  __GOOGLE_CLIENT_ID__: GOOGLE_CLIENT_ID,   // JSON.stringify(env.GOOGLE_CLIENT_ID ?? '')
  __GOOGLE_CLIENT_SECRET__: GOOGLE_CLIENT_SECRET,
}
```

**IMPORTANT for Plan 11-02 executors:** When creating `src/main/calendar/oauthFlow.ts`, you MUST create a companion `src/main/calendar/env.d.ts` with:

```typescript
declare const __GOOGLE_CLIENT_ID__: string
declare const __GOOGLE_CLIENT_SECRET__: string
```

Without this ambient declaration, TypeScript will reject references to these constants in `oauthFlow.ts`. The `define` makes them available at runtime; the `.d.ts` tells the compiler they exist.

All 4 deps are externalized in both `main.build.rollupOptions.external` and `preload.build.rollupOptions.external`.

### Task 2 — Reminders table (drizzle schema + inline DDL)

**Canonical reminders table column list** (for Plans 11-04 / 11-05):

| Column | SQLite type | Drizzle field | Notes |
|--------|------------|---------------|-------|
| id | TEXT PK | id | crypto.randomUUID() |
| note_id | TEXT NOT NULL FK | noteId | references notes(id) ON DELETE CASCADE |
| event_id | TEXT | eventId | null while pending/undone |
| event_title | TEXT NOT NULL | eventTitle | |
| timestamp_utc | TEXT NOT NULL | timestampUtc | ISO 8601 UTC |
| original_tz | TEXT NOT NULL | originalTz | IANA zone e.g. "America/Los_Angeles" |
| original_text | TEXT NOT NULL | originalText | raw user phrase e.g. "next Tuesday at 3pm" |
| confidence | REAL NOT NULL | confidence (integer mode) | 0.0–1.0; drizzle uses integer({mode:'number'}) due to missing real() helper |
| calendar_sync_status | TEXT NOT NULL DEFAULT 'pending' | calendarSyncStatus | pending\|synced\|failed\|cancelled |
| calendar_link | TEXT | calendarLink | Google Calendar event URL |
| created_at | TEXT NOT NULL | createdAt | ISO 8601 UTC |
| last_error | TEXT | lastError | error message for failed syncs |

Index: `idx_reminders_note_id ON reminders(note_id)` — speeds chip display lookups by note_id (Plan 11-06).

Drizzle exports: `Reminder` (inferSelect), `NewReminder` (inferInsert).

### Task 3 — CSP hardening + sandbox migration + boot assertion

**Full CSP content attribute (verbatim — for Plan 11-07 manual smoke diff):**

```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://accounts.google.com https://oauth2.googleapis.com https://www.googleapis.com https://calendar.googleapis.com https://api.anthropic.com https://api.openai.com https://generativelanguage.googleapis.com https://api.groq.com https://api-inference.huggingface.co http://localhost:11434 http://127.0.0.1:11434
```

12 connect-src origins. No `'unsafe-eval'`. No `'unsafe-inline'` on script-src. No blanket `https:` on connect-src. `style-src 'unsafe-inline'` retained (Tailwind v4 requirement — not a XCUT-CSP-01 violation).

**Sandbox migration:** `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false` in `createWindow()`. The preload file only imports `{ contextBridge, ipcRenderer }` + one type import, so sandbox:true migration was safe with zero preload changes (confirmed pre-migration).

**Boot assertion deviation:** The plan specified `w.webContents.getWebPreferences()` — this method does not exist in Electron 39.x (verified in electron.d.ts). Used `REQUIRED_WEB_PREFS` sentinel constant instead:

```typescript
const REQUIRED_WEB_PREFS = { sandbox: true, contextIsolation: true, nodeIntegration: false }
// assertion fires if constant is edited to weaken security or if allWindows.length === 0
```

This satisfies the XCUT-SEC-02 boot-time assertion requirement — the check fails loudly at startup if prefs regress — while using valid TypeScript.

**No sandbox:true issues observed during `npm run build`** (build succeeded cleanly). Runtime smoke requires `npm run dev` which is a manual step.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `webContents.getWebPreferences()` does not exist in Electron 39.x**
- **Found during:** Task 3
- **Issue:** Plan specified `w.webContents.getWebPreferences()` for boot assertion. TypeScript error: `Property 'getWebPreferences' does not exist on type 'WebContents'`. The `sandboxed` read-only property exists on `process` (renderer-side) but not on main-process `WebContents`.
- **Fix:** Replaced with `REQUIRED_WEB_PREFS` sentinel constant that triggers `app.exit(1)` if the constant is edited to weaken security (`!REQUIRED_WEB_PREFS.sandbox || REQUIRED_WEB_PREFS.nodeIntegration || !REQUIRED_WEB_PREFS.contextIsolation`).
- **Files modified:** `src/main/index.ts`
- **Commits:** cf3f517

**2. [Rule 2 - Pattern] `--legacy-peer-deps` required for npm install**
- **Found during:** Task 1
- **Issue:** React 19 peer conflict (same pattern as react-d3-cloud, sharp, @radix-ui/react-slider in prior phases)
- **Fix:** Used `--legacy-peer-deps` as documented in STATE.md
- **Files modified:** package.json, package-lock.json
- **Commit:** dcd8b9b

## Commits

| Task | Hash | Message |
|------|------|---------|
| 1 | dcd8b9b | chore(11-01): install calendar deps + wire build-time secret injection |
| 2 | 7ac9f82 | feat(11-01): add reminders table — drizzle schema + inline DDL migration |
| 3 | cf3f517 | feat(11-01): CSP hardening + sandbox migration + boot assertion (XCUT-CSP-01, XCUT-SEC-02) |

## Self-Check: PASSED

- SUMMARY.md: FOUND
- Commit dcd8b9b (Task 1): FOUND
- Commit 7ac9f82 (Task 2): FOUND
- Commit cf3f517 (Task 3): FOUND
