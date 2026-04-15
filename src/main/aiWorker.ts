// aiWorker.ts — Electron utilityProcess entry point
// NOTE: This file is built as a SEPARATE Rollup entry (aiWorker in electron.vite.config.ts).
// Static imports are resolved at bundle time — do NOT use dynamic import() for SDK calls.

// SDK imports: stubbed here, replaced in plan 02-03 with real implementations
// import Anthropic from '@anthropic-ai/sdk'
// import OpenAI from 'openai'

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
      console.error('[aiWorker] callAI failed:', err)
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

// STUB: replaced in plan 02-03 with real Anthropic/OpenAI SDK calls
async function callAI(rawText: string): Promise<string> {
  console.log(`[aiWorker] STUB callAI — provider: ${provider}, text length: ${rawText.length}`)
  // Return a valid JSON response so the pipeline can be tested end-to-end
  return JSON.stringify({
    organized: rawText.trim(),
    annotation: 'AI processing stub — configure API key and provider SDK in plan 02-03.',
  })
}
