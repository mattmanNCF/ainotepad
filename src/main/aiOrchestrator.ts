import { utilityProcess, MessageChannelMain, BrowserWindow } from 'electron'
import path from 'path'
import { updateNoteAiResult, getDb } from './db'
import { notes, kbPages } from '../../drizzle/schema'
import { eq } from 'drizzle-orm'
import { writeKbFile, readKbFile, listKbFiles } from './kb'
import { getTagColors, setTagColors } from './tagColors'

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

  port1.on('message', async (event) => {
    const { type, noteId, aiState, aiAnnotation, organizedText, wikiUpdates, tags } = event.data
    if (type === 'result') {
      const tagsJson = JSON.stringify(tags ?? [])
      updateNoteAiResult(noteId, aiState as 'complete' | 'failed', aiAnnotation ?? null, organizedText ?? null, tagsJson)

      // Write wiki files to kb/
      if (wikiUpdates && wikiUpdates.length > 0) {
        const db = getDb()
        for (const update of wikiUpdates as Array<{ file: string; content: string }>) {
          try {
            await writeKbFile(update.file, update.content)

            // Upsert kbPages for concept files (skip _context.md and other _ prefixed files)
            if (!update.file.startsWith('_')) {
              const id = update.file.replace(/\.md$/, '')
              const title = id.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
              const now = new Date().toISOString()

              // Extract tags array from YAML frontmatter if present
              const tagsMatch = update.content.match(/^tags:\s*\[(.+?)\]/m)
              const fileTags = tagsMatch
                ? JSON.stringify(tagsMatch[1].split(',').map((t: string) => t.trim().replace(/['"]/g, '')))
                : '[]'

              db.insert(kbPages)
                .values({ id, filename: update.file, title, tags: fileTags, created: now, updated: now })
                .onConflictDoUpdate({ target: kbPages.id, set: { title, tags: fileTags, updated: now } })
                .run()
            }
          } catch (err) {
            console.error('[aiOrchestrator] wiki file write failed:', update.file, err)
          }
        }

        // Assign default colors for new tags (deterministic palette)
        // Uses tagColors.ts — NOT ipc.ts — to avoid circular import
        const DEFAULT_PALETTE = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#3b82f6', '#8b5cf6', '#ec4899']
        const currentColors = getTagColors()
        let changed = false
        const allTags = (tags ?? []) as string[]
        for (const tag of allTags) {
          if (!currentColors[tag]) {
            const index = Object.keys(currentColors).length % DEFAULT_PALETTE.length
            currentColors[tag] = DEFAULT_PALETTE[index]
            changed = true
          }
        }
        if (changed) setTagColors(currentColors)

        // Notify renderer that KB was updated
        if (mainWin && !mainWin.webContents.isDestroyed()) {
          mainWin.webContents.send('kb:updated')
        }
      }

      // Always push note AI update to renderer — include tags so NoteCard can display colored indicators
      if (mainWin && !mainWin.webContents.isDestroyed()) {
        mainWin.webContents.send('note:aiUpdate', { noteId, aiState, aiAnnotation, organizedText, tags: tags ?? [] })
      }
    }
  })
}

export async function enqueueNote(noteId: string, rawText: string): Promise<void> {
  if (!workerPort) return

  // Load _context.md as AI working memory
  const contextMd = (await readKbFile('_context.md')) ?? ''

  // Keyword heuristic: load concept files whose slug appears in the note text (cap at 5)
  const allFiles = await listKbFiles()
  const lowerNote = rawText.toLowerCase()
  const relevant = allFiles
    .filter(f => !f.startsWith('_'))
    .filter(f => {
      const slug = f.replace(/\.md$/, '').replace(/-/g, ' ')
      return lowerNote.includes(slug)
    })
    .slice(0, 5)

  const snippets = await Promise.all(
    relevant.map(async f => {
      const content = await readKbFile(f)
      return `### ${f}\n${content ?? ''}`
    })
  )
  const conceptSnippets = snippets.join('\n\n')

  workerPort.postMessage({ type: 'task', noteId, rawText, contextMd, conceptSnippets })
}

export function reQueuePendingNotes(): void {
  const db = getDb()
  const pending = db.select().from(notes).where(eq(notes.aiState, 'pending')).all()
  for (const note of pending) {
    enqueueNote(note.id, note.rawText)
  }
}
