# AInotepad Roadmap — v1.0

## Progress Overview

| Phase | Name | Plans | Complete | Status |
|-------|------|-------|----------|--------|
| 01 | Shell & Capture | Complete    | 2026-04-14 | Complete |
| 02 | AI Pipeline | Complete    | 2026-04-15 | Pending |
| 03 | 1/4 | In Progress|  | Pending |
| 04 | Search | TBD | 0 | Pending |
| 05 | Agent Layer | TBD | 0 | Pending |
| 06 | Polish & Ship | TBD | 0 | Pending |

---

## Phase 01: Shell & Capture

**Goal:** Scaffold Electron app, SQLite DB layer, system tray, and capture buffer UI.

| Plan | Name | Status |
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

**Plans:** 1/4 plans executed

Plans:
- [x] 03-01-PLAN.md — Schema + file I/O foundation (kbPages table, notes.tags column, kb.ts helpers)
- [ ] 03-02-PLAN.md — AI pipeline extension (expanded prompt, wiki_updates, context loading, IPC surface)
- [ ] 03-03-PLAN.md — WikiTab UI (WikiSidebar, WikiPane, WikiMarkdown, WikiGraph, color picker)
- [ ] 03-04-PLAN.md — Human verification checkpoint (end-to-end wiki flow)

---

## Phase 04: Search

**Goal:** Semantic search over notes and wiki.

*Plans to be defined.*

---

## Phase 05: Agent Layer

**Goal:** Local HTTP API for external agent connectivity.

*Plans to be defined.*

---

## Phase 06: Polish & Ship

**Goal:** Onboarding, packaging, and distribution.

*Plans to be defined.*
