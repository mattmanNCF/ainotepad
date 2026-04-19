# Project Research Summary — Notal v0.3.1

**Project:** Notal (AInotepad)
**Milestone:** v0.3.1 — Reminders, Graph Control, Mobile
**Domain:** Electron desktop app extension — OAuth'd Google Calendar integration, interactive D3 force-graph parameters, networked mobile capture companion
**Researched:** 2026-04-19
**Confidence:** HIGH for Themes 1 (Calendar) and 2 (Graph); **MEDIUM/CONFLICTED** for Theme 3 (Mobile) — researcher outputs disagree on platform shape and the user must decide during REQUIREMENTS.

---

## Executive Summary

v0.3.1 extends shipped Notal v0.3.0 with three independent themes. Two (Calendar, Graph) have well-characterised engineering shapes and HIGH research confidence; the third (Mobile) has **two defensible product shapes in tension** that the requirements phase must resolve before architecture can stabilise. The recommended phase order is **Graph → Calendar → Mobile**, because Graph is isolated and low-risk (a visible early win), Calendar is self-contained and ships real user value, and Mobile is the largest surface with cross-theme prerequisites (MCP auth hardening) plus the unresolved product fork. Mobile should be explicitly flagged as "schedule at risk; droppable to v0.3.2 if the calendar or graph work runs long."

The domain pattern across all three themes is unchanged: quiet local-first AI augmenting a solo-user knowledge base, with all credential storage via Electron `safeStorage` and all persistence through the existing `electron-conf` / SQLite+Drizzle stack. New dependencies are modest (`chrono-node`, `@radix-ui/react-slider`, and — conditional on the mobile product decision — either `vite-plugin-pwa` + Fastify hardening or Telegram bot polling). No native-module rebuilds are introduced.

The largest product risk across all three themes is **silent side-effects that contradict Notal's "quiet" principle**: a unilaterally-created calendar event, a slider value silently stale against a grown graph, and a mobile note that the user believes was saved but was dropped. The research converges on a consistent mitigation: *silence is for AI suggestions, not for user-confirmed actions that failed.* Every user-visible side effect gets a low-friction "undo" affordance (a 10-second toast for calendar events, always-visible Reset for sliders, explicit delivery states for mobile notes).

## Key Findings

### Recommended Stack

All four research files agree on Electron 39 + React 19 + Vite 7 + better-sqlite3 + `electron-conf` + `safeStorage` as unchanged baseline. New dependencies are per-theme:

**Core technologies (new in v0.3.1):**
- `chrono-node@2.9.0` — natural-language date parser; pure JS, no native deps
- `@radix-ui/react-slider@1.3.6` — accessible headless slider primitive; 15 KB, ARIA-complete
- `googleapis@171.4.0` OR native `fetch` against 3 endpoints (ARCHITECTURE recommends thin fetch for bundle size; STACK recommends SDK for battle-tested refresh) — decide in REQUIREMENTS
- **Mobile: undecided** — depends on Path A vs Path B fork

**Critical existing-infrastructure correction:** The `/gsd:new-project` brief said "MCP server runs Fastify with Bearer auth on :7723". ARCHITECTURE researcher read `src/main/mcpServer.ts` end-to-end and confirms this is wrong today: MCP runs on `node:http` (not Fastify) with **zero authentication**. Adding Bearer auth is a prerequisite for any mobile path and a cross-theme win.

**Rejected definitively across all researchers:** `keytar` (archived Dec 2022), custom `notal://` OAuth redirect (Google discouraged + Windows hijack risk), cloud relay for mobile sync (violates PROJECT.md principle 3), Yjs/Automerge CRDT for v0.3.1 (overkill for capture-only).

### Expected Features

**Must have (table stakes):**

*Calendar:* OAuth 2.0 loopback-redirect + PKCE (Desktop-app client type, no client_secret persisted); reminder detection with confidence-gated calendar creation; inline "event created" chip on note card + link to Google Calendar web; secure refresh-token storage via `safeStorage`; disconnect/revoke flow; timezone correctness.

*Graph:* Exactly 5 sliders (link force, center force, repel force, edge thickness, node size); live-preview response during drag (throttled to 50ms); per-user global persistence; always-visible Reset; 3 named presets (Dense/Spacious/Hierarchical).

*Mobile (common to both paths):* Pair/unpair flow with per-device revocation; capture-only (no wiki/graph browse); offline queue on mobile durable before sync attempt; AI pipeline processing on desktop; `source` column on `notes` table.

