# Notal Roadmap

## Current Milestone: v0.3.1 — Reminders, Graph Control, Mobile

## Phases

- [x] **Phase 01: Shell & Capture** - Electron shell, SQLite layer, tray, capture buffer
- [x] **Phase 02: AI Pipeline** - Silent AI processing on every note submission
- [x] **Phase 03: Karpathy Wiki** - AI-maintained knowledge base with wiki navigation
- [x] **Phase 04: AI Intelligence + Local Model + Patterns** - FTS5 search, semantic search, digest, word cloud
- [x] **Phase 05: Agent Layer** - MCP server for external agent read access
- [x] **Phase 06: Polish & Ship** - Onboarding, packaging, GitHub release
- [x] **Phase 07: Note Card Visual Redesign** - Post-it card layout with tag-color borders, hover-expand, and patterns footer fix (completed 2026-04-18)
- [x] **Phase 08: Connections + Digest Improvements** - Intra-tag edge connections and reliable rolling weekly digest (completed 2026-04-18)
- [x] **Phase 09: App Icon** - Replace placeholder icon with custom illustrated asset (completed 2026-04-19)
- [x] **Phase 10: Dynamic Wiki Graph Parameters** - Floating slider panel over wiki graph (5 sliders, 3 presets, persistence, Ctrl+Z undo)
 (completed 2026-04-21)
- [ ] **Phase 11: Google Calendar Integration** - OAuth loopback+PKCE, reminder detection, silent+undo calendar creation (v0.3.1 ship gate)
- [ ] **Phase 12: Mobile Extension (Drive transport)** - PWA at GitHub Pages + Drive `appDataFolder` ingress; droppable to v0.3.2

---

## Progress Table

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 01. Shell & Capture | Complete | Complete | 2026-04-14 |
| 02. AI Pipeline | Complete | Complete | 2026-04-15 |
| 03. Karpathy Wiki | Complete | Complete | 2026-04-16 |
| 04. AI Intelligence + Local Model + Patterns | Complete | Complete | 2026-04-16 |
| 05. Agent Layer | Complete | Complete | 2026-04-17 |
| 06. Polish & Ship | Complete | Complete | 2026-04-17 |
| 07. Note Card Visual Redesign | 2/2 | Complete    | 2026-04-18 |
| 08. Connections + Digest Improvements | 0/3 | Complete    | 2026-04-18 |
| 09. App Icon | 3/3 | Complete    | 2026-04-19 |
| 10. Dynamic Wiki Graph Parameters | 4/4 | Complete    | 2026-04-21 |
| 11. Google Calendar Integration | 6/7 | In Progress|  |
| 12. Mobile Extension (Drive transport) | 1/6 | In Progress|  |

---

## Phase Details

### Phase 01: Shell & Capture
**Goal**: Working Electron app with note capture and SQLite persistence
**Depends on**: Nothing
**Requirements**: CAP-01, CAP-02
**Success Criteria** (what must be TRUE):
  1. User can type a note and submit with Enter
  2. Note appears immediately in the notes list while AI processes
  3. App persists to system tray and reopens via global shortcut
**Plans**: 01-01, 01-02, 01-03, 01-04 — all complete

---

### Phase 02: AI Pipeline
**Goal**: Silent AI processing on every note submission — Electron utilityProcess worker, frontier API integration (Claude/OpenAI with user API key), and aiState/aiAnnotation written back to SQLite and surfaced in the UI.
**Depends on**: Phase 01
**Requirements**: AI-01, AI-03
**Success Criteria** (what must be TRUE):
  1. Every submitted note is automatically tagged and organized without user action
  2. AI insights appear inline on the note without any prompting
  3. User can enter a Claude or OpenAI API key in settings and it persists
**Plans**: 02-01, 02-02, 02-03, 02-04, 02-05 — all complete

---

### Phase 03: Karpathy Wiki
**Goal**: AI-maintained knowledge base with Markdown storage, wikilink navigation, and graph visualization.
**Depends on**: Phase 02
**Requirements**: AI-02, WIKI-01, WIKI-02
**Success Criteria** (what must be TRUE):
  1. User can browse auto-generated wiki topics in the sidebar
  2. Notes are automatically integrated into wiki topic pages
  3. User can assign and customize tag colors that propagate through the UI
