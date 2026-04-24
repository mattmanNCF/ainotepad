import { drive_v3 } from '@googleapis/drive'
import { Conf } from 'electron-conf/main'
import { processFile } from './ingestService'

interface DriveConf {
  startPageToken: string
  lastPollAt: string      // ISO timestamp
  lastPollError: string   // empty string if last poll succeeded
  lastAuthError: string   // empty string if no 401 observed; set when 401 caught
}

const driveConf = new Conf<DriveConf>({ name: 'drive-settings' })

const POLL_INTERVAL_MS = 60_000

let _pollInterval: NodeJS.Timeout | null = null
let _inFlight = false

/**
 * One-time initialization on first Drive use. Asks Google for the current
 * startPageToken scoped to appDataFolder. Subsequent polls use the checkpointed
 * token. Safe to call multiple times — no-op if already initialized.
 */
export async function initStartPageToken(drive: drive_v3.Drive): Promise<void> {
  if (driveConf.get('startPageToken')) return
  // `spaces` is not in the TypeScript type for Params$Resource$Changes$Getstartpagetoken
  // but the REST API accepts it; cast to any to pass through to the HTTP call.
  const res = await drive.changes.getStartPageToken({ spaces: 'appDataFolder' } as any)
  if (!res.data.startPageToken) {
    throw new Error('Drive getStartPageToken returned no token')
  }
  driveConf.set('startPageToken', res.data.startPageToken)
}

/**
 * Execute one polling cycle. Returns the number of files ingested.
 * Catches 401 and records it in driveConf.lastAuthError (MOB-AUTH-02 surfacing).
 * Never throws — errors are recorded but do not crash the poll loop.
 */
export async function pollChanges(drive: drive_v3.Drive): Promise<number> {
  if (_inFlight) return 0  // skip overlapping poll if previous still running
  _inFlight = true
  try {
    const pageToken = driveConf.get('startPageToken')
    if (!pageToken) return 0

    let processedCount = 0
    let currentToken: string = pageToken

    // Loop through pages in case many changes occurred since last poll.
    while (true) {
      const res = await drive.changes.list({
        pageToken: currentToken,
        spaces: 'appDataFolder',
        includeRemoved: true,
        fields: 'changes(fileId,removed,file(id,name,mimeType,size)),newStartPageToken,nextPageToken',
      })

      for (const change of res.data.changes ?? []) {
        if (change.removed || !change.fileId) continue
        // Only ingest JSON envelopes — ignore anything else that may end up in appDataFolder
        if (!change.file?.name?.endsWith('.json')) continue
        const ingested = await processFile(drive, change.fileId)
        if (ingested) processedCount++
      }

      if (res.data.nextPageToken) {
        currentToken = res.data.nextPageToken
        continue
      }
      // End of page chain — persist newStartPageToken for the next poll cycle.
      if (res.data.newStartPageToken) {
        driveConf.set('startPageToken', res.data.newStartPageToken)
      }
      break
    }

    driveConf.set('lastPollAt', new Date().toISOString())
    driveConf.set('lastPollError', '')
    driveConf.set('lastAuthError', '')  // clear on success
    return processedCount
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    driveConf.set('lastPollAt', new Date().toISOString())
    driveConf.set('lastPollError', msg)
    // MOB-AUTH-02: detect 401 from google-auth-library refresh failure and surface it.
    const anyErr = err as { code?: number; response?: { status?: number } }
    const status = anyErr?.code ?? anyErr?.response?.status
    if (status === 401 || /invalid_grant|unauthorized/i.test(msg)) {
      driveConf.set('lastAuthError', msg)
    }
    console.error('[drive/changesPoller] poll failed:', msg)
    return 0
  } finally {
    _inFlight = false
  }
}

export function startPolling(drive: drive_v3.Drive): void {
  if (_pollInterval) return
  _pollInterval = setInterval(() => {
    pollChanges(drive).catch(err => console.error('[drive/changesPoller] unhandled:', err))
  }, POLL_INTERVAL_MS)
}

export function stopPolling(): void {
  if (_pollInterval) { clearInterval(_pollInterval); _pollInterval = null }
}

export function getPollStatus(): { lastPollAt: string; lastPollError: string; lastAuthError: string } {
  return {
    lastPollAt: driveConf.get('lastPollAt', '') as string,
    lastPollError: driveConf.get('lastPollError', '') as string,
    lastAuthError: driveConf.get('lastAuthError', '') as string,
  }
}

export function clearDriveState(): void {
  driveConf.delete('startPageToken')
  driveConf.delete('lastPollAt')
  driveConf.delete('lastPollError')
  driveConf.delete('lastAuthError')
}
