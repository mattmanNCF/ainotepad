# Phase 12: Mobile Extension (Drive Transport) — Research

**Researched:** 2026-04-22
**Domain:** Google Drive REST API v3 (appDataFolder + Changes API), Google Identity Services (browser OAuth), vite-plugin-pwa + GitHub Pages, idb (IndexedDB), incremental OAuth consent
**Confidence:** HIGH on architecture resolution + stack; MEDIUM on appDataFolder cross-client isolation details; HIGH on push infeasibility

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MOB-AUTH-01 | Single Google OAuth consent combines `calendar.events` + `drive.appdata` scopes; no separate mobile pairing flow | Incremental consent via `include_granted_scopes=true` in the Electron Desktop-app flow (Phase 11 already implemented). Desktop adds `drive.appdata` to existing grant. Mobile PWA uses GIS token model with same `drive.appdata` scope using a **Web OAuth client** (separate client ID, same GCP project). Desktop reads the appDataFolder files written by any client in the project — see Architecture Resolution #1. |
| MOB-AUTH-02 | Mobile identity = Google account; revoke = user revokes OAuth at Google Account security page; desktop detects 401, surfaces in Settings → Integrations | 401 detection handled by `google-auth-library` OAuth2Client refresh failure; same pattern as Phase 11 tokenStore. |
| MOB-TRANS-01 | Transport = Drive `appDataFolder` (OAuth-client-private, no public links, no shared folders) | `files.create` with `parents: ['appDataFolder']` + `spaces: 'appDataFolder'`. See architecture note — appDataFolder is scoped per GCP project (not per client ID); Desktop client can read files written by Web client within same project. MEDIUM confidence — not explicitly confirmed by Google docs, but consistent with "application = GCP project" semantics. |
| MOB-TRANS-02 | Desktop uses Drive Changes API with checkpointed `startPageToken`; polling fallback at 60s interval if Changes subscription fails | **Push is categorically infeasible for a desktop Electron app.** `changes.watch` requires a publicly reachable, domain-verified HTTPS webhook. Plan must use polling-only (60s interval) as the primary mechanism. The "push preferred, polling fallback" framing in the roadmap should collapse to polling-only with `spaces=appDataFolder`. |
| MOB-TRANS-03 | Desktop deletes Drive file after successful ingestion via `createNote()`; no cloud retention of note text | `drive.files.delete(fileId)` using `@googleapis/drive`. Straightforward delete after confirmed SQLite insert. |
| MOB-PWA-01 | Mobile PWA hosted as static artifact at `https://mattmanNCF.github.io/notal-mobile/`; installable on iOS and Android; offline-first with IndexedDB queue | `vite-plugin-pwa` + `base: '/notal-mobile/'` + manifest with `start_url: '/notal-mobile/'`. iOS requires explicit `<link rel="apple-touch-icon">` HTML tags. IndexedDB eviction: installed PWA on iOS home screen does NOT get the 7-day cap. |
| MOB-PWA-02 | Capture-only UI on mobile: text input, submit, delivery-state badge; no browse, search, or wiki access | Single-component React PWA. No routing needed. |
| MOB-SEC-01 | Per-file schema validation on desktop (≤16KB text, strict JSON schema, malformed rejected and logged); `createNote(rawText, source)` single code path | Use `ajv` (8.18.0) on desktop — already in Node.js context. Zod would work but `ajv` is lighter for a pure validation gate. |
| MOB-UX-01 | Mobile shows explicit delivery states: local → uploading → on-drive → ingested (observed via Drive file deletion) | State machine in PWA: `local` (queued in IDB) → `uploading` (fetch in progress) → `on-drive` (Drive file created) → `ingested` (Drive file deleted, observed by polling interval). |
| MOB-UX-02 | Desktop-wake grace banner: on app launch, drain pending Drive notes and report count processed | `ingestService.drainOnLaunch()` called from `app.whenReady()` after `googleClient` is initialized. Returns count for IPC push to renderer. |
| MOB-QUOTA-01 | Warn at 10MB appdata folder; hard stop at 100MB (indicates stuck ingestion loop); user surfaced in Settings | `drive.about.get({ fields: 'storageQuota,appInstalled' })` returns per-user quota. `files.list({ spaces: 'appDataFolder' })` with `fields: 'files(size)'` for folder size calculation. |
</phase_requirements>

---

## CRITICAL ARCHITECTURE RESOLUTION

### #1: appDataFolder Cross-Client Access

**Finding (MEDIUM confidence):** appDataFolder is scoped per GCP project per user — not per OAuth client ID. A Desktop client and a Web client belonging to the same GCP project both access the same `appDataFolder` namespace for a given user's Google account.

**Why it matters:** MOB-TRANS-01 requires the desktop to read files written by the mobile PWA. If appDataFolder were per-client-ID, this would be impossible without a relay server. The "per application" semantics in Google's documentation (`"Only the application that created the data in the appDataFolder can access it"`) refers to GCP application/project, not client ID.

**Practical implication:** The mobile PWA uses a **Web OAuth client** (separate client ID from the Desktop client). Both are in the same GCP project. Both access the same `appDataFolder`. This is consistent with how apps like rclone and Duplicacy work — same project, multiple clients, shared appDataFolder.

