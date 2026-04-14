# Phase 02: AI Pipeline - Research

**Researched:** 2026-04-14
**Domain:** Electron utilityProcess, AI SDK integration, settings persistence, IPC push
**Confidence:** HIGH

---

## Summary

Phase 02 wires the silent AI processing loop into the existing AInotepad scaffold. Every note submitted by the user (already saved to SQLite with `aiState: 'pending'`) must trigger an API call to Claude or OpenAI, write the result back to SQLite, and push a real-time update to the renderer. The architecture decision is already locked in STATE.md: Electron utilityProcess + MessagePort for the AI worker, `@anthropic-ai/sdk` and `openai` SDKs for the two providers, and `safeStorage` + `electron-conf` for API key storage.

The key technical challenges are: (1) correctly building the worker as a separate entry point in electron-vite so `path.join(__dirname, 'worker.js')` resolves at runtime; (2) avoiding the ESM/CJS collision with electron-store by using `electron-conf` instead; (3) implementing a serial queue in the worker so burst note submissions don't fire N simultaneous API calls; (4) pushing `aiState` updates from main process to renderer via `mainWindow.webContents.send()`; (5) re-queuing any notes that were `pending` when the app starts (crash recovery).

**Primary recommendation:** Use the multi-entry `rollupOptions.input` pattern in `electron.vite.config.ts` to build `src/main/aiWorker.ts` as a separate CJS output; fork it with `utilityProcess.fork(path.join(__dirname, 'aiWorker.js'))`; communicate via `process.parentPort` in the worker; push renderer updates via `mainWindow.webContents.send('note:aiUpdate', {...})`.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@anthropic-ai/sdk` | 0.89.0 (npm latest) | Claude API client | Official Anthropic SDK; works in Node.js main/utility process; no native addons |
| `openai` | 6.34.0 (npm latest) | OpenAI API client | Official OpenAI SDK; pure JS, no native addons |
| `electron-conf` | latest (~1.x) | Persistent settings (API key, provider) | CJS+ESM dual, TypeScript, by electron-vite author; replaces electron-store which is ESM-only |
| `electron` built-in `safeStorage` | (Electron 39 bundled) | Encrypt API key on disk | OS-level encryption (DPAPI on Windows, Keychain on macOS); no extra package needed |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `electron` built-in `MessageChannelMain` | (bundled) | IPC between main ↔ utility process | Used to create the port pair passed to the worker |
| `electron` built-in `ipcMain` / `webContents.send` | (bundled) | Push updates to renderer | For notifying renderer when AI result arrives |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `electron-conf` | `electron-store` v11 | electron-store is ESM-only; electron-vite bundles to CJS; dynamic import workaround is fragile |
| `electron-conf` | `electron-settings` | electron-conf is by the electron-vite author, better maintained, typed |
| `electron-conf` | Raw `fs` + JSON file | electron-conf handles atomic writes, schema validation, migrations for free |
| utilityProcess | `worker_threads` | worker_threads can't make outbound HTTP calls natively (need `fetch`); utilityProcess has full Node.js + fetch |
| utilityProcess | `child_process.fork` | utilityProcess is the Electron-native API; supports MessagePort to renderer; preferred over raw fork |

**Installation:**
```bash
npm install @anthropic-ai/sdk openai electron-conf
```

**Version verification (confirmed against npm registry 2026-04-14):**
- `@anthropic-ai/sdk`: 0.89.0 (verified via `npm view @anthropic-ai/sdk version`)
- `openai`: 6.34.0 (verified via `npm view openai version`)
- `electron-conf`: run `npm view electron-conf version` at install time

> Note: Both AI SDKs are pure TypeScript/JavaScript packages with no native addons — they can be bundled or left external (external is fine since electron-builder packages node_modules). Keep them in `dependencies`, not `devDependencies`.

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── main/
│   ├── index.ts          # (existing) app bootstrap, createWindow, tray
│   ├── db.ts             # (existing) SQLite init — ADD updateNoteAiResult()
│   ├── ipc.ts            # (existing) notes:getAll, notes:create — ADD settings:save, settings:get
│   ├── aiWorker.ts       # NEW: utility process worker — API calls, serial queue, parentPort
│   └── aiOrchestrator.ts # NEW: forks worker, wires MessagePort, handles callbacks, startup re-queue
├── preload/
│   └── index.ts          # ADD: onAiUpdate listener, settings IPC exposure
└── renderer/
    └── src/
        ├── components/
        │   ├── NoteCard.tsx        # (existing) already shows aiState/aiAnnotation
        │   ├── NotesTab.tsx        # ADD: listen for note:aiUpdate IPC push
        │   └── SettingsPanel.tsx   # NEW: API key input + provider selector
        └── App.tsx                 # ADD: Settings gear icon / overlay
```

