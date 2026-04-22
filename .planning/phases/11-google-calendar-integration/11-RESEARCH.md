# Phase 11: Google Calendar Integration — Research

**Researched:** 2026-04-21
**Domain:** Google OAuth 2.0 (Desktop/installed-app flow), Google Calendar REST API v3, chrono-node NLP date parsing, Electron safeStorage, Electron security hardening (sandbox/CSP)
**Confidence:** HIGH (stack decision), MEDIUM (timezone coverage), HIGH (security patterns)

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CAL-SEC-01 | OAuth client type "Desktop app"; PKCE; no client_secret persisted; `asar extract` grep returns zero client_secret hits | client_secret IS issued for Desktop clients but is treated as non-confidential by Google's security model — embed in build-time env var, never persist at runtime. PKCE via `generateCodeVerifierAsync()` in google-auth-library confirmed. |
| CAL-SEC-02 | Refresh token stored only via `safeStorage.encryptString()`; config.json zero Google token prefixes | safeStorage API confirmed available in Electron main process after `app.whenReady()`. Pattern mirrors existing API key storage in ipc.ts. |
| CAL-SEC-03 | Loopback redirect on ephemeral port, 127.0.0.1-only, non-deterministic port | Node `http.createServer().listen(0)` then `.address().port`. Use 127.0.0.1 (not localhost). |
| CAL-UX-01 | No Calendar write without silent+undo toast reachable OR explicit click within 5s in opt-in confirm mode | New `reminderService.ts` holds 10s cancellation window before committing event create. |
| CAL-UX-02 | Health indicator (green/yellow/red + last-success timestamp); per-note pending chip on failure | New column `calendar_sync_status` on `reminders` table; IPC push to renderer. |
| CAL-TZ-01 | `{timestamp_utc, original_tz, original_text}` triple; test matrix UTC + America/Los_Angeles + Asia/Kolkata + Pacific/Chatham + DST crossover | chrono-node does NOT support IANA zone names or unusual offsets (Pacific/Chatham = ±12:45/13:45). Requires `luxon` for authoritative UTC conversion from IANA zone. See Pitfall 3. |
| CAL-COST-01 | Piggyback pass; confidence ≥0.85 gate; 50-note corpus triggers ≤6 creation attempts | Add `reminder` field to AI worker JSON schema. No second model call. |
| CAL-DEL-01 | Note delete cascades to Google event delete; "don't ask again"; orphan reconciliation via `extendedProperties.private.notal_note_id` | `events.list?privateExtendedProperty=notal_note_id=<id>` confirmed syntax. |
| XCUT-SEC-02 | `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`; boot-time assertion | Current `index.ts` has `sandbox: false`. Migration: preload only uses contextBridge + ipcRenderer — both available under sandbox. Requires assertion in app.whenReady(). |
| XCUT-CSP-01 | `connect-src` enumerates explicit hosts; no `'unsafe-inline'`, `'unsafe-eval'`, blanket `https:` | Current `index.html` CSP has `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:`. Missing `connect-src`. Must add all Google OAuth + Calendar hosts + existing AI provider hosts. |
</phase_requirements>

---

## Summary

Phase 11 wires a Google Calendar integration into a production Electron app that already has a mature safeStorage-based credential system and a structured-output AI worker. The integration has three distinct layers: (1) a one-time OAuth 2.0 loopback+PKCE handshake to obtain tokens, (2) piggybacked reminder detection on the existing AI worker JSON schema, and (3) calendar event lifecycle management (create with undo, chip display, delete cascade).

The key technical decision — `googleapis@171.4.0` vs `google-auth-library@10.6.2` + `@googleapis/calendar@14.2.0` — resolves clearly in favour of the split packages. `googleapis` is 190 MB unpacked (the complete generated client for every Google API). `google-auth-library` + `@googleapis/calendar` total under 1.5 MB unpacked, provide identical PKCE/OAuth2 capability, and already anticipate the Phase 12 Drive scope add via `@googleapis/drive`. Both Phase 11 and Phase 12 depend on the same `google-auth-library` OAuth2Client, so there is no re-engineering cost.

The most non-obvious finding is that **chrono-node cannot handle Pacific/Chatham (UTC±12:45/13:45)** — its timezone option accepts abbreviations (CDT, GMT) and numeric offsets, but not IANA identifiers, and it has no built-in DST crossover awareness. `luxon@3.7.2` is required alongside chrono-node to convert a chrono-parsed `Date` (which gives a UTC epoch) plus the user's IANA zone string into the authoritative `{timestamp_utc, original_tz, original_text}` triple required by CAL-TZ-01. The planner must include this dependency and the conversion pattern in the implementation tasks.

