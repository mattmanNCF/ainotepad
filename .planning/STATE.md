---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: — Corkboard Polish
status: unknown
last_updated: "2026-04-19T04:04:22.856Z"
progress:
  total_phases: 9
  completed_phases: 6
  total_plans: 38
  completed_plans: 35
---

# Notal — Project State

## Current Position

Phase: 09 (App Icon) — EXECUTING
Plan: 1 of 3

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-17)

**Core value:** Every note is silently enriched by AI and grows into a searchable knowledge base — zero friction, zero prompting.
**Current focus:** Phase 09 — App Icon

## Previous Milestone Summary (v1.0)

- 6 phases complete, v0.1.0 shipped to GitHub Releases
- Full AI pipeline: capture → tag → wiki → insights
- Patterns tab, FTS5 + semantic search, MCP agent endpoint
- Windows NSIS installer + portable ZIP

---

## Phase Status (v1.1)

| Phase | Name | Status | Plans |
|-------|------|--------|-------|
| 07 | Note Card Visual Redesign | ○ Not started | TBD |
| 08 | Connections + Digest Improvements | ○ Not started | TBD |
| 09 | App Icon | ○ Not started | TBD |

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
