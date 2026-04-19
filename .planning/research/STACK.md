# Stack Research — Notal v0.3.1

**Domain:** Electron desktop app extensions — OAuth-backed Google Calendar integration, live D3 force-graph parameter control, mobile capture companion
**Researched:** 2026-04-19
**Confidence:** HIGH for calendar + graph sliders; MEDIUM for mobile platform choice (pending product decision between PWA and Capacitor)

**Scope note:** This file covers ONLY new dependencies for v0.3.1. The existing validated stack (Electron 39, React 19, Vite 7, electron-vite 5, better-sqlite3 12, Drizzle 0.45, sqlite-vec 0.1.9, Anthropic SDK 0.89, OpenAI SDK 6, node-llama-cpp 3.18, MCP SDK 1.29, react-force-graph-2d 1.29.1, electron-conf 1.3, electron-builder 26, electron-updater 6.8, TailwindCSS v4, d3-cloud 1.2.9, react-d3-cloud 1.0.6) is unchanged. No version bumps proposed here.

**Key existing infrastructure reused (do NOT duplicate):**
- `electron-conf` 1.3.0 for non-secret config — extend with new keys
- Electron native `safeStorage` (DPAPI on Windows, Keychain on macOS) — already used for Anthropic/OpenAI key encryption; reuse for Google refresh token
- `@modelcontextprotocol/sdk` 1.29.0 running over `node:http` (**not Fastify** — brief was incorrect; server lives at `src/main/mcpServer.ts` on `node:http` port 7723) — extend transport, do not rip out
- `zod` 4.3.6 (already transitive via MCP SDK) for request schema validation

---

## Recommended Stack

### Theme 1 — Google Calendar Integration

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `googleapis` | **171.4.0** | Google Calendar v3 API client + OAuth2 helper (`google.auth.OAuth2`) | Official Google-maintained client; bundles calendar.events.insert with auto-refresh. Alternative `@googleapis/calendar` (14.2.0) is the split-package subset — fine, but `googleapis` auth-client path is more battle-tested in Electron. The extra ~5 MB installed weight is negligible vs the asar bundle size Notal already ships. |
| `chrono-node` | **2.9.0** | Natural-language date/time parser for phrase detection ("tomorrow at 3pm", "next Tuesday", "in 2 hours") | MIT; actively maintained (Sep 2025 release); supports a `ParsingReference` with `instant` + `timezone` so extracted dates are correctly anchored to note submission time. Pure JS, no native deps, no ASAR concerns. Empirically the only general-purpose NL-date parser in the Node ecosystem with this coverage. |

**Phrase extraction strategy — hybrid, not pure-LLM:**
1. **Regex gate** for the trigger phrase family: `/\b(remind me( to)?|i (need|have) to remember to|don.?t forget to|remember to)\b/i` — cheap, deterministic, prevents LLM cost on every note.
2. **chrono-node** over the matched sentence for date/time extraction.
3. **LLM fallback** (existing Anthropic/OpenAI SDK path in `aiWorker.ts`) ONLY when chrono-node returns no date but the regex matched — LLM extracts "Sunday at the farmer's market" and reformats to `YYYY-MM-DDTHH:MM`. Prompt tax only hits ambiguous cases.

This ordering matters: pure-LLM extraction on every note wastes money (Notal submits fire on every Enter). Pure-regex misses "sometime next week". Hybrid gives the right cost/coverage curve.

**OAuth flow — Electron loopback with PKCE (no client secret on disk):**

