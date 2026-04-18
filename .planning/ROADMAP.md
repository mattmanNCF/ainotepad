# Notal Roadmap

## Current Milestone: v1.1 — Corkboard Polish

## Phases

- [x] **Phase 01: Shell & Capture** - Electron shell, SQLite layer, tray, capture buffer
- [x] **Phase 02: AI Pipeline** - Silent AI processing on every note submission
- [x] **Phase 03: Karpathy Wiki** - AI-maintained knowledge base with wiki navigation
- [x] **Phase 04: AI Intelligence + Local Model + Patterns** - FTS5 search, semantic search, digest, word cloud
- [x] **Phase 05: Agent Layer** - MCP server for external agent read access
- [x] **Phase 06: Polish & Ship** - Onboarding, packaging, GitHub release
- [ ] **Phase 07: Note Card Visual Redesign** - Post-it card layout with tag-color borders, hover-expand, and patterns footer fix
- [ ] **Phase 08: Connections + Digest Improvements** - Intra-tag edge connections and reliable rolling weekly digest
- [ ] **Phase 09: App Icon** - Replace placeholder icon with custom illustrated asset

---

## Progress Table

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 01. Shell & Capture | Complete | Complete | 2026-04-14 |
| 02. AI Pipeline | Complete | Complete | 2026-04-15 |
| 03. Karpathy Wiki | Complete | Complete | 2026-04-16 |
| 04. AI Intelligence + Local Model + Patterns | Complete | Complete | 2026-04-16 |
| 05. Agent Layer | Complete | Complete | 2026-04-17 |
| 06. Polish & Ship | Complete | Complete | 2026-04-17 |
| 07. Note Card Visual Redesign | 1/2 | In progress | - |
| 08. Connections + Digest Improvements | 0/? | Not started | - |
| 09. App Icon | 0/? | Not started | - |

---

## Phase Details

### Phase 01: Shell & Capture
**Goal**: Working Electron app with note capture and SQLite persistence
**Depends on**: Nothing
**Requirements**: CAP-01, CAP-02
**Success Criteria** (what must be TRUE):
  1. User can type a note and submit with Enter
  2. Note appears immediately in the notes list while AI processes
  3. App persists to system tray and reopens via global shortcut
**Plans**: 01-01, 01-02, 01-03, 01-04 — all complete

---

### Phase 02: AI Pipeline
**Goal**: Silent AI processing on every note submission — Electron utilityProcess worker, frontier API integration (Claude/OpenAI with user API key), and aiState/aiAnnotation written back to SQLite and surfaced in the UI.
**Depends on**: Phase 01
**Requirements**: AI-01, AI-03
**Success Criteria** (what must be TRUE):
  1. Every submitted note is automatically tagged and organized without user action
  2. AI insights appear inline on the note without any prompting
  3. User can enter a Claude or OpenAI API key in settings and it persists
**Plans**: 02-01, 02-02, 02-03, 02-04, 02-05 — all complete

---

### Phase 03: Karpathy Wiki
**Goal**: AI-maintained knowledge base with Markdown storage, wikilink navigation, and graph visualization.
**Depends on**: Phase 02
**Requirements**: AI-02, WIKI-01, WIKI-02
**Success Criteria** (what must be TRUE):
  1. User can browse auto-generated wiki topics in the sidebar
  2. Notes are automatically integrated into wiki topic pages
  3. User can assign and customize tag colors that propagate through the UI
**Plans**: 03-01, 03-02, 03-03, 03-04 — all complete

---

### Phase 04: AI Intelligence + Local Model + Patterns Tab
**Goal**: AI worker gains retrieval capabilities (FTS5 + wiki graph) for grounded insight annotations. Local Gemma 4 model via node-llama-cpp as first-class provider. Patterns tab replaces Search placeholder with word cloud + AI digest.
**Depends on**: Phase 03
**Requirements**: AI-04, SRCH-01, PAT-00
**Success Criteria** (what must be TRUE):
  1. User can search notes by full-text and semantic similarity
  2. Patterns tab shows word cloud, daily/weekly AI narrative, and note statistics
  3. User can select a local Ollama model as AI provider in settings
**Plans**: 04-01 through 04-08 — all complete

---

### Phase 05: Agent Layer
**Goal**: Expose Notal note and wiki data to external AI agents via a bundled MCP server. Read-only. HTTP transport on localhost:7723. 4 tools.
**Depends on**: Phase 04
**Requirements**: AGNT-01
**Success Criteria** (what must be TRUE):
  1. External MCP-compatible agent can call get_recent_notes and receive note data
  2. External agent can call get_wiki_page and receive wiki content
  3. Connection URL is visible and copyable in Settings
**Plans**: 05-01, 05-02, 05-03 — all complete

---

### Phase 06: Polish & Ship
**Goal**: Onboarding, packaging, and distribution of Notal v0.1.0.
**Depends on**: Phase 05
**Requirements**: DIST-01
**Success Criteria** (what must be TRUE):
  1. User can install Notal on Windows via NSIS installer
  2. Portable ZIP works without installation
  3. First-launch onboarding modal guides user through setup
**Plans**: 06-01, 06-02, 06-03, 06-04, 06-05, 06-06 — all complete

---

### Phase 07: Note Card Visual Redesign
**Goal**: The corkboard presents notes as small post-it cards with tag-color left borders, colored tag dots on every card, in-place hover-expand with user/AI bifurcation, and a patterns footer that fits at default window size.
**Depends on**: Phase 06
**Requirements**: CORK-01, CORK-02, CORK-03, CORK-04, PAT-01
**Success Criteria** (what must be TRUE):
  1. All notes display as compact square cards with text truncated — corkboard fills the view without scrolling
  2. Hovering a card expands it in-place showing full user text above and AI insights below (with scrollbar), without shifting other cards
  3. Each note card shows a left border colored to match its primary tag's wiki color — amber/emerald/red AI-state coloring is gone
  4. Every note card shows colored dot indicators for all its assigned tags, not just the most recently submitted note
  5. The Patterns page footer (note count, top topics, most active day) is fully visible at default 800x600 window size without scrolling
**Plans**: 2 plans
Plans:
- [x] 07-01-PLAN.md — Tags DB fix, aiInsights propagation, word cloud height reduction
- [ ] 07-02-PLAN.md — Compact card layout, tag-color border, hover-expand portal overlay

---

### Phase 08: Connections + Digest Improvements
**Goal**: Notes sharing a tag and similar sub-topics are visually connected by edges on the corkboard; the weekly digest pre-loads on open and uses a true rolling 7-day window.
**Depends on**: Phase 07
**Requirements**: CORK-05, PAT-02, PAT-03
**Success Criteria** (what must be TRUE):
  1. Notes that share a tag and have high embedding similarity show a visible connecting edge on the corkboard — no new AI calls required
  2. The weekly digest is present and populated when the Patterns tab is first opened — no blank state or manual Generate Now
  3. The weekly digest window advances daily: opening on Day 8 shows days 2–8, Day 9 shows days 3–9
**Plans**: TBD

---

### Phase 09: App Icon
**Goal**: The Notal app uses a custom illustrated icon throughout — taskbar, tray, installer, and About dialog.
**Depends on**: Phase 08
**Requirements**: ICON-01
**Success Criteria** (what must be TRUE):
  1. The app icon in the Windows taskbar and system tray shows the custom illustrated asset, not the placeholder geometric icon
  2. The NSIS installer uses the custom icon
  3. The icon renders cleanly at 16x16, 32x32, and 256x256 sizes
**Plans**: TBD
