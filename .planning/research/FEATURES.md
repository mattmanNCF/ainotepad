# Feature Research — Notal v0.3.1

**Domain:** Personal knowledge tool (Electron desktop) — extending with reminders, graph control, mobile capture
**Researched:** 2026-04-19
**Confidence:** HIGH for Themes 1 and 2 (well-trodden patterns); MEDIUM for Theme 3 (opinionated scope recommendation required)

---

## Overview

This document scopes three new themes for v0.3.1. Each theme is treated as an independent sub-feature with its own table stakes / differentiators / anti-features / dependencies / complexity. The REQUIREMENTS phase can present each theme to the user as an opt-in block.

Themes:
1. **Google Calendar integration** — detect reminder phrases, auto-create events
2. **Dynamic wiki graph parameters** — user-adjustable force and style sliders
3. **Mobile extension** — mobile capture companion (scope deliberately narrow)

Existing Notal state assumed: silent AI pipeline, FTS5 + sqlite-vec search, Patterns tab with 7-day digest, auto-maintained wiki (MD + graph), local-first SQLite, read-only MCP server on localhost:7723, NSIS + portable Windows distribution. No user account system. No cloud sync.

---

## Theme 1 — Google Calendar Integration

### Feature concept

When a user writes a note and submits it, the silent AI pipeline inspects the text for reminder intent ("remind me to call Dad tomorrow at 3pm", "I need to remember to submit taxes on April 15"). If intent + concrete date/time are both present with sufficient confidence, an event is created on the user's Google Calendar.

### Table Stakes (must ship or theme is broken)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| OAuth 2.0 connect flow to Google (desktop loopback pattern) | User can't use feature without it; Google requires system browser (embedded Electron blocked since 2021) | MEDIUM | Spin up localhost server on ephemeral port, open default browser, catch redirect. Use PKCE. Request incrementally — don't ask on first launch. |
| Reminder-intent detection in AI pipeline | Whole feature depends on it | MEDIUM | Add a structured-output step to existing silent pipeline: `{is_reminder: bool, title: string, datetime_iso: string \| null, recurrence_rrule: string \| null, confidence: 0-1}`. Reuse same API key as main pipeline. |
| Concrete date/time extraction (with timezone) | Calendar events require a definite `start` | MEDIUM | LLM handles NL-to-ISO. Fall back to `chrono-node` if LLM declines. Always attach user's local IANA zone. |
| Confidence threshold — only auto-create above threshold | False-positive events corrupt calendar trust | LOW | Single threshold (e.g. 0.85). Below threshold → do nothing silently, OR log to "unclear intents" list (see differentiators). Above threshold → create event. |
| Non-blocking UX — event creation happens in background like everything else in Notal | Matches Notal's "quiet" design principle from PROJECT.md | LOW | Same queue as wiki-integrate step. Toast-style confirmation in a "recent calendar events" section, not a popup. |
| Visible record of what Notal created | User must see what AI did on their behalf, in-app | LOW | Inline badge on the note ("📅 event created: Friday 3pm") with link to open in Google Calendar web. No modal. |
| Undo / revoke within a grace window | False positives will happen; removing them must be one click | MEDIUM | Store `google_event_id` with the note. "Remove event" button on the inline badge → API DELETE. Grace window = forever (can always delete from note). |
| Disconnect flow | GDPR / trust expectation | LOW | Settings toggle → revoke stored refresh token; clear local OAuth state. |
| Secure token storage | Desktop app with OAuth token = attack target | MEDIUM | Use Electron `safeStorage` (OS keychain on macOS/Windows). Never store token in plain JSON. |
| Timezone correctness | Off-by-one-day reminders destroy trust | LOW | Read user's IANA zone once at app start (`Intl.DateTimeFormat().resolvedOptions().timeZone`). Pass to AI prompt as context. |