**Confidence justification:** MEDIUM — Google's official docs do not explicitly state "per-project" vs "per-client-ID" scoping. However: (1) The "per application" framing consistently refers to the GCP project; (2) Multiple practical implementations confirm shared access within a project; (3) The alternative (per-client-ID) would make cross-platform apps using appDataFolder nearly impossible without a relay. The planner should note this as a testable assumption to verify during Wave 0 with a manual auth check.

**Action:** Create two OAuth clients in the same GCP project: (a) the existing Desktop-app client (Phase 11), (b) a new Web-app client for the PWA. Both request `drive.appdata` scope. Both will access the same folder.

### #2: Drive Changes Push Notifications Are Infeasible

**Finding (HIGH confidence — confirmed by official docs):** `changes.watch` requires a publicly accessible, domain-verified HTTPS webhook URL. An Electron desktop app cannot expose one. This is not a workaround situation — it is a hard architectural constraint.

**Impact on MOB-TRANS-02:** Drop "push preferred" framing entirely. The plan is polling-only at 60s intervals using `changes.list?spaces=appDataFolder&pageToken={checkpoint}`. This is the correct primary (and only) mechanism. The planner should reframe MOB-TRANS-02 as: "Desktop polls Drive Changes API with `spaces=appDataFolder` at 60s intervals using a checkpointed `startPageToken`."

**Changes API polling pattern:**
1. On first launch after auth: call `changes.getStartPageToken({ spaces: 'appDataFolder' })`, persist result.
2. Every 60s: call `changes.list({ pageToken: checkpoint, spaces: 'appDataFolder', includeRemoved: true })`.
3. For each change with `removed: false`, fetch the file content, validate schema, ingest via `createNote()`, delete Drive file.
4. Persist `newStartPageToken` for next poll.

### #3: Mobile PWA OAuth Uses Google Identity Services (GIS), Not `google-auth-library`

**Finding (HIGH confidence):** `google-auth-library` is a Node.js library — it cannot run in a browser. The mobile PWA must use the **Google Identity Services (GIS)** JavaScript library (`accounts.google.com/gsi/client`). GIS provides a token model (implicit-like, access tokens only, no refresh tokens) suitable for a static client-side PWA.

**Impact:** No refresh tokens on mobile. Each PWA session re-requests an access token via `google.accounts.oauth2.initTokenClient({ client_id: WEB_CLIENT_ID, scope: 'drive.appdata' }).requestAccessToken()`. The access token (1-hour TTL) is kept in memory. On re-open, the user sees a silent re-authorization (if still signed in to the same Google account, this is a single click or automatic).

**No backend required:** GIS token model is designed for client-side apps — no backend token exchange. The access token is returned directly to the callback and used immediately for Drive API calls via `fetch`.

**Offline behavior:** Access token is in memory. When offline, the PWA queues to IDB without a token. On reconnect + re-auth, the queue drains. Token state does not survive a page reload — the PWA must re-auth on open.

---

## Summary

Phase 12 builds two distinct systems: (1) a static PWA (`mobile-pwa/` sub-project) deployed to GitHub Pages that captures text and writes JSON envelopes to Drive `appDataFolder` using GIS browser OAuth, and (2) a desktop ingestion service (`src/main/drive/`) that polls Drive Changes API every 60 seconds for new files, validates and ingests them via `createNote()`, and deletes the Drive file.

Three critical findings reshape the roadmap framing. First, Drive push subscriptions (`changes.watch`) are **impossible** for a desktop app with no public webhook — the plan collapses to polling-only, which is fully acceptable for a ≤60s delivery window. Second, the mobile PWA **cannot use `google-auth-library`** — it must use Google Identity Services (GIS) in the browser, which provides access tokens only (no refresh tokens); this is correct behavior for a capture-only offline-first PWA. Third, appDataFolder cross-client access within the same GCP project is the load-bearing architectural assumption — MEDIUM confidence but well-supported by practical implementations; it must be verified manually during Wave 0.

The rest of the phase is straightforward by comparison: `vite-plugin-pwa` with `base: '/notal-mobile/'` handles the GitHub Pages static deploy; `idb@8.0.3` provides the offline queue; COOP/COEP headers are not required (no SharedArrayBuffer or Wasm threads); schema validation uses `ajv` in the desktop ingestion path; iOS Safari PWAs added to home screen do not suffer the 7-day IndexedDB eviction.

**Primary recommendation:** Build desktop ingestion (polling + ingest + delete) and mobile PWA (GIS auth + IDB queue + Drive upload) as independent units with a shared JSON envelope schema. Verify appDataFolder cross-client access in Wave 0 before building the ingestion path.

---

## Standard Stack

### Core (Desktop — Electron main process)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @googleapis/drive | 20.1.0 | Drive REST API v3: files.create, files.delete, files.list, changes.getStartPageToken, changes.list | Official per-service submodule; reuses same google-auth-library OAuth2Client from Phase 11; 20.1.0 is current (npm verified 2026-04-22) |
| google-auth-library | 10.6.2 | OAuth2Client for Drive scope add (incremental consent from Phase 11 tokens) | Already installed in Phase 11; no additional install needed |
| ajv | 8.18.0 | Per-file JSON schema validation in desktop ingestion path (≤16KB, strict schema) | Node.js context; most performant JSON schema validator; 8.18.0 is current (npm verified 2026-04-22) |

