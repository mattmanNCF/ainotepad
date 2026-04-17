---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 06
current_phase_name: polish-and-ship
current_plan: 6
status: executing
stopped_at: Completed 06-05-PLAN.md
last_updated: "2026-04-17T08:20:52.117Z"
last_activity: 2026-04-17
progress:
  total_phases: 5
  completed_phases: 2
  total_plans: 26
  completed_plans: 23
  percent: 88
---

# AInotepad — Project State

- **Current Phase:** 06
- **Current Phase Name:** polish-and-ship
- **Current Plan:** 6
- **Total Plans in Phase:** 6
- **Total Phases:** 6
- **Status:** Ready to execute
- **Progress:** [█████████░] 88%
- **Last Activity:** 2026-04-17
- **Stopped At:** Completed 06-05-PLAN.md

---

## Phase Status

| Phase | Name | Status | Plans |
|-------|------|--------|-------|
| 1 | Shell & Capture | ✓ Complete | 01-01, 01-02, 01-03, 01-04 done |
| 2 | AI Pipeline | ○ Pending | Not yet planned |
| 3 | Karpathy Wiki | ○ Pending | Not yet planned |
| 4 | Search | ○ Pending | Not yet planned |
| 5 | Agent Layer | ○ Pending | Not yet planned |
| 6 | Polish & Ship | ○ Pending | Not yet planned |

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

1. Cold-start wiki — mitigated by seed prompt in onboarding (Phase 6)
2. LLM latency — mitigated by pulsing indicator + Stage 1 fast path
3. ABI mismatch (better-sqlite3/node-llama-cpp) — @electron/rebuild in postinstall
4. Windows temp file rename — write temp to same directory as target

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

## Notes

- Local model (llama.cpp) is v2 scope; v1 is frontier API only
- Agent write-back is v2; v1 agents are read-only
- No analytics or telemetry in v1