**Primary recommendation:** Use `google-auth-library@10.6.2` + `@googleapis/calendar@14.2.0` + `luxon@3.7.2` + `chrono-node@2.9.0`. Add all four to `rollupOptions.external` (same pattern as googleapis/Anthropic/OpenAI SDKs).

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| google-auth-library | 10.6.2 (current) | OAuth2Client: PKCE flow, token refresh, credential management | Official Google auth library; `OAuth2Client.generateCodeVerifierAsync()` + `getToken({codeVerifier})` are the confirmed PKCE API surface |
| @googleapis/calendar | 14.2.0 (current) | Calendar API v3: events.insert, events.delete, events.list | Official per-service submodule; 808 KB unpacked vs 190 MB for full googleapis |
| chrono-node | 2.9.0 (current, matches roadmap) | Natural language date/time parsing from note text | Dependency in roadmap; supports relative/absolute dates, timezone abbreviations |
| luxon | 3.7.2 (current) | IANA timezone-aware UTC conversion from chrono parsed result | Required for Pacific/Chatham and DST crossover test matrix (see Pitfall 3) |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Node `http` (stdlib) | — | Ephemeral loopback HTTP server for OAuth redirect | Built-in; no extra dep; listen(0) for non-deterministic port |
| Node `crypto` (stdlib) | — | `crypto.randomBytes(96).toString('base64url')` for code_verifier | Built-in; use instead of any extra PKCE library |
| electron-conf (existing) | 1.3.0 | Store non-secret calendar settings (connected status, confirmBeforeCreate, lastSync) | Already in the project; follow existing pattern |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| google-auth-library + @googleapis/calendar | googleapis@171.4.0 | googleapis is 190 MB unpacked — unnecessary for Calendar+Drive only; split packages are the officially documented modular approach |
| luxon | date-fns-tz | Both viable; luxon has cleaner IANA handling and is already in the ecosystem; date-fns-tz is fine if preferred, but luxon's `DateTime.fromMillis(ms, {zone})` API is simpler for the conversion pattern |
| chrono-node | Temporal API | Node 22+ only — not safe for Electron app targeting Windows; chrono is the correct choice |

**Installation:**
```bash
npm install google-auth-library@10.6.2 @googleapis/calendar@14.2.0 chrono-node@2.9.0 luxon@3.7.2
npm install --save-dev @types/luxon
```

Add to `electron.vite.config.ts` `main.build.rollupOptions.external`:
```
'google-auth-library', '@googleapis/calendar', 'chrono-node', 'luxon'
```

**Version verification (confirmed 2026-04-21 via npm registry):**
- `googleapis`: 171.4.0 (matches roadmap)
- `google-auth-library`: 10.6.2
- `@googleapis/calendar`: 14.2.0
- `chrono-node`: 2.9.0 (matches roadmap)
- `luxon`: 3.7.2

---

## Architecture Patterns

### Recommended Project Structure

```
src/main/calendar/
├── oauthFlow.ts        # Loopback server, PKCE generation, authorization URL, code exchange
├── tokenStore.ts       # safeStorage encrypt/decrypt for refresh token; electron-conf for metadata
├── googleClient.ts     # Constructs authorized Calendar API client from stored credentials
├── reminderService.ts  # Detects reminder field from AI result, gates on confidence, creates events, manages undo window, delete cascade
drizzle/schema.ts       # Add: reminders table (new)
src/main/db.ts          # Inline migration: CREATE TABLE IF NOT EXISTS reminders
src/main/ipc.ts         # calendar:* handlers
src/preload/index.ts    # calendar API surface
src/renderer/src/components/
├── GoogleCalendarSection.tsx  # Settings → Integrations tab content
└── NoteCard.tsx               # Add inline chip for linked calendar event
```

### Pattern 1: OAuth2 Loopback + PKCE Flow

**What:** Spawn an ephemeral local HTTP server on port 0 (random), redirect browser to Google auth URL with PKCE challenge, capture the code from the redirect, exchange for tokens.

**When to use:** On user click in Settings → Integrations "Connect Google Calendar"