### Core (Mobile PWA — browser)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vite-plugin-pwa | 1.2.0 | Service worker generation, manifest, offline caching for static Vite PWA | Official Vite PWA plugin; 1.2.0 is current (npm verified 2026-04-22) |
| idb | 8.0.3 | Promise-based IndexedDB wrapper for offline note queue | Jake Archibald's library — 1.19kB brotli, TypeScript schemas, correct transaction lifetime management; 8.0.3 is current |
| Google Identity Services | CDN (gsi/client) | Browser OAuth for drive.appdata access tokens | Required for browser-side Google OAuth; google-auth-library is Node-only; GIS token model = no backend needed |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| React 19 + Vite 6 | (existing) | Mobile PWA renderer | Reuse project stack for the mobile-pwa/ sub-project |
| TailwindCSS v4 | (existing) | Capture-only mobile UI | Minimal styling; same import pattern as main app |
| @types/ajv | n/a | ajv ships its own types | No separate @types needed for ajv v8 |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| ajv (desktop validation) | zod | zod (~13KB minified) is heavier than needed for a pure validation gate on desktop; ajv is faster and has better JSON Schema compliance |
| idb | Dexie.js | Dexie is more full-featured but heavier; idb mirrors the IDB API cleanly; for a simple queue, idb is sufficient |
| Google Identity Services (GIS) | MSAL / custom OAuth2 | GIS is the official Google-first-party library for browser OAuth; others don't integrate cleanly with Google consent UX |
| polling (changes.list) | push (changes.watch) | Push requires a public HTTPS webhook — infeasible for desktop; polling at 60s is the correct primary mechanism |

**Installation (desktop additions):**
```bash
npm install @googleapis/drive ajv --legacy-peer-deps
```

**Installation (mobile-pwa/ sub-project):**
```bash
cd mobile-pwa && npm install vite-plugin-pwa idb --legacy-peer-deps
```

Note: `--legacy-peer-deps` required for React 19 peer dep conflict — consistent with all Phase 11 installs.

**Version verification (npm, 2026-04-22):**
- `@googleapis/drive`: 20.1.0
- `ajv`: 8.18.0
- `vite-plugin-pwa`: 1.2.0
- `idb`: 8.0.3

---

## Architecture Patterns

### Recommended Project Structure

```
mobile-pwa/                      # Separate Vite project (sub-project)
├── package.json                 # Independent deps: vite, vite-plugin-pwa, idb, react
├── vite.config.ts               # base: '/notal-mobile/', VitePWA plugin
├── index.html                   # apple-touch-icon links, GIS script tag, theme-color
├── src/
│   ├── main.tsx                 # React entry
│   ├── App.tsx                  # Single capture component (no routing)
│   ├── auth/
│   │   └── gisClient.ts         # GIS token client init, requestAccessToken()
│   ├── queue/
│   │   └── noteQueue.ts         # idb offline queue: enqueue, drain, status
│   └── drive/
│       └── driveUpload.ts       # files.create to appDataFolder via fetch
src/main/drive/                  # Desktop ingestion module
├── driveClient.ts               # @googleapis/drive + google-auth-library: builds Drive client with drive.appdata scope
├── changesPoller.ts             # 60s interval, changes.list, startPageToken checkpoint
└── ingestService.ts             # validate (ajv) + createNote() + files.delete + quota check
```

### Pattern 1: Desktop — Drive Client with Incremental Scope

**What:** Add `drive.appdata` to the existing Phase 11 OAuth grant using `include_granted_scopes: true`. The user sees a single incremental-consent prompt the first time Phase 12 features are accessed.

**When to use:** In `driveClient.ts`, when the `drive.appdata` scope is not yet in the stored refresh token's scopes.

```typescript
// src/main/drive/driveClient.ts
// Source: google-auth-library docs + Phase 11 oauthFlow.ts pattern
import { OAuth2Client } from 'google-auth-library'
import { drive_v3, google } from '@googleapis/drive'
import { getRefreshToken, storeRefreshToken } from '../calendar/tokenStore'

const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events'
const DRIVE_APPDATA_SCOPE = 'https://www.googleapis.com/auth/drive.appdata'

export async function buildDriveClient(): Promise<drive_v3.Drive> {
  const auth = new OAuth2Client({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  })
  const refreshToken = getRefreshToken()
  if (!refreshToken) throw new Error('No Google refresh token — connect Calendar first')
  auth.setCredentials({ refresh_token: refreshToken })
  return google.drive({ version: 'v3', auth })
}

// Incremental consent URL for drive.appdata scope add (called from settings IPC if needed)
export async function buildDriveScopeConsentUrl(port: number): Promise<string> {
  const auth = new OAuth2Client({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: `http://127.0.0.1:${port}`,
  })
  return auth.generateAuthUrl({
    access_type: 'offline',
    scope: [CALENDAR_SCOPE, DRIVE_APPDATA_SCOPE],
    include_granted_scopes: true,   // KEY: incremental consent
    prompt: 'consent',
  })
}
```

### Pattern 2: Desktop — Changes API Polling (spaces=appDataFolder)

**What:** Poll Drive Changes API every 60 seconds using a checkpointed `startPageToken`. Only scan `appDataFolder` space. Process any new files (notes from mobile), then clear them.

```typescript
// src/main/drive/changesPoller.ts
import { drive_v3 } from '@googleapis/drive'
import { Conf } from 'electron-conf/main'
import { ingestService } from './ingestService'

