import { useCallback, useEffect, useState } from 'react'

interface CalendarStatus {
  connected: boolean
  lastSuccess: string | null
  encryptionAvailable: boolean
  confirmBeforeCreate: boolean
}

function formatLastSuccess(iso: string | null): string {
  if (!iso) return 'never'
  try {
    const d = new Date(iso)
    const now = Date.now()
    const diffMs = now - d.getTime()
    if (diffMs < 60_000) return 'just now'
    if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`
    if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h ago`
    return d.toLocaleDateString()
  } catch { return 'unknown' }
}

/**
 * Health indicator (CAL-UX-02):
 *   green:  connected AND (last success < 24h OR first-time freshly connected)
 *   yellow: connected AND no last success for >24h (stale — no recent events)
 *   red:    not connected OR encryption unavailable
 */
function healthColor(status: CalendarStatus | null): 'green' | 'yellow' | 'red' {
  if (!status) return 'red'
  if (!status.encryptionAvailable) return 'red'
  if (!status.connected) return 'red'
  if (!status.lastSuccess) return 'green' // connected but no events yet — OK
  const age = Date.now() - new Date(status.lastSuccess).getTime()
  return age > 24 * 60 * 60 * 1000 ? 'yellow' : 'green'
}

export function GoogleCalendarSection() {
  const [status, setStatus] = useState<CalendarStatus | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string>('')

  const refresh = useCallback(async () => {
    try {
      const s = await window.api.calendar.getStatus()
      setStatus(s)
    } catch (err) {
      setError(String((err as Error)?.message ?? err))
    }
  }, [])

  useEffect(() => {
    refresh()
    // Refresh on any event lifecycle change — keeps lastSuccess fresh.
    const offSynced = window.api.calendar.onEventSynced(() => { void refresh() })
    const offFailed = window.api.calendar.onEventFailed(() => { void refresh() })
    return () => { offSynced(); offFailed() }
  }, [refresh])

  const handleConnect = useCallback(async () => {
    setConnecting(true)
    setError('')
    try {
      const res = await window.api.calendar.connect()
      if (!res.ok) setError(res.error ?? 'Connection failed')
      await refresh()
    } catch (err) {
      setError(String((err as Error)?.message ?? err))
    } finally {
      setConnecting(false)
    }
  }, [refresh])

  const handleDisconnect = useCallback(async () => {
    await window.api.calendar.disconnect()
    await refresh()
  }, [refresh])

  const handleToggleConfirm = useCallback(async (next: boolean) => {
    await window.api.calendar.setConfirmBeforeCreate(next)
    await refresh()
  }, [refresh])

  const color = healthColor(status)
  const dotClass =
    color === 'green'  ? 'bg-emerald-400' :
    color === 'yellow' ? 'bg-amber-400' :
                         'bg-red-400/70'

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-gray-500 uppercase tracking-wider">Google Calendar</p>
        <span className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${dotClass}`} aria-label={`health: ${color}`} />
          <span className="text-[10px] text-gray-500">
            {status?.connected ? `last sync ${formatLastSuccess(status.lastSuccess)}` : 'not connected'}
          </span>
        </span>
      </div>

      {status && !status.encryptionAvailable && (
        <p className="text-xs text-red-400/70 mb-2">
          Secure storage unavailable on this system — cannot connect (Linux: install gnome-keyring or kwallet).
        </p>
      )}

      {!status?.connected ? (
        <button
          onClick={handleConnect}
          disabled={connecting || !status?.encryptionAvailable}
          className="w-full py-2 rounded text-sm font-medium bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {connecting ? 'Opening browser\u2026' : 'Connect Google Calendar'}
        </button>
      ) : (
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-xs text-gray-400">
            <input
              type="checkbox"
              checked={status.confirmBeforeCreate}
              onChange={(e) => handleToggleConfirm(e.target.checked)}
              className="accent-blue-400"
            />
            <span>Ask before creating events (opt-in mode, 5s confirm window)</span>
          </label>
          <button
            onClick={handleDisconnect}
            className="w-full py-1.5 rounded text-xs font-medium bg-white/5 text-gray-400 hover:bg-white/10 hover:text-gray-200 transition-colors"
          >
            Disconnect &amp; revoke
          </button>
        </div>
      )}

      {error && <p className="text-xs text-red-400/80 mt-2">{error}</p>}
    </div>
  )
}
