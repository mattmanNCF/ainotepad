import { ipcMain } from 'electron'
import { randomUUID } from 'crypto'
import { desc } from 'drizzle-orm'
import { getDb } from './db'
import { notes } from '../../drizzle/schema'

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
    }
    return record
  })
}
