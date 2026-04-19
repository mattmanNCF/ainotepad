# Architecture Research — Notal v0.3.1

**Domain:** Electron desktop app extension (Notal v0.3.1)
**Researched:** 2026-04-19
**Confidence:** HIGH (for Theme 1 and Theme 2 — mapped against existing code), MEDIUM (for Theme 3 — recommendation is opinionated but the domain has multiple defensible shapes)

This document covers only the *integration* shape of the three new themes (Google Calendar, graph sliders, mobile). The existing v0.3.0 architecture (main / renderer / preload / aiWorker utilityProcess / SQLite+Drizzle / kb/*.md / Fastify MCP on 127.0.0.1:7723) is taken as given.

---

## Existing Architecture (Integration Context Only)

```
┌───────────────────────────────────────────────────────────────────────┐
│                         Renderer (React 19)                           │
│  App.tsx → TabBar → { NotesTab | WikiTab (Sidebar+Pane+Graph) |       │
│                        SearchTab } + SettingsPanel + OnboardingModal  │
└──────────────┬────────────────────────────────────────────────────────┘
               │ window.api (contextBridge; preload/index.ts)
               ▼
┌───────────────────────────────────────────────────────────────────────┐
│                           Main process                                │
│  index.ts  → registerIpcHandlers (ipc.ts)                             │
│            → startAiWorker (aiOrchestrator.ts)                        │
│            → startMcpServer (mcpServer.ts, 127.0.0.1:7723, read-only) │
│            → digestScheduler, agentHarness, tagColors                 │
│  Persistence: better-sqlite3 + Drizzle (notes/kbPages/digests)        │
│               + kb/*.md files + electron-conf ('settings') + safeStorage│
└──────┬────────────────────────────────────────────┬───────────────────┘
       │ MessagePortMain (MessageChannelMain)       │ Node stdlib http
       ▼                                            ▼
┌────────────────────────────┐           ┌──────────────────────────────┐
│  utilityProcess aiWorker   │           │  MCP HTTP server /mcp (POST) │
│  callAI → provider adapter │           │  stateless, no auth today    │
│  types: init/task/settings │           │  tools: recent, search, wiki │
│         -update/result     │           │                              │
└────────────────────────────┘           └──────────────────────────────┘
```

Confirmed facts from source read:
- MCP server today has **no Bearer auth** despite the project brief mentioning one — `mcpServer.ts` exposes `/mcp` POST in stateless mode with zero auth check. Any v0.3.1 theme that reuses this endpoint must add auth *in this milestone*.
- WikiGraph is `src/renderer/src/components/WikiGraph.tsx` and is rendered via `WikiPane` inside `WikiTab`. d3 forces are configured directly on `graphRef.current.d3Force('link')` inside a `useEffect`. This is the slider target.
- No existing calendar, OAuth, HTTP-outbound-write, or mobile code exists.

---

# Theme 1 — Google Calendar Integration

## Integration Points

### Files that change
| File | Change | Why |
|------|--------|-----|
| `src/main/aiWorker.ts` | Extend the `task` result schema to carry an optional `reminder` field (`{title, start, end?, all_day?, confidence}`); prompt the model to extract it in the same structured output it already returns. | Single AI pass is cheapest and already has the note text loaded. |
| `src/main/aiOrchestrator.ts` | In the `type === 'result'` branch, after `updateNoteAiResult`, if `reminder` present and user has Google connected → dispatch to new `calendar.ts` service. | This is the fan-out point for post-AI side effects; it already writes KB files and stubs — reminders are symmetric. |
| `src/main/ipc.ts` | Add 5 new `ipcMain.handle` handlers (see IPC table below). | Renderer needs OAuth start, status, disconnect, list-calendars, test-create. |
| `src/preload/index.ts` + `index.d.ts` | Expose `window.api.calendar.*`. | Type-safe renderer surface. |
| `src/renderer/src/components/SettingsPanel.tsx` | New "Google Calendar" section: Connect/Disconnect button, calendar picker dropdown, "confirm before create" checkbox, last-created reminder status. | Only UI entry point needed in v0.3.1 (no reminders tab). |
| `src/renderer/src/components/NoteCard.tsx` | Small "calendar" chip on notes where a reminder was created (clickable → opens the event in browser). Already renders tag chips and AI annotation, so the pattern is established. | User feedback that their note became a calendar event. |
| `drizzle/schema.ts` + migration | New `reminders` table: `id, note_id, calendar_id, event_id, title, start_at, status ('pending'|'created'|'failed'|'skipped'), created_at, error`. | Persistent record; enables idempotency (don't double-create if the worker re-runs) and a future reminders tab. |

### Files that stay untouched
- `mcpServer.ts` — calendar doesn't flow through MCP.
- `WikiTab.tsx` / `WikiGraph.tsx` / `WikiPane.tsx` — no wiki coupling.
- `digestScheduler.ts` — reminders piggyback on note submission, not the digest clock.
- `kb.ts` — no KB files involved.
- `db.ts` other than adding the new table.

## New Components

| File | Single responsibility |
|------|-----------------------|
| `src/main/calendar/oauthFlow.ts` | Run the Google OAuth 2.0 Authorization Code + PKCE flow inside an Electron `BrowserWindow`. Intercept the redirect URL (loopback `http://127.0.0.1:<ephemeral>/oauth2callback`) via a short-lived `http.createServer` in the main process, exchange code → tokens, return `{access_token, refresh_token, expiry}`. |
| `src/main/calendar/tokenStore.ts` | Write/read/delete `google_refresh_token` via `safeStorage.encryptString` stored in `electron-conf` (same pattern used today for provider API keys). Keeps the single storage abstraction we already have; avoids a new `keytar` native dep. |
| `src/main/calendar/googleClient.ts` | Thin fetch wrapper around `calendar/v3/calendars/{id}/events` (insert, list calendars). Handles access-token refresh transparently. Uses Node global `fetch` — no `googleapis` SDK (keeps bundle small; the REST surface we need is ~3 endpoints). |
| `src/main/calendar/reminderService.ts` | Takes `{noteId, reminder, userPrefs}` → resolves calendar_id → calls `googleClient.insertEvent` → writes to `reminders` table → emits `reminder:created`/`reminder:failed` to renderer. Idempotency check: skip if a row for `(note_id, equivalent start_at)` already exists. |
| `src/main/calendar/phraseExtraction.ts` | *Optional fallback* if the LLM output is missing the `reminder` field: regex-sniff common phrases ("remind me to X on Fri 3pm", "I need to remember to Y tomorrow") → partial reminder. Disabled by default; only kicks in for local models that can't reliably produce JSON. |
| `src/renderer/src/components/settings/GoogleCalendarSection.tsx` | Subcomponent of SettingsPanel. |

## Data Flow

```
User types note + Enter
  └─▶ NotesTab → ipcRenderer.invoke('notes:create', rawText)
        └─▶ ipc.ts notes:create → aiOrchestrator.enqueueNote
              └─▶ workerPort.postMessage({type:'task', rawText, ...})
                    └─▶ aiWorker.ts callAI(...)
                          ◀── {aiState, tags, organizedText, wikiUpdates, reminder?}
              ◀── port1.on('message') in aiOrchestrator
                    ├─ updateNoteAiResult (existing)
                    ├─ write wiki files (existing)
                    └─ NEW: if reminder → reminderService.create(noteId, reminder)
                          ├─ INSERT reminders row (status='pending')
                          ├─ tokenStore.getAccessToken() → refresh if expired
                          ├─ googleClient.insertEvent(calendarId, {summary, start, end})
                          ├─ UPDATE reminders row (status='created', event_id, html_link)
                          └─ mainWin.webContents.send('reminder:created', {...})
        └─▶ renderer receives 'reminder:created' → NoteCard shows calendar chip
```

OAuth sub-flow (one-time):

```
SettingsPanel "Connect Google" click
  └─▶ window.api.calendar.startOAuth()
        └─▶ ipc calendar:startOAuth → oauthFlow.start()
              ├─ generate PKCE verifier/challenge
              ├─ http.createServer on ephemeral port, bound to 127.0.0.1
              ├─ new BrowserWindow(loadURL(google auth url with redirect_uri=loopback))
              ├─ loopback server receives ?code=... → closes BrowserWindow
              ├─ POST https://oauth2.googleapis.com/token with code + verifier
              └─ tokenStore.save(refresh_token, access_token, expiry)
        ◀── {ok: true, email}
  └─▶ SettingsPanel re-renders with "Connected as <email>"
```

## New IPC Channels

| Channel | Direction | Payload | Response |
|---------|-----------|---------|----------|
| `calendar:getStatus` | renderer → main | — | `{connected, email?, selectedCalendarId?, confirmBeforeCreate}` |
| `calendar:startOAuth` | renderer → main | — | `{ok: true, email}` or `{ok: false, error}` |
| `calendar:disconnect` | renderer → main | — | `void` (deletes refresh token + resets prefs) |
| `calendar:listCalendars` | renderer → main | — | `Array<{id, summary, primary}>` |
| `calendar:setPreferences` | renderer → main | `{selectedCalendarId?, confirmBeforeCreate?}` | `void` |
| `calendar:listReminders` | renderer → main | `{limit?}` | `Array<ReminderRow>` |
| `reminder:created` | main → renderer | `{noteId, reminderId, title, startAt, htmlLink}` | (event) |
| `reminder:failed` | main → renderer | `{noteId, error}` | (event) |
| `reminder:confirm-request` | main → renderer | `{noteId, draftReminder}` | (event, only when `confirmBeforeCreate=true`) |
| `reminder:confirm-response` | renderer → main | `{noteId, accept: bool, editedReminder?}` | `void` |

## Decisions (Opinionated)

- **OAuth lives in the main process.** Renderer must never see the client secret. The BrowserWindow used for the Google consent page is separate from the app window and destroyed after the redirect fires. **This is non-negotiable; doing OAuth in the renderer exposes credentials through DevTools and any XSS in rendered KB markdown.**
- **Token storage:** `safeStorage.encryptString` → `electron-conf`. No `keytar`. The project already trusts `safeStorage` for provider API keys; adding keytar means one more native-module build + one more failure mode on DPAPI/keychain mismatch (which the codebase already handles for api keys — we stay uniform).
- **Phrase detection piggybacks on the existing AI pass.** Do NOT run a second worker pass and do NOT run a separate regex-first gate. The prompt is extended to emit `reminder: null | {title, start, end?, all_day?, confidence}`. Regex is a fallback only for providers where structured output is unreliable. Rationale: single model call, no extra latency, reuses `aiState: 'complete'` as the trigger.
- **Default UX: silent creation + chip + toast.** Silent creation matches Notal's "quiet" design principle from `PROJECT.md`. A confirmation prompt is a user-opt-in setting (`confirmBeforeCreate`), not the default.
- **Not connected = silent skip.** No nag. The chip simply doesn't appear on the note. Rationale: Notal never interrupts. A disconnected-state banner in Settings is enough.
- **Scope:** `https://www.googleapis.com/auth/calendar.events` (per-event, not full calendar). Minimal surface; does NOT let Notal read or list existing events. Users see the OAuth consent screen say "See, edit, share, and permanently delete all the calendars" only if we asked for `calendar` — so we ask for `calendar.events` + `calendar.readonly` (the latter to populate the "which calendar to use" picker).

## Build Order (intra-theme)

1. `drizzle/schema.ts` — add `reminders` table + migration. Nothing else compiles correctly without the row type.
2. `calendar/tokenStore.ts` — depends only on `electron-conf` + `safeStorage`, which are already imported in `ipc.ts`.
3. `calendar/oauthFlow.ts` — loopback redirect + BrowserWindow + PKCE. This is the highest-risk piece; get it working standalone first with a throwaway test IPC handler.
4. `calendar/googleClient.ts` — once tokens exist, wrap the Calendar REST API.
5. `calendar/reminderService.ts` — glue + idempotency + DB writes.
6. Extend `aiWorker.ts` prompt + result schema.
7. Hook `aiOrchestrator.ts` result branch.
8. `ipc.ts` handlers + `preload` surface + `index.d.ts` types.
9. `SettingsPanel` Google section.
10. `NoteCard` chip + `reminder:created`/`reminder:failed` listeners in NotesTab.
11. `confirmBeforeCreate` flow last (it's UI-heavy but can ship in a follow-up if timeline is tight).

---

# Theme 2 — Dynamic Wiki Graph Parameters

## Integration Points

### Files that change
| File | Change | Why |
|------|--------|-----|
| `src/renderer/src/components/WikiGraph.tsx` | Accept a new `graphParams` prop `{linkForce, centerForce, repelForce, linkDistance, edgeWidth, nodeSize}`. Wire each value into the existing `d3Force` calls + canvas draw. Convert the current hard-coded `r = 5 / ...`, `linkWidth: ... * 0.8`, `linkStrength: ... * 0.15` into functions of the props. | Single component; already has a `useEffect` that reaches into `d3Force('link').distance(...)`. Slider wiring is a strict generalisation. |
| `src/renderer/src/components/WikiPane.tsx` | Thread `graphParams` prop through to `WikiGraph`. | Just a prop drill. |
| `src/renderer/src/components/WikiTab.tsx` | Own the `graphParams` state; load from main process on mount; save (debounced) on change; pass to `WikiPane`. | WikiTab already owns `tagColors` and `showGraph` — same tier. |
| `src/main/ipc.ts` | Two new handlers: `graph:getParams`, `graph:setParams`. | Persist per-user to `electron-conf`. |
| `src/preload/index.ts` + `index.d.ts` | `window.api.graph.getParams/setParams`. | Renderer surface. |

### Files that stay untouched
- aiWorker, aiOrchestrator, kb, mcpServer, drizzle/schema, SettingsPanel.

## New Components

| File | Single responsibility |
|------|-----------------------|
| `src/renderer/src/components/GraphControlPanel.tsx` | Floating collapsible panel overlaid on the graph view (top-right corner). Six sliders + "Reset to defaults" button. Calls `onChange(params)` on every slider move (panel is controlled). |
| `src/renderer/src/graphDefaults.ts` | Single source of truth for the default values — imported by both `WikiTab.tsx` (initial state + reset) and `ipc.ts` (fallback when no saved params). Avoids drift. |

## Data Flow

```
WikiTab mount
  └─▶ window.api.graph.getParams()
        └─▶ ipc graph:getParams → conf.get('graphParams', DEFAULTS)
  ◀── graphParams state set

User drags slider in GraphControlPanel
  └─▶ onChange({linkForce: 0.4, ...}) → setGraphParams
        ├─ pass to WikiPane → WikiGraph (immediate visual update)
        └─ debounced 300ms → window.api.graph.setParams(params)
              └─▶ ipc graph:setParams → conf.set('graphParams', params)

User clicks "Reset to defaults"
  └─▶ setGraphParams(GRAPH_DEFAULTS) + window.api.graph.setParams(GRAPH_DEFAULTS)
```

## New IPC Channels

| Channel | Direction | Payload | Response |
|---------|-----------|---------|----------|
| `graph:getParams` | renderer → main | — | `GraphParams` |
| `graph:setParams` | renderer → main | `GraphParams` | `void` |

`GraphParams = {linkForce, centerForce, repelForce, linkDistance, edgeWidth, nodeSize}`, all numbers in documented ranges (e.g. `linkForce: 0..1`, `edgeWidth: 0.5..5`, etc.).

## Decisions (Opinionated)

- **Sliders as a floating panel on the graph view, NOT the Settings panel.** Rationale: the adjustment loop is tight — user wants to see the graph respond as they drag. Burying in Settings forces a modal-open + close round-trip that kills the feedback loop. Pattern: top-right corner, collapsed by default (tiny chevron button), expands to show the sliders on click.
- **Values are per-user, global — one set of slider values.** NOT per-view, NOT per-tag. Rationale: Notal is single-user by design (`PROJECT.md`: "cross-device sync never, by design"), the graph has exactly one rendering, and a per-view scheme adds complexity with zero benefit. If a future v0.x adds multiple graph views (e.g. tag-filtered subgraphs), they share the params.
- **Persistence in `electron-conf` (not SQLite).** Settings-tier state belongs with the rest of the settings. SQLite is for content (notes, KB pages, digests, reminders).
- **Debounce save at 300ms.** Slider drags emit high-frequency events; debouncing keeps disk writes bounded without making the user wait.
- **Live response during drag.** The graph updates on every slider tick (not on release) — this is the whole point of having sliders. d3-force allows this via `graphRef.current.d3Force(...)` mutation; no re-mount needed.

## Build Order (intra-theme)

1. `graphDefaults.ts` — write the constants first; everything depends on them.
2. `ipc.ts` handlers + preload surface + `index.d.ts`.
3. `WikiGraph.tsx` — replace hard-coded constants with prop-driven functions; verify no visual regression at defaults.
4. `GraphControlPanel.tsx` — isolate the slider UI; storybook-style via a test prop-drilled parent first if needed.
5. `WikiTab.tsx` — wire state load/save + prop-drill.
6. `WikiPane.tsx` — thread the prop through.
7. Polish: reset-to-defaults, collapse/expand, tooltip text per slider.

---

# Theme 3 — Mobile Extension

This is the only theme where the right shape isn't obvious from the codebase. I evaluated five shapes and recommend **Option A (extend the existing Fastify-style HTTP server on 127.0.0.1:7723 to accept LAN writes)** with one specific hardening step.

## Alternatives Considered

### Option A — Extend local HTTP server to accept LAN writes (RECOMMENDED)
Mobile app (PWA or native) hits the desktop's local HTTP server over LAN. Desktop exposes `POST /mobile/notes` (and later `/mobile/kb`, `/mobile/reminders`). Uses Bearer-token auth. QR-code pairing generates a long random token; mobile stores it locally.

- **Identity/auth:** Bearer token generated on pairing. Token revocable from desktop Settings.
- **Offline mobile:** Mobile queues notes in IndexedDB/SQLite; flushes when LAN reachable. AI processing waits until desktop receives them.
- **Conflict resolution:** Mobile only creates notes (no edit). No conflict surface in v0.3.1.
- **AI processing:** Always happens on desktop. Mobile shows "queued — will process when on LAN" state.
- **Platform effort:** PWA covers iOS + Android in one codebase. Service worker + IndexedDB + fetch.
- **Cost/infra:** Zero — no cloud, no server, no relay. Matches "no AInotepad server" from PROJECT.md.
- **Downside:** Requires same LAN. A user on mobile data can't sync until home. Mitigated by offline queue.

### Option B — Cloud relay (REJECTED)
Run a proxy server so mobile and desktop can sync off-LAN.

- Violates `PROJECT.md` core design principle #3: "Local-first: All notes and KB stored on device. AI calls go directly to provider, not through AInotepad servers."
- Violates principle #6 on trust (notes routed through proprietary relay).
- Adds per-user hosting cost and ops burden.
- Adds an adversary (the relay operator — even if that's Matt) to the threat model.
- **Rejected on principle, not on feasibility.**

### Option C — CRDT sync library (Yjs/Automerge/PouchDB) (REJECTED for v0.3.1)
Use a shared CRDT for notes; peer-to-peer or relay for transport.

- Requires a transport anyway (WebRTC signalling server, or a y-websocket relay) — brings back Option B's problems OR adds STUN/TURN infra.
- The sync substrate fights the existing AI pipeline: the AI worker owns the "note → tags + wiki" transform; if mobile writes via a CRDT, we need to trigger the same transform when the op applies on desktop.
- Mobile is additive (new note creation) in v0.3.1, not co-editing. CRDTs solve a problem we don't yet have.
- **Valid for v0.4+ if multi-device editing becomes a goal.** Not now.

### Option D — Share-extension + QR → browser form (PARTIALLY REJECTED)
Mobile user scans a QR from the desktop (one-off URL to the local IP); their mobile browser loads a form that POSTs to the local server.

- Works without an app, but degrades to Option A's auth model plus a worse UX (no offline queue, must scan QR per session).
- Can be kept as a **fallback capture path** for users who don't want to install the PWA.
- **Not the primary mechanism** but ~1 day of work to offer alongside the PWA; include as stretch.

### Option E — Email-to-Notal (IMAP polling) (REJECTED)
Mobile sends emails to a dedicated address; desktop polls IMAP and creates notes.

- Requires IMAP credentials in the desktop settings (another OAuth flow — Gmail has deprecated plaintext IMAP).
- Latency is poll-interval bounded; feels slow.
- Attachments need MIME parsing; noisy pipeline.
- **Rejected: high complexity, worse UX than a PWA, worse than a share target.**

## Recommendation: Option A — PWA + LAN HTTP to desktop

### Rationale
1. **Ethos fit:** Local-first (check), no AInotepad servers (check), open source (PWA is web standards, native SDK optional), user-controlled pairing (check).
2. **Minimum new infra:** Already running an HTTP server (MCP server on `:7723`). We extend it, we don't add a second process.
3. **One codebase for iOS + Android:** PWA handles both. No App Store gatekeeping for v0.3.1.
4. **Degrades gracefully:** If LAN is unavailable, mobile queues. If user never syncs, notes still exist locally on mobile. No data loss.
5. **Honest scope:** Mobile is **capture-first** in v0.3.1 — full wiki graph and KB browsing are v0.4+. This keeps the mobile surface tiny.

### Hardening (MANDATORY for v0.3.1)
The existing MCP server on `:7723` has **no authentication today** (I read `mcpServer.ts` end-to-end — zero auth checks). Before any mobile write endpoint ships:
- Add Bearer-token middleware to every endpoint (MCP tools included — agents should already require this; add it now rather than adding it twice).
- Bind to `0.0.0.0` only when mobile mode is enabled in Settings; remain `127.0.0.1`-bound otherwise. Expose a toggle.
- Generate a pairing token (e.g. 256-bit random, base32) on first "Pair Mobile" click; display as QR + text. Store hashed (SHA-256) in `electron-conf`.
- Rate-limit incoming writes (per IP, token-bucket) to blunt a rogue device on the LAN.
- Log every mobile POST to a visible "Mobile activity" list in Settings so the user can see what's been written.

### New Components

| File | Single responsibility |
|------|-----------------------|
| `src/main/mobile/server.ts` | Extends the existing HTTP server in `mcpServer.ts` (or pulls the `createServer` call out and mounts both MCP and mobile routes on the same listener). Routes: `POST /mobile/notes`, `GET /mobile/ping`, `GET /mobile/recent` (read-only, last 20 notes). |
| `src/main/mobile/auth.ts` | Bearer middleware. Constant-time compare against the hashed pairing token. |
| `src/main/mobile/pairing.ts` | Generate pairing token, produce QR data URL (via `qrcode` npm package — small, MIT), revoke token. |
| `src/main/mobile/bindingMode.ts` | Switch listener between `127.0.0.1` and `0.0.0.0` based on a `conf.get('mobileEnabled')` flag; restart listener on change. |
| `mobile-pwa/` (new top-level dir) | Separate minimal PWA project. Vite + React + TailwindCSS (matches desktop stack for reuse). Capture buffer + offline queue + pairing flow. **Separate `package.json`; not bundled with Electron.** Built output deployed either (a) to GitHub Pages (static hosting is not a backend; doesn't violate local-first since the PWA then talks *only* to the user's desktop) or (b) served by the desktop's HTTP server itself at `GET /mobile/app` as a one-file SPA. |
| `src/renderer/src/components/settings/MobileSection.tsx` | Settings UI: Enable/Disable, "Pair Device" (shows QR + URL), list of paired devices, revoke. |

### Mobile surface in v0.3.1 (explicit scope)

| Feature | v0.3.1 | Later |
|---------|--------|-------|
| Capture a note (Enter to submit) | ✅ | |
| Offline queue + flush | ✅ | |
| See last 20 notes (read-only) | ✅ | |
| Pair via QR | ✅ | |
| View wiki graph | ❌ | v0.4+ |
| Browse wiki pages | ❌ | v0.4+ |
| Edit existing notes | ❌ | v0.4+ |
| Delete notes | ❌ | v0.4+ |
| Google Calendar prompts on mobile | ❌ | v0.4+ (reminders happen on desktop after sync) |
| View AI insights | ❌ (they appear after sync on desktop) | v0.4+ |

### Auth / Pairing flow

```
User clicks "Pair Mobile Device" in SettingsPanel
  └─▶ ipc mobile:startPairing → pairing.generate()
        ├─ random 256-bit token
        ├─ sha256 → conf.set('mobile.pairingTokenHash', hash)
        ├─ discover LAN IP (e.g. 192.168.1.42:7723)
        └─ return {url: https://<mobile-pwa-host>/pair#<token>@<ip>:<port>, qrDataUrl}
  ◀── QR shown in SettingsPanel

Mobile opens the URL (scanning the QR)
  └─▶ PWA reads token + desktop address from URL fragment
        └─▶ stores in IndexedDB
        └─▶ POST /mobile/ping with Authorization: Bearer <token>
              └─▶ auth.ts verifies hash → 200 {deviceId}

User types note on mobile → Submit
  └─▶ PWA POST /mobile/notes {rawText, clientId, clientCreatedAt}
        └─▶ auth.ts verifies
        └─▶ notes:create code path (reused from ipc.ts, factored into a callable function)
              ├─ INSERT notes row
              ├─ enqueueNote to aiWorker
              └─ return 201 {noteId, serverReceivedAt}
  ◀── PWA marks local queue item as synced
```

### Data Flow Changes

```
Mobile PWA submit
   ↓ (LAN, Bearer)
Desktop HTTP :7723 /mobile/notes
   ↓ (shared createNote() helper — extracted from ipc.ts notes:create)
notes table INSERT + FTS insert
   ↓
aiOrchestrator.enqueueNote (SAME as desktop path)
   ↓
aiWorker → result → wiki + reminder (if enabled) + note:aiUpdate to renderer
   ↓
Renderer receives 'note:aiUpdate' → NotesTab re-renders → mobile-submitted note appears
```

The critical design move: **factor `notes:create` logic into a shared `createNote(rawText, source)` function** used by both the IPC handler and the mobile HTTP handler. Prevents drift. `source: 'desktop' | 'mobile'` becomes a note column so the UI can optionally show where the note came from.

### New IPC Channels (desktop side)

| Channel | Direction | Payload | Response |
|---------|-----------|---------|----------|
| `mobile:getStatus` | renderer → main | — | `{enabled, listeningOn, pairedDevices: Array<{id, name, lastSeen, ip}>}` |
| `mobile:setEnabled` | renderer → main | `boolean` | `void` (restarts listener on bind change) |
| `mobile:startPairing` | renderer → main | — | `{url, qrDataUrl, expiresAt}` (token valid 10 min) |
| `mobile:revokeDevice` | renderer → main | `deviceId` | `void` |
| `mobile:activity` | main → renderer | `{at, deviceId, action, noteId?}` | (event) |

### New HTTP Endpoints (mobile side)

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/mobile/pair` | POST | pairing token | Claim pairing token, exchange for persistent device token |
| `/mobile/ping` | GET | Bearer | Health + pairing confirmation |
| `/mobile/notes` | POST | Bearer | Create note; triggers AI pipeline |
| `/mobile/recent` | GET | Bearer | Last N notes (read-only) |

### Build Order (intra-theme)

1. **Bearer auth middleware** added to existing `mcpServer.ts` (also retroactively protects MCP tools — cross-theme win). Independent of any mobile work.
2. **Extract `createNote()` helper** from `ipc.ts notes:create` into `src/main/notes/createNote.ts`. Refactor only, behaviour unchanged.
3. **Pairing machinery** (`pairing.ts`, `auth.ts`, `bindingMode.ts`) — gets tokens, QR, binding-mode toggle working. Test with curl.
4. **Mobile HTTP routes** (`mobile/server.ts`) — POST /mobile/notes etc., calling `createNote()`.
5. **SettingsPanel `MobileSection`** — pair UI + enable/disable + device list.
6. **PWA project** (`mobile-pwa/`) — pairing page, capture buffer, offline queue. Can proceed in parallel with 3–5 once the API shape is fixed.
7. **Activity log** in Settings — soft-launch safety net.

---

## Cross-Theme Coupling

| Dependency | Flag | Mitigation |
|------------|------|------------|
| Theme 3 **requires** Bearer auth on `:7723`. MCP server today has none. | HIGH | Ship Bearer auth as the *first* task of Theme 3 — it protects both MCP agents and the new mobile routes. Independent of the rest of Theme 3. |
| Theme 3 benefits from a `source` column on `notes` to distinguish mobile vs desktop. | MEDIUM | Add as part of the Theme 3 schema migration. Default `'desktop'` for existing rows. |
| Theme 1 extends the AI worker result schema. Theme 3 reuses the *same* pipeline via `createNote()`, so notes submitted from mobile **automatically** get Google-Calendar reminders on desktop — no extra work. | LOW (positive coupling) | Make sure the AI worker prompt changes ship *before* mobile endpoints open, or mobile notes won't get reminders in a release where desktop ones do. |
| Theme 1 UX (NoteCard chip) and Theme 3 (mobile-sourced notes appearing in NotesTab) both modify `NoteCard`. | LOW | Coordinate a single NoteCard rev; both chips use the same chip-rendering primitive. |
| Theme 2 is fully isolated. No dependency on Theme 1 or Theme 3. | — | Can ship independently; good candidate for first phase to land wins quickly. |

**Build-order recommendation across themes:**

1. Theme 2 first (isolated, low-risk, ships a visible win).
2. Theme 3 auth foundation (Bearer middleware + createNote extraction) next — unblocks Theme 3 AND retroactively secures MCP.
3. Theme 1 (Google Calendar) in parallel with rest of Theme 3 — no coupling in either direction.
4. Theme 3 mobile PWA last — largest surface, benefits from having Theme 1 already in so that mobile notes get reminders on day one.

---

## Scaling Considerations

Single-user desktop app — not a scaling-sensitive architecture. But some bounds are worth naming:

| Scale | What matters | Adjustment |
|-------|--------------|------------|
| < 1000 notes | Nothing. | None. |
| 1k–10k notes | `notes:getAll` returns everything; O(n²) similarity in `computeSimilarPairs` already capped at 100. Mobile `/mobile/recent` must paginate. | Add `limit`/`offset` to `notes:getAll`; add cursor-based pagination to `/mobile/recent`. |
| 10k+ notes | Wiki graph with 10k+ nodes at d3-force default settings will stutter; the sliders (Theme 2) actually help here by letting users reduce repel force / node count filter. | Consider a max-nodes graph prop (filter to top-N by edge count); add a "zoom to tag" subset view. |
| Mobile LAN throughput | N/A for note-text POSTs. Will matter if future versions sync images. | Defer; no image capture in v0.3.1. |

---

## Anti-Patterns

### Anti-Pattern: OAuth in the renderer
**What people do:** Open `window.open(googleAuthUrl)` in the renderer and listen for a redirect.
**Why wrong:** Client secret exposed to DevTools; any XSS in KB markdown rendering can exfiltrate tokens; renderer can't run a loopback HTTP listener without raw Node APIs (sandbox off → wider attack surface).
**Do this instead:** Main process runs a short-lived `http.createServer` on an ephemeral loopback port and owns the token exchange. Renderer only calls `window.api.calendar.startOAuth()`.

### Anti-Pattern: Unauthenticated local HTTP server bound to 0.0.0.0
**What people do:** "It's just local" → bind to all interfaces without auth.
**Why wrong:** LAN is not a trust boundary — coffee-shop Wi-Fi, rogue IoT devices, even a compromised smart TV can scan `:7723` and write notes (or read the KB via MCP).
**Do this instead:** Bind `127.0.0.1` by default. Only bind `0.0.0.0` when mobile mode is explicitly enabled. Bearer auth on every route. Rate limit.

### Anti-Pattern: Cloud relay that violates the project's stated principles
**What people do:** Spin up a Supabase/Fly.io relay to make "it just works" off-LAN.
**Why wrong:** Directly contradicts `PROJECT.md` principles 3 and 6 (local-first, trust via open source). Notes transit a proprietary server. Adds ops cost and adversary.
**Do this instead:** Accept that off-LAN sync is a feature for v0.4+, and only if a principled P2P transport (Iroh, libp2p, WebRTC + user-run signalling) is chosen.

### Anti-Pattern: Settings-tab for slider UI
**What people do:** Put graph sliders in the Settings modal.
**Why wrong:** Breaks the drag-see-adjust loop; every tweak requires modal open/close.
**Do this instead:** Floating overlay on the graph view itself, collapsed by default.

### Anti-Pattern: Running phrase detection as a separate AI pass
**What people do:** Worker returns tags/wiki; a second call extracts reminders.
**Why wrong:** 2× cost, 2× latency, second call has no context the first didn't.
**Do this instead:** Single structured-output pass with an optional `reminder` field.

---

## Integration Points (Summary Matrix)

### External services
| Service | Integration pattern | Notes |
|---------|---------------------|-------|
| Google Calendar | OAuth Authorization Code + PKCE in main process BrowserWindow; REST (`calendar/v3/events:insert`); refresh token stored via `safeStorage` + `electron-conf`. | No `googleapis` SDK — native `fetch` + 3 endpoints. Scope: `calendar.events` + `calendar.readonly` (for picker). |
| Mobile PWA | HTTP over LAN to desktop's `:7723`; Bearer auth; offline queue in IndexedDB. | Zero-infra; PWA hosted on GitHub Pages or served from desktop. |

### Internal boundaries
| Boundary | Communication | Notes |
|----------|---------------|-------|
| Main ↔ renderer | IPC (existing `contextBridge.exposeInMainWorld` pattern) | Add `window.api.calendar`, `window.api.graph`, `window.api.mobile`. Total ~14 new channels. |
| Main ↔ aiWorker | MessagePortMain (existing) | Extend `task` result schema with optional `reminder` field. |
| Main ↔ Google Calendar | HTTPS REST (new) | Token refresh handled in `googleClient.ts`. |
| Desktop ↔ mobile | HTTP LAN on `:7723` (new, on existing listener) | Bearer auth, 127.0.0.1 or 0.0.0.0 based on toggle. |
| `createNote(source)` shared between `ipc notes:create` handler and mobile route | Direct function call | Single source of truth for the AI enqueue pipeline. |

## Sources

- Direct code read (C:/Users/mflma/workspace/AInotepad/):
  - `src/main/index.ts`, `src/main/ipc.ts`, `src/main/aiOrchestrator.ts`, `src/main/mcpServer.ts`, `src/main/aiWorker.ts` (headers only)
  - `src/preload/index.ts`, `src/preload/index.d.ts`
  - `src/renderer/src/App.tsx`, `src/renderer/src/components/WikiTab.tsx`, `src/renderer/src/components/WikiGraph.tsx`
  - `.planning/PROJECT.md`
- Electron OAuth loopback pattern: Electron docs + Google's "Installed Apps" OAuth guide (PKCE + loopback redirect is Google's recommended desktop flow).
- react-force-graph-2d d3-force mutation pattern: already in use at `WikiGraph.tsx:61` — confirms sliders can re-mutate without component remount.

---
*Architecture research for: Notal v0.3.1 milestone (Reminders, Graph Control, Mobile)*
*Researched: 2026-04-19*
