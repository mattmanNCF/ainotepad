// aiWorker.ts — Electron utilityProcess entry point
// NOTE: This file is built as a SEPARATE Rollup entry (aiWorker in electron.vite.config.ts).
// Static imports are resolved at bundle time — do NOT use dynamic import() for SDK calls.

import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'

let taskPort: Electron.MessagePortMain | null = null
let provider: string = 'claude'
let apiKey: string = ''

const queue: Array<{ noteId: string; rawText: string }> = []
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
  const { type, noteId, rawText } = event.data
  if (type === 'task') {
    queue.push({ noteId, rawText })
    if (!processing) drain()
  }
  // settings-update: sent by ipc.ts settings:save handler (plan 02-04) when the user
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
      const result = await callAI(task.rawText)
      const parsed = JSON.parse(result) as { organized: string; annotation: string }
      taskPort!.postMessage({
        type: 'result',
        noteId: task.noteId,
        aiState: 'complete',
        aiAnnotation: parsed.annotation,
        organizedText: parsed.organized,
      })
    } catch (err) {
      console.error('[aiWorker] callAI or JSON.parse failed:', err)
      taskPort!.postMessage({
        type: 'result',
        noteId: task.noteId,
        aiState: 'failed',
        aiAnnotation: null,
        organizedText: null,
      })
    }
    // 500ms gap between calls to avoid rate limit bursts
    await new Promise((r) => setTimeout(r, 500))
  }
  processing = false
}

function buildPrompt(rawText: string): string {
  return `You are a silent note-processing assistant. The user has just captured a raw thought or note. Your task:

1. Organize/clean the note text: fix typos, improve clarity, add minimal structure if needed. Keep the user's voice. Do not add information they did not write.
2. Write a short annotation (1-2 sentences): a key insight, implication, or connection to consider.

Respond with ONLY a JSON object, no markdown, no explanation:
{"organized": "<cleaned note text>", "annotation": "<1-2 sentence insight>"}

Raw note:
${rawText}`
}

async function callClaude(rawText: string, key: string): Promise<string> {
  const client = new Anthropic({ apiKey: key })
  const msg = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 512,
    messages: [{ role: 'user', content: buildPrompt(rawText) }],
  })
  const block = msg.content.find((b) => b.type === 'text')
  if (!block || block.type !== 'text') throw new Error('Unexpected Claude response: no text block')
  return block.text
}

async function callOpenAI(rawText: string, key: string): Promise<string> {
  const client = new OpenAI({ apiKey: key })
  const resp = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 512,
    messages: [{ role: 'user', content: buildPrompt(rawText) }],
  })
  return resp.choices[0].message.content ?? ''
}

async function callAI(rawText: string): Promise<string> {
  if (!apiKey) throw new Error('No API key configured')
  if (provider === 'openai') return callOpenAI(rawText, apiKey)
  return callClaude(rawText, apiKey)
}