**Plans**: 03-01, 03-02, 03-03, 03-04 — all complete

---

### Phase 04: AI Intelligence + Local Model + Patterns Tab
**Goal**: AI worker gains retrieval capabilities (FTS5 + wiki graph) for grounded insight annotations. Local Gemma 4 model via node-llama-cpp as first-class provider. Patterns tab replaces Search placeholder with word cloud + AI digest.
**Depends on**: Phase 03
**Requirements**: AI-04, SRCH-01, PAT-00
**Success Criteria** (what must be TRUE):
  1. User can search notes by full-text and semantic similarity
  2. Patterns tab shows word cloud, daily/weekly AI narrative, and note statistics
  3. User can select a local Ollama model as AI provider in settings
**Plans**: 04-01 through 04-08 — all complete

---

### Phase 05: Agent Layer
**Goal**: Expose Notal note and wiki data to external AI agents via a bundled MCP server. Read-only. HTTP transport on localhost:7723. 4 tools.
**Depends on**: Phase 04
**Requirements**: AGNT-01
**Success Criteria** (what must be TRUE):
  1. External MCP-compatible agent can call get_recent_notes and receive note data
  2. External agent can call get_wiki_page and receive wiki content
  3. Connection URL is visible and copyable in Settings
**Plans**: 05-01, 05-02, 05-03 — all complete

---

### Phase 06: Polish & Ship
**Goal**: Onboarding, packaging, and distribution of Notal v0.1.0.
**Depends on**: Phase 05
**Requirements**: DIST-01
**Success Criteria** (what must be TRUE):
  1. User can install Notal on Windows via NSIS installer
  2. Portable ZIP works without installation
  3. First-launch onboarding modal guides user through setup
**Plans**: 06-01, 06-02, 06-03, 06-04, 06-05, 06-06 — all complete

---

### Phase 07: Note Card Visual Redesign
**Goal**: The corkboard presents notes as small post-it cards with tag-color left borders, colored tag dots on every card, in-place hover-expand with user/AI bifurcation, and a patterns footer that fits at default window size.
**Depends on**: Phase 06
**Requirements**: CORK-01, CORK-02, CORK-03, CORK-04, PAT-01
**Success Criteria** (what must be TRUE):
  1. All notes display as compact square cards with text truncated — corkboard fills the view without scrolling
  2. Hovering a card expands it in-place showing full user text above and AI insights below (with scrollbar), without shifting other cards
  3. Each note card shows a left border colored to match its primary tag's wiki color — amber/emerald/red AI-state coloring is gone
  4. Every note card shows colored dot indicators for all its assigned tags, not just the most recently submitted note
  5. The Patterns page footer (note count, top topics, most active day) is fully visible at default 800x600 window size without scrolling
**Plans**: 2 plans
Plans:
- [x] 07-01-PLAN.md — Tags DB fix, aiInsights propagation, word cloud height reduction
- [x] 07-02-PLAN.md — Compact card layout, tag-color border, hover-expand portal overlay

---

### Phase 08: Connections + Digest Improvements
**Goal**: Notes sharing a tag and similar sub-topics are visually connected by edges on the corkboard; the weekly digest pre-loads on open and uses a true rolling 7-day window.
**Depends on**: Phase 07
**Requirements**: CORK-05, PAT-02, PAT-03
**Success Criteria** (what must be TRUE):
  1. Notes that share a tag and have high embedding similarity show a visible connecting edge on the corkboard — no new AI calls required
  2. The weekly digest is present and populated when the Patterns tab is first opened — no blank state or manual Generate Now
  3. The weekly digest window advances daily: opening on Day 8 shows days 2–8, Day 9 shows days 3–9
**Plans**: 3 plans
Plans:
- [x] 08-01-PLAN.md — TF-IDF similarity computation + IPC handler (main process)
- [x] 08-02-PLAN.md — SVG edge overlay on corkboard (NotesTab + NoteCard onRef prop)
- [x] 08-03-PLAN.md — Digest improvements: weekly pre-load on mount + calendar-aligned rolling window

---

### Phase 09: App Icon
**Goal**: The Notal app uses a custom illustrated icon throughout — taskbar, tray, installer, and About dialog.
**Depends on**: Phase 08
**Requirements**: ICON-01
**Success Criteria** (what must be TRUE):
  1. The app icon in the Windows taskbar and system tray shows the custom illustrated asset, not the placeholder geometric icon
  2. The NSIS installer uses the custom icon
  3. The icon renders cleanly at 16x16, 32x32, and 256x256 sizes
