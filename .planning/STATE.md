---
gsd_state_version: 1.0
milestone: v0.3.1
milestone_name: — Reminders, Graph Control, Mobile
status: unknown
stopped_at: Phase 12 Plan 03 complete - mobile PWA built
last_updated: "2026-04-24T02:42:32.672Z"
progress:
  total_phases: 12
  completed_phases: 9
  total_plans: 55
  completed_plans: 49
---

# Notal — Project State

## Current Position

Phase: 12 (mobile-extension) — EXECUTING
Plan: 1 of 6

## Session Continuity

**Last session:** 2026-04-24T02:42:27.399Z
**Stopped at:** Phase 12 Plan 03 complete - mobile PWA built
**Key locked decision:** Mobile = Path C (Drive appDataFolder + github.io PWA). Phase 12 kept in v0.3.1 scope (not dropped to v0.3.2). Working branch: `notal-v0.3.1-mobile` (cut from `notal-v0.2`).
**Next action:** `/gsd:plan-phase 12` — Mobile Extension.
**Non-blocking bug:** Toast stacking on rapid double-submit (v0.3.2 polish).

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-19)

**Core value:** Every note is silently enriched by AI and grows into a searchable knowledge base — zero friction, zero prompting.
**Current focus:** Phase 12 — mobile-extension

## Previous Milestone Summaries

**v0.3.0 — Corkboard Polish + App Icon (Phases 07-09, shipped 2026-04-19)**

- Compact post-it cards with hover-expand, tag-color borders, tag-color dots
- Intra-tag corkboard edges (subsequently retired; connections moved to wiki graph)
- Patterns footer fits default window; weekly digest rolling 7-day window
- Illustrated lemur icon end-to-end (taskbar, tray, installer, About)

**v1.0 — Initial Release (Phases 01-06, shipped 2026-04-17)**

- 6 phases complete, v0.1.0 shipped to GitHub Releases
- Full AI pipeline: capture → tag → wiki → insights
- Patterns tab, FTS5 + semantic search, MCP agent endpoint
- Windows NSIS installer + portable ZIP

---

## Phase Status (v0.3.1)

| Phase | Name | Status | Requirements |
|-------|------|--------|--------------|
| 10 | Dynamic Wiki Graph Parameters | Not started | GRAPH-PERF-01, GRAPH-SCOPE-01, GRAPH-UX-01, GRAPH-A11Y-01 |
| 11 | Google Calendar Integration | Not started (ship gate) | CAL-SEC-01/02/03, CAL-UX-01/02, CAL-TZ-01, CAL-COST-01, CAL-DEL-01, XCUT-SEC-02, XCUT-CSP-01 |
| 12 | Mobile Extension (Drive transport) | Not started (droppable to v0.3.2) | MOB-AUTH-01/02, MOB-TRANS-01/02/03, MOB-PWA-01/02, MOB-SEC-01, MOB-UX-01/02, MOB-QUOTA-01 |

**Coverage:** 25 active requirements mapped across 3 phases. XCUT-SEC-01 (MCP Bearer) explicitly deferred to v2.

---

## Architecture Snapshot

