import { utilityProcess, MessageChannelMain, BrowserWindow } from 'electron'
import path from 'path'
import { updateNoteAiResult, getDb } from './db'
import { notes } from '../../drizzle/schema'
import { eq } from 'drizzle-orm'

let workerPort: Electron.MessagePortMain | null = null
let mainWin: BrowserWindow | null = null

// Accessor used by ipc.ts settings:save handler to send settings-update to the worker.
// Plan 02-04 imports this to notify the running worker when the user saves a new API key,
// so same-session note submissions pick up the new key without restarting.
export function getWorkerPort(): Electron.MessagePortMain | null {
  return workerPort
}

export function startAiWorker(win: BrowserWindow, provider: string, apiKey: string): void {
  mainWin = win

  const child = utilityProcess.fork(path.join(__dirname, 'aiWorker.js'))
  const { port1, port2 } = new MessageChannelMain()

  // Transfer port2 to the worker in the init message
  child.postMessage({ type: 'init', provider, apiKey }, [port2])

  workerPort = port1
  port1.start() // REQUIRED: port is paused until start() is called

  port1.on('message', (event) => {
    const { type, noteId, aiState, aiAnnotation, organizedText } = event.data
    if (type === 'result') {
      updateNoteAiResult(noteId, aiState as 'complete' | 'failed', aiAnnotation ?? null, organizedText ?? null)
      if (mainWin && !mainWin.webContents.isDestroyed()) {
        mainWin.webContents.send('note:aiUpdate', { noteId, aiState, aiAnnotation, organizedText })
      }
    }
  })
}

export function enqueueNote(noteId: string, rawText: string): void {
  if (!workerPort) return
  workerPort.postMessage({ type: 'task', noteId, rawText })
}

export function reQueuePendingNotes(): void {
  const db = getDb()
  const pending = db.select().from(notes).where(eq(notes.aiState, 'pending')).all()
  for (const note of pending) {
    enqueueNote(note.id, note.rawText)
  }
}