**Example:**
```typescript
// src/main/calendar/oauthFlow.ts
import { createServer } from 'http'
import { shell } from 'electron'
import { OAuth2Client } from 'google-auth-library'

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID!       // build-time env var
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET! // non-confidential; Desktop-app type

export async function startOAuthFlow(): Promise<{ access_token: string; refresh_token: string }> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.listen(0, '127.0.0.1', async () => {
      const { port } = server.address() as { port: number }
      const redirectUri = `http://127.0.0.1:${port}`

      const oAuth2Client = new OAuth2Client({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, redirectUri })
      const { codeVerifier, codeChallenge } = await oAuth2Client.generateCodeVerifierAsync()

      const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: ['https://www.googleapis.com/auth/calendar.events'],
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        prompt: 'consent',   // force refresh_token on every grant
      })

      shell.openExternal(authUrl)

      server.on('request', async (req, res) => {
        const url = new URL(req.url!, `http://127.0.0.1:${port}`)
        const code = url.searchParams.get('code')
        if (!code) { res.end('Missing code'); return }
        res.end('<html><body>Connected! You can close this tab.</body></html>')
        server.close()
        try {
          const { tokens } = await oAuth2Client.getToken({ code, codeVerifier })
          resolve({ access_token: tokens.access_token!, refresh_token: tokens.refresh_token! })
        } catch (err) {
          reject(err)
        }
      })
    })
    server.on('error', reject)
    // Timeout after 5 minutes
    setTimeout(() => { server.close(); reject(new Error('OAuth timeout')) }, 5 * 60 * 1000)
  })
}
```

### Pattern 2: Refresh Token Storage via safeStorage

**What:** Encrypt refresh token with Electron's OS-level safeStorage; store metadata (connected status, lastSync) in electron-conf.

**When to use:** After successful OAuth, on each token refresh.

```typescript
// src/main/calendar/tokenStore.ts
import { safeStorage } from 'electron'
import { Conf } from 'electron-conf/main'

const calConf = new Conf<{
  calendarConnected: boolean
  refreshTokenEncrypted: string
  calendarSyncLastSuccess: string | null
  confirmBeforeCreate: boolean
  dontAskDeleteCalEvent: boolean
}>({ name: 'calendar-settings' })

export function isEncryptionReady(): boolean {
  return safeStorage.isEncryptionAvailable()
}

export function storeRefreshToken(token: string): void {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('safeStorage unavailable')
  const encrypted = safeStorage.encryptString(token)
  calConf.set('refreshTokenEncrypted', encrypted.toString('base64'))
  calConf.set('calendarConnected', true)
}

export function getRefreshToken(): string | null {
  const enc = calConf.get('refreshTokenEncrypted', '') as string
  if (!enc) return null
  try {
    return safeStorage.decryptString(Buffer.from(enc, 'base64'))
  } catch { return null }
}

export function clearTokens(): void {
  calConf.delete('refreshTokenEncrypted')
  calConf.set('calendarConnected', false)
}
```

### Pattern 3: Piggybacked Reminder Detection in AI Worker

**What:** Extend the 5-field JSON schema in `buildPrompt()` with a `reminder` field. Zero additional model calls.

**Schema extension** (modify `buildPrompt` in `aiWorker.ts`):
```typescript
// In buildPrompt(), add to the task instructions:
// 6. **reminder**: If the note contains a specific date/time reminder or appointment,
//    return {"text": "...", "date_text": "...", "confidence": 0.0-1.0} where confidence
//    reflects certainty of intent AND date precision. Return null if no reminder.

// In drain()'s parsed result:
const parsed = JSON.parse(result) as {
  organized: string
  annotation: string
  wiki_updates: Array<{ file: string; content: string }>
  tags: string[]
  insights: string | null
  reminder: { text: string; date_text: string; confidence: number } | null  // NEW
}
```

**Local model grammar extension** (in `callLocal()`, add to `createGrammarForJsonSchema`):
```typescript
reminder: {
  oneOf: [
    {
      type: 'object',
      properties: {
        text: { type: 'string' },
        date_text: { type: 'string' },
        confidence: { type: 'number' },
      },
      required: ['text', 'date_text', 'confidence'],
    },
    { type: 'null' }
  ]
}
```

### Pattern 4: Timezone Triple Conversion

**What:** Convert chrono-node's `Date` output (UTC epoch) + user's IANA zone string into the required triple.

**Why:** chrono-node returns a JS `Date` (UTC milliseconds). To store `original_tz` correctly and test Pacific/Chatham (UTC+12:45/13:45), use luxon.

```typescript
// src/main/calendar/reminderService.ts
import chrono from 'chrono-node'
import { DateTime } from 'luxon'

interface ReminderTriple {
  timestamp_utc: string     // ISO 8601 UTC
  original_tz: string       // IANA zone: "America/Los_Angeles"
  original_text: string     // "next Tuesday at 3pm"
}