const driveConf = new Conf<{ startPageToken: string }>({ name: 'drive-settings' })

export async function initStartPageToken(drive: drive_v3.Drive): Promise<void> {
  if (driveConf.get('startPageToken')) return
  const res = await drive.changes.getStartPageToken({ spaces: 'appDataFolder' })
  driveConf.set('startPageToken', res.data.startPageToken!)
}

export async function pollChanges(drive: drive_v3.Drive): Promise<number> {
  const pageToken = driveConf.get('startPageToken')
  if (!pageToken) return 0

  let processedCount = 0
  const res = await drive.changes.list({
    pageToken,
    spaces: 'appDataFolder',
    includeRemoved: true,
    fields: 'changes(fileId,removed,file(id,name,size)),newStartPageToken,nextPageToken',
  })

  for (const change of res.data.changes ?? []) {
    if (change.removed || !change.fileId) continue
    // Only process JSON envelope files
    if (!change.file?.name?.endsWith('.json')) continue
    const ingested = await ingestService.processFile(drive, change.fileId)
    if (ingested) processedCount++
  }

  // Checkpoint the new token
  if (res.data.newStartPageToken) {
    driveConf.set('startPageToken', res.data.newStartPageToken)
  }
  return processedCount
}

// Start the 60-second polling interval
let _pollInterval: NodeJS.Timeout | null = null
export function startPolling(drive: drive_v3.Drive): void {
  if (_pollInterval) return
  _pollInterval = setInterval(() => pollChanges(drive).catch(console.error), 60_000)
}
export function stopPolling(): void {
  if (_pollInterval) { clearInterval(_pollInterval); _pollInterval = null }
}
```

### Pattern 3: Desktop — File Ingestion with Schema Validation

**What:** Fetch file content, validate against strict JSON schema using ajv, call `createNote(rawText, source)`, then delete the Drive file. Quota check before processing.

```typescript
// src/main/drive/ingestService.ts
import Ajv from 'ajv'
import { drive_v3 } from '@googleapis/drive'
import { createNote } from '../ipc'   // shared createNote(rawText, source) code path

const ajv = new Ajv({ allErrors: false })

const envelopeSchema = {
  type: 'object',
  properties: {
    v: { type: 'number', const: 1 },
    text: { type: 'string', minLength: 1, maxLength: 16384 },   // 16KB limit
    ts: { type: 'string' },                                      // ISO timestamp
    device: { type: 'string' }                                   // optional device hint
  },
  required: ['v', 'text', 'ts'],
  additionalProperties: false
}
const validate = ajv.compile(envelopeSchema)

export async function processFile(drive: drive_v3.Drive, fileId: string): Promise<boolean> {
  try {
    // Fetch file content
    const res = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'text' }
    )
    const raw = res.data as unknown as string
    if (typeof raw !== 'string' || raw.length > 16384) {
      console.error('[ingest] File too large or invalid, deleting:', fileId)
      await drive.files.delete({ fileId })
      return false
    }

    let envelope: unknown
    try { envelope = JSON.parse(raw) } catch {
      console.error('[ingest] JSON parse failed, deleting:', fileId)
      await drive.files.delete({ fileId })
      return false
    }

    if (!validate(envelope)) {
      console.error('[ingest] Schema validation failed:', ajv.errorsText(validate.errors))
      await drive.files.delete({ fileId })
      return false
    }

    const { text } = envelope as { v: number; text: string; ts: string }
    await createNote(text, 'mobile-drive')       // shared code path with desktop capture
    await drive.files.delete({ fileId })         // delete after confirmed ingestion
    return true
  } catch (err) {
    console.error('[ingest] processFile error:', err)
    return false
  }
}

export async function checkQuota(drive: drive_v3.Drive): Promise<{ sizeBytes: number }> {
  const files = await drive.files.list({
    spaces: 'appDataFolder',
    fields: 'files(id,size)',
  })
  const total = (files.data.files ?? []).reduce((sum, f) => sum + Number(f.size ?? 0), 0)
  return { sizeBytes: total }
}
```

### Pattern 4: Mobile PWA — GIS Token Client + Drive Upload

**What:** GIS token model provides a short-lived access token. Use it directly with `fetch` against the Drive API. Queue to IDB when offline.

```typescript
// mobile-pwa/src/auth/gisClient.ts
// Source: Google Identity Services token model docs

const WEB_CLIENT_ID = import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID

let tokenClient: google.accounts.oauth2.TokenClient | null = null
let accessToken: string | null = null

export function initGisClient(): void {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: WEB_CLIENT_ID,
    scope: 'https://www.googleapis.com/auth/drive.appdata',
    callback: (response) => {
      if (response.error) return
      accessToken = response.access_token
    },
  })
}

export function getAccessToken(): string | null { return accessToken }

export function requestAuth(): void {
  if (!tokenClient) throw new Error('GIS not initialized')
  tokenClient.requestAccessToken({ prompt: '' })  // silent if previously consented
}