### Pattern 1: Utility Process with Multi-Entry electron-vite Build

**What:** Build `aiWorker.ts` as a separate Rollup entry so it gets its own output file at `out/main/aiWorker.js`. Fork it with `utilityProcess.fork(path.join(__dirname, 'aiWorker.js'))`.

**When to use:** Always — `?modulePath` suffix works for worker_threads but the multi-entry `rollupOptions.input` approach is the documented pattern for utilityProcess.

**electron.vite.config.ts addition:**
```typescript
// Source: https://github.com/electron-vite/electron-vite-react/issues/183
main: {
  build: {
    rollupOptions: {
      external: ['better-sqlite3', 'sqlite-vec'],
      input: {
        index: resolve(__dirname, 'src/main/index.ts'),
        aiWorker: resolve(__dirname, 'src/main/aiWorker.ts'),
      }
    }
  }
}
```

After build, `out/main/aiWorker.js` exists and `__dirname` in `index.js` resolves to `out/main/` — so `path.join(__dirname, 'aiWorker.js')` works in both dev and production.

### Pattern 2: Forking and MessagePort Wiring

**What:** Main process forks the worker, creates a MessageChannelMain, and sends one port to the worker. All task dispatch and results flow over that port.

**Example (aiOrchestrator.ts):**
```typescript
// Source: https://www.electronjs.org/docs/latest/api/utility-process
import { utilityProcess, MessageChannelMain, BrowserWindow } from 'electron'
import path from 'path'

let workerPort: Electron.MessagePortMain | null = null

export function startAiWorker(win: BrowserWindow): void {
  const child = utilityProcess.fork(path.join(__dirname, 'aiWorker.js'))
  const { port1, port2 } = new MessageChannelMain()

  // Send port2 to worker (worker uses process.parentPort to receive it)
  child.postMessage({ type: 'init', port: port2 }, [port2])

  workerPort = port1
  port1.start()

  port1.on('message', (event) => {
    const { type, noteId, aiState, aiAnnotation } = event.data
    if (type === 'result') {
      // 1. Write back to SQLite
      updateNoteAiResult(noteId, aiState, aiAnnotation)
      // 2. Push to renderer (safe even when window is hidden)
      if (!win.webContents.isDestroyed()) {
        win.webContents.send('note:aiUpdate', { noteId, aiState, aiAnnotation })
      }
    }
  })
}

export function enqueueNote(noteId: string, rawText: string): void {
  workerPort?.postMessage({ type: 'task', noteId, rawText })
}
```