**Plans**: 3 plans
Plans:
- [x] 09-01-PLAN.md — Source asset + icon generator script (illustrated lemur PNG → multi-resolution ICO + tray PNG)
- [x] 09-02-PLAN.md — Wire icons through main process (tray, BrowserWindow, About) + explicit electron-builder keys
- [x] 09-03-PLAN.md — Build Windows distribution + human verification checkpoint

---

### Phase 10: Dynamic Wiki Graph Parameters
**Goal**: A floating top-right collapsible overlay on the wiki graph exposes exactly 5 Radix sliders (link force, center force, repel force, edge thickness, node size) with 3 named presets (Dense, Spacious, Hierarchical), an always-visible Reset, per-user persistence via `electron-conf`, and Ctrl+Z undo of the last 10 parameter changes. Builds first: isolated, low-risk, visible win — and establishes the IPC/settings overlay patterns that Phase 11's Settings → Integrations panel reuses.
**Depends on**: Phase 09
**Requirements**: GRAPH-PERF-01, GRAPH-SCOPE-01, GRAPH-UX-01, GRAPH-A11Y-01
**Success Criteria** (what must be TRUE):
  1. User can open a floating panel over the wiki graph and adjust 5 sliders live — the graph responds without a reload and settles within ~1 second of slider release
  2. p95 frame time during drag stays ≤50ms on a 500-node fixture (50ms throttle + `alphaTarget(0.1)` during drag / `alphaTarget(0)` on release — prevents B1 re-heat pitfall)
  3. 3 named presets (Dense, Spacious, Hierarchical) apply in one click; always-visible Reset restores adaptive defaults; Ctrl+Z steps back through the last 10 parameter changes
  4. Panel is keyboard-only operable with paired numeric input per slider and axe-core reports zero violations
  5. Chosen slider values persist across app restarts via `electron-conf` per-user
**Plans**: 4 plans
Plans:
- [x] 10-01-PLAN.md — Install @radix-ui/react-slider + IPC scaffold (graph-params:get/save + electron-conf persistence + GraphParams contract)
- [x] 10-02-PLAN.md — GraphParamsPanel component + 5 sliders wired live to WikiGraph d3 forces (50ms save throttle + alphaTarget lifecycle)
- [x] 10-03-PLAN.md — 3 presets (Dense/Spacious/Hierarchical) + always-visible Reset + Ctrl+Z undo (last 10, panel-focus scoped)
- [x] 10-04-PLAN.md — Keyboard a11y + axe-core scan (zero violations) + 500-node perf fixture (p95 ≤50ms)
**Research flag**: LOW — skip `/gsd:research-phase`
**Deps**: `@radix-ui/react-slider@1.3.6`

---

### Phase 11: Google Calendar Integration
**Goal**: OAuth 2.0 loopback + PKCE (Desktop-app client type, no `client_secret` persisted) connects the user's Google account; the existing AI worker's structured output piggybacks reminder detection (no second model call), `chrono-node` sanity-checks the emitted date, and confidence ≥0.85 gates silent calendar event creation. Every create shows a 10-second Undo toast plus a persistent inline chip on the note card. Refresh tokens are encrypted via `safeStorage.encryptString()`; timezones stored as `{timestamp_utc, original_tz, original_text}`; note deletion cascades to Google event deletion. MVP-critical — this is the ship gate for v0.3.1. Reuses the Settings overlay pattern from Phase 10 in a new Settings → Integrations tab.
**Depends on**: Phase 10
**Requirements**: CAL-SEC-01, CAL-SEC-02, CAL-SEC-03, CAL-UX-01, CAL-UX-02, CAL-TZ-01, CAL-COST-01, CAL-DEL-01, XCUT-SEC-02, XCUT-CSP-01
**Success Criteria** (what must be TRUE):
  1. User connects Google Calendar in Settings → Integrations via a loopback+PKCE flow on an ephemeral 127.0.0.1 port; `asar extract` grep returns zero `client_secret` hits; disconnect+revoke works end-to-end
  2. On a 50-note fixture with 5 true-positive reminders, the system attempts ≤6 calendar creations (confidence ≥0.85 gate holds; piggyback adds zero extra model calls)
  3. Every calendar creation is either silently performed with a reachable 10-second Undo toast, or (when `confirmBeforeCreate: true`) requires an explicit user click within the preceding 5s; a persistent chip on the note card links to the Google Calendar web event
  4. Timezone test matrix passes for UTC + America/Los_Angeles + Asia/Kolkata + Pacific/Chatham + a DST crossover — stored UTC matches Google event start, original IANA zone and original text survive round-trip
  5. Deleting a note deletes the linked Google event (reconciled via `extendedProperties.private.notal_note_id`); "don't ask again" confirmation respected; health indicator in Settings → Integrations shows green/yellow/red + last-success timestamp; refresh token present in `safeStorage` and absent from `config.json`