**Should have (differentiators):**
- Calendar: "Unclear intents" review queue in Patterns for sub-threshold detections
- Calendar: Dedicated "Notal" calendar option on first connect
- Graph: Adaptive defaults (slider values become multipliers of node-count-scaled baselines)
- Mobile: Per-note source attribution surfaced in search
- Mobile: Acknowledgment back to capture channel

**Defer (v2+):** RRULE recurrence; re-process on note edit; mobile photo/OCR + voice; mobile `/search`+`/recent`; Outlook/Microsoft Graph; native iOS/Android app; full wiki/graph on mobile; 3D graph; graph filters.

### Architecture Approach

Each theme lands on top of existing Electron main/renderer/preload/aiWorker/SQLite with minimal structural change. Calendar and Graph are drop-ins with new IPC + one new table (`reminders`). Mobile is the only theme touching transport and bind-address policy.

**Major components (new in v0.3.1):**

1. **`src/main/calendar/*`** (oauthFlow, tokenStore, googleClient, reminderService) — main-process module owning OAuth + token refresh + event creation + idempotency. OAuth MUST live in main process (not renderer).
2. **`src/renderer/src/components/GraphControlPanel.tsx`** — floating collapsible overlay on graph view (top-right), NOT a Settings-tab panel. Direct mutation of existing `graphRef.current.d3Force(...)` hook.
3. **Mobile ingress** — shape depends on Path A vs B. Both paths share a factored-out `createNote(rawText, source)` helper extracted from `ipc notes:create` — single source of truth.
4. **Schema migration** — `reminders` table + `source` column on `notes`. Single migration, path-agnostic for the column.

**Shared substrate:** new **Settings → Integrations** tab hosts Google Calendar (connect/disconnect/status) and Mobile (pair/unpair/device list OR Telegram config). Build once during whichever theme ships first.

### Critical Pitfalls

1. **Unilateral calendar event creation** (A4) — biggest product risk. Resolution: silent creation + 10-second Undo toast + persistent chip (see Conflict Resolution §2).
2. **LAN-exposed MCP with single-token auth** (C1/C2) — MCP has zero auth today. Bearer middleware + per-device tokens + 127.0.0.1 default bind required first.
3. **Slider drag triggers force-sim re-heat every tick** (B1) — 500-node graphs realistic at month-six usage. Throttle to 50ms, `alphaTarget(0.1)` during drag / `alphaTarget(0)` on release, p95 ≤50ms.
4. **Refresh token in plaintext `electron-conf`** (A3) — `safeStorage.encryptString()` only, mirroring existing `apiKeyEncrypted` pattern.
5. **Timezone drift between AI parse, SQLite, Google API** (A5) — store `{timestamp_utc, original_tz (IANA), original_text}` triple; `Intl.DateTimeFormat().resolvedOptions().timeZone` for user TZ; pass both offset and IANA zone to Google.
6. **Shipping all three themes half-done** (D1) — Calendar MVP-critical, Mobile droppable, Graph polish. Binary phase gates, no "80% done" exits.

## Conflict Resolution — Cross-Researcher Tensions

### 1. Mobile platform — USER DECISION REQUIRED

