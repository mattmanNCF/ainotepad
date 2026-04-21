# Requirements: Notal

**Defined:** 2026-04-17
**Core Value:** Every note is silently enriched by AI and grows into a searchable knowledge base — zero friction, zero prompting.

## v0.3.1 Requirements — Reminders, Graph Control, Mobile

### Calendar (Google Calendar integration)

- [ ] **CAL-SEC-01**: OAuth client type "Desktop app"; PKCE; no client_secret persisted; `asar extract` grep returns zero client_secret hits
- [ ] **CAL-SEC-02**: Refresh token stored only via `safeStorage.encryptString()`; config.json contains zero Google token prefixes
- [ ] **CAL-SEC-03**: Loopback redirect on ephemeral port, 127.0.0.1-only, non-deterministic port
- [ ] **CAL-UX-01**: No Calendar write without (a) silent+undo toast reachable OR (b) explicit user click within preceding 5s in opt-in confirm mode
- [ ] **CAL-UX-02**: Health indicator (green/yellow/red + last-success timestamp); per-note pending chip on failure
- [ ] **CAL-TZ-01**: `{timestamp_utc, original_tz, original_text}` triple; test matrix UTC + America/Los_Angeles + Asia/Kolkata + Pacific/Chatham + DST crossover
- [ ] **CAL-COST-01**: Piggyback pass; confidence ≥0.85 gate; 50-note corpus (5 TP) triggers ≤6 creation attempts
- [ ] **CAL-DEL-01**: Note delete cascades to Google event delete; confirmation with "don't ask again"; orphan reconciliation via `extendedProperties.private.notal_note_id`

### Graph (Dynamic wiki-graph control panel)

- [ ] **GRAPH-PERF-01**: p95 frame time ≤50ms on 500-node fixture during drag; 50ms throttle; `alphaTarget(0.1)` during / `(0)` on release
- [ ] **GRAPH-SCOPE-01**: Exactly 5 sliders at phase exit
- [x] **GRAPH-UX-01**: Always-visible Reset; adaptive defaults (multipliers); Ctrl+Z undo of last 10
- [ ] **GRAPH-A11Y-01**: axe-core clean; keyboard-only adjustable; paired numeric input

### Mobile (Path C — Google Drive transport)

- [ ] **MOB-AUTH-01**: Single Google OAuth consent combines `calendar.events` + `drive.appdata` scopes; no separate mobile pairing flow
- [ ] **MOB-AUTH-02**: Mobile identity = Google account; revoke = user revokes OAuth at Google Account security page; desktop detects 401, surfaces in Settings → Integrations
- [ ] **MOB-TRANS-01**: Transport = Drive `appDataFolder` (OAuth-client-private, no public links, no shared folders)
- [ ] **MOB-TRANS-02**: Desktop uses Drive Changes API with checkpointed `startPageToken`; polling fallback at 60s interval if Changes subscription fails
- [ ] **MOB-TRANS-03**: Desktop deletes Drive file after successful ingestion via `createNote()`; no cloud retention of note text
- [ ] **MOB-PWA-01**: Mobile PWA hosted as static artifact at `https://mattmanNCF.github.io/notal-mobile/`; installable on iOS and Android; offline-first with IndexedDB queue
- [ ] **MOB-PWA-02**: Capture-only UI on mobile: text input, submit, delivery-state badge; no browse, search, or wiki access
- [ ] **MOB-SEC-01**: Per-file schema validation on desktop (≤16KB text, strict JSON schema, malformed rejected and logged); `createNote(rawText, source)` single code path shared with desktop capture
- [ ] **MOB-UX-01**: Mobile shows explicit delivery states: local → uploading → on-drive → ingested (observed via Drive file deletion)
- [ ] **MOB-UX-02**: Desktop-wake grace banner: on app launch, drain pending Drive notes and report count processed
- [ ] **MOB-QUOTA-01**: Warn at 10MB appdata folder; hard stop at 100MB (indicates stuck ingestion loop); user surfaced in Settings

### Cross-cutting

