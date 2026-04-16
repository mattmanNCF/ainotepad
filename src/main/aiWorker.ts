// aiWorker.ts — Electron utilityProcess entry point
// NOTE: This file is built as a SEPARATE Rollup entry (aiWorker in electron.vite.config.ts).
// Static imports are resolved at bundle time — do NOT use dynamic import() for SDK calls.

import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { getLlama, LlamaChatSession, InsufficientMemoryError } from 'node-llama-cpp'

let taskPort: Electron.MessagePortMain | null = null
let provider: string = 'ollama'
let apiKey: string = 'ollama'
let ollamaModel: string = 'qwen2.5-coder:14b'

// Local model state — module-scoped for lazy init with non-blocking queue drain
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let llamaInstance: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let llamaModel: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let llamaContext: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let llamaSession: any = null
let localModelPath: string = ''
let localModelReady = false
let localModelInitPromise: Promise<void> | null = null

const queue: Array<{ noteId: string; rawText: string; contextMd: string; conceptSnippets: string; relatedNotes: string }> = []
let processing = false

// Receive init message from main process (transfers port2 from MessageChannelMain)
process.parentPort.on('message', (e) => {
  const { type } = e.data
  if (type === 'init') {
    provider = e.data.provider ?? 'ollama'
    apiKey = e.data.apiKey ?? 'ollama'
    ollamaModel = e.data.ollamaModel ?? 'qwen2.5-coder:14b'
    localModelPath = e.data.modelPath ?? ''
    taskPort = e.ports[0] as Electron.MessagePortMain
    taskPort.on('message', handleMessage)
    taskPort.start() // REQUIRED: port is paused until start() is called

    // If local provider configured, start model init asynchronously (fire-and-forget).
    // Tasks arriving while init is in progress are queued and drained once ready.
    if (provider === 'local' && localModelPath) {
      localModelInitPromise = initLocalModel(localModelPath)
    }
  }
})

/**
 * Initialize the node-llama-cpp model stack.
 * Attempts GPU acceleration first; falls back to CPU if InsufficientMemoryError.
 */
async function initLocalModel(modelPath: string): Promise<void> {
  try {
    try {
      llamaInstance = await getLlama()
      llamaModel = await llamaInstance.loadModel({ modelPath })
    } catch (err) {
      if (err instanceof InsufficientMemoryError) {
        console.warn('[aiWorker] GPU memory insufficient — falling back to CPU (gpuLayers: 0)')
        llamaInstance = await getLlama()
        llamaModel = await llamaInstance.loadModel({ modelPath, gpuLayers: 0 })
      } else {
        throw err
      }
    }
    llamaContext = await llamaModel.createContext()
    llamaSession = new LlamaChatSession({ contextSequence: llamaContext.getSequence() })
    localModelReady = true
    console.log('[aiWorker] Local model ready:', modelPath)
  } catch (err) {
    console.error('[aiWorker] Local model init failed:', err)
    // localModelReady stays false — callLocal() will throw
  }
}

function handleMessage(event: Electron.MessageEvent): void {
  const { type, noteId, rawText, contextMd, conceptSnippets, relatedNotes } = event.data
  if (type === 'task') {
    queue.push({
      noteId,
      rawText,
      contextMd: contextMd ?? '',
      conceptSnippets: conceptSnippets ?? '',
      relatedNotes: relatedNotes ?? '',
    })
    if (!processing) drain()
  }
  // settings-update: sent by ipc.ts settings:save handler when the user
  // saves a new API key. Refreshes module-level vars so callAI() uses the new key
  // immediately — without this, notes submitted in the same session would fail with
  // "No API key configured" because the worker launched with the empty startup key.
  if (type === 'settings-update') {
    provider = event.data.provider ?? provider
    apiKey = event.data.apiKey ?? apiKey
    ollamaModel = event.data.ollamaModel ?? ollamaModel
  }
  // digest-task: full implementation in plan 04-04. Stub here so the message type
  // is handled without crashing the worker.
  if (type === 'digest-task') {
    console.log('[aiWorker] TODO: digest-task handler not yet implemented (plan 04-04)')
    taskPort?.postMessage({ type: 'digest-result', stub: true })
  }
}

async function drain(): Promise<void> {
  processing = true
  while (queue.length > 0) {
    const task = queue.shift()!
    try {
      const raw = await callAI(task.rawText, task.contextMd, task.conceptSnippets, task.relatedNotes)
      // Strip markdown code fences if model wrapped the JSON (common with gpt-4o-mini)
      const result = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
      const parsed = JSON.parse(result) as {
        organized: string
        annotation: string
        wiki_updates: Array<{ file: string; content: string }>
        tags: string[]
        insights: string | null
      }
      taskPort!.postMessage({
        type: 'result',
        noteId: task.noteId,
        aiState: 'complete',
        aiAnnotation: parsed.annotation,
        organizedText: parsed.organized,
        wikiUpdates: parsed.wiki_updates ?? [],
        tags: parsed.tags ?? [],
        insights: parsed.insights ?? null,
      })
    } catch (err) {
      const errMsg = String((err as any)?.message ?? err)
      const errStatus = (err as any)?.status ?? ''
      console.error('[aiWorker] FAIL:', errMsg, errStatus)
      taskPort!.postMessage({
        type: 'result',
        noteId: task.noteId,
        aiState: 'failed',
        errorMsg: errMsg,
        aiAnnotation: null,
        organizedText: null,
        wikiUpdates: [],
        tags: [],
        insights: null,
      })
    }
    // 500ms gap between calls to avoid rate limit bursts
    await new Promise((r) => setTimeout(r, 500))
  }
  processing = false
}