### Differentiators (Notal-specific edges)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Bidirectional context — the note that spawned the event is linked from the event description | User opens event in Google Calendar, can see the original thought | LOW | Put note excerpt + "Created from Notal note {id}" in event description. Optional `extendedProperties.private.notalNoteId` for round-tripping. |
| "Unclear intents" review queue | When AI is unsure (0.5 < conf < 0.85), don't silently discard; keep a short queue of "did you mean to set a reminder?" that user can scan weekly | MEDIUM | New tab or section in Patterns (already 7-day digest style). Don't interrupt — matches "quiet" principle. |
| Dedicated "Notal" calendar option | User can keep Notal-created events visually separate from their main calendar | LOW | On first connect, offer "Create into primary calendar" vs "Create dedicated 'Notal' calendar". Store choice in settings. Second option: `calendars.insert` one-time. |
| Recurrence support ("every Monday 9am") | Users naturally write recurring intent; supporting it is a small LLM schema change | MEDIUM | LLM emits RRULE (RFC 5545). Google Calendar accepts RRULE directly in `recurrence` field. |
| Re-process on note edit | If user edits the note and the reminder phrase changes, update the event | MEDIUM | On note update, re-run reminder detection; compare to stored `google_event_id`; patch or delete. |
| Work offline — queue calendar ops until connected | Matches Notal's local-first principle | MEDIUM | If network/OAuth fails, store pending op in SQLite; retry on next app focus. Show pending state on note. |

### Anti-Features (explicitly out of scope for v0.3.1)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Support for Outlook / Apple Calendar / CalDAV | "Fairness" to non-Google users | Triples OAuth surface area, each has different event model | Ship Google only. If user demand validates, v0.4 adds Microsoft Graph. |
| Interactive "highlight and confirm" before creating event | Safer than auto-create | Violates Notal's core "no popup, no prompt" principle — same as Apple Intelligence's suggested-reminders which users often find interruptive | Keep auto-create + undo pattern. Confidence threshold + unclear-intents queue cover the safety case. |
| Location-based reminders | Users write "remind me when I get home to..." | Requires geofence, mobile-only, out of Notal's desktop scope | Silently ignore location hints for v0.3.1. LLM already gracefully emits `datetime_iso: null` for pure-location intent. |
| Two-way sync (edits in Google Calendar reflect in Notal) | "Feels incomplete" without it | Requires push notifications / webhooks, polling, conflict resolution; massively more complex; not aligned with Notal's "AI-owns-organization" model | One-way only: Notal writes, Google is the source of truth for events. User edits event in Google Calendar → Notal shows "event modified externally" on next refresh, no sync-back. |
| Per-note manual "create event from this note" button | Users will ask for it | Duplicates existing silent pipeline and dilutes the "just write naturally" premise | Silent auto-create only. If user wants explicit control, they write "remind me..." — same natural path. |
| Email reminders / SMS reminders from Notal | | Redundant — Google Calendar already does this; we just set `reminders.useDefault = true` | Rely on user's Google Calendar default notification settings. |
| Contact / attendee parsing | "Meeting with Joe at 3" → invite Joe | Needs contacts scope, contact disambiguation, email lookup, consent | Create event with no attendees. Mention name in title/description. |

### Dependencies on existing Notal state

- **Silent AI pipeline**: Reminder detection is another silent step, not a new UI paradigm. Re-uses same API key, same error handling, same "non-blocking" promise.
- **SQLite schema**: Needs new columns/table for `google_event_id`, `confidence`, `pending_op_queue`. Trivial migration.
- **Settings UI**: Requires a Connections/Integrations section if not already present. v0.3.0 didn't ship one; must be built.
- **Electron safeStorage**: Already available in Electron; no new dep.
- **Notification / toast system**: If Notal doesn't already have in-app toasts for the existing pipeline, something minimal is needed for calendar-event feedback. Inline badge on note suffices in lieu.

### Complexity verdict