| Decision | Choice | Why |
|----------|--------|-----|
| Redirect URI | `http://127.0.0.1:<ephemeral port>/oauth2callback` spun up on-demand via `node:http` | Google's current guidance (2025): loopback IP is the de-facto Windows/macOS/Linux desktop redirect despite iOS/Android deprecation. Custom protocol handlers (`notal://`) are explicitly discouraged by Google for impersonation risk. |
| PKCE | **Required** (S256) via `oauth2Client.generateCodeVerifier()` / `generateAuthUrl({code_challenge, code_challenge_method:'S256'})` | Google's installed-app flow marks PKCE "strongly recommended" for 2026; required in practice since desktop OAuth clients do not use a client_secret. |
| Client secret | Not persisted; omitted from token exchange where possible | Desktop OAuth clients are registered in Cloud Console as "Desktop app" type — client_secret is non-confidential and may be embedded in source, but PKCE is the actual security boundary. |
| Login window | Electron `BrowserWindow` loading `oauth2Client.generateAuthUrl()`, closed on redirect intercept | Controls the browser session, handles cookies, and gives UX inside Notal. `shell.openExternal` is an acceptable fallback but loses the automatic window close. |
| Token storage | `safeStorage.encryptString(refreshToken)` → base64 → `electron-conf` under key `googleRefreshTokenEncrypted` | Mirrors existing `apiKeyEncrypted` pattern in `src/main/ipc.ts`. Zero new dependencies. |
| Access token | Held in-memory in main process; `googleapis` OAuth2 client auto-refreshes using stored refresh token | Never persisted; regenerated per session. |

**Rejected OAuth alternatives:**

| Rejected | Why |
|----------|-----|
| `keytar` 7.9.0 | **Archived by owner Dec 15, 2022**; native node-gyp build fights `electron-rebuild` in CI; redundant with Electron's `safeStorage` which Notal already uses. No reason to add an unmaintained native dep. |
| `@getstation/electron-google-oauth2` | Unmaintained wrapper; last meaningful release >2 years old; reimplements what ~40 lines using `googleapis` + `BrowserWindow` already cover cleanly. |
| `openid-client` 6.8.3 | Excellent library but overkill — Notal targets Google specifically, and `googleapis` already ships OAuth2 helpers tuned to Google endpoints. Adding `openid-client` duplicates functionality. |
| Custom protocol `notal://` redirect | Discouraged by Google (impersonation risk); Windows protocol registration is installer-scope (NSIS `WriteRegStr`) and breaks in portable ZIP builds. Loopback works everywhere. |
| `@electron/remote` for cross-process auth flow | Deprecated pattern; modern Electron apps run auth from main process and pass tokens via IPC, which Notal is already structured for. |

### Theme 2 — Dynamic Wiki Graph Parameters

**Existing graph library confirmed:** `react-force-graph-2d@1.29.1` (at `src/renderer/src/components/WikiGraph.tsx`), which wraps `force-graph@^1.51` and exposes the underlying d3-force simulation via `graphRef.current.d3Force('link' | 'charge' | 'center')`. The code already calls `linkForce.distance(...)` with a shared-count heuristic — the slider feature is a direct generalization of that existing hook.

**Recommendation: KEEP react-force-graph-2d. Do NOT swap.**

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `react-force-graph-2d` | **1.29.1** (already installed, no bump) | D3 force simulation wrapper | Already shipping. Exposes `d3Force(name)` to reach into the underlying simulation — that's the exact API the sliders need (`.distance()`, `.strength()`, `.charge()`). Swapping would mean rewriting WikiGraph.tsx for zero user-visible gain. |
| `@radix-ui/react-slider` | **1.3.6** | Accessible slider primitive (headless) | MIT; keyboard + touch + ARIA handled; unstyled so it composes cleanly with Notal's existing Tailwind dark-theme tokens (`bg-gray-900`, etc.). Pairs with TailwindCSS v4 (already installed) with no runtime CSS-in-JS. ~15 KB gzipped. |

**Why Radix over alternatives:**

| Rejected | Why |
|----------|-----|
| Raw `<input type="range">` | Native range slider is ugly, unthemable on Windows, and lacks dual-thumb / step-grid features Notal may want later. Saving 15 KB at the cost of a broken-looking UI on the app's most-used screen is a bad trade. |
| `shadcn/ui` Slider | shadcn is **a codegen CLI that vendors Radix primitives into your repo** — it IS Radix underneath. Installing shadcn-CLI adds zero runtime capability over installing `@radix-ui/react-slider` directly, while adding a generator toolchain Notal doesn't otherwise need. For a 5-slider use case, direct Radix is simpler. |
| `react-range` | Maintained by Tajo but smaller community, smaller surface; Radix is the de-facto React primitive library in 2026. |
| MUI / Mantine sliders | Full component libraries; ~200-400 KB added just for sliders. Massive overkill. |
| `rc-slider` | Ant Design adjacent, larger footprint, less ARIA-complete than Radix. |