**Example (aiWorker.ts) — use static imports, not dynamic:**
```typescript
// Source: https://www.electronjs.org/docs/latest/api/utility-process
// IMPORTANT: Use static imports. aiWorker is built as its own Rollup entry,
// so all imports are resolved at bundle time. Dynamic imports add per-call latency.
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'

// Use Electron.MessagePortMain type (NOT the web MessagePort interface)
let taskPort: Electron.MessagePortMain | null = null
let provider: string = 'claude'
let apiKey: string = ''
const queue: Array<{ noteId: string; rawText: string }> = []
let processing = false

process.parentPort.on('message', (e) => {
  const { type } = e.data
  if (type === 'init') {
    provider = e.data.provider
    apiKey = e.data.apiKey
    taskPort = e.ports[0]  // Electron.MessagePortMain from MessageChannelMain
    taskPort.onmessage = handleMessage
    taskPort.start()        // REQUIRED: port is paused until start() is called
  }
})

function handleMessage(event: MessageEvent): void {
  const { type, noteId, rawText } = event.data
  if (type === 'task') {
    queue.push({ noteId, rawText })
    if (!processing) drain()
  }
}

async function drain(): Promise<void> {
  processing = true
  while (queue.length > 0) {
    const task = queue.shift()!
    try {
      const result = await callAI(task.rawText)
      taskPort!.postMessage({ type: 'result', noteId: task.noteId, aiState: 'complete', aiAnnotation: result })
    } catch (err) {
      taskPort!.postMessage({ type: 'result', noteId: task.noteId, aiState: 'failed', aiAnnotation: null })
    }
  }
  processing = false
}
```

### Pattern 3: IPC Push — Main → Renderer

**What:** Use `mainWindow.webContents.send(channel, payload)` to push updates. Renderer listens via `ipcRenderer.on()` exposed through the preload.

**Preload addition:**
```typescript
// src/preload/index.ts
contextBridge.exposeInMainWorld('api', {
  notes: { ... },  // existing
  onAiUpdate: (cb: (data: { noteId: string; aiState: string; aiAnnotation: string | null }) => void) => {
    ipcRenderer.on('note:aiUpdate', (_event, data) => cb(data))
  },
  settings: {
    save: (key: string, provider: string) => ipcRenderer.invoke('settings:save', { key, provider }),
    get: () => ipcRenderer.invoke('settings:get'),
  }
})
```

**NotesTab.tsx addition:**
```typescript
// On mount, subscribe to AI updates
useEffect(() => {
  window.api.onAiUpdate(({ noteId, aiState, aiAnnotation }) => {
    setNotes(prev => prev.map(n =>
      n.id === noteId ? { ...n, aiState: aiState as NoteRecord['aiState'], aiAnnotation } : n
    ))
  })
}, [])
```

### Pattern 4: API Key Storage with safeStorage + electron-conf

**What:** Encrypt API key with `safeStorage.encryptString()`, store the Base64-encoded ciphertext in `electron-conf`. On retrieval, decode and decrypt.

**Example (settings handler in ipc.ts):**
```typescript
// Source: https://www.electronjs.org/docs/latest/api/safe-storage
import { safeStorage } from 'electron'
import { Conf } from 'electron-conf/main'

const conf = new Conf({ name: 'settings' })

ipcMain.handle('settings:save', (_event, { key, provider }: { key: string; provider: string }) => {
  const encrypted = safeStorage.encryptString(key)
  conf.set('apiKeyEncrypted', encrypted.toString('base64'))
  conf.set('provider', provider)
})

ipcMain.handle('settings:get', () => {
  const provider = conf.get('provider', 'claude') as string
  const encStr = conf.get('apiKeyEncrypted', '') as string
  let hasKey = false
  if (encStr) {
    try {
      safeStorage.decryptString(Buffer.from(encStr, 'base64'))
      hasKey = true
    } catch { hasKey = false }
  }
  return { provider, hasKey }
})

export function getDecryptedApiKey(): string | null {
  const encStr = conf.get('apiKeyEncrypted', '') as string
  if (!encStr) return null
  try {
    return safeStorage.decryptString(Buffer.from(encStr, 'base64'))
  } catch { return null }
}
```

**Caveat:** `safeStorage` methods are only callable after `app.whenReady()`. Do not call at module load time.

### Pattern 5: Provider-Agnostic AI Call in Worker

**What:** Worker receives provider + API key in the `init` message, then routes to the correct SDK. Use static top-level imports (worker is a separate Rollup entry — all imports resolved at bundle time).