// mobile-pwa/src/drive/driveUpload.ts
export async function uploadNoteToDrive(
  text: string,
  accessToken: string
): Promise<{ fileId: string }> {
  const envelope = JSON.stringify({ v: 1, text, ts: new Date().toISOString() })
  const metadata = {
    name: `note-${Date.now()}.json`,
    parents: ['appDataFolder'],
  }
  const form = new FormData()
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }))
  form.append('file', new Blob([envelope], { type: 'application/json' }))

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    }
  )
  if (!res.ok) throw new Error(`Drive upload failed: ${res.status}`)
  const data = await res.json()
  return { fileId: data.id }
}
```

### Pattern 5: Mobile PWA — idb Offline Queue

**What:** Queue notes to IndexedDB when offline. Drain queue on reconnect. Persist delivery state.

```typescript
// mobile-pwa/src/queue/noteQueue.ts
// Source: idb v8 docs + offline-first PWA pattern
import { openDB, DBSchema } from 'idb'

interface NotalMobileDB extends DBSchema {
  queue: {
    key: string
    value: {
      id: string
      text: string
      ts: string
      status: 'local' | 'uploading' | 'on-drive' | 'ingested' | 'failed'
      driveFileId?: string
    }
  }
}

const DB_NAME = 'notal-mobile'
const DB_VERSION = 1

let _db: Awaited<ReturnType<typeof openDB<NotalMobileDB>>> | null = null

async function getDb() {
  if (_db) return _db
  _db = await openDB<NotalMobileDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      db.createObjectStore('queue', { keyPath: 'id' })
    },
  })
  return _db
}

export async function enqueue(text: string): Promise<string> {
  const db = await getDb()
  const id = crypto.randomUUID()
  await db.put('queue', { id, text, ts: new Date().toISOString(), status: 'local' })
  return id
}

export async function getPending() {
  const db = await getDb()
  const all = await db.getAll('queue')
  return all.filter(n => n.status === 'local' || n.status === 'failed')
}

export async function updateStatus(
  id: string,
  status: NotalMobileDB['queue']['value']['status'],
  driveFileId?: string
) {
  const db = await getDb()
  const item = await db.get('queue', id)
  if (!item) return
  await db.put('queue', { ...item, status, ...(driveFileId ? { driveFileId } : {}) })
}

export async function drainQueue(
  upload: (text: string, token: string) => Promise<{ fileId: string }>,
  token: string
) {
  const pending = await getPending()
  for (const note of pending) {
    await updateStatus(note.id, 'uploading')
    try {
      const { fileId } = await upload(note.text, token)
      await updateStatus(note.id, 'on-drive', fileId)
    } catch {
      await updateStatus(note.id, 'failed')
    }
  }
}
```

### Pattern 6: vite-plugin-pwa Configuration for GitHub Pages

**What:** Configure the mobile PWA for static hosting at `https://mattmanNCF.github.io/notal-mobile/`. Service worker scope must match the subpath. iOS requires explicit `apple-touch-icon` HTML links.

```typescript
// mobile-pwa/vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/notal-mobile/',     // CRITICAL: must match GitHub Pages subpath
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon-180x180.png', 'favicon.ico'],
      manifest: {
        name: 'Notal Capture',
        short_name: 'Notal',
        description: 'Capture notes to Notal from your phone',
        theme_color: '#1a1a1a',
        background_color: '#1a1a1a',
        display: 'standalone',
        scope: '/notal-mobile/',       // SW scope = subpath
        start_url: '/notal-mobile/',   // must match scope
        icons: [
          { src: '/notal-mobile/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/notal-mobile/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        // Offline-first: cache-first for app shell
        runtimeCaching: [],
      },
    }),
  ],
  build: {
    outDir: '../docs/notal-mobile',    // output to docs/ for GitHub Pages "docs folder" deploy
  },
})
```

```html
<!-- mobile-pwa/index.html — iOS Safari requires explicit apple-touch-icon -->
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="theme-color" content="#1a1a1a" />
  <!-- iOS does NOT read icon from manifest; must be explicit link tags -->
  <link rel="apple-touch-icon" href="/notal-mobile/apple-touch-icon-180x180.png" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <!-- GIS script — async load, then initGisClient() in App.tsx -->
  <script src="https://accounts.google.com/gsi/client" async defer></script>
</head>
```

### Pattern 7: notes Table Migration — `source` Column

**What:** Add `source` column to `notes` table to distinguish desktop captures from mobile-drive captures.

```sql
-- In src/main/db.ts inline migration block (try/catch for idempotency)
ALTER TABLE notes ADD COLUMN source TEXT DEFAULT 'desktop';
```

```typescript
// drizzle/schema.ts — add to notes table
source: text('source').notNull().default('desktop'),
// Values: 'desktop' | 'mobile-drive'
```

### Anti-Patterns to Avoid