**Force-knobs to expose (wiring plan):**

| Slider | d3-force target | Current default (in code) | Reasonable range |
|--------|----------------|--------------------------|------------------|
| Link force (strength) | `d3Force('link').strength(v)` | `Math.min(0.8, count*0.15)` | 0.0 – 1.0 |
| Link distance | `d3Force('link').distance(v)` | `120 / count` | 20 – 400 px |
| Repel force (charge) | `d3Force('charge').strength(-v)` | d3-force default (-30) | 10 – 500 |
| Center force | `d3Force('center').strength(v)` | default 0.1 | 0.0 – 1.0 |
| Edge thickness | `linkWidth` prop | `Math.min(3, count*0.8)` | 0.5 – 8 px |
| Node size | `nodeRelSize` prop / `r` in `nodeCanvasObject` | 5 | 1 – 15 |

After changing a knob, call `graphRef.current.d3ReheatSimulation()` (already exposed by react-force-graph) so the layout re-settles.

**Persistence:** extend `electron-conf` (already in use at `src/main/ipc.ts` and `src/main/tagColors.ts`) with a `graphParams` object key. Same IPC pattern as existing `setTagColors`. **No new dependency needed for persistence.** Defaults live in a `DEFAULT_GRAPH_PARAMS` const so "Reset" is trivial.

### Theme 3 — Mobile Extension

**This is the only theme with a genuine product-level fork.** I recommend a **two-stage rollout** rather than a single bet:

#### Stage A (v0.3.1) — Local-network PWA with loopback submission to Notal's existing HTTP server

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `vite-plugin-pwa` | **1.2.0** | Emits manifest.json + service worker from the existing Vite 7 renderer config | MIT; peer-declares Vite `^3 ‖ ^4 ‖ ^5 ‖ ^6 ‖ ^7` — matches Notal's Vite 7.2.6 exactly. Lets us spin a separate `mobile-capture` entry that builds into a tiny installable web app (~80 KB after Workbox precache). |
| `fastify` | **5.8.5** | HTTP server for write-accepting mobile endpoint | **Replaces `node:http` in `mcpServer.ts`** OR runs alongside on a second port. Fastify adds JSON schema validation, route-level hooks, and plays natively with `@fastify/bearer-auth`. The existing MCP HTTP transport can be mounted on a Fastify route since `StreamableHTTPServerTransport` accepts a standard `(req, res)` handler. |
| `@fastify/bearer-auth` | **10.1.2** | Bearer-token auth plugin | MIT; matches the brief's "Bearer token" intent. Single plugin registration, constant-time comparison. |
| `@fastify/cors` | **11.2.0** | CORS for browser-origin mobile PWA | Required once mobile PWA makes fetches to `http://<desktop LAN IP>:7723`. |
| `qrcode` | **1.5.4** | Emits a QR on desktop containing `http://<LAN IP>:7723/?token=<bearer>` | Pure JS, no native deps. Mobile phone scans and gets a pre-authed pairing link. Pairing UX without a cloud service. |

**Sync/transport decision: direct LAN HTTP over the loopback-extended server.**

| Option | Verdict | Rationale |
|--------|---------|-----------|
| **LAN HTTP POST to Notal's server (recommended)** | **ACCEPT** | Desktop already runs an HTTP endpoint. Binding additionally to the LAN interface (not just 127.0.0.1) behind Bearer auth on pairing is ~30 lines. Matches Notal's local-first ethos exactly. Works with both mDNS (`notal.local`) and raw IP. |
| Cloud relay (Firebase / Supabase) | **REJECT** | Violates Notal's "Local-first, no cloud backend" principle (PROJECT.md line 3, Core Design Principle 3). Non-starter. |
| Yjs / Automerge CRDT | **REJECT for v0.3.1, RECONSIDER for v0.4+** | CRDTs are brilliant but overkill for capture-only flow. Yjs adds ~80 KB + a persistence layer + conflict semantics for a one-shot append use case. If bidirectional view/edit ever ships, revisit. |
| PouchDB ↔ remote CouchDB | **REJECT** | Requires running CouchDB somewhere — cloud or on the desktop. Even desktop CouchDB is a separate service process, which Notal has avoided. |
| QR / file-share export only | **REJECT as primary** | Acceptable as a fallback when LAN unavailable; terrible as the default (friction). Keep `qrcode` in stack for pairing. |

