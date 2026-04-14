---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 01
current_phase_name: Shell & Capture
current_plan: 1
status: verifying
stopped_at: Completed 01-02-PLAN.md, starting 01-03
last_updated: "2026-04-14T22:15:05.623Z"
last_activity: 2026-04-14
progress:
  total_phases: 6
  completed_phases: 0
  total_plans: 4
  completed_plans: 2
  percent: 50
---

# AInotepad — Project State

- **Current Phase:** 01
- **Current Phase Name:** Shell & Capture
- **Current Plan:** 1
- **Total Plans in Phase:** 1
- **Total Phases:** 6
- **Status:** Phase complete — ready for verification
- **Progress:** [█████░░░░░] 50%
- **Last Activity:** 2026-04-14
- **Stopped At:** Completed 01-02-PLAN.md, starting 01-03

---

## Phase Status

| Phase | Name | Status | Plans |
|-------|------|--------|-------|
| 1 | Shell & Capture | ◆ In Progress | 01-01 done, 01-02/03/04 pending |
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

## Notes

- Local model (llama.cpp) is v2 scope; v1 is frontier API only
- Agent write-back is v2; v1 agents are read-only
- No analytics or telemetry in v1