function buildPrompt(rawText: string, contextMd: string, conceptSnippets: string, relatedNotes: string): string {
  const hasContext = contextMd.trim().length > 0
  const contextSection = hasContext
    ? `## Your Current Knowledge Context\n${contextMd}`
    : `## Your Current Knowledge Context\nNo context yet — bootstrapping.`

  const conceptSection = conceptSnippets.trim().length > 0
    ? `\n## Relevant Existing Concept Files\n${conceptSnippets}`
    : ''

  const relatedSection = relatedNotes.trim().length > 0
    ? `\n## Related Past Notes (retrieved by similarity)\n${relatedNotes}`
    : ''

  return `You are a silent note-processing and knowledge-base assistant. Process the raw note below and return a JSON object with exactly these five fields.

${contextSection}
${conceptSection}
${relatedSection}

## Your Tasks
1. **organized**: Clean/organize the note. Fix typos, improve clarity. Keep the user's voice.
2. **annotation**: 1-2 sentence insight or connection to consider.
3. **wiki_updates**: Array of concept file writes. Each entry: {"file": "slug.md", "content": "...full file content..."}
   - Create/update concept files for key ideas in this note
   - Each file: YAML frontmatter (tags, created, updated), then Markdown with [[wikilinks]] to related concepts
   - Rewrite files in full — do not patch
   - Include ONE entry for "_context.md" — your updated rolling context. Structure:
     ---
     updated: <ISO timestamp>
     note_count: <integer>
     ---
     ## Active Interests
     ## Project Map
     ## Recurring Concepts
     ## Recent Notes Summary
     Keep it bounded: max 5 recent notes, max 10 recurring concepts. Rewrite entire file each time.
4. **tags**: Array of tag strings for this note (e.g. ["physics", "TOT", "math"])
5. **insights**: Return a string ONLY if you have a specific, non-obvious observation the user might have missed — a genuine connection to past notes, a recurring pattern, or novelty finding from web context. If nothing stands out, return null. Do NOT generate generic observations.

IMPORTANT: Respond with ONLY a JSON object. No markdown fences, no explanation.
{"organized": "...", "annotation": "...", "wiki_updates": [{"file": "...", "content": "..."}], "tags": [...], "insights": null}

Raw note:
${rawText}`
}

/**
 * Call the local Gemma 4 model via node-llama-cpp.
 * Waits for initialization if still in progress.
 */
async function callLocal(rawText: string, contextMd: string, conceptSnippets: string, relatedNotes: string): Promise<string> {
  if (!localModelReady && localModelInitPromise) {
    await localModelInitPromise
  }
  if (!localModelReady) {
    throw new Error('[aiWorker] Local model failed to initialize — cannot process note')
  }

  // Build JSON grammar enforcing the expected output schema
  const grammar = await llamaInstance.createGrammarForJsonSchema({
    type: 'object',
    properties: {
      organized: { type: 'string' },
      annotation: { type: 'string' },
      wiki_updates: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            file: { type: 'string' },
            content: { type: 'string' },
          },
        },
      },
      tags: { type: 'array', items: { type: 'string' } },
      insights: { type: ['string', 'null'] },
    },
  })

  // Grammar enforcement means output is already valid JSON — no fence stripping needed
  const result = await llamaSession.prompt(
    buildPrompt(rawText, contextMd, conceptSnippets, relatedNotes),
    { grammar }
  )
  return result
}

async function callClaude(rawText: string, contextMd: string, conceptSnippets: string, relatedNotes: string, key: string): Promise<string> {
  const client = new Anthropic({ apiKey: key })
  const msg = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 4096,
    messages: [{ role: 'user', content: buildPrompt(rawText, contextMd, conceptSnippets, relatedNotes) }],
  })
  const block = msg.content.find((b) => b.type === 'text')
  if (!block || block.type !== 'text') throw new Error('Unexpected Claude response: no text block')
  return block.text
}

async function callOpenAI(rawText: string, contextMd: string, conceptSnippets: string, relatedNotes: string, key: string): Promise<string> {
  const client = new OpenAI({ apiKey: key })
  const resp = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 4096,
    response_format: { type: 'json_object' },
    messages: [{ role: 'user', content: buildPrompt(rawText, contextMd, conceptSnippets, relatedNotes) }],
  })
  return resp.choices[0].message.content ?? ''
}

async function callOllama(rawText: string, contextMd: string, conceptSnippets: string, relatedNotes: string, model: string): Promise<string> {
  const client = new OpenAI({ baseURL: 'http://localhost:11434/v1', apiKey: 'ollama' })
  const resp = await client.chat.completions.create({
    model,
    max_tokens: 4096,
    messages: [{ role: 'user', content: buildPrompt(rawText, contextMd, conceptSnippets, relatedNotes) }],
  })
  return resp.choices[0].message.content ?? ''
}

async function callAI(rawText: string, contextMd: string, conceptSnippets: string, relatedNotes: string): Promise<string> {
  if (provider === 'local') return callLocal(rawText, contextMd, conceptSnippets, relatedNotes)
  if (provider === 'ollama') return callOllama(rawText, contextMd, conceptSnippets, relatedNotes, ollamaModel)
  if (!apiKey) throw new Error('No API key configured')
  if (provider === 'openai') return callOpenAI(rawText, contextMd, conceptSnippets, relatedNotes, apiKey)
  return callClaude(rawText, contextMd, conceptSnippets, relatedNotes, apiKey)
}
