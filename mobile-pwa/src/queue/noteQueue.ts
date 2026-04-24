import { openDB, DBSchema, IDBPDatabase } from 'idb'

export type QueueStatus = 'local' | 'uploading' | 'on-drive' | 'ingested' | 'failed'

export interface QueuedNote {
  id: string
  text: string
  ts: string
  status: QueueStatus
  driveFileId?: string
  error?: string
}

interface NotalMobileDB extends DBSchema {
  queue: {
    key: string
    value: QueuedNote
  }
}

const DB_NAME = 'notal-mobile'
const DB_VERSION = 1

let _db: IDBPDatabase<NotalMobileDB> | null = null

async function getDb(): Promise<IDBPDatabase<NotalMobileDB>> {
  if (_db) return _db
  _db = await openDB<NotalMobileDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('queue')) {
        db.createObjectStore('queue', { keyPath: 'id' })
      }
    },
  })
  return _db
}

export async function enqueue(text: string): Promise<QueuedNote> {
  const db = await getDb()
  const note: QueuedNote = {
    id: crypto.randomUUID(),
    text,
    ts: new Date().toISOString(),
    status: 'local',
  }
  await db.put('queue', note)
  return note
}

export async function getAll(): Promise<QueuedNote[]> {
  const db = await getDb()
  const all = await db.getAll('queue')
  // Sort newest first
  return all.sort((a, b) => b.ts.localeCompare(a.ts))
}

export async function getPending(): Promise<QueuedNote[]> {
  const all = await getAll()
  return all.filter(n => n.status === 'local' || n.status === 'failed')
}

export async function updateStatus(
  id: string,
  status: QueueStatus,
  patch: Partial<Pick<QueuedNote, 'driveFileId' | 'error'>> = {}
): Promise<void> {
  const db = await getDb()
  const existing = await db.get('queue', id)
  if (!existing) return
  await db.put('queue', { ...existing, status, ...patch })
}

export async function remove(id: string): Promise<void> {
  const db = await getDb()
  await db.delete('queue', id)
}

/**
 * MOB-UX-01: Observe the desktop's successful ingest by polling Drive for the uploaded
 * file. The desktop (Plan 12-02) deletes the Drive file after importing. A 404 from
 * drive.files.get(fileId) indicates ingest occurred; transition the note to 'ingested'.
 *
 * Polling strategy:
 *   - GET https://www.googleapis.com/drive/v3/files/{fileId} with Bearer access token
 *   - Interval: 5000 ms
 *   - Max attempts: 12 (total ~60 s)
 *   - On HTTP 404 -> updateStatus(queueId, 'ingested') and stop
 *   - On any other error / timeout -> stop silently (leave at 'on-drive')
 *   - Non-blocking: callers should fire this WITHOUT await
 */
export async function pollForIngestion(
  accessToken: string,
  fileId: string,
  queueId: string,
  opts: { intervalMs?: number; maxAttempts?: number } = {}
): Promise<void> {
  const intervalMs = opts.intervalMs ?? 5000
  const maxAttempts = opts.maxAttempts ?? 12
  const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Wait before the first check too — ingest runs no more often than every ~15–30 s
    // on the desktop side, so an immediate check is guaranteed to be premature.
    await new Promise(res => setTimeout(res, intervalMs))
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (res.status === 404) {
        await updateStatus(queueId, 'ingested')
        return
      }
      // 200 -> file still present, keep polling
      // 401/403 -> token expired or revoked; stop silently
      if (res.status === 401 || res.status === 403) return
      // Other non-OK (5xx, 429) -> stop silently rather than hammer the API
      if (!res.ok && res.status !== 200) return
    } catch {
      // Network error — stop silently
      return
    }
  }
  // Timeout without seeing 404: leave at 'on-drive'.
}

export async function drainQueue(
  uploadFn: (text: string, token: string) => Promise<{ fileId: string }>,
  getToken: () => string | null
): Promise<{ uploaded: number; failed: number }> {
  const pending = await getPending()
  let uploaded = 0
  let failed = 0
  for (const note of pending) {
    const token = getToken()
    if (!token) { failed++; continue }  // cannot upload without token
    await updateStatus(note.id, 'uploading')
    try {
      const { fileId } = await uploadFn(note.text, token)
      await updateStatus(note.id, 'on-drive', { driveFileId: fileId })
      uploaded++
      // MOB-UX-01: fire-and-forget poll to observe desktop ingest (Drive file deletion).
      // Non-blocking: do NOT await — queue continues processing other items.
      // Swallow errors from the poll itself — its only job is to transition 'on-drive' -> 'ingested'
      // when conditions are right; any failure simply leaves the note at 'on-drive'.
      void pollForIngestion(token, fileId, note.id).catch(() => {})
    } catch (err) {
      await updateStatus(note.id, 'failed', { error: err instanceof Error ? err.message : String(err) })
      failed++
    }
  }
  return { uploaded, failed }
}
