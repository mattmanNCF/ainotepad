---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 02
current_phase_name: ai pipeline
current_plan: Not started
status: planning
stopped_at: Completed 01-04-PLAN.md
last_updated: "2026-04-14T22:35:25.357Z"
last_activity: 2026-04-14
progress:
  total_phases: 6
  completed_phases: 1
  total_plans: 4
  completed_plans: 4
  percent: 100
---

# AInotepad — Project State

- **Current Phase:** 02
- **Current Phase Name:** ai pipeline
- **Current Plan:** Not started
- **Total Plans in Phase:** 4
- **Total Phases:** 6
- **Status:** Ready to plan
- **Progress:** [██████████] 100% (Phase 01)
- **Last Activity:** 2026-04-14
- **Stopped At:** Completed 01-04-PLAN.md

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

## Notes

- Local model (llama.cpp) is v2 scope; v1 is frontier API only
- Agent write-back is v2; v1 agents are read-only
- No analytics or telemetry in v1
