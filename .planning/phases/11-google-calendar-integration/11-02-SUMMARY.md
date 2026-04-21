---
phase: 11
plan: 02
subsystem: google-calendar-auth
tags: [oauth2, pkce, safeStorage, electron-conf, ipc, preload]
dependency_graph:
  requires: [11-01]
  provides: [buildCalendarClient, window.api.calendar, calendar-settings-conf]
  affects: [11-04, 11-05, 11-06]
tech_stack:
  added: [google-auth-library (OAuth2Client, CodeChallengeMethod), "@googleapis/calendar (calendar factory)"]
  patterns: [loopback-pkce-oauth, safeStorage-encrypt-base64, separate-conf-instance, ipc-handler-registration, ambient-preload-types]
key_files:
  created:
    - src/main/calendar/env.d.ts
    - src/main/calendar/oauthFlow.ts
    - src/main/calendar/tokenStore.ts
    - src/main/calendar/googleClient.ts
  modified:
    - src/main/ipc.ts
    - src/preload/index.ts
    - src/preload/index.d.ts
decisions:
  - "Used CodeChallengeMethod.S256 enum (not string literal 'S256') — required by google-auth-library TypeScript types"
  - "Used calendar() factory from @googleapis/calendar (not google.calendar()) — google is not a named export of the package"
  - "Removed 'localhost' from comments in oauthFlow.ts to satisfy acceptance-criteria grep (code uses 127.0.0.1 throughout)"
metrics:
  duration_minutes: 25
  completed_date: "2026-04-21"
  tasks_completed: 2
  files_changed: 7
---

# Phase 11 Plan 02: OAuth2 Loopback + PKCE Calendar Auth Summary

Complete OAuth 2.0 loopback+PKCE flow for Google Calendar with safeStorage-encrypted token storage, authorized Calendar v3 client factory, and full `window.api.calendar.*` IPC/preload surface.

## What Was Built

### 4 new files under src/main/calendar/

**env.d.ts** — Ambient TypeScript declarations for build-time constants:
```typescript
declare const __GOOGLE_CLIENT_ID__: string
declare const __GOOGLE_CLIENT_SECRET__: string
```
These make the electron-vite `define` replacements (Plan 11-01) visible to TypeScript in the main process without any `process.env` reads at runtime.

**oauthFlow.ts** — Loopback + PKCE OAuth flow exports:
- `startOAuthFlow(): Promise<OAuthTokens>` — Spins up ephemeral HTTP server on `127.0.0.1:0`, generates PKCE S256 challenge via `oAuth2Client.generateCodeVerifierAsync()`, opens browser to consent URL via `shell.openExternal()`, awaits redirect, exchanges code+verifier for tokens, shuts down server. 5-minute timeout guard.
- `revokeToken(token: string): Promise<void>` — POST to `https://oauth2.googleapis.com/revoke`, treats 400 as success (already-expired token).
- CAL-SEC-03: port 0 (OS picks ephemeral) + `127.0.0.1` literal (not hostname).
- `CodeChallengeMethod.S256` enum (not string literal — TypeScript type requirement).

**tokenStore.ts** — safeStorage-encrypted refresh token + calendar-settings Conf:
- Separate `new Conf({ name: 'calendar-settings' })` instance — writes to `userData/calendar-settings.json`, never to `settings.json`.
- `storeRefreshToken(token)`: `safeStorage.encryptString(token).toString('base64')` → conf.
- `getRefreshToken()`: conf → `Buffer.from(enc, 'base64')` → `safeStorage.decryptString()`. Returns null on DPAPI mismatch (parallels ipc.ts line 44 pattern).
- `clearTokens()`, `isConnected()`, `getLastSuccess()`, `markSyncSuccess()`, `isEncryptionAvailable()`
- `getConfirmBeforeCreate()`, `setConfirmBeforeCreate()`, `getDontAskDeleteCalEvent()`, `setDontAskDeleteCalEvent()`

**googleClient.ts** — Authorized Calendar v3 factory:
- `buildCalendarClient(): calendar_v3.Calendar` — reads stored refresh token, constructs `OAuth2Client` with build-time credentials, calls `auth.setCredentials({ refresh_token })`, returns `calendar({ version: 'v3', auth })`.
- Plans 11-04 and 11-05 import this directly.

### 5 IPC channels registered in ipc.ts

