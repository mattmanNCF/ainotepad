// aiWorker.ts — Electron utilityProcess entry point
// NOTE: node-llama-cpp is ESM-only (top-level await) — must be loaded via dynamic import().
// Other SDKs use static imports; only node-llama-cpp requires the dynamic pattern.

import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'

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

const queue: Array<{ noteId: string; rawText: string; contextMd: string; conceptSnippets: string; relatedNotes: string; establishedTags?: string[] }> = []
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

    // If llama.cpp provider configured with a model path, start init asynchronously.
    // Tasks arriving while init is in progress are queued and drained once ready.
    if (provider === 'llamacpp' && localModelPath) {
      localModelInitPromise = initLocalModel(localModelPath)
    }
  }
})


/**
 * Initialize the node-llama-cpp model stack with hardware-appropriate GPU backend.
 * Priority: CUDA (NVIDIA/AMD-HIP) → Vulkan → CPU
 * Uses dynamic import() because node-llama-cpp is ESM-only (top-level await).
 */
async function initLocalModel(modelPath: string): Promise<void> {
  const { getLlama, LlamaChatSession, LlamaLogLevel, InsufficientMemoryError } = await import('node-llama-cpp')

  // getLlama() is a process-level singleton. Specifying gpu:'cuda' loads our custom HIP build
  // from localBuilds/win-x64-cuda (per lastBuild.json). We NEVER dispose the instance across
  // attempts — instead we reload the model with different gpuLayers on the same instance.
  try {
    console.log('[aiWorker] Initializing llama with gpu=cuda (HIP/ROCm build)')
    llamaInstance = await getLlama({ gpu: 'cuda', logLevel: LlamaLogLevel.debug })

    // First try: full GPU offload
    llamaModel = await llamaInstance.loadModel({ modelPath, gpuLayers: -1 })
    const offloaded = llamaModel.gpuLayers
    let label = `GPU (${offloaded} layers)`

    if (offloaded === 0) {
      // GPU architecture incompatible (e.g. Gemma 4 SWA on ROCm) — reload as CPU on same instance
      console.warn('[aiWorker] 0 GPU layers — reloading with gpuLayers=0 (CPU-only)')
      llamaModel = await llamaInstance.loadModel({ modelPath, gpuLayers: 0 })
      label = 'CPU (via HIP instance)'
    }

    // Flash attention required for Gemma 4 SWA architecture.
    // batchSize=1: 5 graph splits vs 718 at bs=65 — avoids ROCm sched_alloc_splits crash.
    try {
      llamaContext = await llamaModel.createContext({ flashAttention: true, batchSize: 1 })
    } catch (ctxErr) {
      if (ctxErr instanceof InsufficientMemoryError && offloaded > 0) {
        console.warn('[aiWorker] VRAM full — trying 20-layer partial offload')
        llamaModel = await llamaInstance.loadModel({ modelPath, gpuLayers: 20 })
        llamaContext = await llamaModel.createContext({ flashAttention: true, batchSize: 1 })
        label = 'GPU partial (20 layers)'
      } else {
        throw ctxErr
      }
    }

    llamaSession = new LlamaChatSession({ contextSequence: llamaContext.getSequence() })
    localModelReady = true
    console.log(`[aiWorker] Local model ready via ${label}:`, modelPath)
  } catch (err) {
    console.error('[aiWorker] Model init failed:', String((err as any)?.message ?? err))
    // localModelReady stays false — callLocal() will throw
  }
}


/**
 * Build the prompt for digest narrative generation.
 */
function buildDigestPrompt(wordCloudData: string, stats: string, webContext: string): string {
  const webSection = webContext
    ? `\n## Recent Web Context\n${webContext}`
    : ''
  return `You are an AI assistant summarizing a user's notes for a period digest.

## Word Cloud Data (tag frequencies)
${wordCloudData}

## Stats
${stats}
${webSection}

Write a narrative digest paragraph summarizing what topics and ideas dominated this period. Be specific and concrete. Focus on patterns and connections. 2-4 sentences.

Respond with ONLY a JSON object: {"narrative": "..."}`
}

/**
 * Call AI with an arbitrary prompt string (no buildPrompt, no grammar enforcement).
 * Used for digest narrative generation.
 */
async function callAIWithPrompt(prompt: string): Promise<string> {
  if (provider === 'llamacpp') {
    if (!localModelReady && localModelInitPromise) {
      await localModelInitPromise
    }
    if (!localModelReady) {
      throw new Error('[aiWorker] Local model not ready for digest generation')
    }
    return llamaSession.prompt(prompt)
  }
  if (provider === 'ollama') {
    const client = new OpenAI({ baseURL: 'http://localhost:11434/v1', apiKey: 'ollama' })
    const resp = await client.chat.completions.create({
      model: ollamaModel,
      max_tokens: 4096,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }],
    })
    return resp.choices[0].message.content ?? ''
  }
  if (!apiKey) throw new Error('No API key configured')
  if (provider === 'openai') {
    const client = new OpenAI({ apiKey })
    const resp = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 4096,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }],
    })
    return resp.choices[0].message.content ?? ''
  }
  // Default: Claude
  const client = new Anthropic({ apiKey })
  const msg = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 512,
    messages: [{ role: 'user', content: prompt }],
  })
  const block = msg.content.find((b) => b.type === 'text')
  if (!block || block.type !== 'text') throw new Error('Unexpected Claude response: no text block')
  return block.text
}

