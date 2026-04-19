# Requirements: Notal

**Defined:** 2026-04-17
**Core Value:** Every note is silently enriched by AI and grows into a searchable knowledge base — zero friction, zero prompting.

## v1.0 Requirements (Validated — Shipped)

### Note Capture
- ✓ **CAP-01**: User submits a note by pressing Enter — v1.0 Phase 01
- ✓ **CAP-02**: Note is immediately visible in the notes list while AI processes — v1.0 Phase 01

### AI Pipeline
- ✓ **AI-01**: AI automatically tags, organizes, and adds insights to every submitted note — v1.0 Phase 02
- ✓ **AI-02**: AI integrates each note into the Karpathy-style wiki — v1.0 Phase 03
- ✓ **AI-03**: User can configure Claude or OpenAI API key in settings — v1.0 Phase 02
- ✓ **AI-04**: User can use Ollama local models as an AI provider — v1.0 Phase 04

### Wiki / KB
- ✓ **WIKI-01**: User can browse the auto-generated wiki by topic — v1.0 Phase 03
- ✓ **WIKI-02**: User can assign and customize tag colors in the wiki sidebar — v1.0 Phase 03

### Search & Patterns
- ✓ **SRCH-01**: User can search notes by full-text and semantic similarity — v1.0 Phase 04
- ✓ **PAT-00**: Patterns tab shows word cloud, daily/weekly AI narrative, and note statistics — v1.0 Phase 04

### Agent Connectivity
- ✓ **AGNT-01**: External MCP-compatible agents can read recent notes and wiki pages via local HTTP — v1.0 Phase 05

### Distribution
- ✓ **DIST-01**: User can install Notal on Windows via NSIS installer or portable ZIP — v1.0 Phase 06

---

## v1.1 Requirements — Corkboard Polish

### Corkboard View

- [x] **CORK-01**: Notes display as small square post-it cards with text truncated to fit compact size
- [x] **CORK-02**: Hovering a note brings it to foreground and expands it — showing full user text and AI insights with user/AI bifurcation and scrollbar, without moving other cards
- [x] **CORK-03**: Note left border color reflects the primary tag's wiki color (replacing AI-state amber/emerald/red)
- [x] **CORK-04**: All notes display colored dot indicators for every assigned tag (currently only most recent note shows dots)
- [x] **CORK-05**: Notes sharing a tag that also discuss similar sub-topics are connected by visible edges on the corkboard (using existing sqlite-vec embeddings — no new AI calls)

### Patterns Page

- [ ] **PAT-01**: Patterns page footer (note count, top topics, most active day) is fully visible at default window size without scrolling
- [x] **PAT-02**: Weekly AI summary pre-generates on first open — no blank/Generate-Now state
- [x] **PAT-03**: Weekly digest uses a rolling 7-day window that updates daily (Day 8 = days 2–8, Day 9 = days 3–9)

### App Icon

- [x] **ICON-01**: App icon replaced with custom illustrated asset (ChatGPT-generated image from user's Downloads folder, or commissioned art)

---

## v2 Requirements (Deferred)

### AI Performance
- **PERF-01**: Ollama inference latency reduced via streaming partial results
- **PERF-02**: Local model auto-selection based on available VRAM

### New Capabilities
- **CAP-03**: Agent write-back — external agents can append notes or wiki entries
- **CAP-04**: llama.cpp bundled local model (no separate Ollama install required)
- **SYNC-01**: Cross-device note sync via user-provided storage (S3-compatible)

---

## Out of Scope

| Feature | Reason |
|---------|--------|
| Cross-device sync | Local-first by design — never |
| Mobile companion | Desktop-only for v1.x |
| AI performance improvements (Ollama) | Primary bottleneck is Ollama runtime — out of our control for v1.1 |
| New AI capabilities (summarization, Q&A) | v1.2+ capability milestone |
| Agent new features | v1.2+ capability milestone |

---

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| CORK-01 | Phase 07 | Complete |
| CORK-02 | Phase 07 | Complete |
| CORK-03 | Phase 07 | Complete |
| CORK-04 | Phase 07 | Complete |
| CORK-05 | Phase 08 | Complete |
| PAT-01 | Phase 07 | Pending |
| PAT-02 | Phase 08 | Complete |
| PAT-03 | Phase 08 | Complete |
| ICON-01 | Phase 09 | Complete |

**Coverage:**
- v1.1 requirements: 9 total
- Mapped to phases: 9
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-17*
*Last updated: 2026-04-17 — milestone v1.1 Corkboard Polish*
