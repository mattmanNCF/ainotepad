import { utilityProcess, MessageChannelMain, BrowserWindow } from 'electron'
import path from 'path'
import { randomUUID } from 'crypto'
import { updateNoteAiResult, getDb, getSqlite, setNoteWikiFiles } from './db'
import { notes, kbPages } from '../../drizzle/schema'
import { eq } from 'drizzle-orm'
import { writeKbFile, readKbFile, listKbFiles, kbDir } from './kb'
import { getTagColors, setTagColors } from './tagColors'
import { readHarnessContext } from './agentHarness'

let workerPort: Electron.MessagePortMain | null = null
let mainWin: BrowserWindow | null = null

// Accessor used by ipc.ts settings:save handler to send settings-update to the worker.
// Plan 02-04 imports this to notify the running worker when the user saves a new API key,
// so same-session note submissions pick up the new key without restarting.
export function getWorkerPort(): Electron.MessagePortMain | null {
  return workerPort
}

export function startAiWorker(win: BrowserWindow, provider: string, apiKey: string, ollamaModel: string, modelPath = ''): void {
  mainWin = win

  // Hand the main window handle to reminderService for IPC pushes (Plan 11-04).
  // Same guarded dynamic import pattern as the 'result' handler below — this
  // import can fail in builds that don't yet include reminderService, and we
  // tolerate that silently.
  import('./calendar/reminderService').then((mod) => {
    if (mod && typeof mod.setMainWindow === 'function') mod.setMainWindow(win)
  }).catch(() => { /* module absent — expected before Plan 11-04 ships */ })

  const child = utilityProcess.fork(path.join(__dirname, 'aiWorker.js'), [], { stdio: 'pipe' })
  child.stdout?.on('data', (d: Buffer) => console.log('[aiWorker stdout]', d.toString()))
  child.stderr?.on('data', (d: Buffer) => console.error('[aiWorker stderr]', d.toString()))
  const { port1, port2 } = new MessageChannelMain()

  // Transfer port2 to the worker in the init message
  child.postMessage({ type: 'init', provider, apiKey, ollamaModel, modelPath }, [port2])

  workerPort = port1
  port1.start() // REQUIRED: port is paused until start() is called

  port1.on('message', async (event) => {
    const { type, noteId, aiState, aiAnnotation, organizedText, wikiUpdates, tags, insights, reminder, errorMsg } = event.data

    if (type === 'digest-error') {
      const { period, error } = event.data
      console.error('[aiOrchestrator] digest-error from worker:', period, error)
      if (mainWin && !mainWin.webContents.isDestroyed()) {
        mainWin.webContents.send('digest:error', { period, error })
      }
      return
    }

    if (type === 'digest-result') {
      const { period, periodStart, wordCloudData, narrative, stats, generatedAt } = event.data
      const id = randomUUID()
      try {
        getSqlite().prepare(
          `INSERT INTO digests (id, period, period_start, word_cloud_data, narrative, stats, generated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run(id, period, periodStart, wordCloudData, narrative, stats, generatedAt)
        // Clean up stale rows for same period (keep only most recent; prevent growth from repeated Generate Now)
        const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
        getSqlite().prepare(
          `DELETE FROM digests WHERE period=? AND generated_at < ?`
        ).run(period, cutoff)
        if (mainWin && !mainWin.webContents.isDestroyed()) {
          mainWin.webContents.send('digest:updated', { period, periodStart, narrative, stats, wordCloudData })
        }
        console.log('[aiOrchestrator] digest stored and renderer notified, id:', id)
      } catch (err) {
        console.error('[aiOrchestrator] Failed to store digest:', err)
      }
      return
    }

    if (type === 'result') {
      if (aiState === 'failed') console.error('[aiOrchestrator] worker failed for note', noteId, '—', errorMsg)
      const tagsJson = JSON.stringify(tags ?? [])
      updateNoteAiResult(noteId, aiState as 'complete' | 'failed', aiAnnotation ?? null, organizedText ?? null, tagsJson, insights ?? null)

      // Hand off the reminder field to Plan 11-04's reminderService (if present).
      // Dynamic import keeps this plan compilable even before 11-04 lands.
      // The service is responsible for:
      //   - confidence >= 0.85 gate (CAL-COST-01)
      //   - isConnected() check from tokenStore
      //   - parseReminderDate conversion
      //   - 10s undo lifecycle + events.insert
      // If the module doesn't exist yet, we swallow the error — the note:aiUpdate push
      // above still carries the reminder field so the renderer knows something was detected.
      if (aiState === 'complete' && reminder) {
        try {
          // reminderService.ts is created in Plan 11-04. Use Function('p', 'return import(p)')
          // to prevent rollup/vite from statically resolving (and failing on) the module path
          // at build time. At runtime in the Electron main process, Node's dynamic import
          // will succeed once Plan 11-04 ships the module; until then, the catch swallows
          // the MODULE_NOT_FOUND error — the note:aiUpdate push above still carries the
          // reminder field so renderers (Plan 11-06) can display the chip.
          const reminderSvcPath = __dirname + '/calendar/reminderService.js'
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const mod = await (Function('p', 'return import(p)')(reminderSvcPath) as Promise<any>)
          if (mod && typeof mod.handleNoteReminder === 'function') {
            // Fire-and-forget — the undo lifecycle is handled inside the service.
            mod.handleNoteReminder(noteId, reminder).catch((err: unknown) => {
              console.error('[aiOrchestrator] reminderService.handleNoteReminder failed:', err)
            })
          }
        } catch {
          // Module not yet present (Plan 11-03 shipped alone, 11-04 not yet) — expected.
        }
      }

      // Write wiki files to kb/
      if (wikiUpdates && wikiUpdates.length > 0) {
        const db = getDb()
        const writtenFiles: string[] = []
        for (const update of wikiUpdates as Array<{ file: string; content: string }>) {
          if (!update?.file || !update?.content) {
            console.warn('[aiOrchestrator] skipping malformed wiki_update entry (missing file or content):', JSON.stringify(update))
            continue
          }
          try {
            await writeKbFile(update.file, update.content)
            writtenFiles.push(update.file)

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

        // Record which wiki files this note wrote — used for cleanup on delete
        if (writtenFiles.length > 0) setNoteWikiFiles(noteId, writtenFiles)

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
        mainWin.webContents.send('note:aiUpdate', { noteId, aiState, aiAnnotation, organizedText, tags: tags ?? [], insights: insights ?? null, reminder: reminder ?? null })
      }
    }
  })
}

/**
 * Query the FTS5 index for notes semantically related to the given raw text.
 * Extracts up to 10 words from rawText as query terms (OR-joined).
 * Returns a formatted string of snippets, or '' on any error.
 */
function queryRelatedNotes(rawText: string): string {
  try {
    const words = rawText
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2)
      .slice(0, 10)
    if (words.length === 0) return ''
    const ftsQuery = words.join(' OR ')
    const rows = getSqlite()
      .prepare(
        `SELECT note_id, snippet(notes_fts, 0, '', '', '...', 20) as snip
         FROM notes_fts
         WHERE notes_fts MATCH ?
         ORDER BY rank
         LIMIT 5`
      )
      .all(ftsQuery) as Array<{ note_id: string; snip: string }>
    return rows.map(r => r.snip).join('\n---\n')
  } catch {
    // FTS5 may not exist on first launch before migration — safe to return empty
    return ''
  }
}

export async function enqueueNote(noteId: string, rawText: string): Promise<void> {
  if (!workerPort) return

  // Load _context.md as AI working memory.
  // Fall back to the most recently written *context*.md if the model misfiled it.
  let contextMd = (await readKbFile('_context.md')) ?? ''
  const allFiles = await listKbFiles()
  if (!contextMd) {
    // Model sometimes files context under a different name — find the most recently written *context*.md
    const { stat } = await import('fs/promises')
    const path = await import('path')
    const contextCandidates = allFiles.filter(
      f => f !== '_context.md' && f.toLowerCase().includes('context') && f.endsWith('.md')
    )
    if (contextCandidates.length > 0) {
      const base = kbDir()
      const withMtime = await Promise.all(
        contextCandidates.map(async f => {
          try { const s = await stat(path.join(base, f)); return { f, mtime: s.mtimeMs } }
          catch { return { f, mtime: 0 } }
        })
      )
      const newest = withMtime.sort((a, b) => b.mtime - a.mtime)[0]
      contextMd = (await readKbFile(newest.f)) ?? ''
    }
  }

  // Build established-tag list for consistent tagging across notes
  const establishedTags = Object.keys(getTagColors()).filter(t => t !== 'Untagged')

  // Keyword heuristic: load concept files whose slug appears in the note text (cap at 5)
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

  // FTS5 retrieval: find related notes from the user's history to ground AI insights
  const relatedNotes = queryRelatedNotes(rawText)

  const harnessContext = await readHarnessContext()

  workerPort.postMessage({ type: 'task', noteId, rawText, contextMd, conceptSnippets, relatedNotes, harnessContext, establishedTags })
}

export function reQueuePendingNotes(): void {
  const db = getDb()
  const pending = db.select().from(notes).where(eq(notes.aiState, 'pending')).all()
  for (const note of pending) {
    enqueueNote(note.id, note.rawText)
  }
}
