# AInotepad Roadmap — v1.0

## Progress Overview

| Phase | Name | Plans | Complete | Status |
|-------|------|-------|----------|--------|
| 01 | Shell & Capture | Complete    | 2026-04-14 | Complete |
| 02 | AI Pipeline | Complete    | 2026-04-15 | Pending |
| 03 | 1/4 | Complete    | 2026-04-16 | Pending |
| 04 | AI Intelligence + Local Model + Patterns | Complete    | 2026-04-16 | Pending |
| 05 | 2/3 | Complete    | 2026-04-17 | Pending |
| 06 | Polish & Ship | Complete    | 2026-04-17 | Complete   | 2026-04-17 | Plan | Name | Status |
|------|------|--------|
| 01-01 | Scaffold + three-tab shell | ✓ Complete (2026-04-14) |
| 01-02 | SQLite DB layer + IPC handlers | ✓ Complete (2026-04-14) |
| 01-03 | System tray + global shortcut | ✓ Complete (2026-04-14) |
| 01-04 | Capture buffer + note list | ✓ Complete (2026-04-14) |

---

## Phase 02: AI Pipeline

**Goal:** Silent AI processing on every note submission — Electron utilityProcess worker, frontier API integration (Claude/OpenAI with user API key), and aiState/aiAnnotation written back to SQLite and surfaced in the UI.

**Plans:** 4/5 plans complete

Plans:
- [x] 02-01-PLAN.md — Install AI dependencies + extend schema with organized_text column
- [x] 02-02-PLAN.md — AI worker + IPC plumbing (utilityProcess fork, MessagePort, queue, renderer push, startup re-queue)
- [x] 02-03-PLAN.md — Real AI provider calls in worker (Anthropic SDK + OpenAI SDK, prompt, error handling)
- [x] 02-04-PLAN.md — Settings panel + API key storage (electron-conf, safeStorage, gear icon overlay)
- [ ] 02-05-PLAN.md — Human verification checkpoint (end-to-end AI pipeline)

---

## Phase 03: Karpathy Wiki

**Goal:** AI-maintained knowledge base with Markdown storage, wikilink navigation, and graph visualization.

**Plans:** 4/4 plans complete

Plans:
- [x] 03-01-PLAN.md — Schema + file I/O foundation (kbPages table, notes.tags column, kb.ts helpers)
- [x] 03-02-PLAN.md — AI pipeline extension (expanded prompt, wiki_updates, context loading, IPC surface)
- [x] 03-03-PLAN.md — WikiTab UI (WikiSidebar, WikiPane, WikiMarkdown, WikiGraph, color picker)
- [ ] 03-04-PLAN.md — Human verification checkpoint (end-to-end wiki flow)

---

## Phase 04: AI Intelligence + Local Model + Patterns Tab

**Goal:** AI worker gains retrieval capabilities (FTS5 + wiki graph) for grounded insight annotations. Local Gemma 4 model via node-llama-cpp as first-class provider. Patterns tab replaces Search placeholder with word cloud + AI digest.

**Plans:** 7/8 plans complete

Plans:
- [x] 04-01-PLAN.md — node-llama-cpp install + postinstall fix + ASAR exclusion + externalization
- [x] 04-02-PLAN.md — DB schema: ai_insights column, notes_fts FTS5 table + backfill, digests table
- [x] 04-03-PLAN.md — AI worker local model dispatch + FTS5 retrieval + insights schema extension
- [x] 04-04-PLAN.md — Digest generation pipeline (scheduler, Brave Search, worker narrative, digest storage)
- [x] 04-05-PLAN.md — Settings: Brave API key + local model tier UI + new IPC channels in preload
- [x] 04-06-PLAN.md — NoteCard insight rendering (italic amber, live via note:aiUpdate)
- [x] 04-07-PLAN.md — PatternsTab: word cloud + AI narrative + stats + daily/weekly toggle
- [x] 04-08-PLAN.md — Human verification checkpoint (end-to-end Phase 04 flows) (completed 2026-04-16)

---

## Phase 05: Agent Layer

**Goal:** Expose AInotepad note and wiki data to external AI agents via a bundled MCP server. Read-only. HTTP transport on localhost:7723. 4 tools. Runs in Electron main process. No auth.

**Plans:** 2/3 plans complete

Plans:
- [x] 05-01-PLAN.md — MCP server core: install SDK, create mcpServer.ts with 4 tools, wire into index.ts
- [x] 05-02-PLAN.md — Settings UI: add static Agent API section with connection URL and copy button
- [ ] 05-03-PLAN.md — Human verification checkpoint (smoke tests for all 4 tools + Settings UI)

---

## Phase 06: Polish & Ship

**Goal:** Onboarding, packaging, and distribution of Notal v0.1.0.

**Plans:** 6/6 plans complete

Plans:
- [x] 06-01-PLAN.md — App identity update (package.json name/version, electron-builder.yml productName/appId/targets, SettingsPanel MCP rename)
- [x] 06-02-PLAN.md — App icon creation (geometric SVG → .ico/.icns/.png via electron-icon-builder, place in build/)
- [x] 06-03-PLAN.md — Onboarding IPC layer (ipc.ts handlers, preload bridge, TypeScript types)
- [x] 06-04-PLAN.md — OnboardingModal component + App.tsx first-launch check
- [x] 06-05-PLAN.md — README.md (developer-focused, 6 sections, under 100 lines)
- [x] 06-06-PLAN.md — Final build verification + human smoke test checkpoint