/**
 * Handle a digest-task message. Fire-and-forget (not queued with note tasks).
 * Generates narrative via AI, optionally enriched by Brave Search.
 * Posts digest-result back to taskPort on success. Silent on failure.
 */
async function handleDigestTask({
  period,
  periodStart,
  wordCloudData,
  stats,
}: {
  period: string
  periodStart: string
  wordCloudData: string
  stats: string
}): Promise<void> {
  try {
    const prompt = buildDigestPrompt(wordCloudData, stats, '')
    const raw = await callAIWithPrompt(prompt)
    // Strip markdown code fences if present
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
    let narrative = ''
    try {
      const parsed = JSON.parse(cleaned) as { narrative: string }
      narrative = parsed.narrative ?? cleaned
    } catch {
      // If JSON parse fails, use raw output as narrative
      narrative = cleaned
    }

    const generatedAt = new Date().toISOString()
    if (taskPort) {
      taskPort.postMessage({
        type: 'digest-result',
        period,
        periodStart,
        wordCloudData,
        narrative,
        stats,
        generatedAt,
      })
      console.log('[aiWorker] digest-result posted for period', period)
    }
  } catch (err) {
    console.error('[aiWorker] digest-task failed:', err)
    // Send error back so the renderer can surface it rather than silently hanging
    if (taskPort) {
      taskPort.postMessage({ type: 'digest-error', period, error: String((err as any)?.message ?? err) })
    }
  }
}