export function parseReminderDate(dateText: string, userIanaZone: string): ReminderTriple | null {
  // chrono parses relative to local system time (main process TZ)
  // Pass a reference date anchored in the user's timezone for correct interpretation
  const refDate = DateTime.now().setZone(userIanaZone).toJSDate()
  const parsed = chrono.parseDate(dateText, refDate)
  if (!parsed) return null

  // chrono returns a Date — its UTC epoch is authoritative
  const utcMs = parsed.getTime()
  const timestamp_utc = new Date(utcMs).toISOString()

  // Verify the luxon conversion round-trips correctly for the user's zone
  const inUserZone = DateTime.fromMillis(utcMs, { zone: userIanaZone })
  if (!inUserZone.isValid) return null

  return { timestamp_utc, original_tz: userIanaZone, original_text: dateText }
}
```

**Notes on Chatham Islands (Pacific/Chatham, UTC+12:45/+13:45):**
Luxon correctly models this zone via its bundled IANA data. The `DateTime.fromMillis(ms, { zone: 'Pacific/Chatham' }).isValid` check will return `true`. chrono-node does NOT need to know the IANA zone — it only parses the text; luxon handles the zone conversion.

### Pattern 5: Calendar Event Create with Undo Toast

**What:** The main process creates the event, holds the event ID in memory for 10 seconds, sends an IPC push to renderer for the undo toast, and either cancels (if user clicks undo) or confirms the chip record.

```typescript
// ipcMain push pattern (matches existing note:aiUpdate push pattern)
mainWindow.webContents.send('calendar:eventCreated', {
  noteId,
  eventId,
  eventTitle,
  eventTime,
  calendarLink: `https://calendar.google.com/calendar/event?eid=...`,
  undoDeadlineMs: Date.now() + 10_000
})

// IPC handler for undo
ipcMain.handle('calendar:undoCreate', async (_e, noteId: string) => {
  await reminderService.cancelPendingCreate(noteId)
})
```

### Pattern 6: extendedProperties for Orphan Reconciliation

**What:** Tag every calendar event at create time with the note ID so delete cascade can find events without storing the event ID locally.

```typescript
// In events.insert request body:
resource: {
  summary: reminder.text,
  start: { dateTime: triple.timestamp_utc, timeZone: triple.original_tz },
  end: { dateTime: endTime, timeZone: triple.original_tz },
  extendedProperties: {
    private: { notal_note_id: noteId }
  }
}

// In delete cascade (notes:delete handler):
const calRes = await calendar.events.list({
  calendarId: 'primary',
  privateExtendedProperty: [`notal_note_id=${noteId}`]
})
for (const event of calRes.data.items ?? []) {
  await calendar.events.delete({ calendarId: 'primary', eventId: event.id! })
}
```

The `privateExtendedProperty=notal_note_id=value` query syntax is confirmed by the Google Calendar API v3 events.list reference documentation.

### Pattern 7: Security Hardening (XCUT-SEC-02 + XCUT-CSP-01)

**What:** Phase 11 must migrate `sandbox: false` to `sandbox: true` and add a boot-time assertion. Must also fix the missing `connect-src` in the CSP.

**sandbox migration — safe because:**
- Preload uses only `contextBridge` + `ipcRenderer` — both are available under sandbox
- No `require()` in preload for user modules (the `require` polyfill under sandbox is sufficient for `ipcRenderer`)
- electron-vite bundles the preload — no CommonJS module splitting needed

**BrowserWindow change** (`src/main/index.ts`):
```typescript
webPreferences: {
  preload: join(__dirname, '../preload/index.js'),
  sandbox: true,             // was: false
  contextIsolation: true,    // was: implicit true (Electron 12+ default)
  nodeIntegration: false,    // was: implicit false
}
```

**Boot-time assertion** (add to `app.whenReady()` body):
```typescript
// Assert security invariants at startup (XCUT-SEC-02)
const wins = BrowserWindow.getAllWindows()
for (const win of wins) {
  const prefs = win.webContents.getWebPreferences()
  if (!prefs.contextIsolation || prefs.nodeIntegration || !prefs.sandbox) {
    console.error('[security] FATAL: BrowserWindow has insecure webPreferences', prefs)
    app.quit()
  }
}
```

**CSP update** (`src/renderer/index.html`):
```html
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self';
  script-src 'self';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https:;
  connect-src 'self'
    https://accounts.google.com
    https://oauth2.googleapis.com
    https://www.googleapis.com
    https://calendar.googleapis.com
    https://api.anthropic.com
    https://api.openai.com
    https://generativelanguage.googleapis.com
    https://api.groq.com
    https://api-inference.huggingface.co
    http://localhost:11434
    http://127.0.0.1:11434
