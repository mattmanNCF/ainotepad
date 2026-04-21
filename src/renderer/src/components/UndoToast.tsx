import { useCallback, useEffect, useRef, useState } from 'react'

interface PendingEvent {
  noteId: string
  reminderId: string
  eventTitle: string
  timestampUtc: string
  originalTz: string
  mode: 'auto' | 'confirm'
  undoDeadlineMs: number
}

/**
 * Bottom-right toast driven by calendar:eventPending / Synced / Cancelled / Failed pushes.
 *
 * AUTO mode (10s window):
 *   - Shows title + formatted time + [Undo] button + shrinking progress bar
 *   - On undo click: window.api.calendar.undoCreate(reminderId)
 *   - On synced push: replaces with brief confirmation (1.2s, then hides)
 *   - On cancelled push: hides immediately
 *   - On failed push: shows error for 4s
 *
 * CONFIRM mode (5s window):
 *   - Shows title + formatted time + [Create] + [Dismiss] buttons
 *   - On create click: window.api.calendar.confirmCreate(reminderId)
 *   - On timeout: toast auto-hides (main process marks cancelled)
 *
 * Single-toast policy: if a new pending arrives while one is active,
 * the active toast is replaced (main-process timer is still independent).
 */
export function UndoToast() {
  const [pending, setPending] = useState<PendingEvent | null>(null)
  const [status, setStatus] = useState<'pending' | 'synced' | 'cancelled' | 'failed' | null>(null)
  const [nowMs, setNowMs] = useState(Date.now())
  const [flashMsg, setFlashMsg] = useState<string>('')
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const offPending = window.api.calendar.onEventPending((data) => {
      setPending(data)
      setStatus('pending')
      setFlashMsg('')
      if (hideTimer.current) clearTimeout(hideTimer.current)
    })
    const offSynced = window.api.calendar.onEventSynced((data) => {
      // Quick confirmation then hide
      setStatus('synced')
      setFlashMsg(`Calendar: ${data.eventTitle}`)
      if (hideTimer.current) clearTimeout(hideTimer.current)
      hideTimer.current = setTimeout(() => { setPending(null); setStatus(null) }, 1200)
    })
    const offCancelled = window.api.calendar.onEventCancelled((data) => {
      setPending((prev) => prev && prev.reminderId === data.reminderId ? null : prev)
      setStatus(null)
    })
    const offFailed = window.api.calendar.onEventFailed((data) => {
      setStatus('failed')
      setFlashMsg(`Calendar failed: ${data.error}`)
      if (hideTimer.current) clearTimeout(hideTimer.current)
      hideTimer.current = setTimeout(() => { setPending(null); setStatus(null) }, 4000)
    })
    return () => { offPending(); offSynced(); offCancelled(); offFailed() }
  }, [])

  // Drive the shrinking progress bar
  useEffect(() => {
    if (status !== 'pending' || !pending) return
    const id = setInterval(() => setNowMs(Date.now()), 100)
    return () => clearInterval(id)
  }, [status, pending])

  const handleUndo = useCallback(async () => {
    if (!pending) return
    await window.api.calendar.undoCreate(pending.reminderId)
  }, [pending])

  const handleConfirm = useCallback(async () => {
    if (!pending) return
    await window.api.calendar.confirmCreate(pending.reminderId)
  }, [pending])

  if (!pending) return null

  const totalMs = pending.mode === 'auto' ? 10_000 : 5_000
  const remainingMs = Math.max(0, pending.undoDeadlineMs - nowMs)
  const pctRemaining = (remainingMs / totalMs) * 100

  const timeLabel = (() => {
    try { return new Date(pending.timestampUtc).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) }
    catch { return pending.timestampUtc }
  })()

  const borderClass =
    status === 'failed' ? 'border-red-500/40' :
    status === 'synced' ? 'border-emerald-500/40' :
                          'border-blue-500/40'

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-4 right-4 z-[9997] bg-[#1a1a14] border ${borderClass} rounded-md shadow-xl px-4 py-3 w-80`}
    >
      {status === 'pending' && (
        <>
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className="min-w-0">
              <p className="text-xs text-gray-500 uppercase tracking-wider">
                {pending.mode === 'auto' ? 'Calendar event (undo)' : 'Create calendar event?'}
              </p>
              <p className="text-sm text-gray-200 truncate" title={pending.eventTitle}>{pending.eventTitle}</p>
              <p className="text-xs text-gray-500">{timeLabel}</p>
            </div>
            {pending.mode === 'auto' ? (
              <button
                onClick={handleUndo}
                className="shrink-0 text-xs px-2 py-1 bg-white/10 hover:bg-white/15 rounded text-gray-200 transition-colors"
              >
                Undo
              </button>
            ) : (
              <div className="shrink-0 flex gap-1">
                <button
                  onClick={handleConfirm}
                  className="text-xs px-2 py-1 bg-blue-500/20 hover:bg-blue-500/30 rounded text-blue-300 transition-colors"
                >
                  Create
                </button>
                <button
                  onClick={handleUndo}
                  className="text-xs px-2 py-1 bg-white/5 hover:bg-white/10 rounded text-gray-400 transition-colors"
                >
                  Dismiss
                </button>
              </div>
            )}
          </div>
          <div className="w-full h-0.5 bg-white/5 rounded-full overflow-hidden">
            <div
              className={`h-full ${pending.mode === 'auto' ? 'bg-blue-400/60' : 'bg-amber-400/70'} transition-all ease-linear`}
              style={{ width: `${pctRemaining}%`, transitionDuration: '100ms' }}
            />
          </div>
        </>
      )}
      {status !== 'pending' && flashMsg && (
        <p className={`text-sm ${status === 'failed' ? 'text-red-300' : 'text-emerald-300'}`}>
          {flashMsg}
        </p>
      )}
    </div>
  )
}
