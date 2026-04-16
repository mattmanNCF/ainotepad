# Phase 04: Search (AI Intelligence Depth + Local Model + Patterns Tab) - Research

**Researched:** 2026-04-16
**Domain:** node-llama-cpp v3, SQLite FTS5, Brave Search API, React word cloud, digest scheduling
**Confidence:** MEDIUM-HIGH (node-llama-cpp v3 API verified via official docs; Gemma 4 GGUF paths verified via HuggingFace)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Phase reframe: no user-facing search. SearchTab is renamed to **Patterns tab** — no query box, no search results list.
- AI insight layer: inline in note annotations, italics + different font color (exact color: Claude's discretion). Three types: Connections, Patterns, Novelty analysis.
- Threshold-based insights only — never generate an insight for its own sake.
- Retrieval: NO vector embeddings. Wiki graph traversal via `[[wikilinks]]` + SQLite FTS on note text + `_context.md`.
- Web search provider: **Brave Search API** only — no scraping fallbacks.
- Local model runtime: **llama.cpp via `node-llama-cpp`** — NOT Ollama. Self-contained, no external process.
- Default model: **Gemma 4 E4B** (the effective-4B variant of Gemma 4, a multimodal small model by Google).
- Model delivered on first launch, NOT bundled in installer.
- App scans common model paths (Ollama cache, LM Studio) before downloading.
- Patterns tab: word cloud + AI narrative + supporting stats. Daily/weekly toggle.

### Claude's Discretion
- Exact font color for insight annotations
- Exact RAM/VRAM thresholds for model tier recommendations
- Scheduling mechanism for overnight digest (node-cron vs launch-time elapsed-check)
- FTS5 vs SQLite LIKE (FTS5 preferred)
- Exact common paths to scan for existing models
- Word cloud library choice
- Exact model download source and resume behavior

### Deferred Ideas (OUT OF SCOPE)
- Ollama integration
- Embedding-based vector search (sqlite-vec already installed — do NOT use for Phase 04)
- Agent write-back to KB
- Cross-device sync
</user_constraints>

---

## Summary

Phase 04 has three independent delivery tracks that can be waved in parallel: (1) node-llama-cpp local model dispatch — the biggest technical lift, (2) retrieval-augmented insight layer in the AI worker, (3) Patterns tab replacing the SearchTab placeholder.

The node-llama-cpp integration is well-supported in Electron with electron-vite, but has one critical constraint: it can only run in the **main process** (or a utilityProcess that behaves like main process), and its file structure must NOT be bundled — it must be externalized just like `better-sqlite3`. The library handles GPU detection, VRAM balancing, and model downloads natively; no custom shell commands are needed.

Gemma 4 E4B is confirmed on HuggingFace as `unsloth/gemma-4-E4B-it-GGUF` with Q4_K_M at ~5GB. This is the right default model: 4.5B effective parameters, runs on 5GB RAM (4-bit), 128K context window.

The FTS5 retrieval layer is straightforward with better-sqlite3 but requires careful setup — use a standalone (non-content-table) FTS5 table and populate it explicitly on note insert, to avoid known transaction bugs with content-table triggers in better-sqlite3. A one-time backfill migration is required on first launch so existing notes are indexed.

**Primary recommendation:** Wave 1 = FTS5 schema + insight layer extensions to aiWorker. Wave 2 = node-llama-cpp install + local model dispatch + settings UI. Wave 3 = Patterns tab UI (word cloud + digest generation). Wave 4 = verification checkpoint.

---

## Standard Stack

### Core Additions
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| node-llama-cpp | 3.18.1 | Local GGUF model inference | Official llama.cpp Node.js bindings; auto GPU detect; built-in download API |
| d3-cloud | 1.2.9 | Word cloud layout engine | Maintained; no React 19 compatibility issues unlike react-wordcloud |
| react-d3-cloud | 1.0.6 | React wrapper for d3-cloud | Thin wrapper; sufficient for word cloud rendering |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| node-cron | 4.2.1 | Cron scheduling | Only if elapsed-check approach proves insufficient |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| d3-cloud + react-d3-cloud | react-wordcloud (1.2.7) | react-wordcloud is 3+ years stale, known React 18+ issues |
| d3-cloud + react-d3-cloud | @visx/wordcloud (3.12.0) | visx is well-maintained but heavier dependency tree; d3-cloud is simpler |
| elapsed-check on launch | node-cron | node-cron adds a dep; an on-launch elapsed-check is sufficient for "overnight" digests |

**Installation:**
```bash
npm install node-llama-cpp d3-cloud react-d3-cloud
npm install --save-dev @types/d3-cloud
```

**postinstall rebuild update (CRITICAL — Wave 0):**
```json
"postinstall": "electron-rebuild -f -w better-sqlite3,node-llama-cpp"
```

**Version verification (confirmed 2026-04-16):**
- node-llama-cpp: 3.18.1 (latest stable)
- d3-cloud: 1.2.9
- react-d3-cloud: 1.0.6

---

## Architecture Patterns

### Recommended Project Structure Additions
```
src/main/
├── aiWorker.ts          # Add: callLocal(), retrieval step in buildPrompt()
├── aiOrchestrator.ts    # Add: insights field to result, model init on startup
├── db.ts                # Add: notes_fts FTS5 table, digests table, ai_insights column
├── ipc.ts               # Add: Brave API key storage, local model path/tier
├── localModel.ts        # NEW: node-llama-cpp init, download, tier detection
└── digestScheduler.ts   # NEW: elapsed-check logic, digest generation trigger

src/renderer/src/components/
├── SearchTab.tsx         # REPLACE entirely with PatternsTab
├── PatternsTab.tsx       # NEW: word cloud + AI narrative + daily/weekly toggle
├── NoteCard.tsx          # EXTEND: render insights field
└── SettingsPanel.tsx     # EXTEND: Brave key + local model tier UI
```

### Pattern 1: node-llama-cpp v3 Core Flow
**What:** Load GGUF model, create context, run inference inside aiWorker.ts
**When to use:** When provider is 'local' (new provider value added to the existing provider enum)
**Critical constraint:** node-llama-cpp documentation explicitly states it can only run on the **main process** in Electron. The aiWorker runs as a `utilityProcess` (Node.js environment) — this is functionally equivalent to main process for module loading, so the restriction applies at the renderer/browser-process level only, not utilityProcess.

```typescript
// Source: https://node-llama-cpp.withcat.ai/guide/
import { getLlama, LlamaChatSession } from 'node-llama-cpp'

// getLlama() auto-detects GPU (CUDA > Vulkan > CPU fallback)
const llama = await getLlama()

const model = await llama.loadModel({
  modelPath: '/path/to/gemma-4-E4B-it-Q4_K_M.gguf'
})

const context = await model.createContext()
const session = new LlamaChatSession({
  contextSequence: context.getSequence()
})

// Grammar-enforced JSON output (eliminates code fence stripping)
const grammar = await llama.createGrammarForJsonSchema({ /* schema */ })
const result = await session.prompt(buildPrompt(rawText, contextMd, conceptSnippets), { grammar })
```

### Pattern 2: Model Download with Progress
**What:** Programmatic download of GGUF from HuggingFace with progress events
```typescript
// Source: https://node-llama-cpp.withcat.ai/api/functions/createModelDownloader
import { createModelDownloader } from 'node-llama-cpp'

const downloader = await createModelDownloader({
  modelUri: 'hf:unsloth/gemma-4-E4B-it-GGUF:Q4_K_M',
  dirPath: path.join(app.getPath('userData'), 'models')
})

// downloader.totalSize — use to show progress bar
// downloader.onProgress — event for % complete
const modelPath = await downloader.download()
// modelPath is the resolved absolute path to the .gguf file
```

### Pattern 3: FTS5 Virtual Table Setup (non-content-table approach)
**What:** Standalone FTS5 table populated via explicit INSERT in the notes:create path
**Why non-content-table:** better-sqlite3 has known transaction bugs (#654, #1003) when FTS5 triggers fire inside transactions. Standalone FTS5 with explicit INSERT avoids this.

```sql
-- Add to db.ts migration block
CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts
USING fts5(raw_text, note_id UNINDEXED);

-- On note insert in ipc.ts notes:create handler (after db.insert):
INSERT INTO notes_fts(raw_text, note_id) VALUES (rawText, id);

-- FTS5 query in aiOrchestrator retrieval step:
SELECT note_id, snippet(notes_fts, 0, '', '', '...', 20) as snippet
FROM notes_fts
WHERE notes_fts MATCH ?
ORDER BY rank
LIMIT 5;
```

**CRITICAL: FTS5 backfill migration for existing notes**
The FTS5 table is populated going forward on each `notes:create`, but users already have notes in the DB. A one-time backfill must run immediately after creating the virtual table:

```typescript
// In db.ts, immediately after CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts:
try {
  const count = sqlite.prepare('SELECT count(*) as n FROM notes_fts').get() as { n: number }
  if (count.n === 0) {
    sqlite.exec(`INSERT INTO notes_fts(raw_text, note_id)
                 SELECT raw_text, id FROM notes`)
  }
} catch {
  // Safe to ignore — backfill already done or table not yet created
}
```

### Pattern 4: Digest Table Schema
```sql
CREATE TABLE IF NOT EXISTS digests (
  id TEXT PRIMARY KEY,
  period TEXT NOT NULL,        -- 'daily' | 'weekly'
  period_start TEXT NOT NULL,  -- ISO date
  word_cloud_data TEXT NOT NULL, -- JSON: [{text, value}]
  narrative TEXT NOT NULL,
  stats TEXT NOT NULL,         -- JSON: {noteCount, topTags, mostActiveDay}
  generated_at TEXT NOT NULL
);
```

**CRITICAL: ai_insights column migration for notes table**
The insights field must be persisted in the notes table (same pattern as `ai_annotation` and `organized_text`). Add to db.ts migration block:

```typescript
// In db.ts, after existing ALTER TABLE migrations:
try {
  sqlite.exec('ALTER TABLE notes ADD COLUMN ai_insights TEXT')
} catch {
  // Column already exists — safe to ignore
}
```

Also extend `updateNoteAiResult()` in db.ts to accept and persist the insights field:

```typescript
export function updateNoteAiResult(
  noteId: string,
  aiState: 'complete' | 'failed',
  aiAnnotation: string | null,
  organizedText: string | null = null,
  tags: string = '[]',
  aiInsights: string | null = null   // NEW — backward-compatible default
): void {
  const db = getDb()
  db.update(notes)
    .set({ aiState, aiAnnotation, organizedText, tags, aiInsights })
    .where(eq(notes.id, noteId))
    .run()
}
```

The Drizzle schema (`drizzle/schema.ts`) also needs `aiInsights: text('ai_insights')` added to the notes table definition.

### Pattern 5: Insight Retrieval Step in aiOrchestrator.ts
**What:** Before posting the task message to aiWorker, pull related notes via FTS5 and wiki wikilinks
**Implementation:** The retrieval happens in the main process (aiOrchestrator.ts enqueueNote) since aiWorker.ts is a utilityProcess bundle without direct DB/kb access. Pass retrieved snippets as a new `relatedNotes` field in the task message.

```typescript
// In aiOrchestrator.ts enqueueNote() — extend existing context loading:
// 1. FTS5: query notes_fts with key terms from rawText (see FTS5 query above)
// 2. Wiki: read kbFiles, extract [[wikilinks]] from relevant pages
// 3. Pass as relatedNotes alongside contextMd and conceptSnippets
workerPort.postMessage({
  type: 'task', noteId, rawText, contextMd, conceptSnippets, relatedNotes
})
```

### Pattern 6: Elapsed-Check Digest Scheduler
**What:** On app launch, check if a digest is needed — no cron dependency
```typescript
// digestScheduler.ts
import { getDb } from './db'
import { BrowserWindow } from 'electron'

export function checkAndScheduleDigest(win: BrowserWindow): void {
  const db = getDb()
  const lastDigest = db.prepare(
    `SELECT generated_at FROM digests WHERE period='daily' ORDER BY generated_at DESC LIMIT 1`
  ).get() as { generated_at: string } | undefined

  const now = new Date()
  const lastRun = lastDigest ? new Date(lastDigest.generated_at) : new Date(0)
  const hoursElapsed = (now.getTime() - lastRun.getTime()) / (1000 * 60 * 60)

  // Generate if >20 hours have elapsed (covers overnight gap)
  if (hoursElapsed >= 20) {
    // Post a digest task to the worker via workerPort
    // Worker generates narrative and returns via taskPort
    // Result stored in digests table; renderer notified via 'digest:updated' IPC
  }
}
```

### Pattern 7: Insight Result Shape Extension
**What:** Add `insights` field to the AI result JSON and IPC result message
```typescript
// aiWorker.ts — extend parsed result type:
const parsed = JSON.parse(result) as {
  organized: string
  annotation: string
  wiki_updates: Array<{ file: string; content: string }>
  tags: string[]
  insights: string | null  // NEW — null if nothing worth surfacing
}

// IPC result message — extend:
taskPort!.postMessage({
  type: 'result',
  noteId: task.noteId,
  // ... existing fields ...
  insights: parsed.insights ?? null,  // NEW
})

// aiOrchestrator.ts — read from result and persist:
const { insights } = event.data
updateNoteAiResult(noteId, aiState, aiAnnotation, organizedText, tagsJson, insights ?? null)

// note:aiUpdate IPC push — add insights so NoteCard can display immediately:
mainWin.webContents.send('note:aiUpdate', { noteId, aiState, aiAnnotation, organizedText, tags, insights })
```

### Pattern 8: NoteCard Insight Rendering
**What:** Render insights with italics + amber/gold color to signal "AI speaking" (distinct from blue annotation)
```tsx
{note.insights && (
  <p className="mt-2 text-xs italic text-amber-400/60 border-t border-white/5 pt-2 leading-relaxed">
    {note.insights}
  </p>
)}
```
Amber/gold (`text-amber-400/60`) distinguishes from the existing blue annotation (`text-blue-400/70`) while remaining readable on the dark background.

### Pattern 9: Hardware Tier Detection
**What:** RAM-based tier recommendation; VRAM detection delegated to node-llama-cpp's auto-balancing
```typescript
import os from 'os'

export function detectModelTier(): 'large' | 'default' | 'small' {
  const ramGB = os.totalmem() / (1024 ** 3)
  if (ramGB >= 16) return 'large'    // Q5_K_M (5.48 GB)
  if (ramGB >= 8)  return 'default'  // Q4_K_M (4.98 GB)
  return 'small'                      // Q3_K_M (4.06 GB)
}
// VRAM: node-llama-cpp getLlama() auto-detects and offloads as many layers as fit.
// Catch InsufficientMemoryError and retry with gpuLayers: 0 (CPU fallback).
```

**Tier-to-model map (Gemma 4 E4B, unsloth/gemma-4-E4B-it-GGUF):**
| Tier | RAM | Quantization | File Size | URI |
|------|-----|-------------|-----------|-----|
| small | <8 GB | Q3_K_M | 4.06 GB | `hf:unsloth/gemma-4-E4B-it-GGUF:Q3_K_M` |
| default | 8-16 GB | Q4_K_M | 4.98 GB | `hf:unsloth/gemma-4-E4B-it-GGUF:Q4_K_M` |
| large | >16 GB | Q5_K_M | 5.48 GB | `hf:unsloth/gemma-4-E4B-it-GGUF:Q5_K_M` |

### Pattern 10: Existing Model Scan Paths (Windows)
```typescript
import os from 'os'
import path from 'path'
import fs from 'fs'

// LM Studio retains original filenames — reliable scan target.
// Ollama blobs are SHA256-named with no .gguf extension — NOT scannable as GGUFs. Skip.
const SCAN_PATHS = [
  path.join(os.homedir(), 'AppData', 'Local', 'LMStudio', 'models'),
  path.join(os.homedir(), '.cache', 'lm-studio', 'models'),
  // User-specified custom path (from settings — stored in electron-conf)
]

// Walk SCAN_PATHS for any *.gguf file whose name includes 'gemma-4' or 'gemma4'
function findExistingGemma4(): string | null {
  for (const dir of SCAN_PATHS) {
    if (!fs.existsSync(dir)) continue
    // Recursive readdir scan; case-insensitive match on filename
    // Return first hit; let user confirm in Settings UI
  }
  return null
}
```

### Anti-Patterns to Avoid
- **Bundling node-llama-cpp:** The library's file structure is crucial for native binary resolution. Must be added to `externalizeDeps` in `electron.vite.config.ts` for both main and worker builds.
- **Using content-table FTS5 with triggers in better-sqlite3:** Known transaction bugs. Use standalone FTS5 with explicit INSERT in the notes:create path instead.
- **Calling getLlama() at module load time:** Init is async; must be called lazily (first use) or during startup after `app.whenReady()`.
- **Running inference in renderer process:** node-llama-cpp only works in main process environment. The existing utilityProcess pattern is correct.
- **Blocking main process during model load:** Model loading takes 2-30 seconds. Must happen in utilityProcess (aiWorker) asynchronously.
- **Skipping FTS5 backfill:** Without backfill migration, FTS retrieval returns nothing for all notes created before Phase 04.
- **Scanning Ollama blob paths for GGUF files:** Ollama uses content-addressed SHA256 naming; files cannot be identified as specific models without reading internal metadata.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| GGUF model inference | Custom llama.cpp bindings | node-llama-cpp v3 | ABI management, GPU detection, VRAM balancing, stream/sync modes all built in |
| Model file download with resume | Custom fetch + file write | node-llama-cpp `createModelDownloader` | Handles split GGUF files, parallel connections, resume, HuggingFace auth |
| JSON-constrained LLM output | Strip code fences manually | node-llama-cpp grammar API | Grammar enforcement at generation level — no post-processing needed |
| VRAM detection | Shell command for GPU info | node-llama-cpp auto-balancing + `InsufficientMemoryError` catch | No standard Node.js VRAM API; llama.cpp has built-in VRAM estimator |
| Word cloud layout | D3 from scratch | react-d3-cloud + d3-cloud | Word placement algorithm (force simulation) is non-trivial |
| Hardware GPU detection | OS-level queries | node-llama-cpp `getLlama()` auto-detect | Auto-selects CUDA > Vulkan > CPU; no manual config needed |
| Tag frequency aggregation | Complex JS | SQLite query + JS reduce | Tags stored as JSON TEXT; simple parse + count in db query |

**Key insight:** node-llama-cpp v3 is a batteries-included runtime — download, memory estimation, GPU detection, JSON grammar, and context management are all built in. Don't replicate any of these.

---

## Common Pitfalls

### Pitfall 1: node-llama-cpp bundled into ASAR
**What goes wrong:** Native binaries (.node files) lose their relative paths when packed into ASAR; model loading fails at runtime with module not found errors.
**Why it happens:** electron-vite bundles everything by default unless externalized.
**How to avoid:** Add `node-llama-cpp` to `externalizeDeps` in `electron.vite.config.ts` for both main and worker builds. Add `asarUnpack: ["node_modules/node-llama-cpp/**/*"]` to electron-builder config.
**Warning signs:** Works in `npm run dev` but fails in built/packaged app.

### Pitfall 2: postinstall only rebuilds better-sqlite3
**What goes wrong:** node-llama-cpp native modules aren't rebuilt for the current Electron ABI, causing "was compiled against a different Node.js version" errors.
**Why it happens:** Current `postinstall` is `-w better-sqlite3` only.
**How to avoid:** Update `postinstall` to `-w better-sqlite3,node-llama-cpp` before any other work (Wave 0 task).
**Warning signs:** Import succeeds but `getLlama()` throws ABI mismatch error.

### Pitfall 3: FTS5 content-table + triggers with better-sqlite3
**What goes wrong:** FTS5 triggers fire inside the notes:create transaction, causing "cannot commit - no transaction is active" errors (better-sqlite3 issues #654, #1003).
**Why it happens:** better-sqlite3 wraps synchronous operations; the FTS trigger fires at an unexpected point in the transaction lifecycle.
**How to avoid:** Use standalone FTS5 (no `content=notes` parameter). After `db.insert(notes)...run()`, call a separate `db.prepare('INSERT INTO notes_fts...').run(rawText, id)`.
**Warning signs:** Notes save but FTS insert throws intermittently.

### Pitfall 4: Model load blocks utilityProcess message handling
**What goes wrong:** `getLlama()` and `llama.loadModel()` are async but take 5-30 seconds. If called synchronously at worker startup, the port message handler isn't registered yet — tasks queued before load completes are dropped.
**Why it happens:** Worker init flow assumes callAI() is immediately available.
**How to avoid:** Separate model init from task handling. Queue tasks during model init; drain after init completes. Or: init model lazily on first task, hold queue until ready.

### Pitfall 5: Brave Search API no longer has a free tier
**What goes wrong:** Users who haven't added a Brave API key get confusing error messages.
**Why it happens:** Brave removed the free tier in 2025; it's now $5/1000 queries (credit-based). Users must explicitly sign up.
**How to avoid:** Graceful degradation is already in the design — if no Brave key configured, type-3 insights (novelty) are silently skipped. Settings UI must label Brave key as "optional — enables web search insights."
**Rate limit:** 1 req/sec on base tier.

### Pitfall 6: Gemma 4 E4B is multimodal — text-only prompts work fine
**What goes wrong:** Confusion about model capabilities; concern about prompt format.
**Why it happens:** Gemma 4 E4B supports text + image + audio, but for text-only use (our case) it behaves as a standard instruct model.
**How to avoid:** Use the `-it` (instruct-tuned) GGUF variant from unsloth. Standard chat/instruct prompt format applies. Grammar-enforced JSON output works normally.

### Pitfall 7: Ollama blob paths are not usable as GGUF files
**What goes wrong:** A scan of `~/.ollama/models/blobs/` finds files, but they are SHA256-named blobs without the `.gguf` extension — they cannot be passed to `llama.loadModel()`.
**Why it happens:** Ollama stores models in its own content-addressed format.
**How to avoid:** Skip Ollama blob paths in the model scan entirely. Only scan LM Studio paths (which retain original filenames) and user-specified custom paths.

### Pitfall 8: Missing FTS5 backfill leaves existing notes invisible to retrieval
**What goes wrong:** The insights layer never finds connections to past notes; FTS retrieval returns 0 results on first session after upgrade.
**Why it happens:** The FTS5 INSERT is in the notes:create path — old rows were never inserted into notes_fts.
**How to avoid:** Add a one-time backfill in db.ts immediately after creating the `notes_fts` virtual table (see Pattern 3 above).

---

## Code Examples

Verified patterns from official sources:

### Local Model Dispatch in aiWorker.ts
```typescript
// Source: https://node-llama-cpp.withcat.ai/guide/
import { getLlama, LlamaChatSession } from 'node-llama-cpp'

let llamaInstance: Awaited<ReturnType<typeof getLlama>> | null = null
let llamaModel: any = null
let llamaContext: any = null
let llamaSession: any = null

async function initLocalModel(modelPath: string): Promise<void> {
  llamaInstance = await getLlama()
  llamaModel = await llamaInstance.loadModel({ modelPath })
  llamaContext = await llamaModel.createContext()
  llamaSession = new LlamaChatSession({ contextSequence: llamaContext.getSequence() })
}

async function callLocal(rawText: string, contextMd: string, conceptSnippets: string): Promise<string> {
  if (!llamaSession) throw new Error('Local model not initialized')
  const grammar = await llamaInstance!.createGrammarForJsonSchema({
    type: 'object',
    properties: {
      organized: { type: 'string' },
      annotation: { type: 'string' },
      insights: { type: ['string', 'null'] },
      wiki_updates: { type: 'array' },
      tags: { type: 'array' }
    }
  })
  return llamaSession.prompt(buildPrompt(rawText, contextMd, conceptSnippets), { grammar })
}
```

### FTS5 Query for Retrieval
```typescript
// In aiOrchestrator.ts enqueueNote() — after existing context loading:
function queryRelatedNotes(rawText: string): string[] {
  const db = getDb()
  const terms = rawText.split(/\s+/).slice(0, 10).join(' OR ')
  try {
    const rows = db.prepare(
      `SELECT note_id, snippet(notes_fts, 0, '', '', '...', 20) as snip
       FROM notes_fts WHERE notes_fts MATCH ? ORDER BY rank LIMIT 5`
    ).all(terms) as Array<{ note_id: string; snip: string }>
    return rows.map(r => r.snip)
  } catch {
    return []
  }
}
```

### Brave Search API Call (inside aiWorker.ts)
```typescript
// Source: https://api.search.brave.com/res/v1/web/search
async function searchBrave(query: string, apiKey: string): Promise<string> {
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`
  const resp = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'X-Subscription-Token': apiKey
    }
  })
  if (!resp.ok) throw new Error(`Brave search error: ${resp.status}`)
  const data = await resp.json() as {
    web?: { results?: Array<{ title: string; description: string }> }
  }
  return (data.web?.results ?? [])
    .slice(0, 5)
    .map(r => `${r.title}: ${r.description}`)
    .join('\n')
}
```

### Word Cloud Data Aggregation (tag frequency from notes table)
**What:** Build the `[{text, value}]` input for the word cloud by counting tag occurrences in the period window.
```typescript
// In digestScheduler.ts — run for the period window:
function buildWordCloudData(since: string): Array<{ text: string; value: number }> {
  const db = getDb()
  // tags column is a JSON TEXT array (e.g. '["physics","TOT"]')
  const rows = db.prepare(
    `SELECT tags FROM notes WHERE hidden=0 AND submitted_at >= ? AND ai_state='complete'`
  ).all(since) as Array<{ tags: string }>

  const counts: Record<string, number> = {}
  for (const row of rows) {
    let tags: string[] = []
    try { tags = JSON.parse(row.tags) } catch { continue }
    for (const tag of tags) {
      counts[tag] = (counts[tag] ?? 0) + 1
    }
  }

  return Object.entries(counts)
    .filter(([, v]) => v > 0)
    .map(([text, value]) => ({ text, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 50)  // cap at 50 words for readable cloud
}
```

### Word Cloud Component
```tsx
// Source: https://github.com/Yoctol/react-d3-cloud
import WordCloud from 'react-d3-cloud'

interface WordDatum { text: string; value: number }

function PatternsWordCloud({ words }: { words: WordDatum[] }) {
  return (
    <WordCloud
      data={words}
      width={400}
      height={300}
      font="sans-serif"
      fontSize={(w) => Math.log2(w.value) * 8 + 12}
      rotate={0}
      padding={4}
      fill={(_w, i) => ['#6366f1', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6'][i % 5]}
    />
  )
}
```

### electron.vite.config.ts — Add node-llama-cpp to externals
```typescript
// In electron.vite.config.ts, for both main and worker build configs:
// 1. externalizeDepsPlugin already handles most dependencies automatically
// 2. Ensure node-llama-cpp appears in rollupOptions.external alongside better-sqlite3:
external: ['better-sqlite3', 'node-llama-cpp', 'electron']
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Ollama process dependency | node-llama-cpp embedded | Phase 04 decision | No external process; app fully self-contained |
| Frontier-API-only AI | Local model priority | Phase 04 decision | Privacy-first; offline-capable |
| Manual JSON cleanup (strip fences) | Grammar-enforced JSON | node-llama-cpp v3 | Eliminates parse errors from local models |
| Free Brave API tier (2000/month) | Credit-based ($5/1000 queries) | 2025 | Users must sign up; optional feature |
| react-wordcloud (legacy) | react-d3-cloud + d3-cloud | 2023+ | React 18/19 compatible; maintained |

**Deprecated/outdated:**
- `react-wordcloud` (1.2.7): Last published 3+ years ago. React 19 compatibility unverified. Do not use.
- FTS5 content-table with triggers: Broken in better-sqlite3 for transactional inserts. Use standalone FTS5.
- Shell-based VRAM detection (platform-specific commands): Deprecated in Windows 11; unreliable. Not needed — node-llama-cpp handles VRAM internally.

---

## Gemma 4 E4B Model Reference

**HuggingFace repo:** `unsloth/gemma-4-E4B-it-GGUF`
**Model:** Google Gemma 4, 4.5B effective parameters (MoE), 128K context, instruct-tuned
**Confirmed GGUF quantizations (as of 2026-04-16):**

| Tier | Quantization | File | Size | RAM Needed |
|------|-------------|------|------|-----------|
| small | Q3_K_M | gemma-4-E4B-it-Q3_K_M.gguf | 4.06 GB | ~6 GB |
| default | Q4_K_M | gemma-4-E4B-it-Q4_K_M.gguf | 4.98 GB | ~7 GB |
| large | Q5_K_M | gemma-4-E4B-it-Q5_K_M.gguf | 5.48 GB | ~8 GB |
| quality | Q8_0 | gemma-4-E4B-it-Q8_0.gguf | 8.19 GB | ~10 GB |

**node-llama-cpp download URI scheme:**
- `hf:unsloth/gemma-4-E4B-it-GGUF:Q4_K_M` (default tier)
- `hf:unsloth/gemma-4-E4B-it-GGUF:Q3_K_M` (small tier)
- `hf:unsloth/gemma-4-E4B-it-GGUF:Q5_K_M` (large tier)

**Confidence:** HIGH — verified at https://huggingface.co/unsloth/gemma-4-E4B-it-GGUF

---

## Brave Search API Reference

**Endpoint:** `https://api.search.brave.com/res/v1/web/search`
**Auth header:** `X-Subscription-Token: <key>`
**Rate limits:** 1 req/sec (base), 5 req/sec (Pro)
**Pricing:** $5/1000 queries (credit-based, no true free tier as of 2025)
**Graceful degradation:** If key absent — skip type-3 insights silently — already in design

---

## Electron Builder / ASAR Configuration

node-llama-cpp requires its file structure intact (not bundled). Key requirement from official docs:

> "It's important to make sure that the native binaries are not packed into the ASAR archive."

Add `asarUnpack` pattern to `electron-builder.yml` or `package.json` build config:

```json
"build": {
  "asarUnpack": [
    "node_modules/node-llama-cpp/**/*"
  ]
}
```

**Confidence:** MEDIUM — pattern is standard per electron-builder docs, but the exact glob may need adjustment after testing. The node-llama-cpp official docs recommend examining their scaffolded `electron-builder.ts` template for the exact configuration.

---

## Open Questions

1. **utilityProcess vs main process for node-llama-cpp**
   - What we know: Official docs say "main process only" — this means not the renderer/browser process. utilityProcess runs Node.js, functionally equivalent.
   - What's unclear: Whether any node-llama-cpp internal path resolution depends on `process.type === 'browser'` checks vs `'utility'`.
   - Recommendation: Test `getLlama()` in existing aiWorker.ts (utilityProcess) in Wave 2 first task. If it fails with a process-type error, move model loading to main process and IPC the results. The `@electron/llm` package (Electron official) explicitly uses utilityProcess + Mojo IPC — this strongly suggests utilityProcess works.

2. **Digest generation latency with local model**
   - What we know: Gemma 4 E4B on CPU may take 30-120 seconds for a digest narrative (~500 tokens).
   - What's unclear: Whether overnight digest should block or fire silently in background.
   - Recommendation: Digest generation fires entirely in aiWorker (background), result stored in DB, renderer notified via `digest:updated` IPC push. No blocking.

3. **Insight threshold — how to guide the model**
   - What we know: User wants high-signal-only insights; the design says "inform of something that might have been missed."
   - What's unclear: Whether prompt engineering alone achieves the threshold reliably with a 4B model.
   - Recommendation: Add explicit instruction in insight section of buildPrompt: "Return insights as null unless you have a specific, non-obvious connection or observation. Generic observations should be null." Monitor in verification checkpoint.

---

## Sources

### Primary (HIGH confidence)
- https://node-llama-cpp.withcat.ai/guide/ — v3 API: getLlama, loadModel, createContext, LlamaChatSession
- https://node-llama-cpp.withcat.ai/guide/electron — Electron integration constraints, ASAR, externalization
- https://node-llama-cpp.withcat.ai/api/functions/createModelDownloader — download API, URI scheme
- https://huggingface.co/unsloth/gemma-4-E4B-it-GGUF — Gemma 4 E4B GGUF quantization variants + file sizes
- https://api.search.brave.com — Brave Search API endpoint (from official dashboard docs)

### Secondary (MEDIUM confidence)
- https://github.com/WiseLibs/better-sqlite3/issues/654 — FTS5 trigger transaction bug
- https://github.com/WiseLibs/better-sqlite3/issues/1003 — FTS trigger in transaction bug
- https://www.npmjs.com/package/react-d3-cloud — react-d3-cloud maintained status
- https://www.implicator.ai/brave-drops-free-search-api-tier-puts-all-developers-on-metered-billing/ — Brave free tier removal

### Tertiary (LOW confidence)
- @electron/llm npm package (referenced in search results) uses utilityProcess — suggests utilityProcess compatibility with node-llama-cpp, but not directly verified in docs

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions confirmed via npm registry 2026-04-16
- node-llama-cpp v3 API: HIGH — verified via official docs
- Gemma 4 E4B GGUF: HIGH — verified at HuggingFace repo
- Architecture: MEDIUM — patterns derived from official docs + codebase analysis; utilityProcess compatibility needs empirical verification
- Pitfalls: HIGH (FTS5 trigger bugs confirmed in GH issues); MEDIUM (ASAR asarUnpack exact glob needs testing)
- Brave API: HIGH (endpoint confirmed); pricing change confirmed via multiple sources

**Research date:** 2026-04-16
**Valid until:** 2026-05-16 (node-llama-cpp moves fast; Gemma 4 GGUF availability stable)