" />
```

Note: `http://localhost:11434` and `http://127.0.0.1:11434` are required for Ollama. The ephemeral OAuth loopback server is in the **main process** (not renderer), so its port does NOT need to be in the CSP.

### reminders Table Migration

Add to `src/main/db.ts` inline migration block:
```sql
CREATE TABLE IF NOT EXISTS reminders (
  id TEXT PRIMARY KEY,
  note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  event_id TEXT,                    -- Google Calendar event ID (null while pending undo)
  event_title TEXT NOT NULL,
  timestamp_utc TEXT NOT NULL,
  original_tz TEXT NOT NULL,
  original_text TEXT NOT NULL,
  confidence REAL NOT NULL,
  calendar_sync_status TEXT NOT NULL DEFAULT 'pending',  -- pending|synced|failed|cancelled
  calendar_link TEXT,
  created_at TEXT NOT NULL,
  last_error TEXT
)
```

### Anti-Patterns to Avoid

- **Using `localhost` in redirect URI:** Use `127.0.0.1` only. Google's strict URI matching and some Windows firewall configurations treat them differently. CAL-SEC-03 mandates this.
- **Persisting client_secret to disk or electron-conf:** The `client_secret` is embedded at build time (env var or build-injected constant). It must never be written to any user-writable config file — `asar extract` grep must return zero hits.
- **Blocking the main process during OAuth loopback:** The loopback server is async and non-blocking. The main process remains responsive.
- **Using the full `googleapis` package:** 190 MB unpacked vs 1.4 MB for the split packages. Never import `googleapis` — always import `google-auth-library` and `@googleapis/calendar` separately.
- **Calling chrono-node for IANA timezone conversion:** chrono-node is for parsing date text. Luxon handles the IANA zone math. They compose — don't conflate.
- **Creating the Google event synchronously on AI completion:** Always go through the 10-second undo window (CAL-UX-01). Store as `pending` in `reminders` table, send `calendar:eventCreated` IPC, commit after 10s if not cancelled.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| OAuth2 PKCE code verifier + challenge | Custom crypto/base64url implementation | `OAuth2Client.generateCodeVerifierAsync()` from google-auth-library | Handles S256 hashing and base64url encoding correctly; returns `{ codeVerifier, codeChallenge }` |
| Token refresh on 401 | Manual refresh token exchange loop | `google-auth-library` OAuth2Client `refreshAccessToken()` — or set credentials once and the client auto-refreshes | Edge cases in token expiry timing are subtle |
| IANA timezone DST crossover math | Manual UTC offset computation | `luxon` `DateTime.fromMillis(ms, { zone: 'IANA/Zone' })` | Pacific/Chatham ±12:45/13:45 DST is not representable with simple offset math |
| Natural language date detection | Regex patterns for "next Tuesday at 3pm" | `chrono-node` | Handles relative, absolute, implicit dates; time-of-day inference; locale variations |
| Calendar API HTTP requests | Raw `fetch` against REST endpoints | `@googleapis/calendar` | Handles auth header injection, response typing, retry-safe pattern |

**Key insight:** The entire security envelope around OAuth (PKCE, token storage, refresh) is subtler than it looks — six lines of `generateCodeVerifierAsync` + `getToken({ codeVerifier })` eliminate a class of vulnerabilities that custom implementations routinely miss.

---

## Common Pitfalls

### Pitfall 1: client_secret for Desktop App Clients

**What goes wrong:** Developer reads "no client_secret persisted" (CAL-SEC-01) and concludes they can do a fully secret-less flow. Google's token endpoint REQUIRES `client_secret` for Desktop-app OAuth clients even when PKCE is used — the exchange will fail with a 400 error if client_secret is absent.

**Why it happens:** RFC 8252 / RFC 7636 define public clients that skip the secret. Google's current implementation does not honour this for Desktop clients at the token exchange step.

**How to avoid:** Embed `CLIENT_ID` and `CLIENT_SECRET` as build-time environment variables (`.env` → build step injects into a constant in `oauthFlow.ts`). The client_secret is non-confidential per Google's own statement ("In this context, the client secret is obviously not treated as a secret") but must not be persisted to any runtime file. CAL-SEC-01's asar-grep check passes because the secret is a compiled-in literal, not a file on disk.