| Channel | Return Type | Purpose |
|---------|------------|---------|
| `calendar:getStatus` | `{ connected, lastSuccess, encryptionAvailable, confirmBeforeCreate }` | Health check + status |
| `calendar:connect` | `{ ok: boolean; error?: string }` | Run OAuth flow, store refresh token |
| `calendar:disconnect` | `{ ok: boolean }` | Revoke grant + clear local tokens |
| `calendar:setConfirmBeforeCreate` | `void` | Toggle confirm-before-create preference |
| `calendar:openLink` | `void` | Open Google Calendar event URL (allowlist guarded) |

`calendar:openLink` rejects any URL not matching `/^https:\/\/calendar\.google\.com\//` — renderer cannot use it to launch arbitrary URLs.

### window.api.calendar preload surface

```typescript
calendar: {
  getStatus: () => Promise<{ connected, lastSuccess, encryptionAvailable, confirmBeforeCreate }>
  connect: () => Promise<{ ok: boolean; error?: string }>
  disconnect: () => Promise<{ ok: boolean }>
  setConfirmBeforeCreate: (value: boolean) => Promise<void>
  openLink: (url: string) => Promise<void>
}
```

`src/preload/index.d.ts` updated with ambient type block — no import statements (stays ambient global augmentation per STATE.md line 134).

## Build-Time Define Verification

To verify client credentials are inlined at build time (not read at runtime):
```bash
grep "process.env.GOOGLE" out/main/index.js  # should return zero hits
grep -c "__GOOGLE_CLIENT" out/main/index.js   # should return zero (replaced by values)
```
The credentials appear as inlined string literals in the compiled bundle. After populating `.env.local` with real credentials, the first chars of the client secret can be found once in `out/main/index.js` — no `process.env.GOOGLE_CLIENT_SECRET` lookups remain.

## Security Requirements Closed

- **CAL-SEC-01**: `client_secret` is a build-time define replacement only. No string literal in source. `grep -rE "GOCSPX-[A-Za-z0-9_-]{20,}" src` returns zero hits.
- **CAL-SEC-02**: Refresh token only ever stored via `safeStorage.encryptString()` → base64 → `calendar-settings.json`. Never plaintext. `google-auth-library` access tokens are ephemeral in memory only.
- **CAL-SEC-03**: Loopback server on `127.0.0.1` with port 0 (OS-assigned ephemeral). `shell.openExternal()` opens browser — renderer stays sandboxed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `google` is not a named export of `@googleapis/calendar`**
- **Found during:** Task 1 — `typecheck:node`
- **Issue:** Plan specified `import { google, calendar_v3 } from '@googleapis/calendar'` but the package exports `{ calendar, ... }` not `{ google }`.
- **Fix:** Changed to `import { calendar, calendar_v3 } from '@googleapis/calendar'` and `return calendar({ version: 'v3', auth })`.
- **Files modified:** src/main/calendar/googleClient.ts
- **Commit:** 2e8ec53

**2. [Rule 1 - Bug] `code_challenge_method: 'S256'` string not assignable to `CodeChallengeMethod`**
- **Found during:** Task 1 — `typecheck:node`
- **Issue:** `google-auth-library` types require `CodeChallengeMethod` enum value, not a string literal.
- **Fix:** Added `CodeChallengeMethod` to import; changed to `code_challenge_method: CodeChallengeMethod.S256`.
- **Files modified:** src/main/calendar/oauthFlow.ts
- **Commit:** 2e8ec53

**3. [Rule 2 - Comment cleanup] Removed "localhost" from oauthFlow.ts comments**
- **Found during:** Task 1 verification grep
- **Issue:** Plan acceptance criteria: "does NOT contain the literal string `localhost`". Comments explaining pitfall used the word.
- **Fix:** Rephrased comments to explain the pitfall without using the forbidden string.
- **Files modified:** src/main/calendar/oauthFlow.ts
- **Commit:** 2e8ec53

## Self-Check

### Files exist:

- `src/main/calendar/env.d.ts` — FOUND
- `src/main/calendar/oauthFlow.ts` — FOUND
- `src/main/calendar/tokenStore.ts` — FOUND
- `src/main/calendar/googleClient.ts` — FOUND

### Commits:

- `2e8ec53` — feat(11-02): create OAuth2 loopback+PKCE calendar module files
- `256399a` — feat(11-02): register calendar:* IPC handlers + preload surface

## Self-Check: PASSED
