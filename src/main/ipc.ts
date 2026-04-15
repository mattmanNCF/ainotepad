import { ipcMain } from 'electron'
import { safeStorage } from 'electron'
import { randomUUID } from 'crypto'
import { desc } from 'drizzle-orm'
import { getDb } from './db'
import { notes } from '../../drizzle/schema'
import { enqueueNote, getWorkerPort } from './aiOrchestrator'
import { Conf } from 'electron-conf/main'
import { listKbFiles, readKbFile } from './kb'
import { getTagColors, setTagColors } from './tagColors'

// Initialize electron-conf at module scope — safe because Conf does NOT call safeStorage at init time.
// safeStorage is only called inside ipcMain.handle() callbacks and getDecryptedApiKey(),
// both of which run after app is ready.
const conf = new Conf<{ apiKeyEncrypted: string; provider: string }>({ name: 'settings' })

// Real implementation replacing the 02-02 stub.
// safeStorage is only called here — never at module load time.
// This function is called from ipcMain.handle() callbacks and from index.ts
// inside app.whenReady(), both of which are safe.
export function getDecryptedApiKey(): string | null {
  const encStr = conf.get('apiKeyEncrypted', '') as string
  if (!encStr) return null
  try {
    return safeStorage.decryptString(Buffer.from(encStr, 'base64'))
  } catch {
    // Decryption can fail after reinstall (Windows DPAPI key mismatch).
    // Treat as "no key set" — user will need to re-enter.
    return null
  }
}

// Read the stored provider preference (defaults to 'claude').
// Used by index.ts at startup to pass the correct provider to startAiWorker().
export function getProvider(): string {
  return conf.get('provider', 'claude') as string
}

export function registerIpcHandlers() {
  ipcMain.handle('notes:getAll', () => {
    const db = getDb()
    return db.select().from(notes).orderBy(desc(notes.submittedAt)).all()
  })

  ipcMain.handle('notes:create', async (_event, rawText: string) => {
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
      await enqueueNote(id, rawText)
    }
    // If no key: leave aiState='pending'; startup re-queue handles it once key is set
    return record
  })

  // safeStorage is safe here — ipcMain.handle() callbacks only fire after app is ready
  ipcMain.handle('settings:save', (_event, { key, provider }: { key: string; provider: string }) => {
    const encrypted = safeStorage.encryptString(key)
    conf.set('apiKeyEncrypted', encrypted.toString('base64'))
    conf.set('provider', provider)

    // Notify the already-running worker so it refreshes its in-memory apiKey and provider.
    // Without this, notes submitted in the same session after key entry would call callAI()
    // with the stale empty apiKey and fail with "No API key configured".
    const workerPort = getWorkerPort()
    if (workerPort) {
      workerPort.postMessage({ type: 'settings-update', provider, apiKey: key })
    }
  })

  ipcMain.handle('settings:get', () => {
    const provider = conf.get('provider', 'claude') as string
    const encStr = conf.get('apiKeyEncrypted', '') as string
    let hasKey = false
    if (encStr) {
      try {
        safeStorage.decryptString(Buffer.from(encStr, 'base64'))
        hasKey = true
      } catch {
        hasKey = false
      }
    }
    return { provider, hasKey }
  })

  ipcMain.handle('kb:listFiles', async () => listKbFiles())

  ipcMain.handle('kb:readFile', async (_e, filename: string) => readKbFile(filename))

  ipcMain.handle('kb:getTagColors', () => getTagColors())

  ipcMain.handle('kb:setTagColor', (_e, tag: string, color: string) => {
    const colors = getTagColors()
    colors[tag] = color
    setTagColors(colors)
  })
}