- [ ] **XCUT-SEC-02**: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`; boot-time assertion
- [ ] **XCUT-CSP-01**: `connect-src` enumerates explicit hosts; no `'unsafe-inline'`, `'unsafe-eval'`, or blanket `https:`

---

## v0.1.0 Requirements (Initial Release — Validated, Shipped)

### Note Capture
- ✓ **CAP-01**: User submits a note by pressing Enter — v0.1.0 Phase 01
- ✓ **CAP-02**: Note is immediately visible in the notes list while AI processes — v0.1.0 Phase 01

### AI Pipeline
- ✓ **AI-01**: AI automatically tags, organizes, and adds insights to every submitted note — v0.1.0 Phase 02
- ✓ **AI-02**: AI integrates each note into the Karpathy-style wiki — v0.1.0 Phase 03
- ✓ **AI-03**: User can configure Claude or OpenAI API key in settings — v0.1.0 Phase 02
- ✓ **AI-04**: User can use Ollama local models as an AI provider — v0.1.0 Phase 04

### Wiki / KB
- ✓ **WIKI-01**: User can browse the auto-generated wiki by topic — v0.1.0 Phase 03
- ✓ **WIKI-02**: User can assign and customize tag colors in the wiki sidebar — v0.1.0 Phase 03

### Search & Patterns
- ✓ **SRCH-01**: User can search notes by full-text and semantic similarity — v0.1.0 Phase 04
- ✓ **PAT-00**: Patterns tab shows word cloud, daily/weekly AI narrative, and note statistics — v0.1.0 Phase 04

### Agent Connectivity
- ✓ **AGNT-01**: External MCP-compatible agents can read recent notes and wiki pages via local HTTP — v0.1.0 Phase 05

### Distribution
- ✓ **DIST-01**: User can install Notal on Windows via NSIS installer or portable ZIP — v0.1.0 Phase 06

---

## v0.3.0 Requirements — Corkboard Polish

### Corkboard View

- [x] **CORK-01**: Notes display as small square post-it cards with text truncated to fit compact size
- [x] **CORK-02**: Hovering a note brings it to foreground and expands it — showing full user text and AI insights with user/AI bifurcation and scrollbar, without moving other cards
- [x] **CORK-03**: Note left border color reflects the primary tag's wiki color (replacing AI-state amber/emerald/red)
- [x] **CORK-04**: All notes display colored dot indicators for every assigned tag (currently only most recent note shows dots)
- [x] **CORK-05**: Notes sharing a tag that also discuss similar sub-topics are connected by visible edges on the corkboard (using existing sqlite-vec embeddings — no new AI calls)

### Patterns Page

- [ ] **PAT-01**: Patterns page footer (note count, top topics, most active day) is fully visible at default window size without scrolling
- [x] **PAT-02**: Weekly AI summary pre-generates on first open — no blank/Generate-Now state
- [x] **PAT-03**: Weekly digest uses a rolling 7-day window that updates daily (Day 8 = days 2–8, Day 9 = days 3–9)

### App Icon

- [x] **ICON-01**: App icon replaced with custom illustrated asset (ChatGPT-generated image from user's Downloads folder, or commissioned art)

---

## v2 Requirements (Deferred)

### AI Performance
- **PERF-01**: Ollama inference latency reduced via streaming partial results
- **PERF-02**: Local model auto-selection based on available VRAM

### New Capabilities
- **CAP-03**: Agent write-back — external agents can append notes or wiki entries
- **CAP-04**: llama.cpp bundled local model (no separate Ollama install required)
- **SYNC-01**: Cross-device note sync via user-provided storage (S3-compatible)

### Deferred from v0.3.1
- **XCUT-SEC-01**: Bearer auth on MCP (deferred from v0.3.1; desirable defense-in-depth, non-gating after Path C mobile)
- **CAL-RECUR-01**: RRULE recurrence in reminder detection
- **CAL-REPROC-01**: Re-process on note edit
- **MOB-OCR-01**: Mobile photo capture + OCR
- **MOB-VOICE-01**: Mobile voice capture + transcription
- **MOB-QUERY-01**: Mobile `/search` and `/recent` read endpoints
- **CAL-MS-01**: Microsoft Graph / Outlook calendar integration
- **MOB-NATIVE-01**: Native iOS / Android app (if PWA eviction becomes too painful)
- **GRAPH-3D-01**: 3D graph view
- **GRAPH-FILT-01**: Graph filter controls (tag filters, date range)

---

## Out of Scope

| Feature | Reason |
|---------|--------|
| Cross-device sync | Only note capture syncs via Drive `appDataFolder` (v0.3.1); full cross-device KB sync (wiki, edits, graph) remains out of scope |
| AI performance improvements (Ollama) | Primary bottleneck is Ollama runtime — out of our control for v0.3.0 |
| New AI capabilities (summarization, Q&A) | v0.3.1+ capability milestone |
| Agent new features | v0.3.1+ capability milestone |

---

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| CORK-01 | Phase 07 | Complete |
| CORK-02 | Phase 07 | Complete |
| CORK-03 | Phase 07 | Complete |
| CORK-04 | Phase 07 | Complete |
| CORK-05 | Phase 08 | Complete |
| PAT-01 | Phase 07 | Pending |
| PAT-02 | Phase 08 | Complete |
| PAT-03 | Phase 08 | Complete |
| ICON-01 | Phase 09 | Complete |

**Coverage:**
- v0.3.0 requirements: 9 total
- Mapped to phases: 9
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-17*
*Last updated: 2026-04-19 — milestone v0.3.1 Reminders, Graph Control, Mobile*