- **Framework:** Electron v28+ (electron-vite, electron-builder)
- **Frontend:** React 19 + Vite 6 + TailwindCSS v4
- **Storage:** better-sqlite3 + Drizzle ORM + WAL + sqlite-vec
- **AI worker:** Electron utilityProcess + MessagePort
- **AI providers:** Claude (Anthropic SDK) + OpenAI (user's own API key)
- **KB:** Karpathy 3-layer Markdown structure in userData/kb/
- **Agent API:** Fastify 127.0.0.1:7723, SSE, Bearer token auth
- **Distribution:** GitHub Releases, MIT open source

---

## Key Risks

1. Hover-expand z-index management — cards must expand without layout reflow
2. SVG edge rendering on corkboard — need canvas or SVG overlay layer
3. sqlite-vec embedding similarity threshold tuning — too low = noisy edges, too high = no edges
4. Rolling window digest pre-load — must not block tab open on slow AI response

---

## Decisions

- TailwindCSS v4 uses @import 'tailwindcss' in CSS — no tailwind.config.ts created
- rollupOptions.external set in both main AND preload builds to prevent native module bundling
- Preload stripped to notes API shape only; window.electron (electronAPI) removed for clean surface
- electron-rebuild succeeded on Windows for better-sqlite3 (Python + MSVC build tools present)

---
- [Phase 01]: TailwindCSS v4 uses @import tailwindcss in CSS - no tailwind.config.ts created
- [Phase 01]: rollupOptions.external set in both main AND preload builds to prevent native module bundling
- [Phase 01]: Preload simplified to notes API surface only - removed window.electron/electronAPI
- [Phase 01-02]: crypto.randomUUID() used instead of uuid package - no extra dependency
- [Phase 01-02]: Inline CREATE TABLE IF NOT EXISTS in db.ts for v1 - no Drizzle migrate runner needed
- [Phase 01-02]: Drizzle with better-sqlite3 is synchronous - .all() and .run() used, no async/await
- [Phase 01-03]: Used Electron.NativeImage type (not nativeImage namespace) for tray icon variable
- [Phase 01-03]: window-all-closed no longer quits on Windows/Linux — app lives in tray permanently
- [Phase 01-03]: createWindow() returns BrowserWindow so caller passes it to createTray() and globalShortcut
- [Phase 01-04]: Optimistic prepend uses temporary id (optimistic-${Date.now()}) replaced by real ID after IPC resolves
- [Phase 01-04]: NoteRecord type inlined in renderer — keeps renderer self-contained without preload type coupling
- [Phase 01-04]: @keyframes slideIn defined in main.css — TailwindCSS v4 does not support arbitrary keyframe classes in JSX
- [Phase 01-04]: Failed IPC in v1 leaves optimistic entry visible — no error UI (deferred to v2)
- [Phase 02-01]: AI packages in dependencies not devDependencies for electron-builder production packaging
- [Phase 02-01]: ALTER TABLE migration in try-catch before drizzle() for idempotency across app launches
- [Phase 02-02]: Electron MessagePortMain uses .on('message', handler) not .onmessage property; handler typed as Electron.MessageEvent not browser MessageEvent<any>
- [Phase 02-02]: getDecryptedApiKey stub returns null in 02-02; enqueue skipped until 02-04 wires real key
- [Phase 02-02]: startAiWorker called with empty apiKey at startup; worker launches with stub callAI until 02-03 wires real SDKs
- [Phase 02-03]: SDK packages externalized (not bundled) via electron-vite externalizeDeps — resolves at runtime from node_modules; correct for Electron packaging
- [Phase 02]: getProvider() exported from ipc.ts — avoids duplicating electron-conf Conf init; index.ts reads provider and key at startup from shared module-scope instance
- [Phase 02]: settings:save handler posts settings-update to running worker via getWorkerPort() so same-session notes pick up new key without app restart
- [Phase 03-karpathy-wiki]: kb.ts writeKbFile uses temp+rename for Windows atomic writes
- [Phase 03-karpathy-wiki]: updateNoteAiResult extended with optional tags param (backward-compatible default '[]')
- [Phase 03-karpathy-wiki]: tagColors.ts is a separate Conf instance — breaks circular aiOrchestrator to ipc.ts dependency
- [Phase 03-karpathy-wiki]: enqueueNote is now async — loads _context.md and concept snippets before posting worker task message
- [Phase 03-karpathy-wiki]: notes:create ipcMain.handle made async to await enqueueNote; ipc.ts imports tagColors.ts directly, no getConf() export
- [Phase 03-karpathy-wiki]: useRef (not useState) for WikiTab content cache — ref mutations don't invalidate useCallback deps, preventing infinite re-render loop
- [Phase 03-karpathy-wiki]: remark-wiki-link permalinks derived from existingFiles — required to distinguish known vs new wiki links in rendered Markdown
- [Phase 04-search]: FTS5 standalone non-content-table with raw_text + note_id UNINDEXED chosen to avoid better-sqlite3 trigger bugs
- [Phase 04-search]: sqlite instance moved to module scope; getSqlite() accessor for raw-SQL FTS5 helpers
- [Phase 04-search]: react-d3-cloud installed with --legacy-peer-deps due to React 19 peer dep conflict; works at runtime
- [Phase 04-search]: node-llama-cpp externalized in both main and preload rollup builds; asarUnpack configured for native binaries
- [Phase 04-search]: Windows EPERM on unlink for better_sqlite3.node resolved by pre-deleting with bash rm before electron-rebuild
- [Phase 04-search]: onProgress receives totalSize/downloadedSize; percent computed as ratio*100
- [Phase 04-search]: InsufficientMemoryError caught in initLocalModel; CPU fallback via gpuLayers=0
- [Phase 04-search]: queryRelatedNotes returns empty string on error (safe before FTS5 migration)
- [Phase 04-search]: Word cloud built in main process (digestScheduler) not worker — data aggregation stays with DB access
- [Phase 04-search]: callAIWithPrompt() added as separate function for digest narrative — skips buildPrompt/grammar enforcement
- [Phase 04-search]: preload/index.d.ts must be kept in sync with preload/index.ts — renderer TypeScript resolves Window.api types from .d.ts
- [Phase 04-search]: settings:get returns hasKey=true for both ollama and local providers (no API key needed)
- [Phase 04-search]: settings:save posts modelPath in settings-update worker message when provider=local
- [Phase 04-search]: NoteRecord interface uses aiInsights (Drizzle camelCase) while onAiUpdate handler reads data.insights (live-push field name)
- [Phase 04-search]: SearchTab.tsx replaced with single-line re-export alias for PatternsTab to preserve App.tsx import without changes
- [Phase 04-search]: Tab id 'search' kept unchanged; only label changed to 'Patterns' to avoid App.tsx activeTab state changes
- [Phase 05-agent-layer]: @modelcontextprotocol/sdk bundled into ASAR (not externalized) — pure JS, no native binaries
- [Phase 05-agent-layer]: StreamableHTTPServerTransport per request (stateless mode) — correct for read-only tools with no session state
- [Phase 05-agent-layer]: isCleaningUp guard in before-quit prevents infinite loop when app.quit() re-triggers before-quit event
- [Phase 06]: zip target added alongside NSIS for portable Windows distribution in v0.1.0
- [Phase 06]: artifactName uses ${productName} not ${name} so Notal-prefixed artifacts regardless of npm name
- [Phase 06-polish-and-ship]: sharp installed with --legacy-peer-deps due to react-d3-cloud peer dep conflict; SVG inlined in script as Buffer to avoid Windows librsvg dependency
- [Phase 06-03]: Used existing conf instance (not a new Conf) to preserve single-source-of-truth for onboarding settings
- [Phase 06-04]: showOnboarding initialized false to prevent modal flash before IPC resolves on every launch
- [Phase 06-04]: OnboardingModal overlay clicks handleSkip to mark onboarding done — consistent with SettingsPanel behavior
- [Phase 06-polish-and-ship]: Tool names in README use actual registered names from mcpServer.ts (get_recent_notes, get_wiki_page) — plan listed expected names that differed from source
- [Phase 06]: electron-builder zip target: win.artifactName fallback applies when nsis has own override; root zip: key invalid in v26+
- [Phase 06]: winCodeSign symlink workaround: winPackager.js patched to use cached rcedit-x64.exe directly; re-patch needed after npm ci unless Windows Developer Mode enabled
- [Phase 07-01]: tags field typed as string[] in NoteRecord even though DB returns JSON text — parse site in NotesTab getAll() init
- [Phase 07-01]: saved note from IPC create spread with explicit tags:[] and aiInsights:null since IPC handler predates tags field
- [Phase 07-02]: getBoundingClientRect called inside handleMouseEnter (not useEffect) for fresh rect at hover time
- [Phase 07-02]: Overlay zIndex 9998 vs context menu 9999 — context menu always appears above expand overlay
- [Phase 07-02]: Leave delay 120ms via useRef timeout — cancels on overlay mouseEnter for safe card-to-overlay cursor transit
- [Phase 08]: noteTags parameter prefixed with _ in computeSimilarPairs — grouping by tag done via tagToNoteIds in IPC handler; function signature kept for API clarity
- [Phase 08]: getRollingWeekStart uses local midnight via new Date(y,m,d-7,0,0,0,0) for calendar-day alignment avoiding UTC drift
- [Phase 08]: Weekly pre-load in PatternsTab uses getLatest check before generate - avoids unnecessary regeneration if digest already exists
- [Phase 08-02]: SVG placed inside overflow-y-auto container so edges scroll with content
- [Phase 08-02]: useLayoutEffect for edge computation prevents flicker by measuring after DOM paint
- [Phase 09-app-icon]: electron-icon-builder --flatten on Windows emits ICO to icons/icon.ico (not icons/win/); script checks artifact not exit code; shell:true required for .cmd on Windows spawnSync
- [Phase 09-app-icon]: BrowserWindow icon spread changed from linux-only conditional to unconditional — no regression on macOS, correct on Windows
- [Phase 09-app-icon]: electron-builder NSIS: always declare installerIcon + uninstallerIcon + installerHeaderIcon explicitly rather than relying on buildResources convention
- [Phase 09-03]: Orchestrator initially misread user feedback and reverted to SVG note-page icon; user clarified the lemur was always wanted; lemur icon (`build/icon-source.png`, 1,270,007 bytes) restored from git history, `generate-icons.cjs` updated to use PNG source, all derivatives regenerated, v0.3.0 installer rebuilt with lemur embedded (592 MB), note-page v0.3.0 uninstalled, lemur v0.3.0 installed at C:\Users\mflma\AppData\Local\Programs\notal\Notal.exe (ProductVersion 0.3.0.0); icon cache flushed; awaiting user visual confirmation before tag + push to main
- [Phase 10]: @radix-ui/react-slider requires --legacy-peer-deps (same React 19 peer conflict as react-d3-cloud and sharp)
- [Phase 10]: GraphParams type file in renderer/src/types/ imported via 'import type' in main — erased at compile time, no runtime cross-boundary dependency
- [Phase 10]: preload/index.d.ts inlines GraphParams shape rather than importing — keeps file ambient, avoids module-declaration collision
- [Phase 10-02]: Radix slider CSS added to assets/main.css (plan referred to nonexistent index.css)
- [Phase 10-02]: d3AlphaTarget() confirmed public API on react-force-graph-2d ref — no _simulation fallback needed
- [Phase 10-02]: GraphParamsPanel collapsed state resets on WikiGraph remount (colorKey change) — acceptable for v1
- [Phase 10-02]: Keyboard slider nudges do not pre-heat simulation (pointer events only); deferred to Plan 10-04
- [Phase 10]: Tasks 2/3/4-wiring folded into one commit to keep typecheck green at each step (same pattern as 10-02)
- [Phase 10]: History push is tick-level (every onValueChange); Plan 10-04 may refine to commit-only on pointer release
- [Phase 10]: Ctrl+Z scoped via closest('[data-graph-params-panel]') on document.activeElement; data attr on outermost wrapper div
- [Phase Phase 10]: axe verification implemented as DevTools console snippet — no CDP dependency, simpler than Playwright for one-shot scan
- [Phase Phase 10]: forceCenter replaced with forceX/forceY for real per-node gravity; center baseline 0.01 after empirical tuning; repel max capped at 2.0
- [Phase 11]: --legacy-peer-deps required for google-auth-library, @googleapis/calendar, chrono-node, luxon (React 19 peer conflict)
- [Phase 11]: Electron 39.x does not expose getWebPreferences() on WebContents — boot assertion uses REQUIRED_WEB_PREFS sentinel constant
- [Phase 11]: reminders.confidence uses integer({mode:'number'}) in drizzle (no real() helper); DDL uses REAL NOT NULL — SQLite dynamic typing bridges gap
- [Phase 11]: CodeChallengeMethod.S256 enum used (not string literal) per google-auth-library TypeScript types; calendar() factory used from @googleapis/calendar (not google.calendar())
- [Phase 11]: chrono.parse()+Luxon DateTime.fromObject for IANA-correct timezone conversion (not parseDate which uses host TZ)
- [Phase 11]: Function('p','return import(p)') indirect dynamic import for reminderService to bypass rollup static analysis
- [Phase 11]: getLatestReminderForNote uses drizzle select not raw SQL - raw SELECT * returns snake_case breaking calendarSyncStatus on renderer
- [Phase 11]: cascadeCalendarEventForNote queries Google privateExtendedProperty (not local reminders.event_id) as source of truth; 404/410 treated as successfully deleted; cascade never re-throws
- [Phase 11]: Cancelled reminder state renders no chip (hidden) — user already pressed Undo, chip disappearing is correct UX signal
- [Phase 11]: UndoToast single-toast policy: new pending replaces current, matching main-process independent timer behavior
- [Phase 12-mobile-extension]: GOOGLE_WEB_CLIENT_ID added to renderer.define as well as main.define for consistent define pattern across bundles
- [Phase 12-mobile-extension]: createNote placed above registerIpcHandlers at module scope for clean named import from ingestService without circular dependency
- [Phase 12-mobile-extension]: shared/envelope.ts is top-level directory not src/ because Vite root prevents PWA from importing src/main/
- [Phase 12]: Stub App.tsx created in Task 1 scaffold commit to allow build to pass; replaced in Task 2 with full capture UI
- [Phase 12]: mobile-pwa/node_modules + docs/ added to .gitignore; docs/notal-mobile/ built by CI not committed

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260418-12o | Fix wiki graph right-click context menu, sidebar color picker UX, and weekly digest scheduler rewrite | 2026-04-18 | 4622074 | [260418-12o](./quick/260418-12o-fix-wiki-graph-right-click-context-menu-/) |
| 260418-pue | Fix digest narrative max_tokens (512→4096 for Ollama/OpenAI) and add cleanup DELETE | 2026-04-18 | c788523 | [260418-pue](./quick/260418-pue-fix-digest-narrative-max-tokens-raise-ol/) |
| 260418-vru | Fix wiki graph edges — shared-tag linking between wiki pages | 2026-04-19 | ec4a651 | [260418-vru](./quick/260418-vru-fix-wiki-graph-edges-shared-tag-linking-/) |

## Next Milestone Ideas (v1.2+)

- **Wiki graph dynamic customization** — user-adjustable sliders for link force, center force, repel force, edge thickness, node size
- **Google Calendar integration** — detect key phrases in notes ("I need to remember to...", "remind me to...") paired with date/time → auto-create calendar reminders

## Notes

- Local model (llama.cpp) is v2 scope; v1 is frontier API only
- Agent write-back is v2; v1 agents are read-only
- No analytics or telemetry in v1
- Intra-tag edge connections (CORK-05) use existing sqlite-vec embeddings — no new AI calls
- Rolling digest (PAT-03) must handle the case where fewer than 7 days of notes exist