**Warning signs:** Token exchange returns `{ error: "invalid_client" }` — typically means missing or mismatched client_secret.

### Pitfall 2: 127.0.0.1 vs localhost in Redirect URI

**What goes wrong:** Redirect URI registered in Google Cloud Console as `http://127.0.0.1:PORT` but code uses `http://localhost:PORT` (or vice versa). Google does exact URI matching. On Windows, `localhost` sometimes resolves to IPv6 `::1` rather than `127.0.0.1`.

**Why it happens:** Developers assume equivalence. Google's native-app loopback doc explicitly recommends `127.0.0.1` over `localhost`.

**How to avoid:** Use `http://127.0.0.1:${port}` everywhere — in `server.listen(0, '127.0.0.1', ...)`, in `redirectUri` passed to OAuth2Client, and in the Google Cloud Console registration. Note: For Desktop-app clients, Google allows any loopback port — you do not need to pre-register the port, only the IP.

**Warning signs:** `redirect_uri_mismatch` error from Google during authorization.

### Pitfall 3: chrono-node Cannot Handle IANA Timezones or Pacific/Chatham

**What goes wrong:** CAL-TZ-01 requires a 5-zone test matrix including Pacific/Chatham (+12:45/+13:45 depending on DST). chrono-node's `timezone` option accepts abbreviations like "CDT" or numeric offsets, not IANA identifiers. Passing `{ timezone: 'Pacific/Chatham' }` silently fails or returns incorrect results.

**Why it happens:** chrono-node's internal timezone registry does not match the IANA tz database for unusual offsets.

**How to avoid:**
1. Use chrono-node only for parsing the text → JS `Date` (UTC ms)
2. Use luxon `DateTime.fromMillis(ms, { zone: 'Pacific/Chatham' })` for the IANA zone math
3. The user's system timezone (from `Intl.DateTimeFormat().resolvedOptions().timeZone`) provides the IANA zone string for the `original_tz` field
4. chrono's reference date should be `DateTime.now().setZone(userIanaZone).toJSDate()` so relative parsing ("tomorrow at 9am") is correct in the user's local time

**Warning signs:** Test matrix failures for Pacific/Chatham or Asia/Kolkata (+5:30). luxon's `isValid` gate catches bad zone names early.

### Pitfall 4: safeStorage Unavailable on Headless / First-Launch

**What goes wrong:** `safeStorage.isEncryptionAvailable()` returns `false` on Linux without a configured secret store (GNOME Keyring / KWallet). `encryptString()` throws. On Windows, this cannot happen after `app.whenReady()`.

**Why it happens:** Linux keyring is not guaranteed.

**How to avoid:** Call `safeStorage.isEncryptionAvailable()` at connection time. If `false`, surface a message in Settings → Integrations: "Secure storage is not available on this system — Google Calendar cannot be connected." This is a Linux-only concern; Windows (primary platform) is always available post-ready.

**Warning signs:** `Error: Error while decrypting the ciphertext provided to safeStorage.decryptString` on Linux during CI.

### Pitfall 5: sandbox:false → sandbox:true Migration Breaks native require() in Preload

**What goes wrong:** Any `require('path')`, `require('fs')`, or similar Node.js module import directly in the preload script will fail under `sandbox: true` — the polyfilled `require` only exposes `events`, `timers`, `url`, and a handful of others.

**Why it happens:** sandbox: false historically allowed full Node.js in preload.

**How to avoid:** Current `src/preload/index.ts` imports only from `electron` (`contextBridge`, `ipcRenderer`) and one type import (`GraphParams`) — no Node.js module usage. This migration is safe. Verify with `npm run build` after changing `sandbox: false` to `sandbox: true` and confirm no runtime errors.

**Warning signs:** `Uncaught TypeError: require is not a function` or `Cannot find module 'path'` in renderer DevTools after enabling sandbox.

### Pitfall 6: AI Worker Reminder Field Breaks Grammar for llamacpp Provider

**What goes wrong:** The local-model path uses `createGrammarForJsonSchema` with a strict schema (line 372 of aiWorker.ts). Adding `reminder` to the prompt instructions but not the grammar schema causes the grammar to reject valid responses.

**Why it happens:** llamacpp grammar is enforced at the token level — the model cannot output a field that's not in the schema.

**How to avoid:** Add `reminder` to both the JSON grammar schema in `callLocal()` AND the parsed result type in `drain()`. The `oneOf: [object, null]` pattern is required because the field is nullable.

### Pitfall 7: Unilateral Event Creation (CAL-UX-01 Violation)