**Plans**: 7 plans
Plans:
- [x] 11-01-PLAN.md — Foundation: deps, build-time secret injection, reminders table, CSP hardening, sandbox migration + boot assertion
- [x] 11-02-PLAN.md — OAuth loopback+PKCE + tokenStore (safeStorage) + googleClient factory + calendar:* connect/disconnect/status IPC
- [x] 11-03-PLAN.md — AI worker reminder piggyback (6th JSON field) + grammar + reminderParser (chrono+luxon) + 5-zone test matrix
- [x] 11-04-PLAN.md — reminderService: confidence gate, 10s undo lifecycle, events.insert with extendedProperties, 4 push channels, delete-confirm IPC surface
- [x] 11-05-PLAN.md — Delete cascade: notes:delete calls events.list+delete via notal_note_id; don't-ask-again preference
- [x] 11-06-PLAN.md — Renderer UI: GoogleCalendarSection, UndoToast, NoteCard chip, NotesTab delete-confirm dialog
- [ ] 11-07-PLAN.md — Ship-gate human-verify checkpoint on packaged NSIS installer (all 10 requirements + automated asar/config greps)
**Research flag**: MEDIUM — /gsd:research-phase complete (11-RESEARCH.md). Stack: google-auth-library@10.6.2 + @googleapis/calendar@14.2.0 + chrono-node@2.9.0 + luxon@3.7.2 (luxon required for Pacific/Chatham + IANA DST)
**Deps**: `google-auth-library@10.6.2` + `@googleapis/calendar@14.2.0` (split packages — 1.4MB vs 190MB monolith) + `chrono-node@2.9.0` + `luxon@3.7.2` (+ `@types/luxon` dev) + `tsx` dev (test runner)
**New code**: `src/main/calendar/{oauthFlow,tokenStore,googleClient,reminderService}.ts`; `reminders` table migration; `calendar:*` IPC handlers; `GoogleCalendarSection` in Settings → Integrations; inline chip on `NoteCard`
**Pitfalls addressed**: A3 (refresh token `safeStorage`), A4 (no unilateral creation — silent+undo), A5 (timezone triple), D1 (binary gate — this is the ship gate, no "80% done" exit)

---

### Phase 12: Mobile Extension (Path C — Google Drive transport)
**Goal**: A static PWA at `https://mattmanNCF.github.io/notal-mobile/` (hosted on GitHub Pages) performs client-side Google OAuth requesting `calendar.events` + `drive.appdata` in a single shared consent with Phase 11 (incremental scope add, one grant). Mobile text input writes a JSON envelope to Drive's `appDataFolder`; desktop subscribes to Drive Changes (push preferred, 60s polling fallback via checkpointed `startPageToken`) and ingests each file via a shared `createNote(rawText, source='mobile-drive')` code path, then deletes the Drive file so the folder stays empty. IndexedDB queue on mobile handles offline. Largest surface in the milestone — but the MCP Bearer prerequisite is GONE under Path C and the OAuth consent is already done by Phase 11. **Droppable to v0.3.2 if Phase 11 runs long; v0.3.1 ships with Graph + Calendar alone.**
**Depends on**: Phase 11
**Requirements**: MOB-AUTH-01, MOB-AUTH-02, MOB-TRANS-01, MOB-TRANS-02, MOB-TRANS-03, MOB-PWA-01, MOB-PWA-02, MOB-SEC-01, MOB-UX-01, MOB-UX-02, MOB-QUOTA-01
**Success Criteria** (what must be TRUE):
  1. End-to-end capture: a note typed into the iPhone Safari PWA (installed to home screen) appears in desktop Notal within 60s via Drive Changes subscription, or within ≤2 minutes via the 60s polling fallback if push subscription fails
  2. At first Google connect after Phase 11 is in, the user sees a single incremental-consent prompt adding `drive.appdata` to the existing `calendar.events` grant — no second pairing flow, no device tokens, no QR; `revoke at Google Account security` terminates both sides and desktop surfaces the 401 in Settings → Integrations
  3. After successful ingestion of a mobile note, the corresponding file in Drive `appDataFolder` is deleted (inspectable via Drive API); desktop detects a stuck-ingestion loop by folder size — warning at 10MB, hard stop at 100MB (MOB-QUOTA-01)
  4. Mobile UI shows explicit delivery states (local → uploading → on-drive → ingested, the last observed via Drive file deletion); on desktop launch a grace banner reports count of pending Drive notes drained; `createNote(rawText, source)` is the single shared code path with desktop capture, validated against a strict ≤16KB JSON schema that rejects malformed files with a log entry
  5. Mobile PWA is capture-only (no browse, search, wiki) and works offline — IndexedDB queue persists across tab close + reconnect; when GitHub Pages is reachable and the user is online, the queue drains automatically
