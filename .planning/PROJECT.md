# Project: AInotepad

**Created:** 2026-04-14
**Owner:** Matthew Mancini
**Working directory:** `C:/Users/mflma/workspace/AInotepad/`

---

## Concept

A desktop notepad application for developers, entrepreneurs, and knowledge workers that silently augments every note with AI — no prompting, no chatting, no waiting for a response. Write a thought, hit Enter, and the AI works in the background.

The primary interface is a minimal buffer: type a note, submit with Enter. The AI then silently:
1. Organizes the note (cleans structure, infers intent, tags it)
2. Integrates it into a growing Karpathy-style LLM wiki (living, AI-synthesized knowledge base)
3. Adds inline AI comments / insights directly into the note view

The knowledge base grows over time into a coherent, searchable representation of the user's thinking — without the user ever needing to curate it manually.

---

## Platform

- **Target:** Desktop (Electron or Tauri)
- **Distribution:** Local install; no cloud backend required
- **OS:** Windows first, macOS second

---

## AI Architecture

**Two modes — user selects at setup:**

1. **Frontier API mode**: User provides their own API key (Claude, OpenAI, etc.). Requests go directly from the desktop app to the provider. No AInotepad server involved.
2. **Local model mode**: llama.cpp backend (bundled or user-installed). Fully offline. Compatible with Llama, Mistral, Qwen, etc.

**AI triggers automatically** on every note submission. No user invocation required.

---

## Knowledge Base: Karpathy-Style LLM Wiki

The KB is a living, AI-maintained document structure (not a static dump of notes):

- New notes are processed and **semantically integrated** into the existing wiki
- The AI identifies which topics the note relates to and **updates those topic summaries** inline
- Concepts are **auto-linked** across topics (entity recognition + semantic proximity)
- The wiki can be navigated by semantic search ("what have I thought about X?") and by topic browsing
- The KB is **stored locally** — plain files (Markdown + SQLite for embeddings/metadata)
- The AI periodically **consolidates and rewrites** topic summaries as knowledge accumulates

This is explicitly NOT a tag-based system, NOT an Obsidian manual graph — the AI owns organization entirely.

---

## Agent Connectivity

An **optional open connectivity layer** allows external AI agents to read the knowledge base and act on it:

- Agents connect via a local API or webhook endpoint exposed by the app
- The app surfaces: new notes, KB state, user-inferred preferences/patterns
- **No prescribed actions** — what the agent does is defined by the user-agent relationship
- Examples (non-exhaustive): create tasks, send messages, trigger workflows, summarize daily notes
- Security: local-only by default; user explicitly enables and configures any agent connections

---

## Core Design Principles

1. **Quiet**: The AI never interrupts. No popups, no chat, no required responses.
2. **Automatic**: Every note submission triggers the full pipeline — no user invocation.
3. **Local-first**: All notes and KB stored on device. AI calls go directly to provider, not through AInotepad servers.
4. **Progressive**: The KB grows smarter over time. Early notes benefit retroactively as the AI builds context.
5. **Open**: Agent connectivity is a first-class feature, not an afterthought — but fully opt-in.
6. **Fully open source**: MIT license, source on GitHub, no proprietary components. Open source is the primary trust mechanism for a tool that processes personal notes.

---

## Tech Stack Preferences

- **Framework**: Electron (broader ecosystem) or Tauri (smaller bundle, Rust backend)
- **Frontend**: React + Vite + TailwindCSS
- **Local storage**: SQLite (notes, metadata, KB structure) + plain Markdown files (KB wiki pages)
- **Embeddings**: llama.cpp embedding model OR frontier embedding API (text-embedding-3-small)
- **Local AI**: llama.cpp (via node-llama-cpp or spawned subprocess)
- **Language**: TypeScript throughout

---

## v1 Scope (MVP)

- Note capture buffer (Enter to submit)
- AI silent processing pipeline (organize → integrate → comment)
- Karpathy-style wiki: auto-generated, auto-updated, browsable
- Frontier API mode (Claude or OpenAI key)
- Local note + KB storage (SQLite + Markdown)
- Basic agent connectivity endpoint (read-only KB access via local HTTP)

**Out of scope for v1:**
- llama.cpp local model (v2)
- Cross-device sync (never, by design)
- Mobile companion
- Agent write-back (agents can read, not write to KB in v1)

---

## Shipped: v0.3.0 — Corkboard Polish + App Icon (Phases 07-09, 2026-04-17 → 2026-04-19)

- Note cards as compact post-its with hover-expand, tag-color borders, and tag dots
- Intra-tag edge overlay on corkboard (subsequently retired; connections now live on wiki graph)
- Patterns footer fits at default window size; weekly digest pre-loads and uses rolling 7-day window
- Illustrated lemur icon across taskbar, tray, installer, and About dialog
- Reproducible icon pipeline via `scripts/generate-icons.cjs` (multi-resolution ICO 16/24/32/48/64/128/256)
- Requirements validated: CORK-01..05, PAT-01..03, ICON-01

## Current Milestone: v0.3.1 — Reminders, Graph Control, Mobile

**Goal:** Extend Notal beyond passive knowledge capture into actionable reminders (Google Calendar), give users direct control over how the wiki graph renders, and open a mobile capture pathway so notes aren't locked to the desktop.

**Target features:**
- Google Calendar integration — detect "remind me to…" / "I need to remember to…" phrases with date/time and auto-create calendar reminders
- Dynamic wiki graph parameters — user-adjustable sliders for link force, center force, repel force, edge thickness, node size (persistent per user)
- Mobile extension — mobile capture companion (platform, capture-only vs full view, sync mechanism TBD in phase planning)

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-19 — milestone v0.3.1 started (Reminders, Graph Control, Mobile); prior milestone v0.3.0 (Corkboard Polish + App Icon) shipped*