Whole theme: **MEDIUM**, ~1 phase of work (Phase 10). OAuth + secure token storage is the bulk. AI prompt change is small. UI is small. Risk is edge cases in NL→datetime (mitigate with unclear-intents queue rather than perfection).

---

## Theme 2 — Dynamic Wiki Graph Parameters

### Feature concept

The wiki graph view currently renders with hard-coded d3-force parameters. Add a settings panel (drawer or popover on the graph itself) that exposes force parameters as sliders with live preview. Persist the user's choices.

### Table Stakes (must ship or theme is broken)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Link force slider | Primary graph-shape lever; all comparable apps (Obsidian, Logseq, Roam, 3D-Graph plugin, GraphPro) expose it | LOW | d3-force `linkForce.strength()` 0–1. |
| Center force slider | Controls pull to canvas center; users notice when graph drifts off-screen | LOW | d3-force `centerForce` or `forceX/Y`. |
| Repel force slider | Controls node spacing; heavily used lever | LOW | d3-force `manyBody.strength()` (negative range). Slider clamped to -1000..0 or similar. |
| Edge thickness slider | Stylistic; visual-weight expectation | LOW | Stroke-width binding on link selection. |
| Node size slider | Stylistic; readability | LOW | Radius binding. Either uniform or a single multiplier on existing degree-based sizing. |
| Live preview (forces re-run as slider moves) | Static preview defeats the purpose — users compare layouts by feel | LOW | Re-call `simulation.alpha(0.3).restart()` on slider input. Debounce at 50ms if perf becomes an issue. |
| Persistence (per-user) | Users reset slider every session = broken feature | LOW | Write to existing settings store (SQLite or JSON settings file). One row/record for the whole panel. |
| Reset-to-defaults button | Users experiment; need escape hatch | LOW | Hard-coded defaults in constants; button overwrites persisted values. |

### Differentiators (Notal-specific edges)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Named presets — "Dense", "Spacious", "Hierarchical" | Most users will never find the "right" slider combo from scratch; presets are the real product | LOW | Three-to-four hard-coded parameter bundles. One-click apply. User can then tweak. Research shows Obsidian users specifically ask for this and rely on plugin-provided presets. |
| Apply-on-release vs live preview toggle — live by default, fallback to "apply on release" if graph is large (auto-detect) | Live is nicer but huge graphs stutter | LOW | If `nodes.length > 500`, silently switch to apply-on-release. No user-visible toggle needed. |
| Show current values as numbers alongside sliders | Discoverable; users can copy exact values across devices | LOW | Tiny `<span>` beside each slider. |
| Per-graph override vs global setting — for v0.3.1, **global only** | Per-graph creates a settings sprawl users don't want | LOW | Single global config. Document intent: graph-view settings are a user preference, not per-document state. |

### Anti-Features (explicitly out of scope)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Filtering by tag / recency in the same panel | Obsidian conflates these; users expect it | Scope creep — mixes "how the graph renders" with "what the graph shows". Different mental model, different UI requirements. | Ship only force/style params in v0.3.1. Filtering is a separate future theme ("Graph filters") not bundled here. |
| Node label on/off toggle | Obsidian has it | Mostly useful at high node counts — Notal's wikis are small today. Adds UI and state with little user value at current scale. | Defer. Revisit when users have >200-node graphs. |
| Color scheme switching (tag colors, heat by recency, etc.) | Nice polish | Distinct feature from force parameters; should not be bundled | Defer to future "Graph styling" theme. Current Notal already has tag-color coding on cards — reuse the same scheme statically on graph nodes if desired (LOW-cost side quest, but still scope creep here). |
| Save named parameter sets ("my layout", "presentation layout") | Power-user feature | Implies layout management UI, naming, deletion, sharing | Out of scope. Three built-in presets + current values cover 95% of use. |
| 3D graph mode | Cool factor | Fundamentally different rendering pipeline; Three.js dependency | Out of scope. v0.3.1 is sliders on existing 2D graph only. |
| Animate-between-presets transition | Polish | Requires interpolation logic; perf cost on large graphs | Out of scope. Snap-apply is acceptable. |