**callAI() in aiWorker.ts:**
```typescript
// Models confirmed 2026-04-14 from official Anthropic docs
// Static imports — NO dynamic import() needed since aiWorker is its own bundle entry
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'

async function callClaude(rawText: string, key: string): Promise<string> {
  const client = new Anthropic({ apiKey: key })
  const msg = await client.messages.create({
    model: 'claude-haiku-4-5',  // fastest/cheapest current model: $1/$5 per MTok
    max_tokens: 512,
    messages: [{ role: 'user', content: buildPrompt(rawText) }]
  })
  const block = msg.content[0]
  if (block.type !== 'text') throw new Error('unexpected content type')
  return block.text
}

async function callOpenAI(rawText: string, key: string): Promise<string> {
  const client = new OpenAI({ apiKey: key })
  const resp = await client.chat.completions.create({
    model: 'gpt-4o-mini',  // $0.15/$0.60 per MTok, 128k context
    max_tokens: 512,
    messages: [{ role: 'user', content: buildPrompt(rawText) }]
  })
  return resp.choices[0].message.content ?? ''
}

async function callAI(rawText: string): Promise<string> {
  if (provider === 'openai') return callOpenAI(rawText, apiKey)
  return callClaude(rawText, apiKey)
}
```

### Pattern 6: Startup Re-Queue (Crash Recovery)

**What:** On app start, query the DB for all notes with `aiState = 'pending'` and re-enqueue them. This recovers from crashes and forced quits that left notes unprocessed.

**In aiOrchestrator.ts, after worker is started:**
```typescript
import { getDb } from './db'
import { notes } from '../../drizzle/schema'
import { eq } from 'drizzle-orm'

export function reQueuePendingNotes(): void {
  const db = getDb()
  const pending = db.select().from(notes).where(eq(notes.aiState, 'pending')).all()
  for (const note of pending) {
    enqueueNote(note.id, note.rawText)
  }
}

// Call this after startAiWorker() in index.ts:
// startAiWorker(win)
// reQueuePendingNotes()
```

This ensures notes with the ⏳ badge actually get processed on next launch.

### Pattern 7: Settings UI

**What:** Minimal settings panel (not a full tab) — overlay or collapsible section accessible from the tab bar. Contains: provider radio (Claude / OpenAI), API key text input (password type), Save button.

**Approach:** Add a gear icon to `TabBar.tsx` that toggles a `SettingsPanel` overlay rendered in `App.tsx`. No new tab — settings are infrequent.

### Anti-Patterns to Avoid

- **Calling AI SDK in main process directly:** Main process handles IPC and window management — blocking it with HTTP calls causes the UI to freeze. Always delegate to utilityProcess.
- **Firing N parallel API calls:** If user submits 10 notes, fire one at a time. The serial queue in the worker prevents rate limit (429) errors.
- **Storing raw API key in electron-conf without encryption:** electron-conf stores plain JSON. Always encrypt with `safeStorage` first.
- **Using electron-store v11:** It is ESM-only. electron-vite produces CJS output. This causes "require() of ES Module" errors at runtime.
- **Calling `safeStorage` before `app.whenReady()`:** Will throw. Only access in `app.whenReady().then()` or in ipcMain handlers (which run after ready).
- **Using dynamic imports in the worker:** `await import('@anthropic-ai/sdk')` inside the drain loop adds unnecessary latency. Since `aiWorker.ts` is its own Rollup entry, static top-level imports are resolved at bundle time.
- **Not calling `port.start()`:** MessagePort is paused by default. Both `port1.start()` in main and `taskPort.start()` in the worker are required before messages flow.
- **Skipping startup re-queue:** Notes that were `pending` when the app crashed will show ⏳ forever. Always re-enqueue on startup.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| API key encryption on disk | Custom XOR/base64 "encryption" | `safeStorage.encryptString()` | OS-level DPAPI/Keychain; survives app updates; no key management needed |
| Persistent settings store | Manual `fs.writeFileSync(JSON.stringify(...))` | `electron-conf` | Handles atomic writes, concurrent access, schema validation |
| HTTP client for AI APIs | Raw `fetch` + manual JSON parsing | `@anthropic-ai/sdk` / `openai` | Error handling, retries, type-safe responses, streaming support built-in |
| Worker process management | Raw `child_process.fork` | `utilityProcess.fork` | Electron-native; supports MessagePort to renderer; monitored by Electron crash reporter |
| Rate limiting | sleep() loops or timers | Serial queue (array + `processing` flag) | Simple, zero-dependency, naturally serializes without overcomplicating |