**What "capture-only" means concretely:**
- Mobile PWA has ONE screen: textarea + submit button + connection status indicator.
- Submit POSTs `{ text, submittedAt, clientId }` to `POST /notes` on the desktop.
- Desktop writes to SQLite through the same `enqueueNote()` pipeline an Enter keystroke uses — no special mobile branch in the orchestrator.
- No note list, no wiki graph, no tag UI on mobile for v0.3.1. If the LAN link is down, mobile queues in `localStorage` and retries on next connect.

#### Stage B (later milestone, ONLY if user demand emerges) — Capacitor wrap for app-store distribution

| Technology | Version | Purpose | When to Adopt |
|------------|---------|---------|----------------|
| `@capacitor/core` | **8.3.1** | Wrap PWA in native iOS/Android shells | Only if (a) users want offline capture beyond what a PWA service worker gives, OR (b) app-store presence becomes a distribution channel. |
| `@capacitor/cli` | **8.3.1** | Build toolchain | Ship after Stage A validates the UX. |
| `@capacitor/ios` | **8.3.1** | iOS platform | Requires macOS + Xcode for build — not blocking on Windows day-one. |
| `@capacitor/android` | **8.3.1** | Android platform | Builds on Windows with Android Studio. |

**Why defer Capacitor:**
1. Notal is Windows-first; iOS build requires Mac hardware Matt may not have provisioned.
2. App-store submission is a separate compliance stream (Apple review, privacy policies) that distracts from core value.
3. A PWA is installable via "Add to Home Screen" on iOS Safari and Android Chrome in 2026 — real estate on the home screen without app-store overhead.
4. **If Stage A proves useless, no Capacitor sunk cost.** If it proves useful, Capacitor wraps the exact same web bundle with `npx cap init && npx cap add ios && npx cap sync`.

**Rejected mobile alternatives:**