- **Using `changes.watch` (push):** Requires a public HTTPS webhook. Do not implement — use polling only.
- **Using `google-auth-library` in the mobile PWA:** It is Node.js-only. Use Google Identity Services (GIS) JavaScript library in the browser.
- **Storing refresh tokens in the PWA:** GIS token model provides access tokens only (1h TTL). Re-auth on each session open. Do not try to persist a refresh token in the browser.
- **Using the full `googleapis` package:** Install `@googleapis/drive` (20.1.0) not `googleapis` (190MB monolith).
- **Inlining the GCP Web Client ID in code:** Expose as `VITE_GOOGLE_WEB_CLIENT_ID` env var; the Web client ID is not secret (it's embedded in the browser auth URL) but env-var injection is cleaner.
- **CORS issues with Drive API from PWA:** Drive API supports CORS for browser requests; no proxy needed. The GIS access token is passed in the `Authorization: Bearer` header.
- **Assuming iOS Safari 7-day eviction applies to home screen PWA:** The 7-day cap is for regular browser tabs. An installed PWA (added to home screen) is evicted based on storage pressure + inactivity, not a fixed timer. Document this clearly but do not over-engineer around it.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON schema validation | Custom type checking for ≤16KB envelope | `ajv` v8 with compiled schema | Handles additionalProperties, coercion, edge cases correctly; compile once, validate many |
| IndexedDB offline queue | Raw IDBRequest callbacks | `idb@8.0.3` | Correct transaction lifetime management; typed schema; ~1.2kB |
| PWA service worker | Manual sw.js with cache strategies | `vite-plugin-pwa` workbox | Handles precache manifest, cache invalidation, autoUpdate on deploy |
| OAuth token management in browser | Manual fetch to token endpoint | Google Identity Services | Handles consent UX, token refresh UI, popup flow correctly |
| Drive file polling state | In-memory counter | `electron-conf` for `startPageToken` | Survives app restarts; same pattern as Phase 11 calendar settings |
| iOS PWA icon detection | User agent checks | Explicit `<link rel="apple-touch-icon">` HTML tag | iOS Safari ignores Web App Manifest icons; requires HTML link tag |

**Key insight:** The mobile↔desktop transport path has no novel engineering — it is a file queue (IDB) → file store (Drive appDataFolder) → polling consumer (changes.list) → delete after ingest. Each step uses well-tested primitives.

---

## Common Pitfalls

### Pitfall 1: Push Notifications Attempted in Desktop App

**What goes wrong:** Developer reads MOB-TRANS-02 as "push preferred" and attempts to implement `changes.watch`. The Electron app has no public HTTPS endpoint. Google returns `400: Invalid Notification: Missing notification information`.

**Why it happens:** The phase description used "push preferred, polling fallback" language that implied push was achievable.

**How to avoid:** Polling-only from the start. No push implementation. The plan should contain zero references to `changes.watch`. Target: ≤60s delivery latency via polling — confirmed acceptable in success criteria #1.

**Warning signs:** Any code touching `drive.changes.watch()` is wrong.

### Pitfall 2: appDataFolder Files Written by Web Client Not Visible to Desktop Client

**What goes wrong:** Mobile PWA writes a file to appDataFolder using the Web OAuth client ID. Desktop reads appDataFolder using the Desktop OAuth client ID. If Google scopes appDataFolder per client ID (not per project), the desktop finds nothing.

**Why it happens:** The per-project vs per-client-ID scoping is not explicitly documented.

**How to avoid:** Manual verification in Wave 0 before building the full ingestion path: (a) authenticate mobile PWA with Web client, write one test file; (b) authenticate desktop with Desktop client, `files.list({ spaces: 'appDataFolder' })`; confirm the file is visible. If not visible, escalate to the planner — the mitigation is to use a regular Drive folder with a namespaced name (defeats appDataFolder privacy guarantees) or to use the same Web client ID in both environments.

**Warning signs:** `files.list({ spaces: 'appDataFolder' })` returns empty array on desktop after mobile write.

### Pitfall 3: GIS Token Expires Mid-Session

**What goes wrong:** Access token has a 1-hour TTL. A user opens the PWA, composes several notes offline over 90 minutes, reconnects, and the drain attempt fails because the token has expired.

**Why it happens:** GIS token model provides access tokens only — no refresh token in browser.

**How to avoid:** On `drainQueue()`, check token age. If token is approaching expiry (>55 min old) or a `401` is received from Drive API, call `requestAccessToken({ prompt: '' })` again before retrying. GIS re-auth with `prompt: ''` is silent if the user is still signed in to the same Google account.

**Warning signs:** `401 Unauthorized` from Drive API calls during queue drain.

### Pitfall 4: vite-plugin-pwa Manifest `start_url` Mismatch

**What goes wrong:** Service worker registers at `/notal-mobile/sw.js` but `start_url` in manifest is set to `/`. iOS Safari's "Add to Home Screen" installs the PWA with the wrong scope, causing the SW to not intercept navigations.

**Why it happens:** Default manifest `start_url: '/'` when Vite `base` is set to a subpath.

**How to avoid:** Explicitly set both `scope: '/notal-mobile/'` and `start_url: '/notal-mobile/'` in the manifest config. Verify with Lighthouse PWA audit before ship.

**Warning signs:** Service worker fails to intercept requests; offline mode shows browser's "no internet" page instead of the PWA's offline UI.

### Pitfall 5: iOS Safari Misses PWA Icons

**What goes wrong:** App installed via "Add to Home Screen" shows a generic screenshot instead of the icon. iOS Safari does not read icons from the Web App Manifest.

**Why it happens:** iOS has always required explicit `<link rel="apple-touch-icon">` HTML tags — the Web App Manifest icon entries are ignored.

**How to avoid:** Add `<link rel="apple-touch-icon" href="/notal-mobile/apple-touch-icon-180x180.png" />` to `index.html`. Generate the 180x180 PNG using `@vite-pwa/assets-generator` or similar.

**Warning signs:** Home screen shows a low-res screenshot or generic icon.

### Pitfall 6: `source` Column Migration Breaks Existing Notes Reads

**What goes wrong:** `ALTER TABLE notes ADD COLUMN source TEXT` runs, but Drizzle schema doesn't include it, causing TypeScript errors or runtime mismatches.

**Why it happens:** Inline migration in `db.ts` without corresponding Drizzle schema update.

**How to avoid:** (1) Add `source` to `drizzle/schema.ts`; (2) Wrap the `ALTER TABLE` in a try/catch for idempotency (same pattern as Phase 02); (3) Verify with `npm run typecheck` after schema update.

**Warning signs:** TypeScript type errors on `Note` type; `notes:getAll` IPC call returns notes without `source` field.

### Pitfall 7: COOP/COEP Headers (Non-Issue — Confirmed)

**What goes wrong:** Developer researches COOP/COEP for GitHub Pages and spends time implementing `coi-serviceworker` workaround.

**Why it's not needed:** COOP/COEP headers are only required for features that use `SharedArrayBuffer` or Wasm threads (e.g., SQLite Wasm, WebGL shared memory). The mobile PWA uses plain text input, `fetch`, IndexedDB, and localStorage — none of which require cross-origin isolation. GitHub Pages' inability to set custom headers is irrelevant for this use case.

**How to avoid:** Do not implement COOP/COEP or `coi-serviceworker`. The PWA will work without any header modifications.

### Pitfall 8: Desktop CSP Expansion for Drive API

**What goes wrong:** The existing CSP in `src/renderer/index.html` enumerates explicit `connect-src` hosts. Drive API URLs are not in the current list.

**Why it happens:** Phase 11 added `https://www.googleapis.com` (Calendar) but the Drive API uses the same domain — so this may already be covered. However, the upload endpoint is `https://www.googleapis.com/upload/drive/v3/files` — still within `www.googleapis.com`. Confirm that no new CSP hosts are needed.

**How to avoid:** Review and verify that `https://www.googleapis.com` in the Phase 11 CSP covers Drive API calls. The Drive API calls are in the Electron **main process** (not renderer), so they are not subject to renderer CSP. Only Drive-related renderer IPC (status displays) touches the renderer — no new CSP hosts needed.

---

## Code Examples

### Drive Client: files.create to appDataFolder

```typescript
// Source: Google Drive API v3 docs + googleapis/google-api-nodejs-client source
await drive.files.create({
  requestBody: {
    name: `note-${Date.now()}.json`,
    parents: ['appDataFolder'],
  },
  media: {
    mimeType: 'application/json',
    body: JSON.stringify({ v: 1, text: rawText, ts: new Date().toISOString() }),
  },
  fields: 'id,name',
})
```

### Drive Client: files.list in appDataFolder

```typescript
// spaces: 'appDataFolder' is required to list appDataFolder files
const res = await drive.files.list({
  spaces: 'appDataFolder',
  fields: 'files(id,name,size,createdTime)',
  pageSize: 100,
})
```

### Drive Client: changes.getStartPageToken

```typescript
// spaces: 'appDataFolder' to scope the token to appDataFolder changes only
const res = await drive.changes.getStartPageToken({ spaces: 'appDataFolder' })
const startPageToken = res.data.startPageToken!
```

### Drive Client: Quota Check via about.get

```typescript
// Drive does not provide a direct appDataFolder size endpoint
// List all files in appDataFolder and sum sizes
const res = await drive.files.list({
  spaces: 'appDataFolder',
  fields: 'files(id,size)',
  pageSize: 1000,
})
const totalBytes = (res.data.files ?? []).reduce((sum, f) => sum + Number(f.size ?? 0), 0)
const tenMB = 10 * 1024 * 1024
const hundredMB = 100 * 1024 * 1024
if (totalBytes > hundredMB) throw new Error('Drive appDataFolder hard stop: >100MB')
if (totalBytes > tenMB) emitWarning('Drive appDataFolder warning: >10MB')
```

### Mobile: GIS Script Tag + initTokenClient

```html
<!-- index.html — load GIS before app bundle -->
<script src="https://accounts.google.com/gsi/client" async defer></script>
```

```typescript
// Defer init until window.google.accounts is available
window.addEventListener('load', () => {
  const tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID,
    scope: 'https://www.googleapis.com/auth/drive.appdata',
    callback: handleTokenResponse,
  })
  // User triggers auth via button press
  authBtn.addEventListener('click', () => tokenClient.requestAccessToken({ prompt: '' }))
})
```

### GitHub Actions CI for Pages Deploy

```yaml
# .github/workflows/deploy-mobile.yml
name: Deploy Notal Mobile PWA
on:
  push:
    branches: [main]
    paths: ['mobile-pwa/**']
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pages: write
      id-token: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Build PWA
        working-directory: mobile-pwa
        env:
          VITE_GOOGLE_WEB_CLIENT_ID: ${{ secrets.GOOGLE_WEB_CLIENT_ID }}
        run: npm ci && npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: docs/notal-mobile
      - uses: actions/deploy-pages@v4
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `googleapis` monolith | `@googleapis/drive` per-service submodule | 2022 | 190MB → much smaller; same pattern as Phase 11 |
| `gapi.client` (Google API JS client) | Google Identity Services (GIS) | 2021 | Old gapi.client is deprecated for auth; GIS is the replacement for browser OAuth |
| Implicit flow (browser) | GIS token model (access tokens) | 2021 | OAuth 2.0 implicit grant deprecated; GIS token model is the Google-blessed replacement for client-side apps |
| gh-pages npm package + manual deploy | GitHub Actions `actions/deploy-pages` | 2023 | GitHub Actions deploy is now the recommended approach; no gh-pages branch management needed |
| IDBOpenDBRequest callbacks | `idb` Promise wrapper | 2016+ | Standard practice for years; idb v8 is the current stable release |

**Deprecated/outdated:**
- `gapi.client.init()` with `apiKey` for browser auth: deprecated; use GIS `initTokenClient`
- `gapi.auth2` library: sunset; replaced entirely by GIS
- `googleapis` monolith package for single-API use: use per-service `@googleapis/drive`
- Drive `changes.watch` for desktop apps: non-viable (requires public HTTPS webhook)

---

## Open Questions

1. **appDataFolder per-project vs per-client-ID isolation**
   - What we know: Google docs say "per application" which is consistent with per-project semantics. Practical implementations suggest shared access within a project.
   - What's unclear: No official doc explicitly confirms that a Web client and Desktop client in the same GCP project share the same appDataFolder namespace.
   - Recommendation: **Treat as a blocking Wave 0 verification.** Manual test before building ingestion: write a file using the Web client ID credentials (mock auth), confirm it's visible via Desktop client ID credentials via `files.list`. If it fails, the fallback is to use a regular namespaced Drive folder (outside appDataFolder) — this is a plan-level decision that changes MOB-TRANS-01.

2. **GIS `prompt: ''` Silent Re-auth on Mobile**
   - What we know: GIS `requestAccessToken({ prompt: '' })` attempts silent re-auth if the user has previously granted consent. On mobile Safari, popup behavior can be finicky.
   - What's unclear: Whether iOS Safari blocks the GIS popup if called programmatically (not from a direct user gesture). Mobile Safari may require the auth to happen inside a user gesture event handler.
   - Recommendation: Always trigger `requestAccessToken()` from a direct button click handler. Do not call it automatically on app load. Drain the queue only after confirmed auth.

3. **Drive quota endpoint for appDataFolder**
   - What we know: There is no direct "appDataFolder size" endpoint. The approach is `files.list` with `spaces: 'appDataFolder'` and summing file sizes.
   - What's unclear: Whether this approach works for >1000 files (pageSize limit). For MOB-QUOTA-01's 10MB/100MB thresholds, a stuck loop would generate many small files — pagination handling may be needed.
   - Recommendation: Implement pagination in `checkQuota()` — walk all pages of `files.list` before summing. For 100MB at ~1KB per note = 100,000 files, this is a degenerate case; a hard stop at the first page that exceeds 100MB is acceptable.

---

## Sources

### Primary (HIGH confidence)
- Google Drive Changes API `changes.list` reference (fetched 2026-04-22): `spaces=appDataFolder` confirmed; `newStartPageToken` semantics confirmed; token doesn't expire
- Google Drive Push Notifications guide (fetched 2026-04-22): Publicly accessible HTTPS required for `changes.watch`; confirmed infeasible for desktop
- Google Identity Services token model guide (fetched 2026-04-22): No backend required; `initTokenClient` + `requestAccessToken`; access tokens only
- Google OAuth 2.0 JS implicit flow guide (fetched 2026-04-22): Web application client type required; direct browser access to Drive API confirmed
- npm registry (verified 2026-04-22): `@googleapis/drive@20.1.0`, `ajv@8.18.0`, `vite-plugin-pwa@1.2.0`, `idb@8.0.3`
- WebKit storage policy blog (fetched 2026-04-22): Installed PWAs (home screen) not subject to 7-day eviction; storage quota increased in Safari 17

### Secondary (MEDIUM confidence)
- Google Drive appDataFolder guide (fetched 2026-04-22): "per application" scoping; no explicit per-client-ID vs per-project clarification
- idb GitHub README (fetched 2026-04-22): `openDB`, TypeScript DBSchema pattern, v8 API surface confirmed
- vite-plugin-pwa GitHub Pages deploy guide (web, 2024): `base` config, manifest `start_url`/`scope` for subpath, `gh-pages` deploy approach
- iOS Safari PWA limitations article (2024-2026): Confirms 7-day eviction applies to browser tabs, not home screen PWAs; `navigator.storage.persist()` available

### Tertiary (LOW confidence — WebSearch only, single source)
- appDataFolder cross-client sharing within same GCP project: Multiple practical implementations suggest shared access; no official doc confirms. LOW confidence — must verify in Wave 0.
- COOP/COEP not required for plain fetch + IndexedDB PWA: Consistent with understanding that cross-origin isolation gates only SharedArrayBuffer/Wasm threads. Not explicitly stated by Google for this exact use case.

---

## Metadata

**Confidence breakdown:**
- Push infeasibility: HIGH — confirmed by official Google docs
- GIS for browser OAuth: HIGH — confirmed by official docs; `google-auth-library` Node-only confirmed
- appDataFolder cross-client access: MEDIUM — practical evidence, no official confirmation
- Standard stack: HIGH — npm registry verified
- vite-plugin-pwa config: MEDIUM — pattern confirmed, full subpath behavior partially confirmed
- iOS PWA eviction: HIGH — WebKit blog confirms installed PWAs exempt from 7-day cap
- COOP/COEP not needed: HIGH — only required for SharedArrayBuffer/Wasm; not used here

**Research date:** 2026-04-22
**Valid until:** 2026-07-22 (Drive/GIS APIs stable; PWA standards slow-moving — 90 days reasonable)