**Plans**: 6 plans
Plans:
- [x] 12-01-PLAN.md — Foundation: deps, source column, shared createNote(), GOOGLE_WEB_CLIENT_ID define + BLOCKING Wave 0 appDataFolder cross-client verification
- [ ] 12-02-PLAN.md — Desktop ingestion: oauthFlow scopes param, driveClient, changesPoller (60s appDataFolder poll), ingestService (ajv + createNote + delete + quota), IPC + preload + boot wiring
- [ ] 12-03-PLAN.md — Mobile PWA scaffold + capture UI (Vite 6 + VitePWA + idb), GIS token client, multipart Drive upload
- [ ] 12-04-PLAN.md — Desktop renderer UI: DriveMobileSection (Settings > Integrations), WakeBanner (MOB-UX-02)
- [ ] 12-05-PLAN.md — GitHub Pages deploy pipeline (actions/deploy-pages) + mobile-pwa/README
- [ ] 12-06-PLAN.md — Ship-gate human-verify: 7-test matrix on packaged installer + live PWA
**Research flag**: HIGH — targeted research on Drive Changes API push subscriptions vs 60s polling, `vite-plugin-pwa` config for static GitHub Pages publish, COOP/COEP headers if cross-origin isolation is needed for any PWA feature
**Deps**: Drive REST API v3 via `googleapis` (reuses Phase 11 client), `vite-plugin-pwa` for mobile PWA build, `idb` (IndexedDB wrapper) for mobile offline queue
**New code**: `src/main/drive/{driveClient,changesPoller,ingestService}.ts`; `source` column migration on `notes`; Settings → Integrations mobile section; new `mobile-pwa/` subproject (separate Vite config, static build pipeline to `docs/` for GitHub Pages publish)
**Pitfalls addressed (Path C–specific, re-mapped from SUMMARY.md)**:
  - Drive Changes API reliability — push subscription can silently drop; 60s polling fallback at `startPageToken` checkpoint required (MOB-TRANS-02)
  - OAuth consent scope explosion — appending `drive.appdata` to an already-granted `calendar.events` must use incremental consent so the user sees the clear scope delta (MOB-AUTH-01)
  - GitHub Pages outage — PWA unreachable during Pages downtime; acceptable because capture is async and the IndexedDB queue persists locally (MOB-PWA-01, MOB-UX-01)
  - Drive appdata quota stalling — a broken ingestion loop could balloon the folder; MOB-QUOTA-01 warns at 10MB and hard-stops at 100MB
  - D1 binary gate — Phase 12 either fully lands or is dropped to v0.3.2; no "80% mobile" ship
**Dropped from Path A (no longer applicable under Path C)**: QR pairing with TTL, mTLS / self-signed cert + fingerprint pinning, 0.0.0.0 bind toggle, iOS 7-day eviction for auth, per-device Bearer tokens on MCP (XCUT-SEC-01 deferred to v2)
**Schedule flag**: Droppable to v0.3.2 if Phase 11 (ship gate) runs long — v0.3.1 can ship with Graph + Calendar only
