import { ipcMain } from 'electron'
import { safeStorage } from 'electron'
import { randomUUID } from 'crypto'
import { desc, eq } from 'drizzle-orm'
import { getDb } from './db'
import { notes } from '../../drizzle/schema'
import { enqueueNote, getWorkerPort } from './aiOrchestrator'
import { deleteNote, hideNote, reprocessNote, insertNoteToFts, getSqlite, countNotesReferencingWikiFile } from './db'
import { Conf } from 'electron-conf/main'
import { listKbFiles, readKbFile, deleteKbFile } from './kb'
import { getTagColors, setTagColors } from './tagColors'
import { detectModelTier, findExistingModel, downloadModel } from './localModel'
import { forceScheduleDigest } from './digestScheduler'
import { readHarnessFiles, writeHarnessFiles, updateUserProfile } from './agentHarness'

// Initialize electron-conf at module scope — safe because Conf does NOT call safeStorage at init time.
// safeStorage is only called inside ipcMain.handle() callbacks and getDecryptedApiKey(),
// both of which run after app is ready.
const conf = new Conf<{
  provider: string
  apiKeyEncrypted: string       // Claude key (backward compat)
  geminiKeyEncrypted: string
  openrouterKeyEncrypted: string
  groqKeyEncrypted: string
  hfKeyEncrypted: string
  ollamaModel: string
  llamaCppPath: string          // user-specified GGUF path for llama.cpp
  modelTier: string
  modelPath: string             // auto-downloaded GGUF path
  onboardingDone: boolean
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

// Read the stored provider preference (defaults to 'ollama').
// Used by index.ts at startup to pass the correct provider to startAiWorker().
export function getProvider(): string {
  return conf.get('provider', 'ollama') as string
}

export function getOllamaModel(): string {
  return conf.get('ollamaModel', 'gemma4:e4b') as string
}

// Returns the GGUF path for llama.cpp provider at startup.
// Checks user-specified path first, then auto-downloaded path, then filesystem scan.
export function getStartupModelPath(provider: string): string {
  if (provider !== 'llamacpp') return ''
  const explicit = conf.get('llamaCppPath', '') as string
  if (explicit) return explicit
  const tier = (conf.get('modelTier', detectModelTier())) as import('./localModel').ModelTier
  return (findExistingModel(tier) ?? (conf.get('modelPath', '') as string)) || ''
}

// Decrypt a named key slot from conf.
function decryptKey(slot: string): string | null {
  const encStr = conf.get(slot, '') as string
  if (!encStr) return null
  try {
    return safeStorage.decryptString(Buffer.from(encStr, 'base64'))
  } catch {
    return null
  }
}

// Providers that use OpenAI-compatible APIs with just a base URL + key
const OPENAI_COMPAT_PROVIDERS: Record<string, { baseURL: string; keySlot: string }> = {
  gemini: { baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai', keySlot: 'geminiKeyEncrypted' },
  openrouter: { baseURL: 'https://openrouter.ai/api/v1', keySlot: 'openrouterKeyEncrypted' },
  groq: { baseURL: 'https://api.groq.com/openai/v1', keySlot: 'groqKeyEncrypted' },
  huggingface: { baseURL: 'https://api-inference.huggingface.co/v1', keySlot: 'hfKeyEncrypted' },
}
export { OPENAI_COMPAT_PROVIDERS }

export function registerIpcHandlers() {
  ipcMain.handle('notes:getAll', () => {
    const db = getDb()
    return db.select().from(notes).where(eq(notes.hidden, 0)).orderBy(desc(notes.submittedAt)).all()
  })

  ipcMain.handle('notes:delete', async (_event, id: string) => {
    const sqlite = getSqlite()

    // Get note metadata before deleting (tags + submitted_at for fallback heuristic)
    const noteRow = sqlite
      .prepare('SELECT tags, submitted_at, wiki_files FROM notes WHERE id = ?')
      .get(id) as { tags: string; submitted_at: string; wiki_files: string } | undefined

    let wikiFiles: string[] = []
    if (noteRow) {
      try { wikiFiles = JSON.parse(noteRow.wiki_files) } catch { /* empty */ }

      // Fallback for historical notes with no wiki_files recorded:
      // find kbPages updated within ±90s of this note's submitted_at
      if (wikiFiles.length === 0 && noteRow.submitted_at) {
        const noteTime = new Date(noteRow.submitted_at).getTime()
        const kbRows = sqlite
          .prepare('SELECT id, filename FROM kb_pages')
          .all() as Array<{ id: string; filename: string }>
        // Also check actual file mtimes for each page
        const { kbDir } = await import('./kb')
        const fs = await import('fs/promises')
        for (const row of kbRows) {
          try {
            const stat = await fs.stat(require('path').join(kbDir(), row.filename))
            const fileMtime = stat.mtimeMs
            if (Math.abs(fileMtime - noteTime) < 90_000) {
              wikiFiles.push(row.filename)
            }
          } catch { /* file missing — skip */ }
        }
      }
    }

    // Delete the note (+ notes_fts)
    deleteNote(id)

    // Clean up orphaned wiki pages (no other note references them)
    if (wikiFiles.length > 0) {
      const orphaned: string[] = []
      for (const filename of wikiFiles) {
        if (countNotesReferencingWikiFile(filename, id) === 0) {
          orphaned.push(filename)
          sqlite.prepare('DELETE FROM kb_pages WHERE id = ?').run(filename.replace(/\.md$/, ''))
          await deleteKbFile(filename)
        }
      }
      if (orphaned.length > 0) {
        console.log('[notes:delete] removed orphaned wiki files:', orphaned)
      }
    }

    // Prune tag colors no longer used by any remaining complete note
    const remaining = sqlite
      .prepare("SELECT tags FROM notes WHERE hidden=0 AND ai_state='complete'")
      .all() as Array<{ tags: string }>
    const activeTags = new Set<string>()
    for (const r of remaining) {
      try { for (const t of JSON.parse(r.tags)) activeTags.add(t) } catch { /* skip */ }
    }
    const colors = getTagColors()
    let colorChanged = false
    for (const tag of Object.keys(colors)) {
      if (!activeTags.has(tag)) { delete colors[tag]; colorChanged = true }
    }
    if (colorChanged) setTagColors(colors)
  })

  ipcMain.handle('notes:hide', (_event, id: string) => hideNote(id))

  ipcMain.handle('notes:reprocess', async (_event, id: string) => {
    reprocessNote(id)
    // Re-queue for AI processing using same provider check as notes:create
    const db = getDb()
    const record = db.select().from(notes).where(eq(notes.id, id)).get()
    if (record) {
      const provider = getProvider()
      const apiKey = getDecryptedApiKey()
      if (provider === 'ollama' || provider === 'llamacpp' || apiKey ||
          (OPENAI_COMPAT_PROVIDERS[provider] && !!decryptKey(OPENAI_COMPAT_PROVIDERS[provider].keySlot))) {
        await enqueueNote(id, record.rawText)
      }
    }
  })

  ipcMain.handle('notes:allTags', () => {
    const rows = getSqlite().prepare(
      `SELECT tags FROM notes WHERE hidden=0 AND ai_state='complete' AND tags IS NOT NULL AND tags != '[]'`
    ).all() as Array<{ tags: string }>
    return rows.map(r => {
      try { return JSON.parse(r.tags) as string[] } catch { return [] }
    }).filter((t: string[]) => t.length > 1)
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
    // Enqueue for AI processing. Ollama and local providers don't need an API key.
    const provider = getProvider()
    const apiKey = getDecryptedApiKey()
    if (provider === 'ollama' || provider === 'llamacpp' || apiKey ||
        (OPENAI_COMPAT_PROVIDERS[provider] && !!decryptKey(OPENAI_COMPAT_PROVIDERS[provider].keySlot))) {
      await enqueueNote(id, rawText)
    }
    return record
  })

  // safeStorage is safe here — ipcMain.handle() callbacks only fire after app is ready
  ipcMain.handle('settings:save', (_event, {
    key, provider, ollamaModel, llamaCppPath
  }: { key: string; provider: string; ollamaModel?: string; llamaCppPath?: string }) => {
    conf.set('provider', provider)
    if (ollamaModel) conf.set('ollamaModel', ollamaModel)
    if (llamaCppPath !== undefined) conf.set('llamaCppPath', llamaCppPath)

    // Store API key in the correct provider slot
    if (key) {
      const encrypted = safeStorage.encryptString(key)
      if (provider === 'claude') conf.set('apiKeyEncrypted', encrypted.toString('base64'))
      else if (provider === 'openai') conf.set('apiKeyEncrypted', encrypted.toString('base64'))
      else if (OPENAI_COMPAT_PROVIDERS[provider]) {
        conf.set(OPENAI_COMPAT_PROVIDERS[provider].keySlot, encrypted.toString('base64'))
      }
    }

    // Resolve model path for llama.cpp
    let resolvedModelPath = ''
    if (provider === 'llamacpp') {
      resolvedModelPath = llamaCppPath || (conf.get('llamaCppPath', '') as string)
      if (!resolvedModelPath) {
        const tier = detectModelTier()
        conf.set('modelTier', tier)
        resolvedModelPath = (findExistingModel(tier) ?? (conf.get('modelPath', '') as string)) || ''
      }
    }

    // Resolve API key for worker
    let resolvedKey = ''
    if (provider === 'ollama') resolvedKey = 'ollama'
    else if (provider === 'llamacpp') resolvedKey = 'llamacpp'
    else if (OPENAI_COMPAT_PROVIDERS[provider]) {
      resolvedKey = key || decryptKey(OPENAI_COMPAT_PROVIDERS[provider].keySlot) || ''
    } else {
      resolvedKey = key || getDecryptedApiKey() || ''
    }

    const resolvedModel = ollamaModel || getOllamaModel()
    const workerPort = getWorkerPort()
    if (workerPort) {
      workerPort.postMessage({ type: 'settings-update', provider, apiKey: resolvedKey, ollamaModel: resolvedModel, modelPath: resolvedModelPath })
    }
  })

  ipcMain.handle('settings:get', () => {
    const provider = conf.get('provider', 'claude') as string
    const ollamaModel = conf.get('ollamaModel', 'qwen2.5-coder:14b') as string
    const llamaCppPath = conf.get('llamaCppPath', '') as string
    const modelTier = conf.get('modelTier', detectModelTier()) as string

    // Determine if a key is configured for the current provider
    let hasKey = provider === 'ollama' || provider === 'llamacpp'
    if (!hasKey) {
      const slot = OPENAI_COMPAT_PROVIDERS[provider]?.keySlot ?? 'apiKeyEncrypted'
      hasKey = !!decryptKey(slot)
    }

    // Report configured status for all providers
    const keyStatus: Record<string, boolean> = {
      claude: !!decryptKey('apiKeyEncrypted'),
      openai: !!decryptKey('apiKeyEncrypted'),
      gemini: !!decryptKey('geminiKeyEncrypted'),
      openrouter: !!decryptKey('openrouterKeyEncrypted'),
      groq: !!decryptKey('groqKeyEncrypted'),
      huggingface: !!decryptKey('hfKeyEncrypted'),
    }

    return { provider, hasKey, ollamaModel, modelTier, llamaCppPath, keyStatus }
  })

  ipcMain.handle('settings:list-ollama-models', async (): Promise<string[]> => {
    try {
      const res = await fetch('http://localhost:11434/api/tags')
      if (!res.ok) return []
      const data = await res.json() as { models?: Array<{ name: string }> }
      return (data.models ?? []).map(m => m.name)
    } catch {
      return []
    }
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
    const modelPath = (findExistingModel(tier as import('./localModel').ModelTier)
      ?? (conf.get('modelPath', '') as string)) || null
    return { tier, modelPath, ready: !!modelPath }
  })

  ipcMain.handle('localModel:download', async (event, tier?: string) => {
    const resolvedTier = (tier ?? conf.get('modelTier', detectModelTier())) as import('./localModel').ModelTier
    try {
      const modelPath = await downloadModel(resolvedTier, (percent) => {
        event.sender.send('localModel:progress', { percent })
      })
      // Persist the resolved tier and path so restarts find the file
      conf.set('modelTier', resolvedTier)
      conf.set('modelPath', modelPath)
      const workerPort = getWorkerPort()
      if (workerPort) {
        workerPort.postMessage({ type: 'settings-update', provider: 'local', apiKey: 'local', ollamaModel: getOllamaModel(), modelPath })
      }
      event.sender.send('localModel:progress', { percent: 100, done: true, modelPath })
      return { ok: true, modelPath }
    } catch (err) {
      event.sender.send('localModel:progress', { percent: 0, error: String((err as any)?.message ?? err) })
      return { ok: false, error: String((err as any)?.message ?? err) }
    }
  })

  // Returns recent notes that have AI insights, for display in the wiki tab
  ipcMain.handle('notes:recentInsights', () => {
    return getSqlite()
      .prepare(
        `SELECT id, tags, ai_insights as aiInsights, submitted_at as submittedAt
         FROM notes WHERE hidden=0 AND ai_insights IS NOT NULL
         ORDER BY submitted_at DESC LIMIT 50`
      )
      .all() as Array<{ id: string; tags: string; aiInsights: string; submittedAt: string }>
  })

  ipcMain.handle('digests:generate', (_e, period: 'daily' | 'weekly' = 'daily') => {
    forceScheduleDigest(period)
    return { queued: true }
  })

  ipcMain.handle('digests:getLatest', (_e, period: string) => {
    const row = getSqlite().prepare(
      `SELECT * FROM digests WHERE period=? ORDER BY generated_at DESC LIMIT 1`
    ).get(period) as any
    return row ?? null
  })

  ipcMain.handle('onboarding:getStatus', () => {
    return { done: conf.get('onboardingDone', false) as boolean }
  })

  ipcMain.handle('onboarding:complete', () => {
    conf.set('onboardingDone', true)
  })

  ipcMain.handle('agent:readHarness', async () => {
    return readHarnessFiles()
  })

  ipcMain.handle('agent:writeHarness', async (_e, files: Partial<{ agentMd: string; userMd: string; memoryMd: string }>) => {
    await writeHarnessFiles(files)
  })

  ipcMain.handle('agent:updateUserProfile', async (_e, observation: string) => {
    await updateUserProfile(observation)
  })

  ipcMain.handle('agent:runDailyImprovement', async () => {
    // Improvement runs asynchronously via the harness cron; return status
    return { status: 'queued' }
  })
}