### Dependencies on existing Notal state

- **Existing wiki graph renderer** (presumably d3-force or similar on the wiki graph page). Must expose force references so UI can mutate them at runtime without recreating the simulation.
- **Settings persistence layer**: Either reuse existing JSON settings or add a `graph_settings` table. Either is trivial.
- **No new backend work**; no AI pipeline involvement.

### Complexity verdict

Whole theme: **LOW**, ~half a phase (Phase 11 first half). No OAuth, no new services, no AI. Primarily UI plumbing + persistence. The risk is cosmetic (bad defaults) rather than structural.

---

## Theme 3 — Mobile Extension

### Opinionated scope recommendation

**For v0.3.1, "mobile extension" should mean: a Telegram-bot-based capture inbox.** Not a native iOS/Android app. Not a share extension. Not a read-only mobile viewer.

Rationale (why this specific shape):

1. **Notal has no user account system and no cloud backend.** Any mobile story that requires sync between two devices owned by the user needs either (a) a server Notal runs (violates local-first principle from PROJECT.md), (b) P2P sync (Obsidian LiveSync / CouchDB / Syncthing — huge integration), or (c) a third-party relay the user already has an identity on.
2. **Telegram is option (c) done cleanly.** Matt's broader stack already uses Telegram as an AI interface; the pattern is well understood. The user sends a message to their Notal bot on mobile; the Notal desktop app long-polls Telegram Bot API; messages appear as notes on next capture. Identity is solved by Telegram's `chat_id` allowlist.
3. **Ship a capture-only mobile path first.** Full wiki/graph on mobile is a 10x larger effort and not aligned with v0.3.1's feature density. Quick-capture is where mobile usefulness concentrates (every note-app survey confirms this — Bear, Obsidian Quick Capture, Fleeting Notes, Instant Notion all focus here).
4. **Share extensions (iOS/Android native) are out of scope** because they require either a published mobile app in each store (massive overhead for a v0.3.1 milestone) or a URL scheme that mobile OSes increasingly restrict. Revisit in v0.5+ after Telegram path validates demand.
5. **Offline store-and-forward is free.** If desktop is offline, Telegram holds the message until the bot polls. No mobile-side queue to build.

**Alternative considered and rejected: email-to-Notal.** Requires IMAP polling, filtering, and configuration. Higher friction for capture (user must compose a full email vs. a 2-second Telegram message). Telegram wins on UX and complexity.

**Alternative considered and rejected: Obsidian-style LiveSync / CouchDB.** Solves a bigger problem than Notal has in v0.3.1. Drags in server setup, mobile app, vault reconciliation. Out of scope.

### Table Stakes (must ship or theme is broken — under the Telegram-bot scope)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Bot token config in settings | Without this there is no connection | LOW | Settings field + "test connection" button. Use `getMe`. Store token in safeStorage. |
| `chat_id` allowlist | Without this, any Telegram user who guesses the bot handle can inject notes | LOW | Settings lists allowed chat IDs. First message from unknown chat → reject + log. Onboarding flow: user sends `/start`, app shows a notification "authorize chat_id X?" |
| Long-poll or webhook ingestion while app is running | Capture must land in Notal eventually | MEDIUM | Long-poll is simpler (no public URL needed, works behind NAT, fits local-first). `getUpdates` with offset. Run in main process; pause on app hidden/quit. |
| Incoming text → note via existing silent pipeline | Unified processing; mobile notes get same AI treatment | LOW | Just `insertNote(text, {source: 'telegram'})`. Pipeline is untouched. |
| Visible "recently captured from mobile" indicator | User needs to know capture landed — otherwise they'll double-capture on desktop | LOW | Tag `source: telegram` on note; small badge on cards. Optional filter in Patterns. |
| Catch-up on app launch | User submits mobile notes with desktop closed; they must appear when desktop opens | LOW | On launch, one `getUpdates` call with saved offset pulls everything queued since last run. Telegram retains up to 24h by default — document this limit. |
| Acknowledgment back to Telegram | Without confirmation, user can't trust capture landed | LOW | Bot react or reply "saved ✓" after note insertion. Use Telegram's message reaction API or a plain reply. |
| Disconnect / pause mobile bot | Trust / pause use cases | LOW | Toggle in settings; stops long-poll; does not delete note history. |

