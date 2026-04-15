import { ipcMain } from 'electron'
import { randomUUID } from 'crypto'
import { desc } from 'drizzle-orm'
import { getDb } from './db'
import { notes } from '../../drizzle/schema'
import { enqueueNote } from './aiOrchestrator'

// getDecryptedApiKey is defined in plan 02-04 (settings module).
// Use a stub here that always returns null — notes will stay 'pending'
// until the user configures their API key via Settings.
function getDecryptedApiKey(): string | null {
  // Replaced in plan 02-04 with: return settingsModule.getDecryptedApiKey()
  return null
}

export function registerIpcHandlers() {
  ipcMain.handle('notes:getAll', () => {
    const db = getDb()
    return db.select().from(notes).orderBy(desc(notes.submittedAt)).all()
  })

  ipcMain.handle('notes:create', (_event, rawText: string) => {
    const db = getDb()
    const now = new Date().toISOString()
    const id = randomUUID()
    db.insert(notes).values({ id, rawText, submittedAt: now }).run()
    const record = {
      id,
      rawText,
      submittedAt: now,
      aiState: 'pending' as const,
      aiAnnotation: null,
      organizedText: null,
    }
    // Enqueue for AI if key is configured
    const apiKey = getDecryptedApiKey()
    if (apiKey) {
      enqueueNote(id, rawText)
    }
    // If no key: leave aiState='pending'; startup re-queue handles it once key is set
    return record
  })
}
