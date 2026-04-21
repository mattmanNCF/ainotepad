import { safeStorage } from 'electron'
import { Conf } from 'electron-conf/main'

// Separate Conf instance — writes to userData/calendar-settings.json, not settings.json.
// Parallels graphParams.ts and tagColors.ts (STATE.md line 119).
const conf = new Conf<{
  calendarConnected: boolean
  refreshTokenEncrypted: string         // base64 of safeStorage.encryptString output
  calendarSyncLastSuccess: string | null
  confirmBeforeCreate: boolean
  dontAskDeleteCalEvent: boolean
}>({ name: 'calendar-settings' })

export function isEncryptionAvailable(): boolean {
  return safeStorage.isEncryptionAvailable()
}

export function storeRefreshToken(token: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('safeStorage unavailable — OS keyring not configured (Linux only; Windows + macOS always available post app.whenReady)')
  }
  const encrypted = safeStorage.encryptString(token)
  conf.set('refreshTokenEncrypted', encrypted.toString('base64'))
  conf.set('calendarConnected', true)
}

export function getRefreshToken(): string | null {
  const enc = conf.get('refreshTokenEncrypted', '') as string
  if (!enc) return null
  try {
    return safeStorage.decryptString(Buffer.from(enc, 'base64'))
  } catch {
    // DPAPI mismatch after reinstall — treat as unconnected (parallels ipc.ts line 44)
    return null
  }
}

export function clearTokens(): void {
  conf.delete('refreshTokenEncrypted')
  conf.set('calendarConnected', false)
  conf.set('calendarSyncLastSuccess', null)
}

export function isConnected(): boolean {
  return (conf.get('calendarConnected', false) as boolean) && !!getRefreshToken()
}

export function getLastSuccess(): string | null {
  return conf.get('calendarSyncLastSuccess', null) as string | null
}

export function markSyncSuccess(): void {
  conf.set('calendarSyncLastSuccess', new Date().toISOString())
}

export function getConfirmBeforeCreate(): boolean {
  return conf.get('confirmBeforeCreate', false) as boolean
}

export function setConfirmBeforeCreate(value: boolean): void {
  conf.set('confirmBeforeCreate', value)
}

export function getDontAskDeleteCalEvent(): boolean {
  return conf.get('dontAskDeleteCalEvent', false) as boolean
}

export function setDontAskDeleteCalEvent(value: boolean): void {
  conf.set('dontAskDeleteCalEvent', value)
}