### Differentiators (Notal-specific edges)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Photo / voice capture → OCR / transcription → note | Mobile-native input modes; huge UX multiplier | MEDIUM-HIGH | Telegram delivers media by `file_id` → download via Bot API → run through user-configured AI provider for OCR / transcription → insert as note text. Gate behind a setting; API cost implication for frontier mode. |
| Interim "✨ processing…" reaction on Telegram | Matches Atlas bot pattern; user sees something is happening | LOW | Set emoji reaction on receipt, swap to ✓ when note is committed. |
| Link preview / URL capture smarts | User shares article URL → note gets title + snippet, not just the bare URL | LOW-MEDIUM | Fetch URL, extract title/description via existing silent pipeline (or `unfurl` library). |
| Two-way: `/search` command from mobile returning top-5 matching notes | Mobile becomes a read path too, cheaply | MEDIUM | Bot command handler calls existing FTS5/vec search; returns as a Telegram message. Scope discipline: **do NOT** attempt full wiki browse on mobile — `/search` and `/recent` commands only. |
| Per-note source attribution surfaces in search | "Where did I capture this?" becomes answerable | LOW | `source` column already proposed; just surface in card detail. |

### Anti-Features (explicitly out of scope for v0.3.1)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Native iOS/Android Notal app | "Proper" mobile | App-store overhead, signing, codebase multiplication, review cycles — massive for a milestone feature | Ship Telegram bot path. Re-evaluate when Telegram path validates demand for > capture. |
| Full wiki / graph view on mobile | "Completeness" | Electron isn't mobile; a real mobile client = new codebase | Out of scope. `/search` command covers urgent mobile-read case. |
| iOS Share Extension / Android Share Intent | Feels native | Requires a mobile app to host the extension | Covered by Telegram's "Share to chat" system sheet — user already has it on both OSes. |
| Cross-device real-time sync (edit on desktop → mobile updates) | Obsidian has it | Violates Notal's local-first model; needs a server or P2P layer | Out of scope. Telegram is capture-only; desktop remains source of truth. |
| User accounts / auth system | Feels like table stakes for multi-device | Added surface area, added attack surface, breaks local-first | Identity = Telegram `chat_id` allowlist. No Notal-side accounts. |
| Running the silent AI pipeline on the phone | "Mobile should be self-contained" | Would require Notal mobile app; on-device LLM on phone is heavy | Processing happens on desktop when long-poll pulls the note. If desktop is down, note waits. |
| End-to-end encryption of Telegram-bot messages | Privacy concern | Telegram bot messages are not E2E; this is a Telegram platform limitation | Document it. Users who need E2E use desktop-only capture for sensitive notes. |
| Running without Telegram (e.g. "generic webhook endpoint") | Flexibility | Reopens the identity / auth problem we just closed | Out of scope for v0.3.1. Power users can run the existing MCP server (localhost:7723) for advanced integration. |

### Dependencies on existing Notal state

