// aiWorker.ts — Electron utilityProcess entry point
// NOTE: This file is built as a SEPARATE Rollup entry (aiWorker in electron.vite.config.ts).
// Static imports are resolved at bundle time — do NOT use dynamic import() for SDK calls.

import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'

let taskPort: Electron.MessagePortMain | null = null
let provider: string = 'claude'
let apiKey: string = ''

const queue: Array<{ noteId: string; rawText: string; contextMd: string; conceptSnippets: string }> = []
let processing = false

// Receive init message from main process (transfers port2 from MessageChannelMain)
process.parentPort.on('message', (e) => {
  const { type } = e.data
  if (type === 'init') {
    provider = e.data.provider ?? 'claude'
    apiKey = e.data.apiKey ?? ''
    taskPort = e.ports[0] as Electron.MessagePortMain
    taskPort.on('message', handleMessage)
    taskPort.start() // REQUIRED: port is paused until start() is called
  }
})

function handleMessage(event: Electron.MessageEvent): void {
  const { type, noteId, rawText, contextMd, conceptSnippets } = event.data
  if (type === 'task') {
    queue.push({ noteId, rawText, contextMd: contextMd ?? '', conceptSnippets: conceptSnippets ?? '' })
    if (!processing) drain()
  }
  // settings-update: sent by ipc.ts settings:save handler when the user
  // saves a new API key. Refreshes module-level vars so callAI() uses the new key
  // immediately — without this, notes submitted in the same session would fail with
  // "No API key configured" because the worker launched with the empty startup key.
  if (type === 'settings-update') {
    provider = event.data.provider ?? provider
    apiKey = event.data.apiKey ?? apiKey
  }
}

async function drain(): Promise<void> {
  processing = true
  while (queue.length > 0) {
    const task = queue.shift()!
    try {
      const result = await callAI(task.rawText, task.contextMd, task.conceptSnippets)
      const parsed = JSON.parse(result) as {
        organized: string
        annotation: string
        wiki_updates: Array<{ file: string; content: string }>
        tags: string[]
      }
      taskPort!.postMessage({
        type: 'result',
        noteId: task.noteId,
        aiState: 'complete',
        aiAnnotation: parsed.annotation,
        organizedText: parsed.organized,
        wikiUpdates: parsed.wiki_updates ?? [],
        tags: parsed.tags ?? [],
      })
    } catch (err) {
      console.error('[aiWorker] callAI or JSON.parse failed:', err)
      taskPort!.postMessage({
        type: 'result',
        noteId: task.noteId,
        aiState: 'failed',
        aiAnnotation: null,
        organizedText: null,
        wikiUpdates: [],
        tags: [],
      })
    }
    // 500ms gap between calls to avoid rate limit bursts
    await new Promise((r) => setTimeout(r, 500))
  }
  processing = false
}

function buildPrompt(rawText: string, contextMd: string, conceptSnippets: string): string {
  const hasContext = contextMd.trim().length > 0
  const contextSection = hasContext
    ? `## Your Current Knowledge Context\n${contextMd}`
    : `## Your Current Knowledge Context\nNo context yet — bootstrapping.`

  const conceptSection = conceptSnippets.trim().length > 0
    ? `\n## Relevant Existing Concept Files\n${conceptSnippets}`
    : ''

  return `You are a silent note-processing and knowledge-base assistant. Process the raw note below and return a JSON object with exactly these four fields.

${contextSection}
${conceptSection}

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

IMPORTANT: Respond with ONLY a JSON object. No markdown fences, no explanation.
{"organized": "...", "annotation": "...", "wiki_updates": [{"file": "...", "content": "..."}], "tags": [...]}

Raw note:
${rawText}`
}

async function callClaude(rawText: string, contextMd: string, conceptSnippets: string, key: string): Promise<string> {
  const client = new Anthropic({ apiKey: key })
  const msg = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 4096,
    messages: [{ role: 'user', content: buildPrompt(rawText, contextMd, conceptSnippets) }],
  })
  const block = msg.content.find((b) => b.type === 'text')
  if (!block || block.type !== 'text') throw new Error('Unexpected Claude response: no text block')
  return block.text
}

async function callOpenAI(rawText: string, contextMd: string, conceptSnippets: string, key: string): Promise<string> {
  const client = new OpenAI({ apiKey: key })
  const resp = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 4096,
    messages: [{ role: 'user', content: buildPrompt(rawText, contextMd, conceptSnippets) }],
  })
  return resp.choices[0].message.content ?? ''
}

async function callAI(rawText: string, contextMd: string, conceptSnippets: string): Promise<string> {
  if (!apiKey) throw new Error('No API key configured')
  if (provider === 'openai') return callOpenAI(rawText, contextMd, conceptSnippets, apiKey)
  return callClaude(rawText, contextMd, conceptSnippets, apiKey)
}
