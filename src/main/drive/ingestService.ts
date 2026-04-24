import Ajv from 'ajv'
import { drive_v3 } from '@googleapis/drive'
import { createNote } from '../ipc'
import { ENVELOPE_JSON_SCHEMA, ENVELOPE_MAX_TEXT_BYTES } from '../../../shared/envelope'
import { buildDriveClient } from './driveClient'
import { initStartPageToken, pollChanges } from './changesPoller'

const WARN_BYTES = 10 * 1024 * 1024     // 10 MiB
const HARD_STOP_BYTES = 100 * 1024 * 1024 // 100 MiB

const ajv = new Ajv({ allErrors: false })
const validateEnvelope = ajv.compile(ENVELOPE_JSON_SCHEMA)

/**
 * Fetch + validate + ingest + delete. Returns true if a note was created.
 * MOB-SEC-01: single code path for mobile-drive notes — must pass through createNote(text, 'mobile-drive').
 * MOB-TRANS-03: delete Drive file on success.
 */
export async function processFile(drive: drive_v3.Drive, fileId: string): Promise<boolean> {
  try {
    const res = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'text' }
    )
    const raw = res.data as unknown as string
    if (typeof raw !== 'string' || raw.length > ENVELOPE_MAX_TEXT_BYTES) {
      console.error(`[drive/ingest] file ${fileId} too large or invalid, deleting`)
      await drive.files.delete({ fileId })
      return false
    }
    let envelope: unknown
    try { envelope = JSON.parse(raw) } catch {
      console.error(`[drive/ingest] file ${fileId} JSON parse failed, deleting`)
      await drive.files.delete({ fileId })
      return false
    }
    if (!validateEnvelope(envelope)) {
      console.error(`[drive/ingest] file ${fileId} schema failed: ${ajv.errorsText(validateEnvelope.errors)}`)
      await drive.files.delete({ fileId })
      return false
    }
    const { text } = envelope as { v: 1; text: string; ts: string }
    await createNote(text, 'mobile-drive')
    await drive.files.delete({ fileId })
    return true
  } catch (err) {
    console.error(`[drive/ingest] processFile ${fileId} error:`, err)
    return false
  }
}

/**
 * Walks all pages of files.list(spaces='appDataFolder') summing sizes.
 * Returns total bytes and the threshold state: 'ok' | 'warn' | 'hard-stop'.
 * MOB-QUOTA-01: warn at 10MB, hard-stop at 100MB.
 */
export async function checkQuota(drive: drive_v3.Drive): Promise<{
  sizeBytes: number
  fileCount: number
  state: 'ok' | 'warn' | 'hard-stop'
}> {
  let total = 0
  let count = 0
  let pageToken: string | undefined = undefined
  do {
    const res: { data: drive_v3.Schema$FileList } = await drive.files.list({
      spaces: 'appDataFolder',
      fields: 'files(id,size),nextPageToken',
      pageSize: 1000,
      pageToken,
    })
    for (const f of res.data.files ?? []) {
      total += Number(f.size ?? 0)
      count++
    }
    pageToken = res.data.nextPageToken ?? undefined
    if (total > HARD_STOP_BYTES) break
  } while (pageToken)

  let state: 'ok' | 'warn' | 'hard-stop' = 'ok'
  if (total > HARD_STOP_BYTES) state = 'hard-stop'
  else if (total > WARN_BYTES) state = 'warn'
  return { sizeBytes: total, fileCount: count, state }
}

/**
 * Called from app.whenReady(). Runs one poll cycle immediately so the user sees
 * any pending mobile notes drained before seeing a fresh app state.
 * Returns the number of notes ingested — used by renderer to show the wake banner.
 * MOB-UX-02: desktop-wake grace banner. Safe to call before connect — returns 0 if no refresh token.
 */
export async function drainOnLaunch(): Promise<number> {
  try {
    const drive = buildDriveClient()
    await initStartPageToken(drive)
    const count = await pollChanges(drive)
    return count
  } catch (err) {
    // Not connected yet or 401 — ok, renderer shows nothing.
    console.log('[drive/ingest] drainOnLaunch skipped:', err instanceof Error ? err.message : String(err))
    return 0
  }
}