**Key insight:** The AI SDKs handle retry-on-rate-limit (429), proper timeout, and typed response parsing. Using raw `fetch` loses all of this and adds significant error surface.

---

## Common Pitfalls

### Pitfall 1: Worker File Not Found at Runtime

**What goes wrong:** `utilityProcess.fork(path.join(__dirname, 'aiWorker.js'))` throws "ENOENT" in production.
**Why it happens:** The worker is not listed as a separate Rollup entry, so it never gets built into `out/main/aiWorker.js`.
**How to avoid:** Add `aiWorker: resolve(__dirname, 'src/main/aiWorker.ts')` to `rollupOptions.input` in `electron.vite.config.ts` for the `main` build target.
**Warning signs:** Works in dev (electron-vite serves files differently) but fails in packaged build.

### Pitfall 2: electron-store ESM Crash

**What goes wrong:** `Error [ERR_REQUIRE_ESM]: require() of ES Module node_modules/electron-store/index.js not supported`.
**Why it happens:** electron-store v9+ is ESM-only. electron-vite's main process output is CJS.
**How to avoid:** Use `electron-conf` instead. It is CJS+ESM dual and written by the electron-vite maintainer.
**Warning signs:** Crash on startup, stack trace points to `require('electron-store')`.

### Pitfall 3: safeStorage Called Too Early

**What goes wrong:** `Error: safeStorage is not available before app ready`.
**Why it happens:** Module-level code calling `safeStorage.encryptString()` or `safeStorage.isEncryptionAvailable()` before the app ready event fires.
**How to avoid:** Only access `safeStorage` inside `app.whenReady().then(...)` callback or inside `ipcMain.handle()` handlers.
**Warning signs:** Crash on import of the settings module.

### Pitfall 4: IPC Push Fails When Window Is Hidden

**What goes wrong:** `mainWindow.webContents.send()` throws when `mainWindow` reference is null or destroyed.
**Why it happens:** `webContents.send()` works even on hidden windows. But if `mainWindow` is nulled after close, it throws.
**How to avoid:** Keep a module-level reference to `mainWindow`. Never null it in the hide-to-tray close handler. Guard with `!win.webContents.isDestroyed()` before sending.
**Warning signs:** Unhandled rejection when user hides window while AI is processing.

### Pitfall 5: Port Not Started Before Sending Messages

**What goes wrong:** Worker messages are queued but never delivered.
**Why it happens:** `MessagePort.start()` must be called to begin the message flow. The port is paused by default.
**How to avoid:** Call `port1.start()` in the main process after setting up the `on('message')` handler. In the worker, call `taskPort.start()` after assigning `onmessage`.
**Warning signs:** No `result` messages arrive even though the worker runs and APIs respond.

### Pitfall 6: API SDKs Not Available in Worker (Production Only)

**What goes wrong:** `Cannot find module '@anthropic-ai/sdk'` in the utility process — only in production builds.
**Why it happens:** If SDKs are listed in `devDependencies`, electron-builder excludes them from packaging.
**How to avoid:** Keep `@anthropic-ai/sdk` and `openai` in `dependencies` (not devDependencies). electron-builder packages all `dependencies`.
**Warning signs:** Error only in production build, not in dev.

### Pitfall 7: Windows safeStorage Key Mismatch After Reinstall

**What goes wrong:** `decryptString()` throws after the user reinstalls the app.
**Why it happens:** On Windows, DPAPI ties the encryption key to the user profile. App identity changes can break decryption.
**How to avoid:** Catch decryption errors and treat them as "no key set" — prompt user to re-enter API key. Never crash on decryption failure.
**Warning signs:** User reports "API key disappeared after update".

### Pitfall 8: Wrong TypeScript Type for Worker Port

