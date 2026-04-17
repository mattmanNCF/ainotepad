import { ipcMain } from 'electron'
import { safeStorage } from 'electron'
import { randomUUID } from 'crypto'
import { desc, eq } from 'drizzle-orm'
import { getDb } from './db'
import { notes } from '../../drizzle/schema'
import { enqueueNote, getWorkerPort } from './aiOrchestrator'
import { deleteNote, hideNote, reprocessNote, insertNoteToFts, getSqlite } from './db'
import { Conf } from 'electron-conf/main'
import { listKbFiles, readKbFile } from './kb'
import { getTagColors, setTagColors } from './tagColors'
import { detectModelTier, findExistingModel, getModelStoragePath } from './localModel'

// Initialize electron-conf at module scope — safe because Conf does NOT call safeStorage at init time.
// safeStorage is only called inside ipcMain.handle() callbacks and getDecryptedApiKey(),
// both of which run after app is ready.
const conf = new Conf<{
  apiKeyEncrypted: string
  provider: string
  ollamaModel: string
  braveKeyEncrypted: string
  modelTier: string
  modelPath: string
}>({ name: 'settings' })

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

export function getOllamaModel(): string {
  return conf.get('ollamaModel', 'qwen2.5-coder:14b') as string
}

// Returns the decrypted Brave Search API key, or null if not configured.
// safeStorage is only called here inside app-ready context.
export function getBraveKey(): string | null {
  const encStr = conf.get('braveKeyEncrypted', '') as string
  if (!encStr) return null
  try {
    return safeStorage.decryptString(Buffer.from(encStr, 'base64'))
  } catch {
    return null
  }
}

export function registerIpcHandlers() {
  ipcMain.handle('notes:getAll', () => {
    const db = getDb()
    return db.select().from(notes).where(eq(notes.hidden, 0)).orderBy(desc(notes.submittedAt)).all()
  })

  ipcMain.handle('notes:delete', (_event, id: string) => deleteNote(id))

  ipcMain.handle('notes:hide', (_event, id: string) => hideNote(id))

  ipcMain.handle('notes:reprocess', async (_event, id: string) => {
    reprocessNote(id)
    // Re-queue for AI processing
    const db = getDb()
    const record = db.select().from(notes).where(eq(notes.id, id)).get()
    if (record) {
      const apiKey = getDecryptedApiKey()
      if (apiKey) {
        await enqueueNote(id, record.rawText)
      }
    }
  })

  ipcMain.handle('notes:create', async (_event, rawText: string) => {
    const db = getDb()
    const now = new Date().toISOString()
    const id = randomUUID()
    db.insert(notes).values({ id, rawText, submittedAt: now }).run()
    insertNoteToFts(id, rawText)
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
  ipcMain.handle('settings:save', (_event, { key, provider, ollamaModel, braveKey }: { key: string; provider: string; ollamaModel?: string; braveKey?: string }) => {
    if (key) {
      const encrypted = safeStorage.encryptString(key)
      conf.set('apiKeyEncrypted', encrypted.toString('base64'))
    }
    conf.set('provider', provider)
    if (ollamaModel) conf.set('ollamaModel', ollamaModel)

    if (braveKey) {
      const encryptedBrave = safeStorage.encryptString(braveKey)
      conf.set('braveKeyEncrypted', encryptedBrave.toString('base64'))
    }

    let resolvedModelPath = ''
    if (provider === 'local') {
      const tier = detectModelTier()
      conf.set('modelTier', tier)
      resolvedModelPath = findExistingModel(tier) ?? getModelStoragePath()
    }

    const resolvedKey = (provider === 'ollama' || provider === 'local') ? provider : (key || getDecryptedApiKey() || '')
    const resolvedModel = ollamaModel || getOllamaModel()
    const workerPort = getWorkerPort()
    if (workerPort) {
      workerPort.postMessage({ type: 'settings-update', provider, apiKey: resolvedKey, ollamaModel: resolvedModel, modelPath: resolvedModelPath })
    }
  })

  ipcMain.handle('settings:get', () => {
    const provider = conf.get('provider', 'claude') as string
    const ollamaModel = conf.get('ollamaModel', 'qwen2.5-coder:14b') as string
    const encStr = conf.get('apiKeyEncrypted', '') as string
    let hasKey = (provider === 'ollama' || provider === 'local') ? true : false
    if (encStr && provider !== 'ollama' && provider !== 'local') {
      try {
        safeStorage.decryptString(Buffer.from(encStr, 'base64'))
        hasKey = true
      } catch {
        hasKey = false
      }
    }

    const braveEncStr = conf.get('braveKeyEncrypted', '') as string
    let hasBraveKey = false
    if (braveEncStr) {
      try {
        safeStorage.decryptString(Buffer.from(braveEncStr, 'base64'))
        hasBraveKey = true
      } catch {
        hasBraveKey = false
      }
    }

    const modelTier = conf.get('modelTier', detectModelTier()) as string
    return { provider, hasKey, ollamaModel, hasBraveKey, modelTier }
  })

  ipcMain.handle('kb:listFiles', async () => listKbFiles())

  ipcMain.handle('kb:readFile', async (_e, filename: string) => readKbFile(filename))

  ipcMain.handle('kb:getTagColors', () => getTagColors())

  ipcMain.handle('kb:setTagColor', (_e, tag: string, color: string) => {
    const colors = getTagColors()
    colors[tag] = color
    setTagColors(colors)
  })

  ipcMain.handle('localModel:getStatus', () => {
    const tier = conf.get('modelTier', detectModelTier()) as string
    const modelPath = findExistingModel(tier as import('./localModel').ModelTier) ?? null
    return { tier, modelPath, ready: !!modelPath }
  })

  ipcMain.handle('digests:getLatest', (_e, period: string) => {
    const row = getSqlite().prepare(
      `SELECT * FROM digests WHERE period=? ORDER BY generated_at DESC LIMIT 1`
    ).get(period) as any
    return row ?? null
  })
}