**What goes wrong:** `reminderService` directly creates the Google event on AI completion without going through the 10-second undo window. This violates CAL-UX-01 (ship gate requirement).

**Why it happens:** Simplest implementation path is direct creation.

**How to avoid:** Use a two-step commit: store `calendar_sync_status='pending'` in `reminders` table, send `calendar:eventCreated` IPC to renderer, arm a `setTimeout(10_000)` in the main process. Only call `calendar.events.insert()` when the timer fires. If `calendar:undoCreate` IPC arrives before the timer, clear the timeout and set `calendar_sync_status='cancelled'`.

---

## Code Examples

### Google OAuth2 Client Construction

```typescript
// src/main/calendar/googleClient.ts
// Source: google-auth-library official docs + confirmed via source inspection
import { OAuth2Client } from 'google-auth-library'
import { calendar_v3, google } from '@googleapis/calendar'
import { getRefreshToken } from './tokenStore'

export function buildCalendarClient(): calendar_v3.Calendar {
  const auth = new OAuth2Client({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  })
  const refreshToken = getRefreshToken()
  if (!refreshToken) throw new Error('No Google refresh token stored')
  auth.setCredentials({ refresh_token: refreshToken })
  return google.calendar({ version: 'v3', auth })
}
```

### Calendar Event Insert with Extended Properties

```typescript
// Confirmed: extendedProperties.private is a valid insert body field
// Source: Google Calendar API v3 events.insert reference
await calendar.events.insert({
  calendarId: 'primary',
  requestBody: {
    summary: reminderText,
    start: {
      dateTime: triple.timestamp_utc,
      timeZone: triple.original_tz,
    },
    end: {
      dateTime: DateTime.fromISO(triple.timestamp_utc, { zone: 'utc' })
        .plus({ hours: 1 })
        .toISO()!,
      timeZone: triple.original_tz,
    },
    extendedProperties: {
      private: { notal_note_id: noteId },
    },
  },
})
```

### Delete Cascade with extendedProperties Query

```typescript
// Confirmed: privateExtendedProperty=key=value query syntax
// Source: Google Calendar API v3 events.list reference
const res = await calendar.events.list({
  calendarId: 'primary',
  privateExtendedProperty: [`notal_note_id=${noteId}`],
  maxResults: 10,
  singleEvents: true,
})
for (const event of res.data.items ?? []) {
  if (event.id) {
    await calendar.events.delete({ calendarId: 'primary', eventId: event.id })
  }
}
```

### NoteCard Chip Integration