**What goes wrong:** TypeScript error: property `start` does not exist on type `MessagePort`.
**Why it happens:** The port received in a utility process via `e.ports[0]` is `Electron.MessagePortMain`, not the browser `MessagePort` interface. They have different type signatures.
**How to avoid:** Type the worker port as `Electron.MessagePortMain | null`, not `MessagePort | null`.
**Warning signs:** TypeScript typecheck fails on `taskPort.start()` or `taskPort.onmessage`.

---

## Code Examples

### Minimal Anthropic SDK Call (confirmed from official docs)
```typescript
// Source: https://platform.claude.com/docs/en/about-claude/models/overview
// Model: claude-haiku-4-5 — fastest current Claude, $1/$5 per MTok
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: 'sk-ant-...' })
const message = await client.messages.create({
  model: 'claude-haiku-4-5',
  max_tokens: 512,
  messages: [{ role: 'user', content: 'Your prompt here' }]
})
const text = message.content.filter(b => b.type === 'text').map(b => (b as { type: 'text'; text: string }).text).join('\n')
```

### Minimal OpenAI SDK Call
```typescript
// Model: gpt-4o-mini — $0.15/$0.60 per MTok, 128k context
import OpenAI from 'openai'

const client = new OpenAI({ apiKey: 'sk-...' })
const resp = await client.chat.completions.create({
  model: 'gpt-4o-mini',
  max_tokens: 512,
  messages: [{ role: 'user', content: 'Your prompt here' }]
})
const text = resp.choices[0].message.content ?? ''
```

### Prompt Design for Note Processing

The AI receives a raw note text and must return JSON with two fields: `organized` (cleaned/structured version of the note) and `annotation` (1-2 sentence insight or implication).

```typescript
function buildPrompt(rawText: string): string {
  return `You are a silent note-processing assistant. The user has just captured a raw thought or note. Your task:

1. Organize/clean the note text: fix typos, improve clarity, add minimal structure if needed. Keep the user's voice. Do not add information they did not write.
2. Write a short annotation (1-2 sentences): a key insight, implication, or connection to consider.

Respond with ONLY a JSON object, no markdown, no explanation:
{"organized": "<cleaned note text>", "annotation": "<1-2 sentence insight>"}

Raw note:
${rawText}`
}
```

**Parsing the response:**
```typescript
const parsed = JSON.parse(text) as { organized: string; annotation: string }
// Store parsed.annotation as aiAnnotation in SQLite
// Store parsed.organized in organizedText column (add column in db.ts)
```

> Decision for Phase 02: The schema has `ai_annotation TEXT` but not `organized_text`. The planner should add `organized_text TEXT` as a nullable column in `db.ts` inline migration (see Schema Consideration below). The prompt already returns `organized` — store it now to avoid a Phase 03 migration.

### electron-conf Usage (CJS-safe)
```typescript
// Source: https://github.com/alex8088/electron-conf
import { Conf } from 'electron-conf/main'

const conf = new Conf({ name: 'settings' })
conf.set('provider', 'claude')
const provider = conf.get('provider', 'claude') as string
```

### SQLite Update for AI Result (synchronous, Drizzle)
```typescript
// Pattern: synchronous better-sqlite3 via Drizzle
import { eq } from 'drizzle-orm'
import { getDb } from './db'
import { notes } from '../../drizzle/schema'

export function updateNoteAiResult(
  noteId: string,
  aiState: 'complete' | 'failed',
  aiAnnotation: string | null,
  organizedText: string | null = null
): void {
  const db = getDb()
  db.update(notes)
    .set({ aiState, aiAnnotation, organizedText })
    .where(eq(notes.id, noteId))
    .run()
}
```