| Path | Recommended by | Pros | Cons |
|------|----------------|------|------|
| **Path A — PWA + LAN HTTP** | STACK, ARCHITECTURE, PITFALLS (threat model assumes this) | Web-standards, one codebase iOS+Android, offline queue, degrades gracefully, zero cloud dep | Requires MCP Bearer-auth hardening + TLS self-signed cert + fingerprint pinning + 0.0.0.0 bind toggle + iOS 7-day eviction UX; ~1 full phase |
| **Path B — Telegram-bot inbox** | FEATURES (other three didn't consider) | Zero new transport, chat_id = identity, free store-and-forward, sidesteps C1/C2/C5/C7/C8 entirely, matches Atlas pattern | External dependency (Telegram Bot API); not E2E; no install-to-home-screen |

**Surface as primary v0.3.1 product decision.** FEATURES's Path B was not visible to the other three, so their consensus on A should not be read as a majority vote.

**Tiebreakers:** Off-LAN capture → B. Install-to-home-screen → A. Solo-dev maintenance → B. Zero-external-deps ethos → A.

### 2. Calendar UX — silent+undo (RESOLVED)

FEATURES/ARCHITECTURE wanted silent auto-create; PITFALLS A4 wanted two-stage confirm. **Resolution: silent creation + 10-second Undo toast + persistent inline chip** — preserves "quiet" while giving immediate retraction. Opt-in `confirmBeforeCreate: true` setting for users who prefer modal confirmation. Confidence ≥0.85 gates creation at all; 0.5–0.85 routes to "Unclear intents" queue.

### 3. MCP auth status — RESOLVED (current-state correction)

Brief claimed Bearer auth exists; source read confirms **MCP `node:http` with zero auth today**. `XCUT-SEC-01`: add Bearer middleware as Phase 12's first task regardless of mobile path — cross-theme win.

### 4. Graph panel — RESOLVED (composite)

Floating top-right collapsible panel + exactly 5 Radix sliders + 3 presets + always-visible Reset + 50ms throttle + p95 ≤50ms on 500-node fixture + adaptive defaults (multipliers of node-count-scaled baselines).

### 5. Phrase detection — RESOLVED (composite)

Piggyback structural on existing AI worker structured output (no second call, ARCHITECTURE's integration win) + `chrono-node` as sanity check on emitted date field (STACK's precision contribution) + confidence ≥0.85 gate (PITFALLS's trust contribution) + regex pre-filter only for local-model mode (STACK's cost contribution, narrowed).

## Implications for Roadmap

### Phase 10 — Dynamic Wiki Graph Parameters
**Rationale:** Lowest risk, isolated, lands visible win early, builds IPC/settings patterns Calendar reuses.
**Delivers:** 5 sliders + 3 presets + Reset, floating panel, `electron-conf` persistence, p95 ≤50ms verified.
**Addresses:** FEATURES Theme 2 table stakes + presets.
**Avoids:** B1 (restart freeze), B2 (stale defaults), B3 (hidden recovery), B5 (scope creep), B6 (hard-coded params).
**Deps:** `@radix-ui/react-slider@1.3.6`.
**Research flag:** LOW — skip `/gsd:research-phase`.

### Phase 11 — Google Calendar Integration
**Rationale:** Self-contained, highest user value per D1 (MVP-critical), builds on Settings UI from Phase 10.
**Delivers:** OAuth connect/disconnect, reminder detection via piggyback + chrono sanity check, silent+undo creation, secure token storage, timezone correctness.
**Uses:** `googleapis@171.4.0` (or thin fetch), `chrono-node@2.9.0`, existing `safeStorage` + `electron-conf`, extended aiWorker structured output.
**Implements:** `src/main/calendar/*`, `reminders` table, `calendar:*` IPC, `GoogleCalendarSection`, NoteCard chip.
**Avoids:** A1 (Desktop-app+PKCE), A2 (loopback), A3 (safeStorage), A4 (silent+undo), A5 (TZ triple), A6 (piggyback+gate), A7 (cascade), A8 (health indicator).
**Research flag:** MEDIUM — quick confirmation on `googleapis` helpers + PKCE loopback specifics recommended.

### Phase 12 — Mobile Extension
**Rationale:** Largest surface, contains MCP auth hardening (cross-theme win), benefits from Calendar (mobile notes fire reminders via shared `createNote()`). Explicitly droppable to v0.3.2.
**Delivers (both paths):** Bearer auth on MCP (`XCUT-SEC-01`), `createNote(rawText, source)` extraction, `source` column, capture-only UI, pair/unpair UI, explicit delivery states, acknowledgment signal.
**Path-A additions:** PWA under `mobile-pwa/`, LAN HTTP endpoints, per-device tokens with scopes, QR pairing with 90s TTL + public-key exchange, self-signed TLS + pinning, iOS eviction UX copy.
**Path-B additions:** Telegram bot long-poll in main process, bot token + chat_id allowlist, `getUpdates` catch-up on launch, reaction-based ACK, no LAN binding at all.
**Schedule flag:** Droppable to v0.3.2. Calendar is the ship gate for v0.3.1.
**Research flag:** HIGH — requires user Path A vs B decision in REQUIREMENTS, then targeted research on chosen transport.

### Phase Ordering Rationale

- **Graph first** — isolated, low-risk, builds plumbing Calendar reuses, visible win for momentum.
- **Calendar second** — self-contained, MVP-critical, shares Settings UI with Mobile.
- **Mobile third** — largest surface, has MCP-auth prerequisite benefiting whole app, benefits from Calendar being in (mobile notes get reminders free), most droppable.

### Research Flags

Needs research: Phase 12 (HIGH — path decision + targeted transport research), Phase 11 (MEDIUM — quick googleapis+PKCE confirmation).
Standard patterns: Phase 10 (LOW — skip).

### Requirements Candidates (verbatim)

**Calendar:**
- `CAL-SEC-01` — OAuth client type "Desktop app"; PKCE; no client_secret persisted; `asar extract` grep returns zero client_secret hits
- `CAL-SEC-02` — Refresh token stored only via `safeStorage.encryptString()`; config.json contains zero Google token prefixes
- `CAL-SEC-03` — Loopback redirect on ephemeral port, 127.0.0.1-only, non-deterministic port
- `CAL-UX-01` — No Calendar write without (a) silent+undo toast reachable OR (b) explicit user click within preceding 5s in opt-in confirm mode
- `CAL-UX-02` — Health indicator (green/yellow/red + last-success timestamp); per-note pending chip on failure
- `CAL-TZ-01` — `{timestamp_utc, original_tz, original_text}` triple; test matrix UTC + America/Los_Angeles + Asia/Kolkata + Pacific/Chatham + DST crossover
- `CAL-COST-01` — Piggyback pass; confidence ≥0.85 gate; 50-note corpus (5 TP) triggers ≤6 creation attempts
- `CAL-DEL-01` — Note delete cascades to Google event delete; confirmation with "don't ask again"; orphan reconciliation via `extendedProperties.private.notal_note_id`

**Graph:**
- `GRAPH-PERF-01` — p95 frame time ≤50ms on 500-node fixture during drag; 50ms throttle; `alphaTarget(0.1)` during / `(0)` on release
- `GRAPH-SCOPE-01` — Exactly 5 sliders at phase exit
- `GRAPH-UX-01` — Always-visible Reset; adaptive defaults (multipliers); Ctrl+Z undo of last 10
- `GRAPH-A11Y-01` — axe-core clean; keyboard-only adjustable; paired numeric input

**Mobile:**
- `MOB-SEC-01` — Per-device tokens; unique `token_hash`; one-device revoke doesn't break others
- `MOB-SEC-02` — `createNote(rawText, source)` single code path
- `MOB-SEC-03` — (Path A) LAN bind default OFF, TLS+pinning on pair, refuse on fingerprint mismatch; (Path B) bot token + chat_id allowlist required before `getUpdates`; unknown chat rejected+logged
- `MOB-UX-01` — Explicit delivery state on mobile (local→syncing→delivered→processed)
- `MOB-SYNC-01` — Desktop-wake grace banner with count of mobile notes processed

**Cross-cutting:**
- `XCUT-SEC-01` — Bearer auth on MCP (retroactive); `netstat` asserts 127.0.0.1:7723-only by default
- `XCUT-SEC-02` — `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`; boot-time assertion
- `XCUT-CSP-01` — `connect-src` enumerates explicit hosts, never `'unsafe-inline'`, `'unsafe-eval'`, or blanket `https:`

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All deps registry-confirmed, licensing OK, Electron ASAR-safe. Ambiguity: `googleapis` SDK vs thin fetch. |
| Features | HIGH (Calendar, Graph); CONFLICTED (Mobile) | Mobile Path A vs B fork unresolved. |
| Architecture | HIGH | Integration points mapped against source. Current-state correction re MCP auth. |
| Pitfalls | HIGH | Mobile threat model assumes Path A; Path B narrows subset, needs small supplementary pass. |

**Overall:** HIGH for Graph + Calendar; MEDIUM for Mobile pending path decision.

### Gaps to Address

- Mobile Path A vs B (user decision required in REQUIREMENTS)
- `googleapis` SDK vs thin fetch wrapper
- Confirm-before-create default behaviour
- Adaptive graph defaults formula (validate in Phase 10 UAT)
- iOS PWA 7-day eviction UX copy (Path A only)

## Sources

### Primary (HIGH confidence)
- googleapis npm registry (v171.4.0); Google OAuth native-app guidance (loopback + PKCE); chrono-node GitHub (v2.9.0); atom/node-keytar (archived); react-force-graph-2d npm (v1.29.1); vite-plugin-pwa peer-deps; direct source read of mcpServer.ts, ipc.ts, aiOrchestrator.ts, aiWorker.ts, WikiGraph.tsx
- Obsidian Graph View help; d3-force docs; Google Calendar API OAuth scopes + quickAdd; Telegram Bot API; SingularityApp Telegram bot precedent
- Electron Security Checklist; Electron safeStorage (DPAPI/Keychain); OWASP Mobile Top 10; better-sqlite3 WAL guidance; d3-force performance patterns; Safari PWA 7-day eviction (WebKit ITP)

### Secondary (MEDIUM)
- Auth0 Electron OAuth blog; @itwin/electron-authorization npm; Obsidian 3D-Graph / GraphPro plugins

### Tertiary (LOW — validate during implementation)
- Notal-specific architecture predictions; adaptive defaults formula; iOS PWA 7-day behaviour in 2026

---
*Research completed: 2026-04-19*
*Ready for roadmap: yes (pending Path A vs B decision in REQUIREMENTS)*