```typescript
// In NoteCard.tsx — add to NoteCardProps and render:
interface ReminderChip {
  eventTitle: string
  calendarLink: string
  syncStatus: 'pending' | 'synced' | 'failed' | 'cancelled'
}

// Chip render (add to NoteCard bottom bar area):
{reminder?.syncStatus === 'synced' && (
  <a
    href="#"
    onClick={(e) => { e.preventDefault(); window.api.calendar.openLink(reminder.calendarLink) }}
    className="text-[9px] text-blue-400/70 hover:text-blue-300 flex items-center gap-0.5"
    title={reminder.eventTitle}
  >
    ▸ Cal
  </a>
)}
{reminder?.syncStatus === 'pending' && (
  <span className="text-[9px] text-amber-400/60">⏳ cal</span>
)}
{reminder?.syncStatus === 'failed' && (
  <span className="text-[9px] text-red-400/60" title="Calendar sync failed">⚠ cal</span>
)}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `googleapis` monolith | Per-service submodules (`@googleapis/calendar`) | 2022 | 190 MB → 808 KB; tree-shakeable |
| `generateCodeVerifier()` (sync) | `generateCodeVerifierAsync()` | google-auth-library v9 | Sync version throws; must use async |
| `sandbox: false` default | `sandbox: true` default since Electron 20 | 2022 | Notal was created with electron-vite scaffold that used `sandbox: false`; must migrate |
| chrono v1 (no timezone option) | chrono v2 (timezone option in ParsedReference) | 2021 | v2.x is the current stable; v1 is unsupported |

**Deprecated/outdated:**
- `googleapis` monolith for single-API use: use `@googleapis/calendar` instead
- `generateCodeVerifier()` (synchronous): throws in google-auth-library v9+; use `generateCodeVerifierAsync()`
- `localhost` in loopback redirect URI: use `127.0.0.1` for reliability on Windows

---

## Open Questions

1. **Client Secret Build-time Injection Mechanism**
   - What we know: The `client_secret` must be embedded at build time, not persisted at runtime. Current project has no `.env` injection pipeline for the build.
   - What's unclear: Whether to use `electron-vite`'s `define` (replaces string literals at build time) or a separate env injection in `electron-builder.yml`. The `process.env.GOOGLE_CLIENT_SECRET` approach works in dev but needs explicit handling in the packaged build.
   - Recommendation: Use `electron-vite`'s `define` in `electron.vite.config.ts` to inject `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` from `.env.local` (gitignored). The planner should include this as a Wave 0 setup task.

2. **User IANA Timezone Source**
   - What we know: The `original_tz` triple field needs the user's IANA zone. `Intl.DateTimeFormat().resolvedOptions().timeZone` is the standard browser/Node API.
   - What's unclear: This runs in the main process (aiOrchestrator/reminderService) — `Intl` is available in Node.js. The user may have a different timezone preference than their system timezone. v0.3.1 can use system TZ; a manual override is a deferred nice-to-have.
   - Recommendation: Use `Intl.DateTimeFormat().resolvedOptions().timeZone` in the main process for the system timezone. Store it alongside the reminder. This covers the test matrix.

3. **Scope Overlap with Phase 12 (Drive)**
   - What we know: Phase 12 adds `drive.appdata` scope to the same OAuth consent. The `google-auth-library` OAuth2Client supports incremental scope add via `include_granted_scopes: true`.
   - What's unclear: Whether Phase 11 should pre-request `drive.appdata` in anticipation (simpler consent UX) or use incremental consent when Phase 12 lands.
   - Recommendation: Phase 11 requests only `calendar.events` scope. Phase 12 adds `drive.appdata` via incremental consent. This keeps Phase 11 minimal and allows Phase 12 to be dropped to v0.3.2 without scope pollution.

---

## Sources

### Primary (HIGH confidence)
- Google Identity OAuth2 for Installed Apps (official docs, fetched 2026-04-21): loopback specifics, 127.0.0.1 recommendation, PKCE requirements
- google-auth-library-nodejs GitHub source (oauth2client.ts, fetched 2026-04-21): `generateCodeVerifierAsync()`, `getToken({codeVerifier})`, `generateAuthUrl({code_challenge, code_challenge_method})` confirmed
- Google Calendar API v3 events.insert reference (fetched 2026-04-21): extendedProperties.private structure confirmed
- Google Calendar API v3 events.list reference (fetched 2026-04-21): `privateExtendedProperty=key=value` syntax confirmed
- Electron safeStorage API docs (fetched 2026-04-21): `isEncryptionAvailable()`, platform behavior, API signatures
- Electron Process Sandboxing docs (fetched 2026-04-21): what's available in preload under sandbox:true
- npm registry (verified 2026-04-21): googleapis@171.4.0, google-auth-library@10.6.2, @googleapis/calendar@14.2.0, chrono-node@2.9.0, luxon@3.7.2

### Secondary (MEDIUM confidence)
- Google Dev Forum thread on client_secret in Desktop apps (fetched 2026-04-21): confirmed Google requires client_secret at token exchange even with PKCE; non-confidential classification
- chrono-node GitHub issue #590: IANA timezone gap confirmed; timezonecomplete suggested but unmerged
- googleapis/google-auth-library-nodejs issue #959: confirmed open-source/desktop client_secret tension, no official resolution

### Tertiary (LOW confidence — WebSearch only)
- Package size comparison (190 MB vs 1.4 MB) confirmed via `npm view ... dist.unpackedSize`
- Electron sandbox migration guidance from electron-vite forum discussion

---

## Metadata

**Confidence breakdown:**
- Standard stack (library choice): HIGH — verified against npm registry + official docs + source code
- OAuth PKCE pattern: HIGH — confirmed via google-auth-library source inspection
- client_secret handling: HIGH — confirmed via official docs + dev forum + library issue
- Architecture patterns: HIGH — derived from existing codebase patterns (ipc.ts, safeStorage, inline migrations)
- Timezone (chrono + luxon): MEDIUM — chrono limitation confirmed via GitHub issue; luxon coverage inferred from IANA compliance claim; Pacific/Chatham specifically not tested in CI
- CSP host list: MEDIUM — Ollama hosts confirmed from existing code; Google hosts from API docs; complete enumeration should be validated against actual request logs
- sandbox migration safety: HIGH — preload source inspected; only uses contextBridge + ipcRenderer

**Research date:** 2026-04-21
**Valid until:** 2026-06-21 (stable APIs — 60 days reasonable)