function handleMessage(event: Electron.MessageEvent): void {
  const { type, noteId, rawText, contextMd, conceptSnippets, relatedNotes, establishedTags } = event.data
  if (type === 'task') {
    queue.push({
      noteId,
      rawText,
      contextMd: contextMd ?? '',
      conceptSnippets: conceptSnippets ?? '',
      relatedNotes: relatedNotes ?? '',
      establishedTags: establishedTags ?? [],
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
    if (provider === 'llamacpp' && event.data.modelPath) {
      localModelPath = event.data.modelPath
      localModelReady = false
      localModelInitPromise = initLocalModel(localModelPath)
    }
  }
  // digest-task: full implementation (plan 04-04)
  if (type === 'digest-task') {
    const { period, periodStart, wordCloudData, stats } = event.data
    // Fire and forget — do not block the main note queue
    handleDigestTask({ period, periodStart, wordCloudData, stats })
  }
}

/**
 * If the model returned no tags or only ["Untagged"], scan the note text for
 * established tag keywords and promote any matches. Falls back to ["Untagged"].
 */
function resolvedTags(modelTags: string[] | undefined, rawText: string, establishedTags: string[]): string[] {
  const tags = modelTags?.filter(t => t !== 'Untagged') ?? []
  if (tags.length > 0) return tags

  // Keyword fallback: check if any established tag appears in the note text
  const lower = rawText.toLowerCase()
  const matched = establishedTags.filter(t => lower.includes(t.toLowerCase()))
  return matched.length > 0 ? matched : ['Untagged']
}

async function drain(): Promise<void> {
  processing = true
  while (queue.length > 0) {
    const task = queue.shift()!
    try {
      const raw = await callAI(task.rawText, task.contextMd, task.conceptSnippets, task.relatedNotes, task.establishedTags ?? [])
      // Strip markdown code fences if model wrapped the JSON (common with gpt-4o-mini)
      const result = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
      const parsed = JSON.parse(result) as {
        organized: string
        annotation: string
        wiki_updates: Array<{ file: string; content: string }>
        tags: string[]
        insights: string | null
        reminder: { text: string; date_text: string; confidence: number } | null
      }
      taskPort!.postMessage({
        type: 'result',
        noteId: task.noteId,
        aiState: 'complete',
        aiAnnotation: parsed.annotation,
        organizedText: parsed.organized,
        wikiUpdates: parsed.wiki_updates ?? [],
        tags: resolvedTags(parsed.tags, task.rawText, task.establishedTags ?? []),
        insights: parsed.insights ?? null,
        reminder: parsed.reminder ?? null,
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
        reminder: null,
      })
    }
    // 500ms gap between calls to avoid rate limit bursts
    await new Promise((r) => setTimeout(r, 500))
  }
  processing = false
}

function buildPrompt(rawText: string, contextMd: string, conceptSnippets: string, relatedNotes: string, establishedTags: string[] = []): string {
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

  const tagConstraint = establishedTags.length > 0
    ? `Established tags (prefer these over inventing new ones): ${establishedTags.join(', ')}. Never return an empty array.`
    : `Never return an empty array — use ["Untagged"] if nothing applies.`

  return `You are a silent note-processing and knowledge-base assistant. Return a JSON object with exactly these five fields.

${contextSection}
${conceptSection}
${relatedSection}

## Tasks
1. **organized**: Clean/organize the note text. Fix typos, improve clarity. Keep the user's voice.
2. **annotation**: 1-2 sentence insight or connection.
3. **wiki_updates**: Array of concept file writes: [{"file": "slug.md", "content": "..."}]
   - MUST include {"file": "_context.md", "content": "..."} — use exactly "_context.md" as the filename
   - Create/update concept files for key ideas
   - Each file: YAML frontmatter then Markdown
   - "_context.md" structure: ---\\nupdated: <ISO>\\nnote_count: <N>\\n---\\n## Active Interests\\n## Project Map\\n## Recurring Concepts\\n## Recent Notes Summary
4. **tags**: ${tagConstraint}
5. **insights**: Specific observation or connection. null only if truly nothing to say.
6. **reminder**: If the note contains a specific date/time-bound intent the user is likely trying to remember ("remind me to X on Friday", "meeting Tuesday 3pm", "call Mom tomorrow") return {"text":"concise reminder title","date_text":"exact date phrase from the note","confidence":0.0..1.0}. Confidence reflects BOTH certainty of reminder intent AND date precision — high only for specific datetimes. Return null if no reminder is present.

Respond with ONLY valid JSON. No markdown, no explanation.
{"organized":"...","annotation":"...","wiki_updates":[{"file":"_context.md","content":"..."}],"tags":["tag1"],"insights":"...","reminder":null}

Raw note: ${rawText}`
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
      reminder: {
        oneOf: [
          {
            type: 'object',
            properties: {
              text: { type: 'string' },
              date_text: { type: 'string' },
              confidence: { type: 'number' },
            },
            required: ['text', 'date_text', 'confidence'],
          },
          { type: 'null' },
        ],
      },
    },
  })

  // Grammar enforcement means output is already valid JSON — no fence stripping needed
  const result = await llamaSession.prompt(
    buildPrompt(rawText, contextMd, conceptSnippets, relatedNotes, []),
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

async function callOllama(rawText: string, contextMd: string, conceptSnippets: string, relatedNotes: string, model: string, establishedTags: string[] = []): Promise<string> {
  const client = new OpenAI({ baseURL: 'http://localhost:11434/v1', apiKey: 'ollama' })
  const resp = await client.chat.completions.create({
    model,
    max_tokens: 16384,
    response_format: { type: 'json_object' },
    messages: [{ role: 'user', content: buildPrompt(rawText, contextMd, conceptSnippets, relatedNotes, establishedTags) }],
  })
  return resp.choices[0].message.content ?? ''
}

// OpenAI-compatible providers — same call, different base URL and model
const OPENAI_COMPAT_BASES: Record<string, { baseURL: string; model: string }> = {
  gemini:      { baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.0-flash' },
  groq:        { baseURL: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' },
  huggingface: { baseURL: 'https://api-inference.huggingface.co/v1', model: 'meta-llama/Llama-3.3-70B-Instruct' },
}

async function callOpenAICompat(rawText: string, contextMd: string, conceptSnippets: string, relatedNotes: string, key: string, baseURL: string, model: string, establishedTags: string[] = []): Promise<string> {
  const client = new OpenAI({ apiKey: key, baseURL })
  const resp = await client.chat.completions.create({
    model,
    max_tokens: 4096,
    messages: [{ role: 'user', content: buildPrompt(rawText, contextMd, conceptSnippets, relatedNotes, establishedTags) }],
  })
  return resp.choices[0].message.content ?? ''
}

async function callAI(rawText: string, contextMd: string, conceptSnippets: string, relatedNotes: string, establishedTags: string[] = []): Promise<string> {
  if (provider === 'llamacpp') return callLocal(rawText, contextMd, conceptSnippets, relatedNotes)
  if (provider === 'ollama') return callOllama(rawText, contextMd, conceptSnippets, relatedNotes, ollamaModel, establishedTags)
  if (!apiKey) throw new Error('No API key configured')
  if (provider === 'openai') return callOpenAI(rawText, contextMd, conceptSnippets, relatedNotes, apiKey)
  const compat = OPENAI_COMPAT_BASES[provider]
  if (compat) return callOpenAICompat(rawText, contextMd, conceptSnippets, relatedNotes, apiKey, compat.baseURL, compat.model, establishedTags)
  return callClaude(rawText, contextMd, conceptSnippets, relatedNotes, apiKey)
}