| Rejected | Why |
|----------|-----|
| React Native | Separate codebase, separate build pipeline, no reuse of `WikiGraph.tsx` or Tailwind styles. Cost/benefit is terrible for a capture-only UX. |
| Tauri Mobile (2.x) | Rust toolchain, currently beta for mobile (as of early 2026), alpha-grade tooling for Windows-first dev. Aesthetically aligned with Electron-replacement-via-Tauri ambitions, but Notal isn't migrating desktop to Tauri and adopting Tauri Mobile alone doubles the native toolchain burden. |
| Ionic Framework (full) | Ionic = Capacitor + UI kit. Notal already has its own Tailwind design system; Ionic's UI kit would fight it. If we go Capacitor, we skip Ionic UI. |
| Expo | Managed React Native — same "separate codebase" problem. Expo is good for greenfield mobile; Notal is not greenfield. |
| Deep-link-to-web (open phone browser to Notal's LAN URL) | This IS the Stage A flow, except a PWA gives install + offline queue for free. The "just open the URL" path is a subset of the PWA path. |

---

## Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `qrcode.react` | **4.2.0** | React component for QR rendering on desktop Settings panel | Pairing UI: desktop shows QR, mobile scans. Alternative to calling `qrcode` imperatively; shadows the same underlying library. Pick one, not both. |
| `@capacitor/filesystem` | 8.1.2 | Mobile local file access | **Stage B only.** Needed if mobile offline queue needs to persist through uninstall (localStorage alone survives most cases). |
| `@capacitor/app` | 8.1.0 | Mobile app lifecycle events | Stage B only — handles app-to-background transitions for queued submissions. |
| `@capacitor/share` | 8.0.1 | Integrate with OS share sheet | Stage B only — lets iOS Share Sheet target Notal ("Share to Notal" from Safari). High-leverage capture UX win if Stage B ships. |

---

## Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Google Cloud Console | Register OAuth "Desktop app" client | Matt must register `notal-desktop` client ID; NO client_secret needed at runtime given PKCE. |
| `@vite-pwa/assets-generator` | Generates PWA icons from a master | Dev dep; same pipeline idea as existing `electron-icon-builder`. Matt can reuse the lemur icon. |
| Android Studio | Stage B only | Windows compatible. |
| Xcode | Stage B only | Mac-only; defer until Stage B decision. |

---

## Installation

```bash
# Theme 1 — Google Calendar
npm install googleapis@^171.4.0 chrono-node@^2.9.0

# Theme 2 — Graph sliders
npm install @radix-ui/react-slider@^1.3.6
# (react-force-graph-2d 1.29.1 already installed)

# Theme 3 — Mobile Stage A (PWA + LAN sync)
npm install fastify@^5.8.5 @fastify/cors@^11.2.0 @fastify/bearer-auth@^10.1.2 qrcode@^1.5.4 qrcode.react@^4.2.0
npm install -D vite-plugin-pwa@^1.2.0 @vite-pwa/assets-generator@^1.0.0

# Theme 3 — Stage B (deferred; DO NOT install in v0.3.1)
# npm install @capacitor/core@^8.3.1 @capacitor/ios@^8.3.1 @capacitor/android@^8.3.1 @capacitor/app@^8.1.0 @capacitor/filesystem@^8.1.2 @capacitor/share@^8.0.1
# npm install -D @capacitor/cli@^8.3.1
```

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `googleapis` 171 | `@googleapis/calendar` 14.2.0 (split package) | If install weight becomes a real constraint (it won't for Electron — asar already large) |
| Hybrid regex → chrono-node → LLM | Pure LLM extraction via existing Anthropic SDK | If users' trigger language is highly idiosyncratic — revisit with telemetry after Phase X ships |
| Loopback OAuth | Custom protocol `notal://` + NSIS registry write | Only if Google ever requires it (they currently discourage it) |
| Electron `safeStorage` | `keytar` 7.9.0 | Never. Keytar is archived. |
| `@radix-ui/react-slider` direct | shadcn/ui Slider (vendored copy) | If Notal adopts shadcn broadly for other components — then vendor all primitives uniformly |
| `react-force-graph-2d` kept | `react-force-graph-3d` | If 3D graph rendering is ever desired — not for v0.3.1 |
| PWA (Stage A) | Capacitor (Stage B) | After Stage A usage data shows app-store presence matters |
| LAN HTTP sync | Yjs CRDT | When bidirectional edit / multi-device real-time editing ships (post-v0.4) |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `keytar` | Archived Dec 15, 2022; native build friction; redundant with `safeStorage` already in use | Electron `safeStorage` + `electron-conf` (existing pattern) |
| Custom URI scheme `notal://` for OAuth redirect | Google explicitly discourages it (app-impersonation risk); Windows registration is installer-scoped and breaks portable ZIP builds | Loopback `http://127.0.0.1:<port>/oauth2callback` with PKCE |
| Cloud relay for mobile sync (Firebase, Supabase, custom server) | Violates PROJECT.md Core Design Principle 3 ("Local-first, AI calls go directly to provider, not through AInotepad servers") | LAN HTTP to Notal's existing 127.0.0.1:7723 server, extended to bind on LAN interface after pairing |
| React Native for mobile | Separate codebase; no reuse of existing Tailwind + React renderer; capture-only scope doesn't justify it | PWA (Stage A) → Capacitor wrap of same web bundle (Stage B) |
| `@getstation/electron-google-oauth2` | Unmaintained wrapper; `googleapis` + ~40 lines is cleaner | `googleapis` OAuth2 client + `BrowserWindow` directly |
| `openid-client` | Overkill for Google-only; duplicates `googleapis` auth helpers | `googleapis`' `google.auth.OAuth2` |
| MUI / Mantine / Ant Design for sliders | 200-400 KB for a primitive Notal can get from Radix at 15 KB | `@radix-ui/react-slider` |
| Pure LLM date extraction on every note | Wasteful prompt tax on Enter-submits; latency hit | Hybrid regex → chrono-node → LLM-only-on-ambiguity |
| Yjs / Automerge in v0.3.1 | Overengineering for capture-only; CRDT complexity unjustified | Simple HTTP POST + server-side dedupe via `clientId` + timestamp |

---

## Stack Patterns by Variant

**If Matt uses a Google Workspace account with calendar restrictions:**
- OAuth scope `https://www.googleapis.com/auth/calendar.events` (NOT `.../calendar` — minimum scope) to insert events only, no read of existing events.
- Admin may block third-party OAuth — surface a clear error in Settings.

**If the mobile PWA needs to cross subnets (office Wi-Fi, VPN):**
- LAN HTTP won't reach; fall back to QR-encoded note text that mobile Safari pastes into a file shared via iCloud/Drive → rejected as bad UX. Better answer: **document that v0.3.1 mobile requires same-LAN**, revisit if demand emerges.

**If Matt's threat model includes a compromised LAN:**
- Bearer token pairing already mitigates casual LAN sniffing.
- For stronger: TLS via `mkcert`-style self-signed cert installed on both devices at pairing time — adds complexity, deferred unless requested.

**If trigger phrase detection underperforms:**
- First fallback: expand regex trigger family from telemetry.
- Second fallback: shift chrono-node to "always on", LLM to "always on", cost-amortize by running in existing aiWorker thread (already pays for an LLM call per note).

---

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `googleapis@171.4.0` | Node 18+ (Electron 39 ships Node 22) | No native deps; pure JS transitive tree. ASAR-safe. |
| `chrono-node@2.9.0` | Node 14+ | Pure JS. ASAR-safe. Tree-shakeable. |
| `@radix-ui/react-slider@1.3.6` | React 19 ✅ | peer `react: "^16.8 || ^17 || ^18 || ^19 || ^19.0.0-rc"` — Notal is 19.2.1. |
| `vite-plugin-pwa@1.2.0` | Vite 7 ✅ | Explicit peer support for Vite 3-7. |
| `fastify@5.8.5` | Node 20+ | Electron 39 ships Node 22 — fine. Coexists with existing `node:http` server or replaces it. |
| `@fastify/bearer-auth@10.1.2` | Fastify 5 ✅ | Version-paired. |
| `@fastify/cors@11.2.0` | Fastify 5 ✅ | Version-paired. |
| `@capacitor/core@8.3.1` | Node 20+ for CLI; Android Gradle plugin 8; Xcode 15+ iOS 14+ | **Stage B only.** No impact on Electron build. |
| `qrcode@1.5.4` / `qrcode.react@4.2.0` | Universal | Pure JS, no native binding. |

**Electron packaging implications (CRITICAL):**
- `googleapis`, `chrono-node`, `@radix-ui/react-slider`, `fastify`, `@fastify/*`, `qrcode`, `qrcode.react`, `vite-plugin-pwa` → **ALL pure JS, bundled into ASAR, no electron-rebuild step, no native binary concerns.**
- NO new native deps added for Theme 1 or Theme 2. Existing `better-sqlite3` + `node-llama-cpp` remain the only native rebuild targets.
- Mobile Stage B (Capacitor) produces **separate binaries outside Electron** — does not affect `electron-builder` config at all. Capacitor builds its own IPA/AAB.
- `postinstall` script (`electron-rebuild -f -w better-sqlite3,node-llama-cpp`) unchanged.

**Licensing (all MIT-compatible, confirmed against MIT Notal):**
- `googleapis` — Apache-2.0 (MIT-compatible for MIT redistribution)
- `chrono-node` — MIT
- `@radix-ui/react-slider` — MIT
- `fastify`, `@fastify/cors`, `@fastify/bearer-auth` — MIT
- `vite-plugin-pwa` — MIT
- `qrcode` — MIT; `qrcode.react` — ISC (MIT-compatible)
- `@capacitor/*` — MIT

---

## Integration Points (concrete file map)

| New dep | Integrates into |
|---------|-----------------|
| `googleapis` | new `src/main/googleCalendar.ts` — OAuth2 client, token refresh, `createEvent()`; IPC handlers in `src/main/ipc.ts` (pattern: `ipcMain.handle('google:auth:start' | 'google:event:create' | 'google:auth:disconnect')`); secrets via existing `safeStorage` + `electron-conf` |
| `chrono-node` | new `src/worker/reminderExtractor.ts` — runs inside existing `aiWorker.ts` utilityProcess; consumed by orchestrator after note organize step |
| `@radix-ui/react-slider` | new `src/renderer/src/components/GraphControls.tsx` — Tailwind-styled Radix primitives; piped into `WikiGraph.tsx` via props; persisted through new IPC `graph:params:set/get` against `electron-conf` |
| `fastify` + `@fastify/bearer-auth` + `@fastify/cors` | refactor of `src/main/mcpServer.ts` — mount MCP Streamable transport on Fastify; add `POST /notes` route; LAN-bind after pairing; bearer token stored via `safeStorage` |
| `qrcode.react` | new pairing tab in `SettingsPanel.tsx` — shows QR of `http://<LAN-IP>:7723/?token=<bearer>` after user clicks "Pair mobile device" |
| `vite-plugin-pwa` | `electron.vite.config.ts` (or a new `vite.mobile.config.ts`) — separate entry producing `dist-mobile/` with manifest + SW; served by Fastify at `/m/*` |

---

## Sources

- [googleapis npm registry](https://www.npmjs.com/package/googleapis) — v171.4.0 confirmed (HIGH)
- [google-api-nodejs-client README](https://github.com/googleapis/google-api-nodejs-client) — OAuth2 + refresh-token pattern, calendar.events.insert example (HIGH)
- [Google OAuth native-app guidance](https://developers.google.com/identity/protocols/oauth2/native-app) — loopback de-facto for desktop, custom-scheme discouraged, PKCE recommended, client_secret non-confidential (HIGH)
- [chrono-node GitHub](https://github.com/wanasit/chrono) — v2.9.0 (Sep 23, 2025), MIT, ParsingReference semantics (HIGH)
- [atom/node-keytar repo header](https://github.com/atom/node-keytar) — Archived Dec 15, 2022; last release v7.9.0 Feb 17, 2022 (HIGH — decisive rejection)
- [Auth0 "Securing Electron Applications with OpenID and OAuth2"](https://auth0.com/blog/securing-electron-applications-with-openid-connect-and-oauth-2/) — confirms BrowserWindow + loopback + safeStorage pattern (MEDIUM)
- [@itwin/electron-authorization npm](https://www.npmjs.com/package/@itwin/electron-authorization) — independent confirmation that `safeStorage`-encrypted refresh token on disk is the mainstream Electron pattern in 2026 (MEDIUM)
- [Capacitor workflow docs](https://capacitorjs.com/docs/basics/workflow) — v8 current; wraps existing Vite React build; `cap sync` + `cap run ios/android` (HIGH)
- [vite-plugin-pwa peer dependencies (npm)](https://www.npmjs.com/package/vite-plugin-pwa) — v1.2.0 supports Vite 3-7 inclusive (HIGH)
- [react-force-graph-2d npm](https://www.npmjs.com/package/react-force-graph-2d) — v1.29.1; peer `react: *`; deps on `force-graph@^1.51` exposing d3-force (HIGH)
- Direct source inspection of `src/main/mcpServer.ts`, `src/main/ipc.ts`, `src/renderer/src/components/WikiGraph.tsx` — confirmed existing transport is `node:http` not Fastify; confirmed safeStorage + electron-conf pattern; confirmed `graphRef.current.d3Force('link')` hook already present (HIGH)
- `npm view` registry queries for all version numbers, 2026-04-19 (HIGH)

---
*Stack research for: Electron desktop app v0.3.1 milestone — Google Calendar, dynamic graph sliders, mobile capture*
*Researched: 2026-04-19*