- **Silent AI pipeline**: Mobile notes route through it unchanged — requirement is that pipeline accepts an arbitrary string + source tag.
- **Settings UI**: Needs Integrations section (shared with Theme 1's Google OAuth section — build once, serve both).
- **safeStorage**: Bot token goes in keychain, same primitive as Google refresh token.
- **Main process networking**: Long-poll runs in main process with a simple fetch loop; must pause on app-quit.
- **Notes table**: Add `source` column (nullable, values: `desktop`, `telegram`, future others). Trivial migration.
- **MCP server (read-only)**: Not reused for capture (MCP is read-only by design); mobile capture is a separate write path.
- **Atlas / ClaudeClaw**: Notal's bot is a **distinct** Telegram bot from Atlas. User creates a new bot with @BotFather for Notal specifically. Document this clearly to avoid user confusion. No code-sharing with Atlas needed; conceptually similar pattern.

### Complexity verdict

Whole theme (Telegram-bot capture-only scope): **MEDIUM**, ~1 full phase (Phase 12). Bot token config and long-poll are straightforward Node.js. Risk is ongoing maintenance (Telegram API changes, bot blocking, spam). Voice/photo/OCR extensions are optional and can be a later sub-phase if time permits.

Full-stack mobile (rejected scope): would be HIGH + multi-milestone; not recommended.

---

## Cross-theme Feature Dependencies

```
Theme 1 (Calendar) ──requires──> Silent AI pipeline (existing)
                   ──requires──> Settings UI with "Integrations" section (new; shared)
                   ──requires──> Electron safeStorage for tokens (existing primitive)

Theme 2 (Graph)    ──requires──> Existing wiki graph renderer (existing)
                   ──requires──> Settings persistence (existing)
                   (independent of Themes 1 & 3 — can ship in parallel)

Theme 3 (Mobile)   ──requires──> Silent AI pipeline (existing)
                   ──requires──> Settings UI with "Integrations" section (new; shared w/ Theme 1)
                   ──requires──> Electron safeStorage for tokens (shared w/ Theme 1)
                   ──requires──> Notes.source column (new)
                   ──enhances──> Theme 1 (a mobile note like "remind me to…" fires calendar flow too)

Theme 1 + Theme 3 share: Settings UI skeleton, safeStorage pattern, "pipeline-triggered side effect" shape.
Theme 2 shares nothing substantive with 1 or 3. Can be fully parallelizable in phase planning.
```

### Key dependency notes

- **Themes 1 and 3 share a "Settings → Integrations" tab.** Build it once in the earlier phase, reuse in the later one. Recommend building as part of whichever theme ships first.
- **Theme 3 amplifies Theme 1.** A reminder phrase sent via Telegram on mobile should fire the calendar flow identically to desktop capture. This falls out for free if the pipeline is source-agnostic.
- **Theme 2 is independent** and the lowest-risk — good candidate for a quick-win phase.

---

## MVP Definition (v0.3.1 Launch)

### Launch With (v0.3.1)

Per theme, minimum to ship:

**Theme 1:**
- [ ] OAuth connect/disconnect
- [ ] Reminder detection + ISO datetime extraction (with confidence threshold)
- [ ] Auto-create event on primary calendar
- [ ] Inline badge on note with event link and "remove event" action
- [ ] Timezone correctness
- [ ] Secure token storage

**Theme 2:**
- [ ] 5 sliders (link, center, repel, edge-thickness, node-size)
- [ ] Live preview
- [ ] Persistence
- [ ] Reset-to-defaults
- [ ] 3 named presets (Dense / Spacious / Hierarchical)

**Theme 3:**
- [ ] Bot token + chat_id allowlist in settings
- [ ] Long-poll ingestion
- [ ] Text-note capture via existing pipeline
- [ ] `source: telegram` tagging and badge
- [ ] Acknowledgment reaction back to Telegram
- [ ] Catch-up on app launch

### Add After Validation (v0.3.2 / v0.3.x)

- [ ] Theme 1: "Unclear intents" review queue in Patterns
- [ ] Theme 1: Dedicated "Notal" calendar option
- [ ] Theme 1: Recurrence (RRULE) support
- [ ] Theme 1: Re-process on note edit (patch event)
- [ ] Theme 3: Photo → OCR capture
- [ ] Theme 3: Voice → transcription capture
- [ ] Theme 3: URL preview / unfurl
- [ ] Theme 3: `/search` and `/recent` bot commands

### Future Consideration (v0.4+)

- Outlook / Microsoft Graph calendar integration
- Native iOS/Android Notal app
- Two-way wiki/graph sync to mobile
- Graph filters (tag, recency) panel
- Graph 3D mode
- Color-scheme / node-labeling graph controls

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| T1: OAuth connect | HIGH | MEDIUM | P1 |
| T1: Reminder detection + auto-create | HIGH | MEDIUM | P1 |
| T1: Inline badge + undo | HIGH | LOW | P1 |
| T1: Recurrence support | MEDIUM | MEDIUM | P2 |
| T1: Unclear-intents queue | MEDIUM | MEDIUM | P2 |
| T1: Dedicated "Notal" calendar | LOW | LOW | P3 |
| T2: 5 sliders + live preview | HIGH | LOW | P1 |
| T2: Persistence + reset | HIGH | LOW | P1 |
| T2: 3 presets | HIGH | LOW | P1 |
| T2: Filtering / labeling / 3D | LOW-MEDIUM | MEDIUM-HIGH | P3 (explicit out of scope) |
| T3: Telegram bot text capture | HIGH | MEDIUM | P1 |
| T3: chat_id allowlist + token storage | HIGH | LOW | P1 |
| T3: Catch-up on launch + ack reaction | HIGH | LOW | P1 |
| T3: Photo/OCR + voice transcription | MEDIUM | MEDIUM-HIGH | P2 |
| T3: `/search` bot command | MEDIUM | MEDIUM | P2 |
| T3: Native mobile app | (unknown) | HIGH | P3 (explicit out of scope) |

---

## Competitor Feature Analysis

| Feature | Obsidian | Todoist | Apple Notes/Intelligence | Notal v0.3.1 (planned) |
|---------|----------|---------|-------------------------|------------------------|
| NL date → reminder | No (plugin-only) | Yes (first-class Quick Add) | Yes (Apple Intelligence suggests; user confirms) | Yes, silent auto-create with undo (quieter than Apple, more automatic than Todoist's explicit entry, native vs plugin) |
| Graph force sliders | Yes (native, 4 params) | N/A | N/A | Yes (5 params + 3 presets — parity with Obsidian plus named presets) |
| Mobile capture | Yes (full mobile app + Sync paid) | Yes (native mobile) | Yes (iOS native) | Telegram-bot capture only (opinionated, capture-focused) |
| Sync model | P2P via LiveSync or paid Sync | Cloud sync | iCloud | Telegram as async transport; no sync |
| Account system | Required for Sync | Required | iCloud account | None (Telegram chat_id = identity) |

Notal's distinct posture: **aggressive silence** (calendar events created without prompts), **preset-first graph controls** (Obsidian makes users fiddle), **zero-account mobile capture** (no other app in class does this specifically because Telegram-as-transport is unusual outside power users, but Matt is exactly that audience).

---

## Sources

- [Todoist — Natural Language for dates and times](https://www.todoist.com/help/articles/introduction-to-dates-and-time-q7VobO) — Todoist smart date recognition UX, recurring RRULE-style input
- [Todoist — Smart date recognition toggle](https://www.todoist.com/help/articles/turn-smart-date-recognition-on-or-off-63WfIr) — confirms user-toggleable auto-detection is table stakes
- [Todoist 2026 Changelog](https://www.todoist.com/help/articles/2026-changelog-HD3jJAtLd) — current state as of 2026
- [Notion reminder patterns (Medium, 2025)](https://medium.com/activated-thinker/stop-missing-deadlines-a-simple-notion-system-fd42b1161aba) — Notion requires explicit "Remind me" checkbox; confirms interactive pattern exists but isn't universal
- [Google Keep reminders](https://support.google.com/keep/answer/3187168) — set-reminder UX (explicit, not NL)
- [Apple Intelligence — Reminders from notes/emails/webpages](https://appleinsider.com/articles/26/01/08/how-to-turn-emails-webpages-notes-into-reminders-with-apple-intelligence) — scans for actions, dates; user confirms via share sheet
- [Easily Create Reminders From Apple Notes (Medium)](https://willjmurphy.medium.com/easily-create-reminders-automatically-from-within-apple-notes-13102448291c) — Apple Notes + Reminders share-sheet pattern
- [Obsidian Graph View (official help)](https://help.obsidian.md/plugins/graph) — center/repel/link force/link distance = canonical parameter set
- [Obsidian 3D Graph plugin (GitHub)](https://github.com/Apoo711/obsidian-3d-graph) — sliders for Center/Repel/Link force; validates slider UX
- [GraphPro plugin (GitHub)](https://github.com/air-mark/graph-pro) — same 4-param model; confirms slider layout convention
- [d3-force README (GitHub)](https://github.com/d3/d3-force) — API primitives for `linkForce`, `manyBody`, `center`
- [d3-force link docs (Observable)](https://d3js.org/d3-force/link) — `link.strength()`, `link.distance()` semantics
- [Self-hosted LiveSync + CouchDB for Obsidian (Medium, Apr 2026)](https://medium.com/@abhirajsinghtomar/i-replaced-obsidian-sync-with-a-self-hosted-couchdb-server-heres-how-you-can-too-9d2f1aaa1f62) — reference point for why Notal should NOT go this direction in v0.3.1
- [Obsidian alternatives with built-in sync (2026)](https://openalternative.co/alternatives/obsidian) — Anytype/Joplin as references; confirms sync=expensive scope
- [Obsidian Quick Capture (community app)](https://quickcaptureobsidian.app/) — validates quick-capture-only mobile pattern
- [Fleeting Notes (ContentCreators)](https://contentcreators.com/tools/fleetingnotes) — offline-queue + sync-to-Obsidian pattern
- [Amplenote mail-to-note share extension](https://assets.amplenote.com/help/mobile_share_extension) — share-extension and mail-to-note patterns as alternatives considered
- [SingularityApp Telegram bot](https://singularity-app.com/wiki/telegram-bot/) — direct precedent for Telegram-bot-as-capture-inbox pattern with NL date recognition
- [Telegram Bot API docs](https://core.telegram.org/bots/api) — `getUpdates` long-poll, `setMessageReaction`, `sendMessage` primitives
- [Google Calendar API OAuth scopes](https://developers.google.com/workspace/calendar/api/auth) — scope guidance, incremental scope best practice
- [Google Calendar quickAdd endpoint](https://developers.google.com/workspace/calendar/api/v3/reference/events/quickAdd) — reference for NL event creation (we do our own LLM parsing for richer schema + RRULE, but quickAdd is a fallback)
- [Google OAuth 2.0 for Desktop Apps](https://developers.google.com/identity/protocols/oauth2/native-app) — loopback redirect flow for Electron
- [Loopback IP flow (Google migration doc)](https://developers.google.com/identity/protocols/oauth2/resources/loopback-migration) — desktop continues to support loopback; PKCE required
- [Implementing Google auth in Electron (Medium)](https://arunpasupathi.medium.com/how-to-implement-google-authentication-in-your-electron-app-aec168af7410) — embedded browsers blocked since 2021; must use system browser
- [Securing Electron with OpenID/OAuth2 (Auth0 community)](https://community.auth0.com/t/securing-electron-applications-with-openid-connect-and-oauth2/44780?page=3) — token storage in OS keychain pattern

---
*Feature research for: Notal v0.3.1 — Reminders / Graph Control / Mobile*
*Researched: 2026-04-19*