### Startup Re-Queue Pattern
```typescript
// Run after startAiWorker() in app.whenReady()
import { getDb } from './db'
import { notes } from '../../drizzle/schema'
import { eq } from 'drizzle-orm'

export function reQueuePendingNotes(): void {
  const db = getDb()
  const pending = db.select().from(notes).where(eq(notes.aiState, 'pending')).all()
  for (const note of pending) {
    enqueueNote(note.id, note.rawText)
  }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `child_process.fork` for workers | `utilityProcess.fork` | Electron 22+ | Native MessagePort support; monitored by Electron |
| `electron-store` for settings | `electron-conf` | 2023–2024 (electron-store went ESM-only) | electron-conf supports CJS; same API shape |
| `keytar` for secure storage | `electron.safeStorage` | Electron 15+ | Built-in; no native addon; no extra rebuild step |
| Polling for AI state | `webContents.send()` push | (always available) | Instant UI update vs polling every N ms |
| Claude Haiku 3 (deprecated) | Claude Haiku 4.5 (`claude-haiku-4-5`) | 2025 | Haiku 3 deprecated April 19, 2026 |

**Deprecated/outdated:**
- `claude-3-haiku-20240307`: Deprecated, retiring April 19, 2026. Use `claude-haiku-4-5`.
- `electron-store` v11: ESM-only, incompatible with electron-vite CJS output without workarounds.
- `keytar`: Archived, requires native rebuild. `safeStorage` is the replacement.

---

## AI Models Reference

### Claude (Anthropic) — for note processing

| Model | API ID | Speed | Cost (input/output per MTok) | Recommendation |
|-------|--------|-------|------------------------------|----------------|
| Claude Haiku 4.5 | `claude-haiku-4-5` | Fastest | $1 / $5 | **Use this** — silent background processing |
| Claude Sonnet 4.6 | `claude-sonnet-4-6` | Fast | $3 / $15 | Overkill for notes; user may prefer for quality |
| Claude Opus 4.6 | `claude-opus-4-6` | Moderate | $5 / $25 | Too slow/expensive for silent background |

### OpenAI — for note processing

| Model | API ID | Speed | Cost (input/output per MTok) | Recommendation |
|-------|--------|-------|------------------------------|----------------|
| GPT-4o mini | `gpt-4o-mini` | Fast | $0.15 / $0.60 | **Use this** — cheapest capable OpenAI model |
| GPT-4o | `gpt-4o` | Moderate | ~$2.50 / $10 | Higher quality; user may prefer |

**Default model selection:** Default to the faster/cheaper option per provider (`claude-haiku-4-5` for Claude, `gpt-4o-mini` for OpenAI). Model selection is a Phase 06 polish concern.

---

## Schema Consideration

The existing schema has:
```sql
ai_state TEXT NOT NULL DEFAULT 'pending'
ai_annotation TEXT
```

Phase 02 needs to add `organized_text`. The AI prompt returns both `organized` and `annotation` — storing organized text now avoids a Phase 03 schema migration.

**Inline migration addition to `db.ts`:**
```typescript
// Add after the CREATE TABLE IF NOT EXISTS block
try {
  sqlite.exec('ALTER TABLE notes ADD COLUMN organized_text TEXT')
} catch {
  // Column already exists — safe to ignore
}
```

**Drizzle schema addition:**
```typescript
// drizzle/schema.ts
organizedText: text('organized_text'),
```

SQLite `ALTER TABLE ADD COLUMN` is idempotent when wrapped in try-catch (throws if column already exists, which is fine).

---

## Open Questions

1. **Should `notes:create` IPC trigger enqueue directly?**
   - What we know: Currently `ipc.ts` creates the note and returns. The AI enqueue must happen after DB write.
   - Recommendation: Direct call — `ipc.ts` imports `enqueueNote` from `aiOrchestrator.ts` and calls it after the DB insert. Simple, zero latency, no polling needed.

2. **How does the worker receive the API key?**
   - Recommendation: Pass `{ provider, apiKey }` in the `init` message when the worker is forked. If the user changes settings, re-init or restart the worker via a `settings-update` message type.

3. **What if the user hasn't configured an API key yet?**
   - Recommendation: On `notes:create`, check if a key is configured. If not, leave `aiState: 'pending'` and do not enqueue. Show a "Set up API key in Settings" hint in the UI (e.g., a banner or tooltip on pending cards).

4. **Startup re-queue — is it first-class behavior?**
   - Yes. Notes with `aiState = 'pending'` in the DB at launch must be re-queued. This is not edge-case polish — it is the crash/quit recovery path. The planner must include a task for `reQueuePendingNotes()` called after `startAiWorker()`.

5. **Should Phase 02 add `organized_text` to the schema or defer to Phase 03?**
   - Recommendation: Add it now. The prompt already returns `organized`. Storing it costs nothing and prevents a later migration that risks data loss if the column is added while notes already exist.

---

## Validation Architecture

> nyquist_validation not explicitly disabled in config — including this section.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None detected in Phase 01 output |
| Config file | None — Wave 0 gap |
| Quick run command | `npm run typecheck` (TypeScript type checking as proxy) |
| Full suite command | `npm run typecheck && npm run build` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AI-01 | Note saved → worker enqueued | manual-only (IPC) | `npm run typecheck` | ❌ Wave 0 |
| AI-02 | API call succeeds → aiState='complete' | integration | manual dev run | ❌ Wave 0 |
| AI-03 | API call fails → aiState='failed' | manual-only | manual dev run | ❌ Wave 0 |
| AI-04 | UI updates in real time without refresh | manual-only | manual dev run | ❌ Wave 0 |
| AI-05 | API key stored encrypted, retrieved correctly | unit | `npm run typecheck` | ❌ Wave 0 |
| AI-06 | Settings saved and persisted across restarts | manual-only | manual dev run | ❌ Wave 0 |
| AI-07 | Pending notes re-queued on app startup | manual-only | manual dev run | ❌ Wave 0 |

Note: AInotepad has no test runner configured in Phase 01. TypeScript typecheck (`npm run typecheck`) is the only automated verification. Manual dev-mode smoke tests are the primary validation for Phase 02. A test framework (vitest) could be added in Phase 06 Polish.

### Wave 0 Gaps

- [ ] No test framework configured — `npm run typecheck` is the CI gate for Phase 02
- [ ] Manual smoke test checklist should be written in each PLAN's verification section

---

## Sources

### Primary (HIGH confidence)
- [Electron utilityProcess docs](https://www.electronjs.org/docs/latest/api/utility-process) — fork API, MessagePort, lifecycle events
- [Electron MessagePorts tutorial](https://www.electronjs.org/docs/latest/tutorial/message-ports) — MessageChannelMain, webContents.postMessage, port transfer
- [Electron safeStorage docs](https://www.electronjs.org/docs/latest/api/safe-storage) — encryptString, decryptString, platform behavior
- [Anthropic Models overview](https://platform.claude.com/docs/en/about-claude/models/overview) — confirmed model IDs and pricing 2026-04-14
- [electron-conf GitHub](https://github.com/alex8088/electron-conf) — CJS/ESM dual, API, no encryption (intentional)
- [electron-vite dependency handling](https://electron-vite.org/guide/dependency-handling) — externalizeDeps default behavior
- [electron-vite-react issue #183](https://github.com/electron-vite/electron-vite-react/issues/183) — utilityProcess multi-entry pattern

### Secondary (MEDIUM confidence)
- npm registry: `@anthropic-ai/sdk` 0.89.0, `openai` 6.34.0, `electron-conf` available — verified via `npm view` 2026-04-14
- GPT-4o mini pricing $0.15/$0.60 per MTok — from OpenAI pricing pages (WebSearch)
- electron-store ESM-only incompatibility with electron-vite — confirmed by multiple GitHub issues

### Tertiary (LOW confidence)
- Specific behavior of `safeStorage` after app reinstall on Windows — documented behavior extrapolated; not empirically tested in this project

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified on npm registry; model IDs confirmed from official Anthropic docs
- Architecture: HIGH — patterns from official Electron docs and electron-vite docs
- Pitfalls: HIGH — ESM/CJS, safeStorage timing, port.start(), and MessagePortMain type issues documented in official sources and GitHub issues
- Prompt design: MEDIUM — reasonable design; actual quality only verifiable by running it

**Research date:** 2026-04-14
**Valid until:** 2026-07-14 (90 days — Electron and AI SDK stable; model names may change faster)
